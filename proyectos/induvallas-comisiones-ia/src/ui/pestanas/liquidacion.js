/**
 * Pestaña Liquidación y auditoría: rol del período, ajustes, flujo de estados, bloqueo, exportación, controles de cierre,
 * bitácora e impresión.
 * @module ui/pestanas/liquidacion
 */
import { h, limpiar, tarjeta, tabla, badge, boton, campo, input, select, toast, confirmar, pedirMotivo, descargar, vacio, poner } from '../dom.js';
import { usd, moneda, monedaSigno, pct, periodoLargo, fecha, fechaHora, ESTADO_LIQ } from '../format.js';
import { estado, on, puede, nombreVendedor, resultadoPeriodo, periodoAprobado, estadoLiquidacion, irA, vendedores, esDemo } from '../estado.js';
import { rolHistoricoDemo } from '../../seed/demo.js';
import { mutar } from '../acciones.js';
import { cargarXLSX } from '../../data/xlsx.js';
import { libroRol, filasRol, filasDetalle, aCSV } from '../../data/exportar.js';
import { libroABytes } from '../../data/plantilla.js';
import { periodoDeFecha } from '../../engine/dates.js';
import { plantillaContraste, leerContraste, contrastar } from '../../data/contraste.js';
import { leerArchivo, selectorArchivo } from '../dom.js';

let refs = null;
let filtroBitacora = { entidad: '', texto: '' };

function controlesCierre(per) {
  const ds = estado.dataset;
  const controles = [];
  const ledgers = Object.values(per.vendedores);
  const sumaRol = ledgers.reduce((s, l) => s + l.totales.liquidable, 0);
  const sumaDetalle = ledgers.reduce((s, l) => {
    const L = Object.fromEntries(l.lineas.map((x) => [x.codigo, x]));
    return s + L.L9.valores.liquidable;
  }, 0);
  const cuadre = ledgers.every((l) => {
    const L = Object.fromEntries(l.lineas.map((x) => [x.codigo, x]));
    return L.L9.valores.netoAntesTope === L.L4.monto + L.L5.monto + L.L7.monto + L.L8.monto && L.L4.valores.facturas === l.facturas.filter((r) => r.esDelPeriodo).reduce((a, r) => a + r.liberadoPeriodo, 0);
  });
  controles.push({ ok: cuadre && sumaRol === sumaDetalle && sumaRol === per.totales.liquidable, texto: `Suma del rol (${usd(per.totales.liquidable)}) igual a la suma del detalle por factura y de las líneas del ledger` });
  const facturas = new Map(ds.facturas.map((f) => [f.numero, f]));
  const cobradoPor = {};
  for (const c of ds.cobros) cobradoPor[c.facturaNumero] = (cobradoPor[c.facturaNumero] || 0) + c.monto;
  const exceso = Object.entries(cobradoPor).filter(([n, m]) => facturas.has(n) && m > facturas.get(n).valorFacturado + 0.005);
  controles.push({ ok: exceso.length === 0, texto: exceso.length ? `${exceso.length} factura(s) con cobros mayores que su valor: ${exceso.slice(0, 5).map(([n]) => n).join(', ')}` : 'Cobros conciliados: ninguna factura cobrada por encima de su valor' });
  const ncSin = ds.notasCredito.filter((n) => !facturas.has(n.facturaNumero));
  const ncPeriodo = ds.notasCredito.filter((n) => periodoDeFecha(n.fecha) === estado.periodo);
  controles.push({ ok: ncSin.length === 0, texto: ncSin.length ? `${ncSin.length} nota(s) de crédito sin factura asociada` : `Notas de crédito aplicadas: ${ncPeriodo.length} con fecha en el período, todas con factura` });
  const anteriores = estado.resultado.meta.periodos.filter((p) => p < estado.periodo);
  const abiertos = anteriores.filter((p) => !estado.dataset.cierres[p]?.snapshot);
  controles.push({ ok: abiertos.length === 0, texto: abiertos.length ? `Períodos anteriores sin aprobar: ${abiertos.join(', ')}` : 'Todos los períodos anteriores están aprobados y bloqueados' });
  const criticas = estado.resultado.alertas.filter((a) => a.periodo === estado.periodo && a.severidad === 'critico');
  controles.push({ ok: criticas.length === 0, texto: criticas.length ? `${criticas.length} alerta(s) crítica(s) en el período: ${[...new Set(criticas.map((a) => a.codigo))].join(', ')}` : 'Sin alertas críticas en el período', informativo: true });
  return controles;
}

