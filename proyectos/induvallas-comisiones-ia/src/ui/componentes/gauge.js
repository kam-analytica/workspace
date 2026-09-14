/**
 * Gauge SVG semicircular de cumplimiento con los límites de tramo marcados. Sin dependencias.
 * @module ui/componentes/gauge
 */
import { h } from '../dom.js';
import { pct } from '../format.js';

const COLORES = { t0: '#E4E5EA', t1: '#F5DDB0', t2: '#C9CCDC', t3: '#D9CFE8', t4: '#F9C4DE' };

function punto(cx, cy, r, angulo) {
  return [cx + r * Math.cos(angulo), cy + r * Math.sin(angulo)];
}

function arco(cx, cy, r, a0, a1) {
  const [x0, y0] = punto(cx, cy, r, a0);
  const [x1, y1] = punto(cx, cy, r, a1);
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${grande} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * @param {{cumplimiento:number|null, tramos:{id:string,nombre:string,desde:number}[], tramoId:string|null, maximo?:number, subtitulo?:string}} p
 */
export function gauge({ cumplimiento, tramos, tramoId, maximo = 1.5, subtitulo = '' }) {
  const ancho = 260;
  const cx = 130;
  const cy = 128;
  const r = 100;
  const grosor = 16;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ancho} 142`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Cumplimiento ${cumplimiento == null ? 'no medible' : pct(cumplimiento)}`);
  const escala = (v) => Math.PI + Math.PI * Math.min(Math.max(v, 0), maximo) / maximo;
  const ordenados = [...tramos].sort((a, b) => a.desde - b.desde);
  ordenados.forEach((t, i) => {
    const desde = t.desde;
    const hasta = i + 1 < ordenados.length ? ordenados[i + 1].desde : maximo;
    if (desde >= maximo) return;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', arco(cx, cy, r, escala(desde) + 0.01, escala(Math.min(hasta, maximo)) - 0.01));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', COLORES[t.id] || '#E4E5EA');
    path.setAttribute('stroke-width', t.id === tramoId ? grosor + 4 : grosor);
    path.setAttribute('stroke-linecap', 'butt');
    svg.append(path);
    const [lx, ly] = punto(cx, cy, r + 16, escala(desde));
    if (desde > 0) {
      const texto = document.createElementNS(ns, 'text');
      texto.setAttribute('x', lx.toFixed(1));
      texto.setAttribute('y', ly.toFixed(1));
      texto.setAttribute('font-size', '9');
      texto.setAttribute('fill', '#6D6D7F');
      texto.setAttribute('text-anchor', lx < cx ? 'end' : lx > cx + 2 ? 'start' : 'middle');
      texto.textContent = pct(desde, 0);
      svg.append(texto);
    }
  });
  if (cumplimiento != null) {
    const ang = escala(cumplimiento);
    const [x0, y0] = punto(cx, cy, r - grosor, ang);
    const [x1, y1] = punto(cx, cy, r + grosor, ang);
    const aguja = document.createElementNS(ns, 'line');
    aguja.setAttribute('x1', x0.toFixed(1));
    aguja.setAttribute('y1', y0.toFixed(1));
    aguja.setAttribute('x2', x1.toFixed(1));
    aguja.setAttribute('y2', y1.toFixed(1));
    aguja.setAttribute('stroke', '#F652A0');
    aguja.setAttribute('stroke-width', '3');
    aguja.setAttribute('stroke-linecap', 'round');
    svg.append(aguja);
  }
  return h('div', { class: 'gauge' }, svg, h('div', { class: 'gauge-valor' }, cumplimiento == null ? '—' : pct(cumplimiento)), h('div', { class: 'gauge-sub' }, subtitulo));
}
