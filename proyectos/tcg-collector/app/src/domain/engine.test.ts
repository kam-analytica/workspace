// Paridad con db/tests/test_schema.sql: mismos datos sintéticos (no son
// precios reales) y mismos resultados esperados que en PostgreSQL.
import { describe, expect, it } from 'vitest';
import { Engine, gradeKeyOf, validateLot, type EngineInput } from './engine';
import {
  PRICE_SOURCES,
  type Disposal,
  type Lot,
  type PriceObservation,
  type WatchItem,
} from './types';
import { addDays, matchesQuery } from './util';

const TODAY = '2026-10-24';
const d = (n: number) => addDays(TODAY, -n);

const V1 = 'tst1-1#holofoil';
const V2 = 'tst1-2#normal';
const V3 = 'tst1-3#normal';
const V4 = 'tst1-etb#sealed';

let obsSeq = 0;
function obs(
  variantId: string,
  sourceCode: string,
  priceKind: PriceObservation['priceKind'],
  observedOn: string,
  amount: number,
  currency: 'USD' | 'EUR',
  gradeKey = 'RAW',
): PriceObservation {
  return {
    id: `o${++obsSeq}`,
    variantId,
    sourceCode,
    priceKind,
    conditionKey: 'ANY',
    gradeKey,
    observedOn,
    amountCents: Math.round(amount * 100),
    currency,
    fetchedAt: TODAY,
  };
}

function lot(id: number, p: Partial<Lot>): Lot {
  return {
    id,
    portfolioId: 1,
    variantId: V1,
    quantity: 1,
    condition: 'NM',
    language: 'en',
    grader: null,
    grade: null,
    certNumber: null,
    acquiredOn: d(30),
    channel: 'purchase',
    acquisitionCostCents: 0,
    parentLotId: null,
    manualUnitValueCents: null,
    notes: null,
    createdAt: TODAY,
    ...p,
  };
}

function baseInput(): EngineInput & { lots: Lot[]; disposals: Disposal[] } {
  return {
    lots: [
      lot(1, { variantId: V1, quantity: 2, acquisitionCostCents: 2000 }),
      lot(2, { variantId: V2, condition: 'LP', language: 'es', acquisitionCostCents: 500 }),
      lot(3, { variantId: V3, acquisitionCostCents: 300 }),
      lot(4, { variantId: V1, language: 'es', acquisitionCostCents: 1000 }),
      lot(5, { variantId: V1, grader: 'PSA', grade: 10, acquiredOn: d(20), acquisitionCostCents: 10000 }),
      lot(6, { variantId: V3, acquiredOn: d(10), acquisitionCostCents: 100, manualUnitValueCents: 450 }),
    ],
    disposals: [],
    observations: [
      obs(V1, 'tcgplayer', 'market', d(1), 12, 'USD'),
      obs(V1, 'tcgplayer', 'low', d(1), 9, 'USD'),
      obs(V1, 'cardmarket', 'trend', d(1), 8, 'EUR'),
      obs(V1, 'tcgplayer', 'market', d(60), 30, 'USD'),
      obs(V2, 'cardmarket', 'trend', d(1), 2, 'EUR'),
      obs(V4, 'tcgplayer', 'market', d(1), 60, 'USD'),
      obs(V1, 'tcgplayer', 'market', d(3), 11, 'USD'),
      obs(V2, 'cardmarket', 'trend', d(3), 2.5, 'EUR'),
      obs(V1, 'tcgplayer', 'market', d(1), 150, 'USD', 'PSA10'),
    ],
    fx: [{ id: 'fx1', rateDate: d(3), base: 'EUR', quote: 'USD', rate: 1.1, source: 'ECB' }],
    sources: PRICE_SOURCES,
    settings: { conditionFactors: { NM: 1, LP: 0.8, MP: 1, HP: 1, DMG: 1 }, maxAgeDays: 30 },
    kindOfVariant: (v) => (v === V4 ? 'sealed' : 'card'),
  };
}

