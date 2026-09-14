/**
 * Plantilla Excel `Plantilla_Datos_Induvallas.xlsx` (6 hojas de datos más Instrucciones) y volcado de un dataset
 * al mismo formato. Fechas como serial de Excel con formato dd-mmm-aaaa; montos con formato #,##0.00.
 * @module data/plantilla
 */
import { COLUMNAS, HOJAS } from './validacion.js';
import { isoASerial } from './xlsx.js';

const FORMATO_FECHA = 'dd-mmm-yyyy';
const FORMATO_MONTO = '#,##0.00';
const FORMATO_PCT = '0.00';

const ANCHOS = { id: 12, numero: 20, nombre: 32, iniciales: 10, zona: 12, cargo: 22, activo: 8, pct_agencia: 14, canal: 10, agencia_id: 12, vendedor_id: 12, fecha_alta: 13, fecha_emision: 13, cliente_id: 12, linea: 10, valor_sin_iva: 15, fecha_anulacion: 15, factura_numero: 20, fecha_cobro: 13, monto_sin_iva: 15, medio: 14, fecha: 13, valor: 14, motivo: 34 };

const INSTRUCCIONES = (anio) => [
  ['kam. Comisiones IA · INDUVALLAS · Plantilla de datos'],
  ['Complete las seis hojas y cargue el archivo desde la pestaña Datos. No cambie los encabezados ni el nombre de las hojas.'],
  [''],
  ['Hoja', 'Columna', 'Obligatoria', 'Formato y reglas'],
  ['Vendedores', 'id', 'Sí', 'Código único del vendedor (por ejemplo V01).'],
  ['Vendedores', 'nombre', 'Sí', 'Nombre completo.'],
  ['Vendedores', 'iniciales', 'No', 'Dos letras; si se omite se derivan del nombre.'],
  ['Vendedores', 'zona', 'No', 'Quito, Guayaquil o Cuenca.'],
  ['Vendedores', 'cargo', 'No', 'Texto libre.'],
  ['Vendedores', 'activo', 'No', 'SI o NO (vacío = SI).'],
  ['Vendedores', `cuota_${anio}-01 … cuota_${anio}-12`, 'Sí', 'Cuota mensual en USD (sin IVA). Puede añadir columnas cuota_AAAA-MM de otros años.'],
  ['Agencias', 'id, nombre', 'Sí', 'Código único y nombre de la agencia o central de medios.'],
  ['Agencias', 'pct_agencia', 'Sí', 'Comisión de agencia sobre el valor facturado, en porcentaje (15 = 15 %).'],
  ['Clientes', 'id, nombre', 'Sí', 'Código único y razón social.'],
  ['Clientes', 'canal', 'Sí', 'directo o agencia.'],
  ['Clientes', 'agencia_id', 'Si canal = agencia', 'Código de la hoja Agencias.'],
  ['Clientes', 'vendedor_id', 'Sí', 'Vendedor titular (hoja Vendedores). Recibe el bono por cliente nuevo.'],
  ['Clientes', 'fecha_alta', 'No', 'Fecha de activación del cliente; define el bono por cliente nuevo.'],
  ['Facturas', 'numero', 'Sí', 'Número único (001-001-000000001).'],
  ['Facturas', 'fecha_emision', 'Sí', 'Fecha (celda de fecha de Excel o texto aaaa-mm-dd o dd/mm/aaaa).'],
  ['Facturas', 'vendedor_id, cliente_id', 'Sí', 'Códigos de las hojas Vendedores y Clientes.'],
  ['Facturas', 'linea', 'Sí', 'vallas, led o retail.'],
  ['Facturas', 'canal', 'No', 'directo o agencia; si se omite se toma del cliente.'],
  ['Facturas', 'valor_sin_iva', 'Sí', 'Subtotal sin IVA en USD. El IVA no forma parte de la base comisionable.'],
  ['Facturas', 'pct_agencia', 'No', 'Porcentaje de agencia de esta factura si difiere del de la agencia.'],
  ['Facturas', 'fecha_anulacion', 'No', 'Si la factura se anuló, fecha de anulación.'],
  ['Cobros', 'id', 'No', 'Identificador único; si se omite se genera.'],
  ['Cobros', 'factura_numero', 'Sí', 'Número de la hoja Facturas. Una factura puede tener varios cobros.'],
  ['Cobros', 'fecha_cobro', 'Sí', 'Fecha en que se recibió el pago.'],
  ['Cobros', 'monto_sin_iva', 'Sí', 'Valor aplicado a la factura sin IVA (las retenciones cuentan como pago). No puede superar el valor de la factura.'],
  ['Cobros', 'medio', 'No', 'transferencia, cheque, tarjeta u otro.'],
  ['NotasCredito', 'numero', 'Sí', 'Número único de la nota de crédito.'],
  ['NotasCredito', 'factura_numero, fecha, valor', 'Sí', 'Factura afectada, fecha de la NC y valor sin IVA. Reduce la base comisionable.'],
  ['NotasCredito', 'motivo', 'No', 'Texto libre.'],
  [''],
  ['Validaciones al cargar', '', '', 'Duplicados, fechas inválidas, vendedor o cliente inexistente, cobro o NC mayor que la factura, porcentaje de agencia fuera de rango, fechas dentro de períodos aprobados.'],
  ['Confidencialidad', '', '', 'Los datos de compensación son datos personales (LOPDP). El archivo no sale del equipo de Finanzas salvo exportación explícita.'],
];

