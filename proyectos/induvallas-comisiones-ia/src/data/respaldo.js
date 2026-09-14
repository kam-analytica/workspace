/**
 * Respaldo y restauración JSON del estado completo (dataset, bitácora, metadatos) con versión de esquema.
 * @module data/respaldo
 */
import { VERSION_ESQUEMA_DATOS, migrarDataset } from './migrations.js';

export const TIPO_RESPALDO = 'kam.comisiones-ia.induvallas';

export function crearRespaldo({ dataset, bitacora = [], meta = {} }, fechaHora) {
  return {
    tipo: TIPO_RESPALDO,
    version: VERSION_ESQUEMA_DATOS,
    generado: fechaHora,
    meta,
    dataset,
    bitacora,
  };
}

export function serializarRespaldo(respaldo) {
  return JSON.stringify(respaldo);
}

/**
 * Valida y migra un respaldo. Lanza Error con mensaje en español si el archivo no es un respaldo válido.
 */
export function leerRespaldo(texto) {
  let obj;
  try {
    obj = typeof texto === 'string' ? JSON.parse(texto) : texto;
  } catch (e) {
    throw new Error('El archivo no es un JSON válido');
  }
  if (!obj || obj.tipo !== TIPO_RESPALDO) throw new Error('El archivo no es un respaldo de kam. Comisiones IA');
  if (!Number.isInteger(obj.version) || obj.version < 1) throw new Error('Versión de respaldo inválida');
  if (obj.version > VERSION_ESQUEMA_DATOS) throw new Error(`El respaldo es de una versión más nueva (${obj.version}) que esta herramienta (${VERSION_ESQUEMA_DATOS})`);
  const dataset = migrarDataset(obj.dataset || {}, obj.version);
  const requeridos = ['vendedores', 'facturas', 'esquemas', 'politicas'];
  for (const k of requeridos) if (!Array.isArray(dataset[k])) throw new Error(`El respaldo no contiene la colección "${k}"`);
  return { dataset, bitacora: Array.isArray(obj.bitacora) ? obj.bitacora : [], meta: obj.meta || {}, generado: obj.generado || null, versionOrigen: obj.version };
}