function renderRol() {
  const per = resultadoPeriodo();
  limpiar(refs.rol);
  limpiar(refs.estadoPeriodo);
  if (!per) {
    poner(refs.rol, vacio('Sin cálculo para el período.'));
    return;
  }
  const aprobado = periodoAprobado();
  poner(refs.estadoPeriodo, 
    h('h2', null, `Rol de comisiones · ${periodoLargo(estado.periodo)}`),
    aprobado ? badge(`aprobado el ${fecha(estado.dataset.cierres[estado.periodo].fecha)} por ${estado.dataset.cierres[estado.periodo].autor}`, 'badge-bloqueado') : badge(per.enCurso ? 'en curso' : 'abierto', 'badge-info'),
    h('span', { class: 'ayuda' }, `Esquema v${per.esquemaVersion || '—'} · políticas ${per.politicas.map((p) => `v${p.version}`).join(', ')} · corte ${fecha(per.fechaCorte)}`)
  );
  const filas = Object.values(per.vendedores).map((l) => ({
    vendedorId: l.vendedorId,
    vendedor: nombreVendedor(l.vendedorId),
    cumplimiento: l.tramo?.cumplimiento ?? null,
    tramo: l.tramo?.tramoNombre || '—',
    tramoId: l.tramo?.tramoId,
    base: l.totales.base,
    devengado: l.totales.devengado,
    bonos: l.totales.bonos,
    liberadoPeriodo: l.totales.liberadoPeriodo,
    liberadoCartera: l.totales.liberadoCartera,
    retenido: l.totales.retenido,
    caducado: l.totales.caducadoPeriodo,
    clawback: -(l.totales.clawback + l.totales.saldoAnterior),
    ajustes: l.totales.ajustes,
    neto: l.totales.netoAntesTope,
    excedente: l.totales.excedente,
    liquidable: l.totales.liquidable,
    estado: estadoLiquidacion(estado.periodo, l.vendedorId),
  }));
  const tot = per.totales;
  poner(refs.rol, 
    tabla({
      compacta: true,
      columnas: [
        { clave: 'vendedor', titulo: 'Vendedor' },
        { clave: 'cumplimiento', titulo: 'Cumpl.', num: true, formato: (v) => pct(v) },
        { clave: 'tramo', titulo: 'Tramo', formato: (v, f) => badge(v, `badge-${f.tramoId || 't0'}`) },
        { clave: 'base', titulo: 'Base', num: true, formato: (v) => moneda(v) },
        { clave: 'devengado', titulo: 'Devengado', num: true, formato: (v) => moneda(v) },
        { clave: 'bonos', titulo: 'Bonos', num: true, formato: (v) => moneda(v) },
        { clave: 'liberadoPeriodo', titulo: 'Lib. período', num: true, formato: (v) => moneda(v) },
        { clave: 'liberadoCartera', titulo: 'Lib. cartera', num: true, formato: (v) => moneda(v) },
        { clave: 'retenido', titulo: 'Retenido', num: true, formato: (v) => moneda(v) },
        { clave: 'caducado', titulo: 'Caducado', num: true, formato: (v) => moneda(v) },
        { clave: 'clawback', titulo: 'Clawback y saldo', num: true, formato: (v) => monedaSigno(v) },
        { clave: 'ajustes', titulo: 'Ajustes', num: true, formato: (v) => monedaSigno(v) },
        { clave: 'neto', titulo: 'Neto', num: true, formato: (v) => moneda(v) },
        { clave: 'excedente', titulo: 'Exc. tope', num: true, formato: (v) => moneda(v) },
        { clave: 'liquidable', titulo: 'Liquidable', num: true, formato: (v) => h('b', null, moneda(v)) },
        { clave: 'estado', titulo: 'Estado', formato: (v) => badge(ESTADO_LIQ[v] || v, v === 'en_rol' ? 'badge-ok' : v === 'aprobada' ? 'badge-bloqueado' : v === 'validada' ? 'badge-info' : 'badge-neutro') },
      ],
      filas,
      totales: { vendedor: `Total (${filas.length})`, base: tot.base, devengado: tot.devengado, bonos: tot.bonos, liberadoPeriodo: tot.liberadoPeriodo, liberadoCartera: tot.liberadoCartera, retenido: tot.retenido, caducado: tot.caducadoPeriodo, clawback: -(tot.clawback + tot.saldoAnterior), ajustes: tot.ajustes, neto: tot.netoAntesTope, excedente: tot.excedente, liquidable: tot.liquidable },
      alHacerClic: (f) => irA('motor', { vendedorId: f.vendedorId }),
      ordenInicial: { clave: 'vendedor', desc: false },
    })
  );
}

