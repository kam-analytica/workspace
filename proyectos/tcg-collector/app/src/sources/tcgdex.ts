// Adaptador de la API pública de TCGdex (https://api.tcgdex.net/v2), gratuita
// y sin clave. Catálogo multilingüe y, en la ficha completa de cada carta,
// precios de TCGplayer (USD) y Cardmarket (EUR) en `pricing`.
//
// La forma de `pricing` no está declarada en el SDK oficial; se toma de las
// mediciones documentadas en @leewinder/mcp-tcgdex 1.0.0 (lib/pricing-shape):
// - tcgplayer: { updated, unit, <impresión>: { lowPrice, midPrice, highPrice, marketPrice, … } }
//   con impresiones normal | holofoil | reverse-holofoil | 1st-edition |
//   1st-edition-holofoil | unlimited | unlimited-holofoil
// - cardmarket: { updated, unit, avg, low, trend, avg1, avg7, avg30, …-holo }
//   donde las columnas «-holo» son el precio del reverse holo.
// Un cero indica columna sin dato y se descarta.

import {
  FINISHES,
  variantIdOf,
  type CatalogItem,
  type Finish,
  type ISODate,
  type PriceKind,
  type PriceObservation,
} from '../domain/types';
import { toCents } from '../domain/util';

export const TCGDEX_API = 'https://api.tcgdex.net/v2';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface CardResume {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface TcgdexCard extends CardResume {
  rarity?: string;
  category?: string;
  set: { id: string; name: string };
  variants?: { normal?: boolean; reverse?: boolean; holo?: boolean; firstEdition?: boolean };
  pricing?: {
    tcgplayer?: Record<string, unknown> | null;
    cardmarket?: Record<string, unknown> | null;
  } | null;
}

export interface SearchHit {
  id: string;
  number: string;
  image: string | null;
  names: Record<string, string>;
}

export class SourceError extends Error {}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown | null> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  } catch {
    throw new SourceError('No hay conexión con TCGdex. Revisa tu conexión a internet e inténtalo de nuevo.');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new SourceError(`TCGdex respondió con el código ${res.status}. Inténtalo más tarde.`);
  return res.json();
}

const ID_PATTERN = /^[a-z0-9.]+-[a-z0-9]+$/i;

/** Busca por nombre en varios idiomas y une los resultados por id. Excluye TCG Pocket (cartas digitales). */
export async function searchCards(
  query: string,
  { fetchImpl = fetch as FetchLike, langs = ['es', 'en'], perPage = 40 }: { fetchImpl?: FetchLike; langs?: string[]; perPage?: number } = {},
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const hits = new Map<string, SearchHit>();
  const add = (lang: string, c: CardResume) => {
    if (c.image?.includes('/tcgp/')) return;
    const h = hits.get(c.id) ?? { id: c.id, number: c.localId, image: c.image ?? null, names: {} };
    h.names[lang] = c.name;
    if (!h.image && c.image) h.image = c.image;
    hits.set(c.id, h);
  };
  if (ID_PATTERN.test(q)) {
    const card = (await getJson(fetchImpl, `${TCGDEX_API}/en/cards/${encodeURIComponent(q)}`)) as TcgdexCard | null;
    if (card) add('en', card);
  }
  const lists = await Promise.all(
    langs.map(async (lang) => {
      const url = `${TCGDEX_API}/${lang}/cards?name=${encodeURIComponent(q)}&pagination:page=1&pagination:itemsPerPage=${perPage}`;
      return { lang, list: ((await getJson(fetchImpl, url)) as CardResume[] | null) ?? [] };
    }),
  );
  for (const { lang, list } of lists) for (const c of list) add(lang, c);
  return [...hits.values()];
}

export async function getCard(id: string, lang: string, fetchImpl: FetchLike = fetch as FetchLike): Promise<TcgdexCard | null> {
  return (await getJson(fetchImpl, `${TCGDEX_API}/${lang}/cards/${encodeURIComponent(id)}`)) as TcgdexCard | null;
}

const TCGPLAYER_FINISH: Record<string, Finish> = {
  normal: 'normal',
  holofoil: 'holofoil',
  'reverse-holofoil': 'reverse_holofoil',
  reverse: 'reverse_holofoil',
  '1st-edition': 'first_edition_normal',
  '1st-edition-holofoil': 'first_edition_holofoil',
  unlimited: 'normal',
  'unlimited-holofoil': 'holofoil',
};

const TCGPLAYER_FIGURES: [string, PriceKind][] = [
  ['marketPrice', 'market'],
  ['lowPrice', 'low'],
  ['midPrice', 'mid'],
  ['highPrice', 'high'],
];

const CARDMARKET_FIGURES: [string, PriceKind][] = [
  ['trend', 'trend'],
  ['avg30', 'avg30'],
  ['avg7', 'avg7'],
  ['avg1', 'avg1'],
  ['low', 'low'],
];

