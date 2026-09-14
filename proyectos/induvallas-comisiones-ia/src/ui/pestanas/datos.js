/**
 * Pestaña Datos: plantilla, importación con informe de errores, conciliación, demo, respaldo y borrado.
 * @module ui/pestanas/datos
 */
import { h, limpiar, tarjeta, tabla, badge, boton, campo, input, toast, confirmar, descargar, leerArchivo, selectorArchivo, vacio, poner } from '../dom.js';
import { usd, moneda, monedaSigno, pct, fecha, periodoCorto, entero } from '../format.js';
import { estado, on, puede, hayDatos, recalcular } from '../estado.js';
import { mutar, cambiarFechaReferencia } from '../acciones.js';
import { cargarXLSX } from '../../data/xlsx.js';
import { construirPlantilla, libroABytes, datasetAPlantilla } from '../../data/plantilla.js';
import { importarPlantilla } from '../../data/importar.js';
import { crearRespaldo, serializarRespaldo } from '../../data/respaldo.js';
import { generarDatosDemo, HOY_DEMO } from '../../seed/demo.js';
import { CONTROL } from '../../seed/defaults.js';
import { anonimizarDataset, serializarMapa } from '../../data/anonimizar.js';
import { modal } from '../dom.js';
import { ahoraISO } from '../format.js';

let refs = null;
let importacion = null;

