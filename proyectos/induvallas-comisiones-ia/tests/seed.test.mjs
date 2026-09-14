/**
 * Narrativa del dataset de demostración (Fase 2): los casos de control del cierre de agosto 2026 deben aparecer
 * y las proporciones globales deben respetar <demo_data>. Datos ficticios.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarDatosDemo, rolHistoricoDemo, HOY_DEMO } from '../src/seed/demo.js';
import { contrastar } from '../src/data/contraste.js';
import { esquemaDemo, politicasDemo } from '../src/seed/defaults.js';
import { computeTodo, validarEsquema, validarPolitica } from '../src/engine/index.js';
import { diasEntre } from '../src/engine/dates.js';

const { dataset, bitacora, meta } = generarDatosDemo();
const res = computeTodo(dataset, { hoy: HOY_DEMO });
const ago = res.periodos['2026-08'];
const L = (v) => ago.vendedores[v];
const al = (codigo, v, periodo = '2026-08') => res.alertas.filter((a) => a.codigo === codigo && a.periodo === periodo && (!v || a.vendedorId === v));

test('S-01 seed · determinista, etiquetado como ficticio y válido para el motor', () => {
  const otra = generarDatosDemo();
  assert.equal(JSON.stringify(otra.dataset), JSON.stringify(dataset));
  assert.equal(meta.etiqueta, 'Datos ficticios · modo demostración');
  assert.deepEqual(validarEsquema(esquemaDemo()), []);
  for (const p of politicasDemo()) assert.deepEqual(validarPolitica(p), []);
  assert.equal(dataset.vendedores.length, 8);
  assert.equal(dataset.agencias.length, 12);
  assert.ok(dataset.clientes.length >= 30 && dataset.clientes.length <= 35);
  assert.equal(Object.keys(dataset.cierres).length, 7, 'enero a julio aprobados');
  assert.ok(bitacora.length >= 11);
});

test('S-02 seed · matriz de 0,50 % a 2,00 % (S-26) y tope de demostración USD 1.500 (S-27)', () => {
  const e = esquemaDemo();
  const celdas = [];
  for (const t of Object.values(e.celdas)) for (const l of Object.values(t)) for (const v of Object.values(l)) celdas.push(v);
  const conComision = celdas.filter((x) => x > 0);
  assert.equal(Math.min(...conComision), 0.005);
  assert.equal(Math.max(...celdas), 0.02);
  assert.equal(e.tope.monto, 1500);
  assert.equal(politicasDemo()[1].vigenteDesde, '2026-01-01');
});

test('S-03 seed · volúmenes: 50-60 facturas por mes, ≈45 % por agencia, ≈15 % parciales, ≈2 % NC, rezago mediano ≈45 días', () => {
  const porMes = {};
  for (const f of dataset.facturas) porMes[f.fechaEmision.slice(0, 7)] = (porMes[f.fechaEmision.slice(0, 7)] || 0) + 1;
  for (const p of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']) assert.ok(porMes[p] >= 48 && porMes[p] <= 62, `${p}: ${porMes[p]} facturas`);
  const total = dataset.facturas.reduce((s, f) => s + f.valorFacturado, 0);
  const agencia = dataset.facturas.filter((f) => f.canal === 'agencia').reduce((s, f) => s + f.valorFacturado, 0) / total;
  assert.ok(agencia >= 0.38 && agencia <= 0.52, `agencia ${agencia}`);
  const porFactura = new Map();
  for (const c of dataset.cobros) porFactura.set(c.facturaNumero, (porFactura.get(c.facturaNumero) || 0) + 1);
  const parciales = [...porFactura.values()].filter((n) => n > 1).length / porFactura.size;
  assert.ok(parciales >= 0.1 && parciales <= 0.2, `parciales ${parciales}`);
  const nc = dataset.notasCredito.length / dataset.facturas.length;
  assert.ok(nc >= 0.012 && nc <= 0.035, `nc ${nc}`);
  const fpn = new Map(dataset.facturas.map((f) => [f.numero, f]));
  const lags = dataset.cobros.map((c) => diasEntre(fpn.get(c.facturaNumero).fechaEmision, c.fechaCobro)).sort((a, b) => a - b);
  const mediana = lags[Math.floor(lags.length / 2)];
  assert.ok(mediana >= 35 && mediana <= 55, `mediana ${mediana}`);
  assert.ok(lags[Math.floor(lags.length * 0.9)] >= 75, 'cola larga');
});

test('S-04 narrativa · Carolina supera el tope con ≈240 % y Retail Media ≥ 60 %', () => {
  const l = L('V07');
  assert.ok(Math.abs(l.tramo.cumplimiento - 2.4) < 0.01, `cumplimiento ${l.tramo.cumplimiento}`);
  assert.equal(l.tramo.tramoId, 't4');
  const retail = l.totales.baseRetail / l.totales.base;
  assert.ok(retail >= 0.6 && retail <= 0.8, `retail ${retail}`);
  assert.ok(l.totales.excedente > 0);
  assert.equal(l.totales.liquidable, 150000);
  assert.equal(al('A-05', 'V07').length, 1);
  const L3 = l.lineas.find((x) => x.codigo === 'L3');
  assert.equal(L3.detalle.mix.aplica, true);
  assert.equal(L3.detalle.clienteNuevo.reconocidos, 2);
});

test('S-05 narrativa · Diego bajo el umbral (≈64 %) con NC posterior a un período aprobado ⇒ saldo negativo', () => {
  const l = L('V04');
  assert.ok(Math.abs(l.tramo.cumplimiento - 0.64) < 0.01);
  assert.equal(l.tramo.tramoId, 't0');
  assert.equal(l.totales.devengado, 0);
  assert.ok(l.totales.clawback > 0);
  assert.ok(l.totales.netoAntesTope < 0, `neto ${l.totales.netoAntesTope}`);
  assert.equal(l.totales.liquidable, 0);
  assert.ok(l.totales.saldoSiguiente > 0);
  assert.equal(al('A-01', 'V04').length, 1);
  assert.equal(al('A-06', 'V04').length, 1);
  assert.equal(al('A-11', 'V04').length, 1);
  assert.equal(res.periodos['2026-09'].vendedores.V04.totales.saldoAnterior, l.totales.saldoSiguiente, 'el saldo se descuenta en septiembre');
});

test('S-06 narrativa · Sebastián: retención alta, caducidades en agosto y facturas próximas a caducar al 14-sep', () => {
  const l = L('V08');
  assert.ok(l.totales.caducadoPeriodo > 0);
  assert.equal(al('A-04', 'V08').length, 1);
  assert.ok(al('A-03', 'V08').length >= 2, 'varias facturas retenidas con más de 90 días');
  const cartera = res.cartera.filter((c) => c.vendedorId === 'V08');
  const proximas = cartera.filter((c) => c.diasParaCaducar > 0 && c.diasParaCaducar <= 20);
  assert.ok(proximas.length >= 3, `próximas a caducar: ${proximas.length}`);
  const retencionRelativa = (v) => L(v).totales.retenido / Math.max(1, L(v).totales.devengado);
  assert.ok(retencionRelativa('V08') > retencionRelativa('V01') && retencionRelativa('V08') > retencionRelativa('V03'));
});

test('S-07 narrativa · Juan Pablo a 0,5 puntos del Acelerador', () => {
  const l = L('V06');
  assert.ok(Math.abs(l.tramo.cumplimiento - 0.995) < 1e-9, `cumplimiento ${l.tramo.cumplimiento}`);
  assert.equal(l.tramo.tramoId, 't2');
  assert.equal(l.tramo.siguienteId, 't3');
  assert.equal(l.tramo.faltaBase, 25000, 'USD 250 de base para el Acelerador');
  assert.equal(al('A-07', 'V06').length, 1);
});

test('S-08 narrativa · María con clawback por NC de USD 2.200 sobre factura cobrada en julio (aprobado)', () => {
  const nc = dataset.notasCredito.find((n) => n.valor === 2200);
  assert.ok(nc && nc.fecha.startsWith('2026-08'));
  const f = dataset.facturas.find((x) => x.numero === nc.facturaNumero);
  assert.equal(f.vendedorId, 'V01');
  assert.ok(f.fechaEmision.startsWith('2026-07'));
  const l = L('V01');
  const fila = l.facturas.find((r) => r.numero === nc.facturaNumero);
  assert.ok(fila.clawback > 0);
  assert.equal(fila.clawback, Math.round(220000 * (1 - f.pctAgencia) * fila.pct));
  assert.equal(al('A-06', 'V01').length, 1);
});

test('S-09 cierres · los snapshots reproducen el cálculo y julio no cambia por las NC de agosto', () => {
  for (const p of Object.keys(dataset.cierres)) {
    assert.equal(res.periodos[p].bloqueado, true);
    assert.deepEqual(res.periodos[p].totales, dataset.cierres[p].snapshot.totales);
  }
  const sinCierres = computeTodo({ ...dataset, cierres: {} }, { hoy: HOY_DEMO });
  assert.notDeepEqual(sinCierres.periodos['2026-07'].vendedores.V01.totales.base, res.periodos['2026-07'].vendedores.V01.totales.base, 'sin bloqueo, la NC de agosto reduciría la base de julio');
  assert.equal(res.periodos['2026-09'].enCurso, true);
  assert.equal(res.periodos['2026-08'].enCurso, false);
  assert.ok(res.periodos['2026-09'].totales.liberadoCartera > 0, 'septiembre libera cartera de agosto y julio');
});

test('S-10 ejercicio · el rol histórico ficticio de la demo produce 60 coincidencias y 4 diferencias explicadas', () => {
  const { filas, desviaciones } = rolHistoricoDemo(res);
  assert.equal(filas.length, 8 * 8, 'enero a agosto × 8 vendedores; septiembre en curso queda fuera');
  assert.equal(desviaciones.length, 4);
  const c = contrastar(res, filas, { tolerancia: 1 });
  assert.equal(c.totales.ok, 60);
  assert.equal(c.totales.revisar, 4);
  assert.equal(c.sinCorrespondencia.length, 0);
  const d = (v, p) => desviaciones.find((x) => x.vendedorId === v && x.periodo === p);
  assert.equal(d('V01', '2026-08').diferencia, -L('V01').totales.clawback, 'María: el Excel no descontó el clawback de la NC');
  assert.ok(L('V01').totales.clawback > 0);
  assert.equal(d('V02', '2026-08').diferencia, 2550, 'Andrés: error de digitación de USD 25,50');
  assert.equal(d('V05', '2026-06').diferencia, -10000, 'Valeria: pago duplicado de USD 100,00 en junio (período aprobado)');
  assert.equal(d('V08', '2026-08').diferencia, L('V08').totales.liquidable - L('V08').totales.devengado - L('V08').totales.bonos, 'Sebastián: pagado el devengado íntegro sin retener');
  assert.equal(JSON.stringify(rolHistoricoDemo(res)), JSON.stringify({ filas, desviaciones }), 'determinista');
});