const EJEMPLOS = {
  Vendedores: [{ id: 'V01', nombre: 'Nombre Apellido (ejemplo)', iniciales: 'NA', zona: 'Quito', cargo: 'Ejecutivo comercial', activo: 'SI' }],
  Agencias: [{ id: 'AG01', nombre: 'Agencia Ejemplo', pct_agencia: 15 }],
  Clientes: [{ id: 'C01', nombre: 'Cliente Ejemplo Directo', canal: 'directo', agencia_id: '', vendedor_id: 'V01', fecha_alta: '2025-01-15' }, { id: 'C02', nombre: 'Cliente Ejemplo Agencia', canal: 'agencia', agencia_id: 'AG01', vendedor_id: 'V01', fecha_alta: '2025-03-01' }],
  Facturas: [{ numero: '001-001-000000001', fecha_emision: '2026-08-05', vendedor_id: 'V01', cliente_id: 'C02', linea: 'vallas', canal: 'agencia', valor_sin_iva: 12000, pct_agencia: '', fecha_anulacion: '' }],
  Cobros: [{ id: '', factura_numero: '001-001-000000001', fecha_cobro: '2026-09-02', monto_sin_iva: 12000, medio: 'transferencia' }],
  NotasCredito: [{ numero: 'NC-001-001-0000001', factura_numero: '001-001-000000001', fecha: '2026-09-10', valor: 500, motivo: 'Ejemplo de ajuste' }],
};

function encabezados(hoja, anio) {
  const cols = Object.values(COLUMNAS[hoja]);
  if (hoja === 'Vendedores') for (let m = 1; m <= 12; m++) cols.push(`cuota_${anio}-${String(m).padStart(2, '0')}`);
  return cols;
}

const esFecha = (col) => col.startsWith('fecha');
const esMonto = (col) => ['valor_sin_iva', 'monto_sin_iva', 'valor'].includes(col) || col.startsWith('cuota_');

