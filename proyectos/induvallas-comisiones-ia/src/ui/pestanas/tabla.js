/**
 * Pestaña Tabla de determinación: editor de la matriz R-01 con generador, criterio de tramo, versiones con vigencia,
 * vista previa del impacto, bonos y tope.
 * @module ui/pestanas/tabla
 */
import { h, limpiar, tarjeta, tabla, badge, boton, campo, input, select, toast, vacio, poner } from '../dom.js';
import { usd, moneda, monedaSigno, pct, pctCelda, fecha, periodoLargo } from '../format.js';
import { estado, on, puede, nombreVendedor, esquemaVigente } from '../estado.js';
import { mutar } from '../acciones.js';
import { generarCeldas, validarEsquema, LINEAS, CANALES } from '../../engine/parametros.js';
import { previsualizarEsquema } from '../simulador.js';
import { nombreLinea, nombreCanal } from '../format.js';

let refs = null;
let borrador = null;

function clonar(x) {
  return JSON.parse(JSON.stringify(x));
}

function siguienteVersion(lista) {
  const numeros = lista.map((e) => String(e.version).split('.').map(Number));
  const mayor = Math.max(0, ...numeros.map((n) => n[0] || 0));
  const menor = Math.max(-1, ...numeros.filter((n) => n[0] === mayor).map((n) => n[1] || 0));
  return `${mayor}.${menor + 1}`;
}

function nuevoBorrador() {
  const base = esquemaVigente() || estado.dataset.esquemas[estado.dataset.esquemas.length - 1];
  const b = clonar(base);
  b.version = siguienteVersion(estado.dataset.esquemas);
  b.id = `ESQ-${Date.now().toString(36)}`;
  b.vigenteDesde = estado.hoy.slice(0, 8) + '01';
  b.comentario = '';
  b.autor = estado.rol;
  b.fecha = estado.hoy;
  return b;
}

function numeroDesde(v) {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function renderVersiones() {
  limpiar(refs.versiones);
  const vigente = esquemaVigente();
  const lista = [...estado.dataset.esquemas].sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1));
  for (const e of lista) {
    poner(refs.versiones, h('div', { class: `version ${vigente?.id === e.id ? 'vigente' : ''}` },
      h('div', { class: 'version-cab' }, h('span', { class: 'v' }, `v${e.version}`), h('div', { class: 'acciones' }, vigente?.id === e.id ? badge(`vigente para ${periodoLargo(estado.periodo)}`, 'badge-t4') : null, boton('Usar como base', () => { borrador = { ...clonar(e), id: `ESQ-${Date.now().toString(36)}`, version: siguienteVersion(estado.dataset.esquemas), comentario: '', autor: estado.rol, fecha: estado.hoy, vigenteDesde: estado.hoy.slice(0, 8) + '01' }; renderEditor(); }, { mini: true, deshabilitado: !puede('parametros') }))),
      h('div', null, `Vigente desde ${fecha(e.vigenteDesde)} · ${e.criterioTramo === 'facturacion' ? 'facturación absoluta' : 'cumplimiento de cuota'} · tope ${e.tope?.activo ? usd(Math.round(e.tope.monto * 100)) : 'sin tope'}`),
      h('div', { class: 'ayuda' }, `${e.autor || '—'} · ${fecha((e.fecha || '').slice(0, 10))}${e.comentario ? ` · ${e.comentario}` : ''}`)
    ));
  }
}