function renderEstado() {
  limpiar(refs.estado);
  const ds = estado.dataset;
  if (!hayDatos()) {
    poner(refs.estado, vacio('Sin datos cargados. Descargue la plantilla, complétela e impórtela, o cargue los datos de demostración.'));
    return;
  }
  const items = [
    ['Vendedores', entero(ds.vendedores.length)],
    ['Agencias', entero(ds.agencias.length)],
    ['Clientes', entero(ds.clientes.length)],
    ['Facturas', entero(ds.facturas.length)],
    ['Cobros', entero(ds.cobros.length)],
    ['Notas de crédito', entero(ds.notasCredito.length)],
    ['Períodos aprobados', entero(Object.keys(ds.cierres || {}).length)],
    ['Esquemas · políticas', `${ds.esquemas.length} · ${ds.politicas.length}`],
  ];
  poner(refs.estado, h('div', { class: 'kpi-fila' }, items.map(([k, v]) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-etiqueta' }, k), h('div', { class: 'kpi-valor' }, v)))), h('p', { class: 'ayuda' }, `Origen: ${estado.origen?.origen || '—'}${estado.origen?.fecha ? ` (${fecha(estado.origen.fecha.slice(0, 10))})` : ''} · almacén ${estado.almacen?.tipo || '—'}${estado.almacen?.advertencia ? ` · ${estado.almacen.advertencia}` : ''}`));
}

function renderImportacion() {
  limpiar(refs.informe);
  if (!importacion) return;
  const r = importacion;
  const resumen = Object.entries(r.resumen).map(([hoja, s]) => ({ hoja, filas: s.filas, errores: s.errores, advertencias: s.advertencias }));
  poner(refs.informe, 
    h('p', null, r.valido ? badge('archivo válido', 'badge-ok') : badge(`${r.errores.length} error${r.errores.length === 1 ? '' : 'es'}`, 'badge-critico'), ' ', r.advertencias.length ? badge(`${r.advertencias.length} advertencia${r.advertencias.length === 1 ? '' : 's'}`, 'badge-advertencia') : null, ' ', h('span', { class: 'ayuda' }, `Archivo: ${r.nombreArchivo}`)),
    tabla({ compacta: true, ordenable: false, columnas: [{ clave: 'hoja', titulo: 'Hoja' }, { clave: 'filas', titulo: 'Filas', num: true }, { clave: 'errores', titulo: 'Errores', num: true }, { clave: 'advertencias', titulo: 'Advertencias', num: true }], filas: resumen }),
    r.errores.length || r.advertencias.length
      ? tabla({ compacta: true, columnas: [{ clave: 'tipo', titulo: 'Tipo', formato: (v) => badge(v, v === 'error' ? 'badge-critico' : 'badge-advertencia') }, { clave: 'hoja', titulo: 'Hoja' }, { clave: 'fila', titulo: 'Fila', num: true }, { clave: 'campo', titulo: 'Columna' }, { clave: 'codigo', titulo: 'Código' }, { clave: 'mensaje', titulo: 'Mensaje' }, { clave: 'valor', titulo: 'Valor', formato: (v) => (v == null ? '' : String(v)) }], filas: [...r.errores.map((e) => ({ ...e, tipo: 'error' })), ...r.advertencias.map((a) => ({ ...a, tipo: 'advertencia' }))].slice(0, 500), ordenInicial: { clave: 'hoja', desc: false } })
      : null,
    r.valido
      ? h('div', { class: 'acciones', style: { marginTop: '8px' } },
          boton('Reemplazar todos los datos', async () => {
            const ok = await confirmar('Reemplazar datos', 'Se eliminarán los datos actuales (incluidos períodos aprobados y ajustes) y se cargará el archivo. Exporte un respaldo antes si lo necesita.', { textoConfirmar: 'Reemplazar', peligro: true });
            if (!ok) return;
            await mutar(async (repo) => repo.reemplazarDataset({ ...datasetVacio(), ...r.entidades }, { origen: `importación de ${r.nombreArchivo}` }), 'Datos reemplazados');
            importacion = null;
            renderImportacion();
          }, { tipo: 'peligro', deshabilitado: !puede('datos') }),
          boton('Agregar a los datos actuales', async () => {
            const res = importarPlantilla(r.XLSX, r.bytes, { existente: estado.dataset, modo: 'agregar', cierres: estado.dataset.cierres });
            if (!res.valido) {
              importacion = { ...res, nombreArchivo: r.nombreArchivo, XLSX: r.XLSX, bytes: r.bytes };
              renderImportacion();
              return toast('Hay conflictos con los datos existentes; revise el informe', 'advertencia');
            }
            const nuevos = {};
            for (const k of ['vendedores', 'agencias', 'clientes', 'facturas', 'cobros', 'notasCredito']) {
              const existentes = new Set((estado.dataset[k] || []).map((x) => x.id || x.numero));
              nuevos[k] = res.entidades[k].filter((x) => !existentes.has(x.id || x.numero));
            }
            await mutar(async (repo) => repo.agregarEntidades(nuevos), 'Registros agregados');
            importacion = null;
            renderImportacion();
          }, { deshabilitado: !puede('datos') || !hayDatos() })
        )
      : h('p', { class: 'ayuda' }, 'Corrija los errores en el archivo y vuelva a importarlo. No se cargó nada.')
  );
}

function datasetVacio() {
  return { vendedores: [], agencias: [], clientes: [], facturas: [], cobros: [], notasCredito: [], ajustes: [], cierres: {}, liquidaciones: [], esquemas: estado.dataset?.esquemas?.length ? estado.dataset.esquemas : [], politicas: estado.dataset?.politicas?.length ? estado.dataset.politicas : [], control: estado.dataset?.control || { ...CONTROL } };
}

async function importar(archivo) {
  try {
    const XLSX = await cargarXLSX();
    const bytes = new Uint8Array(await leerArchivo(archivo));
    const r = importarPlantilla(XLSX, bytes, { cierres: estado.dataset?.cierres || {} });
    importacion = { ...r, nombreArchivo: archivo.name, XLSX, bytes };
    renderImportacion();
    toast(r.valido ? 'Archivo validado sin errores' : `Archivo con ${r.errores.length} errores`, r.valido ? 'ok' : 'advertencia');
    await estado.repo.registrar('Validación de importación', 'Datos', `${archivo.name}: ${r.errores.length} errores, ${r.advertencias.length} advertencias`);
  } catch (e) {
    toast(`No se pudo leer el archivo: ${e.message}`, 'error');
  }
}

async function descargarPlantilla() {
  const XLSX = await cargarXLSX();
  descargar('Plantilla_Datos_Induvallas.xlsx', libroABytes(XLSX, construirPlantilla(XLSX, { anio: Number(estado.hoy.slice(0, 4)) })), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

async function exportarDatosExcel() {
  const XLSX = await cargarXLSX();
  descargar(`Datos_Comisiones_${estado.hoy}.xlsx`, libroABytes(XLSX, datasetAPlantilla(XLSX, estado.dataset)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await estado.repo.registrar('Exportación de datos', 'Datos', 'Datos exportados en formato de plantilla');
}

async function cargarDemo() {
  if (hayDatos()) {
    const ok = await confirmar('Cargar demostración', 'Se reemplazarán los datos actuales por el dataset ficticio de demostración (enero a septiembre 2026, fecha de referencia 14-sep-2026).', { textoConfirmar: 'Cargar demo', peligro: true });
    if (!ok) return;
  }
  const { dataset, bitacora, meta } = generarDatosDemo();
  await mutar(async (repo) => {
    await repo.reemplazarDataset(dataset, { origen: 'datos de demostración (ficticios)', bitacoraAdicional: bitacora, meta: { semilla: meta.semilla } });
    await repo.guardarMeta('hoy', HOY_DEMO);
  }, 'Datos de demostración cargados');
  estado.hoy = HOY_DEMO;
  estado.origen = await estado.repo.leerMeta('origen');
  recalcular({ conservarPeriodo: false });
}

function exportarAnonimizado() {
  const clave = input('password', '', null, { placeholder: 'Frase secreta (mínimo 8 caracteres)', 'aria-label': 'Clave de anonimización', autocomplete: 'off' });
  const escala = input('number', '1', null, { step: '0.05', min: '0.05', max: '10', 'aria-label': 'Escala de montos' });
  modal({
    titulo: 'Exportar copia anonimizada',
    cuerpo: [
      h('p', null, 'Genera dos archivos: la plantilla Excel con datos seudonimizados (para compartir con kam) y el mapa de reidentificación en JSON (custodia exclusiva de INDUVALLAS, no se comparte). Se conservan fechas, montos, líneas, canales, porcentajes y cuotas; se eliminan nombres, códigos reales, cargos, motivos y autores. Los cierres aprobados no se exportan: se recalculan.'),
      campo('Clave de anonimización', clave, 'La misma clave produce los mismos seudónimos en exportaciones futuras. No se guarda en ningún archivo.'),
      campo('Escala de montos (1 = sin cambio)', escala, 'Opcional: multiplica facturas, cobros, notas de crédito, cuotas y tope para no revelar cifras reales. El cálculo es proporcional.'),
    ],
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: 'Generar y descargar',
        tipo: 'primario',
        onClick: async () => {
          try {
            const XLSX = await cargarXLSX();
            const { dataset, mapa, informe } = anonimizarDataset(estado.dataset, { clave: clave.value, escala: Number(escala.value) || 1 });
            const sello = estado.hoy;
            descargar(`Datos_Anonimizados_${sello}.xlsx`, libroABytes(XLSX, datasetAPlantilla(XLSX, dataset)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            setTimeout(() => descargar(`Mapa_Anonimizacion_${sello}_NO_COMPARTIR.json`, serializarMapa(mapa, { generado: ahoraISO() }), 'application/json'), 400);
            await estado.repo.registrar('Exportación de copia anonimizada', 'Datos', `${informe.conteos.facturas} facturas, ${informe.conteos.cobros} cobros · escala ${informe.escala} · mapa descargado aparte (sin clave)`);
            toast('Copia anonimizada y mapa generados', 'ok');
            return true;
          } catch (e) {
            toast(e.message, 'error');
            return false;
          }
        },
      },
    ],
  });
}

async function exportarRespaldo() {
  const respaldo = await estado.repo.exportarRespaldo({ usuario: estado.rol, fechaReferencia: estado.hoy });
  descargar(`Respaldo_ComisionesIA_${ahoraISO().replace(/[:T]/g, '-').slice(0, 16)}.json`, serializarRespaldo(respaldo), 'application/json');
  toast('Respaldo exportado', 'ok');
}

async function restaurar(archivo) {
  const ok = await confirmar('Restaurar respaldo', `Se reemplazarán los datos actuales por el contenido de ${archivo.name}.`, { textoConfirmar: 'Restaurar', peligro: true });
  if (!ok) return;
  try {
    const texto = await leerArchivo(archivo, 'texto');
    await mutar(async (repo) => repo.restaurarRespaldo(texto), 'Respaldo restaurado');
    const hoyMeta = await estado.repo.leerMeta('hoy');
    if (hoyMeta) {
      estado.hoy = hoyMeta;
      recalcular({ conservarPeriodo: false });
    }
    estado.origen = await estado.repo.leerMeta('origen');
    renderEstado();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function borrarTodo() {
  const ok = await confirmar('Borrar todos los datos', 'Esta acción elimina facturas, cobros, parámetros, cierres y bitácora del navegador. No se puede deshacer.', { textoConfirmar: 'Borrar', peligro: true, requerirTexto: 'BORRAR' });
  if (!ok) return;
  await mutar(async (repo) => repo.borrarTodo('BORRAR'), 'Datos eliminados');
  estado.dataset = await estado.repo.cargarDataset();
  estado.resultado = null;
  recalcular({ conservarPeriodo: false });
  renderEstado();
}

function renderConciliacion() {
  limpiar(refs.conciliacion);
  if (!estado.resultado) return poner(refs.conciliacion, vacio('Sin cálculo.'));
  const periodos = estado.resultado.meta.periodos;
  const valores = estado.conciliacion || {};
  const filas = periodos.map((p) => {
    const t = estado.resultado.periodos[p].totales;
    const contable = valores[p] != null ? Math.round(valores[p] * 100) : null;
    return { periodo: p, motor: t.valorNeto, contable, diferencia: contable == null ? null : t.valorNeto - contable, pctDif: contable ? (t.valorNeto - contable) / contable : null };
  });
  const guardar = async (p, v) => {
    const n = v === '' ? null : Number(String(v).replace(/\./g, '').replace(',', '.'));
    if (v !== '' && !Number.isFinite(n)) return;
    estado.conciliacion = { ...valores, [p]: n };
    await estado.repo.guardarMeta('conciliacion', estado.conciliacion);
    renderConciliacion();
  };
  poner(refs.conciliacion, 
    h('p', { class: 'ayuda' }, 'Ingrese la facturación neta mensual según contabilidad para compararla con la suma de facturas cargadas.'),
    tabla({
      compacta: true,
      ordenable: false,
      columnas: [
        { clave: 'periodo', titulo: 'Período', formato: (v) => periodoCorto(v) },
        { clave: 'motor', titulo: 'Facturación neta (datos)', num: true, formato: (v) => moneda(v) },
        { clave: 'contable', titulo: 'Contabilidad (USD)', num: true, formato: (v, f) => input('text', v == null ? '' : moneda(v), null, { style: 'width:130px;text-align:right', 'aria-label': `Contabilidad ${f.periodo}`, onChange: (e) => guardar(f.periodo, e.target.value), disabled: !puede('datos') }) },
        { clave: 'diferencia', titulo: 'Diferencia', num: true, formato: (v) => (v == null ? '—' : monedaSigno(v)) },
        { clave: 'pctDif', titulo: '%', num: true, formato: (v) => (v == null ? '—' : pct(v, 2)) },
      ],
      filas,
      claseFila: (f) => (f.diferencia != null && Math.abs(f.diferencia) > 100 ? 'fila-resaltada' : ''),
    })
  );
}

function actualizar() {
  if (!refs) return;
  renderEstado();
  renderImportacion();
  renderConciliacion();
}

function montar(cont) {
  refs = { estado: h('div'), informe: h('div'), conciliacion: h('div') };
  const abrirImportar = selectorArchivo('.xlsx,.xlsm,.xls', importar);
  const abrirRestaurar = selectorArchivo('.json', restaurar);
  const fechaRef = input('date', estado.hoy, null, { 'aria-label': 'Fecha de referencia', onChange: (e) => cambiarFechaReferencia(e.target.value), disabled: !puede('referencia') });
  poner(cont, 
    tarjeta('Estado de los datos', refs.estado, { acciones: [campo('Fecha de referencia del cálculo', fechaRef)] }),
    h('div', { class: 'rejilla rejilla-2' },
      tarjeta('Carga por plantilla Excel', [
        h('p', null, 'Descargue la plantilla, complete las seis hojas (Vendedores, Agencias, Clientes, Facturas, Cobros, NotasCredito) e impórtela. Cada fila se valida antes de cargar.'),
        h('div', { class: 'acciones' }, boton('Descargar plantilla', descargarPlantilla), boton('Importar archivo…', abrirImportar, { tipo: 'primario', deshabilitado: !puede('datos') }), boton('Exportar datos actuales a Excel', exportarDatosExcel, { deshabilitado: !hayDatos() })),
        refs.informe,
      ], { memorable: true }),
      tarjeta('Demostración, respaldo y borrado', [
        h('div', { class: 'acciones' },
          boton('Cargar datos de demostración', cargarDemo, { deshabilitado: !puede('datos') }),
          boton('Exportar respaldo JSON', exportarRespaldo, { deshabilitado: !hayDatos() }),
          boton('Exportar copia anonimizada…', exportarAnonimizado, { deshabilitado: !hayDatos() }),
          boton('Restaurar respaldo…', abrirRestaurar, { deshabilitado: !puede('datos') }),
          boton('Borrar todos los datos', borrarTodo, { tipo: 'peligro', deshabilitado: !puede('datos') || !hayDatos() })
        ),
        h('p', { class: 'ayuda', style: { marginTop: '8px' } }, 'Los datos viven solo en este navegador (IndexedDB). Exporte un respaldo al cerrar cada período y antes de cambiar de equipo. Los datos de compensación son datos personales (LOPDP): nada sale del navegador salvo por exportación explícita.'),
      ])
    ),
    tarjeta('Conciliación con contabilidad', refs.conciliacion)
  );
  actualizar();
}

on('resultado', () => refs && estado.pestana === 'datos' && actualizar());
on('referencia', () => refs && estado.pestana === 'datos' && actualizar());

export default { id: 'datos', titulo: 'Datos', montar, actualizar, desmontar() { refs = null; } };
