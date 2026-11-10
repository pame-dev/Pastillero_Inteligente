// Pantalla 4 - Historial de tomas

let paciente = null;
let nombres = {};   // numero de compartimento -> medicamento

const filtro = document.getElementById('filtro');
filtro.addEventListener('change', cargarHistorial);

// Rango de fechas segun el filtro: Hoy, Ayer o Ultimos 7 dias
function rango(valor) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = 86400000;
  if (valor === '1') return [new Date(hoy - dia), hoy];
  if (valor === '7') return [new Date(hoy - 6 * dia), new Date(hoy.getTime() + dia)];
  return [hoy, new Date(hoy.getTime() + dia)];
}

async function cargarHistorial() {
  const [desde, hasta] = rango(filtro.value);
  const { data: tomas, error } = await db
    .from('tomas')
    .select('id, numero, estado, fecha_hora, hora_manual')
    .eq('paciente_id', paciente.id)
    .gte('fecha_hora', desde.toISOString())
    .lt('fecha_hora', hasta.toISOString())
    .order('fecha_hora', { ascending: false });
  if (error) throw error;

  const tomadas = tomas.filter(t => t.estado === 'tomada').length;
  const aMano = tomas.filter(t => t.estado === 'omitida' && t.hora_manual).length;
  const omitidas = tomas.length - tomadas - aMano;
  document.getElementById('resumen').textContent =
    `${tomadas} ${tomadas === 1 ? 'tomada' : 'tomadas'} · ` +
    (aMano ? `${aMano} ${aMano === 1 ? 'registrada' : 'registradas'} a mano · ` : '') +
    `${omitidas} no ${omitidas === 1 ? 'tomada' : 'tomadas'}`;
  document.getElementById('vacio').classList.toggle('oculto', tomas.length > 0);

  const verFecha = filtro.value === '7';
  const lista = document.getElementById('lista');
  lista.replaceChildren(...tomas.map(t => {
    const fecha = new Date(t.fecha_hora);
    const estado = textoToma(t);
    // Solo en las "no tomadas": opcion de registrar a mano la hora en que si se tomo
    let registrar = null;
    if (t.estado === 'omitida' && !t.hora_manual) {
      registrar = el('button', { type: 'button', className: 'enlace registrar' }, 'Registrar hora en que se tomó');
      registrar.addEventListener('click', () =>
        abrirRegistroManual(t, nombres[t.numero], () => cargarHistorial().catch(console.error)));
    }
    return el('li', {},
      el('div', { className: 'fila' },
        el('span', { className: 'hora' }, horaDe(fecha),
          verFecha && el('small', {}, fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))),
        el('span', { className: 'numero' }, t.numero),
        el('div', { className: 'info' }, nombres[t.numero] || 'Compartimento ' + t.numero, registrar),
        el('span', { className: 'estado' },
          el('span', { className: 'punto ' + estado.color }),
          t.estado === 'tomada' ? 'Tomada' : estado.texto)
      )
    );
  }));
}

(async () => {
  await requerirSesion();
  paciente = await obtenerPaciente();
  if (!paciente) { location.href = 'panel.html'; return; }

  const compartimentos = await obtenerCompartimentos(paciente.id);
  for (const c of compartimentos) if (c.medicamento) nombres[c.numero] = c.medicamento;

  await cargarHistorial();
})().catch((err) => {
  if (err.message === 'Sin sesion') return;
  console.error(err);
  alert('Error al cargar el historial: ' + err.message);
});