function renderEditor() {
  limpiar(refs.editor);
  if (!borrador) borrador = nuevoBorrador();
  const b = borrador;
  const criterio = select([{ valor: 'cumplimiento', texto: 'Cumplimiento de cuota (base ÷ cuota)' }, { valor: 'facturacion', texto: 'Facturación absoluta del mes (USD)' }], b.criterioTramo, (v) => { b.criterioTramo = v; renderEditor(); });
  const esFact = b.criterioTramo === 'facturacion';
  const tramosOrd = [...b.tramos].sort((x, y) => x.desde - y.desde);

  const tablaTramos = h('table', { class: 'tabla tabla-compacta matriz' });
  tablaTramos.append(h('thead', null, h('tr', null, h('th', { class: 'izq' }, 'Tramo'), h('th', null, esFact ? 'Desde (USD)' : 'Desde (% cumpl.)'), h('th', null, 'Multiplicador'), h('th'))));
  const tb = h('tbody');
  for (const t of tramosOrd) {
    tb.append(h('tr', null,
      h('td', { class: 'izq' }, input('text', t.nombre, (v) => { t.nombre = v; }, { style: 'width:150px' })),
      h('td', null, input('number', esFact ? t.desde : Math.round(t.desde * 10000) / 100, (v) => { t.desde = esFact ? numeroDesde(v) : numeroDesde(v) / 100; }, { step: esFact ? '100' : '0.5', min: 0 })),
      h('td', null, input('number', t.multiplicador ?? 1, (v) => { t.multiplicador = numeroDesde(v); }, { step: '0.05', min: 0 })),
      h('td', null, boton('Quitar', () => { b.tramos = b.tramos.filter((x) => x !== t); delete b.celdas[t.id]; renderEditor(); }, { mini: true, tipo: 'peligro', deshabilitado: b.tramos.length <= 1 }))
    ));
  }
  tablaTramos.append(tb);
  const agregarTramo = boton('Agregar tramo', () => { const id = `t${Date.now().toString(36)}`; const ultimo = tramosOrd[tramosOrd.length - 1]; b.tramos.push({ id, nombre: 'Nuevo tramo', desde: esFact ? (ultimo?.desde || 0) + 10000 : (ultimo?.desde || 0) + 0.1, multiplicador: (ultimo?.multiplicador || 1) + 0.1 }); b.celdas[id] = generarCeldas(b.tasasBase, [b.tramos[b.tramos.length - 1]])[id]; renderEditor(); }, { mini: true });

  const tasas = h('table', { class: 'tabla tabla-compacta matriz' });
  tasas.append(h('thead', null, h('tr', null, h('th', { class: 'izq' }, 'Tasa base (tramo ×1)'), ...CANALES.map((c) => h('th', null, `${nombreCanal(c)} (%)`)))));
  const tbT = h('tbody');
  for (const l of LINEAS) {
    tbT.append(h('tr', null, h('td', { class: 'izq' }, nombreLinea(l)), ...CANALES.map((c) => h('td', null, input('number', Math.round((b.tasasBase?.[l]?.[c] ?? 0) * 1000000) / 10000, (v) => { b.tasasBase = b.tasasBase || {}; b.tasasBase[l] = b.tasasBase[l] || {}; b.tasasBase[l][c] = numeroDesde(v) / 100; }, { step: '0.05', min: 0, max: 100 })))));
  }
  tasas.append(tbT);
  const generar = boton('Generar celdas desde tasa base × multiplicador', () => { b.celdas = generarCeldas(b.tasasBase, b.tramos); renderEditor(); toast('Matriz regenerada; puede ajustar celda a celda', 'ok'); }, { tipo: 'primario' });

  const matriz = h('table', { class: 'tabla tabla-compacta matriz' });
  matriz.append(h('thead', null, h('tr', null, h('th', { class: 'izq' }, 'Tramo'), ...LINEAS.flatMap((l) => CANALES.map((c) => h('th', null, `${nombreLinea(l)} ${c}`))))));
  const tbM = h('tbody');
  for (const t of tramosOrd) {
    tbM.append(h('tr', null, h('td', { class: 'izq' }, badge(t.nombre, `badge-${t.id.startsWith('t') && t.id.length === 2 ? t.id : 'neutro'}`)), ...LINEAS.flatMap((l) => CANALES.map((c) => h('td', null, input('number', Math.round((b.celdas?.[t.id]?.[l]?.[c] ?? 0) * 1000000) / 10000, (v) => { b.celdas[t.id] = b.celdas[t.id] || {}; b.celdas[t.id][l] = b.celdas[t.id][l] || {}; b.celdas[t.id][l][c] = Math.round(numeroDesde(v) * 10000) / 1000000; }, { step: '0.005', min: 0, max: 100, 'aria-label': `${t.nombre} ${l} ${c}` }))))));
  }
  matriz.append(tbM);

  const bonos = h('div', { class: 'campos-fila' },
    campo('Bono mix activo', select([{ valor: '1', texto: 'Sí' }, { valor: '0', texto: 'No' }], b.bonos?.mix?.activo ? '1' : '0', (v) => { b.bonos.mix.activo = v === '1'; })),
    campo('Umbral Retail Media (%)', input('number', Math.round((b.bonos?.mix?.umbralRetail ?? 0.2) * 100), (v) => { b.bonos.mix.umbralRetail = numeroDesde(v) / 100; }, { step: '1', min: 0, max: 100 })),
    campo('Bono mix (% del devengado)', input('number', Math.round((b.bonos?.mix?.pct ?? 0.1) * 100), (v) => { b.bonos.mix.pct = numeroDesde(v) / 100; }, { step: '1', min: 0, max: 100 })),
    campo('Bono cliente nuevo activo', select([{ valor: '1', texto: 'Sí' }, { valor: '0', texto: 'No' }], b.bonos?.clienteNuevo?.activo ? '1' : '0', (v) => { b.bonos.clienteNuevo.activo = v === '1'; })),
    campo('USD por cliente nuevo', input('number', b.bonos?.clienteNuevo?.monto ?? 150, (v) => { b.bonos.clienteNuevo.monto = numeroDesde(v); }, { step: '10', min: 0 })),
    campo('Máximo de clientes', input('number', b.bonos?.clienteNuevo?.maximo ?? 5, (v) => { b.bonos.clienteNuevo.maximo = Math.round(numeroDesde(v)); }, { step: '1', min: 0 })),
    campo('Tope mensual activo', select([{ valor: '1', texto: 'Sí' }, { valor: '0', texto: 'No' }], b.tope?.activo ? '1' : '0', (v) => { b.tope.activo = v === '1'; })),
    campo('Tope (USD)', input('number', b.tope?.monto ?? 0, (v) => { b.tope.monto = numeroDesde(v); }, { step: '100', min: 0 }))
  );

  const vigencia = h('div', { class: 'campos-fila' },
    campo('Versión', input('text', b.version, (v) => { b.version = v; })),
    campo('Vigente desde', input('date', b.vigenteDesde, (v) => { b.vigenteDesde = v; })),
    campo('Comentario', input('text', b.comentario || '', (v) => { b.comentario = v; }, { placeholder: 'Qué cambia y por qué' })),
    boton('Vista previa del impacto', renderPrevia),
    boton('Guardar como nueva versión', async () => {
      const errores = validarEsquema(b);
      if (errores.length) return toast(errores[0], 'error');
      if (!b.comentario?.trim()) return toast('Indique un comentario que explique el cambio', 'advertencia');
      const r = await mutar(async (repo) => repo.guardarVersionEsquema({ ...b, autor: estado.rol, fecha: estado.hoy }), `Esquema v${b.version} guardado`);
      if (r) { borrador = null; actualizar(); }
    }, { tipo: 'primario', deshabilitado: !puede('parametros') })
  );

  poner(refs.editor, 
    h('div', { class: 'campos-fila' }, campo('Criterio del tramo', criterio)),
    h('div', { class: 'rejilla rejilla-2', style: { marginTop: '10px' } },
      h('div', null, h('h3', null, 'Tramos'), h('div', { class: 'tabla-envoltorio' }, tablaTramos), h('div', { style: { marginTop: '6px' } }, agregarTramo)),
      h('div', null, h('h3', null, 'Tasas base por línea y canal'), h('div', { class: 'tabla-envoltorio' }, tasas), h('div', { style: { marginTop: '6px' } }, generar))
    ),
    h('h3', { style: { marginTop: '12px' } }, 'Matriz de % de comisión (celda a celda)'),
    h('div', { class: 'tabla-envoltorio' }, matriz),
    h('h3', { style: { marginTop: '12px' } }, 'Bonos (R-02) y tope (R-05)'),
    bonos,
    h('h3', { style: { marginTop: '12px' } }, 'Vigencia y guardado'),
    vigencia
  );
}