/** Construye una hoja a partir de filas (objetos con claves = encabezados). Fechas ISO → serial Excel. */
function hojaDesdeFilas(XLSX, cols, filas) {
  const aoa = [cols];
  for (const f of filas) aoa.push(cols.map((c) => (f[c] === undefined ? '' : f[c])));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 1; r <= filas.length; r++) {
    cols.forEach((c, ci) => {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      const cell = ws[addr];
      if (!cell) return;
      if (esFecha(c) && typeof cell.v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell.v)) {
        cell.t = 'n';
        cell.v = isoASerial(cell.v);
        cell.z = FORMATO_FECHA;
      } else if (esMonto(c) && typeof cell.v === 'number') {
        cell.z = FORMATO_MONTO;
      } else if (c === 'pct_agencia' && typeof cell.v === 'number') {
        cell.z = FORMATO_PCT;
      }
    });
  }
  ws['!cols'] = cols.map((c) => ({ wch: ANCHOS[c] || 14 }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

/**
 * Libro de la plantilla. Con `ejemplos: true` incluye una o dos filas de ejemplo por hoja.
 * @returns {object} workbook de SheetJS
 */
export function construirPlantilla(XLSX, { anio = 2026, ejemplos = true } = {}) {
  const wb = XLSX.utils.book_new();
  const wsI = XLSX.utils.aoa_to_sheet(INSTRUCCIONES(anio));
  wsI['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 18 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');
  for (const h of HOJAS) {
    const cols = encabezados(h, anio);
    const filas = ejemplos ? EJEMPLOS[h].map((e) => (h === 'Vendedores' ? { ...e, [`cuota_${anio}-01`]: 50000 } : e)) : [];
    XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, cols, filas), h);
  }
  return wb;
}

/** Vuelca un dataset del motor al formato de la plantilla (respaldo legible en Excel). */
export function datasetAPlantilla(XLSX, dataset, { anio = 2026 } = {}) {
  const wb = XLSX.utils.book_new();
  const wsI = XLSX.utils.aoa_to_sheet(INSTRUCCIONES(anio));
  wsI['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 18 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');
  const periodosCuota = new Set();
  for (const v of dataset.vendedores || []) for (const c of v.cuotas || []) periodosCuota.add(c.periodo);
  const colsV = [...Object.values(COLUMNAS.Vendedores), ...[...periodosCuota].sort().map((p) => `cuota_${p}`)];
  const filasV = (dataset.vendedores || []).map((v) => {
    const f = { id: v.id, nombre: v.nombre, iniciales: v.iniciales, zona: v.zona, cargo: v.cargo, activo: v.activo === false ? 'NO' : 'SI' };
    for (const c of v.cuotas || []) f[`cuota_${c.periodo}`] = c.monto;
    return f;
  });
  XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, colsV, filasV), 'Vendedores');
  const filasA = (dataset.agencias || []).map((a) => ({ id: a.id, nombre: a.nombre, pct_agencia: a.pctAgencia == null ? '' : Math.round(a.pctAgencia * 10000) / 100 }));
  XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, Object.values(COLUMNAS.Agencias), filasA), 'Agencias');
  const filasC = (dataset.clientes || []).map((c) => ({ id: c.id, nombre: c.nombre, canal: c.canal, agencia_id: c.agenciaId || '', vendedor_id: c.vendedorId, fecha_alta: c.fechaAlta || '' }));
  XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, Object.values(COLUMNAS.Clientes), filasC), 'Clientes');
  const filasF = (dataset.facturas || []).map((f) => ({ numero: f.numero, fecha_emision: f.fechaEmision, vendedor_id: f.vendedorId, cliente_id: f.clienteId, linea: f.linea, canal: f.canal || '', valor_sin_iva: f.valorFacturado, pct_agencia: f.pctAgencia == null ? '' : Math.round(f.pctAgencia * 10000) / 100, fecha_anulacion: f.fechaAnulacion || '' }));
  XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, Object.values(COLUMNAS.Facturas), filasF), 'Facturas');
  const filasCb = (dataset.cobros || []).map((c) => ({ id: c.id, factura_numero: c.facturaNumero, fecha_cobro: c.fechaCobro, monto_sin_iva: c.monto, medio: c.medio || '' }));
  XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, Object.values(COLUMNAS.Cobros), filasCb), 'Cobros');
  const filasN = (dataset.notasCredito || []).map((n) => ({ numero: n.numero, factura_numero: n.facturaNumero, fecha: n.fecha, valor: n.valor, motivo: n.motivo || '' }));
  XLSX.utils.book_append_sheet(wb, hojaDesdeFilas(XLSX, Object.values(COLUMNAS.NotasCredito), filasN), 'NotasCredito');
  return wb;
}

/** Bytes del libro (Uint8Array) para descarga o prueba. */
export function libroABytes(XLSX, wb) {
  const salida = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return salida instanceof Uint8Array ? salida : new Uint8Array(salida);
}
