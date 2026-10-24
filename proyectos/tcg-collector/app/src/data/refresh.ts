// Actualización de precios: equivale a la función programada del diseño con
// Supabase, ejecutada desde el propio dispositivo al abrir la app (si pasó más
// de un día) o a pedido. Cada corrida deja su linaje en ingestRuns.

import { DomainError, type ISODate } from '../domain/types';
import { fetchEcbEurUsd } from '../sources/fx';
import { getCard, pricingToObservations, toCatalogItem } from '../sources/tcgdex';
import { Repo } from './repo';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface RefreshReport {
  cards: number;
  observations: number;
  failed: string[];
  fxSource: string | null;
}

/** Trae la ficha de una carta, la guarda en el catálogo y registra sus precios */
export async function importCard(
  repo: Repo,
  itemId: string,
  names: Record<string, string>,
  opts: { fetchImpl?: FetchLike; today: ISODate; now?: string },
): Promise<number> {
  const now = opts.now ?? new Date().toISOString();
  const card = await getCard(itemId, 'en', opts.fetchImpl);
  if (!card) throw new DomainError(`TCGdex no tiene la carta ${itemId}`);
  await repo.upsertCatalogItem(toCatalogItem(card, { ...names, en: card.name }, now));
  const obs = pricingToObservations(card, now, opts.today);
  await repo.saveObservations(obs);
  return obs.length;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function refreshPrices(
  repo: Repo,
  opts: { fetchImpl?: FetchLike; today: ISODate; now?: string; onProgress?: (done: number, total: number) => void },
): Promise<RefreshReport> {
  const now = opts.now ?? new Date().toISOString();
  const state = await repo.loadState();
  const engine = Repo.engine(state);
  const variantIds = new Set<string>([
    ...state.lots.filter((l) => engine.qtyOnHand(l) > 0).map((l) => l.variantId),
    ...state.watch.filter((w) => w.isActive).map((w) => w.variantId),
  ]);
  const itemIds = [...new Set([...variantIds].map((v) => v.slice(0, v.lastIndexOf('#'))))].filter(
    (id) => state.catalog.get(id)?.kind === 'card',
  );

  const runId = await repo.startRun();
  let fxSource: string | null = null;
  const fx = await fetchEcbEurUsd(opts.fetchImpl);
  if (fx) {
    await repo.saveFx(fx);
    fxSource = fx.source;
  } else if (state.settings.manualEurUsd) {
    await repo.saveFx({ id: `${opts.today}|EUR|USD`, rateDate: opts.today, base: 'EUR', quote: 'USD', rate: state.settings.manualEurUsd, source: 'manual' });
    fxSource = 'manual';
  }

  let observations = 0;
  let done = 0;
  const failed: string[] = [];
  await pool(itemIds, 4, async (id) => {
    try {
      observations += await importCard(repo, id, state.catalog.get(id)?.localNames ?? {}, { fetchImpl: opts.fetchImpl, today: opts.today, now });
    } catch {
      failed.push(id);
    }
    opts.onProgress?.(++done, itemIds.length);
  });

  await repo.pruneObservations(opts.today);
  await repo.takeSnapshots(opts.today);
  await repo.saveSettings({ lastRefreshAt: now });
  const status = failed.length === 0 ? 'ok' : failed.length < itemIds.length ? 'partial' : 'failed';
  await repo.finishRun(runId, {
    cards: itemIds.length - failed.length,
    observations,
    status,
    error: failed.length ? `Sin respuesta para: ${failed.join(', ')}` : null,
  });
  return { cards: itemIds.length - failed.length, observations, failed, fxSource };
}
