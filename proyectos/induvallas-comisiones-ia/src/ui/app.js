/**
 * Arranque de kam. Comisiones IA: cabecera institucional, header-strip con KPI, pestañas, selección de rol,
 * apertura del almacén y cálculo. Un solo archivo HTML, sin red.
 * @module ui/app
 */
import { h, limpiar, badge, boton, select, input, toast, modal, campo, poner } from './dom.js';
import { usd, moneda, pct, fecha, periodoLargo, periodoCorto, entero, variacion, ahoraISO } from './format.js';
import { estado, on, ROLES, puede, hayDatos, esDemo, periodos, resultadoPeriodo, recalcular, seleccionarPeriodo, irA, periodoAprobado } from './estado.js';
import { termino, mostrarGlosario, mostrarRecorrido, recorridoVisto, marcarVisitada } from './guia.js';
import { tarjetaAyuda, stepper } from './componentes/ayuda.js';
import { cambiarFechaReferencia } from './acciones.js';
import { abrirAlmacen } from '../data/db.js';
import { Repositorio } from '../data/repositorio.js';
import { CONTROL, esquemaDemo, politicasDemo } from '../seed/defaults.js';
import { cargarDatosDemo, autocargaDemoActiva } from './acciones.js';

/** Bandera de build (package.json → modoDemo): en la versión de demostración los datos ficticios se cargan solos al abrir sin datos. */
const MODO_DEMO = typeof __MODO_DEMO__ !== 'undefined' ? __MODO_DEMO__ : true;
import { anteriorPeriodo } from '../engine/dates.js';
import panel from './pestanas/panel.js';
import datos from './pestanas/datos.js';
import tabla from './pestanas/tabla.js';
import politica from './pestanas/politica.js';
import motor from './pestanas/motor.js';
import liquidacion from './pestanas/liquidacion.js';
import asistente from './pestanas/asistente.js';

const PESTANAS = [panel, datos, tabla, politica, motor, liquidacion, asistente];
const ui = {};
let pestanaActiva = null;

function marca() {
  return h('div', { class: 'marca' }, h('b', null, 'kam'), h('span', { class: 'punto' }, '.'), h('span', { class: 'analytica' }, ' Analytica'), h('span', { class: 'producto' }, `Comisiones IA · INDUVALLAS · V.${estado.version}`));
}

function renderCabecera() {
  limpiar(ui.cabeceraMeta);
  poner(ui.cabeceraMeta, 
    esDemo() ? h('span', { class: 'demo' }, 'Datos ficticios · modo demostración') : null,
    h('span', null, `Referencia ${fecha(estado.hoy)}`),
    h('span', { class: 'rol' }, estado.rol || 'Sin rol'),
    h('button', { type: 'button', onClick: () => mostrarRecorrido() }, 'Guía paso a paso'),
    h('button', { type: 'button', onClick: () => mostrarGlosario() }, 'Glosario'),
    h('button', { type: 'button', onClick: cambiarRol }, 'Cambiar rol')
  );
}

function kpis() {
  const per = resultadoPeriodo();
  if (!per) return [];
  const prev = resultadoPeriodo(anteriorPeriodo(estado.periodo));
  const t = per.totales;
  const tp = prev?.totales;
  const vend = Object.values(per.vendedores);
  const enMeta = vend.filter((l) => l.tramo?.cumplimiento >= 1).length;
  const enMetaPrev = prev ? Object.values(prev.vendedores).filter((l) => l.tramo?.cumplimiento >= 1).length : null;
  const alertas = estado.resultado.alertas.filter((a) => a.periodo === estado.periodo).length;
  const alertasPrev = prev ? estado.resultado.alertas.filter((a) => a.periodo === anteriorPeriodo(estado.periodo)).length : null;
  const pctBase = t.base ? (t.devengado + t.bonos) / t.base : null;
  const pctBasePrev = tp?.base ? (tp.devengado + tp.bonos) / tp.base : null;
  return [
    { etiqueta: 'Facturación neta', valor: usd(t.valorNeto), delta: variacion(t.valorNeto, tp?.valorNeto) },
    { etiqueta: termino('baseComisionable'), valor: usd(t.base), delta: variacion(t.base, tp?.base) },
    { etiqueta: termino('devengado'), valor: usd(t.devengado + t.bonos), delta: variacion(t.devengado + t.bonos, tp ? tp.devengado + tp.bonos : null) },
    { etiqueta: termino('liberado'), valor: usd(t.liberadoPeriodo + t.liberadoCartera), delta: variacion(t.liberadoPeriodo + t.liberadoCartera, tp ? tp.liberadoPeriodo + tp.liberadoCartera : null), protagonista: true },
    { etiqueta: termino('retenido'), valor: usd(t.retenido), delta: variacion(t.retenido, tp?.retenido), invertido: true },
    { etiqueta: termino('caducado'), valor: usd(t.caducadoPeriodo), delta: variacion(t.caducadoPeriodo, tp?.caducadoPeriodo), invertido: true },
    { etiqueta: '% comisión / base', valor: pct(pctBase, 2), delta: pctBase != null && pctBasePrev != null ? pctBase - pctBasePrev : null, puntos: true },
    { etiqueta: 'Vendedores en meta', valor: `${enMeta} / ${vend.length}`, delta: enMetaPrev != null ? enMeta - enMetaPrev : null, absoluto: true },
    { etiqueta: 'Alertas', valor: entero(alertas), delta: alertasPrev != null ? alertas - alertasPrev : null, absoluto: true, invertido: true },
  ];
}

