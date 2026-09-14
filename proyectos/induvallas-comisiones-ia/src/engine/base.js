/**
 * R-00 · Base comisionable por factura, notas de crédito y anulaciones (S-02, S-13).
 * @module engine/base
 */
import { aCentavos, aplicarPct } from './money.js';

/**
 * Porcentaje de comisión de agencia aplicable a una factura.
 * Prioridad: pctAgencia de la factura → canal directo (0) → pctAgencia de la agencia del cliente → faltante (0 con alerta A-10).
 */
export function resolverPctAgencia(factura, cliente, agenciasPorId) {
  if (Number.isFinite(factura.pctAgencia)) return { pct: factura.pctAgencia, origen: 'factura' };
  const canal = factura.canal || cliente?.canal || 'directo';
  if (canal === 'directo') return { pct: 0, origen: 'directo' };
  const agencia = cliente?.agenciaId ? agenciasPorId.get(cliente.agenciaId) : null;
  if (agencia && Number.isFinite(agencia.pctAgencia)) return { pct: agencia.pctAgencia, origen: 'agencia' };
  return { pct: 0, origen: 'faltante', agenciaId: cliente?.agenciaId ?? null };
}

/**
 * Valor neto de la factura (centavos) considerando NC con fecha ≤ hastaFecha y anulación (NC sintética del 100 %).
 * @param {object} factura
 * @param {object[]} notasCredito de esta factura, ordenadas por fecha
 * @param {string} hastaFecha ISO
 */
export function valorNetoFactura(factura, notasCredito, hastaFecha) {
  const bruto = factura.valorCents ?? aCentavos(factura.valorFacturado);
  if (factura.fechaAnulacion && factura.fechaAnulacion <= hastaFecha) return { valorNeto: 0, notasAplicadas: bruto, anulada: true };
  let nc = 0;
  for (const n of notasCredito) if (n.fecha <= hastaFecha) nc += n.valorCents ?? aCentavos(n.valor);
  const notasAplicadas = Math.min(nc, bruto);
  return { valorNeto: bruto - notasAplicadas, notasAplicadas, anulada: false };
}

/** comisionAgencia = valorNeto × pctAgencia; base = valorNeto − comisionAgencia (R-00). */
export function calcularBase(valorNeto, pctAgencia) {
  const comisionAgencia = aplicarPct(valorNeto, pctAgencia);
  return { comisionAgencia, base: valorNeto - comisionAgencia };
}
