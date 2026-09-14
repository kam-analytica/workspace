/**
 * Pruebas de la capa de datos (Fase 2): validación por fila, plantilla Excel ida y vuelta, importación,
 * exportaciones, respaldo JSON y repositorio sobre almacén en memoria.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarXLSX, serialAISO, isoASerial } from '../src/data/xlsx.js';
import { validarImportacion, normalizarFecha, normalizarNumero, normalizarPct, mapearFila } from '../src/data/validacion.js';
import { construirPlantilla, datasetAPlantilla, libroABytes } from '../src/data/plantilla.js';
import { importarPlantilla, leerLibro } from '../src/data/importar.js';
import { libroRol, filasRol, filasDetalle, aCSV } from '../src/data/exportar.js';
import { crearRespaldo, leerRespaldo, serializarRespaldo } from '../src/data/respaldo.js';
import { AlmacenMemoria } from '../src/data/db.js';
import { Repositorio } from '../src/data/repositorio.js';
import { computeTodo } from '../src/engine/index.js';
import { generarDatosDemo } from '../src/seed/demo.js';
import { datasetBase, factura, cobro, esquemaBase, politicaCobro } from './helpers/fixtures.mjs';

const XLSX = await cargarXLSX();

const hojasBase = () => ({
  Vendedores: [{ id: 'V1', nombre: 'Ana Pérez', iniciales: 'AP', zona: 'Quito', cargo: 'Ejecutiva', activo: 'SI', 'cuota_2026-08': 10000, 'cuota_2026-09': 12000 }],
  Agencias: [{ id: 'AG1', nombre: 'Agencia Uno', pct_agencia: 15 }],
  Clientes: [
    { id: 'C1', nombre: 'Cliente Directo', canal: 'directo', agencia_id: '', vendedor_id: 'V1', fecha_alta: '2025-01-01' },
    { id: 'C2', nombre: 'Cliente Agencia', canal: 'agencia', agencia_id: 'AG1', vendedor_id: 'V1', fecha_alta: '15/03/2026' },
  ],
  Facturas: [
    { numero: 'F1', fecha_emision: '2026-08-10', vendedor_id: 'V1', cliente_id: 'C2', linea: 'vallas', canal: '', valor_sin_iva: 10000, pct_agencia: '', fecha_anulacion: '' },
    { numero: 'F2', fecha_emision: isoASerial('2026-07-01'), vendedor_id: 'V1', cliente_id: 'C1', linea: 'led', canal: '', valor_sin_iva: '2.500,50', pct_agencia: '', fecha_anulacion: '' },
  ],
  Cobros: [{ id: '', factura_numero: 'F1', fecha_cobro: '2026-08-20', monto_sin_iva: 4000, medio: 'transferencia' }],
  NotasCredito: [{ numero: 'NC1', factura_numero: 'F2', fecha: '2026-08-30', valor: 100, motivo: 'ajuste' }],
});

test('D-01 normalización · fechas en serial, ISO, dd/mm/aaaa y Date; números es-EC; porcentajes', () => {
  assert.equal(normalizarFecha(isoASerial('2026-07-01')), '2026-07-01');
  assert.equal(isoASerial('1970-01-01'), 25569);
  assert.equal(serialAISO(isoASerial('2026-08-31')), '2026-08-31');
  assert.equal(normalizarFecha('2026-08-05'), '2026-08-05');
  assert.equal(normalizarFecha('5/8/2026'), '2026-08-05');
  assert.equal(normalizarFecha('31-08-2026'), '2026-08-31');
  assert.equal(normalizarFecha('2026-02-30').error !== undefined, true);
  assert.equal(normalizarFecha('ayer').error !== undefined, true);
  assert.equal(normalizarNumero('45.230,50'), 45230.5);
  assert.equal(normalizarNumero('1234,5'), 1234.5);
  assert.equal(normalizarNumero(12.34), 12.34);
  assert.equal(normalizarNumero('abc').error !== undefined, true);
  assert.equal(normalizarPct(15), 0.15);
  assert.equal(normalizarPct('15 %'), 0.15);
  assert.equal(normalizarPct(0.2), 0.2);
  assert.equal(normalizarPct(150).error !== undefined, true);
  assert.deepEqual(mapearFila('Facturas', { 'Número': 'F', 'Fecha de emisión': '2026-01-01', 'Valor facturado (USD)': 5 }), { numero: 'F', fechaEmision: '2026-01-01', valorFacturado: 5 });
});

test('D-02 validación · dataset correcto se normaliza (cuotas, pct decimal, cobro sin id)', () => {
  const r = validarImportacion(hojasBase());
  assert.deepEqual(r.errores, []);
  assert.equal(r.valido, true);
  const v = r.entidades.vendedores[0];
  assert.deepEqual(v.cuotas, [{ periodo: '2026-08', monto: 10000 }, { periodo: '2026-09', monto: 12000 }]);
  assert.equal(r.entidades.agencias[0].pctAgencia, 0.15);
  assert.equal(r.entidades.clientes[1].fechaAlta, '2026-03-15');
  assert.equal(r.entidades.facturas[0].canal, 'agencia');
  assert.equal(r.entidades.facturas[1].fechaEmision, '2026-07-01');
  assert.equal(r.entidades.facturas[1].valorFacturado, 2500.5);
  assert.match(r.entidades.cobros[0].id, /^CB-\d{6}$/);
  const res = computeTodo({ ...datasetBase(), ...r.entidades }, { hoy: '2026-09-14' });
  assert.equal(res.periodos['2026-08'].vendedores.V1.totales.valorNeto, 1000000);
});

test('D-03 validación · informe de errores por fila: duplicados, fechas, referencias, cobro mayor, % fuera de rango', () => {
  const h = hojasBase();
  h.Facturas.push({ numero: 'F1', fecha_emision: '2026-08-11', vendedor_id: 'V1', cliente_id: 'C1', linea: 'vallas', valor_sin_iva: 100 });
  h.Facturas.push({ numero: 'F3', fecha_emision: '31/02/2026', vendedor_id: 'V9', cliente_id: 'C9', linea: 'radio', valor_sin_iva: -5 });
  h.Cobros.push({ id: 'X', factura_numero: 'F1', fecha_cobro: '2026-08-25', monto_sin_iva: 7000 });
  h.Cobros.push({ id: 'Y', factura_numero: 'F1', fecha_cobro: '2026-08-01', monto_sin_iva: 1 });
  h.Agencias.push({ id: 'AG2', nombre: 'Mala', pct_agencia: 150 });
  h.NotasCredito.push({ numero: 'NC2', factura_numero: 'F1', fecha: '2026-09-01', valor: 20000 });
  const r = validarImportacion(h);
  const codigos = r.errores.map((e) => `${e.hoja}:${e.fila}:${e.codigo}`);
  assert.ok(codigos.includes('Facturas:4:E-DUP'), 'factura duplicada');
  assert.ok(codigos.includes('Facturas:5:E-FECHA'), 'fecha inválida');
  assert.ok(codigos.includes('Facturas:5:E-REF'), 'vendedor inexistente');
  assert.ok(codigos.includes('Facturas:5:E-VALOR'), 'línea inválida');
  assert.ok(codigos.includes('Facturas:5:E-RANGO'), 'valor negativo');
  assert.ok(codigos.includes('Cobros:3:E-RANGO'), 'cobro mayor que la factura');
  assert.ok(codigos.includes('Cobros:4:E-FECHA'), 'cobro anterior a la emisión');
  assert.ok(codigos.includes('Agencias:3:E-PCT'), 'porcentaje fuera de rango');
  assert.ok(codigos.includes('NotasCredito:3:E-RANGO'), 'NC mayor que la factura');
  assert.equal(r.valido, false);
  assert.equal(r.resumen.Facturas.errores >= 4, true);
});

test('D-04 validación · modo agregar sobre datos existentes detecta duplicados y períodos aprobados', () => {
  const existente = datasetBase();
  existente.facturas.push(factura('F1', '2026-07-10', 10000));
  existente.cierres = { '2026-07': { fecha: '2026-08-05', snapshot: { estadoFinal: { datos: { facturas: ['F1'], cobros: [], notasCredito: [] } } } } };
  const h = { Facturas: [{ numero: 'F1', fecha_emision: '2026-08-01', vendedor_id: 'V1', cliente_id: 'C1', linea: 'vallas', valor_sin_iva: 10 }, { numero: 'F7', fecha_emision: '2026-07-20', vendedor_id: 'V1', cliente_id: 'C1', linea: 'vallas', valor_sin_iva: 10 }], Cobros: [{ factura_numero: 'F1', fecha_cobro: '2026-07-30', monto_sin_iva: 500 }] };
  const r = validarImportacion(h, { existente, modo: 'agregar' });
  assert.ok(r.errores.some((e) => e.hoja === 'Facturas' && e.fila === 2 && e.codigo === 'E-DUP'));
  assert.ok(r.advertencias.some((a) => a.hoja === 'Facturas' && a.fila === 3 && a.codigo === 'A-BLOQ'));
  assert.ok(r.advertencias.some((a) => a.hoja === 'Cobros' && a.codigo === 'A-BLOQ'));
  assert.equal(r.entidades.facturas.length, 2, 'la existente más la nueva válida');
  assert.equal(r.entidades.vendedores.length, 1, 'conserva los vendedores existentes');
});

test('D-05 plantilla · se genera con 7 hojas, se reimporta sin errores (ida y vuelta) y las fechas son celdas de fecha', () => {
  const wb = construirPlantilla(XLSX, { anio: 2026, ejemplos: true });
  assert.deepEqual(wb.SheetNames, ['Instrucciones', 'Vendedores', 'Agencias', 'Clientes', 'Facturas', 'Cobros', 'NotasCredito']);
  const bytes = libroABytes(XLSX, wb);
  assert.ok(bytes.length > 5000);
  const { hojas } = leerLibro(XLSX, bytes);
  assert.equal(typeof hojas.Facturas[0].fecha_emision, 'number', 'fecha como serial de Excel');
  const celda = wb.Sheets.Facturas[XLSX.utils.encode_cell({ r: 1, c: 1 })];
  assert.equal(celda.z, 'dd-mmm-yyyy');
  const r = importarPlantilla(XLSX, bytes);
  assert.deepEqual(r.errores, []);
  assert.equal(r.entidades.facturas[0].fechaEmision, '2026-08-05');
  assert.equal(r.entidades.vendedores[0].cuotas[0].periodo, '2026-01');
  const vacia = construirPlantilla(XLSX, { ejemplos: false });
  const r2 = importarPlantilla(XLSX, libroABytes(XLSX, vacia));
  assert.equal(r2.entidades.facturas.length, 0);
  assert.equal(r2.valido, true);
});

test('D-06 plantilla · un dataset completo va a Excel y vuelve idéntico para el motor', () => {
  const { dataset } = generarDatosDemo();
  const bytes = libroABytes(XLSX, datasetAPlantilla(XLSX, dataset));
  const r = importarPlantilla(XLSX, bytes);
  assert.deepEqual(r.errores, []);
  const ds2 = { ...dataset, ...r.entidades };
  const a = computeTodo(dataset, { hoy: '2026-09-14' });
  const b = computeTodo(ds2, { hoy: '2026-09-14' });
  assert.deepEqual(b.periodos['2026-08'].totales, a.periodos['2026-08'].totales);
  assert.equal(r.entidades.facturas.length, dataset.facturas.length);
  assert.equal(r.entidades.cobros.length, dataset.cobros.length);
});

test('D-07 importación · hoja faltante obligatoria es error; hoja con nombre alterno se reconoce', () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ id: 'V1', nombre: 'Ana' }]), 'vendedores ');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ id: 'C1', nombre: 'Cli', canal: 'directo', vendedor_id: 'V1' }]), 'CLIENTES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ numero: 'F1', fecha_emision: '2026-08-10', vendedor_id: 'V1', cliente_id: 'C1', linea: 'vallas', valor_sin_iva: 10 }]), 'Facturas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ numero: 'N1', factura_numero: 'F1', fecha: '2026-08-12', valor: 1 }]), 'Notas de crédito');
  const r = importarPlantilla(XLSX, libroABytes(XLSX, wb));
  assert.deepEqual(r.faltantes, ['Agencias', 'Cobros']);
  assert.equal(r.valido, true, 'Agencias y Cobros son opcionales');
  assert.equal(r.entidades.notasCredito.length, 1);
  const wb2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet([{ id: 'V1', nombre: 'Ana' }]), 'Vendedores');
  const r2 = importarPlantilla(XLSX, libroABytes(XLSX, wb2));
  assert.ok(r2.errores.some((e) => e.codigo === 'E-HOJA' && e.hoja === 'Facturas'));
});

test('D-08 exportación · rol y detalle cuadran con el motor; CSV es-EC', () => {
  const { dataset } = generarDatosDemo();
  const res = computeTodo(dataset, { hoy: '2026-09-14' });
  const rol = filasRol(res.periodos['2026-08'], dataset);
  assert.equal(rol.length, 8);
  const totalLiquidable = rol.reduce((s, f) => s + f.comision_liquidable, 0);
  assert.equal(Math.round(totalLiquidable * 100), res.periodos['2026-08'].totales.liquidable);
  const det = filasDetalle(res.periodos['2026-08'], dataset);
  const porV = new Map();
  for (const d of det) if (d.periodo_emision === '2026-08') porV.set(d.vendedor, (porV.get(d.vendedor) || 0) + d.devengado);
  for (const f of rol) assert.equal(Math.round((porV.get(f.vendedor) || 0) * 100), Math.round(f.devengado * 100), `devengado ${f.vendedor}`);
  const wb = libroRol(XLSX, res, '2026-08', dataset);
  assert.deepEqual(wb.SheetNames, ['Rol', 'Detalle', 'Cartera', 'Alertas']);
  const bytes = libroABytes(XLSX, wb);
  const wb2 = XLSX.read(bytes, { type: 'array' });
  assert.equal(XLSX.utils.sheet_to_json(wb2.Sheets.Rol).length, 8);
  const csv = aCSV(rol.slice(0, 2));
  assert.ok(csv.startsWith('﻿periodo;vendedor_id;'));
  assert.match(csv.split('\r\n')[1], /;\d+,\d+;/, 'decimales con coma');
});

test('D-09 respaldo · ida y vuelta con versión y validación de tipo', () => {
  const { dataset, bitacora } = generarDatosDemo();
  const texto = serializarRespaldo(crearRespaldo({ dataset, bitacora, meta: { origen: 'demo' } }, '2026-09-14T10:00:00'));
  const r = leerRespaldo(texto);
  assert.equal(r.dataset.facturas.length, dataset.facturas.length);
  assert.equal(r.bitacora.length, bitacora.length);
  assert.deepEqual(computeTodo(r.dataset, { hoy: '2026-09-14' }).periodos['2026-08'].totales, computeTodo(dataset, { hoy: '2026-09-14' }).periodos['2026-08'].totales);
  assert.throws(() => leerRespaldo('{"tipo":"otro"}'), /no es un respaldo/);
  assert.throws(() => leerRespaldo('no json'), /JSON/);
  assert.throws(() => leerRespaldo(JSON.stringify({ tipo: 'kam.comisiones-ia.induvallas', version: 99, dataset: {} })), /más nueva/);
});

test('D-10 repositorio · carga demo, versiones append-only, ajustes con motivo, aprobación, reapertura y bitácora', async () => {
  let reloj = 0;
  const repo = new Repositorio(new AlmacenMemoria(), { ahora: () => `2026-09-14T10:${String(reloj++).padStart(2, '0')}:00`, usuario: () => 'Gerencia Financiera' });
  const { dataset, bitacora } = generarDatosDemo();
  assert.equal(await repo.hayDatos(), false);
  await repo.reemplazarDataset(dataset, { origen: 'demo', bitacoraAdicional: bitacora });
  assert.equal(await repo.hayDatos(), true);
  const d = await repo.cargarDataset();
  assert.equal(d.facturas.length, dataset.facturas.length);
  assert.equal(Object.keys(d.cierres).length, 7);
  assert.equal(d.liquidaciones.length, dataset.liquidaciones.length);
  assert.deepEqual(computeTodo(d, { hoy: '2026-09-14' }).periodos['2026-08'].totales, computeTodo(dataset, { hoy: '2026-09-14' }).periodos['2026-08'].totales);

  await assert.rejects(repo.guardarVersionEsquema({ ...esquemaBase(), id: 'ESQ-2026-01' }), /Ya existe/);
  const nuevo = await repo.guardarVersionEsquema({ ...esquemaBase(), id: 'ESQ-2026-10', version: '1.1', vigenteDesde: '2026-10-01', autor: undefined, fecha: undefined });
  assert.equal(nuevo.autor, 'Gerencia Financiera');
  await assert.rejects(repo.guardarVersionPolitica({ ...politicaCobro(), id: 'P-x', tramos: [{ hastaDias: 30, factor: 2 }] }), /inválida/);

  await assert.rejects(repo.guardarAjuste({ periodo: '2026-08', vendedorId: 'V01', monto: 50 }), /motivo/);
  await assert.rejects(repo.guardarAjuste({ periodo: '2026-07', vendedorId: 'V01', monto: 50, motivo: 'x' }), /aprobado/);
  const aj = await repo.guardarAjuste({ periodo: '2026-08', vendedorId: 'V01', monto: -25.5, motivo: 'Descuento acordado por reclamo de cliente' });
  const d2 = await repo.cargarDataset();
  assert.equal(d2.ajustes.length, 1);
  const res = computeTodo(d2, { hoy: '2026-09-14' });
  assert.equal(res.periodos['2026-08'].vendedores.V01.totales.ajustes, -2550);

  await repo.cambiarEstadoLiquidacion('2026-08', 'V01', 'validada');
  await repo.aprobarPeriodo('2026-08', res.periodos['2026-08']);
  await assert.rejects(repo.aprobarPeriodo('2026-08', res.periodos['2026-08']), /ya está aprobado/);
  const d3 = await repo.cargarDataset();
  assert.equal(d3.cierres['2026-08'].snapshot.periodo, '2026-08');
  assert.equal(d3.liquidaciones.find((l) => l.periodo === '2026-08' && l.vendedorId === 'V01').estado, 'aprobada');
  await repo.generarRol('2026-08');
  assert.equal((await repo.cargarDataset()).liquidaciones.find((l) => l.periodo === '2026-08' && l.vendedorId === 'V02').estado, 'en_rol');
  await assert.rejects(repo.reabrirPeriodo('2026-08', ''), /motivo/);
  await repo.reabrirPeriodo('2026-08', 'Cobro registrado con fecha de agosto después del cierre');
  assert.equal((await repo.cargarDataset()).cierres['2026-08'], undefined);
  await repo.eliminarAjuste(aj.id, 'Duplicado');

  const bit = await repo.leerBitacora({ entidad: 'Liquidacion' });
  assert.ok(bit.some((b) => b.accion === 'Reapertura de período' && b.detalle.includes('Cobro registrado')));
  assert.ok(bit.some((b) => b.accion === 'Ajuste manual'));
  assert.equal(bit[0].fechaHora >= bit[bit.length - 1].fechaHora, true, 'orden descendente');
  const filtrada = await repo.leerBitacora({ texto: 'reabierto' });
  assert.equal(filtrada.length, 1);

  const respaldo = await repo.exportarRespaldo({ usuario: 'Finanzas' });
  const repo2 = new Repositorio(new AlmacenMemoria());
  const info = await repo2.restaurarRespaldo(JSON.stringify(respaldo));
  assert.equal(info.facturas, dataset.facturas.length);
  assert.equal((await repo2.cargarDataset()).esquemas.length, 2);
  await assert.rejects(repo2.borrarTodo('no'), /Confirmación/);
  await repo2.borrarTodo('BORRAR');
  assert.equal(await repo2.hayDatos(), false);
});
