/**
 * Pestaña Asistente: preguntas en lenguaje natural respondidas con reglas sobre los datos vivos.
 * @module ui/pestanas/asistente
 */
import { h, limpiar, tarjeta, tabla, boton, input, poner } from '../dom.js';
import { estado, on, nombreVendedor, nombreCliente, irA } from '../estado.js';
import { responder, EJEMPLOS } from '../asistente/intents.js';
import { simularVendedor, compararPoliticas } from '../simulador.js';

let refs = null;
const historial = [];

function contexto() {
  return {
    dataset: estado.dataset,
    resultado: estado.resultado,
    periodo: estado.periodo,
    nombres: { vendedor: nombreVendedor, cliente: nombreCliente },
    simular: (vendedorId, params) => simularVendedor(estado.dataset, estado.periodo, estado.hoy, vendedorId, params),
    compararPoliticas: (vendedorId) => compararPoliticas(estado.dataset, estado.periodo, estado.hoy, { vendedorId }),
  };
}

function agregarMensaje(m) {
  historial.push(m);
  const el = h('div', { class: `chat-msg ${m.rol}` }, h('div', null, m.texto));
  if (m.columnas && m.filas) el.append(h('div', { style: { marginTop: '6px' } }, tabla({ compacta: true, columnas: m.columnas, filas: m.filas })));
  if (m.fuente) el.append(h('div', { class: 'fuente' }, `Fuente: ${m.fuente}`));
  if (m.accion) el.append(h('div', { style: { marginTop: '4px' } }, boton('Ver en la herramienta', () => irA(m.accion.pestana, m.accion), { mini: true })));
  poner(refs.chat, el);
  refs.chat.scrollTop = refs.chat.scrollHeight;
}

function preguntar(texto) {
  const q = (texto || '').trim();
  if (!q) return;
  agregarMensaje({ rol: 'usuario', texto: q });
  try {
    const r = responder(q, contexto());
    agregarMensaje({ rol: 'asistente', ...r });
  } catch (e) {
    console.error(e);
    agregarMensaje({ rol: 'asistente', texto: 'No pude calcular la respuesta por un error interno. Revise la consola del navegador.', fuente: null });
  }
  estado.repo?.registrar('Consulta al asistente', 'Asistente', q.slice(0, 200));
}

function montar(cont) {
  refs = { chat: h('div', { class: 'chat', 'aria-live': 'polite' }) };
  const entrada = input('text', '', null, { placeholder: 'Escriba una pregunta sobre el período seleccionado…', 'aria-label': 'Pregunta', style: 'flex:1' });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      preguntar(entrada.value);
      entrada.value = '';
    }
  });
  const chips = h('div', { class: 'chips' }, EJEMPLOS.map((t) => h('button', { type: 'button', class: 'chip', onClick: () => preguntar(t) }, t)));
  poner(cont, 
    tarjeta('Asistente basado en reglas', [
      h('p', { class: 'ayuda' }, 'Responde solo con lo que puede calcular desde los datos cargados y cita las reglas aplicadas. No envía información fuera del navegador; el modo con API externa no está habilitado en esta versión.'),
      chips,
      refs.chat,
      h('div', { class: 'acciones', style: { marginTop: '8px' } }, entrada, boton('Preguntar', () => { preguntar(entrada.value); entrada.value = ''; }, { tipo: 'primario' })),
    ], { memorable: true })
  );
  if (!historial.length) agregarMensaje({ rol: 'asistente', texto: `Hola. Puedo explicar por qué un vendedor cobra lo que cobra, simular escenarios, listar retenciones y cartera vencida, o resumir el cierre. Pruebe con uno de los ejemplos.`, fuente: null });
  else for (const m of historial.splice(0)) agregarMensaje(m);
}

on('periodo', () => refs && estado.pestana === 'asistente' && agregarMensaje({ rol: 'asistente', texto: `Período cambiado a ${estado.periodo}. Las próximas respuestas usan ese período.`, fuente: null }));

export default { id: 'asistente', titulo: 'Asistente', montar, actualizar() {}, desmontar() { refs = null; } };
