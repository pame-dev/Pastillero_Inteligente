// Pantalla - Editar datos del paciente

let paciente = null;

const nombre = document.getElementById('nombre');
const photon = document.getElementById('photon');
const msg    = document.getElementById('mensaje');
const btn    = document.getElementById('btn-guardar');

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  mostrarMensaje(msg, 'Guardando...');

  const cambios = {
    nombre: nombre.value.trim(),
    photon_id: photon.value.trim().toLowerCase()
  };
  const { error } = await db.from('pacientes').update(cambios).eq('id', paciente.id);
  btn.disabled = false;

  if (error) {
    const texto = error.code === '23505' ? 'Ese Photon ya está registrado por otra cuenta.' : error.message;
    mostrarMensaje(msg, texto, 'error');
    return;
  }
  mostrarMensaje(msg, 'Datos guardados.', 'ok');
});

(async () => {
  await requerirSesion();
  paciente = await obtenerPaciente();
  if (!paciente) { location.href = 'panel.html'; return; }

  nombre.value = paciente.nombre;
  photon.value = paciente.photon_id;
})().catch((err) => {
  if (err.message === 'Sin sesion') return;
  console.error(err);
  mostrarMensaje(msg, 'Error al cargar: ' + err.message, 'error');
});
