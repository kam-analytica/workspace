/**
 * Explicación en lenguaje natural de un ledger, generada desde los datos con citas a reglas. Sin DOM.
 * @module ui/explicar
 */
import { usd, pct, pctCelda, periodoLargo, nombreLinea } from './format.js';

/**
 * @param {object} ledger ledger de un vendedor (salida del motor)
 * @param {{nombre:string, periodo:string, politicaVersion?:string, alertas?:object[]}} ctx
 * @returns {string[]} párrafos
 */
export function explicarLedger(ledger, ctx) {
  const t = ledger.totales;
  const tr = ledger.tramo || {};
  const L = Object.fromEntries(ledger.lineas.map((l) => [l.codigo, l]));
  const p = [];
  const nombre = ctx.nombre;
  const per = periodoLargo(ctx.periodo);

  if (t.valorNeto > 0) {
    p.push(`En ${per}, ${nombre} facturó ${usd(t.valorNeto)} sin IVA${t.notasCredito > 0 ? ` (ya descontadas notas de crédito por ${usd(t.notasCredito)})` : ''}. La comisión de agencia fue ${usd(t.comisionAgencia)}, por lo que la base comisionable quedó en ${usd(t.base)} (R-00).`);
  } else {
    p.push(`En ${per}, ${nombre} no registró facturación con base comisionable (R-00).`);
  }

  if (tr.sinMedida) {
    p.push(`No hay cuota cargada para el período, así que el cumplimiento no se pudo medir y no se devengó comisión (R-01, alerta A-09).`);
  } else if (tr.criterio === 'cumplimiento') {
    let s = `Con una cuota de ${usd(tr.cuota)}, el cumplimiento fue ${pct(tr.cumplimiento)}, lo que ubica al vendedor en el tramo «${tr.tramoNombre}»${tr.multiplicador != null ? ` (multiplicador ${tr.multiplicador})` : ''} (R-01).`;
    if (tr.siguienteNombre && tr.faltaBase > 0) s += ` Para alcanzar «${tr.siguienteNombre}» (desde ${pct(tr.siguienteDesde, 0)}) le faltaron ${usd(tr.faltaBase)} de base comisionable.`;
    if (tr.cuotaOrigen === 'anterior') s += ` La cuota se tomó del período ${tr.cuotaPeriodoOrigen} porque no había cuota cargada para ${ctx.periodo}.`;
    p.push(s);
  } else {
    p.push(`El tramo se determinó por facturación absoluta del mes (${usd(tr.facturadoMes)}): tramo «${tr.tramoNombre}» (R-01).`);
  }

  const lineasDet = (L.L2?.detalle || []).filter((d) => d.base > 0);
  const detalleLineas = lineasDet.map((d) => `${nombreLinea(d.linea)} ${d.canal}: ${pctCelda(d.pct)} sobre ${usd(d.base)}`).join('; ');
  p.push(`La comisión devengada del período es ${usd(t.devengado)}${detalleLineas ? ` (${detalleLineas})` : ''}${t.devengadoExtemporaneo ? `, más ${usd(t.devengadoExtemporaneo)} de facturas extemporáneas de períodos bloqueados (R-07)` : ''}.`);

  const bonos = L.L3?.detalle;
  if (bonos && (bonos.mix?.monto > 0 || bonos.clienteNuevo?.monto > 0)) {
    const partes = [];
    if (bonos.mix.monto > 0) partes.push(`bono mix de ${usd(bonos.mix.monto)} porque Retail Media representó ${pct(bonos.mix.participacionRetail)} de la base (umbral ${pct(bonos.mix.umbral, 0)})`);
    if (bonos.clienteNuevo.monto > 0) partes.push(`bono por ${bonos.clienteNuevo.reconocidos} cliente${bonos.clienteNuevo.reconocidos === 1 ? '' : 's'} nuevo${bonos.clienteNuevo.reconocidos === 1 ? '' : 's'} de ${usd(bonos.clienteNuevo.monto)}`);
    p.push(`Se reconocen bonos por ${usd(t.bonos)}: ${partes.join(' y ')} (R-02). Los bonos siguen la misma cobranza que las facturas del mes.`);
  } else if (bonos?.mix?.activo && bonos.mix.participacionRetail != null && !bonos.mix.aplica && t.base > 0) {
    p.push(`No aplica el bono mix: Retail Media fue ${pct(bonos.mix.participacionRetail)} de la base, por debajo del umbral de ${pct(bonos.mix.umbral, 0)} (R-02).`);
  }

  const pol = ctx.politicaVersion ? `bajo la política de cobranza v${ctx.politicaVersion}` : 'según la política de cobranza vigente';
  let s4 = `Se liberaron ${usd(t.liberadoPeriodo)} por cobros del período sobre facturas del mismo período y ${usd(t.liberadoCartera)} por cobros de cartera de meses anteriores ${pol} (R-04).`;
  if (t.retenido > 0) s4 += ` Quedan ${usd(t.retenido)} retenidos a la espera de cobro.`;
  if (t.caducadoPeriodo > 0) s4 += ` Caducaron ${usd(t.caducadoPeriodo)} por facturas que superaron el plazo sin cobrarse.`;
  if (t.rezagoPeriodo > 0) s4 += ` Otros ${usd(t.rezagoPeriodo)} no se liberaron por cobros tardíos con factor reducido.`;
  if (t.reversion) s4 += ` El cambio de política sobre cartera generó una ${t.reversion < 0 ? 'reversión' : 'liberación adicional'} de ${usd(Math.abs(t.reversion))} (alerta A-13).`;
  p.push(s4);

  if (t.clawback > 0 || t.saldoAnterior > 0) {
    const partes = [];
    if (t.clawback > 0) partes.push(`clawback de ${usd(t.clawback)} por notas de crédito sobre comisiones ya liberadas (R-03)`);
    if (t.saldoAnterior > 0) partes.push(`saldo negativo trasladado del período anterior por ${usd(t.saldoAnterior)}`);
    p.push(`Se descuentan: ${partes.join(' y ')}.`);
  }
  if (t.ajustes) p.push(`Ajustes manuales netos por ${usd(t.ajustes)} con motivo registrado en la bitácora (R-06).`);

  let s9 = `El neto a pagar antes de tope es ${usd(t.netoAntesTope)}.`;
  if (t.netoAntesTope < 0) s9 += ` Como es negativo, la comisión liquidable es USD 0,00 y el saldo de ${usd(t.saldoSiguiente)} se traslada al período siguiente (R-03, alerta A-11).`;
  else if (t.excedente > 0) s9 += ` Supera el tope mensual de ${usd(t.tope)} (R-05): la comisión liquidable es ${usd(t.liquidable)} y ${usd(t.excedente)} quedan pendientes de la política de diferimiento.`;
  else s9 += ` La comisión liquidable es ${usd(t.liquidable)}${t.tope != null ? `, por debajo del tope de ${usd(t.tope)} (R-05)` : ''}.`;
  p.push(s9);

  const alertas = (ctx.alertas || []).filter((a) => a.vendedorId === ledger.vendedorId);
  if (alertas.length) {
    const codigos = [...new Set(alertas.map((a) => a.codigo))].join(', ');
    p.push(`Alertas del motor de control para este vendedor: ${codigos}.`);
  }
  return p;
}
