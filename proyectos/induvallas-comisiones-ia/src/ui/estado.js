/**
 * Estado de la aplicación y bus de eventos mínimo. Toda mutación de datos pasa por el repositorio y termina en recalcular().
 * @module ui/estado
 */
import { computeTodo, EngineError } from '../engine/index.js';
import { periodoDeFecha, anteriorPeriodo } from '../engine/dates.js';
import { versionVigente } from '../engine/versiones.js';
import { hoyISO } from './format.js';

export const ROLES = ['Finanzas', 'Gerencia Financiera', 'Consulta'];

const PERMISOS = {
  Finanzas: ['datos', 'parametros', 'ajustes', 'validar', 'referencia'],
  'Gerencia Financiera': ['datos', 'parametros', 'ajustes', 'validar', 'aprobar', 'reabrir', 'rol', 'referencia'],
  Consulta: [],
};

export const estado = {
  rol: null,
  repo: null,
  almacen: null,
  dataset: null,
  resultado: null,
  hoy: hoyISO(),
  periodo: null,
  vendedorId: null,
  pestana: 'panel',
  origen: null,
  errores: null,
  version: typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev',
};

const oyentes = new Map();
export function on(evento, fn) {
  if (!oyentes.has(evento)) oyentes.set(evento, new Set());
  oyentes.get(evento).add(fn);
  return () => oyentes.get(evento).delete(fn);
}
export function emitir(evento, datos) {
  for (const fn of oyentes.get(evento) || []) {
    try {
      fn(datos);
    } catch (e) {
      console.error(`Error en oyente de ${evento}`, e);
    }
  }
}

export function puede(accion) {
  return (PERMISOS[estado.rol] || []).includes(accion);
}

export function esDemo() {
  return /demostraci/i.test(estado.origen?.origen || '');
}

export function hayDatos() {
  return !!(estado.dataset && (estado.dataset.facturas.length || estado.dataset.vendedores.length));
}

export function periodos() {
  return estado.resultado?.meta?.periodos || [];
}

export function resultadoPeriodo(p = estado.periodo) {
  return estado.resultado?.periodos?.[p] || null;
}

export function vendedores() {
  const lista = [...(estado.dataset?.vendedores || [])];
  return lista.sort((a, b) => (a.activo === false) - (b.activo === false) || a.nombre.localeCompare(b.nombre, 'es'));
}

const mapa = (lista, clave = 'id') => new Map((lista || []).map((x) => [x[clave], x]));
export function nombreVendedor(id) {
  return mapa(estado.dataset?.vendedores).get(id)?.nombre || id || '—';
}
export function nombreCliente(id) {
  return mapa(estado.dataset?.clientes).get(id)?.nombre || id || '—';
}
export function nombreAgencia(id) {
  return mapa(estado.dataset?.agencias).get(id)?.nombre || id || '—';
}
export function vendedor(id) {
  return mapa(estado.dataset?.vendedores).get(id) || null;
}

export function esquemaVigente(p = estado.periodo) {
  const per = resultadoPeriodo(p);
  if (per?.esquemaId) return (estado.dataset.esquemas || []).find((e) => e.id === per.esquemaId) || null;
  return versionVigente(estado.dataset?.esquemas || [], `${p}-28`);
}

export function politicaVigente(p = estado.periodo) {
  const per = resultadoPeriodo(p);
  const lista = per?.politicas || [];
  const ultima = lista[lista.length - 1];
  return ultima ? (estado.dataset.politicas || []).find((x) => x.id === ultima.id) || null : versionVigente(estado.dataset?.politicas || [], `${p}-28`);
}

export function periodoAprobado(p = estado.periodo) {
  return !!estado.dataset?.cierres?.[p]?.snapshot;
}

export function estadoLiquidacion(p, vendedorId) {
  return (estado.dataset?.liquidaciones || []).find((l) => l.periodo === p && l.vendedorId === vendedorId)?.estado || 'calculada';
}

/** Recalcula todo con el motor. Devuelve true si tuvo éxito. */
export function recalcular({ conservarPeriodo = true } = {}) {
  if (!estado.dataset) return false;
  if (!hayDatos()) {
    // Sin vendedores ni facturas no hay nada que calcular (por ejemplo, tras «Borrar todos los datos»).
    estado.resultado = null;
    estado.errores = null;
    emitir('resultado');
    return false;
  }
  try {
    const hastaPeriodo = periodoDeFecha(estado.hoy);
    estado.resultado = computeTodo(estado.dataset, { hoy: estado.hoy, hastaPeriodo });
    estado.errores = null;
  } catch (e) {
    estado.resultado = null;
    estado.errores = e instanceof EngineError ? e.errores : [e.message];
    console.error(e);
    emitir('resultado');
    return false;
  }
  const lista = periodos();
  if (!conservarPeriodo || !estado.periodo || !lista.includes(estado.periodo)) {
    const enCurso = periodoDeFecha(estado.hoy);
    const cerrado = anteriorPeriodo(enCurso);
    estado.periodo = lista.includes(cerrado) ? cerrado : lista[lista.length - 1] || enCurso;
  }
  if (!estado.vendedorId || !estado.dataset.vendedores.some((v) => v.id === estado.vendedorId)) estado.vendedorId = vendedores()[0]?.id || null;
  emitir('resultado');
  return true;
}

export function seleccionarPeriodo(p) {
  if (p === estado.periodo) return;
  estado.periodo = p;
  emitir('periodo');
}

export function seleccionarVendedor(id) {
  if (id === estado.vendedorId) return;
  estado.vendedorId = id;
  emitir('vendedor');
}

export function irA(pestana, extra = {}) {
  if (extra.vendedorId) estado.vendedorId = extra.vendedorId;
  if (extra.periodo) estado.periodo = extra.periodo;
  estado.pestana = pestana;
  emitir('pestana', { pestana, extra });
}
