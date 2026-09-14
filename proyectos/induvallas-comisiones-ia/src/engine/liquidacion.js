/**
 * Liquidación mensual por vendedor: ledger de 9 líneas (R-00 a R-07), estados de factura y bonos,
 * tope, ajustes y saldo trasladado. Puro: recibe el contexto preparado por index.js y el estado del período anterior.
 * @module engine/liquidacion
 */
import { aCentavos, redondear } from './money.js';
import { fechaCorte, anteriorPeriodo, periodoDeFecha, maxFecha, diasEntre } from './dates.js';
import { versionVigente, versionesConocidas, politicaParaFactura } from './versiones.js';
import { resolverPctAgencia, valorNetoFactura, calcularBase } from './base.js';
import { medirTramo, determinarTramo, pctCelda, cuotaDelPeriodo } from './tramos.js';
import { estadoFactura, estadoCero } from './cobranza.js';
import { calcularBonos } from './bonos.js';
import { crearAlerta } from './alertas.js';
import { tramosOrdenados, caducidadDias } from './parametros.js';

const clave = (v, p) => `${v}|${p}`;

function nuevoAcumulador() {
  return {
    brutoMes: 0,
    ncMes: 0,
    facturadoMes: 0,
    agenciaMes: 0,
    baseMes: 0,
    baseRetail: 0,
    devengadoMes: 0,
    devengadoExtemporaneo: 0,
    nFacturas: 0,
    porLineaCanal: {},
    clientesNuevos: new Set(),
  };
}

function resumenEstado(s) {
  return {
    devengado: s.devengado,
    anticipo: s.anticipo,
    liberadoCobros: s.liberadoCobros,
    pagado: s.pagado,
    rezago: s.rezago,
    caducado: s.caducado,
    retenido: s.retenido,
    cobrado: s.cobrado,
    pendiente: s.pendiente,
    caducada: s.caducada,
    estado: s.estado,
    valorNeto: s.valorNeto,
    base: s.base,
  };
}

/**
 * Calcula un período abierto.
 * @param {object} ctx contexto de computeTodo (índices, parámetros, opciones)
 * @param {string} periodo 'YYYY-MM'
 * @param {object} estadoPrev estado final del período anterior (solo lectura)
 */
