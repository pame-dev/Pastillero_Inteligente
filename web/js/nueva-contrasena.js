// Pantalla - Poner contrasena nueva (se llega desde el correo de "Olvide mi contrasena")

const form = document.getElementById('form-nueva');
const msg  = document.getElementById('mensaje');
const sub  = document.getElementById('subtitulo');
const btn  = document.getElementById('btn-guardar');

function mostrarFormulario() {
  sub.textContent = 'Escribe tu contraseña nueva.';
  form.classList.remove('oculto');
}

function enlaceInvalido(texto) {
  sub.textContent = '';
  mostrarMensaje(msg, texto + ' Regresa a iniciar sesión y presiona «¿Olvidaste tu contraseña?» otra vez.', 'error');
}

// Si el enlace ya se uso o caduco, Supabase lo dice en la direccion (#error=...)
const datos = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
if (datos.get('error')) {
  const caduco = (datos.get('error_code') || '').includes('expired');
  enlaceInvalido(caduco ? 'El enlace ya caducó o ya se usó.' : 'El enlace no es válido.');
} else {
  // Supabase lee el enlace y abre una sesion temporal para cambiar la contrasena
  let listo = false;
  db.auth.onAuthStateChange((evento, sesion) => {
    if (!listo && sesion && (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION')) {
      listo = true;
      mostrarFormulario();
    }
  });
  // Si en unos segundos no hay sesion, el enlace no sirvio
  setTimeout(async () => {
    if (listo) return;
    const { data } = await db.auth.getSession();
    if (data.session) { listo = true; mostrarFormulario(); }
    else enlaceInvalido('No se pudo abrir el enlace.');
  }, 4000);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = document.getElementById('pass1').value;
  const p2 = document.getElementById('pass2').value;
  if (p1 !== p2) {
    mostrarMensaje(msg, 'Las dos contraseñas no son iguales.', 'error');
    return;
  }
  btn.disabled = true;
  mostrarMensaje(msg, 'Guardando...');
  const { error } = await db.auth.updateUser({ password: p1 });
  btn.disabled = false;
  if (error) {
    const texto = error.message.includes('different from the old')
      ? 'La contraseña nueva debe ser diferente a la anterior.'
      : error.message;
    mostrarMensaje(msg, texto, 'error');
    return;
  }
  form.classList.add('oculto');
  sub.textContent = '';
  mostrarMensaje(msg, 'Listo, tu contraseña se cambió. Entrando a tu panel...', 'ok');
  setTimeout(() => { location.href = 'panel.html'; }, 1800);
});
