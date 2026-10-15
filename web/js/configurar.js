// Pantalla 3 - Configurar un compartimento

const numero = Number(new URLSearchParams(location.search).get('n'));
let paciente = null;
let compartimento = null;

const campo = {
  medicamento: document.getElementById('medicamento'),
  dosis: document.getElementById('dosis'),
  hora: document.getElementById('hora'),
  activo: document.getElementById('activo')
};
const msg = document.getElementById('mensaje');
const vistaPrevia = document.getElementById('vista-previa');

const MAX_HORAS = 6;   // horas personalizadas por compartimento
const listaHoras = document.getElementById('lista-horas');

function cadaSeleccionado() {
  return Number(document.querySelector('input[name="cada"]:checked').value);
}

function esPersonalizado() {
  return document.getElementById('cp').checked;
}

// Horas escritas en el modo personalizado, ordenadas y sin repetir
function horasPersonalizadas() {
  const horas = [...listaHoras.querySelectorAll('input[type="time"]')].map(i => i.value).filter(Boolean);
  return [...new Set(horas)].sort();
}

function agregarHora(valor = '') {
  if (listaHoras.children.length >= MAX_HORAS) return;
  const input = el('input', { type: 'time', value: valor, required: true });
  const quitar = el('button', { type: 'button', className: 'quitar-hora', title: 'Quitar esta hora' }, '×');
  const fila = el('div', { className: 'fila-hora' }, input, quitar);
  quitar.addEventListener('click', () => {
    if (listaHoras.children.length > 1) fila.remove();
    revisarModo();
  });
  listaHoras.append(fila);
  if (!valor) input.focus();
  revisarModo();
}

document.getElementById('btn-agregar-hora').addEventListener('click', () => agregarHora());

// Muestra "primera toma" o la lista de horas segun la opcion elegida
function revisarModo() {
  const p = esPersonalizado();
  document.getElementById('bloque-intervalo').classList.toggle('oculto', p);
  document.getElementById('bloque-personalizado').classList.toggle('oculto', !p);
  campo.hora.required = false;
  if (p && listaHoras.children.length === 0) agregarHora(campo.hora.value || '08:00');
  document.getElementById('btn-agregar-hora').disabled = listaHoras.children.length >= MAX_HORAS;
  listaHoras.querySelectorAll('input').forEach(i => { i.required = p; });
  actualizarVistaPrevia();
}
document.querySelectorAll('input[name="cada"]').forEach(r => r.addEventListener('change', revisarModo));

function actualizarVistaPrevia() {
  if (!campo.activo.checked) {
    vistaPrevia.textContent = 'Desactivado: el LED no se encenderá.';
  } else if (esPersonalizado()) {
    const horas = horasPersonalizadas();
    vistaPrevia.textContent = horas.length ? 'Se encenderá a las ' + unirConY(horas) : '';
  } else if (campo.hora.value) {
    vistaPrevia.textContent = 'Se encenderá a las ' + unirConY(horasDelDia(campo.hora.value, cadaSeleccionado()));
  } else {
    vistaPrevia.textContent = '';
  }
}

document.getElementById('form').addEventListener('input', actualizarVistaPrevia);
document.getElementById('form').addEventListener('change', actualizarVistaPrevia);

// ---------- Guardar ----------
document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const activo = campo.activo.checked;
  const medicamento = campo.medicamento.value.trim();

  const personalizado = esPersonalizado();
  const horas = horasPersonalizadas();
  const primeraHora = personalizado ? horas[0] : campo.hora.value;

  if (activo && (!medicamento || !primeraHora)) {
    mostrarMensaje(msg, 'Para activarlo escribe el medicamento y la hora.', 'error');
    return;
  }

  const btn = document.getElementById('btn-guardar');
  btn.disabled = true;
  mostrarMensaje(msg, 'Guardando...');

  // 1. Guardar en Supabase
  const cambios = {
    medicamento: medicamento || null,
    dosis: campo.dosis.value.trim() || null,
    hora_inicio: primeraHora || null,
    cada_horas: personalizado ? null : cadaSeleccionado(),
    horas_personalizadas: personalizado ? horas.join(',') : null,
    activo
  };
  const { error } = await db.from('compartimentos').update(cambios).eq('id', compartimento.id);
  if (error) {
    btn.disabled = false;
    mostrarMensaje(msg, 'No se pudo guardar: ' + error.message, 'error');
    return;
  }

  // 2. Enviar al Photon: "3,08:00,8", "3,p,08:00,14:00,21:30" o "3,off"
  let argumento = `${numero},off`;
  if (activo) {
    argumento = personalizado
      ? `${numero},p,${horas.join(',')}`
      : `${numero},${campo.hora.value},${cadaSeleccionado()}`;
  }
  try {
    await llamarFuncionPhoton(paciente.photon_id, 'horario', argumento);
    mostrarMensaje(msg, 'Guardado y enviado al pastillero.', 'ok');
  } catch (err) {
    mostrarMensaje(msg, 'Se guardó, pero el pastillero no respondió (' + err.message + '). Revisa que esté conectado y vuelve a guardar.', 'error');
  }
  btn.disabled = false;
});

// ---------- Probar LED ----------
document.getElementById('btn-probar').addEventListener('click', async () => {
  mostrarMensaje(msg, 'Encendiendo el LED ' + numero + '...');
  try {
    await llamarFuncionPhoton(paciente.photon_id, 'probar', String(numero));
    mostrarMensaje(msg, 'El LED ' + numero + ' debe estar encendido 5 segundos.', 'ok');
  } catch (err) {
    mostrarMensaje(msg, 'El pastillero no respondió: ' + err.message, 'error');
  }
});

// ---------- Inicio ----------
(async () => {
  await requerirSesion();
  if (!(numero >= 1 && numero <= 7)) { location.href = 'panel.html'; return; }

  paciente = await obtenerPaciente();
  if (!paciente) { location.href = 'panel.html'; return; }

  const { data, error } = await db
    .from('compartimentos')
    .select('*')
    .eq('paciente_id', paciente.id)
    .eq('numero', numero)
    .single();
  if (error) throw error;
  compartimento = data;

  document.getElementById('titulo').textContent = 'Compartimento ' + numero;
  document.title = 'Compartimento ' + numero + ' · Pastillero inteligente';
  campo.medicamento.value = data.medicamento || '';
  campo.dosis.value = data.dosis || '';
  if (data.hora_inicio) campo.hora.value = data.hora_inicio.slice(0, 5);
  const guardadas = leerHorasPersonalizadas(data.horas_personalizadas);
  if (guardadas.length) {
    document.getElementById('cp').checked = true;
    guardadas.forEach(h => agregarHora(h));
  } else if (data.cada_horas) {
    document.getElementById('c' + data.cada_horas).checked = true;
  }
  revisarModo();
  campo.activo.checked = data.medicamento ? data.activo : true;
  actualizarVistaPrevia();
})().catch((err) => {
  if (err.message === 'Sin sesion') return;
  console.error(err);
  mostrarMensaje(msg, 'Error al cargar: ' + err.message, 'error');
});
