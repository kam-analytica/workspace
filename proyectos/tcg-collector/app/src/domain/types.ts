// Modelo de dominio. Espejo de db/schema.sql (esquema tcg) adaptado a
// almacenamiento local: importes en centavos de USD salvo que se indique
// otra moneda, fechas como 'YYYY-MM-DD'.

export type ISODate = string;

export const FINISHES = [
  'normal',
  'holofoil',
  'reverse_holofoil',
  'first_edition_normal',
  'first_edition_holofoil',
  'sealed',
] as const;
export type Finish = (typeof FINISHES)[number];

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type Condition = (typeof CONDITIONS)[number];
export type ConditionKey = Condition | 'ANY';

// Orden de preferencia dentro de una misma fuente (igual que la cascada SQL)
export const PRICE_KIND_ORDER = [
  'market',
  'sold_median',
  'trend',
  'avg7',
  'avg30',
  'avg1',
  'mid',
  'low',
  'high',
] as const;
export type PriceKind = (typeof PRICE_KIND_ORDER)[number];

export const GRADERS = ['PSA', 'BGS', 'CGC', 'SGC', 'OTHER'] as const;
export type Grader = (typeof GRADERS)[number];

export const ACQUISITION_CHANNELS = ['purchase', 'pack_pull', 'trade', 'gift', 'other'] as const;
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

export const DISPOSAL_CHANNELS = ['sale', 'trade', 'gift', 'loss', 'opened', 'other'] as const;
export type DisposalChannel = (typeof DISPOSAL_CHANNELS)[number];

export type Currency = 'USD' | 'EUR';
export type ValuationLevel = 1 | 2 | 3;
export type ItemKind = 'card' | 'sealed';

export interface CatalogItem {
  itemId: string;
  kind: ItemKind;
  setId: string | null;
  setName: string | null;
  name: string;
  /** Nombres localizados por idioma (es, en, …) para búsqueda y presentación */
  localNames: Record<string, string>;
  number: string | null;
  rarity: string | null;
  /** URL base de imagen de TCGdex, sin calidad ni extensión */
  image: string | null;
  finishes: Finish[];
  updatedAt: string;
}

export interface PriceSource {
  code: string;
  name: string;
  currency: Currency;
  /** null = mercado multi-idioma */
  marketLanguage: string | null;
  /** menor = preferente en la cascada */
  priority: number;
  valuationLevel: ValuationLevel;
}

export interface PriceObservation {
  /** variante|fuente|tipo|estado|grado|fecha */
  id: string;
  variantId: string;
  sourceCode: string;
  priceKind: PriceKind;
  conditionKey: ConditionKey;
  gradeKey: string;
  observedOn: ISODate;
  amountCents: number;
  currency: Currency;
  fetchedAt: string;
}

/** 1 unidad de base = rate unidades de quote */
export interface FxRate {
  id: string;
  rateDate: ISODate;
  base: Currency;
  quote: Currency;
  rate: number;
  source: string;
}

export interface Portfolio {
  id?: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

/** Una o varias copias idénticas adquiridas en un mismo acto */
export interface Lot {
  id?: number;
  portfolioId: number;
  variantId: string;
  quantity: number;
  condition: Condition;
  language: string;
  grader: Grader | null;
  grade: number | null;
  certNumber: string | null;
  acquiredOn: ISODate;
  channel: AcquisitionChannel;
  /** Coste total del lote: precio + envío + comisiones + aranceles */
  acquisitionCostCents: number;
  /** Sellado del que proviene la carta */
  parentLotId: number | null;
  /** Valoración manual (nivel 3); prevalece sobre el mercado */
  manualUnitValueCents: number | null;
  notes: string | null;
  createdAt: string;
}

export interface Disposal {
  id?: number;
  lotId: number;
  disposedOn: ISODate;
  quantity: number;
  channel: DisposalChannel;
  unitProceedsCents: number;
  feesCents: number;
  notes: string | null;
}

export interface WatchItem {
  id?: number;
  variantId: string;
  condition: Condition;
  language: string;
  /** null = solo lista de deseos, sin alerta */
  direction: 'above' | 'below' | null;
  thresholdCents: number | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface Snapshot {
  /** portafolio|fecha; portafolio 0 = consolidado */
  id: string;
  portfolioId: number;
  date: ISODate;
  itemsOnHand: number;
  marketValueCents: number;
  costBasisCents: number;
  unrealizedCents: number;
  realizedCents: number;
}

export interface Settings {
  conditionFactors: Record<Condition, number>;
  maxAgeDays: number;
  defaultLanguage: string;
  /** Tipo de cambio EUR→USD manual, usado si el del BCE no está disponible */
  manualEurUsd: number | null;
  lastRefreshAt: string | null;
}

export const PRICE_SOURCES: PriceSource[] = [
  { code: 'tcgplayer', name: 'TCGplayer', currency: 'USD', marketLanguage: 'en', priority: 1, valuationLevel: 1 },
  { code: 'cardmarket', name: 'Cardmarket', currency: 'EUR', marketLanguage: null, priority: 2, valuationLevel: 2 },
];

export const DEFAULT_SETTINGS: Settings = {
  conditionFactors: { NM: 1, LP: 1, MP: 1, HP: 1, DMG: 1 },
  maxAgeDays: 30,
  defaultLanguage: 'es',
  manualEurUsd: null,
  lastRefreshAt: null,
};

export const variantIdOf = (itemId: string, finish: Finish): string => `${itemId}#${finish}`;

export function parseVariantId(variantId: string): { itemId: string; finish: Finish } {
  const i = variantId.lastIndexOf('#');
  return { itemId: variantId.slice(0, i), finish: variantId.slice(i + 1) as Finish };
}

export class DomainError extends Error {}
