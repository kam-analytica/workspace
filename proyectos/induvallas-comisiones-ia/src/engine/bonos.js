/**
 * R-02 · Bono mix (Retail Media) y bono por cliente nuevo. Montos en centavos (S-11).
 * @module engine/bonos
 */
import { aCentavos, aplicarPct, razon } from './money.js';

/**
 * @param {object} esquema EsquemaComisiones (usa esquema.bonos)
 * @param {{baseTotal:number, baseRetail:number, devengadoTotal:number, clientesNuevos:string[]}} datos centavos
 */
export function calcularBonos(esquema, { baseTotal, baseRetail, devengadoTotal, clientesNuevos }) {
  const cfg = esquema?.bonos || {};
  const mix = {
    activo: !!cfg.mix?.activo,
    aplica: false,
    participacionRetail: razon(baseRetail, baseTotal),
    umbral: cfg.mix?.umbralRetail ?? null,
    pct: cfg.mix?.pct ?? null,
    baseDevengado: devengadoTotal,
    monto: 0,
  };
  if (mix.activo && mix.participacionRetail != null && mix.participacionRetail + 1e-9 >= mix.umbral) {
    mix.aplica = true;
    mix.monto = aplicarPct(devengadoTotal, mix.pct);
  }
  const clienteNuevo = {
    activo: !!cfg.clienteNuevo?.activo,
    cantidad: clientesNuevos.length,
    reconocidos: 0,
    montoUnitario: cfg.clienteNuevo?.monto != null ? aCentavos(cfg.clienteNuevo.monto) : 0,
    maximo: cfg.clienteNuevo?.maximo ?? 0,
    clientes: [...clientesNuevos],
    monto: 0,
  };
  if (clienteNuevo.activo) {
    clienteNuevo.reconocidos = Math.min(clienteNuevo.cantidad, clienteNuevo.maximo);
    clienteNuevo.monto = clienteNuevo.reconocidos * clienteNuevo.montoUnitario;
  }
  return { mix, clienteNuevo, total: mix.monto + clienteNuevo.monto };
}
