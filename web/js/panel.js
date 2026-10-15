// Pantalla 2 - Panel principal

let paciente = null;
let proximaFecha = null;   // para la cuenta regresiva
let sesion = null;
let responsable = { nombre: null, foto: null };

document.getElementById('btn-salir').addEventListener('click', cerrarSesion);

// ---------- Perfil del encargado ----------
function inicialDe(texto) {
  return (texto || '?').trim().charAt(0).toUpperCase();
}

function pintarEncargado() {
  const nombre = responsable.nombre || sesion.user.email;
  document.getElementById('nombre-encargado').textContent = nombre;
  pintarAvatar(document.getElementById('avatar'), responsable.foto, inicialDe(nombre));
}

const dlgPerfil = document.getElementById('dlg-perfil');
const msgPerfil = document.getElementById('msg-perfil');
let fotoEditada = null;   // foto mientras se edita (null = sin foto)

function pintarFotoEditada() {
  const nombre = document.getElementById('nombre-editar').value || sesion.user.email;
  pintarAvatar(document.getElementById('avatar-editar'), fotoEditada, inicialDe(nombre));
  document.getElementById('btn-quitar-foto').hidden = !fotoEditada;
}

document.getElementById('btn-perfil').addEventListener('click', () => {
  fotoEditada = responsable.foto;
  document.getElementById('nombre-editar').value = responsable.nombre || '';
  document.getElementById('correo-editar').textContent = sesion.user.email;
  mostrarMensaje(msgPerfil, '');
  pintarFotoEditada();
  dlgPerfil.showModal();
});

document.getElementById('nombre-editar').addEventListener('input', pintarFotoEditada);

document.getElementById('foto-editar').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    fotoEditada = await reducirFoto(archivo);
    pintarFotoEditada();
  } catch (err) {
    mostrarMensaje(msgPerfil, err.message, 'error');
  }
  e.target.value = '';
});

document.getElementById('btn-quitar-foto').addEventListener('click', () => {
  fotoEditada = null;
  pintarFotoEditada();
});

// Cancelar: cierra sin guardar nada
document.getElementById('btn-cancelar-perfil').addEventListener('click', () => dlgPerfil.close());

document.getElementById('form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-perfil');
  const nombre = document.getElementById('nombre-editar').value.trim();
  btn.disabled = true;
  mostrarMensaje(msgPerfil, 'Guardando...');
  try {
    await guardarResponsable(sesion, nombre, fotoEditada);
    responsable = { nombre: nombre || null, foto: fotoEditada };
    pintarEncargado();
    dlgPerfil.close();
  } catch (err) {
    mostrarMensaje(msgPerfil, 'No se pudo guardar: ' + err.message, 'error');
  }
  btn.disabled = false;
});

// ---------- Registro del pastillero (primera vez) ----------
document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msg-registro');
  const nombre = document.getElementById('nombre').value.trim();
  const photonId = document.getElementById('photon').value.trim().toLowerCase();

  mostrarMensaje(msg, 'Guardando...');
  const { error } = await db.from('pacientes').insert({ nombre, photon_id: photonId });
  if (error) {
    const texto = error.code === '23505' ? 'Ese Photon ya está registrado por otra cuenta.' : error.message;
    mostrarMensaje(msg, texto, 'error');
    return;
  }
  location.reload();
});

// ---------- Estado de cada compartimento ----------
// Regresa { texto, color } para mostrar a la derecha de la fila
function estadoCompartimento(comp, ultimaToma, ahora) {
  if (!comp.activo) {
    return comp.medicamento ? { texto: 'Desactivado', color: 'gris' } : null;
  }
  const siguiente = siguienteTomaDe(comp, ahora);
  if (!siguiente) return null;
  const anterior = tomaAnteriorDe(comp, siguiente) || new Date(0);
  const tomaFecha = ultimaToma ? new Date(ultimaToma.fecha_hora) : null;
  const margen = 5 * 60000;   // tolerancia por diferencias de reloj

  // 1. Ya hay una toma registrada para la hora actual
  if (tomaFecha && tomaFecha.getTime() >= siguiente.getTime() - margen) {
    return mostrarToma(ultimaToma, tomaFecha);
  }
  // 2. El LED esta avisando en este momento
  if (ahora >= siguiente) {
    return { texto: 'Avisando ' + horaDe(siguiente), color: 'amarillo' };
  }
  // 3. Falta para la siguiente: muestra la anterior si existe
  if (tomaFecha && tomaFecha.getTime() >= anterior.getTime() - margen) {
    return mostrarToma(ultimaToma, tomaFecha);
  }
  return { texto: 'Pendiente ' + horaDe(siguiente), color: 'amarillo' };
}

function mostrarToma(toma, fecha) {
  return toma.estado === 'tomada'
    ? { texto: 'Tomada ' + horaDe(fecha), color: 'verde' }
    : { texto: 'Omitida ' + horaDe(fecha), color: 'rojo' };
}

