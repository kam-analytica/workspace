/**
 * Repositorio: operaciones de negocio sobre el almacén (carga y reemplazo del dataset, versiones de parámetros,
 * cierres, ajustes, bitácora, respaldo). Toda mutación pasa por aquí y deja rastro en la bitácora.
 * @module data/repositorio
 */
import { COLECCIONES_DATASET, VERSION_ESQUEMA_DATOS, migrarDataset } from './migrations.js';
import { crearRespaldo, leerRespaldo } from './respaldo.js';
import { validarEsquema, validarPolitica } from '../engine/parametros.js';

export const ROLES = ['Finanzas', 'Gerencia Financiera', 'Consulta'];

export class Repositorio {
  /**
   * @param {object} almacen AlmacenIndexedDB o AlmacenMemoria
   * @param {{ahora?:()=>string, usuario?:()=>string}} deps reloj y usuario actual (inyectados para pruebas)
   */
  constructor(almacen, { ahora = () => new Date().toISOString().slice(0, 19), usuario = () => 'Finanzas' } = {}) {
    this.almacen = almacen;
    this.ahora = ahora;
    this.usuario = usuario;
  }

  async registrar(accion, entidad, detalle, extra = {}) {
    const entrada = { fechaHora: this.ahora(), usuario: this.usuario(), accion, entidad, detalle, ...extra };
    await this.almacen.guardar('bitacora', entrada);
    return entrada;
  }

  async leerBitacora({ entidad, usuario, desde, hasta, texto } = {}) {
    let filas = await this.almacen.obtenerTodos('bitacora');
    if (entidad) filas = filas.filter((f) => f.entidad === entidad);
    if (usuario) filas = filas.filter((f) => f.usuario === usuario);
    if (desde) filas = filas.filter((f) => f.fechaHora >= desde);
    if (hasta) filas = filas.filter((f) => f.fechaHora <= `${hasta}T23:59:59`);
    if (texto) {
      const t = texto.toLowerCase();
      filas = filas.filter((f) => `${f.accion} ${f.entidad} ${f.detalle}`.toLowerCase().includes(t));
    }
    return filas.sort((a, b) => (a.fechaHora < b.fechaHora ? 1 : a.fechaHora > b.fechaHora ? -1 : (b.id || 0) - (a.id || 0)));
  }

  async leerMeta(clave, porDefecto = null) {
    const m = await this.almacen.obtener('meta', clave);
    return m ? m.valor : porDefecto;
  }

  async guardarMeta(clave, valor) {
    await this.almacen.guardar('meta', { clave, valor });
  }

  /** Dataset completo con la forma que espera el motor. */
  async cargarDataset() {
    const d = {};
    for (const k of COLECCIONES_DATASET) d[k] = await this.almacen.obtenerTodos(k);
    const cierres = await this.almacen.obtenerTodos('cierres');
    d.cierres = Object.fromEntries(cierres.map((c) => [c.periodo, c]));
    d.control = (await this.leerMeta('control')) || {};
    d.liquidaciones = d.liquidaciones.map(({ clave, ...resto }) => resto);
    return d;
  }

  async hayDatos() {
    return (await this.almacen.contar('facturas')) > 0 || (await this.almacen.contar('vendedores')) > 0;
  }

  /** Reemplaza todo el contenido por un dataset (carga inicial, demo o restauración). */
  async reemplazarDataset(dataset, { origen = 'importación', bitacoraAdicional = [], meta = {} } = {}) {
    const d = migrarDataset(dataset);
    await this.almacen.vaciarTodo();
    for (const k of COLECCIONES_DATASET) {
      if (k === 'liquidaciones') await this.almacen.guardarVarios(k, d[k].map((l) => ({ ...l, clave: `${l.periodo}|${l.vendedorId}` })));
      else await this.almacen.guardarVarios(k, d[k]);
    }
    await this.almacen.guardarVarios('cierres', Object.entries(d.cierres).map(([periodo, c]) => ({ ...c, periodo })));
    await this.guardarMeta('control', d.control);
    await this.guardarMeta('versionDatos', VERSION_ESQUEMA_DATOS);
    await this.guardarMeta('origen', { origen, fecha: this.ahora(), ...meta });
    for (const b of bitacoraAdicional) await this.almacen.guardar('bitacora', { ...b });
    await this.registrar('Reemplazo de datos', 'Datos', `${origen}: ${d.facturas.length} facturas, ${d.cobros.length} cobros, ${d.notasCredito.length} notas de crédito, ${d.vendedores.length} vendedores`);
  }

