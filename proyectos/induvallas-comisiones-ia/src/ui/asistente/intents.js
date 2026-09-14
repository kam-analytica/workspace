/**
 * Asistente basado en reglas sobre los datos vivos. Solo afirma lo que calcula; sin API externa (Fase 4).
 * responder(pregunta, ctx) → { texto, filas?, columnas?, fuente, accion? }
 * ctx: { dataset, resultado, periodo, nombres:{vendedor(id)}, simular(vendedorId, params), compararPoliticas(vendedorId) }
 * @module ui/asistente/intents
 */
import { usd, pct, periodoLargo, fecha, dias } from '../format.js';
import { explicarLedger } from '../explicar.js';

const quitarAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function buscarVendedor(pregunta, dataset) {
  const q = quitarAcentos(pregunta);
  let mejor = null;
  for (const v of dataset.vendedores) {
    const partes = quitarAcentos(v.nombre).split(/\s+/);
    const coincidencias = partes.filter((p) => p.length > 2 && q.includes(p)).length;
    if (coincidencias > (mejor?.n || 0)) mejor = { v, n: coincidencias };
  }
  return mejor?.v || null;
}

function montoEn(pregunta) {
  const m = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?/.exec(pregunta.replace(/usd|\$/gi, ''));
  if (!m) return null;
  const entero = m[1].replace(/[.\s]/g, '');
  return Math.round(Number(entero) * 100 + Number((m[2] || '0').padEnd(2, '0')));
}

function porcentajeEn(pregunta) {
  const m = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(pregunta);
  return m ? Number(m[1].replace(',', '.')) / 100 : null;
}

export const EJEMPLOS = [
  'Resumen ejecutivo del período',
  '¿Por qué Carolina cobra menos de lo devengado?',
  '¿Quién tiene retención mayor a 1.000?',
  '¿Quién superó el tope?',
  '¿Quién está cerca del límite de tramo?',
  'Cartera vencida de Sebastián',
  'Impacto de la nueva política en María',
  '¿Cuánto costaría si Juan Pablo factura 5.000 más?',
];

