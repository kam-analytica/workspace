import { useRef, useState } from 'react';
import { exportBackup, importBackup, positionsCsv } from '../data/backup';
import type { IngestRun } from '../data/db';
import { CONDITIONS, type Condition } from '../domain/types';
import { ConfirmButton } from './components';
import { LANGUAGES, LEVEL_TEXT, shortDate } from './format';
import { useStore } from './store';

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Settings() {
  const { state, engine, repo, run, refresh, refreshing, today, toast, reload } = useStore();
  const [newPortfolio, setNewPortfolio] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  if (!state || !engine) return null;
  const s = state.settings;

  return (
    <div className="stack">
      <section className="panel">
        <h2 className="panel-title">Precios</h2>
        <p className="small muted">
          Última actualización: {s.lastRefreshAt ? shortDate(s.lastRefreshAt) : 'nunca'}. La app actualiza sola al abrirse si pasó más de un día.
        </p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => void refresh()} disabled={!!refreshing}>
            {refreshing ? 'Actualizando…' : 'Actualizar precios ahora'}
          </button>
        </div>
        <RecentRuns />
      </section>

      <section className="panel">
        <h2 className="panel-title">Portafolios</h2>
        <ul className="plain">
          {state.portfolios.map((p) => (
            <PortfolioRow key={p.id} id={p.id!} name={p.name} isDefault={p.isDefault} />
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => repo.addPortfolio(newPortfolio), `Portafolio «${newPortfolio.trim()}» creado`)) setNewPortfolio('');
          }}
        >
          <label>
            Nuevo portafolio
            <input id="nuevo-portafolio" value={newPortfolio} onChange={(e) => setNewPortfolio(e.target.value)} placeholder="p. ej. Para vender" />
          </label>
          <button type="submit" className="btn">Crear</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">Valoración</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const factors = Object.fromEntries(CONDITIONS.map((c) => [c, Number(String(f.get(`factor-${c}`)).replace(',', '.'))])) as Record<Condition, number>;
            const eur = String(f.get('eurusd') ?? '').trim();
            await run(
              () =>
                repo.saveSettings({
                  maxAgeDays: Number(f.get('vigencia')),
                  defaultLanguage: String(f.get('idioma')),
                  conditionFactors: factors,
                  manualEurUsd: eur ? Number(eur.replace(',', '.')) : null,
                }),
              'Ajustes guardados',
            );
          }}
        >
          <div className="grid-2">
            <label>
              Vigencia máxima de un precio (días)
              <input id="vigencia" name="vigencia" type="number" min={1} max={365} defaultValue={s.maxAgeDays} required />
            </label>
            <label>
              Idioma por defecto de tus cartas
              <select id="idioma" name="idioma" defaultValue={s.defaultLanguage}>
                {LANGUAGES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </label>
            <label>
              Tipo de cambio EUR→USD manual
              <input id="eurusd" name="eurusd" inputMode="decimal" placeholder="Solo si el del BCE no está disponible" defaultValue={s.manualEurUsd ?? ''} />
            </label>
          </div>
          <fieldset className="factors">
            <legend>Factor por estado</legend>
            <p className="small muted">
              Se aplica cuando la fuente publica un solo precio para la carta (sin desglose por estado). Vienen en 1,00 (sin ajuste) porque no hay un dato que los sustente; ajústalos con tu propio criterio de mercado.
            </p>
            <div className="factor-grid">
              {CONDITIONS.map((c) => (
                <label key={c}>
                  {c}
                  <input id={`factor-${c}`} name={`factor-${c}`} inputMode="decimal" defaultValue={String(s.conditionFactors[c]).replace('.', ',')} required />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="actions">
            <button type="submit" className="btn btn-primary">Guardar ajustes</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">Tus datos</h2>
        <p className="small muted">
          Tu colección se guarda solo en este dispositivo y navegador. Descarga un respaldo con frecuencia; con él puedes restaurarla aquí o en otro equipo.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const csv = positionsCsv(engine.positions(today), state.catalog, state.portfolios);
              download(`carpeta-tcg-coleccion-${today}.csv`, csv, 'text/csv;charset=utf-8');
              toast('Colección exportada en CSV (separador «;» y coma decimal, para Excel en español)');
            }}
          >
            Exportar colección (CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const b = await exportBackup(repo.db);
              download(`carpeta-tcg-respaldo-${today}.json`, JSON.stringify(b), 'application/json');
              toast('Respaldo descargado');
            }}
          >
            Descargar respaldo
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            Restaurar respaldo…
          </button>
          <input
            ref={fileRef}
            id="restaurar-archivo"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {pendingFile && (
          <div className="warn-box">
            <p>Restaurar «{pendingFile.name}» reemplazará todos los datos de este dispositivo.</p>
            <ConfirmButton
              label="Restaurar y reemplazar"
              confirmLabel="Sí, reemplazar mis datos"
              onConfirm={async () => {
                const ok = await run(async () => importBackup(repo.db, JSON.parse(await pendingFile.text())), 'Respaldo restaurado');
                setPendingFile(null);
                if (fileRef.current) fileRef.current.value = '';
                if (ok) await reload();
              }}
            />
          </div>
        )}
      </section>

      <section className="panel about">
        <h2 className="panel-title">Cómo se valora tu colección</h2>
        <ul className="plain small">
          <li><strong>Precio:</strong> se elige, en este orden, el estado exacto, TCGplayer antes que Cardmarket, el precio de mercado antes que otros y el dato más reciente dentro de la vigencia.</li>
          <li><strong>Coste:</strong> cada lote conserva su coste. Al abrir un sellado, su coste se reparte entre las cartas obtenidas según su valor de mercado.</li>
          {([1, 2, 3] as const).map((l) => (
            <li key={l}><strong>Nivel {l}:</strong> {LEVEL_TEXT[l]}.</li>
          ))}
          <li><strong>Fuentes:</strong> catálogo y precios de TCGdex (TCGplayer en USD y Cardmarket en EUR); tipo de cambio de referencia del Banco Central Europeo vía Frankfurter.</li>
        </ul>
        <p className="small muted">Carpeta TCG · kam. Analytica. Pokémon y sus nombres son marcas de sus respectivos titulares; esta app no está afiliada a ellos.</p>
      </section>
    </div>
  );
}

