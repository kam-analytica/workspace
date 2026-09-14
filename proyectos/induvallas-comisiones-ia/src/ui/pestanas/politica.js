/**
 * Pestaña Política de cobranza: editor de tramos con versiones y regla de transición, simulador de impacto
 * (anterior frente a actualizada) y cartera de comisiones pendientes.
 * @module ui/pestanas/politica
 */
import { h, limpiar, tarjeta, tabla, badge, boton, campo, input, select, toast, descargar, vacio, poner } from '../dom.js';
import { usd, moneda, monedaSigno, pct, fecha, periodoLargo, dias } from '../format.js';
import { estado, on, puede, nombreVendedor, nombreCliente, politicaVigente, vendedores } from '../estado.js';
import { mutar } from '../acciones.js';
import { validarPolitica } from '../../engine/parametros.js';
import { compararPoliticas } from '../simulador.js';
import { barras, PALETA } from '../componentes/graficos.js';
import { cargarXLSX } from '../../data/xlsx.js';
import { filasCartera, aCSV, hojaDesdeObjetos } from '../../data/exportar.js';
import { libroABytes } from '../../data/plantilla.js';

let refs = null;
let borrador = null;
let gSim = null;
let filtroVendedor = '';
let seleccionSim = { anteriorId: null, actualId: null };

const clonar = (x) => JSON.parse(JSON.stringify(x));

function siguienteVersion(lista) {
  const numeros = lista.map((e) => String(e.version).split('.').map(Number));
  const mayor = Math.max(0, ...numeros.map((n) => n[0] || 0));
  return `${mayor + 1}.0`;
}

function nuevoBorrador() {
  const base = politicaVigente() || estado.dataset.politicas[estado.dataset.politicas.length - 1];
  const b = clonar(base);
  b.id = `POL-${Date.now().toString(36)}`;
  b.version = siguienteVersion(estado.dataset.politicas);
  b.vigenteDesde = estado.hoy.slice(0, 8) + '01';
  b.comentario = '';
  b.autor = estado.rol;
  b.fecha = estado.hoy;
  if (!b.tramos?.length) b.tramos = [{ hastaDias: 30, factor: 1 }, { hastaDias: 60, factor: 1 }, { hastaDias: 90, factor: 0.8 }, { hastaDias: 120, factor: 0.5 }];
  if (!Number.isFinite(b.caducidadDias)) b.caducidadDias = b.tramos[b.tramos.length - 1].hastaDias;
  return b;
}

const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function renderVersiones() {
  limpiar(refs.versiones);
  const vig = politicaVigente();
  for (const p of [...estado.dataset.politicas].sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1))) {
    const tramos = p.modo === 'emision' ? '100 % con la emisión' : [...p.tramos].sort((a, b) => a.hastaDias - b.hastaDias).map((t) => `≤${t.hastaDias} d: ${pct(t.factor, 0)}`).join(' · ') + ` · >${p.caducidadDias ?? p.tramos[p.tramos.length - 1]?.hastaDias} d caduca`;
    poner(refs.versiones, h('div', { class: `version ${vig?.id === p.id ? 'vigente' : ''}` },
      h('div', { class: 'version-cab' }, h('span', { class: 'v' }, `v${p.version}`), h('div', { class: 'acciones' }, vig?.id === p.id ? badge('vigente', 'badge-t4') : null, boton('Usar como base', () => { borrador = { ...clonar(p), id: `POL-${Date.now().toString(36)}`, version: siguienteVersion(estado.dataset.politicas), comentario: '', autor: estado.rol, fecha: estado.hoy, vigenteDesde: estado.hoy.slice(0, 8) + '01' }; renderEditor(); }, { mini: true, deshabilitado: !puede('parametros') }))),
      h('div', null, `Vigente desde ${fecha(p.vigenteDesde)} · transición por ${p.reglaTransicion === 'cartera' ? 'cartera no cobrada' : 'fecha de emisión'}${p.pctAnticipo ? ` · anticipo ${pct(p.pctAnticipo, 0)}` : ''}`),
      h('div', { class: 'ayuda' }, tramos),
      h('div', { class: 'ayuda' }, `${p.autor || '—'} · ${fecha((p.fecha || '').slice(0, 10))}${p.comentario ? ` · ${p.comentario}` : ''}`)
    ));
  }
}

