/**
 * Almacenes: IndexedDB (navegador) y memoria (pruebas y respaldo si IndexedDB no está disponible).
 * Ambos exponen la misma API asíncrona mínima; el resto de la capa de datos no conoce IndexedDB.
 * @module data/db
 */
import { NOMBRE_DB, VERSION_DB, STORES, MIGRACIONES_DB } from './migrations.js';

/** Almacén en memoria. */
export class AlmacenMemoria {
  constructor() {
    this.datos = new Map();
    for (const nombre of Object.keys(STORES)) this.datos.set(nombre, new Map());
    this.autoinc = new Map();
    this.tipo = 'memoria';
  }

  clave(store, obj) {
    const def = STORES[store];
    if (def.autoIncrement && obj[def.keyPath] == null) {
      const n = (this.autoinc.get(store) || 0) + 1;
      this.autoinc.set(store, n);
      obj[def.keyPath] = n;
    }
    return obj[def.keyPath];
  }

  async obtenerTodos(store) {
    return [...this.datos.get(store).values()].map((x) => estructurar(x));
  }

  async obtener(store, clave) {
    const v = this.datos.get(store).get(clave);
    return v === undefined ? undefined : estructurar(v);
  }

  async guardar(store, obj) {
    const copia = estructurar(obj);
    const k = this.clave(store, copia);
    this.datos.get(store).set(k, copia);
    return k;
  }

  async guardarVarios(store, objs) {
    for (const o of objs) await this.guardar(store, o);
  }

  async eliminar(store, clave) {
    this.datos.get(store).delete(clave);
  }

  async vaciar(store) {
    this.datos.get(store).clear();
  }

  async vaciarTodo() {
    for (const m of this.datos.values()) m.clear();
    this.autoinc.clear();
  }

  async contar(store) {
    return this.datos.get(store).size;
  }
}

function estructurar(x) {
  return typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
}

/** Almacén sobre IndexedDB. Usar `AlmacenIndexedDB.abrir()`. */
export class AlmacenIndexedDB {
  constructor(db) {
    this.db = db;
    this.tipo = 'indexeddb';
  }

  static disponible() {
    return typeof indexedDB !== 'undefined';
  }

  static abrir({ nombre = NOMBRE_DB, version = VERSION_DB } = {}) {
    return new Promise((resolver, rechazar) => {
      const req = indexedDB.open(nombre, version);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        const desde = ev.oldVersion || 0;
        for (const m of MIGRACIONES_DB) if (m.version > desde && m.version <= version) m.aplicar(db, req.transaction);
      };
      req.onsuccess = () => resolver(new AlmacenIndexedDB(req.result));
      req.onerror = () => rechazar(req.error || new Error('No se pudo abrir IndexedDB'));
      req.onblocked = () => rechazar(new Error('IndexedDB bloqueada por otra pestaña; cierre las demás pestañas de la herramienta'));
    });
  }

  tx(store, modo, fn) {
    return new Promise((resolver, rechazar) => {
      const tx = this.db.transaction(store, modo);
      const os = tx.objectStore(store);
      let resultado;
      try {
        resultado = fn(os);
      } catch (e) {
        rechazar(e);
        return;
      }
      tx.oncomplete = () => resolver(resultado?.result !== undefined ? resultado.result : resultado);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error || new Error('Transacción abortada'));
    });
  }

  obtenerTodos(store) {
    return this.tx(store, 'readonly', (os) => os.getAll());
  }

  obtener(store, clave) {
    return this.tx(store, 'readonly', (os) => os.get(clave));
  }

  guardar(store, obj) {
    return this.tx(store, 'readwrite', (os) => os.put(obj));
  }

  guardarVarios(store, objs) {
    return this.tx(store, 'readwrite', (os) => {
      for (const o of objs) os.put(o);
      return objs.length;
    });
  }

  eliminar(store, clave) {
    return this.tx(store, 'readwrite', (os) => os.delete(clave));
  }

  vaciar(store) {
    return this.tx(store, 'readwrite', (os) => os.clear());
  }

  async vaciarTodo() {
    for (const s of Object.keys(STORES)) await this.vaciar(s);
  }

  contar(store) {
    return this.tx(store, 'readonly', (os) => os.count());
  }

  cerrar() {
    this.db.close();
  }
}

/** Abre IndexedDB si existe; si no, devuelve un almacén en memoria y lo indica. */
export async function abrirAlmacen() {
  if (AlmacenIndexedDB.disponible()) {
    try {
      return await AlmacenIndexedDB.abrir();
    } catch (e) {
      return Object.assign(new AlmacenMemoria(), { advertencia: `IndexedDB no disponible (${e.message}); los datos no se conservarán al cerrar el navegador` });
    }
  }
  return Object.assign(new AlmacenMemoria(), { advertencia: 'Este navegador no ofrece IndexedDB; los datos no se conservarán al cerrar' });
}