function renderHeaderStrip() {
  limpiar(ui.metadatos);
  limpiar(ui.kpiFila);
  limpiar(ui.scope);
  const per = resultadoPeriodo();
  if (per) {
    poner(ui.metadatos, 
      h('span', null, 'Período ', h('b', null, periodoLargo(estado.periodo)), ' · corte ', h('b', null, fecha(per.fechaCorte))),
      h('span', null, 'Esquema ', h('b', null, `v${per.esquemaVersion || '—'}`), ' · política ', h('b', null, per.politicas.map((p) => `v${p.version}`).join(', ') || '—')),
      h('span', null, 'Estado ', periodoAprobado() ? badge('aprobado y bloqueado', 'badge-bloqueado') : per.enCurso ? badge('en curso', 'badge-info') : badge('abierto', 'badge-info')),
      h('span', null, 'Cálculo en ', h('b', null, `${estado.resultado.meta.ms} ms`), ` · ${entero(estado.dataset.facturas.length)} facturas`)
    );
    for (const k of kpis()) {
      let delta = null;
      if (k.delta != null) {
        const positivo = k.delta > 0;
        const bueno = k.invertido ? !positivo : positivo;
        const texto = k.absoluto ? `${positivo ? '+' : ''}${k.delta}` : k.puntos ? `${positivo ? '+' : ''}${(k.delta * 100).toFixed(2).replace('.', ',')} pp` : `${positivo ? '+' : ''}${pct(k.delta)}`;
        delta = h('div', { class: `kpi-delta ${k.delta === 0 ? '' : bueno ? 'pos' : 'neg'}` }, `${texto} vs. ${periodoCorto(anteriorPeriodo(estado.periodo))}`);
      } else delta = h('div', { class: 'kpi-delta' }, 'sin período anterior');
      poner(ui.kpiFila, h('div', { class: `kpi ${k.protagonista ? 'kpi-protagonista' : ''}` }, h('div', { class: 'kpi-etiqueta' }, k.etiqueta), h('div', { class: 'kpi-valor' }, k.valor), delta));
    }
  } else {
    poner(ui.metadatos, h('span', null, estado.errores ? `Error de parámetros: ${estado.errores[0]}` : 'Sin datos cargados'));
  }
  const lista = periodos();
  poner(ui.scope, 
    h('label', null, 'Período ', select(lista.map((p) => ({ valor: p, texto: `${periodoLargo(p)}${estado.dataset?.cierres?.[p]?.snapshot ? ' · aprobado' : ''}` })), estado.periodo, (v) => seleccionarPeriodo(v), { 'aria-label': 'Período' })),
    h('label', null, 'Fecha de referencia ', input('date', estado.hoy, null, { 'aria-label': 'Fecha de referencia', onChange: (e) => cambiarFechaReferencia(e.target.value), disabled: !puede('referencia') })),
    h('span', null, `Rol: ${estado.rol}`),
    estado.almacen?.advertencia ? badge(estado.almacen.advertencia, 'badge-advertencia') : null
  );
}