// ---------- Dibujar ----------
async function cargarPanel() {
  const compartimentos = await obtenerCompartimentos(paciente.id);

  // ultimas tomas de las ultimas 48 h, la mas reciente de cada compartimento
  const desde = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data: tomas, error } = await db
    .from('tomas')
    .select('numero, estado, fecha_hora')
    .eq('paciente_id', paciente.id)
    .gte('fecha_hora', desde)
    .order('fecha_hora', { ascending: false });
  if (error) throw error;

  const ultima = {};
  for (const t of tomas) if (!ultima[t.numero]) ultima[t.numero] = t;

  const ahora = new Date();
  const lista = document.getElementById('lista');
  lista.replaceChildren();
  let proxima = null;

  for (const c of compartimentos) {
    const estado = estadoCompartimento(c, ultima[c.numero], ahora);

    if (c.activo) {
      let t = siguienteTomaDe(c, ahora);
      // si esa toma ya se registro (tomada u omitida), la proxima es la siguiente
      const u = ultima[c.numero];
      if (t && u && new Date(u.fecha_hora).getTime() >= t.getTime() - 5 * 60000) {
        t = siguienteTomaDe(c, new Date(t.getTime() + (VENTANA_MIN + 1) * 60000));
      }
      if (t && (!proxima || t < proxima.fecha)) proxima = { fecha: t, comp: c };
    }

    const nombre = c.medicamento
      ? el('div', { className: 'nombre' }, c.medicamento)
      : el('div', { className: 'nombre vacio' }, 'Sin asignar');
    const detalle = c.activo
      ? textoHorario(c)
      : (c.medicamento ? c.dosis || '' : 'toca para configurar');

    lista.append(el('li', {},
      el('a', { href: `configurar.html?n=${c.numero}` },
        el('span', { className: 'numero' }, c.numero),
        el('div', { className: 'info' }, nombre, el('div', { className: 'detalle' }, detalle)),
        estado && el('span', { className: 'estado' },
          el('span', { className: 'punto ' + estado.color }), estado.texto)
      )
    ));
  }

  lista.classList.add('ya-cargo');   // la animacion de entrada solo la primera vez
  proximaFecha = proxima ? proxima.fecha : null;
  actualizarCuenta();

  if (proxima) {
    const enCurso = proxima.fecha <= ahora ? ' (ahora)' : '';
    document.getElementById('proxima-titulo').textContent = `Próxima toma · ${horaDe(proxima.fecha)}${enCurso}`;
    document.getElementById('proxima-detalle').textContent =
      `Compartimento ${proxima.comp.numero} · ${proxima.comp.medicamento}`;
  }
}

// ---------- Cuenta regresiva y saludo (se actualizan solos) ----------
function actualizarCuenta() {
  const nodo = document.getElementById('proxima-cuenta');
  if (!proximaFecha) { nodo.textContent = ''; return; }
  const faltan = Math.floor((proximaFecha - Date.now()) / 1000);
  if (faltan <= 0) {
    nodo.textContent = 'Es hora de tomarla';
    return;
  }
  const h = Math.floor(faltan / 3600);
  const m = Math.floor((faltan % 3600) / 60);
  const s = faltan % 60;
  const dos = (n) => String(n).padStart(2, '0');
  nodo.replaceChildren(
    (h > 0 ? h + ':' : '') + dos(m) + ':' + dos(s), ' ',
    el('small', {}, 'para la siguiente toma')
  );
}

function ponerSaludo() {
  const hora = new Date().getHours();
  const texto = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('saludo').textContent = texto;
}

async function revisarConexion() {
  const enLinea = await photonEnLinea(paciente.photon_id);
  document.getElementById('linea-punto').className = 'punto ' + (enLinea ? 'verde' : 'rojo');
  document.getElementById('linea-texto').textContent = enLinea ? 'En línea' : 'Sin conexión';
}

// ---------- Inicio ----------
(async () => {
  sesion = await requerirSesion();
  try {
    responsable = await obtenerResponsable(sesion);
  } catch (err) {
    // Si falta la tabla "responsables", el panel sigue funcionando con el correo
    console.warn('Perfil del encargado:', err.message);
    responsable = { nombre: sesion.user.user_metadata?.nombre || null, foto: null };
  }
  pintarEncargado();
  paciente = await obtenerPaciente();

  if (!paciente) {
    document.getElementById('registro').classList.remove('oculto');
    return;
  }

  document.getElementById('panel').classList.remove('oculto');
  ponerSaludo();
  document.getElementById('paciente-nombre').textContent = paciente.nombre;

  await cargarPanel();
  revisarConexion();

  // se actualiza solo cada minuto
  setInterval(() => { cargarPanel(); revisarConexion(); }, 60000);
  // la cuenta regresiva avanza cada segundo
  setInterval(actualizarCuenta, 1000);
})().catch((err) => {
  if (err.message === 'Sin sesion') return;
  console.error(err);
  let texto = 'Error al cargar el panel: ' + err.message;
  if (err.message.includes('Failed to fetch')) {
    texto = 'No se pudo conectar con Supabase. Revisa SUPABASE_URL en web/js/config.js.';
  } else if (err.message.includes('responsable_id') || err.message.includes('row-level security')) {
    texto = 'Vuelve a ejecutar completo backend/schema.sql en Supabase.';
  }
  mostrarMensaje(document.getElementById('error-carga'), texto, 'error');
});
