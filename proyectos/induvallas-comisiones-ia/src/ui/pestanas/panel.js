/**
 * Pestaña Panel ejecutivo: veredicto del cierre, tendencia devengado vs liberado, mix por línea y canal,
 * ranking de vendedores y alertas enlazadas al cálculo.
 * @module ui/pestanas/panel
 */
import { h, limpiar, tarjeta, tabla, badge, vacio, poner } from '../dom.js';
import { usd, moneda, pct, periodoLargo, periodoCorto, nombreLinea, nombreCanal } from '../format.js';
import { estado, on, nombreVendedor, resultadoPeriodo, irA, periodoAprobado, esDemo } from '../estado.js';
import { tarjetaGuionDemo } from '../componentes/ayuda.js';
import { barras, PALETA } from '../componentes/graficos.js';
import { CATALOGO_ALERTAS } from '../../engine/alertas.js';

let refs = null;
let gTendencia = null;
let gMix = null;

export function veredictoPeriodo(periodo = estado.periodo) {
  const per = resultadoPeriodo(periodo);
  if (!per) return { clase: 'observaciones', titulo: 'Sin cálculo', detalle: 'Cargue datos para evaluar el cierre.' };
  const alertas = estado.resultado.alertas.filter((a) => a.periodo === periodo);
  const criticas = alertas.filter((a) => a.severidad === 'critico');
  const advertencias = alertas.filter((a) => a.severidad === 'advertencia');
  const vendedores = Object.values(per.vendedores);
  const enMeta = vendedores.filter((l) => l.tramo?.cumplimiento >= 1).length;
  const base = `${vendedores.length} vendedores, ${enMeta} en meta · liquidable ${usd(per.totales.liquidable)} · retenido ${usd(per.totales.retenido)}`;
  if (criticas.length) return { clase: 'incidencias', titulo: 'Cierre con incidencias', detalle: `${criticas.length} alerta${criticas.length === 1 ? '' : 's'} crítica${criticas.length === 1 ? '' : 's'} (${[...new Set(criticas.map((a) => a.codigo))].join(', ')}) y ${advertencias.length} advertencias. ${base}.` };
  if (advertencias.length) return { clase: 'observaciones', titulo: 'Cierre con observaciones', detalle: `${advertencias.length} advertencia${advertencias.length === 1 ? '' : 's'} sin incidencias críticas. ${base}.` };
  return { clase: 'listo', titulo: 'Cierre listo', detalle: `Sin alertas críticas ni advertencias. ${base}.` };
}