function renderFlujo() {
  const aprobado = periodoAprobado();
  const per = resultadoPeriodo();
  limpiar(refs.flujo);
  if (!per) return;
  const estados = Object.keys(per.vendedores).map((v) => estadoLiquidacion(estado.periodo, v));
  const todasValidadas = estados.every((e) => e !== 'calculada');
  const enRol = estados.length && estados.every((e) => e === 'en_rol');
  const pasos = h('div', { class: 'acciones' },
    badge(`1 · Calculada`, 'badge-info'), '→',
    badge(`2 · Validada ${estados.filter((e) => e !== 'calculada').length}/${estados.length}`, todasValidadas ? 'badge-ok' : 'badge-neutro'), '→',
    badge('3 · Aprobada y bloqueada', aprobado ? 'badge-ok' : 'badge-neutro'), '→',
    badge('4 · En rol', enRol ? 'badge-ok' : 'badge-neutro')
  );
  const acciones = h('div', { class: 'acciones', style: { marginTop: '8px' } });
  if (!aprobado) {
    acciones.append(boton('Validar todos los vendedores', () => mutar(async (repo) => { for (const v of Object.keys(per.vendedores)) await repo.cambiarEstadoLiquidacion(estado.periodo, v, 'validada'); }, 'Liquidaciones validadas'), { deshabilitado: !puede('validar') || per.enCurso, titulo: per.enCurso ? 'El período está en curso' : null }));
    acciones.append(boton('Aprobar y bloquear el período', async () => {
      const controles = controlesCierre(per);
      const fallos = controles.filter((c) => !c.ok && !c.informativo);
      const ok = await confirmar('Aprobar período', `${fallos.length ? `Hay ${fallos.length} control(es) de cierre sin cumplir. ` : ''}Al aprobar, ${periodoLargo(estado.periodo)} queda bloqueado con el cálculo actual como snapshot; cambios posteriores exigirán reabrir con motivo (R-07).`, { textoConfirmar: 'Aprobar' });
      if (!ok) return;
      await mutar(async (repo) => repo.aprobarPeriodo(estado.periodo, per), `Período ${estado.periodo} aprobado y bloqueado`);
    }, { tipo: 'primario', deshabilitado: !puede('aprobar') || per.enCurso || !todasValidadas, titulo: !todasValidadas ? 'Primero valide todas las liquidaciones' : per.enCurso ? 'El período está en curso' : null }));
  } else {
    acciones.append(boton('Generar rol', () => mutar(async (repo) => repo.generarRol(estado.periodo), 'Rol generado'), { tipo: 'primario', deshabilitado: !puede('rol') || enRol }));
    acciones.append(boton('Reabrir período', async () => {
      const motivo = await pedirMotivo('Reabrir período', `Reabrir ${periodoLargo(estado.periodo)} elimina el snapshot aprobado y recalcula con los datos actuales (R-07).`, { textoConfirmar: 'Reabrir' });
      if (!motivo) return;
      await mutar(async (repo) => repo.reabrirPeriodo(estado.periodo, motivo), `Período ${estado.periodo} reabierto`);
    }, { tipo: 'peligro', deshabilitado: !puede('reabrir') }));
  }
  acciones.append(
    boton('Exportar Excel (rol y detalle)', exportarExcel),
    boton('CSV rol', () => descargar(`Rol_${estado.periodo}.csv`, aCSV(filasRol(per, estado.dataset)), 'text/csv;charset=utf-8')),
    boton('CSV detalle', () => descargar(`Detalle_${estado.periodo}.csv`, aCSV(filasDetalle(per, estado.dataset)), 'text/csv;charset=utf-8')),
    boton('Imprimir rol', () => window.print())
  );
  poner(refs.flujo, pasos, acciones);
}

