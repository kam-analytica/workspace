/**
 * Acciones con efecto en el repositorio: ejecutan, recargan el dataset, recalculan y notifican.
 * @module ui/acciones
 */
import { estado, recalcular, emitir } from './estado.js';
import { toast } from './dom.js';

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
