"use strict";

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

// Pantalla 4 - Historial de tomas
var paciente = null;
var nombres = {}; // numero de compartimento -> medicamento

var filtro = document.getElementById('filtro');
filtro.addEventListener('change', cargarHistorial); // Rango de fechas segun el filtro: Hoy, Ayer o Ultimos 7 dias

function rango(valor) {
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  var dia = 86400000;
  if (valor === '1') return [new Date(hoy - dia), hoy];
  if (valor === '7') return [new Date(hoy - 6 * dia), new Date(hoy.getTime() + dia)];
  return [hoy, new Date(hoy.getTime() + dia)];
}

function cargarHistorial() {
  var _rango, _rango2, desde, hasta, _ref, tomas, error, tomadas, aMano, omitidas, verFecha, lista;

  return regeneratorRuntime.async(function cargarHistorial$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _rango = rango(filtro.value), _rango2 = _slicedToArray(_rango, 2), desde = _rango2[0], hasta = _rango2[1];
          _context.next = 3;
          return regeneratorRuntime.awrap(db.from('tomas').select('id, numero, estado, fecha_hora, hora_manual').eq('paciente_id', paciente.id).gte('fecha_hora', desde.toISOString()).lt('fecha_hora', hasta.toISOString()).order('fecha_hora', {
            ascending: false
          }));

        case 3:
          _ref = _context.sent;
          tomas = _ref.data;
          error = _ref.error;

          if (!error) {
            _context.next = 8;
            break;
          }

          throw error;

        case 8:
          tomadas = tomas.filter(function (t) {
            return t.estado === 'tomada';
          }).length;
          aMano = tomas.filter(function (t) {
            return t.estado === 'omitida' && t.hora_manual;
          }).length;
          omitidas = tomas.length - tomadas - aMano;
          document.getElementById('resumen').textContent = "".concat(tomadas, " ").concat(tomadas === 1 ? 'tomada' : 'tomadas', " \xB7 ") + (aMano ? "".concat(aMano, " ").concat(aMano === 1 ? 'registrada' : 'registradas', " a mano \xB7 ") : '') + "".concat(omitidas, " no ").concat(omitidas === 1 ? 'tomada' : 'tomadas');
          document.getElementById('vacio').classList.toggle('oculto', tomas.length > 0);
          verFecha = filtro.value === '7';
          lista = document.getElementById('lista');
          lista.replaceChildren.apply(lista, _toConsumableArray(tomas.map(function (t) {
            var fecha = new Date(t.fecha_hora);
            var estado = textoToma(t); // Solo en las "no tomadas": opcion de registrar a mano la hora en que si se tomo

            var registrar = null;

            if (t.estado === 'omitida' && !t.hora_manual) {
              registrar = el('button', {
                type: 'button',
                className: 'enlace registrar'
              }, 'Registrar hora en que se tomó');
              registrar.addEventListener('click', function () {
                return abrirRegistroManual(t, nombres[t.numero], function () {
                  return cargarHistorial()["catch"](console.error);
                });
              });
            }

            return el('li', {}, el('div', {
              className: 'fila'
            }, el('span', {
              className: 'hora'
            }, horaDe(fecha), verFecha && el('small', {}, fecha.toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short'
            }))), el('span', {
              className: 'numero'
            }, t.numero), el('div', {
              className: 'info'
            }, nombres[t.numero] || 'Compartimento ' + t.numero, registrar), el('span', {
              className: 'estado'
            }, el('span', {
              className: 'punto ' + estado.color
            }), t.estado === 'tomada' ? 'Tomada' : estado.texto)));
          })));

        case 16:
        case "end":
          return _context.stop();
      }
    }
  });
}

(function _callee() {
  var compartimentos, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, c;

  return regeneratorRuntime.async(function _callee$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.next = 2;
          return regeneratorRuntime.awrap(requerirSesion());

        case 2:
          _context2.next = 4;
          return regeneratorRuntime.awrap(obtenerPaciente());

        case 4:
          paciente = _context2.sent;

          if (paciente) {
            _context2.next = 8;
            break;
          }

          location.href = 'panel.html';
          return _context2.abrupt("return");

        case 8:
          _context2.next = 10;
          return regeneratorRuntime.awrap(obtenerCompartimentos(paciente.id));

        case 10:
          compartimentos = _context2.sent;
          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          _context2.prev = 14;

          for (_iterator = compartimentos[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            c = _step.value;
            if (c.medicamento) nombres[c.numero] = c.medicamento;
          }

          _context2.next = 22;
          break;

        case 18:
          _context2.prev = 18;
          _context2.t0 = _context2["catch"](14);
          _didIteratorError = true;
          _iteratorError = _context2.t0;

        case 22:
          _context2.prev = 22;
          _context2.prev = 23;

          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }

        case 25:
          _context2.prev = 25;

          if (!_didIteratorError) {
            _context2.next = 28;
            break;
          }

          throw _iteratorError;

        case 28:
          return _context2.finish(25);

        case 29:
          return _context2.finish(22);

        case 30:
          _context2.next = 32;
          return regeneratorRuntime.awrap(cargarHistorial());

        case 32:
        case "end":
          return _context2.stop();
      }
    }
  }, null, null, [[14, 18, 22, 30], [23,, 25, 29]]);
})()["catch"](function (err) {
  if (err.message === 'Sin sesion') return;
  console.error(err);
  alert('Error al cargar el historial: ' + err.message);
});
//# sourceMappingURL=historial.dev.js.map
