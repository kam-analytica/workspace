import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Engine } from '../domain/engine';
import { todayLocal } from '../domain/util';
import { refreshPrices } from '../data/refresh';
import { Repo, type AppState } from '../data/repo';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

/** Sellado abierto al que se están agregando las cartas obtenidas */
export interface PullContext {
  parentLotId: number;
  label: string;
}

interface Store {
  repo: Repo;
  state: AppState | null;
  engine: Engine | null;
  today: string;
  fetchImpl: FetchLike;
  reload: () => Promise<void>;
  /** Ejecuta una acción, recarga el estado y avisa del resultado. Devuelve false si falló. */
  run: (fn: () => Promise<unknown>, okText?: string) => Promise<boolean>;
  toast: (text: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  refresh: () => Promise<void>;
  refreshing: { done: number; total: number } | null;
  pull: PullContext | null;
  setPull: (p: PullContext | null) => void;
}

const StoreContext = createContext<Store | null>(null);

const AUTO_REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;

export function StoreProvider({ repo, fetchImpl, children }: { repo: Repo; fetchImpl: FetchLike; children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null);
  const [pull, setPull] = useState<PullContext | null>(null);
  const toastSeq = useRef(0);
  const today = todayLocal();

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);

  const reload = useCallback(async () => setState(await repo.loadState()), [repo]);

  const run = useCallback(
    async (fn: () => Promise<unknown>, okText?: string) => {
      try {
        await fn();
        await reload();
        if (okText) toast(okText);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        await reload();
        return false;
      }
    },
    [reload, toast],
  );

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing({ done: 0, total: 0 });
    try {
      const r = await refreshPrices(repo, { fetchImpl, today, onProgress: (done, total) => setRefreshing({ done, total }) });
      await reload();
      if (r.cards === 0 && r.failed.length === 0) toast('Precios al día: no hay cartas que actualizar');
      else if (r.failed.length === 0) toast(`Precios actualizados para ${r.cards} ${r.cards === 1 ? 'carta' : 'cartas'}`);
      else toast(`No se pudo actualizar ${r.failed.length} de ${r.cards + r.failed.length} cartas. Revisa tu conexión e inténtalo de nuevo.`, 'error');
      if (!r.fxSource) toast('Sin tipo de cambio EUR→USD: los precios de Cardmarket no se usan. Puedes fijar uno manual en Ajustes.', 'error');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setRefreshing(null);
    }
  }, [fetchImpl, refreshing, reload, repo, toast, today]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await repo.ensureDefaults();
      const s = await repo.loadState();
      if (cancelled) return;
      setState(s);
      void navigator.storage?.persist?.().catch(() => undefined);
      const stale = !s.settings.lastRefreshAt || Date.now() - Date.parse(s.settings.lastRefreshAt) > AUTO_REFRESH_AFTER_MS;
      if (stale && s.lots.length > 0 && navigator.onLine !== false) void refresh();
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engine = useMemo(() => (state ? Repo.engine(state) : null), [state]);

  const value: Store = { repo, state, engine, today, fetchImpl, reload, run, toast, toasts, refresh, refreshing, pull, setPull };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}