function renderPestanas() {
  limpiar(ui.pestanas);
  const criticas = estado.resultado ? estado.resultado.alertas.filter((a) => a.periodo === estado.periodo && a.severidad === 'critico').length : 0;
  const total = estado.resultado ? estado.resultado.alertas.filter((a) => a.periodo === estado.periodo).length : 0;
  for (const p of PESTANAS) {
    const b = h('button', { type: 'button', class: 'pestana-boton', role: 'tab', 'aria-selected': estado.pestana === p.id ? 'true' : 'false', 'aria-controls': `panel-${p.id}`, id: `tab-${p.id}`, onClick: () => irA(p.id) }, p.titulo);
    if (p.id === 'panel' && total) b.append(h('span', { class: `n ${criticas ? 'crit' : ''}` }, String(total)));
    poner(ui.pestanas, b);
  }
  ui.pestanas.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const idx = PESTANAS.findIndex((p) => p.id === estado.pestana);
    const next = PESTANAS[(idx + (e.key === 'ArrowRight' ? 1 : PESTANAS.length - 1)) % PESTANAS.length];
    irA(next.id);
    ui.pestanas.querySelector(`#tab-${next.id}`)?.focus();
  });
}

function destruirGraficos(cont) {
  if (typeof Chart === 'undefined') return;
  for (const c of cont.querySelectorAll('canvas')) Chart.getChart(c)?.destroy();
}

function montarPestana(extra = {}) {
  const p = PESTANAS.find((x) => x.id === estado.pestana) || panel;
  if (pestanaActiva && pestanaActiva !== p) pestanaActiva.desmontar?.();
  destruirGraficos(ui.panelPestana);
  limpiar(ui.panelPestana);
  const cont = h('div', { class: 'pestana-panel', id: `panel-${p.id}`, role: 'tabpanel', 'aria-labelledby': `tab-${p.id}` });
  poner(ui.panelPestana, cont);
  poner(cont, tarjetaAyuda(p.id));
  if (!hayDatos() && p.id !== 'datos') {
    poner(cont, h('div', { class: 'vacio' }, h('p', null, 'No hay datos cargados.'), boton('Ir a Datos', () => irA('datos', { resaltar: 'tarjeta-carga' }), { tipo: 'primario' })));
    pestanaActiva = null;
    ui.stepper.actualizar();
    return;
  }
  p.montar(cont, extra);
  pestanaActiva = p;
  marcarVisitada(p.id);
  renderPestanas();
  ui.stepper.actualizar();
  if (extra.resaltar) {
    const objetivo = document.getElementById(extra.resaltar);
    if (objetivo) {
      objetivo.classList.add('resaltar');
      objetivo.scrollIntoView({ block: 'center', behavior: 'auto' });
      setTimeout(() => objetivo.classList.remove('resaltar'), 3500);
    }
  }
}

function renderPie() {
  limpiar(ui.pie);
  poner(ui.pie, 
    h('p', null, h('b', null, 'kam-Analytica S.A.S.'), ' · RUC 1793220761001 · Desarrollado para INDUVALLAS · ', esDemo() ? 'Datos ficticios en modo demostración' : 'Uso interno del Departamento Financiero de INDUVALLAS'),
    h('p', null, 'Confidencial. Los datos de compensación son datos personales protegidos por la LOPDP. Esta herramienta funciona sin conexión: ninguna información sale de este navegador salvo por exportación explícita del usuario.'),
    h('p', null, `kam. Comisiones IA · V.${estado.version} · build ${typeof __FECHA_BUILD__ !== 'undefined' ? __FECHA_BUILD__ : 'dev'} · Chart.js 4.5.1 (MIT) · SheetJS CE 0.18.5 (Apache-2.0)`)
  );
}

function elegirRol(forzar = false) {
  return new Promise((resolver) => {
    const guardado = sessionStorage.getItem('kam.rol');
    if (!forzar && guardado && ROLES.includes(guardado)) {
      estado.rol = guardado;
      resolver(guardado);
      return;
    }
    const descripciones = { Finanzas: 'Carga datos, calcula, valida liquidaciones y registra ajustes.', 'Gerencia Financiera': 'Todo lo anterior más aprobar, reabrir períodos y generar el rol.', Consulta: 'Solo lectura: revisa cálculos, alertas y bitácora.' };
    const m = modal({
      titulo: 'Quién está usando la herramienta',
      cerrable: false,
      cuerpo: [h('p', { class: 'ayuda' }, 'El rol define qué acciones se habilitan y queda registrado en la bitácora de cada operación. No es una autenticación: la herramienta se usa en el equipo del Departamento Financiero.'), h('div', { class: 'roles' }, ROLES.map((r) => h('button', { type: 'button', class: 'rol-opcion', onClick: () => { estado.rol = r; sessionStorage.setItem('kam.rol', r); m.cerrar(); resolver(r); } }, h('b', null, r), h('span', { class: 'ayuda' }, descripciones[r]))))],
    });
  });
}

