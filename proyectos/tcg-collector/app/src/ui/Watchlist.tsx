import { useState } from 'react';
import { parseVariantId, type WatchItem } from '../domain/types';
import { CardThumb, ConfirmButton, EmptyState } from './components';
import { FINISH_LABEL, centsToInput, languageLabel, money, parseMoney, shortDate } from './format';
import { useStore } from './store';

export function Watchlist() {
  const { state, engine, today, repo, run } = useStore();
  if (!state || !engine) return null;

  if (state.watch.length === 0) {
    return (
      <EmptyState title="Tu lista de deseos está vacía" action={<a className="btn btn-primary" href="#agregar">Buscar una carta</a>}>
        <p>Desde la ficha de cualquier carta puedes añadirla a deseos y pedir un aviso cuando su precio baje de un umbral.</p>
      </EmptyState>
    );
  }

  const due = new Set(engine.alertsDue(state.watch, today).map((a) => a.watch.id));

  return (
    <ul className="lot-list">
      {state.watch.map((w) => {
        const { itemId, finish } = parseVariantId(w.variantId);
        const item = state.catalog.get(itemId);
        const name = item?.localNames.es ?? item?.name ?? itemId;
        const p = engine.unitPrice({ variantId: w.variantId, condition: w.condition, language: w.language, gradeKey: 'RAW', asOf: today });
        return (
          <li key={w.id} className={`watch ${due.has(w.id) ? 'watch-due' : ''}`}>
            <div className="lot-row static">
              <CardThumb image={item?.image ?? null} alt={name} />
              <span className="lot-main">
                <strong className="lot-name">{name}</strong>
                <span className="muted small">{[item?.setName, item?.number, FINISH_LABEL[finish], languageLabel(w.language)].filter(Boolean).join(' · ')}</span>
                {due.has(w.id) && <span className="tag tag-alert">Cruzó tu umbral</span>}
                {!w.isActive && <span className="tag">Alerta en pausa</span>}
              </span>
              <span className="lot-figures">
                <span className="num strong">{p ? money(p.unitValueCents) : 'sin precio'}</span>
                {p && <span className="muted small">{shortDate(p.observedOn)}</span>}
              </span>
            </div>
            <WatchControls w={w} due={due.has(w.id)} onDelete={() => run(() => repo.deleteWatch(w.id!), 'Quitada de tu lista de deseos')} />
          </li>
        );
      })}
    </ul>
  );
}

function WatchControls({ w, due, onDelete }: { w: WatchItem; due: boolean; onDelete: () => void }) {
  const { repo, run, toast } = useStore();
  const [direction, setDirection] = useState<'above' | 'below'>(w.direction ?? 'below');
  const [threshold, setThreshold] = useState(centsToInput(w.thresholdCents));
  return (
    <div className="watch-controls">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const cents = parseMoney(threshold);
          if (Number.isNaN(cents) || (cents != null && cents <= 0)) return toast('El umbral debe ser un importe mayor que cero', 'error');
          void run(
            () => repo.updateWatch(w.id!, { direction: cents == null ? null : direction, thresholdCents: cents, lastTriggeredAt: null }),
            cents == null ? 'Alerta eliminada' : 'Alerta guardada',
          );
        }}
      >
        <label>
          Avisar cuando
          <select id={`dir-${w.id}`} value={direction} onChange={(e) => setDirection(e.target.value as 'above' | 'below')}>
            <option value="below">baje de</option>
            <option value="above">suba de</option>
          </select>
        </label>
        <label>
          Umbral (USD)
          <input id={`umbral-${w.id}`} inputMode="decimal" placeholder="Sin alerta" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-sm">Guardar</button>
      </form>
      <div className="actions">
        {due && (
          <button type="button" className="btn btn-sm" onClick={() => run(() => repo.updateWatch(w.id!, { lastTriggeredAt: new Date().toISOString() }), 'Alerta marcada como vista')}>
            Marcar como vista
          </button>
        )}
        {w.direction && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => run(() => repo.updateWatch(w.id!, { isActive: !w.isActive }))}>
            {w.isActive ? 'Pausar alerta' : 'Reactivar alerta'}
          </button>
        )}
        <ConfirmButton label="Quitar" confirmLabel="Quitar de deseos" className="btn btn-ghost btn-sm" onConfirm={onDelete} />
      </div>
    </div>
  );
}
