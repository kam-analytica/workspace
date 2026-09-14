/**
 * Formato es-EC (D-14): único punto de formato de cifras y fechas. Montos de entrada en centavos.
 * @module ui/format
 */
const nf2 = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 });
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NBSP = ' ';

export const LINEA_NOMBRE = { vallas: 'Vallas', led: 'Pantallas LED', retail: 'Retail Media' };
export const CANAL_NOMBRE = { directo: 'Directo', agencia: 'Agencia' };
export const ESTADO_FACTURA = { emitida: 'Emitida', cobrada_parcial: 'Cobro parcial', cobrada: 'Cobrada', anulada: 'Anulada', caducada: 'Caducada' };
export const ESTADO_LIQ = { calculada: 'Calculada', validada: 'Validada', aprobada: 'Aprobada', en_rol: 'En rol' };

/** "USD 45.230,50" desde centavos. */
export function usd(centavos) {
  return `USD${NBSP}${nf2.format((centavos || 0) / 100)}`;
}

/** "45.230,50" desde centavos (para tablas). */
export function moneda(centavos) {
  return nf2.format((centavos || 0) / 100);
}

/** Con signo explícito: "+1.200,00" / "−1.200,00". */
export function monedaSigno(centavos) {
  const c = centavos || 0;
  if (c === 0) return nf2.format(0);
  return (c > 0 ? '+' : '−') + nf2.format(Math.abs(c) / 100);
}

/** "108,4 %" desde decimal (1.084). */
export function pct(decimal, decimales = 1) {
  if (decimal == null || !Number.isFinite(decimal)) return '—';
  const nf = new Intl.NumberFormat('es-EC', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${nf.format(decimal * 100)}${NBSP}%`;
}

/** Porcentaje con hasta 3 decimales, sin ceros de relleno: "1,125 %". */
export function pctCelda(decimal) {
  if (decimal == null) return '—';
  const nf = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return `${nf.format(decimal * 100)}${NBSP}%`;
}

export function entero(n) {
  return nf0.format(n || 0);
}

export function numero(n, decimales = 2) {
  const nf = new Intl.NumberFormat('es-EC', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return nf.format(n || 0);
}

/** "14-sep-2026" desde ISO. */
export function fecha(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}-${MESES[Number(m) - 1]}-${a}`;
}

export function fechaHora(iso) {
  if (!iso) return '—';
  const [f, h] = iso.split('T');
  return `${fecha(f)} ${h ? h.slice(0, 5) : ''}`.trim();
}

/** "agosto 2026" */
export function periodoLargo(p) {
  if (!p) return '—';
  const [a, m] = p.split('-');
  return `${MESES_LARGO[Number(m) - 1]} ${a}`;
}

/** "ago-2026" */
export function periodoCorto(p) {
  if (!p) return '—';
  const [a, m] = p.split('-');
  return `${MESES[Number(m) - 1]}-${a}`;
}

export function dias(n) {
  if (n == null) return '—';
  return `${entero(n)} ${Math.abs(n) === 1 ? 'día' : 'días'}`;
}

/** Variación relativa entre dos cifras; null si no es calculable. */
export function variacion(actual, anterior) {
  if (!anterior) return null;
  return (actual - anterior) / Math.abs(anterior);
}

export function nombreLinea(l) {
  return LINEA_NOMBRE[l] || l || '—';
}

export function nombreCanal(c) {
  return CANAL_NOMBRE[c] || c || '—';
}

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ahoraISO() {
  const d = new Date();
  return `${hoyISO()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
