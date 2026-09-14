/**
 * Importación de la plantilla Excel: lee el libro, extrae las filas de cada hoja y delega en validacion.js.
 * @module data/importar
 */
import { HOJAS, validarImportacion, normalizarEncabezado } from './validacion.js';

/** Localiza una hoja por nombre tolerante (sin acentos, espacios ni mayúsculas). */
function buscarHoja(wb, nombre) {
  const objetivo = normalizarEncabezado(nombre).replace(/_/g, '');
  for (const n of wb.SheetNames) if (normalizarEncabezado(n).replace(/_/g, '') === objetivo) return wb.Sheets[n];
  const alias = { notascredito: ['nc', 'notas', 'notasdecredito'], cobros: ['pagos', 'cobranza'] };
  for (const [k, lista] of Object.entries(alias)) {
    if (k !== objetivo) continue;
    for (const n of wb.SheetNames) if (lista.includes(normalizarEncabezado(n).replace(/_/g, ''))) return wb.Sheets[n];
  }
  return null;
}

/**
 * Lee un archivo xlsx (ArrayBuffer, Uint8Array o Buffer) y devuelve filas crudas por hoja y las hojas faltantes.
 */
export function leerLibro(XLSX, datos) {
  const tipo = typeof datos === 'string' ? 'binary' : 'array';
  const wb = XLSX.read(datos, { type: tipo, raw: true, cellDates: false });
  const hojas = {};
  const faltantes = [];
  for (const h of HOJAS) {
    const ws = buscarHoja(wb, h);
    if (!ws) {
      faltantes.push(h);
      hojas[h] = [];
      continue;
    }
    hojas[h] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, blankrows: false });
  }
  return { hojas, faltantes, nombres: wb.SheetNames };
}

/**
 * Importa un archivo de plantilla completo.
 * @param {object} XLSX
 * @param {ArrayBuffer|Uint8Array} datos
 * @param {{existente?:object, modo?:'reemplazar'|'agregar', cierres?:object}} ctx
 */
export function importarPlantilla(XLSX, datos, ctx = {}) {
  const { hojas, faltantes, nombres } = leerLibro(XLSX, datos);
  const resultado = validarImportacion(hojas, ctx);
  for (const h of faltantes) {
    const obligatoria = ['Vendedores', 'Clientes', 'Facturas'].includes(h) && (ctx.modo || 'reemplazar') === 'reemplazar';
    (obligatoria ? resultado.errores : resultado.advertencias).push({ hoja: h, fila: null, campo: null, codigo: obligatoria ? 'E-HOJA' : 'A-HOJA', mensaje: `No se encontró la hoja "${h}" en el archivo`, valor: nombres.join(', ') });
  }
  resultado.valido = resultado.errores.length === 0;
  resultado.faltantes = faltantes;
  return resultado;
}