export function computePeriodo(ctx, periodo, estadoPrev) {
  const {
    hoy,
    diaCorte,
    control,
    esquemas,
    politicas,
    politicasPorId,
    esquemasPorId,
    vendedoresPorId,
    clientesPorId,
    agenciasPorId,
    facturasPorNumero,
    cobrosPorFactura,
    ncPorFactura,
    facturasPorPeriodo,
    extemporaneasPorPeriodo,
    ajustesPorPeriodo,
    cierres,
  } = ctx;

  const corte = fechaCorte(periodo, diaCorte);
  const cortePrev = fechaCorte(anteriorPeriodo(periodo), diaCorte);
  const fechaDatos = maxFecha(hoy, corte);
  const esquema = versionVigente(esquemas, corte);
  const politicasConocidas = versionesConocidas(politicas, corte);
  const alertas = [];
  const alerta = (codigo, datos) => alertas.push(crearAlerta(codigo, { periodo, ...datos }));
  if (!esquema) alerta('A-12', { entidad: 'esquema' });
  if (!politicasConocidas.length) alerta('A-12', { entidad: 'politica' });
  const prevFacturas = estadoPrev.facturas || {};
  const prevBonos = estadoPrev.bonos || {};
  const prevSaldos = estadoPrev.saldos || {};
  const prevEsSnapshot = !!estadoPrev.esSnapshot;

  // ---------- 1. Facturas nuevas en este período (propias y extemporáneas de períodos bloqueados)
  const nuevas = [];
  for (const f of facturasPorPeriodo.get(periodo) || []) nuevas.push({ f, extemporanea: false });
  for (const f of extemporaneasPorPeriodo.get(periodo) || []) nuevas.push({ f, extemporanea: true });

  const acum = new Map();
  const getAcum = (v) => {
    let a = acum.get(v);
    if (!a) {
      a = nuevoAcumulador();
      acum.set(v, a);
    }
    return a;
  };
  const infoNueva = new Map();
  const clientesActivados = new Set();
  for (const { f, extemporanea } of nuevas) {
    const cliente = clientesPorId.get(f.clienteId) || null;
    const { valorNeto, notasAplicadas, anulada } = valorNetoFactura(f, ncPorFactura.get(f.numero) || [], fechaDatos);
    const r = resolverPctAgencia(f, cliente, agenciasPorId);
    if (r.origen === 'faltante') alerta('A-10', { vendedorId: f.vendedorId, factura: f.numero, clienteId: f.clienteId, agenciaId: r.agenciaId });
    const { comisionAgencia, base } = calcularBase(valorNeto, r.pct);
    const canal = f.canal || cliente?.canal || 'directo';
    infoNueva.set(f.numero, { valorNeto, notasAplicadas, anulada, pctAgencia: r.pct, origenPct: r.origen, comisionAgencia, base, canal, extemporanea, pct: 0 });
    const a = getAcum(f.vendedorId);
    if (extemporanea) continue;
    a.brutoMes += f.valorCents ?? aCentavos(f.valorFacturado);
    a.ncMes += notasAplicadas;
    a.facturadoMes += valorNeto;
    a.agenciaMes += comisionAgencia;
    a.baseMes += base;
    a.nFacturas += 1;
    if (f.linea === 'retail') a.baseRetail += base;
    const k = `${f.linea}|${canal}`;
    const lc = a.porLineaCanal[k] || (a.porLineaCanal[k] = { linea: f.linea, canal, facturado: 0, comisionAgencia: 0, base: 0, pct: 0, devengado: 0, facturas: 0 });
    lc.facturado += valorNeto;
    lc.comisionAgencia += comisionAgencia;
    lc.base += base;
    lc.facturas += 1;
    if (cliente && cliente.fechaAlta && valorNeto > 0 && periodoDeFecha(cliente.fechaAlta, diaCorte) === periodo) clientesActivados.add(cliente.id);
  }
  for (const cid of clientesActivados) {
    const c = clientesPorId.get(cid);
    if (c?.vendedorId) getAcum(c.vendedorId).clientesNuevos.add(cid);
  }

  // ---------- 2. Conjunto de vendedores del ledger
  const vendedoresLedger = new Set(acum.keys());
  for (const v of vendedoresPorId.keys()) if (vendedoresPorId.get(v).activo !== false) vendedoresLedger.add(v);
  for (const v of estadoPrev.vendedores || []) vendedoresLedger.add(v);
  for (const k of Object.keys(prevBonos)) vendedoresLedger.add(k.split('|')[0]);
  for (const v of Object.keys(prevSaldos)) if (prevSaldos[v] > 0) vendedoresLedger.add(v);
  for (const aj of ajustesPorPeriodo.get(periodo) || []) vendedoresLedger.add(aj.vendedorId);

  // ---------- 3. Tramo por vendedor y % de las facturas nuevas
  const tramoPorVendedor = new Map();
  for (const v of vendedoresLedger) {
    const a = acum.get(v) || nuevoAcumulador();
    const vend = vendedoresPorId.get(v) || { cuotas: [] };
    const cq = cuotaDelPeriodo(vend, periodo);
    if (cq.origen !== 'periodo' && esquema?.criterioTramo !== 'facturacion') {
      alerta('A-09', { vendedorId: v, origen: cq.origen, periodoOrigen: cq.periodoOrigen ?? null });
    }
    let det = null;
    if (esquema) {
      const medida = medirTramo(esquema, { baseMes: a.baseMes, facturadoMes: a.facturadoMes, cuota: cq.cuota ?? 0 });
      det = determinarTramo(esquema, medida, { cuota: cq.cuota ?? 0, baseMes: a.baseMes });
    }
    tramoPorVendedor.set(v, { det, cuota: cq.cuota, cuotaOrigen: cq.origen, cuotaPeriodoOrigen: cq.periodoOrigen ?? null });
  }
  for (const { f, extemporanea } of nuevas) {
    const info = infoNueva.get(f.numero);
    if (!extemporanea) {
      const t = tramoPorVendedor.get(f.vendedorId)?.det;
      info.pct = t && esquema ? pctCelda(esquema, t.tramo.id, f.linea, info.canal) : 0;
      continue;
    }
    const periodoOrigen = periodoDeFecha(f.fechaEmision, diaCorte);
    const snap = cierres[periodoOrigen]?.snapshot;
    const tramoId = snap?.vendedores?.[f.vendedorId]?.tramo?.tramoId ?? null;
    const esq = snap?.esquemaId ? esquemasPorId.get(snap.esquemaId) : null;
    info.pct = tramoId && esq ? pctCelda(esq, tramoId, f.linea, info.canal) : 0;
    info.periodoOrigen = periodoOrigen;
    alerta('A-14', { vendedorId: f.vendedorId, factura: f.numero, periodoOrigen, tipo: 'factura', pctResuelto: info.pct });
  }

  // ---------- 4. Estados de factura: S0 (anterior) → S1a (NC nuevas) → S1b (política nueva) → S2 (cobros del período)
  const estadoFacturas = {};
  const filasPorVendedor = new Map();
  const porVendPeriodo = new Map();
  const bucket = new Map();
  const getBucket = (v) => {
    let b = bucket.get(v);
    if (!b) {
      b = {
        liberadoPeriodo: 0,
        liberadoCartera: 0,
        reversion: 0,
        extemporaneo: 0,
        clawback: 0,
        caducadoPeriodo: 0,
        rezagoPeriodo: 0,
        retenido: 0,
        cobradoPeriodo: 0,
        bonosL4: 0,
        bonosL5: 0,
        clawbackBonos: 0,
        caducadoBonos: 0,
        rezagoBonos: 0,
        retenidoBonos: 0,
      };
      bucket.set(v, b);
    }
    return b;
  };
  const hayNuevaPoliticaCartera = politicasConocidas.some((p) => p.reglaTransicion === 'cartera' && p.vigenteDesde > cortePrev);
  const procesadas = new Set();
  const universo = [];
  for (const numero in prevFacturas) universo.push(numero);
  for (const n of nuevas) if (!prevFacturas[n.f.numero]) universo.push(n.f.numero);

  for (const numero of universo) {
    if (procesadas.has(numero)) continue;
    procesadas.add(numero);
    const f = facturasPorNumero.get(numero);
    const prev = prevFacturas[numero] || null;
    if (!f) {
      if (prev) estadoFacturas[numero] = prev;
      continue;
    }
    const v = f.vendedorId;
    const cobros = cobrosPorFactura.get(numero) || [];
    const ncs = ncPorFactura.get(numero) || [];
    const periodoLedger = prev ? prev.periodo : periodo;
    const hastaNC = prev ? maxFecha(prev.hastaNC, corte) : fechaDatos;
    const diasCorte = diasEntre(f.fechaEmision, corte);
    const hayNC = prev
      ? ncs.some((n) => n.fecha > prev.hastaNC && n.fecha <= hastaNC) || !!(f.fechaAnulacion && f.fechaAnulacion > prev.hastaNC && f.fechaAnulacion <= hastaNC)
      : false;
    const hayCobros = cobros.some((c) => c.fechaCobro > cortePrev && c.fechaCobro <= corte);
    const esDelPeriodo = periodoLedger === periodo;

    // Vía rápida: sin NC nuevas, sin cobros del período, sin snapshot previo ni política nueva sobre cartera,
    // el único cambio posible es la caducidad por antigüedad. Si no la cruza, el estado se conserva tal cual.
    if (prev && !hayNC && !hayCobros && !prevEsSnapshot && !hayNuevaPoliticaCartera) {
      const polPrev = politicasPorId.get(prev.politicaId) || null;
      const emisionPrev = !polPrev || polPrev.modo === 'emision';
      const cruza = prev.pendiente > 0 && !prev.caducada && !emisionPrev && diasCorte > caducidadDias(polPrev);
      if (!cruza) {
        estadoFacturas[numero] = prev;
        const agg = porVendPeriodo.get(clave(v, periodoLedger)) || { devengado: 0, pagado: 0, caducado: 0, rezago: 0 };
        agg.devengado += prev.devengado;
        agg.pagado += prev.pagado;
        agg.caducado += prev.caducado;
        agg.rezago += prev.rezago;
        porVendPeriodo.set(clave(v, periodoLedger), agg);
        if (prev.retenido > 0) {
          getBucket(v).retenido += prev.retenido;
          if (!filasPorVendedor.has(v)) filasPorVendedor.set(v, []);
          filasPorVendedor.get(v).push(filaFactura(f, prev, { dias: diasCorte, esDelPeriodo, valorFacturado: f.valorCents ?? aCentavos(f.valorFacturado) }));
          if (prev.pendiente > 0 && diasCorte > control.diasSinCobro) {
            alerta('A-03', { vendedorId: v, factura: numero, dias: diasCorte, retenido: prev.retenido, pendiente: prev.pendiente });
          }
        }
        continue;
      }
    }

    const nueva = infoNueva.get(numero) || null;
    const pct = prev ? prev.pct : nueva.pct;
    const canal = prev ? prev.canal : nueva.canal;
    let vn;
    let base;
    let pctAg;
    let comAg;
    let notasAplicadas;
    if (nueva && !prev) {
      ({ valorNeto: vn, base, pctAgencia: pctAg, comisionAgencia: comAg, notasAplicadas } = nueva);
    } else {
      const r = valorNetoFactura(f, ncs, hastaNC);
      vn = r.valorNeto;
      notasAplicadas = r.notasAplicadas;
      pctAg = prev.pctAgencia;
      ({ comisionAgencia: comAg, base } = calcularBase(vn, pctAg));
    }
    const cobradoAntesDe = (fecha) => {
      let s = 0;
      for (const c of cobros) if (c.fechaCobro < fecha) s += c.montoCents ?? aCentavos(c.monto);
      return Math.min(s, vn);
    };
    const politica = politicaParaFactura(f, politicasConocidas, cobradoAntesDe, vn);
    const politicaPrev = prev ? politicasPorId.get(prev.politicaId) || politica : politica;
    const cambioPolitica = !!(prev && politica && prev.politicaId !== politica.id);
    const args = { fechaEmision: f.fechaEmision, valorNeto: vn, base, pct, cobros };
    const S0 = prev || estadoCero();
    let S1a;
    let S1b;
    if (!prev) {
      S1a = S1b = estadoCero();
    } else {
      S1a = hayNC || prevEsSnapshot ? estadoFactura({ ...args, politica: politicaPrev, hastaCobros: cortePrev, fechaEvaluacion: cortePrev }) : S0;
      S1b = cambioPolitica ? estadoFactura({ ...args, politica, hastaCobros: cortePrev, fechaEvaluacion: cortePrev }) : S1a;
    }
    const S2 = estadoFactura({ ...args, politica, hastaCobros: corte, fechaEvaluacion: corte });
    const diasAnt = S2.diasAntiguedad;
    const cobrosDetalle = S2.cobros;

    const dNC = S1a.pagado - S0.pagado;
    const clawback = Math.max(0, -dNC);
    const extemporaneo = Math.max(0, dNC);
    const reversion = S1b.pagado - S1a.pagado;
    const liberado = S2.pagado - S1b.pagado;
    const caducadoP = S2.caducado - S0.caducado;
    const rezagoP = S2.rezago - S0.rezago;
    const dCobrado = S2.cobrado - S0.cobrado;
    const dDevengado = S2.devengado - S0.devengado;

    const nuevoEstado = {
      numero,
      vendedorId: v,
      clienteId: f.clienteId,
      periodo: periodoLedger,
      fechaEmision: f.fechaEmision,
      linea: f.linea,
      canal,
      pct,
      pctAgencia: pctAg,
      comisionAgencia: comAg,
      notasAplicadas,
      politicaId: politica?.id ?? null,
      politicaVersion: politica?.version ?? null,
      hastaNC,
      ...resumenEstado(S2),
    };
    estadoFacturas[numero] = nuevoEstado;

    const agg = porVendPeriodo.get(clave(v, periodoLedger)) || { devengado: 0, pagado: 0, caducado: 0, rezago: 0 };
    agg.devengado += S2.devengado;
    agg.pagado += S2.pagado;
    agg.caducado += S2.caducado;
    agg.rezago += S2.rezago;
    porVendPeriodo.set(clave(v, periodoLedger), agg);

    const b = getBucket(v);
    if (esDelPeriodo) b.liberadoPeriodo += liberado;
    else b.liberadoCartera += liberado;
    b.reversion += reversion;
    b.extemporaneo += extemporaneo;
    b.clawback += clawback;
    b.caducadoPeriodo += caducadoP;
    b.rezagoPeriodo += rezagoP;
    b.retenido += S2.retenido;
    b.cobradoPeriodo += dCobrado;

    if (esDelPeriodo && nueva && !nueva.extemporanea) {
      const a = getAcum(v);
      a.devengadoMes += S2.devengado;
      const lc = a.porLineaCanal[`${f.linea}|${canal}`];
      if (lc) {
        lc.devengado += S2.devengado;
        lc.pct = pct;
      }
    } else if (nueva?.extemporanea) {
      getAcum(v).devengadoExtemporaneo += S2.devengado;
    }

    const hayCambio = esDelPeriodo || clawback || extemporaneo || reversion || liberado || caducadoP || rezagoP || S2.retenido > 0 || dDevengado;
    if (hayCambio) {
      const ultimo = cobrosDetalle.length ? cobrosDetalle[cobrosDetalle.length - 1] : null;
      if (!filasPorVendedor.has(v)) filasPorVendedor.set(v, []);
      filasPorVendedor.get(v).push(
        filaFactura(f, nuevoEstado, {
          dias: diasAnt,
          esDelPeriodo,
          extemporanea: !!nueva?.extemporanea,
          valorFacturado: f.valorCents ?? aCentavos(f.valorFacturado),
          variacionDevengado: dDevengado,
          cobradoPeriodo: dCobrado,
          ultimoCobro: ultimo ? { fecha: ultimo.fechaCobro, dias: ultimo.dias, factor: ultimo.factor } : null,
          cobros: cobrosDetalle,
          liberadoPeriodo: liberado,
          reversion,
          extemporaneo,
          clawback,
          caducadoPeriodo: caducadoP,
          rezagoPeriodo: rezagoP,
        })
      );
    }

    if (clawback > 0) alerta('A-06', { vendedorId: v, factura: numero, monto: clawback, periodoEmision: periodoLedger });
    if (reversion !== 0) alerta('A-13', { vendedorId: v, factura: numero, monto: reversion, de: politicaPrev?.version ?? null, a: politica?.version ?? null });
    if (extemporaneo > 0) alerta('A-14', { vendedorId: v, factura: numero, tipo: 'cobro', monto: extemporaneo, periodoOrigen: periodoLedger });
    if (S2.retenido > 0 && S2.pendiente > 0 && !S2.caducada && diasAnt > control.diasSinCobro) {
      alerta('A-03', { vendedorId: v, factura: numero, dias: diasAnt, retenido: S2.retenido, pendiente: S2.pendiente });
    }
  }

  // ---------- 5. Bonos por vendedor y período de origen (S-11)
  const estadoBonos = {};
  const bonosDelPeriodo = new Map();
  for (const v of vendedoresLedger) {
    const keys = new Set(Object.keys(prevBonos).filter((k) => k.startsWith(`${v}|`)));
    keys.add(clave(v, periodo));
    for (const key of keys) {
      const Pi = key.slice(v.length + 1);
      const prevB = prevBonos[key] || null;
      let devengadoB;
      let detalleB;
      if (Pi === periodo) {
        const a = acum.get(v) || nuevoAcumulador();
        const b = calcularBonos(esquema, { baseTotal: a.baseMes, baseRetail: a.baseRetail, devengadoTotal: a.devengadoMes, clientesNuevos: [...a.clientesNuevos] });
        devengadoB = b.total;
        detalleB = b;
        bonosDelPeriodo.set(v, b);
      } else {
        devengadoB = prevB.devengado;
        detalleB = prevB.detalle;
      }
      if (devengadoB === 0 && !prevB) continue;
      const agg = porVendPeriodo.get(key) || { devengado: 0, pagado: 0, caducado: 0, rezago: 0 };
      const libRatio = agg.devengado > 0 ? agg.pagado / agg.devengado : 1;
      const cadRatio = agg.devengado > 0 ? agg.caducado / agg.devengado : 0;
      const rezRatio = agg.devengado > 0 ? agg.rezago / agg.devengado : 0;
      const pagadoAcum = redondear(devengadoB * libRatio);
      const caducadoAcum = Math.min(redondear(devengadoB * cadRatio), devengadoB - pagadoAcum);
      const rezagoAcum = Math.min(redondear(devengadoB * rezRatio), devengadoB - pagadoAcum - caducadoAcum);
      const retenidoB = devengadoB - pagadoAcum - caducadoAcum - rezagoAcum;
      estadoBonos[key] = { vendedorId: v, periodo: Pi, devengado: devengadoB, detalle: detalleB, pagadoAcum, caducadoAcum, rezagoAcum, retenido: retenidoB };
      const dPag = pagadoAcum - (prevB?.pagadoAcum || 0);
      const dCad = caducadoAcum - (prevB?.caducadoAcum || 0);
      const dRez = rezagoAcum - (prevB?.rezagoAcum || 0);
      const b = getBucket(v);
      if (dPag >= 0) {
        if (Pi === periodo) b.bonosL4 += dPag;
        else b.bonosL5 += dPag;
      } else {
        b.clawbackBonos += -dPag;
      }
      b.caducadoBonos += dCad;
      b.rezagoBonos += dRez;
      b.retenidoBonos += retenidoB;
    }
  }

  // ---------- 6. Ledger por vendedor
  const vendedores = {};
  const totales = totalesVacios();
  const saldos = {};
  const tope = esquema?.tope?.activo ? aCentavos(esquema.tope.monto) : null;
  const primerTramoConComision = esquema ? tramosOrdenados(esquema).find((t) => (t.multiplicador ?? 1) > 0 || tieneCeldas(esquema, t.id)) : null;

  for (const v of vendedoresLedger) {
    const a = acum.get(v) || nuevoAcumulador();
    const b = getBucket(v);
    const t = tramoPorVendedor.get(v);
    const det = t?.det || null;
    const bonos = bonosDelPeriodo.get(v) || calcularBonos(esquema, { baseTotal: 0, baseRetail: 0, devengadoTotal: 0, clientesNuevos: [] });
    const filas = (filasPorVendedor.get(v) || []).sort((x, y) => (x.fechaEmision < y.fechaEmision ? -1 : x.fechaEmision > y.fechaEmision ? 1 : x.numero < y.numero ? -1 : 1));
    const ajustes = (ajustesPorPeriodo.get(periodo) || []).filter((aj) => aj.vendedorId === v).map((aj) => ({ ...aj, monto: aCentavos(aj.monto) }));
    const ajustesTotal = ajustes.reduce((s, aj) => s + aj.monto, 0);
    const saldoAnterior = prevSaldos[v] || 0;

    const liberadoPeriodo = b.liberadoPeriodo + b.bonosL4;
    const liberadoCartera = b.liberadoCartera + b.bonosL5 + b.reversion + b.extemporaneo;
    const clawbackTotal = b.clawback + b.clawbackBonos;
    const retenidoTotal = b.retenido + b.retenidoBonos;
    const caducadoTotal = b.caducadoPeriodo + b.caducadoBonos;
    const rezagoTotal = b.rezagoPeriodo + b.rezagoBonos;
    const netoAntesTope = liberadoPeriodo + liberadoCartera - clawbackTotal - saldoAnterior + ajustesTotal;
    const excedente = tope != null && netoAntesTope > tope ? netoAntesTope - tope : 0;
    const liquidable = netoAntesTope < 0 ? 0 : tope != null ? Math.min(netoAntesTope, tope) : netoAntesTope;
    const saldoSiguiente = netoAntesTope < 0 ? -netoAntesTope : 0;
    if (saldoSiguiente > 0) saldos[v] = saldoSiguiente;

    const tramoInfo = det
      ? {
          criterio: det.criterio,
          cumplimiento: det.cumplimiento,
          valor: det.valor,
          cuota: t.cuota,
          cuotaOrigen: t.cuotaOrigen,
          cuotaPeriodoOrigen: t.cuotaPeriodoOrigen,
          baseMes: a.baseMes,
          facturadoMes: a.facturadoMes,
          tramoId: det.tramo.id,
          tramoNombre: det.tramo.nombre,
          multiplicador: det.tramo.multiplicador ?? null,
          indice: det.indice,
          siguienteId: det.siguiente?.id ?? null,
          siguienteNombre: det.siguiente?.nombre ?? null,
          siguienteDesde: det.siguiente?.desde ?? null,
          falta: det.falta,
          faltaBase: det.faltaBase,
          sinMedida: det.sinMedida,
          distanciaLimite: det.distanciaLimite,
          limiteCercanoId: det.limiteCercano?.id ?? null,
          limiteCercanoDesde: det.limiteCercano?.desde ?? null,
        }
      : null;

    const lineas = [
      {
        codigo: 'L1',
        regla: 'R-00',
        titulo: 'Facturación del período y base comisionable',
        informativa: true,
        monto: a.baseMes,
        formula: 'valorNeto = valorFacturado − notasCrédito; comisiónAgencia = valorNeto × pctAgencia; base = valorNeto − comisiónAgencia',
        valores: { facturadoBruto: a.brutoMes, notasCredito: a.ncMes, valorNeto: a.facturadoMes, comisionAgencia: a.agenciaMes, base: a.baseMes, facturas: a.nFacturas, baseRetail: a.baseRetail },
        detalle: Object.values(a.porLineaCanal).sort((x, y) => `${x.linea}${x.canal}`.localeCompare(`${y.linea}${y.canal}`)),
      },
      {
        codigo: 'L2',
        regla: 'R-01',
        titulo: 'Tramo aplicado y comisión devengada del período',
        informativa: true,
        monto: a.devengadoMes + a.devengadoExtemporaneo,
        formula: 'cumplimiento = base ÷ cuota → tramo; devengado = Σ base × %celda(tramo, línea, canal)',
        valores: { ...(tramoInfo || {}), devengado: a.devengadoMes, devengadoExtemporaneo: a.devengadoExtemporaneo },
        detalle: Object.values(a.porLineaCanal).map((lc) => ({ linea: lc.linea, canal: lc.canal, base: lc.base, pct: lc.pct, devengado: lc.devengado, facturas: lc.facturas })),
      },
      {
        codigo: 'L3',
        regla: 'R-02',
        titulo: 'Bonos del período',
        informativa: true,
        monto: bonos.total,
        formula: 'bono mix = devengado × pct si Retail ≥ umbral; bono cliente nuevo = min(clientes, máximo) × monto',
        valores: { total: bonos.total, mix: bonos.mix.monto, clienteNuevo: bonos.clienteNuevo.monto },
        detalle: bonos,
      },
      {
        codigo: 'L4',
        regla: 'R-04',
        titulo: 'Liberado del período (cobros del período sobre facturas del período)',
        informativa: false,
        monto: liberadoPeriodo,
        formula: 'liberado = devengado × (cobrado ÷ valorNeto) × factor(días) + anticipos + bonos del período liberados',
        valores: { facturas: b.liberadoPeriodo, bonos: b.bonosL4 },
        detalle: filas.filter((r) => r.esDelPeriodo && (r.liberadoPeriodo !== 0 || r.anticipo !== 0)),
      },
      {
        codigo: 'L5',
        regla: 'R-04',
        titulo: 'Liberado de cartera (cobros del período sobre facturas de períodos anteriores)',
        informativa: false,
        monto: liberadoCartera,
        formula: 'liberado de cartera = Σ liberaciones de facturas anteriores + bonos anteriores liberados ± reversión por cambio de política + extemporáneo',
        valores: { facturas: b.liberadoCartera, bonos: b.bonosL5, reversion: b.reversion, extemporaneo: b.extemporaneo },
        detalle: filas.filter((r) => !r.esDelPeriodo && (r.liberadoPeriodo !== 0 || r.reversion !== 0 || r.extemporaneo !== 0)),
      },
      {
        codigo: 'L6',
        regla: 'R-04',
        titulo: 'Retenido pendiente de cobro y caducado en el período',
        informativa: true,
        monto: retenidoTotal,
        formula: 'retenido = devengado − liberado − caducado − no liberado por rezago; caduca al superar los días de caducidad sin cobro',
        valores: { retenido: retenidoTotal, retenidoFacturas: b.retenido, retenidoBonos: b.retenidoBonos, caducadoPeriodo: caducadoTotal, rezagoPeriodo: rezagoTotal },
        detalle: { retenidas: filas.filter((r) => r.retenido > 0), caducadas: filas.filter((r) => r.caducadoPeriodo !== 0), rezago: filas.filter((r) => r.rezagoPeriodo !== 0) },
      },
      {
        codigo: 'L7',
        regla: 'R-03',
        titulo: 'Clawback por notas de crédito y saldo negativo trasladado',
        informativa: false,
        monto: -(clawbackTotal + saldoAnterior),
        formula: 'clawback = comisión ya pagada sobre el valor anulado; saldo negativo del período anterior se descuenta',
        valores: { clawbackFacturas: b.clawback, clawbackBonos: b.clawbackBonos, saldoAnterior },
        detalle: filas.filter((r) => r.clawback > 0),
      },
      {
        codigo: 'L8',
        regla: 'R-06',
        titulo: 'Ajustes manuales',
        informativa: false,
        monto: ajustesTotal,
        formula: 'Σ ajustes con motivo, autor y fecha',
        valores: { total: ajustesTotal, cantidad: ajustes.length },
        detalle: ajustes,
      },
      {
        codigo: 'L9',
        regla: 'R-05',
        titulo: 'Neto a pagar, tope y comisión liquidable',
        informativa: false,
        monto: liquidable,
        formula: 'neto = L4 + L5 + L7 + L8; liquidable = min(máx(neto, 0), tope); excedente y saldo negativo quedan visibles',
        valores: { netoAntesTope, topeActivo: tope != null, tope, excedente, liquidable, saldoSiguiente },
        detalle: [],
      },
    ];

    const tv = {
      facturadoBruto: a.brutoMes,
      notasCredito: a.ncMes,
      valorNeto: a.facturadoMes,
      comisionAgencia: a.agenciaMes,
      base: a.baseMes,
      baseRetail: a.baseRetail,
      devengado: a.devengadoMes,
      devengadoExtemporaneo: a.devengadoExtemporaneo,
      bonos: bonos.total,
      liberadoPeriodo,
      liberadoCartera,
      reversion: b.reversion,
      extemporaneo: b.extemporaneo,
      retenido: retenidoTotal,
      caducadoPeriodo: caducadoTotal,
      rezagoPeriodo: rezagoTotal,
      clawback: clawbackTotal,
      saldoAnterior,
      ajustes: ajustesTotal,
      netoAntesTope,
      tope,
      excedente,
      liquidable,
      saldoSiguiente,
      cobradoPeriodo: b.cobradoPeriodo,
    };
    for (const k of Object.keys(totales)) totales[k] += tv[k] || 0;

    vendedores[v] = { vendedorId: v, periodo, esquemaId: esquema?.id ?? null, esquemaVersion: esquema?.version ?? null, tramo: tramoInfo, lineas, facturas: filas, ajustes, totales: tv };

    // ---------- 7. Alertas por vendedor
    const vend = vendedoresPorId.get(v);
    const conActividad = a.nFacturas > 0 || filas.length > 0 || saldoAnterior > 0 || ajustes.length > 0;
    if (det && (vend?.activo !== false || a.nFacturas > 0) && primerTramoConComision && !det.sinMedida) {
      const umbral = det.criterio === 'facturacion' ? aCentavos(primerTramoConComision.desde) : primerTramoConComision.desde;
      if (det.valor < umbral) alerta('A-01', { vendedorId: v, valor: det.valor, umbral, criterio: det.criterio, cumplimiento: det.cumplimiento, baseMes: a.baseMes, cuota: t.cuota });
    }
    if (a.facturadoMes > 0 && b.cobradoPeriodo / a.facturadoMes < control.cobranzaMinima) {
      alerta('A-02', { vendedorId: v, cobranza: b.cobradoPeriodo / a.facturadoMes, cobrado: b.cobradoPeriodo, facturado: a.facturadoMes, minimo: control.cobranzaMinima });
    }
    if (caducadoTotal > 0) alerta('A-04', { vendedorId: v, monto: caducadoTotal, facturas: filas.filter((r) => r.caducadoPeriodo > 0).map((r) => r.numero) });
    if (excedente > 0) alerta('A-05', { vendedorId: v, neto: netoAntesTope, tope, excedente });
    if (det && det.criterio === 'cumplimiento' && det.distanciaLimite != null && det.distanciaLimite <= control.puntosCercaTramo + 1e-12 && a.nFacturas > 0) {
      alerta('A-07', { vendedorId: v, cumplimiento: det.cumplimiento, limite: det.limiteCercano?.desde ?? null, tramoLimite: det.limiteCercano?.id ?? null, distancia: det.distanciaLimite, faltaBase: det.faltaBase });
    }
    if (saldoSiguiente > 0) alerta('A-11', { vendedorId: v, saldo: saldoSiguiente, neto: netoAntesTope });
    if (!conActividad && vend?.activo === false) delete vendedores[v];
  }

  const datos = {
    facturas: (facturasPorPeriodo.get(periodo) || []).map((f) => f.numero).concat((extemporaneasPorPeriodo.get(periodo) || []).map((f) => f.numero)),
    cobros: ctx.cobrosPorPeriodo.get(periodo) || [],
    notasCredito: ctx.ncPorPeriodo.get(periodo) || [],
  };

  return {
    periodo,
    fechaCorte: corte,
    fechaDatos,
    bloqueado: false,
    esquemaId: esquema?.id ?? null,
    esquemaVersion: esquema?.version ?? null,
    politicas: politicasConocidas.map((p) => ({ id: p.id, version: p.version, vigenteDesde: p.vigenteDesde, reglaTransicion: p.reglaTransicion, modo: p.modo })),
    vendedores,
    totales,
    alertas,
    estadoFinal: { facturas: estadoFacturas, bonos: estadoBonos, saldos, datos, vendedores: [...vendedoresLedger] },
  };
}