function renderEditor() {
  limpiar(refs.editor);
  if (!borrador) borrador = nuevoBorrador();
  const b = borrador;
  const modo = select([{ valor: 'cobro', texto: 'Liberación con el cobro (tramos por días)' }, { valor: 'emision', texto: '100 % pagadera con la emisión' }], b.modo, (v) => { b.modo = v; renderEditor(); });
  const regla = select([{ valor: 'emision', texto: 'Facturas emitidas desde la vigencia (default)' }, { valor: 'cartera', texto: 'Toda la cartera no cobrada a la vigencia' }], b.reglaTransicion, (v) => { b.reglaTransicion = v; });
  const t = h('table', { class: 'tabla tabla-compacta matriz' });
  t.append(h('thead', null, h('tr', null, h('th', null, 'Hasta días'), h('th', null, 'Factor (%)'), h('th'))));
  const tb = h('tbody');
  const tramos = [...(b.tramos || [])].sort((x, y) => x.hastaDias - y.hastaDias);
  for (const tr of tramos) {
    tb.append(h('tr', null, h('td', null, input('number', tr.hastaDias, (v) => { tr.hastaDias = Math.round(num(v)); }, { step: '1', min: 1 })), h('td', null, input('number', Math.round(tr.factor * 100), (v) => { tr.factor = num(v) / 100; }, { step: '5', min: 0, max: 100 })), h('td', null, boton('Quitar', () => { b.tramos = b.tramos.filter((x) => x !== tr); renderEditor(); }, { mini: true, tipo: 'peligro', deshabilitado: b.tramos.length <= 1 }))));
  }
  t.append(tb);
  poner(refs.editor, 
    h('div', { class: 'campos-fila' }, campo('Modo', modo), campo('Regla de transición', regla, 'La regla «cartera» aplica la política nueva a comisiones ya devengadas; valide el riesgo laboral (S-24)'), campo('Anticipo con la emisión (%)', input('number', Math.round((b.pctAnticipo || 0) * 100), (v) => { b.pctAnticipo = num(v) / 100; }, { step: '5', min: 0, max: 100 }))),
    b.modo === 'cobro' ? h('div', { style: { marginTop: '10px' } }, h('h3', null, 'Tramos de días emisión → cobro'), h('div', { class: 'tabla-envoltorio' }, t), h('div', { class: 'campos-fila', style: { marginTop: '6px' } }, boton('Agregar tramo', () => { const u = tramos[tramos.length - 1]; b.tramos.push({ hastaDias: (u?.hastaDias || 0) + 30, factor: Math.max(0, (u?.factor ?? 1) - 0.2) }); renderEditor(); }, { mini: true }), campo('Caduca después de (días)', input('number', b.caducidadDias ?? '', (v) => { b.caducidadDias = Math.round(num(v)); }, { step: '1', min: 1 }), 'Más allá de este plazo la comisión caduca y la factura pasa a «caducada»'))) : h('p', { class: 'ayuda' }, 'Con este modo la comisión se libera íntegra con la factura, sin condición de cobro ni caducidad.'),
    h('h3', { style: { marginTop: '12px' } }, 'Vigencia y guardado'),
    h('div', { class: 'campos-fila' },
      campo('Versión', input('text', b.version, (v) => { b.version = v; })),
      campo('Vigente desde', input('date', b.vigenteDesde, (v) => { b.vigenteDesde = v; })),
      campo('Comentario', input('text', b.comentario || '', (v) => { b.comentario = v; }, { placeholder: 'Qué cambia y por qué' })),
      boton('Simular esta versión', () => { seleccionSim.editada = true; renderSimulador(); }),
      boton('Guardar como nueva versión', async () => {
        const errores = validarPolitica(b);
        if (errores.length) return toast(errores[0], 'error');
        if (!b.comentario?.trim()) return toast('Indique un comentario que explique el cambio', 'advertencia');
        const r = await mutar(async (repo) => repo.guardarVersionPolitica({ ...b, autor: estado.rol, fecha: estado.hoy }), `Política v${b.version} guardada`);
        if (r) { borrador = null; seleccionSim = { anteriorId: null, actualId: null }; actualizar(); }
      }, { tipo: 'primario', deshabilitado: !puede('parametros') })
    )
  );
}

