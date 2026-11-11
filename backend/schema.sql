-- =====================================================================
-- Pastillero inteligente IoT - Base de datos en Supabase (PostgreSQL)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------
-- Los responsables son los usuarios de Supabase Auth (auth.users).

create table if not exists public.pacientes (
  id             bigint generated always as identity primary key,
  responsable_id uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  nombre         text not null,
  photon_id      text not null unique,          -- Device ID del Photon (24 caracteres)
  creado         timestamptz not null default now()
);

create table if not exists public.compartimentos (
  id           bigint generated always as identity primary key,
  paciente_id  bigint not null references public.pacientes(id) on delete cascade,
  numero       smallint not null check (numero between 1 and 7),
  medicamento  text,
  dosis        text,
  hora_inicio  time,                                   -- primera toma del dia, ej. 08:00
  cada_horas   smallint check (cada_horas in (4, 6, 8, 12, 24)),   -- null si es horario personalizado
  horas_personalizadas text,                           -- ej. '08:00,14:00,21:30'
  activo       boolean not null default false,
  unique (paciente_id, numero)
);

create table if not exists public.tomas (
  id           bigint generated always as identity primary key,
  paciente_id  bigint not null references public.pacientes(id) on delete cascade,
  numero       smallint not null check (numero between 1 and 7),
  estado       text not null check (estado in ('tomada', 'omitida')),
  fecha_hora   timestamptz not null default now()
);

create index if not exists tomas_paciente_fecha_idx
  on public.tomas (paciente_id, fecha_hora desc);

-- ---------------------------------------------------------------
-- 2. Al registrar un paciente se crean sus 7 compartimentos vacios
-- ---------------------------------------------------------------
create or replace function public.crear_compartimentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.compartimentos (paciente_id, numero)
  select new.id, g from generate_series(1, 7) as g;
  return new;
end;
$$;

drop trigger if exists al_crear_paciente on public.pacientes;
create trigger al_crear_paciente
  after insert on public.pacientes
  for each row execute function public.crear_compartimentos();

-- ---------------------------------------------------------------
-- 2b. Solo si antes usaron la version SIN inicio de sesion:
--     agrega la columna del responsable y borra los pacientes de prueba
--     que no tienen dueno (no afecta si la base de datos es nueva).
-- ---------------------------------------------------------------
alter table public.pacientes
  add column if not exists responsable_id uuid default auth.uid()
  references auth.users(id) on delete cascade;
delete from public.pacientes where responsable_id is null;
alter table public.pacientes alter column responsable_id set not null;
alter table public.pacientes alter column responsable_id set default auth.uid();

drop policy if exists "acceso libre pacientes"      on public.pacientes;
drop policy if exists "acceso libre compartimentos" on public.compartimentos;
drop policy if exists "acceso libre tomas"          on public.tomas;

-- ---------------------------------------------------------------
-- 2c. Cambios nuevos (se pueden ejecutar aunque la base ya exista)
-- ---------------------------------------------------------------
-- Horario personalizado en cada compartimento
alter table public.compartimentos add column if not exists horas_personalizadas text;

-- Contador de pastillas: cuantas quedan en cada compartimento (vacio = no se cuentan)
alter table public.compartimentos add column if not exists pastillas_restantes integer
  check (pastillas_restantes >= 0);

-- Hora en que si se tomo una pastilla que salio "no tomada" (se registra a mano en la web)
alter table public.tomas add column if not exists hora_manual timestamptz;

-- Perfil del encargado: nombre y foto (los dos opcionales)
create table if not exists public.responsables (
  id      uuid primary key default auth.uid()
          references auth.users(id) on delete cascade,
  nombre  text,
  foto    text,                                   -- imagen pequena en texto (data URL)
  actualizado timestamptz not null default now()
);
alter table public.responsables enable row level security;

drop policy if exists "responsable gestiona su perfil" on public.responsables;
create policy "responsable gestiona su perfil" on public.responsables
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------
-- 3. Seguridad (RLS): cada responsable solo ve a su paciente
-- ---------------------------------------------------------------
alter table public.pacientes      enable row level security;
alter table public.compartimentos enable row level security;
alter table public.tomas          enable row level security;

