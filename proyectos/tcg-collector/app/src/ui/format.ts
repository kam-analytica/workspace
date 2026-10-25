import type { AcquisitionChannel, Condition, DisposalChannel, Finish, ISODate } from '../domain/types';

const usd = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const pctFmt = new Intl.NumberFormat('es-EC', { style: 'percent', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });

export const money = (cents: number | null | undefined): string => (cents == null ? '—' : usd.format(cents / 100));

/** Con signo explícito: +$1,20 / −$3,24 */
export function signedMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  if (cents === 0) return usd.format(0);
  return `${cents > 0 ? '+' : '−'}${usd.format(Math.abs(cents) / 100)}`;
}

export const pct = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : pctFmt.format(x));

/** Fecha corta. Una fecha 'YYYY-MM-DD' se muestra tal cual; un instante ISO, en la zona horaria del dispositivo */
export const shortDate = (d: ISODate | string | null | undefined): string => {
  if (!d) return '—';
  return dateFmt.format(d.length > 10 ? new Date(d) : new Date(`${d}T12:00:00`));
};

/** «12,50» o «12.50» → centavos; null si vacío; NaN si no es un número */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/\s|\$/g, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export const centsToInput = (cents: number | null | undefined): string =>
  cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');

export const FINISH_LABEL: Record<Finish, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverse_holofoil: 'Reverse holo',
  first_edition_normal: '1.ª edición',
  first_edition_holofoil: '1.ª edición holo',
  sealed: 'Sellado',
};

export const CONDITION_LABEL: Record<Condition, string> = {
  NM: 'NM · Casi nueva',
  LP: 'LP · Poco jugada',
  MP: 'MP · Jugada',
  HP: 'HP · Muy jugada',
  DMG: 'DMG · Dañada',
};

export const LANGUAGES: [string, string][] = [
  ['es', 'Español'],
  ['en', 'Inglés'],
  ['pt', 'Portugués'],
  ['fr', 'Francés'],
  ['de', 'Alemán'],
  ['it', 'Italiano'],
  ['ja', 'Japonés'],
];
export const languageLabel = (code: string) => LANGUAGES.find(([c]) => c === code)?.[1] ?? code;

export const ACQUISITION_LABEL: Record<AcquisitionChannel, string> = {
  purchase: 'Compra',
  pack_pull: 'Sacada de un sobre',
  trade: 'Intercambio',
  gift: 'Regalo',
  other: 'Otro',
};

export const DISPOSAL_LABEL: Record<DisposalChannel, string> = {
  sale: 'Venta',
  trade: 'Intercambio',
  gift: 'Regalo',
  loss: 'Pérdida',
  opened: 'Apertura',
  other: 'Otro',
};

export const SOURCE_LABEL: Record<string, string> = {
  tcgplayer: 'TCGplayer',
  cardmarket: 'Cardmarket',
  manual: 'Valor manual',
};

export const LEVEL_TEXT: Record<1 | 2 | 3, string> = {
  1: 'Mercado activo, misma carta',
  2: 'Aproximación (otro mercado, idioma o estado)',
  3: 'Estimación manual',
};