function renderSimulador() {
  limpiar(refs.simTabla);
  const lista = [...estado.dataset.politicas].sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? -1 : 1));
  if (lista.length < 2 && !seleccionSim.editada) return poner(refs.simTabla, vacio('Se necesitan dos versiones de política para comparar. Cree una versión nueva o simule el borrador.'));
  const opciones = lista.map((p) => ({ valor: p.id, texto: `v${p.version} (desde ${fecha(p.vigenteDesde)})` }));
  const r = compararPoliticas(estado.dataset, estado.periodo, estado.hoy, { anteriorId: seleccionSim.anteriorId, actualId: seleccionSim.editada ? null : seleccionSim.actualId, politicaEditada: seleccionSim.editada ? borrador : null });
  if (!r) return poner(refs.simTabla, vacio('No fue posible comparar.'));
  const selA = select(opciones, r.anterior.id, (v) => { seleccionSim.anteriorId = v; renderSimulador(); });
  const selB = select([...opciones, ...(borrador ? [{ valor: '__editada', texto: `borrador v${borrador.version} (sin guardar)` }] : [])], seleccionSim.editada ? '__editada' : r.actual.id, (v) => { seleccionSim.editada = v === '__editada'; seleccionSim.actualId = v === '__editada' ? null : v; renderSimulador(); });
  const filas = r.filas.map((f) => ({ ...f, vendedor: nombreVendedor(f.vendedorId), dLiberado: f.liberadoB - f.liberadoA, dLiquidable: f.liquidableB - f.liquidableA }));
  const vA = `v${r.anterior.version}`;
  const vB = seleccionSim.editada ? 'borrador' : `v${r.actual.version}`;
  poner(refs.simTabla, 
    h('div', { class: 'campos-fila', style: { marginBottom: '8px' } }, campo('Política anterior', selA), campo('Política actualizada', selB)),
    h('p', { class: 'ayuda' }, `Cada versión se aplica a toda la historia sin cierres, sobre ${periodoLargo(estado.periodo)}: mismas facturas y cobros, distinta regla de liberación.`),
    tabla({
      compacta: true,
      columnas: [
        { clave: 'vendedor', titulo: 'Vendedor' },
        { clave: 'liberadoA', titulo: `Liberado ${vA}`, num: true, formato: (v) => moneda(v) },
        { clave: 'liberadoB', titulo: `Liberado ${vB}`, num: true, formato: (v) => moneda(v) },
        { clave: 'dLiberado', titulo: 'Δ liberado', num: true, formato: (v) => h('span', { class: v > 0 ? 'positivo' : v < 0 ? 'negativo' : '' }, monedaSigno(v)) },
        { clave: 'retenidoA', titulo: `Retenido ${vA}`, num: true, formato: (v) => moneda(v) },
        { clave: 'retenidoB', titulo: `Retenido ${vB}`, num: true, formato: (v) => moneda(v) },
        { clave: 'caducadoA', titulo: `Caducado ${vA}`, num: true, formato: (v) => moneda(v) },
        { clave: 'caducadoB', titulo: `Caducado ${vB}`, num: true, formato: (v) => moneda(v) },
        { clave: 'liquidableB', titulo: `Liquidable ${vB}`, num: true, formato: (v) => moneda(v) },
        { clave: 'dLiquidable', titulo: 'Δ liquidable', num: true, formato: (v) => monedaSigno(v) },
      ],
      filas,
      totales: { vendedor: 'Total', liberadoA: r.totales.liberadoA, liberadoB: r.totales.liberadoB, dLiberado: r.totales.liberadoB - r.totales.liberadoA, retenidoA: r.totales.retenidoA, retenidoB: r.totales.retenidoB, caducadoA: r.totales.caducadoA, caducadoB: r.totales.caducadoB, liquidableB: r.totales.liquidableB, dLiquidable: r.totales.liquidableB - r.totales.liquidableA },
      ordenInicial: { clave: 'dLiberado', desc: false },
    })
  );
  const etiquetas = filas.map((f) => f.vendedor.split(' ')[0]);
  const series = [{ nombre: `Liberado ${vA}`, datos: filas.map((f) => f.liberadoA), color: PALETA.azul }, { nombre: `Liberado ${vB}`, datos: filas.map((f) => f.liberadoB), color: PALETA.mag }];
  if (!gSim) {
    gSim = barras({ etiquetas, series, alto: 230 });
    poner(refs.simGrafico, gSim.el);
  } else gSim.actualizar(etiquetas, series);
}

