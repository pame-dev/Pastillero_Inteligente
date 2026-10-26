"use strict";

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// Pantalla 1 - Iniciar sesion / crear cuenta
var modo = 'entrar'; // 'entrar' o 'crear'

var tabEntrar = document.getElementById('tab-entrar');
var tabCrear = document.getElementById('tab-crear');
var form = document.getElementById('form-acceso');
var correo = document.getElementById('correo');
var pass = document.getElementById('contrasena');
var btn = document.getElementById('btn-enviar');
var msg = document.getElementById('mensaje');
var nombreEnc = document.getElementById('nombre-encargado');
var fotoInput = document.getElementById('foto-nueva');
var fotoNueva = null; // data URL de la foto elegida al crear cuenta

function cambiarModo(nuevo) {
  modo = nuevo;
  tabEntrar.classList.toggle('activa', modo === 'entrar');
  tabCrear.classList.toggle('activa', modo === 'crear');
  btn.textContent = modo === 'entrar' ? 'Entrar' : 'Crear cuenta';
  pass.autocomplete = modo === 'entrar' ? 'current-password' : 'new-password';
  document.getElementById('campos-registro').classList.toggle('oculto', modo !== 'crear');
  mostrarMensaje(msg, '');
}

tabEntrar.addEventListener('click', function () {
  return cambiarModo('entrar');
});
tabCrear.addEventListener('click', function () {
  return cambiarModo('crear');
}); // Foto opcional al crear cuenta

fotoInput.addEventListener('change', function _callee() {
  var archivo;
  return regeneratorRuntime.async(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          archivo = fotoInput.files[0];

          if (archivo) {
            _context.next = 3;
            break;
          }

          return _context.abrupt("return");

        case 3:
          _context.prev = 3;
          _context.next = 6;
          return regeneratorRuntime.awrap(reducirFoto(archivo));

        case 6:
          fotoNueva = _context.sent;
          pintarAvatar(document.getElementById('vista-foto'), fotoNueva, '+');
          document.getElementById('btn-quitar-foto-nueva').hidden = false;
          _context.next = 14;
          break;

        case 11:
          _context.prev = 11;
          _context.t0 = _context["catch"](3);
          mostrarMensaje(msg, _context.t0.message, 'error');

        case 14:
          fotoInput.value = '';

        case 15:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[3, 11]]);
});
document.getElementById('btn-quitar-foto-nueva').addEventListener('click', function () {
  fotoNueva = null;
  pintarAvatar(document.getElementById('vista-foto'), null, '+');
  document.getElementById('btn-quitar-foto-nueva').hidden = true;
}); // Si ya tiene sesion, directo al panel

db.auth.getSession().then(function (_ref) {
  var data = _ref.data;
  if (data.session) location.href = 'panel.html';
});
form.addEventListener('submit', function _callee2(e) {
  var credenciales, nombre, _ref2, data, error;

  return regeneratorRuntime.async(function _callee2$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          e.preventDefault();
          btn.disabled = true;
          mostrarMensaje(msg, 'Un momento...');
          credenciales = {
            email: correo.value.trim(),
            password: pass.value
          };
          nombre = nombreEnc.value.trim();

          if (!(modo === 'entrar')) {
            _context2.next = 11;
            break;
          }

          _context2.next = 8;
          return regeneratorRuntime.awrap(db.auth.signInWithPassword(credenciales));

        case 8:
          _context2.t0 = _context2.sent;
          _context2.next = 14;
          break;

        case 11:
          _context2.next = 13;
          return regeneratorRuntime.awrap(db.auth.signUp(_objectSpread({}, credenciales, {
            options: {
              data: {
                nombre: nombre
              }
            }
          })));

        case 13:
          _context2.t0 = _context2.sent;

        case 14:
          _ref2 = _context2.t0;
          data = _ref2.data;
          error = _ref2.error;
          btn.disabled = false;

          if (!error) {
            _context2.next = 21;
            break;
          }

          mostrarMensaje(msg, traducirError(error.message), 'error');
          return _context2.abrupt("return");

        case 21:
          if (modo === 'crear') {
            // El perfil (nombre y foto) se guarda al entrar por primera vez
            guardarPerfilPendiente(credenciales.email, {
              nombre: nombre,
              foto: fotoNueva
            });
          }

          if (!(modo === 'crear' && !data.session)) {
            _context2.next = 26;
            break;
          }

          cambiarModo('entrar');
          mostrarMensaje(msg, 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.', 'ok');
          return _context2.abrupt("return");

        case 26:
          location.href = 'panel.html';

        case 27:
        case "end":
          return _context2.stop();
      }
    }
  });
});
document.getElementById('btn-olvide').addEventListener('click', function _callee3() {
  var email, regresarA, _ref3, error;

  return regeneratorRuntime.async(function _callee3$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          email = correo.value.trim();

          if (email) {
            _context3.next = 4;
            break;
          }

          mostrarMensaje(msg, 'Escribe tu correo arriba y vuelve a presionar.', 'error');
          return _context3.abrupt("return");

        case 4:
          // El enlace del correo regresa a nuestra pagina para poner la contrasena nueva
          regresarA = new URL('nueva-contrasena.html', location.href).href;
          _context3.next = 7;
          return regeneratorRuntime.awrap(db.auth.resetPasswordForEmail(email, {
            redirectTo: regresarA
          }));

        case 7:
          _ref3 = _context3.sent;
          error = _ref3.error;
          mostrarMensaje(msg, error ? traducirError(error.message) : 'Te enviamos un correo para cambiar la contraseña.', error ? 'error' : 'ok');

        case 10:
        case "end":
          return _context3.stop();
      }
    }
  });
});

function traducirError(texto) {
  if (texto.includes('Invalid login')) return 'Correo o contraseña incorrectos.';
  if (texto.includes('already registered')) return 'Ese correo ya tiene cuenta.';
  if (texto.includes('Email not confirmed')) return 'Primero confirma tu correo.';
  return texto;
}
//# sourceMappingURL=login.dev.js.map