function renderPrevia() {
  limpiar(refs.previa);
  if (!borrador) return;
  const errores = validarEsquema(borrador);
  if (errores.length) return poner(refs.previa, vacio(`Corrija el esquema antes de previsualizar: ${errores[0]}`));
  const r = previsualizarEsquema(estado.dataset, estado.periodo, estado.hoy, borrador);
  const filas = r.filas.map((f) => ({ ...f, vendedor: nombreVendedor(f.vendedorId), delta: f.devengadoEditado + f.bonosEditado - f.devengadoVigente - f.bonosVigente }));
  poner(refs.previa, 
    h('p', { class: 'ayuda' }, `Devengado y bonos de ${periodoLargo(estado.periodo)} con la versión editada frente a la vigente, recalculando sin cierres para aislar el efecto del esquema.`),
    tabla({
      compacta: true,
      columnas: [
        { clave: 'vendedor', titulo: 'Vendedor' },
        { clave: 'cumplimiento', titulo: 'Cumplimiento', num: true, formato: (v) => pct(v) },
        { clave: 'tramoVigente', titulo: 'Tramo vigente' },
        { clave: 'tramoEditado', titulo: 'Tramo editado' },
        { clave: 'devengadoVigente', titulo: 'Devengado vigente', num: true, formato: (v) => moneda(v) },
        { clave: 'devengadoEditado', titulo: 'Devengado editado', num: true, formato: (v) => moneda(v) },
        { clave: 'delta', titulo: 'Δ (con bonos)', num: true, formato: (v) => h('span', { class: v > 0 ? 'positivo' : v < 0 ? 'negativo' : '' }, monedaSigno(v)) },
      ],
      filas,
      totales: { vendedor: 'Total', devengadoVigente: r.totales.devengadoVigente, devengadoEditado: r.totales.devengadoEditado, delta: r.totales.devengadoEditado + r.totales.bonosEditado - r.totales.devengadoVigente - r.totales.bonosVigente },
      ordenInicial: { clave: 'delta', desc: true },
    })
  );
}

