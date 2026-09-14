/**
 * Acciones con efecto en el repositorio: ejecutan, recargan el dataset, recalculan y notifican.
 * @module ui/acciones
 */
import { estado, recalcular, emitir } from './estado.js';
import { toast } from './dom.js';
import { generarDatosDemo, HOY_DEMO } from '../seed/demo.js';

/** Ejecuta fn(repo); si tiene éxito recarga y recalcula. Devuelve el resultado de fn o null si falló. */
export async function mutar(fn, mensajeOk = null) {
  if (!estado.repo) return null;
  try {
    const r = await fn(estado.repo);
    estado.dataset = await estado.repo.cargarDataset();
    recalcular();
    if (mensajeOk) toast(mensajeOk, 'ok');
    return r ?? true;
  } catch (e) {
    console.error(e);
    toast(e.message || 'La operación falló', 'error');
    return null;
  }
}

export async function cambiarFechaReferencia(fecha) {
  if (!fecha || fecha === estado.hoy) return;
  const anterior = estado.hoy;
  estado.hoy = fecha;
  await estado.repo?.guardarMeta('hoy', fecha);
  await estado.repo?.registrar('Cambio de fecha de referencia', 'Control', `${anterior} → ${fecha}`);
  recalcular({ conservarPeriodo: false });
  emitir('referencia');
}

const CLAVE_AUTOCARGA = 'kam.demo.autocarga';

/** La demo se carga sola al abrir sin datos, salvo que el usuario haya borrado los datos a propósito. */
export function autocargaDemoActiva() {
  try {
    return localStorage.getItem(CLAVE_AUTOCARGA) !== '0';
  } catch (e) {
    return true;
  }
}

export function desactivarAutocargaDemo() {
  try {
    localStorage.setItem(CLAVE_AUTOCARGA, '0');
  } catch (e) {
    /* sin localStorage */
  }
}

/** Reemplaza el almacén por el dataset ficticio de demostración y fija la fecha de referencia de la demo. */
export async function cargarDatosDemo({ automatica = false } = {}) {
  const { dataset, bitacora, meta } = generarDatosDemo();
  const r = await mutar(async (repo) => {
    await repo.reemplazarDataset(dataset, { origen: 'datos de demostración (ficticios)', bitacoraAdicional: bitacora, meta: { semilla: meta.semilla, automatica } });
    await repo.guardarMeta('hoy', HOY_DEMO);
    if (automatica) await repo.registrar('Carga automática de la demostración', 'Datos', 'Versión de demostración: los datos ficticios del ejercicio se cargan al abrir la herramienta sin datos');
  }, automatica ? 'Versión de demostración: datos ficticios cargados automáticamente' : 'Datos de demostración cargados');
  if (r === null) return null;
  estado.hoy = HOY_DEMO;
  estado.origen = await estado.repo.leerMeta('origen');
  recalcular({ conservarPeriodo: false });
  return true;
}
