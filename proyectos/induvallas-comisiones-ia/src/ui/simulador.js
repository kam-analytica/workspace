/**
 * Simulaciones sobre copias de los datos (nunca modifican el dataset real): "¿qué pasa si…?" por vendedor,
 * comparación de políticas de cobranza y vista previa de un esquema editado.
 * @module ui/simulador
 */
import { computeTodo } from '../engine/index.js';
import { aCentavos, deCentavos, redondear } from '../engine/money.js';
import { periodoDeFecha, sumarDias, fechaCorte } from '../engine/dates.js';

function subconjunto(dataset, vendedorId) {
  const facturas = dataset.facturas.filter((f) => f.vendedorId === vendedorId);
  const numeros = new Set(facturas.map((f) => f.numero));
  return {
    ...dataset,
    vendedores: dataset.vendedores.filter((v) => v.id === vendedorId),
    facturas,
    cobros: dataset.cobros.filter((c) => numeros.has(c.facturaNumero)),
    notasCredito: dataset.notasCredito.filter((n) => numeros.has(n.facturaNumero)),
    ajustes: (dataset.ajustes || []).filter((a) => a.vendedorId === vendedorId),
    cierres: {},
  };
}

function resumen(ledger) {
  if (!ledger) return null;
  const t = ledger.totales;
  return { cumplimiento: ledger.tramo?.cumplimiento ?? null, tramoNombre: ledger.tramo?.tramoNombre || '—', tramoId: ledger.tramo?.tramoId || null, base: t.base, devengado: t.devengado, bonos: t.bonos, liberadoPeriodo: t.liberadoPeriodo, liberadoCartera: t.liberadoCartera, retenido: t.retenido, netoAntesTope: t.netoAntesTope, liquidable: t.liquidable, excedente: t.excedente };
}

/**
 * @param {object} dataset
 * @param {string} periodo
 * @param {string} hoy
 * @param {string} vendedorId
 * @param {{facturacionAdicional?:number, cobranza60?:number|null, pctAgencia?:number|null, participacionRetail?:number|null}} params
 *   facturacionAdicional en centavos; los demás decimales o null para no tocar.
 */
export function simularVendedor(dataset, periodo, hoy, vendedorId, params = {}) {
  const base = subconjunto(dataset, vendedorId);
  const hastaPeriodo = periodoDeFecha(hoy);
  const real = computeTodo(base, { hoy, hastaPeriodo }).periodos[periodo]?.vendedores[vendedorId];
  const sim = JSON.parse(JSON.stringify(base));
  const delPeriodo = sim.facturas.filter((f) => periodoDeFecha(f.fechaEmision) === periodo);
  const clientes = new Map(sim.clientes.map((c) => [c.id, c]));

  if (params.facturacionAdicional > 0) {
    const cliente = sim.clientes.find((c) => c.vendedorId === vendedorId && c.canal === 'directo') || sim.clientes.find((c) => c.vendedorId === vendedorId) || sim.clientes[0];
    const conteo = {};
    for (const f of delPeriodo) conteo[f.linea] = (conteo[f.linea] || 0) + f.valorFacturado;
    const linea = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || 'vallas';
    const nueva = { numero: 'SIM-ADICIONAL', fechaEmision: fechaCorte(periodo).slice(0, 8) + '15', vendedorId, clienteId: cliente?.id, linea, canal: 'directo', valorFacturado: deCentavos(params.facturacionAdicional), pctAgencia: 0 };
    sim.facturas.push(nueva);
    delPeriodo.push(nueva);
  }
  if (params.pctAgencia != null) {
    for (const f of delPeriodo) {
      const canal = f.canal || clientes.get(f.clienteId)?.canal;
      if (canal === 'agencia') f.pctAgencia = params.pctAgencia;
    }
  }
  if (params.participacionRetail != null) {
    const total = delPeriodo.reduce((s, f) => s + f.valorFacturado, 0);
    const objetivo = params.participacionRetail * total;
    let acum = 0;
    for (const f of [...delPeriodo].sort((a, b) => b.valorFacturado - a.valorFacturado)) {
      if (acum < objetivo) {
        f.linea = 'retail';
        acum += f.valorFacturado;
      } else if (f.linea === 'retail') f.linea = 'vallas';
    }
  }
  if (params.cobranza60 != null) {
    const numeros = new Set(delPeriodo.map((f) => f.numero));
    sim.cobros = sim.cobros.filter((c) => !numeros.has(c.facturaNumero));
    const ncPorFactura = {};
    for (const n of sim.notasCredito) if (numeros.has(n.facturaNumero)) ncPorFactura[n.facturaNumero] = (ncPorFactura[n.facturaNumero] || 0) + n.valor;
    const valorNeto = (f) => Math.max(0, f.valorFacturado - (ncPorFactura[f.numero] || 0));
    const total = delPeriodo.reduce((s, f) => s + valorNeto(f), 0);
    let objetivo = params.cobranza60 * total;
    let i = 0;
    for (const f of [...delPeriodo].sort((a, b) => (a.fechaEmision < b.fechaEmision ? -1 : 1))) {
      if (objetivo <= 0.005) break;
      const monto = Math.min(valorNeto(f), objetivo);
      if (monto <= 0) continue;
      sim.cobros.push({ id: `SIM-CB-${++i}`, facturaNumero: f.numero, fechaCobro: sumarDias(f.fechaEmision, 45), monto: Math.round(monto * 100) / 100, medio: 'simulado' });
      objetivo -= monto;
    }
  }
  const simulado = computeTodo(sim, { hoy, hastaPeriodo }).periodos[periodo]?.vendedores[vendedorId];
  return { real: resumen(real), simulado: resumen(simulado), ledgerSimulado: simulado || null };
}

