/**
 * Estructura y validación de los parámetros versionados: EsquemaComisiones (R-01, R-02, R-05)
 * y PoliticaCobranza (R-04). Ningún valor de negocio por defecto vive aquí: los defaults de la demo están en src/seed/.
 * @module engine/parametros
 */
import { redondearPct } from './money.js';
import { esFechaISO } from './dates.js';

export const LINEAS = ['vallas', 'led', 'retail'];
export const CANALES = ['directo', 'agencia'];
export const CRITERIOS_TRAMO = ['cumplimiento', 'facturacion'];
export const MODOS_POLITICA = ['cobro', 'emision'];
export const REGLAS_TRANSICION = ['emision', 'cartera'];

/**
 * Asistente "generar tabla desde tasa base × multiplicador" (R-01).
 * @param {{vallas:{directo:number,agencia:number},led:object,retail:object}} tasasBase decimales (0.012 = 1,2 %)
 * @param {{id:string,multiplicador:number}[]} tramos
 * @returns {object} celdas[tramoId][linea][canal] con 4 decimales de porcentaje (S-21)
 */
export function generarCeldas(tasasBase, tramos) {
  const celdas = {};
  for (const t of tramos) {
    celdas[t.id] = {};
    for (const l of LINEAS) {
      celdas[t.id][l] = {};
      for (const c of CANALES) {
        celdas[t.id][l][c] = redondearPct((tasasBase?.[l]?.[c] ?? 0) * (t.multiplicador ?? 0));
      }
    }
  }
  return celdas;
}

/** Tramos del esquema ordenados por umbral ascendente. */
export function tramosOrdenados(esquema) {
  return [...(esquema.tramos || [])].sort((a, b) => a.desde - b.desde);
}

/** Tramos de días de la política ordenados por hastaDias ascendente. */
export function tramosPolitica(politica) {
  return [...(politica.tramos || [])].sort((a, b) => a.hastaDias - b.hastaDias);
}

/** Días a partir de los cuales la comisión caduca (R-04). Por defecto, el último tramo definido. */
export function caducidadDias(politica) {
  if (Number.isFinite(politica.caducidadDias)) return politica.caducidadDias;
  const ts = tramosPolitica(politica);
  return ts.length ? ts[ts.length - 1].hastaDias : Infinity;
}

const esPct = (x) => Number.isFinite(x) && x >= 0 && x <= 1;

/** @returns {string[]} errores; vacío si el esquema es válido */
export function validarEsquema(e) {
  const err = [];
  const id = e?.id ?? '?';
  if (!e || typeof e !== 'object') return ['Esquema inválido'];
  if (!e.version) err.push(`Esquema ${id}: falta version`);
  if (!esFechaISO(e.vigenteDesde)) err.push(`Esquema ${id}: vigenteDesde inválida (${e.vigenteDesde})`);
  if (!CRITERIOS_TRAMO.includes(e.criterioTramo)) err.push(`Esquema ${id}: criterioTramo debe ser ${CRITERIOS_TRAMO.join(' o ')}`);
  const tramos = tramosOrdenados(e);
  if (!tramos.length) err.push(`Esquema ${id}: sin tramos`);
  else {
    if (tramos[0].desde !== 0) err.push(`Esquema ${id}: el primer tramo debe iniciar en 0`);
    const ids = new Set();
    for (const t of tramos) {
      if (!t.id) err.push(`Esquema ${id}: tramo sin id`);
      if (ids.has(t.id)) err.push(`Esquema ${id}: tramo repetido ${t.id}`);
      ids.add(t.id);
      if (!Number.isFinite(t.desde) || t.desde < 0) err.push(`Esquema ${id}: tramo ${t.id} con umbral inválido`);
      for (const l of LINEAS) {
        for (const c of CANALES) {
          const v = e.celdas?.[t.id]?.[l]?.[c];
          if (!esPct(v)) err.push(`Esquema ${id}: celda ${t.id}/${l}/${c} inválida (${v})`);
        }
      }
    }
  }
  if (e.bonos?.mix?.activo) {
    if (!esPct(e.bonos.mix.umbralRetail)) err.push(`Esquema ${id}: bono mix con umbral inválido`);
    if (!esPct(e.bonos.mix.pct)) err.push(`Esquema ${id}: bono mix con porcentaje inválido`);
  }
  if (e.bonos?.clienteNuevo?.activo) {
    if (!Number.isFinite(e.bonos.clienteNuevo.monto) || e.bonos.clienteNuevo.monto < 0) err.push(`Esquema ${id}: bono cliente nuevo con monto inválido`);
    if (!Number.isInteger(e.bonos.clienteNuevo.maximo) || e.bonos.clienteNuevo.maximo < 0) err.push(`Esquema ${id}: bono cliente nuevo con máximo inválido`);
  }
  if (e.tope?.activo && (!Number.isFinite(e.tope.monto) || e.tope.monto < 0)) err.push(`Esquema ${id}: tope inválido`);
  return err;
}

/** @returns {string[]} errores; vacío si la política es válida */
export function validarPolitica(p) {
  const err = [];
  const id = p?.id ?? '?';
  if (!p || typeof p !== 'object') return ['Política inválida'];
  if (!p.version) err.push(`Política ${id}: falta version`);
  if (!esFechaISO(p.vigenteDesde)) err.push(`Política ${id}: vigenteDesde inválida (${p.vigenteDesde})`);
  if (!MODOS_POLITICA.includes(p.modo)) err.push(`Política ${id}: modo debe ser ${MODOS_POLITICA.join(' o ')}`);
  if (!REGLAS_TRANSICION.includes(p.reglaTransicion)) err.push(`Política ${id}: reglaTransicion debe ser ${REGLAS_TRANSICION.join(' o ')}`);
  if (p.pctAnticipo != null && !esPct(p.pctAnticipo)) err.push(`Política ${id}: pctAnticipo inválido`);
  if (p.modo === 'cobro') {
    const ts = tramosPolitica(p);
    if (!ts.length) err.push(`Política ${id}: sin tramos de días`);
    let prev = -1;
    for (const t of ts) {
      if (!Number.isInteger(t.hastaDias) || t.hastaDias <= prev) err.push(`Política ${id}: tramo de días inválido (${t.hastaDias})`);
      if (!esPct(t.factor)) err.push(`Política ${id}: factor inválido en tramo hasta ${t.hastaDias} días`);
      prev = t.hastaDias;
    }
    if (p.caducidadDias != null && (!Number.isInteger(p.caducidadDias) || p.caducidadDias < prev)) {
      err.push(`Política ${id}: caducidadDias debe ser entero y no menor que el último tramo (${prev})`);
    }
  }
  return err;
}
