// =========================================================
// Funciones compartidas por todas las paginas
// =========================================================

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const PARTICLE_API = 'https://api.particle.io/v1/devices';

// ---------- Sesion ----------
async function requerirSesion() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    location.href = 'index.html';
    throw new Error('Sin sesion');
  }
  return data.session;
}

async function cerrarSesion() {
  await db.auth.signOut();
  location.href = 'index.html';
}

// ---------- Perfil del encargado (nombre y foto, opcionales) ----------
// Al crear cuenta todavia no hay sesion (hay que confirmar el correo),
// asi que el nombre y la foto se guardan aqui y se suben al entrar.
function guardarPerfilPendiente(email, perfil) {
  try { localStorage.setItem('perfil-pendiente:' + email.toLowerCase(), JSON.stringify(perfil)); } catch {}
}

function tomarPerfilPendiente(email) {
  try {
    const clave = 'perfil-pendiente:' + email.toLowerCase();
    const texto = localStorage.getItem(clave);
    localStorage.removeItem(clave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

// Regresa { nombre, foto } del encargado; lo crea la primera vez
async function obtenerResponsable(sesion) {
  const { data, error } = await db.from('responsables').select('nombre, foto').eq('id', sesion.user.id).maybeSingle();
  if (error) throw error;

  const pendiente = tomarPerfilPendiente(sesion.user.email);
  if (data && !pendiente) return data;

  const perfil = {
    id: sesion.user.id,
    nombre: pendiente?.nombre || data?.nombre || sesion.user.user_metadata?.nombre || null,
    foto: pendiente?.foto || data?.foto || null
  };
  const { error: errorGuardar } = await db.from('responsables').upsert(perfil);
  if (errorGuardar) throw errorGuardar;
  return perfil;
}

async function guardarResponsable(sesion, nombre, foto) {
  const { error } = await db.from('responsables').upsert({
    id: sesion.user.id, nombre: nombre || null, foto: foto || null, actualizado: new Date().toISOString()
  });
  if (error) throw error;
}

// Achica la foto a 256 px para guardarla como texto (unos 20 KB)
function reducirFoto(archivo, lado = 256) {
  return new Promise((resolve, reject) => {
    if (!archivo.type.startsWith('image/')) { reject(new Error('Elige un archivo de imagen.')); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const corte = Math.min(img.width, img.height);       // recorte cuadrado al centro
      c.getContext('2d').drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = URL.createObjectURL(archivo);
  });
}

// Pone la foto en un circulo, o la inicial si no hay foto
function pintarAvatar(nodo, foto, inicial) {
  nodo.replaceChildren();
  if (foto) nodo.append(el('img', { src: foto, alt: '' }));
  else nodo.append(el('span', {}, inicial));
  nodo.classList.toggle('con-foto', !!foto);
}

// ---------- Datos ----------
async function obtenerPaciente() {
  const { data, error } = await db.from('pacientes').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data;   // null si todavia no registra su pastillero
}

async function obtenerCompartimentos(pacienteId) {
  const { data, error } = await db
    .from('compartimentos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('numero');
  if (error) throw error;
  return data;
}

// ---------- Particle ----------
async function llamarFuncionPhoton(photonId, funcion, argumento) {
  const resp = await fetch(`${PARTICLE_API}/${photonId}/${funcion}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PARTICLE_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ arg: argumento })
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error_description || json.error || 'El pastillero no respondio');
  if (json.return_value < 0) throw new Error('El pastillero rechazo el dato');
  return json.return_value;
}

async function photonEnLinea(photonId) {
  try {
    const resp = await fetch(`${PARTICLE_API}/${photonId}`, {
      headers: { 'Authorization': `Bearer ${PARTICLE_TOKEN}` }
    });
    if (!resp.ok) return false;
    const json = await resp.json();
    return json.connected === true || json.online === true;
  } catch {
    return false;
  }
}

// ---------- Horas ----------
const VENTANA_MIN = 30;   // minutos que el LED avisa antes de marcar "omitida"

// "08:00:00" -> 480
function aMinutos(horaTexto) {
  const [h, m] = horaTexto.split(':').map(Number);
  return h * 60 + m;
}

// 480 -> "08:00"
function aTexto(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function horaDe(fecha) {
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Horas del dia en que se enciende el LED, empezando por la primera toma
function horasDelDia(horaInicio, cadaHoras) {
  const inicio = aMinutos(horaInicio);
  const horas = [];
  for (let i = 0; i < 24 / cadaHoras; i++) horas.push(aTexto(inicio + i * cadaHoras * 60));
  return horas;
}

// ["08:00","16:00","00:00"] -> "08:00, 16:00 y 00:00"
function unirConY(lista) {
  if (lista.length <= 1) return lista.join('');
  return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}

// Siguiente toma que todavia no termina su aviso (puede estar en curso)
function siguienteToma(horaInicio, cadaHoras, ahora = new Date()) {
  const inicio = aMinutos(horaInicio);
  const paso = cadaHoras * 60;
  const base = new Date(ahora);
  base.setHours(0, 0, 0, 0);
  // revisa desde ayer para cubrir la medianoche
  for (let dia = -1; dia <= 1; dia++) {
    for (let k = 0; k < 24 / cadaHoras; k++) {
      const t = new Date(base.getTime() + (dia * 1440 + inicio + k * paso) * 60000);
      if (t.getTime() + VENTANA_MIN * 60000 > ahora.getTime()) return t;
    }
  }
  return null;
}

// ---------- Horario de un compartimento (cada X horas o personalizado) ----------
// "08:00,14:00,21:30" -> ["08:00","14:00","21:30"] (ordenadas y sin repetir)
function leerHorasPersonalizadas(texto) {
  if (!texto) return [];
  const lista = texto.split(',').map(h => h.trim().slice(0, 5)).filter(h => /^\d{2}:\d{2}$/.test(h));
  return [...new Set(lista)].sort();
}

// Minutos del dia en que le toca al compartimento, ej. [480, 840, 1290]
function minutosDeToma(comp) {
  const personalizadas = leerHorasPersonalizadas(comp.horas_personalizadas);
  if (personalizadas.length) return personalizadas.map(aMinutos);
  if (!comp.hora_inicio || !comp.cada_horas) return [];
  return horasDelDia(comp.hora_inicio, comp.cada_horas).map(aMinutos).sort((a, b) => a - b);
}

// Texto corto para la tarjeta: "cada 8 h · desde 08:00" o "08:00, 14:00 y 21:30"
function textoHorario(comp) {
  const personalizadas = leerHorasPersonalizadas(comp.horas_personalizadas);
  if (personalizadas.length) return unirConY(personalizadas);
  return `cada ${comp.cada_horas} h · desde ${comp.hora_inicio.slice(0, 5)}`;
}

// Todas las tomas de ayer, hoy y manana, en orden
function tomasCercanas(comp, ahora) {
  const base = new Date(ahora);
  base.setHours(0, 0, 0, 0);
  const fechas = [];
  for (let dia = -1; dia <= 1; dia++) {
    for (const m of minutosDeToma(comp)) {
      fechas.push(new Date(base.getTime() + (dia * 1440 + m) * 60000));
    }
  }
  return fechas.sort((a, b) => a - b);
}

// Siguiente toma que todavia no termina su aviso (puede estar en curso)
function siguienteTomaDe(comp, ahora = new Date()) {
  return tomasCercanas(comp, ahora).find(t => t.getTime() + VENTANA_MIN * 60000 > ahora.getTime()) || null;
}

// La toma que fue justo antes de "fecha"
function tomaAnteriorDe(comp, fecha) {
  const antes = tomasCercanas(comp, fecha).filter(t => t < fecha);
  return antes.length ? antes[antes.length - 1] : null;
}

// ---------- DOM ----------
// el('div', {className: 'x'}, 'texto', otroNodo)
function el(etiqueta, props = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  Object.assign(nodo, props);
  for (const h of hijos) {
    if (h === null || h === undefined || h === false) continue;
    nodo.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return nodo;
}

function mostrarMensaje(nodo, texto, tipo = '') {
  nodo.textContent = texto;
  nodo.className = 'mensaje ' + tipo;
}