const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function dateOf(updated: unknown, fallback: ISODate): ISODate {
  return typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : fallback;
}

function tcgplayerPrintings(card: TcgdexCard): Map<Finish, Record<string, unknown>> {
  const out = new Map<Finish, Record<string, unknown>>();
  const tp = card.pricing?.tcgplayer;
  if (!isRecord(tp) || (tp.unit != null && tp.unit !== 'USD')) return out;
  for (const [key, value] of Object.entries(tp)) {
    const finish = TCGPLAYER_FINISH[key];
    if (!finish || !isRecord(value) || out.has(finish)) continue;
    if (TCGPLAYER_FIGURES.some(([f]) => positive(value[f]) != null)) out.set(finish, value);
  }
  return out;
}

/** Acabados de la carta: banderas del catálogo más las impresiones con precio en TCGplayer */
export function finishesOf(card: TcgdexCard): Finish[] {
  const set = new Set<Finish>();
  const v = card.variants ?? {};
  if (v.normal) set.add('normal');
  if (v.holo) set.add('holofoil');
  if (v.reverse) set.add('reverse_holofoil');
  if (v.firstEdition) set.add(v.holo ? 'first_edition_holofoil' : 'first_edition_normal');
  for (const f of tcgplayerPrintings(card).keys()) set.add(f);
  if (set.size === 0) set.add('normal');
  return FINISHES.filter((f) => set.has(f));
}

/** Columnas simples de Cardmarket: a qué impresión corresponden */
function cardmarketPlainTargets(card: TcgdexCard, printings: Map<Finish, unknown>): Finish[] {
  const ordinary = (['normal', 'holofoil'] as Finish[]).filter((f) => printings.has(f));
  if (ordinary.length > 0) return ordinary;
  const v = card.variants ?? {};
  const fromFlags: Finish[] = [];
  if (v.normal) fromFlags.push('normal');
  if (v.holo) fromFlags.push('holofoil');
  if (fromFlags.length > 0) return fromFlags;
  return v.firstEdition || v.reverse ? [] : ['normal'];
}

/** Convierte `pricing` en observaciones de precio por variante */
export function pricingToObservations(card: TcgdexCard, fetchedAt: string, today: ISODate): PriceObservation[] {
  const out: PriceObservation[] = [];
  const push = (finish: Finish, sourceCode: string, priceKind: PriceKind, observedOn: ISODate, amount: number, currency: 'USD' | 'EUR') => {
    const variantId = variantIdOf(card.id, finish);
    out.push({
      id: `${variantId}|${sourceCode}|${priceKind}|ANY|RAW|${observedOn}`,
      variantId,
      sourceCode,
      priceKind,
      conditionKey: 'ANY',
      gradeKey: 'RAW',
      observedOn,
      amountCents: toCents(amount),
      currency,
      fetchedAt,
    });
  };

  const printings = tcgplayerPrintings(card);
  const tp = card.pricing?.tcgplayer;
  const tpDate = dateOf(isRecord(tp) ? tp.updated : null, today);
  for (const [finish, printing] of printings) {
    for (const [field, kind] of TCGPLAYER_FIGURES) {
      const v = positive(printing[field]);
      if (v != null) push(finish, 'tcgplayer', kind, tpDate, v, 'USD');
    }
  }

  const cm = card.pricing?.cardmarket;
  if (isRecord(cm) && (cm.unit == null || cm.unit === 'EUR')) {
    const cmDate = dateOf(cm.updated, today);
    for (const finish of cardmarketPlainTargets(card, printings)) {
      for (const [field, kind] of CARDMARKET_FIGURES) {
        const v = positive(cm[field]);
        if (v != null) push(finish, 'cardmarket', kind, cmDate, v, 'EUR');
      }
    }
    if (card.variants?.reverse || printings.has('reverse_holofoil')) {
      for (const [field, kind] of CARDMARKET_FIGURES) {
        const v = positive(cm[`${field}-holo`]);
        if (v != null) push('reverse_holofoil', 'cardmarket', kind, cmDate, v, 'EUR');
      }
    }
  }
  return out;
}

export function toCatalogItem(card: TcgdexCard, names: Record<string, string>, now: string): CatalogItem {
  return {
    itemId: card.id,
    kind: 'card',
    setId: card.set?.id ?? null,
    setName: card.set?.name ?? null,
    name: names.en ?? card.name,
    localNames: { ...names, en: names.en ?? card.name },
    number: card.localId ?? null,
    rarity: card.rarity ?? null,
    image: card.image ?? null,
    finishes: finishesOf(card),
    updatedAt: now,
  };
}

export const cardImageUrl = (base: string | null, quality: 'low' | 'high' = 'low'): string | null =>
  base ? `${base}/${quality}.webp` : null;
