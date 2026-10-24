import type { ISODate } from './types';

/** Redondeo a entero, mitad lejos de cero (igual que round() de PostgreSQL sobre numeric) */
export function roundHalfAway(x: number): number {
  const r = Math.round(Math.abs(x) + 1e-9);
  return x < 0 ? -r : r;
}

export const toCents = (amount: number): number => roundHalfAway(amount * 100);

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fecha local del dispositivo en formato YYYY-MM-DD */
export function todayLocal(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Minúsculas y sin tildes, para búsquedas locales */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesQuery(haystack: string, query: string): boolean {
  const h = normalizeText(haystack);
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => h.includes(term));
}
