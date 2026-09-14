/**
 * Componentes didácticos: barra de pasos del cierre, tarjeta «Cómo usar esta pestaña» y guion de la demostración.
 * @module ui/componentes/ayuda
 */
import { h, boton, badge, limpiar } from '../dom.js';
import { estado, irA, nombreVendedor, resultadoPeriodo, esDemo } from '../estado.js';
import { AYUDA_PESTANAS, GUION_DEMO, pasosCierre } from '../guia.js';
import { periodoLargo, usd, pct } from '../format.js';

const TITULOS = { panel: 'Panel ejecutivo', datos: 'Datos', tabla: 'Tabla de determinación', politica: 'Política de cobranza', motor: 'Motor de cálculo', liquidacion: 'Liquidación y auditoría', asistente: 'Asistente' };

function leerPreferencia(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : v === '1';
  } catch (e) {
    return porDefecto;
  }
}

function guardarPreferencia(clave, valor) {
  try {
    localStorage.setItem(clave, valor ? '1' : '0');
  } catch (e) {
    /* sin localStorage */
  }
}

/** Tarjeta plegable con propósito y pasos numerados de la pestaña. Abierta por defecto; recuerda el estado. */
export function tarjetaAyuda(id) {
  const a = AYUDA_PESTANAS[id];
  if (!a) return null;
  const clave = `kam.ayuda.${id}`;
  let abierta = leerPreferencia(clave, true);
  const cuerpo = h('ol', { class: 'lista-pasos' }, a.pasos.map(([t, d]) => h('li', null, h('b', null, `${t}. `), d)));
  const alternar = boton(abierta ? 'Plegar' : 'Ver pasos', () => {
    abierta = !abierta;
    guardarPreferencia(clave, abierta);
    cuerpo.classList.toggle('oculto', !abierta);
    alternar.textContent = abierta ? 'Plegar' : 'Ver pasos';
    alternar.setAttribute('aria-expanded', abierta ? 'true' : 'false');
  }, { mini: true });
  alternar.setAttribute('aria-expanded', abierta ? 'true' : 'false');
  cuerpo.classList.toggle('oculto', !abierta);
  return h('section', { class: 'tarjeta ayuda-tarjeta', 'aria-label': `Cómo usar ${TITULOS[id]}` },
    h('div', { class: 'tarjeta-cab', style: { marginBottom: abierta ? '6px' : 0 } }, h('div', null, h('div', { class: 'eyebrow' }, `Cómo usar · ${TITULOS[id]}`), h('div', null, a.proposito)), alternar),
    a.notaDemo && esDemo() ? h('p', { class: 'ayuda-nota' }, a.notaDemo) : null,
    cuerpo
  );
}

/** Barra de progreso del cierre mensual. Devuelve { el, actualizar }. */
export function stepper() {
  const el = h('nav', { class: 'stepper', 'aria-label': 'Pasos del cierre mensual' });
  const actualizar = () => {
    limpiar(el);
    if (!estado.dataset) return;
    const pasos = pasosCierre();
    const actual = pasos.find((p) => p.actual);
    el.append(
      h('div', { class: 'stepper-pasos' }, pasos.map((p, i) => h('button', { type: 'button', class: `paso ${p.hecho ? 'paso-hecho' : ''} ${p.actual ? 'paso-actual' : ''}`, title: p.instruccion, 'aria-current': p.actual ? 'step' : null, onClick: () => irA(p.pestana) },
        h('span', { class: 'paso-num' }, p.hecho ? '✓' : String(i + 1)),
        h('span', { class: 'paso-titulo' }, p.titulo)
      ))),
      h('div', { class: 'stepper-instruccion' },
        actual ? [h('b', null, `Paso ${pasos.indexOf(actual) + 1} · ${actual.titulo}: `), actual.instruccion, ' ', boton('Ir', () => irA(actual.pestana), { mini: true, tipo: 'primario' })] : [h('b', null, `Cierre de ${periodoLargo(estado.periodo)} completado. `), 'Puede exportar el rol, revisar la bitácora o cambiar de período.']
      )
    );
  };
  actualizar();
  return { el, actualizar };
}

/** Guion de la demostración: cinco casos de control del cierre de agosto 2026 con enlace al cálculo. */
export function tarjetaGuionDemo() {
  const per = resultadoPeriodo('2026-08');
  const items = GUION_DEMO.map((c, i) => {
    const led = per?.vendedores?.[c.vendedorId];
    const t = led?.totales;
    const resumen = led ? `Cumplimiento ${pct(led.tramo?.cumplimiento)} · devengado ${usd(t.devengado + t.bonos)} · liquidable ${usd(t.liquidable)}${t.excedente ? ` · excedente ${usd(t.excedente)}` : ''}${t.saldoSiguiente ? ` · saldo negativo ${usd(t.saldoSiguiente)}` : ''}` : '';
    return h('div', { class: 'guion-item' },
      h('div', { class: 'guion-num' }, String(i + 1)),
      h('div', null,
        h('div', { class: 'guion-titulo' }, c.titulo, ' ', badge(c.reglas, 'badge-info')),
        h('div', null, c.que),
        h('div', { class: 'ayuda' }, 'Qué mirar: ', c.mirar, resumen ? ` · ${resumen}` : ''),
      ),
      boton('Ver', () => irA(c.pestana, { vendedorId: c.vendedorId, periodo: '2026-08', ...(c.extra || {}) }), { mini: true, tipo: 'primario' })
    );
  });
  return h('section', { class: 'tarjeta tarjeta-memorable', id: 'tarjeta-guion' },
    h('div', { class: 'tarjeta-cab' }, h('div', null, h('h2', null, 'Guion de la demostración · cierre de agosto 2026'), h('div', { class: 'ayuda' }, 'Seis pasos preparados: cinco casos de control para entender cada regla y el contraste con el Excel anterior. Recórralos en orden; cada botón «Ver» abre la pantalla correspondiente con el período de agosto seleccionado.'))),
    h('div', { class: 'guion' }, items)
  );
}
