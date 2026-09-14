/**
 * Acceso a SheetJS (edición comunitaria). En el navegador la biblioteca está embebida como global `XLSX`;
 * en Node (pruebas) se carga el UMD vendorizado. Ningún otro módulo debe importar SheetJS directamente.
 * @module data/xlsx
 */
let promesa = null;

export function cargarXLSX() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (!promesa) {
    promesa = import(/* @vite-ignore */ 'node:module').then(({ createRequire }) => {
      const require = createRequire(import.meta.url);
      return require('../../vendor/xlsx.full.min.cjs');
    });
  }
  return promesa;
}

/** Serial de Excel (días desde 1899-12-30) ↔ ISO. Independiente de la zona horaria. */
const DESFASE_UNIX = 25569;

export function serialAISO(serial) {
  const dias = Math.floor(Number(serial));
  if (!Number.isFinite(dias)) return null;
  return new Date((dias - DESFASE_UNIX) * 86400000).toISOString().slice(0, 10);
}

export function isoASerial(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86400000) + DESFASE_UNIX;
}