drop policy if exists "responsable gestiona su paciente" on public.pacientes;
create policy "responsable gestiona su paciente" on public.pacientes
  for all to authenticated
  using (responsable_id = auth.uid())
  with check (responsable_id = auth.uid());

drop policy if exists "responsable gestiona sus compartimentos" on public.compartimentos;
create policy "responsable gestiona sus compartimentos" on public.compartimentos
  for all to authenticated
  using (exists (select 1 from public.pacientes p
                 where p.id = paciente_id and p.responsable_id = auth.uid()))
  with check (exists (select 1 from public.pacientes p
                      where p.id = paciente_id and p.responsable_id = auth.uid()));

drop policy if exists "responsable ve sus tomas" on public.tomas;
create policy "responsable ve sus tomas" on public.tomas
  for select to authenticated
  using (exists (select 1 from public.pacientes p
                 where p.id = paciente_id and p.responsable_id = auth.uid()));

-- ---------------------------------------------------------------
-- 4. Funcion que llama el webhook de Particle para guardar una toma
--    POST /rest/v1/rpc/registrar_toma
--    {"p_photon_id":"...", "p_numero":"3", "p_estado":"tomada"}
-- ---------------------------------------------------------------
create or replace function public.registrar_toma(
  p_photon_id text,
  p_numero    text,
  p_estado    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paciente bigint;
begin
  select id into v_paciente
  from public.pacientes
  where photon_id = lower(trim(p_photon_id));

  if v_paciente is null then
    raise exception 'Photon % no esta registrado', p_photon_id;
  end if;

  insert into public.tomas (paciente_id, numero, estado)
  values (v_paciente, p_numero::smallint, p_estado);

  -- Si se tomo, se descuenta una pastilla de ese compartimento (nunca baja de 0)
  if p_estado = 'tomada' then
    update public.compartimentos
       set pastillas_restantes = greatest(pastillas_restantes - 1, 0)
     where paciente_id = v_paciente
       and numero = p_numero::smallint
       and pastillas_restantes is not null;
  end if;
end;
$$;

revoke all on function public.registrar_toma(text, text, text) from public;
grant execute on function public.registrar_toma(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 5. Registrar a mano una pastilla que salio "no tomada"
-- ---------------------------------------------------------------
-- La web la llama cuando el encargado escribe la hora en que se tomo.
--    Solo funciona con tomas "omitida" del propio encargado, y una sola vez.
--    Tambien descuenta una pastilla del compartimento.
create or replace function public.registrar_toma_manual(
  p_toma_id bigint,
  p_hora    timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select t.id, t.paciente_id, t.numero, t.estado, t.hora_manual, t.fecha_hora
    into v
    from public.tomas t
    join public.pacientes p on p.id = t.paciente_id
   where t.id = p_toma_id
     and p.responsable_id = auth.uid();

  if v.id is null then
    raise exception 'No se encontro esa toma';
  end if;
  if v.estado <> 'omitida' then
    raise exception 'Esa pastilla ya estaba marcada como tomada';
  end if;
  if v.hora_manual is not null then
    raise exception 'Esa pastilla ya se registro a mano';
  end if;
  if p_hora > now() + interval '2 minutes' then
    raise exception 'La hora no puede ser despues de ahora';
  end if;
  if p_hora < v.fecha_hora - interval '75 minutes' then
    raise exception 'La hora es antes de que le tocara la pastilla';
  end if;

  update public.tomas set hora_manual = p_hora where id = p_toma_id;

  update public.compartimentos
     set pastillas_restantes = greatest(pastillas_restantes - 1, 0)
   where paciente_id = v.paciente_id
     and numero = v.numero
     and pastillas_restantes is not null;
end;
$$;

revoke all on function public.registrar_toma_manual(bigint, timestamptz) from public;
grant execute on function public.registrar_toma_manual(bigint, timestamptz) to authenticated;

-- Que Supabase vea los cambios de inmediato
notify pgrst, 'reload schema';

