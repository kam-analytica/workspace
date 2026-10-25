import { useEffect, useRef, useState, type FormEvent } from 'react';
import { importCard } from '../data/refresh';
import { ACQUISITION_CHANNELS, CONDITIONS, GRADERS, variantIdOf, type AcquisitionChannel, type CatalogItem, type Condition, type Finish, type Grader } from '../domain/types';
import { searchCards, type SearchHit } from '../sources/tcgdex';
import { CardThumb, Icon } from './components';
import { ACQUISITION_LABEL, CONDITION_LABEL, FINISH_LABEL, LANGUAGES, money, parseMoney, shortDate } from './format';
import { useStore } from './store';

export function AddCard() {
  const { pull, setPull, state, repo, run } = useStore();
  const [mode, setMode] = useState<'card' | 'sealed'>('card');
  const parent = pull ? state?.lots.find((l) => l.id === pull.parentLotId) : null;
  const opening = parent ? state?.disposals.find((d) => d.lotId === parent.id && d.channel === 'opened') : null;

  return (
    <div className="stack">
      {pull && (
        <div className="pull-banner">
          <span>
            Agregando cartas obtenidas de <strong>{pull.label}</strong>
            {opening ? ` (abierto el ${shortDate(opening.disposedOn)})` : ''}. Su coste se asignará al pulsar «Asignar coste» en el sellado.
          </span>
          <span className="actions">
            {state?.lots.some((l) => l.parentLotId === pull.parentLotId) && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  if (await run(() => repo.allocateOpenedCost(pull.parentLotId), 'Coste del sellado asignado a las cartas obtenidas')) setPull(null);
                }}
              >
                Asignar coste y terminar
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={() => setPull(null)}>Terminar sin asignar</button>
          </span>
        </div>
      )}
      {!pull && (
        <div className="segmented" role="tablist" aria-label="Tipo de producto">
          <button type="button" role="tab" aria-selected={mode === 'card'} className={mode === 'card' ? 'on' : ''} onClick={() => setMode('card')}>Carta</button>
          <button type="button" role="tab" aria-selected={mode === 'sealed'} className={mode === 'sealed' ? 'on' : ''} onClick={() => setMode('sealed')}>Producto sellado</button>
        </div>
      )}
      {mode === 'card' || pull ? <CardSearch /> : <SealedForm />}
    </div>
  );
}

