// Motor de valoración. Port fiel de las funciones y vistas de db/schema.sql:
// unit_price_usd(), v_lot_position, v_realized_pnl, v_portfolio_summary,
// v_alerts_due, allocate_opened_cost() y el disparador check_disposal().
// Las pruebas de engine.test.ts reproducen los casos T1–T10 del SQL.

import {
  DomainError,
  PRICE_KIND_ORDER,
  type Condition,
  type Disposal,
  type FxRate,
  type ISODate,
  type ItemKind,
  type Lot,
  type PriceKind,
  type PriceObservation,
  type PriceSource,
  type Settings,
  type ValuationLevel,
  type WatchItem,
} from './types';
import { addDays, roundHalfAway, todayLocal } from './util';

export interface EngineInput {
  lots: Lot[];
  disposals: Disposal[];
  observations: PriceObservation[];
  fx: FxRate[];
  sources: PriceSource[];
  settings: Pick<Settings, 'conditionFactors' | 'maxAgeDays'>;
  /** Tipo de ítem por variante; necesario para validar aperturas */
  kindOfVariant: (variantId: string) => ItemKind | undefined;
}

export interface PriceResult {
  unitValueCents: number;
  sourceCode: string;
  priceKind: PriceKind;
  observedOn: ISODate;
  valuationLevel: ValuationLevel;
}

export interface LotPosition {
  lot: Lot;
  gradeKey: string;
  qtyOnHand: number;
  costBasisCents: number;
  unitValueCents: number | null;
  marketValueCents: number | null;
  unrealizedCents: number | null;
  priceSource: string | null;
  priceDate: ISODate | null;
  valuationLevel: ValuationLevel | null;
}

export interface RealizedLine {
  disposal: Disposal;
  portfolioId: number;
  netProceedsCents: number;
  costReleasedCents: number;
  realizedCents: number;
}

export interface PortfolioSummary {
  itemsOnHand: number;
  marketValueCents: number;
  costBasisCents: number;
  costBasisUnpricedCents: number;
  unrealizedCents: number;
  realizedCents: number;
  lotsWithoutPrice: number;
  shareByLevel: Record<ValuationLevel, number | null>;
}

export interface AllocationLine {
  lotId: number;
  acquisitionCostCents: number;
}

export interface AlertDue {
  watch: WatchItem;
  unitValueCents: number;
  observedOn: ISODate;
}

const KIND_RANK = new Map<PriceKind, number>(PRICE_KIND_ORDER.map((k, i) => [k, i]));

export function gradeKeyOf(lot: Pick<Lot, 'grader' | 'grade'>): string {
  return lot.grader && lot.grade != null ? `${lot.grader}${lot.grade}` : 'RAW';
}

export class Engine {
  private readonly lots: Lot[];
  private readonly lotsById = new Map<number, Lot>();
  private readonly disposals: Disposal[];
  private readonly disposedByLot = new Map<number, number>();
  private readonly obsByVariant = new Map<string, PriceObservation[]>();
  private readonly fxByBase = new Map<string, FxRate[]>();
  private readonly sources = new Map<string, PriceSource>();
  private readonly factors: Record<Condition, number>;
  readonly maxAgeDays: number;
  private readonly kindOfVariant: EngineInput['kindOfVariant'];

  constructor(input: EngineInput) {
    this.lots = input.lots;
    this.disposals = input.disposals;
    for (const l of input.lots) if (l.id != null) this.lotsById.set(l.id, l);
    for (const d of input.disposals) this.disposedByLot.set(d.lotId, (this.disposedByLot.get(d.lotId) ?? 0) + d.quantity);
    for (const o of input.observations) {
      const list = this.obsByVariant.get(o.variantId);
      if (list) list.push(o);
      else this.obsByVariant.set(o.variantId, [o]);
    }
    for (const r of input.fx) {
      if (r.quote !== 'USD') continue;
      const list = this.fxByBase.get(r.base) ?? [];
      list.push(r);
      this.fxByBase.set(r.base, list);
    }
    for (const list of this.fxByBase.values()) list.sort((a, b) => (a.rateDate < b.rateDate ? 1 : -1));
    for (const s of input.sources) this.sources.set(s.code, s);
    this.factors = input.settings.conditionFactors;
    this.maxAgeDays = input.settings.maxAgeDays;
    this.kindOfVariant = input.kindOfVariant;
  }