function renderCartera() {
  limpiar(refs.cartera);
  const control = estado.resultado.meta.control;
  let lista = estado.resultado.cartera;
  if (filtroVendedor) lista = lista.filter((c) => c.vendedorId === filtroVendedor);
  const filas = lista.map((c) => ({ ...c, vendedor: nombreVendedor(c.vendedorId), cliente: nombreCliente(c.clienteId), tramoTexto: c.factorHoy === 0 ? 'caduca' : c.tramoHoy ? `≤${c.tramoHoy.hastaDias} d · ${pct(c.tramoHoy.factor, 0)}` : '—' }));
  const total = filas.reduce((s, f) => s + f.retenido, 0);
  const sel = select([{ valor: '', texto: 'Todos los vendedores' }, ...vendedores().map((v) => ({ valor: v.id, texto: v.nombre }))], filtroVendedor, (v) => { filtroVendedor = v; renderCartera(); }, { 'aria-label': 'Vendedor' });
  poner(refs.cartera, 
    h('div', { class: 'acciones', style: { marginBottom: '8px' } }, sel, h('span', { class: 'ayuda' }, `${filas.length} facturas con comisión retenida · ${usd(total)} · antigüedad al ${fecha(estado.resultado.meta.hoy)}`),
      boton('CSV', () => descargar(`Cartera_comisiones_${estado.resultado.meta.hoy}.csv`, aCSV(filasCartera(lista, estado.dataset)), 'text/csv;charset=utf-8'), { mini: true }),
      boton('Excel', async () => { const XLSX = await cargarXLSX(); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, hojaDesdeObjetos(XLSX, filasCartera(lista, estado.dataset)), 'Cartera'); descargar(`Cartera_comisiones_${estado.resultado.meta.hoy}.xlsx`, libroABytes(XLSX, wb), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }, { mini: true })
    ),
    tabla({
      compacta: true,
      columnas: [
        { clave: 'numero', titulo: 'Factura', formato: (v) => h('span', { class: 'mono' }, v) },
        { clave: 'vendedor', titulo: 'Vendedor' },
        { clave: 'cliente', titulo: 'Cliente' },
        { clave: 'fechaEmision', titulo: 'Emisión', formato: (v) => fecha(v) },
        { clave: 'dias', titulo: 'Días', num: true },
        { clave: 'valorNeto', titulo: 'Valor neto', num: true, formato: (v) => moneda(v) },
        { clave: 'pendiente', titulo: 'Pendiente de cobro', num: true, formato: (v) => moneda(v) },
        { clave: 'retenido', titulo: 'Comisión retenida', num: true, formato: (v) => moneda(v) },
        { clave: 'tramoTexto', titulo: 'Tramo hoy', ordenar: (f) => f.factorHoy },
        { clave: 'fechaLimite', titulo: 'Caduca el', formato: (v) => fecha(v) },
        { clave: 'diasParaCaducar', titulo: 'Días restantes', num: true, formato: (v) => (v == null ? '—' : v <= 0 ? badge('caduca', 'badge-critico') : v <= 15 ? badge(String(v), 'badge-critico') : v <= 30 ? badge(String(v), 'badge-advertencia') : String(v)) },
      ],
      filas,
      totales: { numero: `Total (${filas.length})`, pendiente: filas.reduce((s, f) => s + f.pendiente, 0), retenido: total },
      ordenInicial: { clave: 'dias', desc: true },
      claseFila: (f) => (f.diasParaCaducar != null && f.diasParaCaducar <= 15 ? 'fila-critica' : f.dias > control.diasSinCobro ? 'fila-resaltada' : ''),
    })
  );
}

function actualizar() {
  if (!refs) return;
  renderVersiones();
  renderEditor();
  renderSimulador();
  renderCartera();
}

function montar(cont) {
  refs = { versiones: h('div', { class: 'versiones' }), editor: h('div'), simTabla: h('div'), simGrafico: h('div'), cartera: h('div') };
  gSim = null;
  poner(cont, 
    h('div', { class: 'rejilla rejilla-31' },
      tarjeta('Editor de política de cobranza (R-04)', refs.editor, { subtitulo: 'Tramos de días, caducidad, transición y anticipo; cada cambio crea una versión con vigencia' }),
      tarjeta('Versiones', refs.versiones)
    ),
    tarjeta('Simulador de impacto: política anterior frente a actualizada', [refs.simGrafico, refs.simTabla], { memorable: true, subtitulo: 'Liberado, retenido y caducado por vendedor en el período seleccionado' }),
    tarjeta('Cartera de comisiones pendientes', refs.cartera, { subtitulo: 'Facturas con comisión retenida, antigüedad, tramo actual y fecha de caducidad; ordenable y exportable' })
  );
  actualizar();
}

on('resultado', () => refs && estado.pestana === 'politica' && actualizar());
on('periodo', () => refs && estado.pestana === 'politica' && actualizar());

export default { id: 'politica', titulo: 'Política de cobranza', montar, actualizar, desmontar() { refs = null; borrador = null; gSim = null; } };
