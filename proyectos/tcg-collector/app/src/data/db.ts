import Dexie, { type Table } from 'dexie';
import type {
  CatalogItem,
  Disposal,
  FxRate,
  Lot,
  Portfolio,
  PriceObservation,
  Settings,
  Snapshot,
  WatchItem,
} from '../domain/types';

/** Linaje de cada corrida de actualización de precios (tabla ingest_run del SQL) */
export interface IngestRun {
  id?: number;
  startedAt: string;
  finishedAt: string | null;
  cards: number;
  observations: number;
  status: 'running' | 'ok' | 'partial' | 'failed';
  error: string | null;
}

export interface SettingsRow {
  key: 'settings';
  value: Settings;
}

export class CarpetaDB extends Dexie {
  catalog!: Table<CatalogItem, string>;
  observations!: Table<PriceObservation, string>;
  fx!: Table<FxRate, string>;
  portfolios!: Table<Portfolio, number>;
  lots!: Table<Lot, number>;
  disposals!: Table<Disposal, number>;
  watch!: Table<WatchItem, number>;
  snapshots!: Table<Snapshot, string>;
  ingestRuns!: Table<IngestRun, number>;
  settings!: Table<SettingsRow, string>;

  constructor(name = 'carpeta-tcg') {
    super(name);
    this.version(1).stores({
      catalog: 'itemId, kind, setId',
      observations: 'id, variantId, observedOn',
      fx: 'id, rateDate',
      portfolios: '++id',
      lots: '++id, portfolioId, variantId, parentLotId',
      disposals: '++id, lotId',
      watch: '++id, variantId',
      snapshots: 'id, portfolioId, date',
      ingestRuns: '++id, startedAt',
      settings: 'key',
    });
  }
}

export const TABLES = [
  'catalog',
  'observations',
  'fx',
  'portfolios',
  'lots',
  'disposals',
  'watch',
  'snapshots',
  'ingestRuns',
  'settings',
] as const;
