// API simulada de TCGdex y Frankfurter para pruebas unitarias y e2e.
// Catálogo: registros reales (cards.json). Precios: SINTÉTICOS, construidos
// solo para ejercitar la lógica; no son precios de mercado.

import catalog from './cards.json' with { type: 'json' };

interface FixtureCard {
  id: string;
  localId: string;
  name: Record<string, string>;
  rarity: string;
  category: string;
  serie: string;
  set: { id: string; name: Record<string, string>; cardCount: { official: number } };
  variants: Record<string, boolean>;
}

const CARDS = (catalog as unknown as { cards: FixtureCard[] }).cards;

/** Precios sintéticos por carta, con la forma medida de `pricing` en TCGdex */
const SYNTHETIC_PRICING: Record<string, { tcgplayer: Record<string, number>; cardmarket: Record<string, number> }> = {
  'swsh7-49': { tcgplayer: { normal: 0.35, 'reverse-holofoil': 0.8 }, cardmarket: { trend: 0.25, avg30: 0.3, 'trend-holo': 0.6 } },
  'swsh12.5gg-GG30': { tcgplayer: { holofoil: 6.5 }, cardmarket: { trend: 5, avg30: 5.2 } },
  'swsh7-215': { tcgplayer: { holofoil: 1450 }, cardmarket: { trend: 1100, avg30: 1120 } },
  'svp-196': { tcgplayer: { holofoil: 12 }, cardmarket: { trend: 9, avg30: 9.5 } },
  'sv01-189': { tcgplayer: { holofoil: 1.2, 'reverse-holofoil': 0.9 }, cardmarket: { trend: 0.8, 'trend-holo': 0.7 } },
};

export const SYNTHETIC_EUR_USD = 1.1;

const image = (lang: string, c: FixtureCard) => `https://assets.tcgdex.net/${lang}/${c.serie}/${c.set.id}/${c.localId}`;
const nameIn = (lang: string, names: Record<string, string>) => names[lang] ?? names.en;

function fullCard(lang: string, c: FixtureCard, today: string) {
  const p = SYNTHETIC_PRICING[c.id];
  const updated = `${today}T03:00:00.000Z`;
  return {
    id: c.id,
    localId: c.localId,
    name: nameIn(lang, c.name),
    image: image(lang, c),
    rarity: c.rarity,
    category: c.category,
    set: { id: c.set.id, name: nameIn(lang, c.set.name), cardCount: c.set.cardCount },
    variants: { normal: false, reverse: false, holo: false, firstEdition: false, ...c.variants },
    pricing: p
      ? {
          tcgplayer: {
            updated,
            unit: 'USD',
            ...Object.fromEntries(
              Object.entries(p.tcgplayer).map(([k, v]) => [
                k,
                { productId: 1, lowPrice: +(v * 0.8).toFixed(2), midPrice: v, highPrice: +(v * 1.6).toFixed(2), marketPrice: v, directLowPrice: null },
              ]),
            ),
          },
          cardmarket: { updated, unit: 'EUR', idProduct: 1, ...p.cardmarket },
        }
      : null,
  };
}

/** Responde a una URL como lo haría la API real; status 404 si no existe */
export function mockResponse(url: string, today: string): { status: number; body: unknown } {
  const u = new URL(url);
  if (u.hostname === 'api.frankfurter.dev') {
    return { status: 200, body: [{ date: today, base: 'EUR', quote: 'USD', rate: SYNTHETIC_EUR_USD }] };
  }
  if (u.hostname !== 'api.tcgdex.net') return { status: 404, body: { error: 'not found' } };
  const [, , lang, endpoint, id] = u.pathname.split('/');
  if (endpoint !== 'cards') return { status: 404, body: { error: 'not found' } };
  if (id) {
    const c = CARDS.find((x) => x.id === decodeURIComponent(id));
    return c ? { status: 200, body: fullCard(lang, c, today) } : { status: 404, body: { error: 'not found' } };
  }
  const q = (u.searchParams.get('name') ?? '').toLowerCase();
  const list = CARDS.filter((c) => nameIn(lang, c.name).toLowerCase().includes(q)).map((c) => ({
    id: c.id,
    localId: c.localId,
    name: nameIn(lang, c.name),
    image: image(lang, c),
  }));
  return { status: 200, body: list };
}

export function createMockFetch(today: string, log: string[] = []) {
  return async (url: string): Promise<Response> => {
    log.push(url);
    const { status, body } = mockResponse(url, today);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}
