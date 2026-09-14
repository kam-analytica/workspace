/**
 * Casos de oro del motor (Fase 1). Todos los montos en centavos. Cada test cita la regla que verifica.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTodo, EngineError, estadoFactura, generarCeldas, validarEsquema, validarPolitica } from '../src/engine/index.js';
import { periodoDeFecha, fechaCorte, diasEntre, sumarDias } from '../src/engine/dates.js';
import { aCentavos, redondear } from '../src/engine/money.js';
import { HOY, datasetBase, esquemaBase, politicaCobro, factura, cobro, notaCredito, run, ledger, linea, fila, alertas, datasetAleatorio } from './helpers/fixtures.mjs';

// ---------------------------------------------------------------- R-00
test('T-01 R-00 · base comisionable con 15 % de agencia', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-10', 10000, { clienteId: 'C2', canal: 'agencia' }));
  const l = ledger(run(ds), '2026-08');
  const L1 = linea(l, 'L1');
  assert.equal(L1.valores.valorNeto, 1000000);
  assert.equal(L1.valores.comisionAgencia, 150000);
  assert.equal(L1.valores.base, 850000);
  const r = fila(l, 'F1');
  assert.equal(r.pctAgencia, 0.15);
  assert.equal(r.base, 850000);
  // cumplimiento 85 % ⇒ Base reducida (×0,5) ⇒ vallas/agencia 0,8 % ⇒ 6.800
  assert.equal(l.tramo.tramoId, 't1');
  assert.equal(r.pct, 0.008);
  assert.equal(r.devengado, 6800);
});

test('T-02 R-00 · canal directo ⇒ pctAgencia 0 y base = valor neto', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-10', 10000));
  const l = ledger(run(ds), '2026-08');
  const r = fila(l, 'F1');
  assert.equal(r.pctAgencia, 0);
  assert.equal(r.comisionAgencia, 0);
  assert.equal(r.base, 1000000);
  assert.equal(l.tramo.tramoId, 't3');
  assert.equal(r.devengado, 25000);
});

// ---------------------------------------------------------------- R-01
for (const [valor, esperado, nombre] of [
  [6999, 't0', 'bajo 70 % ⇒ sin comisión'],
  [7000, 't1', '70,00 % exacto ⇒ Base reducida'],
  [9000, 't2', '90,00 % exacto ⇒ Base'],
  [10000, 't3', '100,00 % exacto ⇒ Acelerador'],
  [11500, 't4', '115,00 % exacto ⇒ Sobrecumplimiento'],
  [11499.99, 't3', '114,9999 % ⇒ Acelerador'],
]) {
  test(`T-03..06 R-01 · tramo exacto: ${nombre}`, () => {
    const ds = datasetBase();
    ds.facturas.push(factura('F1', '2026-08-10', valor));
    const l = ledger(run(ds), '2026-08');
    assert.equal(l.tramo.tramoId, esperado);
  });
}

test('T-03b R-01 · cuánto falta para el siguiente tramo', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-10', 9950));
  const l = ledger(run(ds), '2026-08');
  assert.equal(l.tramo.tramoId, 't2');
  assert.equal(l.tramo.siguienteId, 't3');
  assert.ok(Math.abs(l.tramo.falta - 0.005) < 1e-9);
  assert.equal(l.tramo.faltaBase, 5000);
  assert.equal(alertas(run(ds), 'A-07', '2026-08').length, 1, 'alerta de cercanía a tramo');
});

test('T-21 R-01 · generador tasa base × multiplicador es exacto a 4 decimales de porcentaje', () => {
  const e = esquemaBase();
  const c = generarCeldas(e.tasasBase, e.tramos);
  assert.equal(c.t1.vallas.agencia, 0.008);
  assert.equal(c.t3.vallas.directo, 0.025);
  assert.equal(c.t3.retail.directo, 0.0375);
  assert.equal(c.t3.vallas.agencia, 0.02);
  assert.equal(c.t0.led.agencia, 0);
  const c2 = generarCeldas({ vallas: { directo: 0.015, agencia: 0.015 }, led: { directo: 0, agencia: 0 }, retail: { directo: 0, agencia: 0 } }, [{ id: 'x', multiplicador: 0.75 }]);
  assert.equal(c2.x.vallas.directo, 0.01125);
});

// ---------------------------------------------------------------- R-04
test('T-07 R-04 · cobro a 75 días ⇒ 80 % liberado, 20 % no liberado por rezago', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-05-01', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-07-15', 10000));
  const res = run(ds);
  const mayo = ledger(res, '2026-05');
  assert.equal(fila(mayo, 'F1').devengado, 25000);
  assert.equal(linea(mayo, 'L4').monto, 0);
  assert.equal(fila(mayo, 'F1').retenido, 25000);
  const julio = ledger(res, '2026-07');
  const r = fila(julio, 'F1');
  assert.equal(r.ultimoCobro.dias, 75);
  assert.equal(r.ultimoCobro.factor, 0.8);
  assert.equal(r.liberadoPeriodo, 20000);
  assert.equal(r.rezagoPeriodo, 5000);
  assert.equal(r.retenido, 0);
  assert.equal(linea(julio, 'L5').monto, 20000, 'liberación de cartera, no del período');
  assert.equal(linea(julio, 'L4').monto, 0);
  assert.equal(linea(julio, 'L9').valores.liquidable, 20000);
});

test('T-08 R-04 · pago parcial del 40 % ⇒ liberación proporcional', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-05-01', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-05-11', 4000));
  const mayo = ledger(run(ds), '2026-05');
  const r = fila(mayo, 'F1');
  assert.equal(r.liberadoPeriodo, 10000);
  assert.equal(r.retenido, 15000);
  assert.equal(r.estado, 'cobrada_parcial');
  assert.equal(linea(mayo, 'L4').monto, 10000);
});

test('T-22 R-04 · tres pagos parciales cuadran al centavo (telescópico, D-06)', () => {
  const pol = politicaCobro();
  const s = estadoFactura({
    fechaEmision: '2026-05-01',
    valorNeto: 1000000,
    base: 1000000,
    pct: 0.025,
    politica: pol,
    cobros: [cobro('a', 'F', '2026-05-11', 3000), cobro('b', 'F', '2026-06-10', 3000), cobro('c', 'F', '2026-08-09', 4000)],
    hastaCobros: '2026-08-31',
    fechaEvaluacion: '2026-08-31',
  });
  assert.deepEqual(s.cobros.map((c) => [c.dias, c.factor, c.liberado]), [[10, 1, 7500], [40, 1, 7500], [100, 0.5, 5000]]);
  assert.equal(s.liberadoCobros, 20000);
  assert.equal(s.rezago, 5000);
  assert.equal(s.retenido, 0);
  assert.equal(s.devengado, s.anticipo + s.liberadoCobros + s.rezago + s.caducado + s.retenido);
  // montos que no dividen exacto: la suma de liberaciones por cobro es igual al acumulado
  const s2 = estadoFactura({ fechaEmision: '2026-05-01', valorNeto: 333333, base: 333333, pct: 0.0175, politica: pol, cobros: [cobro('a', 'F', '2026-05-20', 1111.11), cobro('b', 'F', '2026-07-20', 1111.11), cobro('c', 'F', '2026-08-25', 1111.11)], hastaCobros: '2026-08-31', fechaEvaluacion: '2026-08-31' });
  assert.equal(s2.cobros.reduce((t, c) => t + c.liberado, 0), s2.liberadoCobros);
  assert.equal(s2.devengado, s2.anticipo + s2.liberadoCobros + s2.rezago + s2.caducado + s2.retenido);
});

test('T-09 R-04 · caducidad: 120 días retiene, 121 días caduca', () => {
  const pol = politicaCobro();
  const base = { fechaEmision: '2026-04-01', valorNeto: 1000000, base: 1000000, pct: 0.025, politica: pol, cobros: [] };
  const a120 = estadoFactura({ ...base, hastaCobros: '2026-12-31', fechaEvaluacion: sumarDias('2026-04-01', 120) });
  assert.equal(a120.caducada, false);
  assert.equal(a120.retenido, 25000);
  const a121 = estadoFactura({ ...base, hastaCobros: '2026-12-31', fechaEvaluacion: sumarDias('2026-04-01', 121) });
  assert.equal(a121.caducada, true);
  assert.equal(a121.retenido, 0);
  assert.equal(a121.caducado, 25000);
  assert.equal(a121.estado, 'caducada');
  // cobro tardío a 130 días libera 0 y queda como caducado
  const tardio = estadoFactura({ ...base, cobros: [cobro('x', 'F', sumarDias('2026-04-01', 130), 10000)], hastaCobros: '2026-12-31', fechaEvaluacion: '2026-12-31' });
  assert.equal(tardio.liberadoCobros, 0);
  assert.equal(tardio.caducado, 25000);
  // en el flujo mensual: emitida 01-abr, sin cobro ⇒ caduca en julio (121 días al 31-jul)
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-04-01', 10000));
  const res = run(ds);
  assert.equal(fila(ledger(res, '2026-06'), 'F1').retenido, 25000);
  const julio = ledger(res, '2026-07');
  assert.equal(fila(julio, 'F1').caducadoPeriodo, 25000);
  assert.equal(linea(julio, 'L6').valores.caducadoPeriodo, 25000);
  assert.equal(alertas(res, 'A-04', '2026-07').length, 1);
  assert.equal(res.cartera.length, 0, 'una factura caducada ya no está en cartera');
});

// ---------------------------------------------------------------- R-03
test('T-10 R-03 · NC antes de liquidar solo reduce la base (y el tramo)', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-10', 10000));
  ds.notasCredito.push(notaCredito('NC1', 'F1', '2026-09-05', 2000));
  const res = run(ds);
  const ago = ledger(res, '2026-08');
  assert.equal(linea(ago, 'L1').valores.notasCredito, 200000);
  assert.equal(linea(ago, 'L1').valores.base, 800000);
  assert.equal(ago.tramo.tramoId, 't1');
  assert.equal(fila(ago, 'F1').devengado, 8000);
  assert.equal(linea(ago, 'L7').valores.clawbackFacturas, 0);
  assert.equal(alertas(res, 'A-06').length, 0);
});

test('T-11 R-03 · NC después de liberar en un período aprobado ⇒ clawback en el período de la NC', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-07-10', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-07-20', 10000));
  const primera = run(ds, { hoy: '2026-08-05', hastaPeriodo: '2026-07' });
  assert.equal(linea(ledger(primera, '2026-07'), 'L4').monto, 25000);
  ds.cierres = { '2026-07': { fecha: '2026-08-05', autor: 'Gerencia Financiera', snapshot: primera.periodos['2026-07'] } };
  ds.notasCredito.push(notaCredito('NC1', 'F1', '2026-08-15', 2200));
  const res = run(ds);
  assert.equal(res.periodos['2026-07'].bloqueado, true);
  assert.equal(linea(ledger(res, '2026-07'), 'L4').monto, 25000, 'el período aprobado no se recalcula');
  const ago = ledger(res, '2026-08');
  assert.equal(linea(ago, 'L7').valores.clawbackFacturas, 5500);
  assert.equal(linea(ago, 'L7').monto, -5500);
  assert.equal(fila(ago, 'F1').clawback, 5500);
  assert.equal(alertas(res, 'A-06', '2026-08').length, 1);
  assert.equal(linea(ago, 'L9').valores.liquidable, 0);
  assert.equal(linea(ago, 'L9').valores.saldoSiguiente, 5500);
});

test('T-11b R-03 · NC sobre porción no cobrada no genera clawback: reduce lo retenido (S-12)', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-07-10', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-07-20', 4000));
  const primera = run(ds, { hoy: '2026-08-05', hastaPeriodo: '2026-07' });
  ds.cierres = { '2026-07': { fecha: '2026-08-05', snapshot: primera.periodos['2026-07'] } };
  ds.notasCredito.push(notaCredito('NC1', 'F1', '2026-08-15', 2000));
  const res = run(ds);
  const r = fila(ledger(res, '2026-08'), 'F1');
  assert.equal(r.clawback, 0);
  assert.equal(r.valorNeto, 800000);
  assert.equal(r.devengado, 20000);
  assert.equal(r.liberadoAcumulado, 10000);
  assert.equal(r.retenido, 10000);
});

test('T-15 R-03 · saldo negativo se traslada y se descuenta en el período siguiente', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-07-10', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-07-20', 10000));
  const primera = run(ds, { hoy: '2026-08-05', hastaPeriodo: '2026-07' });
  ds.cierres = { '2026-07': { fecha: '2026-08-05', snapshot: primera.periodos['2026-07'] } };
  ds.notasCredito.push(notaCredito('NC1', 'F1', '2026-08-15', 2200));
  ds.facturas.push(factura('F2', '2026-09-05', 10000));
  ds.cobros.push(cobro('CB2', 'F2', '2026-09-10', 10000));
  const res = run(ds, { hastaPeriodo: '2026-09' });
  assert.equal(alertas(res, 'A-11', '2026-08').length, 1);
  const sep = ledger(res, '2026-09');
  assert.equal(linea(sep, 'L7').valores.saldoAnterior, 5500);
  assert.equal(linea(sep, 'L4').monto, 25000);
  assert.equal(linea(sep, 'L9').valores.netoAntesTope, 19500);
  assert.equal(linea(sep, 'L9').valores.liquidable, 19500);
  assert.equal(linea(sep, 'L9').valores.saldoSiguiente, 0);
});

test('T-28 R-03 · factura anulada después de cobrada ⇒ clawback total; estado anulada', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-07-10', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-07-20', 10000));
  const primera = run(ds, { hoy: '2026-08-05', hastaPeriodo: '2026-07' });
  ds.cierres = { '2026-07': { fecha: '2026-08-05', snapshot: primera.periodos['2026-07'] } };
  ds.facturas[0].fechaAnulacion = '2026-08-20';
  const res = run(ds);
  const r = fila(ledger(res, '2026-08'), 'F1');
  assert.equal(r.clawback, 25000);
  assert.equal(r.estado, 'anulada');
  assert.equal(r.valorNeto, 0);
});

// ---------------------------------------------------------------- R-04 transición
test('T-12 R-04 · regla de transición por fecha de emisión', () => {
  const ds = datasetBase();
  ds.politicas = [{ ...ds.politicas[0] }, politicaCobro({ vigenteDesde: '2026-03-01', reglaTransicion: 'emision' })];
  ds.facturas.push(factura('F-feb', '2026-02-10', 10000), factura('F-mar', '2026-03-10', 10000));
  const res = run(ds);
  const feb = ledger(res, '2026-02');
  assert.equal(fila(feb, 'F-feb').politicaVersion, '1.0');
  assert.equal(linea(feb, 'L4').monto, 25000, 'v1.0: 100 % con la emisión');
  const mar = ledger(res, '2026-03');
  assert.equal(fila(mar, 'F-mar').politicaVersion, '2.0');
  assert.equal(linea(mar, 'L4').monto, 0);
  assert.equal(fila(mar, 'F-mar').retenido, 25000);
  assert.equal(fila(mar, 'F-feb'), undefined, 'la factura de febrero no cambia en marzo');
  assert.equal(alertas(res, 'A-13').length, 0);
});

test('T-13 R-04 · regla de transición sobre cartera no cobrada ⇒ reversión visible y alertada', () => {
  const ds = datasetBase();
  ds.politicas = [{ ...ds.politicas[0] }, politicaCobro({ vigenteDesde: '2026-03-01', reglaTransicion: 'cartera' })];
  ds.facturas.push(factura('F-a', '2026-02-10', 10000), factura('F-b', '2026-02-15', 10000));
  ds.cobros.push(cobro('CB1', 'F-a', '2026-02-20', 10000));
  const res = run(ds);
  const feb = ledger(res, '2026-02');
  assert.equal(feb.tramo.tramoId, 't4');
  assert.equal(linea(feb, 'L4').monto, 60000, 'ambas al 100 % con la emisión en febrero');
  const mar = ledger(res, '2026-03');
  assert.equal(fila(mar, 'F-a'), undefined, 'cobrada antes de la vigencia: conserva v1.0');
  const rb = fila(mar, 'F-b');
  assert.equal(rb.politicaVersion, '2.0');
  assert.equal(rb.reversion, -30000);
  assert.equal(rb.retenido, 30000);
  assert.equal(linea(mar, 'L5').valores.reversion, -30000);
  assert.equal(linea(mar, 'L9').valores.saldoSiguiente, 30000);
  assert.equal(alertas(res, 'A-13', '2026-03').length, 1);
});

test('T-23 R-04 · anticipo del 30 % se libera con la emisión', () => {
  const ds = datasetBase();
  ds.politicas = [ds.politicas[0], politicaCobro({ pctAnticipo: 0.3 })];
  ds.facturas.push(factura('F1', '2026-08-10', 10000));
  const ago = ledger(run(ds), '2026-08');
  const r = fila(ago, 'F1');
  assert.equal(r.anticipo, 7500);
  assert.equal(r.liberadoPeriodo, 7500);
  assert.equal(r.retenido, 17500);
  assert.equal(linea(ago, 'L4').monto, 7500);
});

// ---------------------------------------------------------------- R-05
test('T-14 R-05 · tope aplicado con excedente visible', () => {
  const ds = datasetBase({ esquemas: [esquemaBase({ tope: { activo: true, monto: 100 } })] });
  ds.facturas.push(factura('F1', '2026-08-10', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-08-20', 10000));
  const res = run(ds);
  const L9 = linea(ledger(res, '2026-08'), 'L9');
  assert.equal(L9.valores.netoAntesTope, 25000);
  assert.equal(L9.valores.tope, 10000);
  assert.equal(L9.valores.liquidable, 10000);
  assert.equal(L9.valores.excedente, 15000);
  assert.equal(alertas(res, 'A-05', '2026-08').length, 1);
});

// ---------------------------------------------------------------- R-02
test('T-16 R-02 · bono mix exactamente en el 20 % aplica; por debajo no', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-10', 8000), factura('F2', '2026-08-12', 2000, { linea: 'retail' }));
  const res = run(ds);
  const L3 = linea(ledger(res, '2026-08'), 'L3');
  assert.equal(L3.detalle.mix.aplica, true);
  assert.ok(Math.abs(L3.detalle.mix.participacionRetail - 0.2) < 1e-12);
  assert.equal(L3.valores.mix, 2750, '10 % de 20.000 + 7.500');
  assert.equal(L3.valores.clienteNuevo, 0);
  const ds2 = datasetBase();
  ds2.facturas.push(factura('F1', '2026-08-10', 8000), factura('F2', '2026-08-12', 1999.99, { linea: 'retail' }));
  assert.equal(linea(ledger(run(ds2), '2026-08'), 'L3').valores.mix, 0);
});

test('T-16b R-02 · el bono se libera con la cobranza ponderada del mes (S-11)', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-10', 8000), factura('F2', '2026-08-12', 2000, { linea: 'retail' }));
  ds.cobros.push(cobro('CB1', 'F1', '2026-08-20', 8000));
  const res = run(ds);
  const ago = ledger(res, '2026-08');
  const L4 = linea(ago, 'L4');
  assert.equal(L4.valores.facturas, 20000);
  // liberado 20.000 de 27.500 devengado ⇒ 72,73 % ⇒ bono 2.750 × 0,7273 = 2.000
  assert.equal(L4.valores.bonos, 2000);
  assert.equal(linea(ago, 'L6').valores.retenidoBonos, 750);
});

test('T-24 R-02 · bono cliente nuevo reconoce máximo 5 y va al vendedor titular', () => {
  const ds = datasetBase();
  for (let i = 1; i <= 7; i++) {
    ds.clientes.push({ id: `N${i}`, nombre: `Nuevo ${i}`, canal: 'directo', vendedorId: 'V1', fechaAlta: `2026-08-0${i}` });
    ds.facturas.push(factura(`FN${i}`, '2026-08-15', 1000, { clienteId: `N${i}` }));
  }
  const L3 = linea(ledger(run(ds), '2026-08'), 'L3');
  assert.equal(L3.detalle.clienteNuevo.cantidad, 7);
  assert.equal(L3.detalle.clienteNuevo.reconocidos, 5);
  assert.equal(L3.valores.clienteNuevo, 75000);
});

// ---------------------------------------------------------------- R-07
test('T-17 R-07 · período bloqueado no se recalcula; datos nuevos alertan y se liquidan en el primer período abierto', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-07-10', 10000), factura('F3', '2026-07-12', 10000));
  ds.cobros.push(cobro('CB1', 'F1', '2026-07-20', 10000));
  const primera = run(ds, { hoy: '2026-08-05', hastaPeriodo: '2026-07' });
  const julioAprobado = primera.periodos['2026-07'];
  assert.equal(linea(julioAprobado.vendedores.V1, 'L4').monto, 30000);
  ds.cierres = { '2026-07': { fecha: '2026-08-05', autor: 'Gerencia Financiera', snapshot: julioAprobado } };
  ds.cobros.push(cobro('CB3', 'F3', '2026-07-25', 10000));
  ds.facturas.push(factura('F9', '2026-07-30', 5000));
  const res = run(ds);
  assert.equal(res.periodos['2026-07'].bloqueado, true);
  assert.equal(linea(ledger(res, '2026-07'), 'L4').monto, 30000, 'sin recálculo');
  const a08 = alertas(res, 'A-08', '2026-07');
  assert.deepEqual(a08.map((a) => a.tipo).sort(), ['cobro', 'factura']);
  const ago = ledger(res, '2026-08');
  assert.equal(linea(ago, 'L5').valores.extemporaneo, 30000, 'cobro de julio no incluido en el cierre se libera en agosto');
  assert.equal(linea(ago, 'L2').valores.devengadoExtemporaneo, 15000, 'factura F9 al tramo aprobado de julio (3 %)');
  assert.ok(alertas(res, 'A-14', '2026-08').length >= 2);
});

// ---------------------------------------------------------------- Control
test('T-25 R-01 · vendedor sin cuota del período: usa la anterior y alerta; sin ninguna, sin comisión', () => {
  const ds = datasetBase();
  ds.vendedores[0].cuotas = [{ periodo: '2026-01', monto: 10000 }];
  ds.facturas.push(factura('F1', '2026-08-10', 10000));
  const res = run(ds);
  const l = ledger(res, '2026-08');
  assert.equal(l.tramo.cuotaOrigen, 'anterior');
  assert.equal(l.tramo.tramoId, 't3');
  assert.equal(alertas(res, 'A-09', '2026-08')[0].periodoOrigen, '2026-01');
  ds.vendedores[0].cuotas = [];
  const l2 = ledger(run(ds), '2026-08');
  assert.equal(l2.tramo.sinMedida, true);
  assert.equal(l2.tramo.tramoId, 't0');
  assert.equal(fila(l2, 'F1').devengado, 0);
});

test('T-26 R-00 · agencia sin porcentaje ⇒ alerta A-10 y base sin descuento', () => {
  const ds = datasetBase();
  ds.agencias[0].pctAgencia = undefined;
  ds.facturas.push(factura('F1', '2026-08-10', 10000, { clienteId: 'C2', canal: 'agencia' }));
  const res = run(ds);
  assert.equal(alertas(res, 'A-10', '2026-08').length, 1);
  assert.equal(fila(ledger(res, '2026-08'), 'F1').base, 1000000);
});

test('T-27 control · cobranza del período bajo mínimo y factura > 90 días sin cobro', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-05-01', 10000));
  const res = run(ds);
  assert.equal(alertas(res, 'A-02', '2026-05').length, 1);
  assert.equal(alertas(res, 'A-03', '2026-06').length, 0, '60 días al 30-jun: bajo el límite');
  assert.equal(alertas(res, 'A-03', '2026-07').length, 1, '91 días al 31-jul: retenida y sobre el límite');
  assert.equal(alertas(res, 'A-03', '2026-08').length, 0, 'caducada en agosto (122 días), ya no retenida');
  assert.equal(alertas(res, 'A-04', '2026-08').length, 1);
  const ds2 = datasetBase();
  ds2.facturas.push(factura('F1', '2026-06-15', 10000));
  const res2 = run(ds2, { hastaPeriodo: '2026-09', hoy: '2026-09-14' });
  assert.equal(alertas(res2, 'A-03', '2026-09').length, 1, '107 días al 30-sep: retenida y sobre el límite');
  assert.equal(res2.cartera.length, 1);
  assert.equal(res2.cartera[0].dias, diasEntre('2026-06-15', HOY));
  assert.equal(res2.cartera[0].fechaLimite, '2026-10-13');
  assert.equal(res2.cartera[0].diasParaCaducar, 120 - diasEntre('2026-06-15', HOY));
  assert.equal(res2.cartera[0].factorHoy, 0.5, 'a 91 días hoy liberaría el 50 %');
});

test('T-29 fechas · día de corte 25 y formato de períodos', () => {
  assert.equal(periodoDeFecha('2026-08-26', 25), '2026-09');
  assert.equal(periodoDeFecha('2026-08-25', 25), '2026-08');
  assert.equal(periodoDeFecha('2026-08-26'), '2026-08');
  assert.equal(fechaCorte('2026-02', 30), '2026-02-28');
  assert.equal(fechaCorte('2026-02'), '2026-02-28');
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-26', 10000));
  const res = run(ds, { diaCorte: 25, hastaPeriodo: '2026-09' });
  assert.equal(fila(ledger(res, '2026-09'), 'F1').numero, 'F1');
  assert.equal(res.periodos['2026-08'], undefined, 'no hay datos antes de septiembre con corte al 25');
  assert.equal(res.periodos['2026-09'].fechaCorte, '2026-09-25');
});

test('T-30 parámetros · esquema o política inválidos detienen el cálculo con detalle', () => {
  const ds = datasetBase();
  ds.esquemas[0].celdas.t1.vallas.directo = 1.5;
  assert.throws(() => run(ds), (e) => e instanceof EngineError && e.errores.some((m) => m.includes('t1/vallas/directo')));
  assert.ok(validarPolitica({ id: 'x', version: '1', vigenteDesde: '2026-01-01', modo: 'cobro', tramos: [{ hastaDias: 30, factor: 1 }, { hastaDias: 60, factor: 1.5 }], reglaTransicion: 'emision' }).length > 0, 'factor > 100 %');
  assert.ok(validarPolitica({ id: 'x', version: '1', vigenteDesde: '2026-01-01', modo: 'cobro', tramos: [{ hastaDias: 30, factor: 1 }], caducidadDias: 20, reglaTransicion: 'emision' }).length > 0, 'caducidad antes del último tramo');
  assert.equal(validarPolitica(politicaCobro()).length, 0);
  assert.equal(validarEsquema(esquemaBase()).length, 0);
});

// ---------------------------------------------------------------- Conciliación, rendimiento, determinismo
function verificarConciliacion(res) {
  const acumuladoPorFactura = new Map();
  for (const p of res.meta.periodos) {
    const per = res.periodos[p];
    const tot = {};
    for (const [v, l] of Object.entries(per.vendedores)) {
      const L = Object.fromEntries(l.lineas.map((x) => [x.codigo, x]));
      assert.equal(L.L9.valores.netoAntesTope, L.L4.monto + L.L5.monto + L.L7.monto + L.L8.monto, `neto ${p}/${v}`);
      const delP = l.facturas.filter((r) => r.esDelPeriodo);
      const cart = l.facturas.filter((r) => !r.esDelPeriodo);
      assert.equal(L.L4.valores.facturas, delP.reduce((s, r) => s + r.liberadoPeriodo, 0), `L4 detalle ${p}/${v}`);
      assert.equal(L.L5.valores.facturas, cart.reduce((s, r) => s + r.liberadoPeriodo, 0), `L5 detalle ${p}/${v}`);
      assert.equal(L.L5.valores.reversion, l.facturas.reduce((s, r) => s + r.reversion, 0));
      assert.equal(L.L7.valores.clawbackFacturas, l.facturas.reduce((s, r) => s + r.clawback, 0));
      assert.equal(L.L1.valores.base, delP.filter((r) => !r.extemporanea).reduce((s, r) => s + r.base, 0), `base ${p}/${v}`);
      assert.equal(L.L2.valores.devengado, delP.filter((r) => !r.extemporanea).reduce((s, r) => s + r.devengado, 0), `devengado ${p}/${v}`);
      for (const r of l.facturas) {
        assert.equal(r.devengado, r.liberadoAcumulado + r.rezagoAcumulado + r.caducadoAcumulado + r.retenido, `identidad factura ${r.numero} en ${p}`);
        acumuladoPorFactura.set(r.numero, (acumuladoPorFactura.get(r.numero) || 0) + r.liberadoPeriodo + r.reversion + r.extemporaneo - r.clawback);
      }
      for (const k of Object.keys(l.totales)) tot[k] = (tot[k] || 0) + (l.totales[k] || 0);
      assert.ok(L.L9.valores.liquidable >= 0);
      if (L.L9.valores.topeActivo) assert.ok(L.L9.valores.liquidable <= L.L9.valores.tope);
    }
    for (const k of Object.keys(per.totales)) assert.equal(per.totales[k], tot[k] || 0, `total ${k} en ${p}`);
  }
  const ultimo = res.periodos[res.meta.periodos[res.meta.periodos.length - 1]].estadoFinal.facturas;
  for (const [numero, acum] of acumuladoPorFactura) assert.equal(acum, ultimo[numero].pagado, `telescópico ${numero}`);
  return acumuladoPorFactura.size;
}

test('T-18 conciliación · suma del detalle = rol, identidades por factura y telescópico entre períodos', () => {
  const ds = datasetAleatorio({ semilla: 11, facturas: 400 });
  const res = run(ds);
  const n = verificarConciliacion(res);
  assert.ok(n > 300);
  // con períodos aprobados en dos etapas (enero a marzo) el cuadre se mantiene
  const etapa1 = run(ds, { hoy: '2026-04-03', hastaPeriodo: '2026-03' });
  ds.cierres = Object.fromEntries(['2026-01', '2026-02', '2026-03'].map((p) => [p, { fecha: '2026-04-03', snapshot: etapa1.periodos[p] }]));
  const res2 = run(ds);
  verificarConciliacion(res2);
  assert.deepEqual(res2.periodos['2026-02'].totales, etapa1.periodos['2026-02'].totales);
  // con día de corte 25 y transición sobre cartera
  const ds3 = datasetAleatorio({ semilla: 5, facturas: 250 });
  ds3.politicas[1] = politicaCobro({ vigenteDesde: '2026-04-01', reglaTransicion: 'cartera' });
  verificarConciliacion(run(ds3, { diaCorte: 25 }));
});

test('T-19 rendimiento · 5.000 facturas y 8 vendedores en menos de 200 ms', () => {
  const ds = datasetAleatorio({ semilla: 3, vendedores: 8, clientes: 60, facturas: 5000 });
  let mejor = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    computeTodo(ds, { hoy: HOY });
    mejor = Math.min(mejor, performance.now() - t0);
  }
  assert.ok(mejor < 200, `tardó ${mejor.toFixed(1)} ms`);
});

test('T-20 determinismo · misma entrada, misma salida', () => {
  const ds = datasetAleatorio({ semilla: 21, facturas: 200 });
  const a = run(ds);
  const b = run(JSON.parse(JSON.stringify(ds)));
  const sinMeta = (r) => JSON.stringify({ p: r.periodos, c: r.cartera, a: r.alertas });
  assert.equal(sinMeta(a), sinMeta(b));
  assert.equal(JSON.stringify(ds), JSON.stringify(JSON.parse(JSON.stringify(ds))), 'el motor no muta el dataset');
});

test('T-31 estados · cobrada, cobrada_parcial, emitida, caducada, anulada', () => {
  const ds = datasetBase();
  ds.facturas.push(factura('F1', '2026-08-01', 1000), factura('F2', '2026-08-01', 1000), factura('F3', '2026-08-01', 1000), factura('F4', '2026-03-01', 10000), factura('F5', '2026-08-01', 1000, { fechaAnulacion: '2026-08-10' }));
  ds.cobros.push(cobro('a', 'F1', '2026-08-05', 1000), cobro('b', 'F2', '2026-08-05', 300));
  const res = run(ds);
  const ago = ledger(res, '2026-08');
  assert.deepEqual(['F1', 'F2', 'F3', 'F5'].map((n) => fila(ago, n).estado), ['cobrada', 'cobrada_parcial', 'emitida', 'anulada']);
  assert.equal(fila(ledger(res, '2026-06'), 'F4').estado, 'caducada', '121 días al 30-jun');
  assert.equal(fila(ago, 'F4'), undefined, 'sin movimiento en agosto: no aparece en el detalle');
  assert.equal(fila(ago, 'F5').base, 0);
});

test('T-32 money · redondeo simétrico y centavos', () => {
  assert.equal(aCentavos(45230.5), 4523050);
  assert.equal(aCentavos('1.005'), 101);
  assert.equal(redondear(2.5), 3);
  assert.equal(redondear(-2.5), -3);
  assert.equal(redondear(0.1 + 0.2), 0);
});
