// Operaciones de la colección sobre IndexedDB. Toda escritura pasa por las
// mismas reglas que db/schema.sql (validateLot, validateDisposal) antes de
// tocar la base.

import { Engine, validateLot } from '../domain/engine';
import {
  DEFAULT_SETTINGS,
  DomainError,
  PRICE_SOURCES,
  type CatalogItem,
  type Disposal,
  type FxRate,
  type ISODate,
  type Lot,
  type Portfolio,
  type PriceObservation,
  type Settings,
  type Snapshot,
  type WatchItem,
} from '../domain/types';
import { addDays } from '../domain/util';
import type { CarpetaDB, IngestRun } from './db';

export interface AppState {
  catalog: Map<string, CatalogItem>;
  portfolios: Portfolio[];
  lots: Lot[];
  disposals: Disposal[];
  observations: PriceObservation[];
  fx: FxRate[];
  watch: WatchItem[];
  snapshots: Snapshot[];
  settings: Settings;
}

export type NewLot = Omit<Lot, 'id' | 'createdAt'>;

/** Días de historial de precios que se conservan */
export const OBSERVATION_RETENTION_DAYS = 400;

export class Repo {
  constructor(
    readonly db: CarpetaDB,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async ensureDefaults(): Promise<void> {
    await this.db.transaction('rw', this.db.portfolios, this.db.settings, async () => {
      if ((await this.db.portfolios.count()) === 0) {
        await this.db.portfolios.add({ name: 'Principal', isDefault: true, createdAt: this.now() });
      }
      if (!(await this.db.settings.get('settings'))) {
        await this.db.settings.put({ key: 'settings', value: DEFAULT_SETTINGS });
      }
    });
  }

  async getSettings(): Promise<Settings> {
    const row = await this.db.settings.get('settings');
    return { ...DEFAULT_SETTINGS, ...row?.value };
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch };
    if (!(next.maxAgeDays >= 1 && next.maxAgeDays <= 365)) throw new DomainError('La vigencia debe estar entre 1 y 365 días');
    for (const f of Object.values(next.conditionFactors)) {
      if (!(f > 0 && f <= 1)) throw new DomainError('Cada factor por estado debe ser mayor que 0 y como máximo 1');
    }
    if (next.manualEurUsd != null && !(next.manualEurUsd > 0)) throw new DomainError('El tipo de cambio manual debe ser positivo');
    await this.db.settings.put({ key: 'settings', value: next });
    return next;
  }

  async loadState(): Promise<AppState> {
    const [catalog, portfolios, lots, disposals, observations, fx, watch, snapshots, settings] = await Promise.all([
      this.db.catalog.toArray(),
      this.db.portfolios.toArray(),
      this.db.lots.toArray(),
      this.db.disposals.toArray(),
      this.db.observations.toArray(),
      this.db.fx.toArray(),
      this.db.watch.toArray(),
      this.db.snapshots.toArray(),
      this.getSettings(),
    ]);
    return { catalog: new Map(catalog.map((c) => [c.itemId, c])), portfolios, lots, disposals, observations, fx, watch, snapshots, settings };
  }

  static engine(state: AppState): Engine {
    return new Engine({
      lots: state.lots,
      disposals: state.disposals,
      observations: state.observations,
      fx: state.fx,
      sources: PRICE_SOURCES,
      settings: state.settings,
      kindOfVariant: (variantId) => state.catalog.get(variantId.slice(0, variantId.lastIndexOf('#')))?.kind,
    });
  }