async function cambiarRol() {
  const anterior = estado.rol;
  await elegirRol(true);
  if (estado.rol !== anterior) await estado.repo?.registrar('Cambio de rol', 'Sesión', `${anterior} → ${estado.rol}`);
  renderTodo();
  montarPestana();
}

function shell() {
  const app = document.getElementById('app');
  limpiar(app);
  ui.cabeceraMeta = h('div', { class: 'cabecera-meta' });
  ui.metadatos = h('div', { class: 'metadatos' });
  ui.kpiFila = h('div', { class: 'kpi-fila' });
  ui.scope = h('div', { class: 'scope-strip' });
  ui.pestanas = h('div', { class: 'pestanas-int', role: 'tablist', 'aria-label': 'Secciones' });
  ui.stepper = stepper();
  ui.panelPestana = h('div');
  ui.contenido = h('main', { class: 'contenido' }, ui.stepper.el, ui.panelPestana);
  ui.pie = h('footer', { class: 'pie' });
  app.append(
    h('header', { class: 'cabecera' }, h('div', { class: 'cabecera-int' }, marca(), ui.cabeceraMeta)),
    h('div', { class: 'header-strip' }, h('div', { class: 'header-strip-int' }, h('div', { class: 'titulo-fila' }, h('div', null, h('div', { class: 'eyebrow' }, 'kam. Comisiones IA · INDUVALLAS'), h('h1', null, 'Cálculo, liquidación y auditoría de comisiones de ventas')), ui.metadatos), ui.kpiFila, ui.scope)),
    h('nav', { class: 'pestanas' }, ui.pestanas),
    ui.contenido,
    ui.pie
  );
}

function renderTodo() {
  renderCabecera();
  renderHeaderStrip();
  renderPestanas();
  renderPie();
}

async function iniciar() {
  shell();
  await elegirRol();
  renderCabecera();
  try {
    estado.almacen = await abrirAlmacen();
    estado.repo = new Repositorio(estado.almacen, { ahora: ahoraISO, usuario: () => estado.rol || 'Sin rol' });
    estado.dataset = await estado.repo.cargarDataset();
    if (!estado.dataset.esquemas.length) estado.dataset.esquemas = [esquemaDemo()];
    if (!estado.dataset.politicas.length) estado.dataset.politicas = politicasDemo();
    if (!Object.keys(estado.dataset.control || {}).length) estado.dataset.control = { ...CONTROL };
    estado.hoy = (await estado.repo.leerMeta('hoy')) || estado.hoy;
    estado.origen = await estado.repo.leerMeta('origen');
    estado.conciliacion = (await estado.repo.leerMeta('conciliacion')) || {};
    await estado.repo.registrar('Inicio de sesión', 'Sesión', `Rol ${estado.rol} · almacén ${estado.almacen.tipo}`);
    if (MODO_DEMO && !hayDatos() && autocargaDemoActiva()) await cargarDatosDemo({ automatica: true });
  } catch (e) {
    console.error(e);
    toast(`No se pudo abrir el almacén de datos: ${e.message}`, 'error');
  }
  if (hayDatos()) recalcular({ conservarPeriodo: false });
  else estado.pestana = 'datos';
  renderTodo();
  montarPestana();
  if (estado.almacen?.advertencia) toast(estado.almacen.advertencia, 'advertencia', 8000);
  if (!recorridoVisto()) mostrarRecorrido();
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && !/input|textarea|select/i.test(e.target?.tagName || '')) mostrarRecorrido();
  });
}

on('resultado', () => {
  renderCabecera();
  renderHeaderStrip();
  renderPestanas();
  renderPie();
  ui.stepper.actualizar();
  if (!pestanaActiva || !hayDatos()) montarPestana();
});
on('periodo', () => {
  renderHeaderStrip();
  renderPestanas();
  ui.stepper.actualizar();
});
on('referencia', () => {
  renderCabecera();
  renderHeaderStrip();
});
on('pestana', ({ extra } = {}) => {
  montarPestana(extra || {});
  if (estado.pestana !== 'motor' && estado.pestana !== 'panel') return;
  window.scrollTo({ top: 0, behavior: 'auto' });
});
on('vendedor', () => {});

window.addEventListener('DOMContentLoaded', iniciar);
if (document.readyState !== 'loading') iniciar();

window.ComisionesIA = { estado, recalcular, irA, version: estado.version };
