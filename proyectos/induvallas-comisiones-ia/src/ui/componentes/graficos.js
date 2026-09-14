/**
 * Gráficos con Chart.js (global `Chart` embebido). Paleta kam en orden fijo: magenta (dato protagonista), azul (estructura),
 * púrpura y verde solo como series adicionales; nunca púrpura junto a azul. Etiquetas y ejes en tinta, no en color de serie.
 * @module ui/componentes/graficos
 */
import { h } from '../dom.js';
import { moneda } from '../format.js';

export const PALETA = { mag: '#F652A0', azul: '#4C5270', gos: '#6D6D7F', gme: '#B8BAC5', gcl: '#F2F2F2', pur: '#8064A2', grn: '#83E9A2', magSuave: '#FDEBF4', tinta: '#23263A' };

let configurado = false;
function configurarDefaults() {
  if (configurado || typeof Chart === 'undefined') return;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.color = PALETA.gos;
  Chart.defaults.animation = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 };
  configurado = true;
}

export function hayChart() {
  return typeof Chart !== 'undefined';
}

const ejesBase = (horizontal, formato) => ({
  [horizontal ? 'x' : 'y']: { grid: { color: PALETA.gcl, drawBorder: false }, border: { display: false }, ticks: { callback: (v) => formato(v), maxTicksLimit: 6 } },
  [horizontal ? 'y' : 'x']: { grid: { display: false }, border: { display: false } },
});

/**
 * Barras (verticales u horizontales, opcionalmente apiladas). Montos en centavos; el eje y el tooltip formatean a USD.
 * @returns {{el:HTMLElement, chart:object|null, actualizar:(etiquetas:string[], series:object[])=>void}}
 */
export function barras({ etiquetas, series, horizontal = false, apilado = false, alto = 240, formato = (c) => moneda(c), leyenda = true }) {
  configurarDefaults();
  const canvas = h('canvas', { role: 'img', 'aria-label': series.map((s) => s.nombre).join(', ') });
  const el = h('div', { class: 'grafico', style: { height: `${alto}px` } }, canvas);
  if (!hayChart()) return { el, chart: null, actualizar() {} };
  const datasets = series.map((s) => ({ label: s.nombre, data: s.datos, backgroundColor: s.color, borderRadius: 3, maxBarThickness: 28, borderSkipped: false }));
  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: etiquetas, datasets },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: leyenda && series.length > 1, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: false } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: USD ${formato(c.parsed[horizontal ? 'x' : 'y'])}` } },
      },
      scales: Object.fromEntries(Object.entries(ejesBase(horizontal, formato)).map(([k, v]) => [k, { ...v, stacked: apilado }])),
    },
  });
  return {
    el,
    chart,
    actualizar(nuevasEtiquetas, nuevasSeries) {
      chart.data.labels = nuevasEtiquetas;
      chart.data.datasets = nuevasSeries.map((s) => ({ label: s.nombre, data: s.datos, backgroundColor: s.color, borderRadius: 3, maxBarThickness: 28, borderSkipped: false }));
      chart.update('none');
    },
  };
}

const etiquetasCascada = {
  id: 'etiquetasCascada',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const ds = chart.data.datasets[0];
    ctx.save();
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = PALETA.tinta;
    ctx.textBaseline = 'middle';
    meta.data.forEach((barra, i) => {
      const texto = ds.etiquetasTexto?.[i];
      if (!texto) return;
      const x = Math.max(barra.x, barra.base) + 6;
      ctx.textAlign = 'left';
      ctx.fillText(texto, Math.min(x, chart.chartArea.right - ctx.measureText(texto).width - 2), barra.y);
    });
    ctx.restore();
  },
};

/**
 * Cascada horizontal: pasos [{ etiqueta, desde, hasta, tipo: 'total'|'mas'|'menos'|'final' }] en centavos.
 */
export function cascada({ pasos, alto = 300 }) {
  configurarDefaults();
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Cascada de composición de la comisión' });
  const el = h('div', { class: 'grafico', style: { height: `${alto}px` } }, canvas);
  if (!hayChart()) return { el, chart: null, actualizar() {} };
  const color = (t) => (t === 'final' ? PALETA.mag : t === 'menos' ? PALETA.gme : t === 'mas' ? PALETA.pur : PALETA.azul);
  const construir = (ps) => ({
    labels: ps.map((p) => p.etiqueta),
    datasets: [{ data: ps.map((p) => [Math.min(p.desde, p.hasta), Math.max(p.desde, p.hasta)]), backgroundColor: ps.map((p) => color(p.tipo)), borderRadius: 3, maxBarThickness: 22, borderSkipped: false, etiquetasTexto: ps.map((p) => (p.tipo === 'total' || p.tipo === 'final' ? moneda(p.hasta) : `${p.hasta >= p.desde ? '+' : '−'}${moneda(Math.abs(p.hasta - p.desde))}`)) }],
  });
  const chart = new Chart(canvas, {
    type: 'bar',
    data: construir(pasos),
    plugins: [etiquetasCascada],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 90 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `USD ${moneda(c.raw[0])} → USD ${moneda(c.raw[1])}` } } },
      scales: { x: { grid: { color: PALETA.gcl }, border: { display: false }, ticks: { callback: (v) => moneda(v), maxTicksLimit: 6 } }, y: { grid: { display: false }, border: { display: false } } },
    },
  });
  return {
    el,
    chart,
    actualizar(ps) {
      chart.data = construir(ps);
      chart.update('none');
    },
  };
}

export function leyenda(items) {
  return h('div', { class: 'leyenda' }, items.map((it) => h('span', null, h('i', { style: { background: it.color } }), it.nombre)));
}