  /** fx_to_usd(): sin tipo de cambio a la fecha no hay precio */
  toUsd(amountCents: number, currency: string, on: ISODate): number | null {
    if (currency === 'USD') return amountCents;
    const rate = this.fxByBase.get(currency)?.find((r) => r.rateDate <= on);
    return rate ? amountCents * rate.rate : null;
  }

  /** unit_price_usd(): cascada estado exacto > prioridad > tipo de precio > recencia */
  unitPrice(q: {
    variantId: string;
    condition: Condition;
    language: string;
    gradeKey: string;
    asOf: ISODate;
    maxAgeDays?: number;
    /** Restringe la cascada a una fuente (comparación entre mercados) */
    sourceCode?: string;
  }): PriceResult | null {
    const from = addDays(q.asOf, -(q.maxAgeDays ?? this.maxAgeDays));
    let best: { o: PriceObservation; src: PriceSource; usd: number; key: number[] } | null = null;
    for (const o of this.obsByVariant.get(q.variantId) ?? []) {
      if (q.sourceCode && o.sourceCode !== q.sourceCode) continue;
      if (o.gradeKey !== q.gradeKey) continue;
      if (o.conditionKey !== q.condition && o.conditionKey !== 'ANY') continue;
      if (o.observedOn < from || o.observedOn > q.asOf) continue;
      const src = this.sources.get(o.sourceCode);
      if (!src) continue;
      const usd = this.toUsd(o.amountCents, o.currency, o.observedOn);
      if (usd == null) continue;
      const key = [
        o.conditionKey === 'ANY' ? 1 : 0,
        src.priority,
        KIND_RANK.get(o.priceKind) ?? 99,
        -Number(o.observedOn.replaceAll('-', '')),
      ];
      if (!best || lexLess(key, best.key)) best = { o, src, usd, key };
    }
    if (!best) return null;
    const { o, src, usd } = best;
    const factor = o.conditionKey === 'ANY' ? this.factors[q.condition] ?? 1 : 1;
    const level = Math.max(
      src.valuationLevel,
      o.conditionKey === 'ANY' && q.condition !== 'NM' ? 2 : 1,
      src.marketLanguage != null && src.marketLanguage !== q.language ? 2 : 1,
    ) as ValuationLevel;
    return {
      unitValueCents: roundHalfAway(usd * factor),
      sourceCode: o.sourceCode,
      priceKind: o.priceKind,
      observedOn: o.observedOn,
      valuationLevel: level,
    };
  }

  qtyOnHand(lot: Lot): number {
    return lot.quantity - (lot.id != null ? this.disposedByLot.get(lot.id) ?? 0 : 0);
  }

  /** v_lot_position */
  positions(asOf: ISODate): LotPosition[] {
    const out: LotPosition[] = [];
    for (const lot of this.lots) {
      const qtyOnHand = this.qtyOnHand(lot);
      if (qtyOnHand <= 0) continue;
      const gradeKey = gradeKeyOf(lot);
      const manual = lot.manualUnitValueCents;
      const price =
        manual == null
          ? this.unitPrice({
              variantId: lot.variantId,
              condition: lot.grader ? 'NM' : lot.condition,
              language: lot.language,
              gradeKey,
              asOf,
            })
          : null;
      const unit = manual ?? price?.unitValueCents ?? null;
      const costShare = (lot.acquisitionCostCents * qtyOnHand) / lot.quantity;
      out.push({
        lot,
        gradeKey,
        qtyOnHand,
        costBasisCents: roundHalfAway(costShare),
        unitValueCents: unit,
        marketValueCents: unit == null ? null : unit * qtyOnHand,
        unrealizedCents: unit == null ? null : roundHalfAway(unit * qtyOnHand - costShare),
        priceSource: manual != null ? 'manual' : price?.sourceCode ?? null,
        priceDate: manual != null ? null : price?.observedOn ?? null,
        valuationLevel: manual != null ? 3 : price?.valuationLevel ?? null,
      });
    }
    return out;
  }

