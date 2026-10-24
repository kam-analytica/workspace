import { useMemo, useState, type FormEvent } from 'react';
import { gradeKeyOf } from '../domain/engine';
import { CONDITIONS, DISPOSAL_CHANNELS, GRADERS, PRICE_SOURCES, parseVariantId, type Condition, type DisposalChannel, type Grader } from '../domain/types';
import { CardThumb, ConfirmButton, Delta, LevelBadge, Sheet } from './components';
import {
  ACQUISITION_LABEL,
  CONDITION_LABEL,
  DISPOSAL_LABEL,
  FINISH_LABEL,
  LANGUAGES,
  LEVEL_TEXT,
  SOURCE_LABEL,
  centsToInput,
  languageLabel,
  money,
  parseMoney,
  shortDate,
} from './format';
import { useStore } from './store';

export function LotSheet({ lotId, onClose }: { lotId: number; onClose: () => void }) {
  const { state, engine, today, repo, run, setPull } = useStore();
  const lot = state?.lots.find((l) => l.id === lotId);
  const position = useMemo(() => engine?.positions(today).find((p) => p.lot.id === lotId) ?? null, [engine, today, lotId]);
  if (!state || !engine || !lot) return null;

  const { itemId, finish } = parseVariantId(lot.variantId);
  const item = state.catalog.get(itemId);
  const name = item?.localNames.es ?? item?.name ?? itemId;
  const sealed = item?.kind === 'sealed';
  const disposals = state.disposals.filter((d) => d.lotId === lot.id).sort((a, b) => (a.disposedOn < b.disposedOn ? -1 : 1));
  const opening = disposals.find((d) => d.channel === 'opened');
  const children = state.lots.filter((l) => l.parentLotId === lot.id);
  const parent = lot.parentLotId != null ? state.lots.find((l) => l.id === lot.parentLotId) : null;
  const onHand = engine.qtyOnHand(lot);
  const bySource = PRICE_SOURCES.map((s) => ({
    s,
    p: engine.unitPrice({
      variantId: lot.variantId,
      condition: lot.grader ? 'NM' : lot.condition,
      language: lot.language,
      gradeKey: gradeKeyOf(lot),
      asOf: today,
      sourceCode: s.code,
    }),
  }));

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="lot-head">
        <CardThumb image={item?.image ?? null} alt={name} size="md" sealed={sealed} />
        <div className="stack-sm">
          <p className="muted">
            {[item?.setName, item?.number && `N.º ${item.number}`, FINISH_LABEL[finish], item?.rarity].filter(Boolean).join(' · ')}
          </p>
          <p className="tags">
            {!sealed && <span className="tag">{lot.grader ? `${lot.grader} ${lot.grade}` : CONDITION_LABEL[lot.condition]}</span>}
            {!sealed && <span className="tag">{languageLabel(lot.language)}</span>}
            <span className="tag">{ACQUISITION_LABEL[lot.channel]} · {shortDate(lot.acquiredOn)}</span>
          </p>
          {parent && <p className="small muted">Obtenida al abrir: {state.catalog.get(parseVariantId(parent.variantId).itemId)?.name}</p>}
        </div>
      </div>

      <dl className="facts">
        <div><dt>En mano</dt><dd className="num">{onHand} de {lot.quantity}</dd></div>
        <div><dt>Coste base</dt><dd className="num">{money(position?.costBasisCents ?? 0)}</dd></div>
        <div><dt>Valor unitario</dt><dd className="num">{money(position?.unitValueCents)}</dd></div>
        <div><dt>Valor de mercado</dt><dd className="num strong">{money(position?.marketValueCents)}</dd></div>
        <div><dt>Resultado no realizado</dt><dd><Delta cents={position?.unrealizedCents ?? null} /></dd></div>
        <div>
          <dt>Origen del valor</dt>
          <dd>
            {position?.priceSource ? `${SOURCE_LABEL[position.priceSource]}${position.priceDate ? ` · ${shortDate(position.priceDate)}` : ''}` : 'Sin precio vigente'}{' '}
            <LevelBadge level={position?.valuationLevel ?? null} />
          </dd>
        </div>
      </dl>
      {position?.valuationLevel && <p className="small muted">{LEVEL_TEXT[position.valuationLevel]}.</p>}

      {!sealed && (
        <section className="sub">
          <h3>Precio por mercado</h3>
          <ul className="plain">
            {bySource.map(({ s, p }) => (
              <li key={s.code} className="price-row">
                <span>
                  {s.name}
                  <span className="muted small"> · {s.currency === 'USD' ? 'en USD' : 'en EUR, convertido a USD'}</span>
                </span>
                <span className="price-val">
                  <span className="num strong">{p ? money(p.unitValueCents) : 'sin dato vigente'}</span>
                  {p && <span className="muted small">{shortDate(p.observedOn)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onHand > 0 && !opening && <DisposalForm lotId={lot.id!} max={onHand} sealed={sealed} />}

      {sealed && opening && (
        <section className="sub">
          <h3>Cartas obtenidas</h3>
          <p className="small muted">Abierto el {shortDate(opening.disposedOn)}. Agrega cada carta obtenida y luego asigna el coste del sellado según el valor de mercado de cada una.</p>
          <ul className="plain">
            {children.map((c) => {
              const ci = state.catalog.get(parseVariantId(c.variantId).itemId);
              return (
                <li key={c.id} className="row-between">
                  <span>{ci?.localNames.es ?? ci?.name} {c.quantity > 1 ? `×${c.quantity}` : ''}</span>
                  <span className="num">coste {money(c.acquisitionCostCents)}</span>
                </li>
              );
            })}
            {children.length === 0 && <li className="muted">Todavía no registras cartas de este sellado.</li>}
          </ul>
          <div className="actions">
            <a
              className="btn"
              href="#agregar"
              onClick={() => {
                setPull({ parentLotId: lot.id!, label: name });
                onClose();
              }}
            >
              Agregar cartas obtenidas
            </a>
            {children.length > 0 && <AllocateButton lotId={lot.id!} />}
          </div>
        </section>
      )}

      {!sealed && <ManualValueForm lotId={lot.id!} current={lot.manualUnitValueCents} />}
      <EditLotForm lotId={lot.id!} sealed={sealed} />

      {disposals.length > 0 && (
        <section className="sub">
          <h3>Movimientos</h3>
          <ul className="plain">
            {disposals.map((d) => (
              <li key={d.id} className="row-between">
                <span>
                  {DISPOSAL_LABEL[d.channel]} · {shortDate(d.disposedOn)} · {d.quantity} u.
                  {d.channel !== 'opened' && <span className="muted"> a {money(d.unitProceedsCents)} c/u{d.feesCents ? `, comisiones ${money(d.feesCents)}` : ''}</span>}
                </span>
                <ConfirmButton label="Anular" confirmLabel="Anular movimiento" className="btn btn-ghost btn-sm" onConfirm={() => run(() => repo.deleteDisposal(d.id!), 'Movimiento anulado')} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sub danger-zone">
        <ConfirmButton
          label="Eliminar este lote"
          confirmLabel="Sí, eliminar lote y sus movimientos"
          onConfirm={async () => {
            if (await run(() => repo.deleteLot(lot.id!), 'Lote eliminado')) onClose();
          }}
        />
      </section>
    </Sheet>
  );
}

function DisposalForm({ lotId, max, sealed }: { lotId: number; max: number; sealed: boolean }) {
  const { repo, run, today, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<DisposalChannel>(sealed ? 'opened' : 'sale');
  const [date, setDate] = useState(today);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [fees, setFees] = useState('');

  if (!open) {
    return (
      <div className="actions">
        {sealed && (
          <button type="button" className="btn btn-primary" onClick={() => { setChannel('opened'); setOpen(true); }}>
            Registrar apertura
          </button>
        )}
        <button type="button" className="btn" onClick={() => { setChannel('sale'); setOpen(true); }}>
          Registrar venta o salida
        </button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const unit = channel === 'opened' ? 0 : parseMoney(price) ?? 0;
    const fee = channel === 'opened' ? 0 : parseMoney(fees) ?? 0;
    if (Number.isNaN(unit) || Number.isNaN(fee)) return toast('Revisa los importes: usa números como 12,50', 'error');
    const ok = await run(
      () => repo.addDisposal({ lotId, disposedOn: date, quantity: Number(qty), channel, unitProceedsCents: unit, feesCents: fee, notes: null }),
      channel === 'opened' ? 'Apertura registrada' : 'Salida registrada',
    );
    if (ok) setOpen(false);
  };

  return (
    <form className="sub form" onSubmit={submit}>
      <h3>{channel === 'opened' ? 'Registrar apertura' : 'Registrar salida'}</h3>
      <div className="grid-2">
        {channel !== 'opened' && (
          <label>
            Tipo
            <select id="salida-tipo" value={channel} onChange={(e) => setChannel(e.target.value as DisposalChannel)}>
              {DISPOSAL_CHANNELS.filter((c) => c !== 'opened').map((c) => (
                <option key={c} value={c}>{DISPOSAL_LABEL[c]}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Fecha
          <input id="salida-fecha" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Cantidad (máx. {max})
          <input id="salida-cantidad" type="number" min={1} max={max} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        {channel !== 'opened' && (
          <>
            <label>
              Precio por unidad (USD)
              <input id="salida-precio" inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label>
              Comisiones y envío (USD)
              <input id="salida-comisiones" inputMode="decimal" placeholder="0,00" value={fees} onChange={(e) => setFees(e.target.value)} />
            </label>
          </>
        )}
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-primary">{channel === 'opened' ? 'Guardar apertura' : 'Guardar salida'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function AllocateButton({ lotId }: { lotId: number }) {
  const { repo, run, today } = useStore();
  const [useToday, setUseToday] = useState(false);
  return (
    <span className="allocate">
      <button type="button" className="btn btn-primary" onClick={() => run(() => repo.allocateOpenedCost(lotId, useToday ? today : undefined), 'Coste asignado a las cartas obtenidas')}>
        Asignar coste
      </button>
      <label className="check small">
        <input id={`alloc-hoy-${lotId}`} type="checkbox" checked={useToday} onChange={(e) => setUseToday(e.target.checked)} />
        Usar precios de hoy (si no hay precios del día de apertura)
      </label>
    </span>
  );
}

function ManualValueForm({ lotId, current }: { lotId: number; current: number | null }) {
  const { repo, run, toast } = useStore();
  const [value, setValue] = useState(centsToInput(current));
  return (
    <form
      className="sub form inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseMoney(value);
        if (Number.isNaN(cents)) return toast('Escribe un importe válido, por ejemplo 45,00', 'error');
        void run(() => repo.updateLot(lotId, { manualUnitValueCents: cents }), cents == null ? 'Valor manual eliminado' : 'Valor manual guardado');
      }}
    >
      <label>
        Valor manual por unidad (USD)
        <input id={`manual-${lotId}`} inputMode="decimal" placeholder="Vacío = usar mercado" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="submit" className="btn">Guardar valor</button>
    </form>
  );
}

function EditLotForm({ lotId, sealed }: { lotId: number; sealed: boolean }) {
  const { state, repo, run, toast } = useStore();
  const lot = state!.lots.find((l) => l.id === lotId)!;
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(lot.quantity));
  const [cost, setCost] = useState(centsToInput(lot.acquisitionCostCents));
  const [condition, setCondition] = useState<Condition>(lot.condition);
  const [language, setLanguage] = useState(lot.language);
  const [date, setDate] = useState(lot.acquiredOn);
  const [portfolioId, setPortfolioId] = useState(String(lot.portfolioId));
  const [grader, setGrader] = useState<string>(lot.grader ?? '');
  const [grade, setGrade] = useState(lot.grade != null ? String(lot.grade) : '');
  const [notes, setNotes] = useState(lot.notes ?? '');

  if (!open) {
    return (
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>Editar datos del lote</button>
      </div>
    );
  }
  return (
    <form
      className="sub form"
      onSubmit={async (e) => {
        e.preventDefault();
        const costCents = parseMoney(cost) ?? 0;
        if (Number.isNaN(costCents)) return toast('Escribe un coste válido, por ejemplo 12,50', 'error');
        const ok = await run(
          () =>
            repo.updateLot(lotId, {
              quantity: Number(qty),
              acquisitionCostCents: costCents,
              condition,
              language,
              acquiredOn: date,
              portfolioId: Number(portfolioId),
              grader: (grader || null) as Grader | null,
              grade: grader ? Number(grade.replace(',', '.')) : null,
              notes: notes.trim() || null,
            }),
          'Lote actualizado',
        );
        if (ok) setOpen(false);
      }}
    >
      <h3>Editar datos del lote</h3>
      <div className="grid-2">
        <label>Cantidad adquirida<input id="edit-cantidad" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
        <label>Coste total (USD)<input id="edit-coste" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        <label>Fecha de adquisición<input id="edit-fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>
          Portafolio
          <select id="edit-portafolio" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
            {state!.portfolios.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </label>
        {!sealed && (
          <>
            <label>
              Estado
              <select id="edit-estado" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
              </select>
            </label>
            <label>
              Idioma
              <select id="edit-idioma" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </label>
            <label>
              Graduadora
              <select id="edit-graduadora" value={grader} onChange={(e) => setGrader(e.target.value)}>
                <option value="">Sin graduar</option>
                {GRADERS.map((g) => <option key={g} value={g}>{g === 'OTHER' ? 'Otra' : g}</option>)}
              </select>
            </label>
            {grader && <label>Nota<input id="edit-nota" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} required /></label>}
          </>
        )}
      </div>
      <label>Notas<textarea id="edit-notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="actions">
        <button type="submit" className="btn btn-primary">Guardar cambios</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}