export function responder(pregunta, ctx) {
  const q = quitarAcentos(pregunta || '').trim();
  const per = ctx.resultado?.periodos?.[ctx.periodo];
  if (!per) return { texto: 'No hay datos calculados para responder. Cargue datos en la pestaña Datos.', fuente: null };
  const nombre = (id) => ctx.nombres.vendedor(id);
  const ledgers = Object.values(per.vendedores);
  const vend = buscarVendedor(pregunta, ctx.dataset);

  if (/resumen|ejecutivo|como (va|cierra|esta) el (mes|periodo|cierre)/.test(q)) {
    const t = per.totales;
    const enMeta = ledgers.filter((l) => l.tramo?.cumplimiento >= 1).length;
    const alertas = ctx.resultado.alertas.filter((a) => a.periodo === ctx.periodo);
    const criticas = alertas.filter((a) => a.severidad === 'critico').length;
    const filas = ledgers
      .map((l) => ({ vendedor: nombre(l.vendedorId), cumplimiento: l.tramo?.cumplimiento ?? null, tramo: l.tramo?.tramoNombre || '—', devengado: l.totales.devengado, liquidable: l.totales.liquidable }))
      .sort((a, b) => (b.cumplimiento || 0) - (a.cumplimiento || 0));
    return {
      texto: `Cierre de ${periodoLargo(ctx.periodo)}: facturación neta ${usd(t.valorNeto)}, base comisionable ${usd(t.base)} (R-00), devengado ${usd(t.devengado)} más bonos ${usd(t.bonos)} (R-01, R-02). Liberado ${usd(t.liberadoPeriodo + t.liberadoCartera)} y retenido ${usd(t.retenido)} (R-04); caducado ${usd(t.caducadoPeriodo)}; clawback ${usd(t.clawback)} (R-03). Comisión liquidable total ${usd(t.liquidable)} (R-05). ${enMeta} de ${ledgers.length} vendedores en meta. ${alertas.length} alertas, ${criticas} críticas.`,
      columnas: [
        { clave: 'vendedor', titulo: 'Vendedor' },
        { clave: 'cumplimiento', titulo: 'Cumplimiento', num: true, formato: (v) => pct(v) },
        { clave: 'tramo', titulo: 'Tramo' },
        { clave: 'devengado', titulo: 'Devengado', num: true, formato: (v) => usd(v) },
        { clave: 'liquidable', titulo: 'Liquidable', num: true, formato: (v) => usd(v) },
      ],
      filas,
      fuente: `Motor de cálculo · ${ctx.periodo} · totales del período`,
    };
  }

  if (/tope/.test(q)) {
    const conTope = ledgers.filter((l) => l.totales.excedente > 0);
    if (!conTope.length) return { texto: `Ningún vendedor superó el tope mensual en ${periodoLargo(ctx.periodo)} (R-05).`, fuente: 'L9 de cada ledger' };
    return {
      texto: `${conTope.length} vendedor${conTope.length === 1 ? '' : 'es'} con tope aplicado en ${periodoLargo(ctx.periodo)} (R-05): ${conTope.map((l) => `${nombre(l.vendedorId)} con neto ${usd(l.totales.netoAntesTope)}, tope ${usd(l.totales.tope)} y excedente ${usd(l.totales.excedente)} pendiente de política de diferimiento`).join('; ')}.`,
      fuente: 'L9 · alerta A-05',
      accion: { pestana: 'motor', vendedorId: conTope[0].vendedorId },
    };
  }

  if (/retencion|retenid/.test(q) && /mayor|mas de|superior|>/.test(q)) {
    const umbral = montoEn(pregunta) ?? 0;
    const filas = ledgers.filter((l) => l.totales.retenido > umbral).map((l) => ({ vendedor: nombre(l.vendedorId), retenido: l.totales.retenido, facturas: l.facturas.filter((r) => r.retenido > 0).length })).sort((a, b) => b.retenido - a.retenido);
    if (!filas.length) return { texto: `Nadie tiene comisión retenida mayor a ${usd(umbral)} al cierre de ${periodoLargo(ctx.periodo)}.`, fuente: 'L6' };
    return { texto: `${filas.length} vendedor${filas.length === 1 ? '' : 'es'} con retención mayor a ${usd(umbral)} (R-04, L6):`, columnas: [{ clave: 'vendedor', titulo: 'Vendedor' }, { clave: 'retenido', titulo: 'Retenido', num: true, formato: (v) => usd(v) }, { clave: 'facturas', titulo: 'Facturas retenidas', num: true }], filas, fuente: 'L6 · retenido pendiente de cobro' };
  }

  if (/limite de tramo|cerca del (limite|tramo)|proximo tramo|falta.*tramo|acelerador|sobrecumplimiento/.test(q)) {
    const cerca = ctx.resultado.alertas.filter((a) => a.codigo === 'A-07' && a.periodo === ctx.periodo);
    const filas = ledgers
      .filter((l) => l.tramo && !l.tramo.sinMedida && l.tramo.siguienteNombre)
      .map((l) => ({ vendedor: nombre(l.vendedorId), cumplimiento: l.tramo.cumplimiento, tramo: l.tramo.tramoNombre, siguiente: l.tramo.siguienteNombre, faltaBase: l.tramo.faltaBase }))
      .sort((a, b) => a.faltaBase - b.faltaBase);
    const cercanos = cerca.map((a) => `${nombre(a.vendedorId)} (${pct(a.cumplimiento)}, a ${pct(Math.abs(a.distancia), 1)} del límite de ${pct(a.limite, 0)})`).join('; ');
    return { texto: cerca.length ? `A menos de ${pct(ctx.resultado.meta.control.puntosCercaTramo, 1)} de un límite de tramo (alerta A-07): ${cercanos}. Detalle de cuánto falta para el siguiente tramo por vendedor:` : 'Nadie está a menos del umbral de control de un límite de tramo. Cuánto falta para el siguiente tramo por vendedor:', columnas: [{ clave: 'vendedor', titulo: 'Vendedor' }, { clave: 'cumplimiento', titulo: 'Cumplimiento', num: true, formato: (v) => pct(v) }, { clave: 'tramo', titulo: 'Tramo' }, { clave: 'siguiente', titulo: 'Siguiente' }, { clave: 'faltaBase', titulo: 'Base que falta', num: true, formato: (v) => usd(v) }], filas, fuente: 'R-01 · L2' };
  }

  if (/cartera|vencid|pendiente de cobro|sin cobrar|caduc/.test(q)) {
    let cartera = ctx.resultado.cartera;
    if (vend) cartera = cartera.filter((c) => c.vendedorId === vend.id);
    const vencida = cartera.filter((c) => c.dias > ctx.resultado.meta.control.diasSinCobro);
    const lista = vencida.length ? vencida : cartera;
    const filas = lista.slice(0, 40).map((c) => ({ factura: c.numero, vendedor: nombre(c.vendedorId), cliente: ctx.nombres.cliente(c.clienteId), dias: c.dias, pendiente: c.pendiente, retenido: c.retenido, fechaLimite: c.fechaLimite, diasParaCaducar: c.diasParaCaducar }));
    const total = lista.reduce((s, c) => s + c.retenido, 0);
    const caducadas = ctx.resultado.alertas.filter((a) => a.codigo === 'A-04' && a.periodo === ctx.periodo && (!vend || a.vendedorId === vend.id));
    return {
      texto: `${vend ? `Cartera de ${vend.nombre}` : 'Cartera de comisiones pendientes'} al ${fecha(ctx.resultado.meta.hoy)}: ${lista.length} factura${lista.length === 1 ? '' : 's'} ${vencida.length ? `con más de ${ctx.resultado.meta.control.diasSinCobro} días` : 'retenidas'} y ${usd(total)} de comisión retenida (R-04).${caducadas.length ? ` En ${periodoLargo(ctx.periodo)} caducaron comisiones por ${usd(caducadas.reduce((s, a) => s + a.monto, 0))} (A-04).` : ''}`,
      columnas: [{ clave: 'factura', titulo: 'Factura' }, { clave: 'vendedor', titulo: 'Vendedor' }, { clave: 'cliente', titulo: 'Cliente' }, { clave: 'dias', titulo: 'Días', num: true }, { clave: 'pendiente', titulo: 'Pendiente', num: true, formato: (v) => usd(v) }, { clave: 'retenido', titulo: 'Retenido', num: true, formato: (v) => usd(v) }, { clave: 'fechaLimite', titulo: 'Caduca', formato: (v) => fecha(v) }, { clave: 'diasParaCaducar', titulo: 'Días restantes', num: true }],
      filas,
      fuente: 'Cartera del motor · antigüedad a la fecha de referencia',
      accion: { pestana: 'politica' },
    };
  }

  if (/impacto|nueva politica|politica actualizada|politica anterior|comparar politica/.test(q)) {
    const comp = ctx.compararPoliticas(vend?.id || null);
    if (!comp) return { texto: 'Se necesitan al menos dos versiones de política de cobranza para comparar.', fuente: null };
    const filas = comp.filas;
    const tot = comp.totales;
    return {
      texto: `${vend ? `Impacto en ${vend.nombre}` : 'Impacto sobre todos los vendedores'} en ${periodoLargo(ctx.periodo)}: con la política v${comp.anterior.version} se liberarían ${usd(tot.liberadoA)} y con la v${comp.actual.version} ${usd(tot.liberadoB)} (diferencia ${usd(tot.liberadoB - tot.liberadoA)}); retenido ${usd(tot.retenidoA)} frente a ${usd(tot.retenidoB)}; caducado ${usd(tot.caducadoA)} frente a ${usd(tot.caducadoB)} (R-04).`,
      columnas: [{ clave: 'vendedor', titulo: 'Vendedor' }, { clave: 'liberadoA', titulo: `Liberado v${comp.anterior.version}`, num: true, formato: (v) => usd(v) }, { clave: 'liberadoB', titulo: `Liberado v${comp.actual.version}`, num: true, formato: (v) => usd(v) }, { clave: 'retenidoB', titulo: `Retenido v${comp.actual.version}`, num: true, formato: (v) => usd(v) }, { clave: 'caducadoB', titulo: `Caducado v${comp.actual.version}`, num: true, formato: (v) => usd(v) }],
      filas,
      fuente: 'Simulador de política · misma cartera, distinta versión',
      accion: { pestana: 'politica' },
    };
  }

  if (/cuanto (costaria|seria|ganaria|cobraria)|que pasa si|si .* factura|facturara|adicional/.test(q) && vend) {
    const monto = montoEn(pregunta) ?? 0;
    const pctCob = porcentajeEn(pregunta);
    const sim = ctx.simular(vend.id, { facturacionAdicional: monto, cobranza60: pctCob });
    if (!sim) return { texto: 'No fue posible simular con esos parámetros.', fuente: null };
    const dl = sim.simulado.devengado - sim.real.devengado;
    const dq = sim.simulado.liquidable - sim.real.liquidable;
    return {
      texto: `Si ${vend.nombre} facturara ${usd(monto)} adicionales en ${periodoLargo(ctx.periodo)}${pctCob != null ? ` con ${pct(pctCob, 0)} de cobranza a 60 días` : ''}: cumplimiento ${pct(sim.simulado.cumplimiento)} (tramo «${sim.simulado.tramoNombre}») frente a ${pct(sim.real.cumplimiento)} («${sim.real.tramoNombre}»); devengado ${usd(sim.simulado.devengado)} (${dl >= 0 ? '+' : '−'}${usd(Math.abs(dl))}); comisión liquidable ${usd(sim.simulado.liquidable)} (${dq >= 0 ? '+' : '−'}${usd(Math.abs(dq))}). Simulación sobre una copia de los datos; nada se modifica (R-01, R-04, R-05).`,
      fuente: 'Simulador del motor de cálculo',
      accion: { pestana: 'motor', vendedorId: vend.id },
    };
  }

  if (/por que|porque|explica|detalle de|como se calcul/.test(q) && vend) {
    const l = per.vendedores[vend.id];
    if (!l) return { texto: `${vend.nombre} no tiene liquidación en ${periodoLargo(ctx.periodo)}.`, fuente: null };
    const parrafos = explicarLedger(l, { nombre: vend.nombre, periodo: ctx.periodo, politicaVersion: l.facturas.find((r) => r.esDelPeriodo)?.politicaVersion, alertas: ctx.resultado.alertas.filter((a) => a.periodo === ctx.periodo) });
    return { texto: parrafos.join(' '), fuente: `Ledger de ${vend.nombre} · ${ctx.periodo}`, accion: { pestana: 'motor', vendedorId: vend.id } };
  }

  if (vend) {
    const l = per.vendedores[vend.id];
    if (l) return { texto: `${vend.nombre} en ${periodoLargo(ctx.periodo)}: cumplimiento ${pct(l.tramo?.cumplimiento)} (tramo «${l.tramo?.tramoNombre}»), devengado ${usd(l.totales.devengado)}, liberado ${usd(l.totales.liberadoPeriodo + l.totales.liberadoCartera)}, retenido ${usd(l.totales.retenido)}, comisión liquidable ${usd(l.totales.liquidable)}. Pregunte «¿por qué?» para el detalle paso a paso.`, fuente: `Ledger · ${ctx.periodo}`, accion: { pestana: 'motor', vendedorId: vend.id } };
  }

  return {
    texto: 'No puedo calcular una respuesta para esa pregunta. Puedo responder sobre: resumen ejecutivo, por qué un vendedor cobra lo que cobra, cuánto costaría si factura más, retención mayor a un monto, tope, límite de tramo, cartera vencida de un vendedor e impacto de la nueva política. El asistente solo afirma lo que puede calcular con los datos cargados.',
    fuente: null,
  };
}