  /** v_realized_pnl: las aperturas no realizan resultado */
  realized(): RealizedLine[] {
    const out: RealizedLine[] = [];
    for (const d of this.disposals) {
      if (d.channel === 'opened') continue;
      const lot = this.lotsById.get(d.lotId);
      if (!lot) continue;
      const costShare = (lot.acquisitionCostCents * d.quantity) / lot.quantity;
      out.push({
        disposal: d,
        portfolioId: lot.portfolioId,
        netProceedsCents: d.unitProceedsCents * d.quantity - d.feesCents,
        costReleasedCents: roundHalfAway(costShare),
        realizedCents: roundHalfAway(d.unitProceedsCents * d.quantity - d.feesCents - costShare),
      });
    }
    return out;
  }

  /** v_portfolio_summary; portfolioId null = consolidado */
  summary(asOf: ISODate, portfolioId: number | null = null): PortfolioSummary {
    const pos = this.positions(asOf).filter((p) => portfolioId == null || p.lot.portfolioId === portfolioId);
    const priced = pos.filter((p) => p.unitValueCents != null);
    const market = sum(priced.map((p) => p.marketValueCents!));
    const byLevel = (lvl: ValuationLevel) =>
      market === 0 ? null : sum(priced.filter((p) => p.valuationLevel === lvl).map((p) => p.marketValueCents!)) / market;
    return {
      itemsOnHand: sum(pos.map((p) => p.qtyOnHand)),
      marketValueCents: market,
      costBasisCents: sum(pos.map((p) => p.costBasisCents)),
      costBasisUnpricedCents: sum(pos.filter((p) => p.unitValueCents == null).map((p) => p.costBasisCents)),
      unrealizedCents: sum(priced.map((p) => p.unrealizedCents!)),
      realizedCents: sum(
        this.realized()
          .filter((r) => portfolioId == null || r.portfolioId === portfolioId)
          .map((r) => r.realizedCents),
      ),
      lotsWithoutPrice: pos.length - priced.length,
      shareByLevel: { 1: byLevel(1), 2: byLevel(2), 3: byLevel(3) },
    };
  }

  /** v_alerts_due */
  alertsDue(watch: WatchItem[], asOf: ISODate): AlertDue[] {
    const out: AlertDue[] = [];
    for (const w of watch) {
      if (!w.isActive || w.direction == null || w.thresholdCents == null) continue;
      const p = this.unitPrice({ variantId: w.variantId, condition: w.condition, language: w.language, gradeKey: 'RAW', asOf });
      if (!p) continue;
      const crossed = w.direction === 'above' ? p.unitValueCents >= w.thresholdCents : p.unitValueCents <= w.thresholdCents;
      const fresh = w.lastTriggeredAt == null || todayLocal(new Date(w.lastTriggeredAt)) < p.observedOn;
      if (crossed && fresh) out.push({ watch: w, unitValueCents: p.unitValueCents, observedOn: p.observedOn });
    }
    return out;
  }

  /** check_disposal() + índice único de apertura */
  validateDisposal(d: Disposal): void {
    const lot = this.lotsById.get(d.lotId);
    if (!lot) throw new DomainError(`Lote ${d.lotId}: no existe`);
    if (!Number.isInteger(d.quantity) || d.quantity <= 0) throw new DomainError('La cantidad debe ser un entero mayor que cero');
    if (d.unitProceedsCents < 0 || d.feesCents < 0) throw new DomainError('Ingresos y comisiones no pueden ser negativos');
    if (d.disposedOn < lot.acquiredOn) {
      throw new DomainError(
        `Lote ${d.lotId}: la fecha de disposición (${d.disposedOn}) es anterior a la adquisición (${lot.acquiredOn})`,
      );
    }
    if (d.channel === 'opened') {
      if (this.kindOfVariant(lot.variantId) !== 'sealed') {
        throw new DomainError(`Lote ${d.lotId}: solo un producto sellado puede registrarse como abierto`);
      }
      if (this.disposals.some((x) => x.lotId === d.lotId && x.channel === 'opened' && x.id !== d.id)) {
        throw new DomainError(`Lote ${d.lotId}: ya registra una apertura`);
      }
    }
    const others = sum(this.disposals.filter((x) => x.lotId === d.lotId && x.id !== d.id).map((x) => x.quantity));
    if (others + d.quantity > lot.quantity) {
      throw new DomainError(`Lote ${d.lotId}: disponible ${lot.quantity - others}, solicitado ${d.quantity}`);
    }
  }

