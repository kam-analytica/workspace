import { useMemo, useState } from 'react';
import { parseVariantId } from '../domain/types';
import { CardThumb, Delta, EmptyState, HistoryChart, LevelBadge } from './components';
import { FINISH_LABEL, LEVEL_TEXT, money, pct, shortDate } from './format';
import { useStore } from './store';

export function Dashboard({ onOpenLot }: { onOpenLot: (lotId: number) => void }) {
  const { state, engine, today } = useStore();
  const [portfolioId, setPortfolioId] = useState<number | null>(null);

  const summary = useMemo(() => engine?.summary(today, portfolioId), [engine, today, portfolioId]);
  const positions = useMemo(
    () => (engine ? engine.positions(today).filter((p) => portfolioId == null || p.lot.portfolioId === portfolioId) : []),
    [engine, today, portfolioId],
  );
  const alerts = useMemo(() => (engine && state ? engine.alertsDue(state.watch, today) : []), [engine, state, today]);

  if (!state || !engine || !summary) return null;

  if (state.lots.length === 0) {
    return (
      <EmptyState
        title="Tu carpeta está vacía"
        action={
          <a className="btn btn-primary" href="#agregar">
            Agregar tu primera carta
          </a>
        }
      >
        <p>Busca una carta por su nombre en español o inglés, indica cuánto pagaste y la app la valorará cada día con precios de TCGplayer y Cardmarket.</p>
      </EmptyState>
    );
  }

  const top = [...positions].filter((p) => p.marketValueCents != null).sort((a, b) => b.marketValueCents! - a.marketValueCents!).slice(0, 6);
  const snaps = state.snapshots.filter((s) => s.portfolioId === (portfolioId ?? 0));
  const pricedCost = summary.costBasisCents - summary.costBasisUnpricedCents;

  return (
    <div className="stack">
      {state.portfolios.length > 1 && (
        <div className="chips" role="group" aria-label="Portafolio">
          <button type="button" className={`chip ${portfolioId == null ? 'on' : ''}`} onClick={() => setPortfolioId(null)}>
            Todos
          </button>
          {state.portfolios.map((p) => (
            <button key={p.id} type="button" className={`chip ${portfolioId === p.id ? 'on' : ''}`} onClick={() => setPortfolioId(p.id!)}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {alerts.length > 0 && (
        <a className="alert-banner" href="#deseos">
          <strong>{alerts.length === 1 ? '1 alerta de precio' : `${alerts.length} alertas de precio`}</strong> cruzó su umbral. Revisa tu lista de deseos.
        </a>
      )}

      <section className="kpis" aria-label="Resumen de la colección">
        <div className="kpi kpi-main">
          <span className="kpi-label">Valor de mercado</span>
          <span className="kpi-value num" data-testid="valor-mercado">{money(summary.marketValueCents)}</span>
          <span className="kpi-sub">
            {summary.itemsOnHand} {summary.itemsOnHand === 1 ? 'pieza' : 'piezas'} · precios hasta el {shortDate(state.settings.lastRefreshAt)}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Coste base</span>
          <span className="kpi-value num">{money(summary.costBasisCents)}</span>
        </div>
        <div className="kpi kpi-wide">
          <span className="kpi-label">Resultado no realizado</span>
          <span className="kpi-value" data-testid="no-realizado"><Delta cents={summary.unrealizedCents} base={pricedCost} /></span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Resultado realizado</span>
          <span className="kpi-value" data-testid="realizado"><Delta cents={summary.realizedCents} /></span>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Calidad del dato</h2>
        <div className="levels" role="img" aria-label="Participación del valor por nivel de valoración">
          {([1, 2, 3] as const).map((lvl) =>
            summary.shareByLevel[lvl] ? (
              <span key={lvl} className={`level-seg seg-l${lvl}`} style={{ flexGrow: summary.shareByLevel[lvl]! }} />
            ) : null,
          )}
        </div>
        <ul className="level-legend">
          {([1, 2, 3] as const).map((lvl) => (
            <li key={lvl}>
              <i className={`sw seg-l${lvl}`} /> <strong>Nivel {lvl}</strong> {pct(summary.shareByLevel[lvl] ?? 0)}
              <span className="muted"> · {LEVEL_TEXT[lvl]}</span>
            </li>
          ))}
        </ul>
        {summary.lotsWithoutPrice > 0 && (
          <p className="note">
            {summary.lotsWithoutPrice === 1 ? '1 lote no tiene' : `${summary.lotsWithoutPrice} lotes no tienen`} precio vigente ({money(summary.costBasisUnpricedCents)} de coste sin valorar). No se suman al valor ni al resultado.
          </p>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">Evolución</h2>
        <HistoryChart points={snaps} />
      </section>

      <section className="panel">
        <h2 className="panel-title">Más valiosas</h2>
        <ul className="top-list">
          {top.map((p) => {
            const { itemId, finish } = parseVariantId(p.lot.variantId);
            const item = state.catalog.get(itemId);
            return (
              <li key={p.lot.id}>
                <button type="button" className="top-row" onClick={() => onOpenLot(p.lot.id!)}>
                  <CardThumb image={item?.image ?? null} alt={item?.name ?? itemId} sealed={item?.kind === 'sealed'} />
                  <span className="top-name">
                    <strong>{item?.localNames.es ?? item?.name ?? itemId}</strong>
                    <span className="muted small">
                      {item?.setName ?? ''} {item?.number ? `· ${item.number}` : ''} · {FINISH_LABEL[finish]} {p.qtyOnHand > 1 ? `· ×${p.qtyOnHand}` : ''}
                    </span>
                  </span>
                  <span className="top-value">
                    <span className="num">{money(p.marketValueCents)}</span>
                    <LevelBadge level={p.valuationLevel} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