function PortfolioRow({ id, name, isDefault }: { id: number; name: string; isDefault: boolean }) {
  const { repo, run } = useStore();
  const [value, setValue] = useState(name);
  return (
    <li className="row-between">
      <form
        className="inline-form grow"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => repo.renamePortfolio(id, value), 'Portafolio renombrado');
        }}
      >
        <input id={`portafolio-${id}`} value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Nombre del portafolio ${name}`} />
        {value.trim() !== name && <button type="submit" className="btn btn-sm">Renombrar</button>}
        {isDefault && <span className="tag">Principal</span>}
      </form>
      {!isDefault && (
        <ConfirmButton label="Eliminar" confirmLabel="Eliminar portafolio" className="btn btn-ghost btn-sm" onConfirm={() => run(() => repo.deletePortfolio(id), 'Portafolio eliminado')} />
      )}
    </li>
  );
}

function RecentRuns() {
  const { repo } = useStore();
  const [runs, setRuns] = useState<IngestRun[] | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <details
      className="sub"
      open={open}
      onToggle={async (e) => {
        const isOpen = (e.target as HTMLDetailsElement).open;
        setOpen(isOpen);
        if (isOpen) setRuns((await repo.db.ingestRuns.orderBy('startedAt').reverse().limit(8).toArray()));
      }}
    >
      <summary>Historial de actualizaciones</summary>
      {runs && runs.length === 0 && <p className="small muted">Aún no hay actualizaciones registradas.</p>}
      <ul className="plain small">
        {runs?.map((r) => (
          <li key={r.id} className="row-between">
            <span>{new Date(r.startedAt).toLocaleString('es-EC')}</span>
            <span>
              {r.status === 'ok' ? 'Completa' : r.status === 'partial' ? 'Parcial' : r.status === 'failed' ? 'Fallida' : 'En curso'} · {r.cards} cartas · {r.observations} precios
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
