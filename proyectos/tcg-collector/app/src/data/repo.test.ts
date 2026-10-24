import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockFetch } from '../sources/fixtures/mockApi';
import { exportBackup, importBackup, positionsCsv } from './backup';
import { CarpetaDB } from './db';
import { importCard, refreshPrices } from './refresh';
import { Repo, type NewLot } from './repo';

const TODAY = '2026-10-24';
let seq = 0;

function newLot(p: Partial<NewLot>): NewLot {
  return {
    portfolioId: 1,
    variantId: 'swsh7-49#normal',
    quantity: 1,
    condition: 'NM',
    language: 'en',
    grader: null,
    grade: null,
    certNumber: null,
    acquiredOn: '2026-10-01',
    channel: 'purchase',
    acquisitionCostCents: 0,
    parentLotId: null,
    manualUnitValueCents: null,
    notes: null,
    ...p,
  };
}

describe('Repositorio local (IndexedDB)', () => {
  let repo: Repo;
  const fetchImpl = createMockFetch(TODAY);

  beforeEach(async () => {
    repo = new Repo(new CarpetaDB(`prueba-${++seq}`), () => `${TODAY}T12:00:00.000Z`);
    await repo.ensureDefaults();
  });

  it('crea el portafolio principal y los ajustes por defecto una sola vez', async () => {
    await repo.ensureDefaults();
    const s = await repo.loadState();
    expect(s.portfolios.map((p) => [p.name, p.isDefault])).toEqual([['Principal', true]]);
    expect(s.settings.maxAgeDays).toBe(30);
  });

  it('registra una carta, la valora y calcula el resultado de una venta', async () => {
    await importCard(repo, 'swsh12.5gg-GG30', { es: 'Pikachu' }, { fetchImpl, today: TODAY });
    const lotId = await repo.addLot(newLot({ variantId: 'swsh12.5gg-GG30#holofoil', quantity: 2, acquisitionCostCents: 1000 }));
    await repo.addDisposal({ lotId, disposedOn: TODAY, quantity: 1, channel: 'sale', unitProceedsCents: 800, feesCents: 50, notes: null });
    await expect(
      repo.addDisposal({ lotId, disposedOn: TODAY, quantity: 2, channel: 'sale', unitProceedsCents: 0, feesCents: 0, notes: null }),
    ).rejects.toThrow('disponible 1, solicitado 2');
    const s = Repo.engine(await repo.loadState()).summary(TODAY);
    expect(s.marketValueCents).toBe(650);
    expect(s.costBasisCents).toBe(500);
    expect(s.unrealizedCents).toBe(150);
    expect(s.realizedCents).toBe(250);
  });

  it('abre un sellado y reparte su coste entre las cartas obtenidas', async () => {
    const sealed = await repo.addSealedItem({ name: 'Caja de sobres de prueba', setName: null });
    const box = await repo.addLot(newLot({ variantId: `${sealed.itemId}#sealed`, acquisitionCostCents: 5000 }));
    await importCard(repo, 'swsh7-215', {}, { fetchImpl, today: TODAY });
    await importCard(repo, 'svp-196', {}, { fetchImpl, today: TODAY });
    await repo.addDisposal({ lotId: box, disposedOn: TODAY, quantity: 1, channel: 'opened', unitProceedsCents: 0, feesCents: 0, notes: null });
    await repo.addLot(newLot({ variantId: 'swsh7-215#holofoil', parentLotId: box, acquiredOn: TODAY }));
    await repo.addLot(newLot({ variantId: 'svp-196#holofoil', parentLotId: box, acquiredOn: TODAY }));
    expect(await repo.allocateOpenedCost(box)).toBe(2);
    const children = (await repo.loadState()).lots.filter((l) => l.parentLotId === box);
    // 145 000 y 1 200 centavos de valor relativo sobre un pozo de 5 000
    expect(children.map((c) => c.acquisitionCostCents)).toEqual([4959, 41]);
    expect(children.every((c) => c.channel === 'pack_pull')).toBe(true);
    await expect(repo.deleteLot(box)).rejects.toThrow('tiene cartas obtenidas');
  });

  it('actualiza precios, guarda el linaje y toma una instantánea idempotente (T8)', async () => {
    await importCard(repo, 'swsh7-49', { es: 'Pikachu' }, { fetchImpl, today: '2026-10-01' });
    await repo.addLot(newLot({ language: 'es', quantity: 4, acquisitionCostCents: 100 }));
    const report = await refreshPrices(repo, { fetchImpl, today: TODAY });
    expect(report).toMatchObject({ cards: 1, failed: [], fxSource: 'BCE vía Frankfurter' });
    await refreshPrices(repo, { fetchImpl, today: TODAY });
    const snaps = await repo.db.snapshots.where('date').equals(TODAY).toArray();
    expect(snaps.map((s) => s.portfolioId).sort()).toEqual([0, 1]);
    expect(snaps.find((s) => s.portfolioId === 0)?.marketValueCents).toBe(140);
    const runs = await repo.db.ingestRuns.toArray();
    expect(runs.map((r) => r.status)).toEqual(['ok', 'ok']);
  });

  it('marca la corrida como fallida si TCGdex no responde', async () => {
    await importCard(repo, 'swsh7-49', {}, { fetchImpl, today: TODAY });
    await repo.addLot(newLot({}));
    const offline = async () => {
      throw new TypeError('network');
    };
    const report = await refreshPrices(repo, { fetchImpl: offline, today: TODAY });
    expect(report.failed).toEqual(['swsh7-49']);
    expect((await repo.db.ingestRuns.toArray()).at(-1)?.status).toBe('failed');
  });

  it('respalda y restaura todos los datos', async () => {
    await importCard(repo, 'swsh7-49', { es: 'Pikachu' }, { fetchImpl, today: TODAY });
    await repo.addLot(newLot({ notes: 'Comprada en feria; "firmada"' }));
    const backup = await exportBackup(repo.db);
    const other = new Repo(new CarpetaDB(`prueba-${++seq}`));
    await importBackup(other.db, JSON.parse(JSON.stringify(backup)));
    const restored = await other.loadState();
    expect(restored.lots).toHaveLength(1);
    expect(restored.catalog.get('swsh7-49')?.localNames.es).toBe('Pikachu');
    await expect(importBackup(other.db, { format: 'otro' })).rejects.toThrow('no es un respaldo');

    const state = await repo.loadState();
    const csv = positionsCsv(Repo.engine(state).positions(TODAY), state.catalog, state.portfolios);
    const [head, row] = csv.replace('﻿', '').split('\r\n');
    expect(head.split(';')[0]).toBe('Portafolio');
    expect(row).toContain('Principal;Pikachu;Evolving Skies;49;Normal;NM;en;;1;0,00;0,35;0,35;0,35;tcgplayer;2026-10-24;1;2026-10-01;"Comprada en feria; ""firmada"""');
  });
});