describe('Motor de valoración — paridad con PostgreSQL', () => {
  it('T1 valora cada lote con la cascada de precios y su nivel', () => {
    const e = new Engine(baseInput());
    const rows = e.positions(TODAY).map((p) => [
      p.lot.id,
      p.gradeKey,
      p.qtyOnHand,
      p.costBasisCents,
      p.unitValueCents,
      p.marketValueCents,
      p.unrealizedCents,
      p.priceSource,
      p.valuationLevel,
    ]);
    expect(rows).toEqual([
      [1, 'RAW', 2, 2000, 1200, 2400, 400, 'tcgplayer', 1],
      [2, 'RAW', 1, 500, 176, 176, -324, 'cardmarket', 2],
      [3, 'RAW', 1, 300, null, null, null, null, null],
      [4, 'RAW', 1, 1000, 1200, 1200, 200, 'tcgplayer', 2],
      [5, 'PSA10', 1, 10000, 15000, 15000, 5000, 'tcgplayer', 1],
      [6, 'RAW', 1, 100, 450, 450, 350, 'manual', 3],
    ]);
  });

  it('T2 calcula el resultado realizado por identificación específica', () => {
    const input = baseInput();
    input.disposals.push({ id: 1, lotId: 1, disposedOn: TODAY, quantity: 1, channel: 'sale', unitProceedsCents: 1500, feesCents: 100, notes: null });
    const [r] = new Engine(input).realized();
    expect([r.netProceedsCents, r.costReleasedCents, r.realizedCents]).toEqual([1400, 1000, 400]);
  });

  it('T3 bloquea vender más de lo disponible', () => {
    const input = baseInput();
    input.disposals.push({ id: 1, lotId: 1, disposedOn: TODAY, quantity: 1, channel: 'sale', unitProceedsCents: 1500, feesCents: 100, notes: null });
    const e = new Engine(input);
    expect(() =>
      e.validateDisposal({ lotId: 1, disposedOn: TODAY, quantity: 2, channel: 'sale', unitProceedsCents: 0, feesCents: 0, notes: null }),
    ).toThrow('Lote 1: disponible 1, solicitado 2');
  });

  it('T4 bloquea abrir una carta y fechar una venta antes de la compra', () => {
    const e = new Engine(baseInput());
    expect(() =>
      e.validateDisposal({ lotId: 3, disposedOn: TODAY, quantity: 1, channel: 'opened', unitProceedsCents: 0, feesCents: 0, notes: null }),
    ).toThrow('solo un producto sellado puede registrarse como abierto');
    expect(() =>
      e.validateDisposal({ lotId: 3, disposedOn: d(40), quantity: 1, channel: 'sale', unitProceedsCents: 0, feesCents: 0, notes: null }),
    ).toThrow('es anterior a la adquisición');
  });

  function withSealed() {
    const input = baseInput();
    input.disposals.push({ id: 1, lotId: 1, disposedOn: TODAY, quantity: 1, channel: 'sale', unitProceedsCents: 1500, feesCents: 100, notes: null });
    input.lots.push(lot(7, { variantId: V4, acquiredOn: d(5), acquisitionCostCents: 5000 }));
    input.disposals.push({ id: 2, lotId: 7, disposedOn: d(2), quantity: 1, channel: 'opened', unitProceedsCents: 0, feesCents: 0, notes: null });
    input.lots.push(
      lot(8, { variantId: V1, acquiredOn: d(2), parentLotId: 7 }),
      lot(9, { variantId: V2, quantity: 3, acquiredOn: d(2), parentLotId: 7 }),
      lot(10, { variantId: V3, acquiredOn: d(2), parentLotId: 7 }),
    );
    return input;
  }

  it('T5 asigna el coste del sellado por valor relativo y cuadra al centavo', () => {
    const input = withSealed();
    expect(() => new Engine(input).allocateOpenedCost(7)).toThrow('1 de 3 cartas obtenidas sin precio');
    input.lots.find((l) => l.id === 10)!.manualUnitValueCents = 10;
    const lines = new Engine(input).allocateOpenedCost(7);
    const byLot = Object.fromEntries(lines.map((l) => [l.lotId, l.acquisitionCostCents]));
    expect(byLot).toEqual({ 8: 2842, 9: 2132, 10: 26 });
    expect(lines.reduce((s, l) => s + l.acquisitionCostCents, 0)).toBe(5000);
  });

  it('T5b imputa el residuo de redondeo al lote de mayor valor', () => {
    const input = withSealed();
    input.lots.find((l) => l.id === 10)!.manualUnitValueCents = 10;
    const lines = new Engine(input).allocateOpenedCost(7, TODAY);
    const byLot = Object.fromEntries(lines.map((l) => [l.lotId, l.acquisitionCostCents]));
    expect(byLot).toEqual({ 8: 3208, 9: 1765, 10: 27 });
  });

  it('T6 resume el portafolio con calidad del dato por nivel', () => {
    const input = withSealed();
    input.lots.find((l) => l.id === 10)!.manualUnitValueCents = 10;
    const alloc = new Engine(input).allocateOpenedCost(7);
    for (const a of alloc) input.lots.find((l) => l.id === a.lotId)!.acquisitionCostCents = a.acquisitionCostCents;
    const s = new Engine(input).summary(TODAY);
    expect(s.itemsOnHand).toBe(11);
    expect(s.marketValueCents).toBe(19896);
    expect(s.costBasisCents).toBe(17900);
    expect(s.costBasisUnpricedCents).toBe(300);
    expect(s.unrealizedCents).toBe(2296);
    expect(s.realizedCents).toBe(400);
    expect(s.lotsWithoutPrice).toBe(1);
    expect(s.shareByLevel[1]!.toFixed(4)).toBe('0.8745');
    expect(s.shareByLevel[2]!.toFixed(4)).toBe('0.1023');
    expect(s.shareByLevel[3]!.toFixed(4)).toBe('0.0231');
  });

  it('T7 dispara solo las alertas que cruzan su umbral', () => {
    const e = new Engine(baseInput());
    const w = (id: number, variantId: string, direction: 'above' | 'below' | null, threshold: number | null): WatchItem => ({
      id,
      variantId,
      condition: 'NM',
      language: 'en',
      direction,
      thresholdCents: threshold,
      isActive: true,
      lastTriggeredAt: null,
      createdAt: TODAY,
    });
    const due = e.alertsDue([w(1, V1, 'above', 1100), w(2, V2, 'below', 100), w(3, V3, null, null)], TODAY);
    expect(due.map((a) => [a.watch.id, a.unitValueCents])).toEqual([[1, 1200]]);
  });

  it('T9 busca sin distinguir tildes ni mayúsculas', () => {
    expect(matchesQuery('Carta A (es)', 'carta a')).toBe(true);
    expect(matchesQuery('Pokémon Center ETB', 'pokemon etb')).toBe(true);
    expect(matchesQuery('Card A', 'carta')).toBe(false);
  });

  it('T10 rechaza graduadas con cantidad mayor a 1 o nota inválida', () => {
    const base = lot(99, {});
    expect(() => validateLot({ ...base, quantity: 2, grader: 'PSA', grade: 9.5 })).toThrow('cantidad 1');
    expect(() => validateLot({ ...base, grader: 'PSA', grade: 9.3 })).toThrow('pasos de 0,5');
    expect(gradeKeyOf({ grader: 'BGS', grade: 9.5 })).toBe('BGS9.5');
  });
});