function CardSearch() {
  const { fetchImpl, repo, today, reload, toast } = useStore();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchCards(q, { fetchImpl });
        if (mine === seq.current) {
          setHits(res);
          setError(null);
        }
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, fetchImpl]);

  const choose = async (hit: SearchHit) => {
    setLoadingCard(true);
    try {
      await importCard(repo, hit.id, hit.names, { fetchImpl, today });
      await reload();
      setSelected(hit);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoadingCard(false);
    }
  };

  if (selected) return <LotForm itemId={selected.id} onDone={() => setSelected(null)} />;

  return (
    <section className="stack">
      <label className="search search-lg">
        <Icon name="search" size={20} />
        <input
          id="buscar-carta"
          type="search"
          autoComplete="off"
          placeholder="Nombre de la carta en español o inglés, o su código (p. ej. swsh7-215)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar carta"
        />
      </label>
      {loading && <p className="muted small">Buscando en TCGdex…</p>}
      {error && <p className="error-text">{error}</p>}
      {hits && hits.length === 0 && !loading && <p className="muted">No hay cartas con ese nombre. Prueba con el nombre en inglés o con el código impreso en la carta.</p>}
      {loadingCard && <p className="muted small">Cargando ficha y precios…</p>}
      {hits && hits.length > 0 && (
        <ul className="results">
          {hits.map((h) => {
            const name = h.names.es ?? h.names.en ?? h.id;
            return (
              <li key={h.id}>
                <button type="button" className="result" onClick={() => choose(h)} disabled={loadingCard}>
                  <CardThumb image={h.image} alt={name} size="md" />
                  <span className="result-name">{name}</span>
                  <span className="muted small">{h.id}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!hits && !loading && (
        <p className="muted small">Los datos de catálogo y precios provienen de TCGdex, con precios de TCGplayer (USD) y Cardmarket (EUR, convertidos con el tipo de referencia del BCE).</p>
      )}
    </section>
  );
}

function LotForm({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const { state, engine, today, repo, run, pull, toast } = useStore();
  const item = state?.catalog.get(itemId) as CatalogItem | undefined;
  const defaultPortfolio = state?.portfolios.find((p) => p.isDefault) ?? state?.portfolios[0];
  const parentLot = pull ? state?.lots.find((l) => l.id === pull.parentLotId) : null;
  const opening = parentLot ? state?.disposals.find((d) => d.lotId === parentLot.id && d.channel === 'opened') : null;

  const [finish, setFinish] = useState<Finish>(item?.finishes[0] ?? 'normal');
  const [qty, setQty] = useState('1');
  const [condition, setCondition] = useState<Condition>('NM');
  const [language, setLanguage] = useState(state?.settings.defaultLanguage ?? 'es');
  const [graded, setGraded] = useState(false);
  const [grader, setGrader] = useState<Grader>('PSA');
  const [grade, setGrade] = useState('10');
  const [cert, setCert] = useState('');
  const [date, setDate] = useState(opening?.disposedOn ?? today);
  const [channel, setChannel] = useState<AcquisitionChannel>(pull ? 'pack_pull' : 'purchase');
  const [cost, setCost] = useState('');
  const [portfolioId, setPortfolioId] = useState(String(parentLot?.portfolioId ?? defaultPortfolio?.id ?? ''));
  const [notes, setNotes] = useState('');
  const [threshold, setThreshold] = useState('');

  if (!state || !engine || !item) return null;
  const name = item.localNames.es ?? item.name;
  const priceOf = (f: Finish) =>
    engine.unitPrice({ variantId: variantIdOf(item.itemId, f), condition: 'NM', language: 'en', gradeKey: 'RAW', asOf: today });
  const current = engine.unitPrice({
    variantId: variantIdOf(item.itemId, finish),
    condition: graded ? 'NM' : condition,
    language,
    gradeKey: 'RAW',
    asOf: today,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const costCents = pull ? 0 : parseMoney(cost) ?? 0;
    if (Number.isNaN(costCents)) return toast('Escribe un coste válido, por ejemplo 12,50', 'error');
    const ok = await run(
      () =>
        repo.addLot({
          portfolioId: Number(portfolioId),
          variantId: variantIdOf(item.itemId, finish),
          quantity: Number(qty),
          condition: graded ? 'NM' : condition,
          language,
          grader: graded ? grader : null,
          grade: graded ? Number(grade.replace(',', '.')) : null,
          certNumber: graded ? cert.trim() || null : null,
          acquiredOn: date,
          channel,
          acquisitionCostCents: costCents,
          parentLotId: pull?.parentLotId ?? null,
          manualUnitValueCents: null,
          notes: notes.trim() || null,
        }),
      `${name} agregada a tu carpeta`,
    );
    if (ok) onDone();
  };

  const addToWishlist = () => {
    const cents = parseMoney(threshold);
    if (Number.isNaN(cents)) return toast('Escribe un umbral válido, por ejemplo 10,00', 'error');
    void run(
      () =>
        repo.addWatch({
          variantId: variantIdOf(item.itemId, finish),
          condition: 'NM',
          language,
          direction: cents == null ? null : 'below',
          thresholdCents: cents,
        }),
      cents == null ? 'Añadida a tu lista de deseos' : `Te avisaremos cuando baje de ${money(cents)}`,
    );
  };

  return (
    <form className="stack" onSubmit={submit}>
      <div className="card-detail">
        <CardThumb image={item.image} alt={name} size="lg" />
        <div className="stack-sm">
          <h2 className="detail-name">{name}</h2>
          {item.localNames.es && item.localNames.es !== item.name && <p className="muted">{item.name}</p>}
          <p className="muted">{[item.setName, item.number && `N.º ${item.number}`, item.rarity].filter(Boolean).join(' · ')}</p>
          <fieldset className="finishes">
            <legend>Acabado</legend>
            {item.finishes.map((f) => {
              const p = priceOf(f);
              return (
                <label key={f} className={`finish ${finish === f ? 'on' : ''}`}>
                  <input type="radio" name="acabado" value={f} checked={finish === f} onChange={() => setFinish(f)} />
                  <span>{FINISH_LABEL[f]}</span>
                  <span className="num muted small">{p ? money(p.unitValueCents) : 'sin precio'}</span>
                </label>
              );
            })}
          </fieldset>
          <p className="small">
            Valor de referencia con los datos elegidos:{' '}
            <strong className="num">{current ? money(current.unitValueCents) : 'sin precio vigente'}</strong>
            {current && <span className="muted"> · {current.sourceCode === 'tcgplayer' ? 'TCGplayer' : 'Cardmarket'}, nivel {current.valuationLevel}</span>}
          </p>
        </div>
      </div>

      <div className="grid-2">
        <label>Cantidad<input id="lote-cantidad" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} disabled={graded} required /></label>
        <label>
          Idioma de tus copias
          <select id="lote-idioma" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
        </label>
        {!graded && (
          <label>
            Estado
            <select id="lote-estado" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
            </select>
          </label>
        )}
        <label className="check">
          <input id="lote-graduada" type="checkbox" checked={graded} onChange={(e) => { setGraded(e.target.checked); if (e.target.checked) setQty('1'); }} />
          Carta graduada
        </label>
        {graded && (
          <>
            <label>
              Graduadora
              <select id="lote-graduadora" value={grader} onChange={(e) => setGrader(e.target.value as Grader)}>
                {GRADERS.map((g) => <option key={g} value={g}>{g === 'OTHER' ? 'Otra' : g}</option>)}
              </select>
            </label>
            <label>Nota (1 a 10)<input id="lote-nota" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} required /></label>
            <label>N.º de certificado<input id="lote-certificado" value={cert} onChange={(e) => setCert(e.target.value)} /></label>
          </>
        )}
        <label>Fecha de adquisición<input id="lote-fecha" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></label>
        {!pull && (
          <>
            <label>
              Cómo la obtuviste
              <select id="lote-canal" value={channel} onChange={(e) => setChannel(e.target.value as AcquisitionChannel)}>
                {ACQUISITION_CHANNELS.map((c) => <option key={c} value={c}>{ACQUISITION_LABEL[c]}</option>)}
              </select>
            </label>
            <label>
              Coste total pagado (USD)
              <input id="lote-coste" inputMode="decimal" placeholder="Precio + envío + comisiones" value={cost} onChange={(e) => setCost(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Portafolio
          <select id="lote-portafolio" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} disabled={!!pull}>
            {state.portfolios.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </label>
      </div>
      {graded && <p className="small muted">Las graduadas se valoran con precio de mercado para su nota cuando exista; si no, asigna un valor manual desde la ficha del lote (nivel 3).</p>}
      <label>Notas<textarea id="lote-notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dónde la compraste, firma, observaciones" /></label>

      <div className="actions">
        <button type="submit" className="btn btn-primary">Agregar a mi carpeta</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Volver a resultados</button>
      </div>

      {!pull && (
        <details className="sub">
          <summary>Añadir a mi lista de deseos</summary>
          <div className="inline-form">
            <label>
              Avisarme cuando baje de (USD, opcional)
              <input id="deseo-umbral" inputMode="decimal" placeholder="Sin alerta" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </label>
            <button type="button" className="btn" onClick={addToWishlist}>Añadir a deseos</button>
          </div>
        </details>
      )}
    </form>
  );
}

function SealedForm() {
  const { state, repo, run, today, toast } = useStore();
  const defaultPortfolio = state?.portfolios.find((p) => p.isDefault) ?? state?.portfolios[0];
  const [name, setName] = useState('');
  const [expansion, setExpansion] = useState('');
  const [qty, setQty] = useState('1');
  const [date, setDate] = useState(today);
  const [cost, setCost] = useState('');
  const [value, setValue] = useState('');
  const [portfolioId, setPortfolioId] = useState(String(defaultPortfolio?.id ?? ''));
  if (!state) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const costCents = parseMoney(cost) ?? 0;
    const valueCents = parseMoney(value);
    if (Number.isNaN(costCents) || Number.isNaN(valueCents)) {
      return toast('Revisa los importes: usa números como 89,99', 'error');
    }
    const ok = await run(async () => {
      const item = await repo.addSealedItem({ name, setName: expansion || null });
      await repo.addLot({
        portfolioId: Number(portfolioId),
        variantId: variantIdOf(item.itemId, 'sealed'),
        quantity: Number(qty),
        condition: 'NM',
        language: state.settings.defaultLanguage,
        grader: null,
        grade: null,
        certNumber: null,
        acquiredOn: date,
        channel: 'purchase',
        acquisitionCostCents: costCents,
        parentLotId: null,
        manualUnitValueCents: valueCents,
        notes: null,
      });
    }, `${name.trim()} agregado a tu carpeta`);
    if (ok) {
      setName('');
      setExpansion('');
      setCost('');
      setValue('');
      setQty('1');
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">TCGdex no publica precios de producto sellado: indica un valor estimado por unidad (nivel 3) si quieres que sume al valor de tu colección. Registra cada caja que vayas a abrir por separado.</p>
      <div className="grid-2">
        <label>Producto<input id="sellado-nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Caja de entrenador élite" required /></label>
        <label>Expansión<input id="sellado-set" value={expansion} onChange={(e) => setExpansion(e.target.value)} placeholder="p. ej. Evoluciones Prismáticas" /></label>
        <label>Cantidad<input id="sellado-cantidad" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
        <label>Fecha de compra<input id="sellado-fecha" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>Coste total pagado (USD)<input id="sellado-coste" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" /></label>
        <label>Valor estimado por unidad (USD)<input id="sellado-valor" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Opcional" /></label>
        <label>
          Portafolio
          <select id="sellado-portafolio" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
            {state.portfolios.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary">Agregar sellado</button>
      </div>
    </form>
  );
}
