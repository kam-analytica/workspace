/**
 * R-01 · Cumplimiento, tramo y porcentaje por celda (línea × canal). Límite inferior inclusivo (D-07).
 * @module engine/tramos
 */
import { aCentavos, redondear } from './money.js';
import { tramosOrdenados } from './parametros.js';

const EPS = 1e-9;

/**
 * Medida que decide el tramo: cumplimiento = baseMes ÷ cuota (criterio a) o facturación del mes (criterio b).
 * Todos los montos en centavos.
 */
export function medirTramo(esquema, { baseMes, facturadoMes, cuota }) {
  const cumplimiento = cuota > 0 ? baseMes / cuota : null;
  if (esquema.criterioTramo === 'facturacion') return { criterio: 'facturacion', valor: facturadoMes, cumplimiento };
  return { criterio: 'cumplimiento', valor: cumplimiento, cumplimiento };
}

/**
 * Tramo alcanzado, siguiente tramo y cuánto falta (en puntos y en centavos de base o facturación).
 * Sin medida (cuota ausente en criterio cumplimiento) se asigna el primer tramo.
 */
export function determinarTramo(esquema, medida, { cuota = 0, baseMes = 0 } = {}) {
  const tramos = tramosOrdenados(esquema);
  const esFact = medida.criterio === 'facturacion';
  const umbral = (t) => (esFact ? aCentavos(t.desde) : t.desde);
  const valor = medida.valor;
  let indice = 0;
  if (valor != null) {
    for (let i = 0; i < tramos.length; i++) if (valor + EPS >= umbral(tramos[i])) indice = i;
  }
  const tramo = tramos[indice];
  const siguiente = tramos[indice + 1] || null;
  let falta = null;
  let faltaBase = null;
  if (siguiente && valor != null) {
    falta = umbral(siguiente) - valor;
    faltaBase = esFact ? falta : redondear(umbral(siguiente) * cuota) - baseMes;
  }
  let distanciaLimite = null;
  let limiteCercano = null;
  if (valor != null) {
    for (const t of tramos) {
      if (umbral(t) <= 0) continue;
      const d = Math.abs(valor - umbral(t));
      if (distanciaLimite == null || d < distanciaLimite) {
        distanciaLimite = d;
        limiteCercano = t;
      }
    }
  }
  return {
    tramo,
    indice,
    siguiente,
    falta,
    faltaBase,
    valor,
    criterio: medida.criterio,
    cumplimiento: medida.cumplimiento,
    sinMedida: valor == null,
    distanciaLimite,
    limiteCercano,
  };
}

/** Porcentaje de la celda (decimal). 0 si no existe. */
export function pctCelda(esquema, tramoId, linea, canal) {
  return esquema?.celdas?.[tramoId]?.[linea]?.[canal] ?? 0;
}

/**
 * Cuota del período en centavos. Si no hay cuota para el período usa la última anterior (D-15) y lo señala.
 * @returns {{cuota:number|null, origen:'periodo'|'anterior'|'ninguna', periodoOrigen?:string}}
 */
export function cuotaDelPeriodo(vendedor, periodo) {
  const cuotas = [...(vendedor?.cuotas || [])]
    .filter((c) => c.periodo && c.periodo <= periodo && Number.isFinite(Number(c.monto)))
    .sort((a, b) => (a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : 0));
  if (!cuotas.length) return { cuota: null, origen: 'ninguna' };
  const ultima = cuotas[cuotas.length - 1];
  return { cuota: aCentavos(ultima.monto), origen: ultima.periodo === periodo ? 'periodo' : 'anterior', periodoOrigen: ultima.periodo };
}