  /**
   * allocate_opened_cost(): reparte el coste de un sellado abierto entre sus
   * lotes hijos por valor de mercado relativo a la fecha de apertura (o a
   * valuationDate, aproximación declarada). El residuo de redondeo va al
   * lote de mayor valor para que la suma cuadre al centavo.
   */
  allocateOpenedCost(parentLotId: number, valuationDate?: ISODate): AllocationLine[] {
    const parent = this.lotsById.get(parentLotId);
    const opening = this.disposals.find((d) => d.lotId === parentLotId && d.channel === 'opened');
    if (!parent || !opening) {
      throw new DomainError(`Lote ${parentLotId}: no registra apertura`);
    }
    const pool = roundHalfAway((parent.acquisitionCostCents * opening.quantity) / parent.quantity);
    const valueOn = valuationDate ?? opening.disposedOn;
    const children = this.lots.filter((l) => l.parentLotId === parentLotId);
    if (children.length === 0) throw new DomainError(`Lote ${parentLotId}: no tiene cartas obtenidas registradas`);
    const valued = children.map((c) => {
      const unit =
        c.manualUnitValueCents ??
        this.unitPrice({ variantId: c.variantId, condition: c.condition, language: c.language, gradeKey: 'RAW', asOf: valueOn })
          ?.unitValueCents ??
        null;
      return { lot: c, value: unit == null ? null : c.quantity * unit };
    });
    const unpriced = valued.filter((v) => v.value == null).length;
    if (unpriced > 0) {
      throw new DomainError(
        `Lote ${parentLotId}: ${unpriced} de ${children.length} cartas obtenidas sin precio al ${valueOn}; informe un valor manual`,
      );
    }
    const total = sum(valued.map((v) => v.value!));
    if (total === 0) throw new DomainError(`Lote ${parentLotId}: el valor de mercado de las cartas obtenidas es cero`);
    const ranked = [...valued].sort((a, b) => b.value! - a.value! || a.lot.id! - b.lot.id!);
    const lines = ranked.map((v) => ({ lotId: v.lot.id!, acquisitionCostCents: roundHalfAway((pool * v.value!) / total) }));
    lines[0].acquisitionCostCents += pool - sum(lines.map((l) => l.acquisitionCostCents));
    return lines;
  }
}

/** Reglas de la tabla lot (restricciones CHECK) */
export function validateLot(l: Omit<Lot, 'id' | 'createdAt'> & { id?: number }): void {
  if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new DomainError('La cantidad debe ser un entero mayor que cero');
  if (l.acquisitionCostCents < 0) throw new DomainError('El coste no puede ser negativo');
  if (l.manualUnitValueCents != null && l.manualUnitValueCents < 0) throw new DomainError('El valor manual no puede ser negativo');
  if ((l.grader == null) !== (l.grade == null)) throw new DomainError('Una carta graduada requiere empresa y nota');
  if (l.grader != null) {
    if (l.quantity !== 1) throw new DomainError('Una carta graduada se registra con cantidad 1');
    if (l.grade! < 1 || l.grade! > 10 || l.grade! * 2 !== Math.trunc(l.grade! * 2)) {
      throw new DomainError('La nota debe estar entre 1 y 10, en pasos de 0,5');
    }
  }
  if (l.id != null && l.parentLotId === l.id) throw new DomainError('Un lote no puede provenir de sí mismo');
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

function sum(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0);
}
