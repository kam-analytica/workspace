/**
 * Punto de entrada del motor: computeTodo(dataset, opciones) recorre los períodos en orden, consume los
 * períodos aprobados como snapshots (D-09) y calcula los abiertos. Puro y determinista (D-04).
 * @module engine
 */
import { aCentavos } from './money.js';
import { periodoDeFecha, rangoPeriodos, esFechaISO, diasEntre, sumarDias, minFecha, maxFecha } from './dates.js';
import { validarEsquema, validarPolitica, caducidadDias } from './parametros.js';
import { factorPorDias } from './cobranza.js';
import { crearAlerta, CONTROL_FALLBACK } from './alertas.js';
import { computePeriodo, totalesVacios } from './liquidacion.js';

export { computePeriodo } from './liquidacion.js';
export { estadoFactura, factorPorDias } from './cobranza.js';
export { generarCeldas, validarEsquema, validarPolitica, LINEAS, CANALES } from './parametros.js';
export { determinarTramo, medirTramo, pctCelda, cuotaDelPeriodo } from './tramos.js';
export { calcularBase, valorNetoFactura, resolverPctAgencia } from './base.js';
export { calcularBonos } from './bonos.js';
export { versionVigente, versionesConocidas, politicaParaFactura } from './versiones.js';
export { CATALOGO_ALERTAS } from './alertas.js';
export * as money from './money.js';
export * as dates from './dates.js';

export class EngineError extends Error {
  constructor(mensaje, errores = []) {
    super(mensaje);
    this.name = 'EngineError';
    this.errores = errores;
  }
}

const ordenarPor = (campo, campo2) => (a, b) => (a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : a[campo2] < b[campo2] ? -1 : a[campo2] > b[campo2] ? 1 : 0);

