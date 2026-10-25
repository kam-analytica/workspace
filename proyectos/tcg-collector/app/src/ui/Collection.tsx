import { useMemo, useState } from 'react';
import { parseVariantId } from '../domain/types';
import { matchesQuery } from '../domain/util';
import { CardThumb, Delta, EmptyState, Icon, LevelBadge } from './components';
import { FINISH_LABEL, languageLabel, money, shortDate } from './format';
import { useStore } from './store';

type SortKey = 'value' | 'pnl' | 'name' | 'recent';

export function Collection({ onOpenLot }: { onOpenLot: (lotId: number) => void }) {
  const { state, engine, today } = useStore();
  const [query, setQuery] = useState('');
  const [portfolioId, setPortfolioId] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('value');

  const rows = useMemo(() => {
    if (!state || !engine) return [];
    const list = engine
      .positions(today)
      .filter((p) => portfolioId === 'all' || String(p.lot.portfolioId) === portfolioId)
      .map((p) => {
        const { itemId, finish } = parseVariantId(p.lot.variantId);
        const item = state.catalog.get(itemId);
        const name = item?.localNames.es ?? item?.name ?? itemId;
        const haystack = [name, item?.name, item?.setName, item?.number, itemId, FINISH_LABEL[finish], p.lot.notes].join(' ');
        return { p, item, finish, name, haystack };
      })
      .filter((r) => !query || matchesQuery(r.haystack, query));
    const cmp: Record<SortKey, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      value: (a, b) => (b.p.marketValueCents ?? -1) - (a.p.marketValueCents ?? -1),
      pnl: (a, b) => (b.p.unrealizedCents ?? -Infinity) - (a.p.unrealizedCents ?? -Infinity),
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
      recent: (a, b) => (a.p.lot.acquiredOn < b.p.lot.acquiredOn ? 1 : -1),
    };
    return list.sort(cmp[sort]);
  }, [state, engine, today, portfolioId, query, sort]);

  if (!state || !engine) return null;
  if (state.lots.length === 0) {
    return (
      <EmptyState title="Aún no tienes cartas registradas" action={<a className="btn btn-primary" href="#agregar">Agregar una carta</a>} />
    );
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input id="filtro-coleccion" type="search" placeholder="Filtrar por nombre, set o número" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filtrar colección" />
        </label>
        {state.portfolios.length > 1 && (
          <select id="filtro-portafolio" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} aria-label="Portafolio">
            <option value="all">Todos los portafolios</option>
            {state.portfolios.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        )}
        <select id="orden-coleccion" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
          <option value="value">Mayor valor</option>
          <option value="pnl">Mayor resultado</option>
          <option value="name">Nombre</option>
          <option value="recent">Más recientes</option>
        </select>
      </div>

      <p className="muted small">{rows.length} {rows.length === 1 ? 'lote' : 'lotes'} en la vista</p>

      <OpenedSealed onOpenLot={onOpenLot} />

      <ul className="lot-list">
        {rows.map(({ p, item, finish, name }) => (
          <li key={p.lot.id}>
            <button type="button" className="lot-row" onClick={() => onOpenLot(p.lot.id!)}>
              <CardThumb image={item?.image ?? null} alt={name} sealed={item?.kind === 'sealed'} />
              <span className="lot-main">
                <strong className="lot-name">{name}</strong>
                <span className="muted small">
                  {[item?.setName, item?.number, FINISH_LABEL[finish]].filter(Boolean).join(' · ')}
                </span>
                <span className="tags">
                  {item?.kind !== 'sealed' && <span className="tag">{p.gradeKey !== 'RAW' ? p.gradeKey.replace(/([A-Z]+)/, '$1 ') : p.lot.condition}</span>}
                  {item?.kind !== 'sealed' && <span className="tag">{languageLabel(p.lot.language)}</span>}
                  {p.qtyOnHand > 1 && <span className="tag">×{p.qtyOnHand}</span>}
                </span>
              </span>
              <span className="lot-figures">
                <span className="num strong">{money(p.marketValueCents)}</span>
                <Delta cents={p.unrealizedCents} />
                <LevelBadge level={p.valuationLevel} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sellados ya abiertos: no quedan en mano, pero su coste debe asignarse a las cartas obtenidas */
function OpenedSealed({ onOpenLot }: { onOpenLot: (lotId: number) => void }) {
  const { state } = useStore();
  if (!state) return null;
  const opened = state.disposals
    .filter((d) => d.channel === 'opened')
    .map((d) => {
      const lot = state.lots.find((l) => l.id === d.lotId);
      if (!lot) return null;
      const children = state.lots.filter((l) => l.parentLotId === lot.id);
      const pool = Math.round((lot.acquisitionCostCents * d.quantity) / lot.quantity);
      const assigned = children.reduce((s, c) => s + c.acquisitionCostCents, 0);
      const item = state.catalog.get(parseVariantId(lot.variantId).itemId);
      return { lot, d, children, pending: children.length === 0 || assigned !== pool, name: item?.name ?? 'Sellado' };
    })
    .filter((x): x is NonNullable<typeof x> => x != null && x.pending);
  if (opened.length === 0) return null;
  return (
    <section className="panel">
      <h2 className="panel-title">Sellados abiertos con coste pendiente</h2>
      <ul className="plain">
        {opened.map((o) => (
          <li key={o.lot.id} className="row-between">
            <span>
              <strong>{o.name}</strong> <span className="muted small">· abierto el {shortDate(o.d.disposedOn)} · {o.children.length} {o.children.length === 1 ? 'carta' : 'cartas'} registradas</span>
            </span>
            <button type="button" className="btn btn-sm" onClick={() => onOpenLot(o.lot.id!)}>Completar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
