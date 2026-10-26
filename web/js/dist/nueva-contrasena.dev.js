"use strict";

// Pantalla - Poner contrasena nueva (se llega desde el correo de "Olvide mi contrasena")
var form = document.getElementById('form-nueva');
var msg = document.getElementById('mensaje');
var sub = document.getElementById('subtitulo');
var btn = document.getElementById('btn-guardar');

function mostrarFormulario() {
  sub.textContent = 'Escribe tu contraseña nueva.';
  form.classList.remove('oculto');
}

function enlaceInvalido(texto) {
  sub.textContent = '';
  mostrarMensaje(msg, texto + ' Regresa a iniciar sesión y presiona «¿Olvidaste tu contraseña?» otra vez.', 'error');
} // Si el enlace ya se uso o caduco, Supabase lo dice en la direccion (#error=...)


var datos = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));

if (datos.get('error')) {
  var caduco = (datos.get('error_code') || '').includes('expired');
  enlaceInvalido(caduco ? 'El enlace ya caducó o ya se usó.' : 'El enlace no es válido.');
} else {
  // Supabase lee el enlace y abre una sesion temporal para cambiar la contrasena
  var listo = false;
  db.auth.onAuthStateChange(function (evento, sesion) {
    if (!listo && sesion && (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION')) {
      listo = true;
      mostrarFormulario();
    }
  }); // Si en unos segundos no hay sesion, el enlace no sirvio

  setTimeout(function _callee() {
    var _ref, data;

    return regeneratorRuntime.async(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            if (!listo) {
              _context.next = 2;
              break;
            }

            return _context.abrupt("return");

          case 2:
            _context.next = 4;
            return regeneratorRuntime.awrap(db.auth.getSession());

          case 4:
            _ref = _context.sent;
            data = _ref.data;

            if (data.session) {
              listo = true;
              mostrarFormulario();
            } else enlaceInvalido('No se pudo abrir el enlace.');

          case 7:
          case "end":
            return _context.stop();
        }
      }
    });
  }, 4000);
}

form.addEventListener('submit', function _callee2(e) {
  var p1, p2, _ref2, error, texto;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          e.preventDefault();
          p1 = document.getElementById('pass1').value;
          p2 = document.getElementById('pass2').value;

          if (!(p1 !== p2)) {
            _context2.next = 6;
            break;
          }

          mostrarMensaje(msg, 'Las dos contraseñas no son iguales.', 'error');
          return _context2.abrupt("return");

        case 6:
          btn.disabled = true;
          mostrarMensaje(msg, 'Guardando...');
          _context2.next = 10;
          return regeneratorRuntime.awrap(db.auth.updateUser({
            password: p1
          }));

        case 10:
          _ref2 = _context2.sent;
          error = _ref2.error;
          btn.disabled = false;

          if (!error) {
            _context2.next = 17;
            break;
          }

          texto = error.message.includes('different from the old') ? 'La contraseña nueva debe ser diferente a la anterior.' : error.message;
          mostrarMensaje(msg, texto, 'error');
          return _context2.abrupt("return");

        case 17:
          form.classList.add('oculto');
          sub.textContent = '';
          mostrarMensaje(msg, 'Listo, tu contraseña se cambió. Entrando a tu panel...', 'ok');
          setTimeout(function () {
            location.href = 'panel.html';
          }, 1800);

        case 21:
        case "end":
          return _context2.stop();
      }
    }
  });
});
//# sourceMappingURL=nueva-contrasena.dev.js.map