function agrupar(items, clave, orden) {
  const m = new Map();
  for (const it of items) {
    const k = clave(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  if (orden) for (const arr of m.values()) arr.sort(orden);
  return m;
}

/** Última fecha presente en el dataset (respaldo para `hoy` cuando no se indica). */
export function fechaMaximaDatos(dataset) {
  let max = null;
  for (const f of dataset.facturas || []) max = maxFecha(max, f.fechaEmision);
  for (const c of dataset.cobros || []) max = maxFecha(max, c.fechaCobro);
  for (const n of dataset.notasCredito || []) max = maxFecha(max, n.fecha);
  return max;
}

/**
 * @param {object} dataset { vendedores, agencias, clientes, facturas, cobros, notasCredito, esquemas, politicas, ajustes, cierres, control }
 * @param {object} opciones { hoy: 'YYYY-MM-DD', hastaPeriodo: 'YYYY-MM', diaCorte: number|null }
 */
export function computeTodo(dataset, opciones = {}) {
  const t0 = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
  const errores = [];
  for (const e of dataset.esquemas || []) errores.push(...validarEsquema(e));
  for (const p of dataset.politicas || []) errores.push(...validarPolitica(p));
  if (!(dataset.esquemas || []).length) errores.push('No hay esquemas de comisiones');
  if (!(dataset.politicas || []).length) errores.push('No hay políticas de cobranza');
  if (errores.length) throw new EngineError('Parámetros inválidos', errores);

  const diaCorte = opciones.diaCorte ?? null;
  const hoy = opciones.hoy ?? fechaMaximaDatos(dataset);
  if (!esFechaISO(hoy)) throw new EngineError('Falta la fecha de referencia (opciones.hoy) y el dataset no tiene fechas');
  const hastaPeriodo = opciones.hastaPeriodo ?? periodoDeFecha(hoy, diaCorte);
  const control = { ...CONTROL_FALLBACK, ...(dataset.control || {}) };

  const vendedoresPorId = new Map((dataset.vendedores || []).map((v) => [v.id, v]));
  const agenciasPorId = new Map((dataset.agencias || []).map((a) => [a.id, a]));
  const clientesPorId = new Map((dataset.clientes || []).map((c) => [c.id, c]));
  const esquemasPorId = new Map((dataset.esquemas || []).map((e) => [e.id, e]));
  const politicasPorId = new Map((dataset.politicas || []).map((p) => [p.id, p]));
  const facturas = (dataset.facturas || []).map((f) => ({ ...f, periodo: periodoDeFecha(f.fechaEmision, diaCorte), valorCents: aCentavos(f.valorFacturado) }));
  const facturasPorNumero = new Map(facturas.map((f) => [f.numero, f]));
  const cobros = (dataset.cobros || []).filter((c) => facturasPorNumero.has(c.facturaNumero)).map((c) => ({ ...c, montoCents: aCentavos(c.monto) }));
  const notasCredito = (dataset.notasCredito || []).filter((n) => facturasPorNumero.has(n.facturaNumero)).map((n) => ({ ...n, valorCents: aCentavos(n.valor) }));
  const cobrosPorFactura = agrupar(cobros, (c) => c.facturaNumero, ordenarPor('fechaCobro', 'id'));
  const ncPorFactura = agrupar(notasCredito, (n) => n.facturaNumero, ordenarPor('fecha', 'numero'));
  const facturasPorPeriodo = agrupar(facturas, (f) => f.periodo, ordenarPor('fechaEmision', 'numero'));
  const cobrosPorPeriodo = new Map();
  for (const c of cobros) {
    const p = periodoDeFecha(c.fechaCobro, diaCorte);
    if (!cobrosPorPeriodo.has(p)) cobrosPorPeriodo.set(p, []);
    cobrosPorPeriodo.get(p).push(c.id);
  }
  const ncPorPeriodo = new Map();
  for (const n of notasCredito) {
    const p = periodoDeFecha(n.fecha, diaCorte);
    if (!ncPorPeriodo.has(p)) ncPorPeriodo.set(p, []);
    ncPorPeriodo.get(p).push(n.numero);
  }
  const ajustesPorPeriodo = agrupar(dataset.ajustes || [], (a) => a.periodo, ordenarPor('fecha', 'id'));
  const cierres = dataset.cierres || {};

  let minPeriodo = hastaPeriodo;
  for (const f of facturas) if (f.periodo < minPeriodo) minPeriodo = f.periodo;
  for (const p of cobrosPorPeriodo.keys()) if (p < minPeriodo) minPeriodo = p;
  for (const p of ncPorPeriodo.keys()) if (p < minPeriodo) minPeriodo = p;
  for (const p of ajustesPorPeriodo.keys()) if (p < minPeriodo) minPeriodo = p;
  for (const p of Object.keys(cierres)) if (p < minPeriodo) minPeriodo = p;
  const periodos = rangoPeriodos(minPeriodo, hastaPeriodo);

  // Datos nuevos en períodos bloqueados (A-08) y facturas extemporáneas
  const alertasGlobales = [];
  const extemporaneasPorPeriodo = new Map();
  const primerAbiertoDespues = (p) => periodos.find((q) => q > p && !cierres[q]?.snapshot) || null;
  const idsSnapshot = (p, tipo) => new Set(cierres[p]?.snapshot?.estadoFinal?.datos?.[tipo] || []);
  for (const p of periodos) {
    if (!cierres[p]?.snapshot) continue;
    const fs = idsSnapshot(p, 'facturas');
    for (const f of facturasPorPeriodo.get(p) || []) {
      if (fs.has(f.numero)) continue;
      const destino = primerAbiertoDespues(p);
      alertasGlobales.push(crearAlerta('A-08', { periodo: p, tipo: 'factura', ref: f.numero, vendedorId: f.vendedorId, destino }));
      if (destino) {
        if (!extemporaneasPorPeriodo.has(destino)) extemporaneasPorPeriodo.set(destino, []);
        extemporaneasPorPeriodo.get(destino).push(f);
      }
    }
    const cs = idsSnapshot(p, 'cobros');
    for (const id of cobrosPorPeriodo.get(p) || []) {
      if (cs.has(id)) continue;
      const c = cobros.find((x) => x.id === id);
      alertasGlobales.push(crearAlerta('A-08', { periodo: p, tipo: 'cobro', ref: id, factura: c?.facturaNumero ?? null, vendedorId: facturasPorNumero.get(c?.facturaNumero)?.vendedorId ?? null, destino: primerAbiertoDespues(p) }));
    }
    const ns = idsSnapshot(p, 'notasCredito');
    for (const numero of ncPorPeriodo.get(p) || []) {
      if (ns.has(numero)) continue;
      const n = notasCredito.find((x) => x.numero === numero);
      alertasGlobales.push(crearAlerta('A-08', { periodo: p, tipo: 'notaCredito', ref: numero, factura: n?.facturaNumero ?? null, vendedorId: facturasPorNumero.get(n?.facturaNumero)?.vendedorId ?? null, destino: primerAbiertoDespues(p) }));
    }
  }

  const ctx = {
    hoy,
    diaCorte,
    control,
    esquemas: dataset.esquemas,
    politicas: dataset.politicas,
    politicasPorId,
    esquemasPorId,
    vendedoresPorId,
    clientesPorId,
    agenciasPorId,
    facturasPorNumero,
    cobrosPorFactura,
    ncPorFactura,
    facturasPorPeriodo,
    cobrosPorPeriodo,
    ncPorPeriodo,
    extemporaneasPorPeriodo,
    ajustesPorPeriodo,
    cierres,
  };

  let estado = { facturas: {}, bonos: {}, saldos: {}, datos: { facturas: [], cobros: [], notasCredito: [] }, esSnapshot: false };
  const periodosOut = {};
  for (const p of periodos) {
    const cierre = cierres[p];
    if (cierre?.snapshot) {
      periodosOut[p] = { ...cierre.snapshot, bloqueado: true, cierre: { fecha: cierre.fecha ?? null, autor: cierre.autor ?? null, motivo: cierre.motivo ?? null } };
      estado = { ...cierre.snapshot.estadoFinal, esSnapshot: true };
      continue;
    }
    const r = computePeriodo(ctx, p, estado);
    periodosOut[p] = r;
    estado = { ...r.estadoFinal, esSnapshot: false };
  }

  // Cartera de comisiones pendientes al cierre del último período, envejecida a `hoy`
  const cartera = [];
  for (const s of Object.values(estado.facturas || {})) {
    if (!(s.retenido > 0)) continue;
    const pol = politicasPorId.get(s.politicaId) || null;
    const dias = diasEntre(s.fechaEmision, hoy);
    const fh = factorPorDias(pol, dias);
    const cad = pol ? caducidadDias(pol) : null;
    cartera.push({
      numero: s.numero,
      vendedorId: s.vendedorId,
      clienteId: s.clienteId,
      periodoEmision: s.periodo,
      fechaEmision: s.fechaEmision,
      linea: s.linea,
      canal: s.canal,
      valorNeto: s.valorNeto,
      cobrado: s.cobrado,
      pendiente: s.pendiente,
      devengado: s.devengado,
      liberado: s.pagado,
      retenido: s.retenido,
      dias,
      factorHoy: fh.factor,
      tramoHoy: fh.tramo ? { hastaDias: fh.tramo.hastaDias, factor: fh.tramo.factor } : null,
      fechaLimite: Number.isFinite(cad) ? sumarDias(s.fechaEmision, cad) : null,
      diasParaCaducar: Number.isFinite(cad) ? cad - dias : null,
      politicaVersion: s.politicaVersion,
      estado: s.estado,
    });
  }
  cartera.sort((a, b) => b.dias - a.dias || (a.numero < b.numero ? -1 : 1));

  const alertas = [...alertasGlobales];
  for (const p of periodos) for (const al of periodosOut[p].alertas || []) alertas.push(al);

  const t1 = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
  return {
    periodos: periodosOut,
    cartera,
    alertas,
    meta: { hoy, hastaPeriodo, diaCorte, periodos, control, ms: Math.round((t1 - t0) * 100) / 100 },
  };
}

/** Totales consolidados de un período (suma de vendedores) sin recalcular. */
export function totalesPeriodo(resultadoPeriodo) {
  const t = totalesVacios();
  for (const v of Object.values(resultadoPeriodo.vendedores || {})) for (const k of Object.keys(t)) t[k] += v.totales[k] || 0;
  return t;
}

export { aCentavos, minFecha };
