// Respaldo completo en JSON (los datos viven solo en este dispositivo) y
// exportación de la colección a CSV para Excel en español.

import type { LotPosition } from '../domain/engine';
import { DomainError, parseVariantId, type CatalogItem, type Portfolio } from '../domain/types';
import { TABLES, type CarpetaDB } from './db';

export const BACKUP_FORMAT = 'carpeta-tcg';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<(typeof TABLES)[number], unknown[]>;
}

export async function exportBackup(db: CarpetaDB, now = new Date().toISOString()): Promise<Backup> {
  const tables = {} as Backup['tables'];
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) tables[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, tables };
}

/** Reemplaza todos los datos locales por los del respaldo */
export async function importBackup(db: CarpetaDB, raw: unknown): Promise<void> {
  const b = raw as Partial<Backup> | null;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== 'object' || b.tables == null) {
    throw new DomainError('El archivo no es un respaldo de Carpeta TCG');
  }
  if (b.version !== BACKUP_VERSION) throw new DomainError(`Versión de respaldo no compatible: ${b.version}`);
  for (const t of TABLES) {
    if (!Array.isArray(b.tables[t])) throw new DomainError(`El respaldo está incompleto: falta la tabla ${t}`);
  }
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd(b.tables![t] as object[]);
    }
  });
}

const FINISH_LABEL: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverse_holofoil: 'Reverse holo',
  first_edition_normal: '1.ª edición',
  first_edition_holofoil: '1.ª edición holo',
  sealed: 'Sellado',
};

const money = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','));

function cell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** CSV con separador «;» y coma decimal, como lo espera Excel configurado en español */
export function positionsCsv(positions: LotPosition[], catalog: Map<string, CatalogItem>, portfolios: Portfolio[]): string {
  const pname = new Map(portfolios.map((p) => [p.id, p.name]));
  const header = [
    'Portafolio', 'Carta', 'Set', 'Número', 'Acabado', 'Estado', 'Idioma', 'Grado', 'Cantidad',
    'Coste base USD', 'Valor unitario USD', 'Valor de mercado USD', 'Resultado no realizado USD',
    'Fuente de precio', 'Fecha de precio', 'Nivel', 'Adquirido el', 'Notas',
  ];
  const lines = positions.map((p) => {
    const { itemId, finish } = parseVariantId(p.lot.variantId);
    const item = catalog.get(itemId);
    return [
      pname.get(p.lot.portfolioId) ?? '',
      item?.localNames.es ?? item?.name ?? itemId,
      item?.setName ?? '',
      item?.number ?? '',
      FINISH_LABEL[finish] ?? finish,
      item?.kind === 'sealed' ? '' : p.lot.condition,
      p.lot.language,
      p.gradeKey === 'RAW' ? '' : p.gradeKey,
      p.qtyOnHand,
      money(p.costBasisCents),
      money(p.unitValueCents),
      money(p.marketValueCents),
      money(p.unrealizedCents),
      p.priceSource ?? 'sin precio',
      p.priceDate ?? '',
      p.valuationLevel ?? '',
      p.lot.acquiredOn,
      p.lot.notes ?? '',
    ].map(cell).join(';');
  });
  return '﻿' + [header.join(';'), ...lines].join('\r\n') + '\r\n';
}