  /** Agrega entidades (importación en modo agregar). Las claves repetidas se sobrescriben. */
  async agregarEntidades(entidades) {
    let total = 0;
    for (const k of ['vendedores', 'agencias', 'clientes', 'facturas', 'cobros', 'notasCredito']) {
      const lista = entidades[k] || [];
      if (lista.length) await this.almacen.guardarVarios(k, lista);
      total += lista.length;
    }
    await this.registrar('Importación de datos', 'Datos', `${total} registros agregados o actualizados`);
    return total;
  }

  async guardarControl(control) {
    const previo = (await this.leerMeta('control')) || {};
    await this.guardarMeta('control', control);
    await this.registrar('Cambio de umbrales de control', 'Control', `${JSON.stringify(previo)} → ${JSON.stringify(control)}`);
  }

  /** Nueva versión de esquema (append-only). Las versiones existentes no se modifican. */
  async guardarVersionEsquema(esquema) {
    const errores = validarEsquema(esquema);
    if (errores.length) throw new Error(`Esquema inválido: ${errores.join('; ')}`);
    const existentes = await this.almacen.obtenerTodos('esquemas');
    if (existentes.some((e) => e.id === esquema.id)) throw new Error(`Ya existe un esquema con id ${esquema.id}; cree una versión nueva`);
    const registro = { ...esquema, autor: esquema.autor || this.usuario(), fecha: esquema.fecha || this.ahora() };
    await this.almacen.guardar('esquemas', registro);
    await this.registrar('Nueva versión', 'EsquemaComisiones', `v${registro.version} vigente desde ${registro.vigenteDesde}${registro.comentario ? ` · ${registro.comentario}` : ''}`);
    return registro;
  }

  async guardarVersionPolitica(politica) {
    const errores = validarPolitica(politica);
    if (errores.length) throw new Error(`Política inválida: ${errores.join('; ')}`);
    const existentes = await this.almacen.obtenerTodos('politicas');
    if (existentes.some((p) => p.id === politica.id)) throw new Error(`Ya existe una política con id ${politica.id}; cree una versión nueva`);
    const registro = { ...politica, autor: politica.autor || this.usuario(), fecha: politica.fecha || this.ahora() };
    await this.almacen.guardar('politicas', registro);
    await this.registrar('Nueva versión', 'PoliticaCobranza', `v${registro.version} vigente desde ${registro.vigenteDesde} · transición ${registro.reglaTransicion}${registro.comentario ? ` · ${registro.comentario}` : ''}`);
    return registro;
  }