  // ---------------------------------------------------------------- portafolios
  async addPortfolio(name: string): Promise<number> {
    const clean = name.trim();
    if (!clean) throw new DomainError('Escribe un nombre para el portafolio');
    const all = await this.db.portfolios.toArray();
    if (all.some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new DomainError(`Ya existe un portafolio llamado «${clean}»`);
    return this.db.portfolios.add({ name: clean, isDefault: all.length === 0, createdAt: this.now() });
  }

  async renamePortfolio(id: number, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new DomainError('Escribe un nombre para el portafolio');
    const all = await this.db.portfolios.toArray();
    if (all.some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) {
      throw new DomainError(`Ya existe un portafolio llamado «${clean}»`);
    }
    await this.db.portfolios.update(id, { name: clean });
  }

  async deletePortfolio(id: number): Promise<void> {
    const p = await this.db.portfolios.get(id);
    if (!p) return;
    if (p.isDefault) throw new DomainError('El portafolio principal no se puede eliminar');
    if ((await this.db.lots.where('portfolioId').equals(id).count()) > 0) {
      throw new DomainError(`«${p.name}» tiene cartas registradas; muévelas o elimínalas antes`);
    }
    await this.db.portfolios.delete(id);
  }

  // ---------------------------------------------------------------- catálogo y precios
  async upsertCatalogItem(item: CatalogItem): Promise<void> {
    const prev = await this.db.catalog.get(item.itemId);
    await this.db.catalog.put(prev ? { ...item, localNames: { ...prev.localNames, ...item.localNames } } : item);
  }

  async addSealedItem(input: { name: string; setName: string | null }): Promise<CatalogItem> {
    const name = input.name.trim();
    if (!name) throw new DomainError('Escribe el nombre del producto sellado');
    const item: CatalogItem = {
      itemId: `sealed-${crypto.randomUUID()}`,
      kind: 'sealed',
      setId: null,
      setName: input.setName?.trim() || null,
      name,
      localNames: { es: name },
      number: null,
      rarity: null,
      image: null,
      finishes: ['sealed'],
      updatedAt: this.now(),
    };
    await this.db.catalog.put(item);
    return item;
  }

  async saveObservations(obs: PriceObservation[]): Promise<void> {
    if (obs.length) await this.db.observations.bulkPut(obs);
  }

  async saveFx(rate: FxRate): Promise<void> {
    await this.db.fx.put(rate);
  }

  async pruneObservations(today: ISODate): Promise<number> {
    return this.db.observations.where('observedOn').below(addDays(today, -OBSERVATION_RETENTION_DAYS)).delete();
  }

  // ---------------------------------------------------------------- lotes
  async addLot(input: NewLot): Promise<number> {
    validateLot(input);
    return this.db.transaction('rw', [this.db.lots, this.db.portfolios, this.db.catalog], async () => {
      if (!(await this.db.portfolios.get(input.portfolioId))) throw new DomainError('El portafolio seleccionado no existe');
      const itemId = input.variantId.slice(0, input.variantId.lastIndexOf('#'));
      if (!(await this.db.catalog.get(itemId))) throw new DomainError('La carta no está en el catálogo local');
      if (input.parentLotId != null) {
        const parent = await this.db.lots.get(input.parentLotId);
        const parentItem = parent && (await this.db.catalog.get(parent.variantId.slice(0, parent.variantId.lastIndexOf('#'))));
        if (!parent || parentItem?.kind !== 'sealed') throw new DomainError('El producto de origen debe ser un sellado registrado');
      }
      return this.db.lots.add({ ...input, createdAt: this.now() });
    });
  }

  async updateLot(id: number, patch: Partial<NewLot>): Promise<void> {
    await this.db.transaction('rw', this.db.lots, this.db.disposals, async () => {
      const lot = await this.db.lots.get(id);
      if (!lot) throw new DomainError(`Lote ${id}: no existe`);
      const next = { ...lot, ...patch, id };
      validateLot(next);
      const disposed = (await this.db.disposals.where('lotId').equals(id).toArray()).reduce((s, d) => s + d.quantity, 0);
      if (next.quantity < disposed) throw new DomainError(`Lote ${id}: ya registra ${disposed} unidades dispuestas`);
      await this.db.lots.put(next);
    });
  }

  async deleteLot(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.lots, this.db.disposals, async () => {
      if ((await this.db.lots.where('parentLotId').equals(id).count()) > 0) {
        throw new DomainError('Este sellado tiene cartas obtenidas registradas; elimínalas primero');
      }
      await this.db.disposals.where('lotId').equals(id).delete();
      await this.db.lots.delete(id);
    });
  }