function tieneCeldas(esquema, tramoId) {
  const c = esquema.celdas?.[tramoId];
  if (!c) return false;
  for (const l of Object.values(c)) for (const v of Object.values(l)) if (v > 0) return true;
  return false;
}

export function totalesVacios() {
  return {
    facturadoBruto: 0,
    notasCredito: 0,
    valorNeto: 0,
    comisionAgencia: 0,
    base: 0,
    baseRetail: 0,
    devengado: 0,
    devengadoExtemporaneo: 0,
    bonos: 0,
    liberadoPeriodo: 0,
    liberadoCartera: 0,
    reversion: 0,
    extemporaneo: 0,
    retenido: 0,
    caducadoPeriodo: 0,
    rezagoPeriodo: 0,
    clawback: 0,
    saldoAnterior: 0,
    ajustes: 0,
    netoAntesTope: 0,
    tope: 0,
    excedente: 0,
    liquidable: 0,
    saldoSiguiente: 0,
    cobradoPeriodo: 0,
  };
}

/** Fila de detalle por factura para la UI. `e` es el estado de la factura; `extra` trae los deltas del período. */
function filaFactura(f, e, extra) {
  return {
    numero: f.numero,
    clienteId: f.clienteId,
    vendedorId: f.vendedorId,
    fechaEmision: f.fechaEmision,
    periodoEmision: e.periodo,
    esDelPeriodo: extra.esDelPeriodo,
    extemporanea: extra.extemporanea || false,
    linea: f.linea,
    canal: e.canal,
    valorFacturado: extra.valorFacturado,
    notasCredito: e.notasAplicadas,
    valorNeto: e.valorNeto,
    pctAgencia: e.pctAgencia,
    comisionAgencia: e.comisionAgencia,
    base: e.base,
    pct: e.pct,
    devengado: e.devengado,
    variacionDevengado: extra.variacionDevengado || 0,
    anticipo: e.anticipo,
    cobrado: e.cobrado,
    cobradoPeriodo: extra.cobradoPeriodo || 0,
    pendiente: e.pendiente,
    dias: extra.dias,
    ultimoCobro: extra.ultimoCobro || null,
    cobros: extra.cobros || [],
    liberadoPeriodo: extra.liberadoPeriodo || 0,
    liberadoAcumulado: e.pagado,
    reversion: extra.reversion || 0,
    extemporaneo: extra.extemporaneo || 0,
    clawback: extra.clawback || 0,
    retenido: e.retenido,
    caducadoPeriodo: extra.caducadoPeriodo || 0,
    caducadoAcumulado: e.caducado,
    rezagoPeriodo: extra.rezagoPeriodo || 0,
    rezagoAcumulado: e.rezago,
    politicaVersion: e.politicaVersion,
    estado: e.estado,
  };
}