function actualizar() {
  if (!refs) return;
  const per = resultadoPeriodo();
  limpiar(refs.veredicto);
  limpiar(refs.ranking);
  limpiar(refs.alertas);
  limpiar(refs.mixTabla);
  if (!per) {
    poner(refs.veredicto, vacio('Sin datos. Cargue la demostración o una plantilla en la pestaña Datos.'));
    return;
  }
  limpiar(refs.guion);
  if (esDemo()) poner(refs.guion, tarjetaGuionDemo());
  const v = veredictoPeriodo();
  refs.veredicto.className = `veredicto veredicto-${v.clase}`;
  poner(refs.veredicto, h('div', null, h('div', { class: 'eyebrow' }, `Veredicto del cierre · ${periodoLargo(estado.periodo)}`), h('div', { class: 'veredicto-titulo' }, v.titulo)), h('div', { class: 'veredicto-detalle' }, v.detalle), periodoAprobado() ? badge('aprobado', 'badge-bloqueado') : per.enCurso ? badge('en curso', 'badge-info') : badge('abierto', 'badge-info'));

  const periodos = estado.resultado.meta.periodos;
  const etiquetas = periodos.map((p) => periodoCorto(p));
  const dev = periodos.map((p) => estado.resultado.periodos[p].totales.devengado + estado.resultado.periodos[p].totales.bonos);
  const lib = periodos.map((p) => estado.resultado.periodos[p].totales.liberadoPeriodo + estado.resultado.periodos[p].totales.liberadoCartera);
  const series = [{ nombre: 'Devengado (con bonos)', datos: dev, color: PALETA.azul }, { nombre: 'Liberado (período y cartera)', datos: lib, color: PALETA.mag }];
  if (!gTendencia) {
    gTendencia = barras({ etiquetas, series, alto: 240 });
    poner(refs.tendencia, gTendencia.el);
  } else gTendencia.actualizar(etiquetas, series);

  const mix = {};
  for (const l of Object.values(per.vendedores)) for (const d of l.lineas.find((x) => x.codigo === 'L1').detalle) {
    mix[d.linea] = mix[d.linea] || { directo: 0, agencia: 0 };
    mix[d.linea][d.canal] += d.base;
  }
  const lineas = ['vallas', 'led', 'retail'];
  const seriesMix = [{ nombre: 'Directo', datos: lineas.map((l) => mix[l]?.directo || 0), color: PALETA.azul }, { nombre: 'Agencia', datos: lineas.map((l) => mix[l]?.agencia || 0), color: PALETA.mag }];
  if (!gMix) {
    gMix = barras({ etiquetas: lineas.map(nombreLinea), series: seriesMix, horizontal: true, apilado: true, alto: 170 });
    poner(refs.mix, gMix.el);
  } else gMix.actualizar(lineas.map(nombreLinea), seriesMix);
  const totalBase = per.totales.base || 1;
  poner(refs.mixTabla, tabla({ compacta: true, ordenable: false, columnas: [{ clave: 'linea', titulo: 'Línea' }, { clave: 'directo', titulo: 'Directo', num: true, formato: (x) => moneda(x) }, { clave: 'agencia', titulo: 'Agencia', num: true, formato: (x) => moneda(x) }, { clave: 'total', titulo: 'Base', num: true, formato: (x) => moneda(x) }, { clave: 'part', titulo: 'Part.', num: true, formato: (x) => pct(x) }], filas: lineas.map((l) => ({ linea: nombreLinea(l), directo: mix[l]?.directo || 0, agencia: mix[l]?.agencia || 0, total: (mix[l]?.directo || 0) + (mix[l]?.agencia || 0), part: ((mix[l]?.directo || 0) + (mix[l]?.agencia || 0)) / totalBase })) }));

  const alertasPeriodo = estado.resultado.alertas.filter((a) => a.periodo === estado.periodo);
  const filas = Object.values(per.vendedores).map((l) => ({
    vendedorId: l.vendedorId,
    vendedor: nombreVendedor(l.vendedorId),
    cumplimiento: l.tramo?.cumplimiento ?? null,
    tramo: l.tramo?.tramoNombre || '—',
    tramoId: l.tramo?.tramoId,
    base: l.totales.base,
    devengado: l.totales.devengado + l.totales.bonos,
    liberado: l.totales.liberadoPeriodo + l.totales.liberadoCartera,
    retenido: l.totales.retenido,
    liquidable: l.totales.liquidable,
    alertas: alertasPeriodo.filter((a) => a.vendedorId === l.vendedorId).length,
  }));
  poner(refs.ranking, tabla({
    compacta: true,
    columnas: [
      { clave: 'vendedor', titulo: 'Vendedor' },
      { clave: 'cumplimiento', titulo: 'Cumplimiento', num: true, formato: (x) => pct(x) },
      { clave: 'tramo', titulo: 'Tramo', formato: (x, f) => badge(x, `badge-${f.tramoId || 't0'}`) },
      { clave: 'base', titulo: 'Base', num: true, formato: (x) => moneda(x) },
      { clave: 'devengado', titulo: 'Devengado', num: true, formato: (x) => moneda(x) },
      { clave: 'liberado', titulo: 'Liberado', num: true, formato: (x) => moneda(x) },
      { clave: 'retenido', titulo: 'Retenido', num: true, formato: (x) => moneda(x) },
      { clave: 'liquidable', titulo: 'Liquidable', num: true, formato: (x) => h('b', null, moneda(x)) },
      { clave: 'alertas', titulo: 'Alertas', num: true, formato: (x) => (x ? badge(String(x), 'badge-advertencia') : '—') },
    ],
    filas,
    ordenInicial: { clave: 'cumplimiento', desc: true },
    alHacerClic: (f) => irA('motor', { vendedorId: f.vendedorId }),
  }));

  const orden = { critico: 0, advertencia: 1, info: 2 };
  const lista = [...alertasPeriodo].sort((a, b) => orden[a.severidad] - orden[b.severidad] || a.codigo.localeCompare(b.codigo));
  if (!lista.length) poner(refs.alertas, vacio('Sin alertas en el período.'));
  for (const a of lista.slice(0, 60)) {
    const destino = a.codigo === 'A-03' || a.codigo === 'A-04' ? 'politica' : a.codigo === 'A-08' ? 'liquidacion' : 'motor';
    const sub = [a.vendedorId ? nombreVendedor(a.vendedorId) : null, a.factura ? `factura ${a.factura}` : a.ref ? `${a.tipo} ${a.ref}` : null, a.monto != null ? usd(Math.abs(a.monto)) : null, a.cumplimiento != null ? `cumplimiento ${pct(a.cumplimiento)}` : null, a.dias != null ? `${a.dias} días` : null, a.cobranza != null ? `cobranza ${pct(a.cobranza)}` : null].filter(Boolean).join(' · ');
    poner(refs.alertas, h('div', { class: 'alerta-item', role: 'button', tabindex: 0, onClick: () => irA(destino, { vendedorId: a.vendedorId || estado.vendedorId }) }, badge(a.codigo, `badge-${a.severidad}`), h('div', null, h('div', { class: 'alerta-titulo' }, a.titulo), h('div', { class: 'alerta-sub' }, sub)), h('span', { class: 'pequeno silencioso' }, a.regla)));
  }
  if (lista.length > 60) poner(refs.alertas, h('p', { class: 'ayuda' }, `${lista.length - 60} alertas más; véalas por vendedor en el Motor de cálculo.`));
}

function montar(cont) {
  refs = { veredicto: h('div', { class: 'veredicto' }), guion: h('div'), tendencia: h('div'), mix: h('div'), mixTabla: h('div'), ranking: h('div'), alertas: h('div', { class: 'alertas-lista' }) };
  gTendencia = null;
  gMix = null;
  poner(cont,
    refs.veredicto,
    refs.guion,
    h('div', { class: 'rejilla rejilla-2' },
      tarjeta('Tendencia mensual: devengado frente a liberado', refs.tendencia, { subtitulo: 'Todos los vendedores, en USD' }),
      tarjeta('Mix por línea y canal', [refs.mix, refs.mixTabla], { subtitulo: 'Base comisionable del período' })
    ),
    h('div', { class: 'rejilla rejilla-31' },
      tarjeta('Ranking de vendedores', refs.ranking, { subtitulo: 'Clic en un vendedor para abrir su cálculo' }),
      tarjeta('Alertas del motor de control', refs.alertas, { subtitulo: `${Object.keys(CATALOGO_ALERTAS).length} tipos de control; clic para ir al cálculo` })
    )
  );
  actualizar();
}

on('resultado', () => refs && estado.pestana === 'panel' && actualizar());
on('periodo', () => refs && estado.pestana === 'panel' && actualizar());

export default { id: 'panel', titulo: 'Panel ejecutivo', montar, actualizar, desmontar() { refs = null; gTendencia = null; gMix = null; } };