/**
 * Compara dos versiones de política aplicadas a toda la historia (sin cierres) sobre el período indicado.
 */
export function compararPoliticas(dataset, periodo, hoy, { vendedorId = null, anteriorId = null, actualId = null, politicaEditada = null } = {}) {
  const orden = [...dataset.politicas].sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? -1 : 1));
  if (orden.length < 2 && !politicaEditada) return null;
  const actual = politicaEditada || (actualId ? orden.find((p) => p.id === actualId) : orden[orden.length - 1]);
  const anterior = anteriorId ? orden.find((p) => p.id === anteriorId) : orden.filter((p) => p.id !== actual.id).slice(-1)[0] || orden[0];
  if (!anterior || !actual) return null;
  const hastaPeriodo = periodoDeFecha(hoy);
  const correr = (pol) => computeTodo({ ...dataset, politicas: [{ ...pol, id: `SIM-${pol.id || 'editada'}`, vigenteDesde: '1900-01-01', reglaTransicion: 'emision' }], cierres: {} }, { hoy, hastaPeriodo }).periodos[periodo];
  const A = correr(anterior);
  const B = correr(actual);
  const ids = vendedorId ? [vendedorId] : Object.keys(B?.vendedores || {});
  const filas = ids.map((id) => {
    const a = A?.vendedores[id]?.totales || {};
    const b = B?.vendedores[id]?.totales || {};
    return {
      vendedorId: id,
      liberadoA: (a.liberadoPeriodo || 0) + (a.liberadoCartera || 0),
      liberadoB: (b.liberadoPeriodo || 0) + (b.liberadoCartera || 0),
      retenidoA: a.retenido || 0,
      retenidoB: b.retenido || 0,
      caducadoA: a.caducadoPeriodo || 0,
      caducadoB: b.caducadoPeriodo || 0,
      liquidableA: a.liquidable || 0,
      liquidableB: b.liquidable || 0,
    };
  });
  const totales = {};
  for (const k of ['liberadoA', 'liberadoB', 'retenidoA', 'retenidoB', 'caducadoA', 'caducadoB', 'liquidableA', 'liquidableB']) totales[k] = filas.reduce((s, f) => s + f[k], 0);
  return { anterior, actual, filas, totales };
}

/** Devengado por vendedor en el período con el esquema editado frente al vigente (sin cierres para aislar el efecto). */
export function previsualizarEsquema(dataset, periodo, hoy, esquemaEditado) {
  const hastaPeriodo = periodoDeFecha(hoy);
  const vigente = computeTodo({ ...dataset, cierres: {} }, { hoy, hastaPeriodo }).periodos[periodo];
  const editado = computeTodo({ ...dataset, esquemas: [{ ...esquemaEditado, id: 'SIM-ESQ', vigenteDesde: '1900-01-01' }], cierres: {} }, { hoy, hastaPeriodo }).periodos[periodo];
  const ids = new Set([...Object.keys(vigente?.vendedores || {}), ...Object.keys(editado?.vendedores || {})]);
  const filas = [...ids].map((id) => {
    const a = vigente?.vendedores[id];
    const b = editado?.vendedores[id];
    return { vendedorId: id, cumplimiento: b?.tramo?.cumplimiento ?? a?.tramo?.cumplimiento ?? null, tramoVigente: a?.tramo?.tramoNombre || '—', tramoEditado: b?.tramo?.tramoNombre || '—', devengadoVigente: a?.totales.devengado || 0, devengadoEditado: b?.totales.devengado || 0, bonosVigente: a?.totales.bonos || 0, bonosEditado: b?.totales.bonos || 0 };
  });
  const totales = { devengadoVigente: filas.reduce((s, f) => s + f.devengadoVigente, 0), devengadoEditado: filas.reduce((s, f) => s + f.devengadoEditado, 0), bonosVigente: filas.reduce((s, f) => s + f.bonosVigente, 0), bonosEditado: filas.reduce((s, f) => s + f.bonosEditado, 0) };
  return { filas, totales };
}

export { aCentavos, redondear };