function renderVigente() {
  limpiar(refs.vigente);
  const e = esquemaVigente();
  if (!e) return poner(refs.vigente, vacio('Sin esquema vigente para el período.'));
  const tramosOrd = [...e.tramos].sort((x, y) => x.desde - y.desde);
  const t = h('table', { class: 'tabla tabla-compacta matriz' });
  t.append(h('thead', null, h('tr', null, h('th', { class: 'izq' }, 'Tramo'), h('th', null, e.criterioTramo === 'facturacion' ? 'Desde (USD)' : 'Desde'), h('th', null, '×'), ...LINEAS.flatMap((l) => CANALES.map((c) => h('th', null, `${nombreLinea(l)} ${c}`))))));
  const tb = h('tbody');
  for (const tr of tramosOrd) tb.append(h('tr', null, h('td', { class: 'izq' }, badge(tr.nombre, `badge-${tr.id}`)), h('td', null, e.criterioTramo === 'facturacion' ? usd(Math.round(tr.desde * 100)) : pct(tr.desde, 0)), h('td', null, tr.multiplicador ?? '—'), ...LINEAS.flatMap((l) => CANALES.map((c) => h('td', null, pctCelda(e.celdas?.[tr.id]?.[l]?.[c] ?? 0))))));
  t.append(tb);
  poner(refs.vigente, h('p', { class: 'ayuda' }, `v${e.version} · vigente desde ${fecha(e.vigenteDesde)} · bono mix ${e.bonos?.mix?.activo ? `${pct(e.bonos.mix.pct, 0)} si Retail Media ≥ ${pct(e.bonos.mix.umbralRetail, 0)}` : 'inactivo'} · bono cliente nuevo ${e.bonos?.clienteNuevo?.activo ? `${usd(Math.round(e.bonos.clienteNuevo.monto * 100))} × máx. ${e.bonos.clienteNuevo.maximo}` : 'inactivo'} · tope ${e.tope?.activo ? usd(Math.round(e.tope.monto * 100)) : 'sin tope'}`), h('div', { class: 'tabla-envoltorio' }, t));
}

function actualizar() {
  if (!refs) return;
  renderVigente();
  renderVersiones();
  renderEditor();
  limpiar(refs.previa);
}

function montar(cont) {
  refs = { vigente: h('div'), versiones: h('div', { class: 'versiones' }), editor: h('div'), previa: h('div') };
  poner(cont, 
    tarjeta(`Matriz vigente (R-01)`, refs.vigente, { memorable: true, subtitulo: 'Porcentaje de comisión sobre la base comisionable por tramo, línea y canal' }),
    h('div', { class: 'rejilla rejilla-31' },
      tarjeta('Editor de nueva versión', refs.editor, { subtitulo: 'Las versiones guardadas no se modifican; cada cambio crea una versión con fecha de vigencia' }),
      tarjeta('Versiones', refs.versiones)
    ),
    tarjeta('Vista previa del impacto', refs.previa, { subtitulo: 'Devengado del período con la versión editada frente a la vigente, por vendedor' })
  );
  actualizar();
}

on('resultado', () => refs && estado.pestana === 'tabla' && actualizar());
on('periodo', () => refs && estado.pestana === 'tabla' && actualizar());

export default { id: 'tabla', titulo: 'Tabla de determinación', montar, actualizar, desmontar() { refs = null; borrador = null; } };