async function exportarExcel() {
  try {
    const XLSX = await cargarXLSX();
    const bytes = libroABytes(XLSX, libroRol(XLSX, estado.resultado, estado.periodo, estado.dataset));
    descargar(`Rol_Comisiones_${estado.periodo}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await estado.repo.registrar('Exportación de rol', 'Liquidacion', `Rol y detalle de ${estado.periodo} exportados a Excel`, { periodo: estado.periodo });
    renderBitacora();
  } catch (e) {
    toast(`No se pudo exportar: ${e.message}`, 'error');
  }
}

function renderAjustes() {
  limpiar(refs.ajustes);
  const aprobado = periodoAprobado();
  const lista = (estado.dataset.ajustes || []).filter((a) => a.periodo === estado.periodo);
  const monto = input('number', '', null, { step: '0.01', placeholder: '−25,50 o 120', 'aria-label': 'Monto' });
  const motivo = input('text', '', null, { placeholder: 'Motivo obligatorio', 'aria-label': 'Motivo' });
  const vend = select(vendedores().map((v) => ({ valor: v.id, texto: v.nombre })), estado.vendedorId, null, { 'aria-label': 'Vendedor' });
  const form = h('div', { class: 'campos-fila' },
    campo('Vendedor', vend), campo('Monto (USD, con signo)', monto), campo('Motivo', motivo),
    boton('Registrar ajuste', async () => {
      const m = Number(String(monto.value).replace(',', '.'));
      if (!Number.isFinite(m) || m === 0) return toast('Indique un monto distinto de cero', 'advertencia');
      if (motivo.value.trim().length < 8) return toast('El motivo debe tener al menos 8 caracteres (R-06)', 'advertencia');
      await mutar(async (repo) => repo.guardarAjuste({ periodo: estado.periodo, vendedorId: vend.value, monto: Math.round(m * 100) / 100, motivo: motivo.value.trim() }), 'Ajuste registrado');
    }, { tipo: 'primario', deshabilitado: !puede('ajustes') || aprobado })
  );
  poner(refs.ajustes, 
    aprobado ? h('p', { class: 'ayuda' }, 'Período aprobado: para ajustar, reabra con motivo.') : form,
    tabla({
      compacta: true,
      columnas: [
        { clave: 'fecha', titulo: 'Fecha', formato: (v) => fecha(v) },
        { clave: 'vendedorId', titulo: 'Vendedor', formato: (v) => nombreVendedor(v) },
        { clave: 'monto', titulo: 'Monto', num: true, formato: (v) => monedaSigno(Math.round(v * 100)) },
        { clave: 'motivo', titulo: 'Motivo' },
        { clave: 'autor', titulo: 'Autor' },
        { clave: 'id', titulo: '', formato: (v) => (aprobado || !puede('ajustes') ? '' : boton('Eliminar', async () => { const m = await pedirMotivo('Eliminar ajuste', 'Indique el motivo de la eliminación.', { textoConfirmar: 'Eliminar', minimo: 4 }); if (m) await mutar(async (repo) => repo.eliminarAjuste(v, m), 'Ajuste eliminado'); }, { mini: true, tipo: 'peligro' })), ordenar: false },
      ],
      filas: lista,
      ordenable: false,
    })
  );
}

function renderControles() {
  limpiar(refs.controles);
  const per = resultadoPeriodo();
  if (!per) return;
  for (const c of controlesCierre(per)) poner(refs.controles, h('div', { class: 'control' }, h('span', { class: `estado ${c.ok ? 'ok' : 'falla'}` }, c.ok ? '✓' : '✗'), h('span', null, c.texto)));
}

async function renderBitacora() {
  limpiar(refs.bitacora);
  const filas = await estado.repo.leerBitacora({ entidad: filtroBitacora.entidad || undefined, texto: filtroBitacora.texto || undefined });
  const lista = h('div', { class: 'bitacora' });
  for (const f of filas.slice(0, 300)) lista.append(h('div', { class: 'bitacora-fila' }, h('div', { class: 'cuando' }, `${fechaHora(f.fechaHora)} · ${f.usuario}`), h('div', null, h('span', { class: 'accion' }, `${f.accion} · ${f.entidad}`), h('div', { class: 'silencioso' }, f.detalle))));
  poner(refs.bitacora, h('p', { class: 'ayuda' }, `${filas.length} entradas${filas.length > 300 ? ' (se muestran las 300 más recientes)' : ''}`), lista);
}

let contraste = null;

async function cargarContraste(archivo) {
  try {
    const XLSX = await cargarXLSX();
    const bytes = new Uint8Array(await leerArchivo(archivo));
    const { filas, errores } = leerContraste(XLSX, bytes);
    contraste = { nombre: archivo.name, filas, errores };
    renderContraste();
    await estado.repo.registrar('Contraste con liquidación histórica', 'Liquidacion', `${archivo.name}: ${filas.length} filas, ${errores.length} con error`);
  } catch (e) {
    toast(`No se pudo leer el contraste: ${e.message}`, 'error');
  }
}

/** Ejercicio de la demo: carga el «Excel anterior» ficticio con cuatro diferencias deliberadas, sin archivos externos. */
async function cargarContrasteDemo() {
  if (!estado.resultado) return;
  const { filas, desviaciones } = rolHistoricoDemo(estado.resultado);
  contraste = { nombre: 'rol histórico ficticio de la demostración («Excel anterior»)', filas, errores: [], desviaciones };
  renderContraste();
  await estado.repo.registrar('Contraste con liquidación histórica', 'Liquidacion', `Rol histórico de la demostración: ${filas.length} filas, ${desviaciones.length} diferencias deliberadas`);
}

async function descargarPlantillaContraste() {
  const XLSX = await cargarXLSX();
  descargar('Plantilla_Contraste_Comisiones.xlsx', libroABytes(XLSX, plantillaContraste(XLSX, estado.resultado.meta.periodos.filter((p) => !estado.resultado.periodos[p].enCurso), vendedores())), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function renderContraste() {
  limpiar(refs.contraste);
  if (!contraste) {
    return poner(refs.contraste,
      esDemo() ? h('p', { class: 'ayuda-nota' }, 'Ejercicio de la demostración: pulse «Rol histórico de la demostración». Carga un «Excel anterior» ficticio (enero a agosto 2026) con cuatro diferencias deliberadas para practicar el contraste sin archivos externos.') : null,
      h('p', { class: 'ayuda' }, 'Con datos reales: cargue el rol histórico (periodo, vendedor_id, comision_pagada) para comparar la comisión liquidable de la herramienta con lo que INDUVALLAS pagó. Tolerancia: USD 1,00.')
    );
  }
  const r = contrastar(estado.resultado, contraste.filas, { tolerancia: 1, nombres: nombreVendedor });
  poner(refs.contraste,
    h('p', null, badge(`${r.totales.ok} coinciden`, 'badge-ok'), ' ', badge(`${r.totales.revisar} por revisar`, r.totales.revisar ? 'badge-advertencia' : 'badge-neutro'), ' ', r.sinCorrespondencia.length ? badge(`${r.sinCorrespondencia.length} sin correspondencia`, 'badge-critico') : null, ' ', contraste.errores.length ? badge(`${contraste.errores.length} filas con error`, 'badge-critico') : null, h('span', { class: 'ayuda' }, ` · ${contraste.nombre}`)),
    tabla({
      compacta: true,
      columnas: [
        { clave: 'periodo', titulo: 'Período' },
        { clave: 'vendedor', titulo: 'Vendedor' },
        { clave: 'historico', titulo: 'Pagado histórico', num: true, formato: (v) => moneda(Math.round(v * 100)) },
        { clave: 'herramienta', titulo: 'Liquidable herramienta', num: true, formato: (v) => moneda(Math.round(v * 100)) },
        { clave: 'diferencia', titulo: 'Diferencia', num: true, formato: (v) => monedaSigno(Math.round(v * 100)) },
        { clave: 'pct', titulo: '%', num: true, formato: (v) => (v == null ? '—' : pct(v)) },
        { clave: 'devengadoHistorico', titulo: 'Devengado histórico', num: true, formato: (v) => (v == null ? '—' : moneda(Math.round(v * 100))) },
        { clave: 'devengadoHerramienta', titulo: 'Devengado herramienta', num: true, formato: (v) => moneda(Math.round(v * 100)) },
        { clave: 'estado', titulo: 'Estado', formato: (v) => badge(v === 'ok' ? 'coincide' : 'revisar', v === 'ok' ? 'badge-ok' : 'badge-advertencia') },
      ],
      filas: r.filas,
      totales: { periodo: 'Total', historico: r.totales.historico, herramienta: r.totales.herramienta, diferencia: r.totales.diferencia },
      claseFila: (f) => (f.estado === 'revisar' ? 'fila-resaltada' : ''),
      ordenInicial: { clave: 'diferencia', desc: true },
    }),
    r.sinCorrespondencia.length ? h('p', { class: 'ayuda' }, `Sin correspondencia en la herramienta (período o vendedor inexistente): ${r.sinCorrespondencia.map((f) => `${f.periodo} ${f.vendedorId}`).join(', ')}`) : null,
    contraste.desviaciones ? h('div', { class: 'contraste-explicacion' },
      h('h3', null, `Ejercicio: explique las ${contraste.desviaciones.length} diferencias`),
      h('p', { class: 'ayuda' }, 'Las filas resaltadas difieren en más de USD 1,00. Cada una tiene una causa conocida; compruébela en el lugar indicado con el botón «Ver». Las demás coinciden al centavo: el motor reproduce lo pagado.'),
      h('ol', { class: 'lista-pasos' }, contraste.desviaciones.map((d) => h('li', null,
        h('b', null, `${periodoLargo(d.periodo)} · ${nombreVendedor(d.vendedorId)} · ${monedaSigno(d.diferencia)} `), badge(d.regla, 'badge-info'), ' ', d.motivo, ' ',
        h('span', { class: 'ayuda' }, `Dónde mirar: ${d.mirar}`), ' ',
        boton('Ver', () => irA('motor', { vendedorId: d.vendedorId, periodo: d.periodo }), { mini: true })
      )))
    ) : null
  );
}

function actualizar() {
  if (!refs) return;
  renderRol();
  renderFlujo();
  renderAjustes();
  renderControles();
  renderBitacora();
  renderContraste();
}

function montar(cont, extra = {}) {
  refs = { estadoPeriodo: h('div', { class: 'tarjeta-cab', style: { marginBottom: 0 } }), rol: h('div'), flujo: h('div'), ajustes: h('div'), controles: h('div'), bitacora: h('div'), contraste: h('div') };
  const abrirContraste = selectorArchivo('.xlsx,.xls,.csv', cargarContraste);
  const entidad = select([{ valor: '', texto: 'Todas las entidades' }, ...['Datos', 'Liquidacion', 'EsquemaComisiones', 'PoliticaCobranza', 'Control', 'Sesión'].map((e) => ({ valor: e, texto: e }))], '', (v) => { filtroBitacora.entidad = v; renderBitacora(); }, { 'aria-label': 'Entidad' });
  const texto = input('search', '', (v) => { filtroBitacora.texto = v; renderBitacora(); }, { placeholder: 'Buscar en la bitácora', 'aria-label': 'Buscar' });
  poner(cont, 
    h('section', { class: 'tarjeta imprimible', id: 'tarjeta-flujo' }, refs.estadoPeriodo, refs.flujo, h('div', { style: { marginTop: '10px' } }, refs.rol)),
    h('div', { class: 'rejilla rejilla-2' },
      tarjeta('Ajustes manuales (R-06)', refs.ajustes, { subtitulo: 'Motivo, autor y fecha obligatorios; aparecen en el ledger y en la bitácora' }),
      tarjeta('Controles del cierre', refs.controles, { memorable: true })
    ),
    tarjeta('Contraste con la liquidación histórica', refs.contraste, { id: 'tarjeta-contraste', acciones: [boton('Descargar plantilla de contraste', descargarPlantillaContraste, { mini: true }), esDemo() ? boton('Rol histórico de la demostración', cargarContrasteDemo, { mini: true, tipo: 'primario' }) : null, boton('Cargar rol histórico…', abrirContraste, { mini: true, tipo: esDemo() ? 'secundario' : 'primario' })].filter(Boolean), subtitulo: 'Comisión liquidable de la herramienta frente a lo pagado según el Excel actual de INDUVALLAS' }),
    tarjeta('Bitácora', refs.bitacora, { acciones: [entidad, texto], subtitulo: 'Toda acción queda registrada con usuario y fecha' })
  );
  actualizar();
  if (extra.contrasteDemo && esDemo()) cargarContrasteDemo();
}

on('resultado', () => refs && estado.pestana === 'liquidacion' && actualizar());
on('periodo', () => refs && estado.pestana === 'liquidacion' && actualizar());

export default { id: 'liquidacion', titulo: 'Liquidación y auditoría', montar, actualizar, desmontar() { refs = null; } };
