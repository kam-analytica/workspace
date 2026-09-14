/**
 * Fechas como cadenas ISO 'YYYY-MM-DD' y períodos 'YYYY-MM'. Todo en UTC; nunca objetos Date persistidos.
 * @module engine/dates
 */
const MS_DIA = 86400000;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_PERIODO = /^(\d{4})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, '0');

/** Último día del mes (m entre 1 y 12). */
export function ultimoDiaMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function esFechaISO(s) {
  if (typeof s !== 'string') return false;
  const m = RE_ISO.exec(s);
  if (!m) return false;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12) return false;
  return dia >= 1 && dia <= ultimoDiaMes(anio, mes);
}

export function esPeriodo(s) {
  if (typeof s !== 'string') return false;
  const m = RE_PERIODO.exec(s);
  if (!m) return false;
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12;
}

const cacheDias = new Map();

/** Días transcurridos desde la época Unix (entero). Memoizado: función pura sobre cadenas ISO. */
export function aDias(iso) {
  let v = cacheDias.get(iso);
  if (v === undefined) {
    const [a, m, d] = iso.split('-').map(Number);
    v = Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
    if (cacheDias.size > 50000) cacheDias.clear();
    cacheDias.set(iso, v);
  }
  return v;
}

const cacheISO = new Map();

export function desdeDias(n) {
  let v = cacheISO.get(n);
  if (v === undefined) {
    v = new Date(n * MS_DIA).toISOString().slice(0, 10);
    if (cacheISO.size > 50000) cacheISO.clear();
    cacheISO.set(n, v);
  }
  return v;
}

/** Días calendario entre dos fechas; el mismo día es 0 (S-08). */
export function diasEntre(desde, hasta) {
  return aDias(hasta) - aDias(desde);
}

export function sumarDias(iso, n) {
  return desdeDias(aDias(iso) + n);
}

export function siguientePeriodo(p) {
  let [a, m] = p.split('-').map(Number);
  m += 1;
  if (m > 12) {
    m = 1;
    a += 1;
  }
  return `${a}-${pad(m)}`;
}

export function anteriorPeriodo(p) {
  let [a, m] = p.split('-').map(Number);
  m -= 1;
  if (m < 1) {
    m = 12;
    a -= 1;
  }
  return `${a}-${pad(m)}`;
}

/**
 * Período al que pertenece una fecha. Con diaCorte nulo, mes calendario.
 * Con diaCorte = 25, las fechas del 26 en adelante pertenecen al período siguiente.
 */
export function periodoDeFecha(iso, diaCorte = null) {
  if (!diaCorte) return iso.slice(0, 7);
  const [a, m, d] = iso.split('-').map(Number);
  const p = `${a}-${pad(m)}`;
  const corte = Math.min(diaCorte, ultimoDiaMes(a, m));
  return d <= corte ? p : siguientePeriodo(p);
}

/** Fecha de corte de un período (por defecto último día del mes). */
export function fechaCorte(periodo, diaCorte = null) {
  const [a, m] = periodo.split('-').map(Number);
  const dia = diaCorte ? Math.min(diaCorte, ultimoDiaMes(a, m)) : ultimoDiaMes(a, m);
  return `${a}-${pad(m)}-${pad(dia)}`;
}

/** Lista de períodos consecutivos entre dos períodos inclusive. */
export function rangoPeriodos(desde, hasta) {
  const out = [];
  let p = desde;
  while (p <= hasta && out.length < 1200) {
    out.push(p);
    p = siguientePeriodo(p);
  }
  return out;
}

export function maxFecha(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function minFecha(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
