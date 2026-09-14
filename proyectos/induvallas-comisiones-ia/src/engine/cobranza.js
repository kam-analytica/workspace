/**
 * R-04 · Política de cobranza: factor por días, liberación proporcional por cobro, pagos parciales,
 * caducidad y anticipo. Estado acumulado de una factura en centavos (S-08, S-09, S-10, S-19, D-06).
 * @module engine/cobranza
 */
import { aCentavos, aplicarPct, redondear } from './money.js';
import { diasEntre } from './dates.js';
import { tramosPolitica, caducidadDias } from './parametros.js';

/** Factor de liberación para un número de días entre emisión y cobro. */
export function factorPorDias(politica, dias) {
  if (!politica || politica.modo === 'emision') return { factor: 1, tramo: null, caducado: false };
  if (dias > caducidadDias(politica)) return { factor: 0, tramo: null, caducado: true };
  for (const t of tramosPolitica(politica)) if (dias <= t.hastaDias) return { factor: t.factor, tramo: t, caducado: false };
  return { factor: 0, tramo: null, caducado: false };
}

export function estadoCero() {
  return {
    devengado: 0,
    anticipo: 0,
    liberadoCobros: 0,
    pagado: 0,
    rezago: 0,
    caducado: 0,
    retenido: 0,
    cobrado: 0,
    pendiente: 0,
    caducada: false,
    estado: 'emitida',
    diasAntiguedad: 0,
    valorNeto: 0,
    base: 0,
    cobros: [],
  };
}

/**
 * Estado acumulado de una factura bajo una política, considerando los cobros con fecha ≤ hastaCobros
 * y evaluando antigüedad y caducidad a fechaEvaluacion.
 * Identidad garantizada: devengado = anticipo + liberadoCobros + rezago + caducado + retenido.
 * @param {object} p
 * @param {string} p.fechaEmision ISO
 * @param {number} p.valorNeto centavos (ya neto de NC)
 * @param {number} p.base centavos (base comisionable)
 * @param {number} p.pct decimal del tramo
 * @param {object|null} p.politica PoliticaCobranza
 * @param {object[]} p.cobros de la factura, ordenados por fechaCobro
 * @param {string} p.hastaCobros ISO
 * @param {string} p.fechaEvaluacion ISO
 */
export function estadoFactura({ fechaEmision, valorNeto, base, pct, politica, cobros, hastaCobros, fechaEvaluacion }) {
  const devengado = aplicarPct(base, pct);
  const modoEmision = !politica || politica.modo === 'emision';
  const pctAnt = modoEmision ? 1 : politica.pctAnticipo || 0;
  const anticipo = pctAnt >= 1 ? devengado : aplicarPct(devengado, pctAnt);
  const R = devengado - anticipo;

  let aplicadoTotal = 0;
  let sumLib = 0;
  let sumRez = 0;
  let sumTardio = 0;
  const detalle = [];
  for (const c of cobros) {
    if (c.fechaCobro > hastaCobros) break;
    const monto = c.montoCents ?? aCentavos(c.monto);
    const aplicado = Math.max(0, Math.min(monto, valorNeto - aplicadoTotal));
    aplicadoTotal += aplicado;
    const dias = diasEntre(fechaEmision, c.fechaCobro);
    const f = factorPorDias(modoEmision ? null : politica, dias);
    sumLib += aplicado * f.factor;
    if (f.caducado) sumTardio += aplicado;
    else sumRez += aplicado * (1 - f.factor);
    detalle.push({ id: c.id, fechaCobro: c.fechaCobro, monto, aplicado, dias, factor: f.factor, caducado: f.caducado, liberado: 0 });
  }

  const puede = R > 0 && valorNeto > 0;
  const liberadoCobros = puede ? redondear((R * sumLib) / valorNeto) : 0;
  const caducadoTardio = puede ? Math.min(redondear((R * sumTardio) / valorNeto), R - liberadoCobros) : 0;
  let rezago = puede ? Math.min(redondear((R * sumRez) / valorNeto), R - liberadoCobros - caducadoTardio) : 0;
  let residual = R - liberadoCobros - caducadoTardio - rezago;
  const pendiente = Math.max(0, valorNeto - aplicadoTotal);
  if (pendiente === 0 && residual !== 0) {
    rezago += residual;
    residual = 0;
  }

  let acum = 0;
  let acumLib = 0;
  for (const d of detalle) {
    acum += d.aplicado * d.factor;
    const nuevo = puede ? redondear((R * acum) / valorNeto) : 0;
    d.liberado = nuevo - acumLib;
    acumLib = nuevo;
  }

  const diasAntiguedad = diasEntre(fechaEmision, fechaEvaluacion);
  const caducada = !modoEmision && pendiente > 0 && diasAntiguedad > caducidadDias(politica);
  const retenido = caducada ? 0 : residual;
  const caducado = caducadoTardio + (caducada ? residual : 0);

  let estado = 'emitida';
  if (valorNeto === 0) estado = 'anulada';
  else if (caducada) estado = 'caducada';
  else if (pendiente === 0) estado = 'cobrada';
  else if (aplicadoTotal > 0) estado = 'cobrada_parcial';

  return {
    devengado,
    anticipo,
    liberadoCobros,
    pagado: anticipo + liberadoCobros,
    rezago,
    caducado,
    retenido,
    cobrado: aplicadoTotal,
    pendiente,
    caducada,
    estado,
    diasAntiguedad,
    valorNeto,
    base,
    cobros: detalle,
  };
}