  async guardarAjuste(ajuste) {
    if (!ajuste.motivo || !String(ajuste.motivo).trim()) throw new Error('El ajuste manual requiere motivo (R-06)');
    if (!ajuste.periodo || !ajuste.vendedorId || !Number.isFinite(Number(ajuste.monto))) throw new Error('Ajuste incompleto: período, vendedor y monto son obligatorios');
    const cierre = await this.almacen.obtener('cierres', ajuste.periodo);
    if (cierre?.snapshot) throw new Error(`El período ${ajuste.periodo} está aprobado; reábralo con motivo antes de ajustar`);
    const registro = { ...ajuste, id: ajuste.id || `AJ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, autor: ajuste.autor || this.usuario(), fecha: ajuste.fecha || this.ahora().slice(0, 10) };
    await this.almacen.guardar('ajustes', registro);
    await this.registrar('Ajuste manual', 'Liquidacion', `${registro.periodo} · ${registro.vendedorId} · ${Number(registro.monto).toFixed(2)} · ${registro.motivo}`, { periodo: registro.periodo, vendedorId: registro.vendedorId });
    return registro;
  }

  async eliminarAjuste(id, motivo) {
    const aj = await this.almacen.obtener('ajustes', id);
    if (!aj) return;
    const cierre = await this.almacen.obtener('cierres', aj.periodo);
    if (cierre?.snapshot) throw new Error(`El período ${aj.periodo} está aprobado; no se puede eliminar el ajuste`);
    await this.almacen.eliminar('ajustes', id);
    await this.registrar('Eliminación de ajuste', 'Liquidacion', `${aj.periodo} · ${aj.vendedorId} · ${Number(aj.monto).toFixed(2)} · motivo: ${motivo || 'sin motivo'}`);
  }

  /** Estado de flujo por vendedor y período: calculada → validada → aprobada → en_rol. */
  async cambiarEstadoLiquidacion(periodo, vendedorId, estado) {
    const orden = ['calculada', 'validada', 'aprobada', 'en_rol'];
    if (!orden.includes(estado)) throw new Error(`Estado inválido: ${estado}`);
    const clave = `${periodo}|${vendedorId}`;
    const previo = (await this.almacen.obtener('liquidaciones', clave)) || { periodo, vendedorId, estado: 'calculada' };
    await this.almacen.guardar('liquidaciones', { ...previo, clave, estado, fechaEstado: this.ahora(), usuario: this.usuario() });
    await this.registrar('Cambio de estado', 'Liquidacion', `${periodo} · ${vendedorId} · ${previo.estado} → ${estado}`, { periodo, vendedorId });
  }

  /** Aprueba y bloquea un período guardando el snapshot calculado por el motor (D-09). */
  async aprobarPeriodo(periodo, snapshot, { motivo = null } = {}) {
    const existente = await this.almacen.obtener('cierres', periodo);
    if (existente?.snapshot) throw new Error(`El período ${periodo} ya está aprobado`);
    const cierre = { periodo, fecha: this.ahora().slice(0, 10), autor: this.usuario(), motivo, snapshot };
    await this.almacen.guardar('cierres', cierre);
    for (const v of Object.keys(snapshot.vendedores || {})) {
      await this.almacen.guardar('liquidaciones', { clave: `${periodo}|${v}`, periodo, vendedorId: v, estado: 'aprobada', fechaEstado: this.ahora(), usuario: this.usuario() });
    }
    await this.registrar('Aprobación de período', 'Liquidacion', `Período ${periodo} aprobado y bloqueado · esquema ${snapshot.esquemaVersion || '?'} · ${Object.keys(snapshot.vendedores || {}).length} vendedores`, { periodo });
    return cierre;
  }

  async generarRol(periodo) {
    const cierre = await this.almacen.obtener('cierres', periodo);
    if (!cierre?.snapshot) throw new Error(`El período ${periodo} no está aprobado`);
    for (const v of Object.keys(cierre.snapshot.vendedores || {})) await this.cambiarEstadoLiquidacion(periodo, v, 'en_rol');
    await this.registrar('Generación de rol', 'Liquidacion', `Rol del período ${periodo} generado`, { periodo });
  }

  /** Reabre un período aprobado. Exige motivo (R-07). */
  async reabrirPeriodo(periodo, motivo) {
    if (!motivo || !String(motivo).trim()) throw new Error('Reabrir un período exige motivo (R-07)');
    const cierre = await this.almacen.obtener('cierres', periodo);
    if (!cierre?.snapshot) throw new Error(`El período ${periodo} no está aprobado`);
    await this.almacen.eliminar('cierres', periodo);
    for (const v of Object.keys(cierre.snapshot.vendedores || {})) {
      await this.almacen.guardar('liquidaciones', { clave: `${periodo}|${v}`, periodo, vendedorId: v, estado: 'calculada', fechaEstado: this.ahora(), usuario: this.usuario() });
    }
    await this.registrar('Reapertura de período', 'Liquidacion', `Período ${periodo} reabierto · aprobado el ${cierre.fecha} por ${cierre.autor} · motivo: ${motivo}`, { periodo });
  }

  async exportarRespaldo(meta = {}) {
    const dataset = await this.cargarDataset();
    const bitacora = await this.almacen.obtenerTodos('bitacora');
    const respaldo = crearRespaldo({ dataset, bitacora, meta: { ...meta, versionDatos: VERSION_ESQUEMA_DATOS } }, this.ahora());
    await this.registrar('Exportación de respaldo', 'Datos', `${dataset.facturas.length} facturas · ${bitacora.length} entradas de bitácora`);
    return respaldo;
  }

  async restaurarRespaldo(texto) {
    const { dataset, bitacora, generado, versionOrigen } = leerRespaldo(texto);
    await this.reemplazarDataset(dataset, { origen: `restauración de respaldo generado ${generado || 'sin fecha'} (versión ${versionOrigen})`, bitacoraAdicional: bitacora.map(({ id, ...b }) => b) });
    return { facturas: dataset.facturas.length, bitacora: bitacora.length };
  }

  async borrarTodo(confirmacion) {
    if (confirmacion !== 'BORRAR') throw new Error('Confirmación inválida');
    await this.almacen.vaciarTodo();
    await this.registrar('Borrado total', 'Datos', 'Todos los datos fueron eliminados por el usuario');
  }
}
