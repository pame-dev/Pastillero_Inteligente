// Pantalla 1 - Iniciar sesion / crear cuenta

let modo = 'entrar';   // 'entrar' o 'crear'

const tabEntrar = document.getElementById('tab-entrar');
const tabCrear  = document.getElementById('tab-crear');
const form      = document.getElementById('form-acceso');
const correo    = document.getElementById('correo');
const pass      = document.getElementById('contrasena');
const btn       = document.getElementById('btn-enviar');
const msg       = document.getElementById('mensaje');
const nombreEnc = document.getElementById('nombre-encargado');
const fotoInput = document.getElementById('foto-nueva');
let fotoNueva = null;   // data URL de la foto elegida al crear cuenta

function cambiarModo(nuevo) {
  modo = nuevo;
  tabEntrar.classList.toggle('activa', modo === 'entrar');
  tabCrear.classList.toggle('activa', modo === 'crear');
  btn.textContent = modo === 'entrar' ? 'Entrar' : 'Crear cuenta';
  pass.autocomplete = modo === 'entrar' ? 'current-password' : 'new-password';
  document.getElementById('campos-registro').classList.toggle('oculto', modo !== 'crear');
  mostrarMensaje(msg, '');
}

tabEntrar.addEventListener('click', () => cambiarModo('entrar'));
tabCrear.addEventListener('click', () => cambiarModo('crear'));

// Foto opcional al crear cuenta
fotoInput.addEventListener('change', async () => {
  const archivo = fotoInput.files[0];
  if (!archivo) return;
  try {
    fotoNueva = await reducirFoto(archivo);
    pintarAvatar(document.getElementById('vista-foto'), fotoNueva, '+');
    document.getElementById('btn-quitar-foto-nueva').hidden = false;
  } catch (err) {
    mostrarMensaje(msg, err.message, 'error');
  }
  fotoInput.value = '';
});

document.getElementById('btn-quitar-foto-nueva').addEventListener('click', () => {
  fotoNueva = null;
  pintarAvatar(document.getElementById('vista-foto'), null, '+');
  document.getElementById('btn-quitar-foto-nueva').hidden = true;
});

// Si ya tiene sesion, directo al panel
db.auth.getSession().then(({ data }) => {
  if (data.session) location.href = 'panel.html';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  mostrarMensaje(msg, 'Un momento...');

  const credenciales = { email: correo.value.trim(), password: pass.value };
  const nombre = nombreEnc.value.trim();
  const { data, error } = modo === 'entrar'
    ? await db.auth.signInWithPassword(credenciales)
    : await db.auth.signUp({ ...credenciales, options: { data: { nombre } } });

  btn.disabled = false;

  if (error) {
    mostrarMensaje(msg, traducirError(error.message), 'error');
    return;
  }
  if (modo === 'crear') {
    // El perfil (nombre y foto) se guarda al entrar por primera vez
    guardarPerfilPendiente(credenciales.email, { nombre, foto: fotoNueva });
  }
  if (modo === 'crear' && !data.session) {
    cambiarModo('entrar');
    mostrarMensaje(msg, 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.', 'ok');
    return;
  }
  location.href = 'panel.html';
});

document.getElementById('btn-olvide').addEventListener('click', async () => {
  const email = correo.value.trim();
  if (!email) {
    mostrarMensaje(msg, 'Escribe tu correo arriba y vuelve a presionar.', 'error');
    return;
  }
  // El enlace del correo regresa a nuestra pagina para poner la contrasena nueva
  const regresarA = new URL('nueva-contrasena.html', location.href).href;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: regresarA });
  mostrarMensaje(msg, error ? traducirError(error.message) : 'Te enviamos un correo para cambiar la contraseña.', error ? 'error' : 'ok');
});

function traducirError(texto) {
  if (texto.includes('Invalid login')) return 'Correo o contraseña incorrectos.';
  if (texto.includes('already registered')) return 'Ese correo ya tiene cuenta.';
  if (texto.includes('Email not confirmed')) return 'Primero confirma tu correo.';
  return texto;
}
