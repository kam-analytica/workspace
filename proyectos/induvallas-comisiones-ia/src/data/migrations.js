/**
 * Versionado del esquema de datos (D-10). Dos planos:
 * - Estructura de IndexedDB: stores y claves, aplicada en `onupgradeneeded` por número de versión.
 * - Forma del dataset (respaldos JSON y datos en stores): migraciones secuenciales de contenido.
 * @module data/migrations
 */
export const VERSION_ESQUEMA_DATOS = 1;
export const VERSION_DB = 1;
export const NOMBRE_DB = 'comisiones_ia_induvallas';

/** Stores de IndexedDB con su clave. `bitacora` usa clave autoincremental. */
export const STORES = {
  vendedores: { keyPath: 'id' },
  agencias: { keyPath: 'id' },
  clientes: { keyPath: 'id' },
  facturas: { keyPath: 'numero' },
  cobros: { keyPath: 'id' },
  notasCredito: { keyPath: 'numero' },
  esquemas: { keyPath: 'id' },
  politicas: { keyPath: 'id' },
  ajustes: { keyPath: 'id' },
  cierres: { keyPath: 'periodo' },
  liquidaciones: { keyPath: 'clave' },
  bitacora: { keyPath: 'id', autoIncrement: true },
  meta: { keyPath: 'clave' },
};

export const COLECCIONES_DATASET = ['vendedores', 'agencias', 'clientes', 'facturas', 'cobros', 'notasCredito', 'esquemas', 'politicas', 'ajustes', 'liquidaciones'];

/** Migraciones de estructura de IndexedDB, por versión destino. */
export const MIGRACIONES_DB = [
  {
    version: 1,
    aplicar(db) {
      for (const [nombre, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(nombre)) db.createObjectStore(nombre, def);
      }
    },
  },
];

/** Migraciones de contenido del dataset, de la versión n a n+1. */
export const MIGRACIONES_DATOS = [
  // { desde: 1, aplicar(dataset) { ...; return dataset; } }
];

/** Lleva un dataset desde `versionOrigen` hasta VERSION_ESQUEMA_DATOS. Devuelve una copia normalizada. */
export function migrarDataset(dataset, versionOrigen = VERSION_ESQUEMA_DATOS) {
  let d = { ...dataset };
  for (let v = versionOrigen; v < VERSION_ESQUEMA_DATOS; v++) {
    const m = MIGRACIONES_DATOS.find((x) => x.desde === v);
    if (!m) throw new Error(`No existe migración de datos desde la versión ${v}`);
    d = m.aplicar(d);
  }
  for (const k of COLECCIONES_DATASET) if (!Array.isArray(d[k])) d[k] = [];
  if (!d.cierres || typeof d.cierres !== 'object') d.cierres = {};
  if (!d.control || typeof d.control !== 'object') d.control = {};
  return d;
}
