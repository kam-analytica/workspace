import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Snapshot, ValuationLevel } from '../domain/types';
import { cardImageUrl } from '../sources/tcgdex';
import { LEVEL_TEXT, money, pct, shortDate, signedMoney } from './format';
import { useStore } from './store';

// ---------------------------------------------------------------- iconos
const paths: Record<string, string> = {
  panel: 'M4 13h6V4H4zm0 7h6v-5H4zm10 0h6v-9h-6zm0-16v5h6V4z',
  coleccion: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 4v4h8V7z',
  agregar: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  deseos: 'm12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  ajustes: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM10.6 2h2.8l.5 2.6 2 .9 2.2-1.5 2 2-1.5 2.2.9 2 2.6.5v2.8l-2.6.5-.9 2 1.5 2.2-2 2-2.2-1.5-2 .9-.5 2.6h-2.8l-.5-2.6-2-.9-2.2 1.5-2-2 1.5-2.2-.9-2L2 13.4v-2.8l2.6-.5.9-2L4 5.9l2-2 2.2 1.5 2-.9z',
  refresh: 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.3L13 11h7V4z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z',
  search: 'M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------- cifras
export function Delta({ cents, base }: { cents: number | null; base?: number | null }) {
  if (cents == null) return <span className="muted">—</span>;
  const tone = cents > 0 ? 'pos' : cents < 0 ? 'neg' : 'muted';
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return (
    <span className={`delta ${tone}`}>
      <span className="num">{signedMoney(cents)}</span>
      {base != null && base > 0 && <span className="delta-pct num">{sign}{pct(Math.abs(cents / base))}</span>}
    </span>
  );
}

export function LevelBadge({ level }: { level: ValuationLevel | null }) {
  if (level == null) return <span className="badge badge-none" title="Sin precio vigente">Sin precio</span>;
  return (
    <span className={`badge badge-l${level}`} title={LEVEL_TEXT[level]}>
      Nivel {level}
    </span>
  );
}

// ---------------------------------------------------------------- imagen de carta
export function CardThumb({ image, alt, size = 'sm', sealed = false }: { image: string | null; alt: string; size?: 'sm' | 'md' | 'lg'; sealed?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = cardImageUrl(image, size === 'lg' ? 'high' : 'low');
  if (!src || failed) {
    return (
      <div className={`thumb thumb-${size} thumb-empty`} aria-label={alt}>
        <span>{sealed ? 'Sellado' : 'Sin imagen'}</span>
      </div>
    );
  }
  return <img className={`thumb thumb-${size}`} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

// ---------------------------------------------------------------- hoja modal
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d?.addEventListener('cancel', onCancel);
    return () => d?.removeEventListener('cancel', onCancel);
  }, [onClose]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

/** Botón con confirmación en la propia página (el visor no muestra confirm()) */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-danger' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm-row">
      <button type="button" className="btn btn-danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setArmed(false)}>
        Cancelar
      </button>
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
      {action}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.slice(-3).map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- historial
export function HistoryChart({ points }: { points: Snapshot[] }) {
  const data = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (data.length < 2) {
    return <p className="muted small">El historial se construye con cada actualización diaria de precios; aparecerá a partir del segundo día.</p>;
  }
  const W = 640;
  const H = 180;
  const pad = { l: 8, r: 8, t: 12, b: 6 };
  const values = data.flatMap((d) => [d.marketValueCents, d.costBasisCents]);
  const max = Math.max(...values) * 1.08 || 1;
  const min = Math.min(0, ...values);
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const line = (key: 'marketValueCents' | 'costBasisCents') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const area = `${line('marketValueCents')} L${x(data.length - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`;
  const last = data[data.length - 1];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Valor de mercado del ${shortDate(data[0].date)} al ${shortDate(last.date)}`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} className="grid" />
        ))}
        <path d={area} className="area" />
        <path d={line('costBasisCents')} className="line-cost" />
        <path d={line('marketValueCents')} className="line-value" />
        <circle cx={x(data.length - 1)} cy={y(last.marketValueCents)} r="4" className="dot" />
      </svg>
      <div className="axis-row small muted">
        <span>{shortDate(data[0].date)}</span>
        <span>{shortDate(last.date)}</span>
      </div>
      <figcaption className="legend">
        <span><i className="sw sw-value" /> Valor de mercado {money(last.marketValueCents)}</span>
        <span><i className="sw sw-cost" /> Coste base {money(last.costBasisCents)}</span>
      </figcaption>
    </figure>
  );
}