  // ---------------------------------------------------------------- disposiciones
  async addDisposal(d: Omit<Disposal, 'id'>): Promise<number> {
    return this.db.transaction('rw', [this.db.lots, this.db.disposals, this.db.catalog], async () => {
      const state = await this.engineForWrites();
      state.validateDisposal(d);
      return this.db.disposals.add(d);
    });
  }

  async deleteDisposal(id: number): Promise<void> {
    await this.db.disposals.delete(id);
  }

  /** Asigna el coste del sellado abierto a las cartas obtenidas */
  async allocateOpenedCost(parentLotId: number, valuationDate?: ISODate): Promise<number> {
    const state = await this.loadState();
    const lines = Repo.engine(state).allocateOpenedCost(parentLotId, valuationDate);
    const opening = state.disposals.find((d) => d.lotId === parentLotId && d.channel === 'opened')!;
    await this.db.transaction('rw', this.db.lots, async () => {
      for (const l of lines) {
        await this.db.lots.update(l.lotId, {
          acquisitionCostCents: l.acquisitionCostCents,
          acquiredOn: opening.disposedOn,
          channel: 'pack_pull',
        });
      }
    });
    return lines.length;
  }

  private async engineForWrites(): Promise<Engine> {
    const [lots, disposals, catalog] = await Promise.all([
      this.db.lots.toArray(),
      this.db.disposals.toArray(),
      this.db.catalog.toArray(),
    ]);
    const kinds = new Map(catalog.map((c) => [c.itemId, c.kind]));
    return new Engine({
      lots,
      disposals,
      observations: [],
      fx: [],
      sources: PRICE_SOURCES,
      settings: DEFAULT_SETTINGS,
      kindOfVariant: (v) => kinds.get(v.slice(0, v.lastIndexOf('#'))),
    });
  }

  // ---------------------------------------------------------------- deseos y alertas
  async addWatch(w: Omit<WatchItem, 'id' | 'createdAt' | 'lastTriggeredAt' | 'isActive'>): Promise<number> {
    if ((w.direction == null) !== (w.thresholdCents == null)) throw new DomainError('Una alerta requiere dirección y umbral');
    if (w.thresholdCents != null && !(w.thresholdCents > 0)) throw new DomainError('El umbral debe ser mayor que cero');
    return this.db.watch.add({ ...w, isActive: true, lastTriggeredAt: null, createdAt: this.now() });
  }

  async updateWatch(id: number, patch: Partial<WatchItem>): Promise<void> {
    await this.db.watch.update(id, patch);
  }

  async deleteWatch(id: number): Promise<void> {
    await this.db.watch.delete(id);
  }

  // ---------------------------------------------------------------- instantáneas
  /** take_portfolio_snapshots(): idempotente por portafolio y día; 0 = consolidado */
  async takeSnapshots(today: ISODate): Promise<number> {
    const state = await this.loadState();
    const engine = Repo.engine(state);
    const rows: Snapshot[] = [0, ...state.portfolios.map((p) => p.id!)].map((pid) => {
      const s = engine.summary(today, pid === 0 ? null : pid);
      return {
        id: `${pid}|${today}`,
        portfolioId: pid,
        date: today,
        itemsOnHand: s.itemsOnHand,
        marketValueCents: s.marketValueCents,
        costBasisCents: s.costBasisCents,
        unrealizedCents: s.unrealizedCents,
        realizedCents: s.realizedCents,
      };
    });
    await this.db.snapshots.bulkPut(rows);
    return rows.length;
  }

  // ---------------------------------------------------------------- linaje
  async startRun(): Promise<number> {
    return this.db.ingestRuns.add({ startedAt: this.now(), finishedAt: null, cards: 0, observations: 0, status: 'running', error: null });
  }

  async finishRun(id: number, patch: Pick<IngestRun, 'cards' | 'observations' | 'status' | 'error'>): Promise<void> {
    await this.db.ingestRuns.update(id, { ...patch, finishedAt: this.now() });
  }
}
