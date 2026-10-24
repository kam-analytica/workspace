import { useEffect, useState } from 'react';
import { AddCard } from './AddCard';
import { Collection } from './Collection';
import { Icon, Toasts } from './components';
import { Dashboard } from './Dashboard';
import { shortDate } from './format';
import { LotSheet } from './LotSheet';
import { Settings } from './Settings';
import { useStore } from './store';
import { Watchlist } from './Watchlist';

const VIEWS = [
  { id: 'panel', label: 'Panel', title: 'Tu colección' },
  { id: 'coleccion', label: 'Colección', title: 'Colección' },
  { id: 'agregar', label: 'Agregar', title: 'Agregar a tu carpeta' },
  { id: 'deseos', label: 'Deseos', title: 'Lista de deseos' },
  { id: 'ajustes', label: 'Ajustes', title: 'Ajustes' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

function readHash(): ViewId {
  const h = window.location.hash.replace('#', '');
  return (VIEWS.find((v) => v.id === h)?.id ?? 'panel') as ViewId;
}

export function App() {
  const { state, refresh, refreshing } = useStore();
  const [view, setView] = useState<ViewId>(readHash);
  const [openLot, setOpenLot] = useState<number | null>(null);

  useEffect(() => {
    const onHash = () => {
      setView(readHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#panel" aria-label="Carpeta TCG, ir al panel">
            Carpeta<span className="brand-dot">.</span> <span className="brand-tcg">TCG</span>
          </a>
          <nav className="tabs" aria-label="Secciones">
            {VIEWS.map((v) => (
              <a key={v.id} href={`#${v.id}`} className={`tab ${view === v.id ? 'on' : ''}`} aria-current={view === v.id ? 'page' : undefined}>
                <Icon name={v.id} size={20} />
                <span>{v.label}</span>
              </a>
            ))}
          </nav>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void refresh()}
            disabled={!!refreshing}
            title={state?.settings.lastRefreshAt ? `Precios del ${shortDate(state.settings.lastRefreshAt)}` : 'Sin actualizar'}
          >
            <span className={refreshing ? 'spin' : ''}><Icon name="refresh" size={18} /></span>
            <span className="refresh-label">
              {refreshing ? (refreshing.total ? `${refreshing.done}/${refreshing.total}` : 'Actualizando') : 'Actualizar precios'}
            </span>
          </button>
        </div>
      </header>

      <main className="main" id="contenido">
        <h1 className="view-title">{current.title}</h1>
        {!state ? (
          <p className="muted">Abriendo tu carpeta…</p>
        ) : view === 'panel' ? (
          <Dashboard onOpenLot={setOpenLot} />
        ) : view === 'coleccion' ? (
          <Collection onOpenLot={setOpenLot} />
        ) : view === 'agregar' ? (
          <AddCard />
        ) : view === 'deseos' ? (
          <Watchlist />
        ) : (
          <Settings />
        )}
      </main>

      {openLot != null && <LotSheet lotId={openLot} onClose={() => setOpenLot(null)} />}
      <Toasts />
    </div>
  );
}
