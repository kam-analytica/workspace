import { describe, expect, it } from 'vitest';
import { createMockFetch } from './fixtures/mockApi';
import { fetchEcbEurUsd } from './fx';
import { finishesOf, getCard, pricingToObservations, searchCards, toCatalogItem, type TcgdexCard } from './tcgdex';

const TODAY = '2026-10-24';

describe('Adaptador TCGdex', () => {
  it('busca en español e inglés y une los resultados por id', async () => {
    const log: string[] = [];
    const hits = await searchCards('investigación', { fetchImpl: createMockFetch(TODAY, log) });
    expect(hits.map((h) => h.id)).toEqual(['sv01-189']);
    expect(hits[0].names).toEqual({ es: 'Investigación de Profesores' });
    expect(log.some((u) => u.includes('/es/cards?name=investigaci%C3%B3n&pagination:page=1'))).toBe(true);
  });

  it('acepta un id de carta como búsqueda directa', async () => {
    const hits = await searchCards('swsh7-215', { fetchImpl: createMockFetch(TODAY) });
    expect(hits[0]).toMatchObject({ id: 'swsh7-215', number: '215', names: { en: 'Umbreon VMAX' } });
  });

  it('devuelve null si la carta no existe', async () => {
    expect(await getCard('no-existe', 'en', createMockFetch(TODAY))).toBeNull();
  });

  it('convierte precios de TCGplayer y Cardmarket por acabado', async () => {
    const card = (await getCard('swsh7-49', 'en', createMockFetch(TODAY))) as TcgdexCard;
    expect(finishesOf(card)).toEqual(['normal', 'reverse_holofoil']);
    const obs = pricingToObservations(card, 'now', TODAY);
    const pick = (v: string, s: string, k: string) => obs.find((o) => o.variantId === v && o.sourceCode === s && o.priceKind === k);
    expect(pick('swsh7-49#normal', 'tcgplayer', 'market')).toMatchObject({ amountCents: 35, currency: 'USD', observedOn: TODAY });
    expect(pick('swsh7-49#reverse_holofoil', 'tcgplayer', 'market')?.amountCents).toBe(80);
    // columnas simples de Cardmarket -> impresión ordinaria; «-holo» -> reverse holo
    expect(pick('swsh7-49#normal', 'cardmarket', 'trend')).toMatchObject({ amountCents: 25, currency: 'EUR' });
    expect(pick('swsh7-49#reverse_holofoil', 'cardmarket', 'trend')?.amountCents).toBe(60);
    expect(new Set(obs.map((o) => o.id)).size).toBe(obs.length);
  });

  it('descarta ceros y monedas inesperadas', () => {
    const card: TcgdexCard = {
      id: 'x-1',
      localId: '1',
      name: 'X',
      set: { id: 'x', name: 'X' },
      variants: { holo: true },
      pricing: {
        tcgplayer: { unit: 'USD', holofoil: { marketPrice: 0, lowPrice: 2 } },
        cardmarket: { unit: 'GBP', trend: 3 },
      },
    };
    const obs = pricingToObservations(card, 'now', TODAY);
    expect(obs.map((o) => `${o.sourceCode}:${o.priceKind}:${o.amountCents}`)).toEqual(['tcgplayer:low:200']);
  });

  it('arma el ítem de catálogo con nombres localizados', async () => {
    const card = (await getCard('sv01-189', 'en', createMockFetch(TODAY))) as TcgdexCard;
    const item = toCatalogItem(card, { en: card.name, es: 'Investigación de Profesores' }, 'now');
    expect(item).toMatchObject({ itemId: 'sv01-189', kind: 'card', setId: 'sv01', number: '189', name: "Professor's Research" });
    expect(item.finishes).toEqual(['holofoil', 'reverse_holofoil']);
  });

  it('lee el tipo de cambio EUR→USD del BCE', async () => {
    expect(await fetchEcbEurUsd(createMockFetch(TODAY))).toMatchObject({ base: 'EUR', quote: 'USD', rate: 1.1, rateDate: TODAY });
    expect(await fetchEcbEurUsd(async () => new Response('x', { status: 500 }))).toBeNull();
  });
});
