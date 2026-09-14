/**
 * Anonimización y contraste: determinismo, integridad referencial, invariancia del cálculo y lectura del contraste.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonimizarDataset, codigoSeudonimo, serializarMapa } from '../src/data/anonimizar.js';
import { contrastar, leerContraste, plantillaContraste } from '../src/data/contraste.js';
import { cargarXLSX } from '../src/data/xlsx.js';
import { libroABytes, datasetAPlantilla } from '../src/data/plantilla.js';
import { importarPlantilla } from '../src/data/importar.js';
import { computeTodo } from '../src/engine/index.js';
import { generarDatosDemo, HOY_DEMO } from '../src/seed/demo.js';

const XLSX = await cargarXLSX();
const { dataset } = generarDatosDemo();
const CLAVE = 'induvallas-2026-clave-de-prueba';

test('AN-01 anonimización · determinista con la misma clave; distinta con otra clave; sin nombres reales', () => {
  const a = anonimizarDataset(dataset, { clave: CLAVE });
  const b = anonimizarDataset(dataset, { clave: CLAVE });
  const c = anonimizarDataset(dataset, { clave: 'otra-clave-distinta-123' });
  assert.equal(JSON.stringify(a.dataset), JSON.stringify(b.dataset));
  assert.notEqual(a.dataset.vendedores[0].id, c.dataset.vendedores[0].id);
  const texto = JSON.stringify(a.dataset);
  for (const v of dataset.vendedores) assert.equal(texto.includes(v.nombre), false, v.nombre);
  for (const cl of dataset.clientes) assert.equal(texto.includes(cl.nombre), false, cl.nombre);
  for (const f of dataset.facturas.slice(0, 20)) assert.equal(texto.includes(f.numero), false);
  assert.match(a.dataset.vendedores[0].id, /^V-[A-Z2-9]{6}$/);
  assert.match(a.dataset.facturas[0].numero, /^F-[A-Z2-9]{6}$/);
  assert.equal(codigoSeudonimo('k', 'clientes', 'C01'), codigoSeudonimo('k', 'clientes', 'C01'));
  assert.notEqual(codigoSeudonimo('k', 'clientes', 'C01'), codigoSeudonimo('k', 'clientes', 'C02'));
  assert.equal(a.mapa.entidades.vendedores.V01.seudonimo, a.dataset.vendedores[0].id);
  assert.equal(a.mapa.entidades.vendedores.V01.nombre, 'María Fernanda Salazar');
  assert.equal(serializarMapa(a.mapa).includes(CLAVE), false, 'el mapa no contiene la clave');
});

test('AN-02 anonimización · integridad referencial y totales conservados', () => {
  const { dataset: an, informe } = anonimizarDataset(dataset, { clave: CLAVE });
  const vend = new Set(an.vendedores.map((v) => v.id));
  const cli = new Set(an.clientes.map((c) => c.id));
  const ag = new Set(an.agencias.map((a) => a.id));
  const fac = new Set(an.facturas.map((f) => f.numero));
  for (const c of an.clientes) {
    assert.ok(vend.has(c.vendedorId));
    if (c.agenciaId) assert.ok(ag.has(c.agenciaId));
  }
  for (const f of an.facturas) assert.ok(vend.has(f.vendedorId) && cli.has(f.clienteId));
  for (const c of an.cobros) assert.ok(fac.has(c.facturaNumero));
  for (const n of an.notasCredito) assert.ok(fac.has(n.facturaNumero));
  assert.equal(informe.totales.facturadoAnonimizado, informe.totales.facturadoOriginal);
  assert.equal(informe.totales.cobradoAnonimizado, informe.totales.cobradoOriginal);
  assert.equal(new Set(an.facturas.map((f) => f.numero)).size, dataset.facturas.length, 'sin colisiones');
});

test('AN-03 anonimización · el motor produce el mismo resultado sobre datos anonimizados', () => {
  const { dataset: an, mapa } = anonimizarDataset(dataset, { clave: CLAVE });
  const original = computeTodo({ ...dataset, cierres: {} }, { hoy: HOY_DEMO });
  const anonimo = computeTodo(an, { hoy: HOY_DEMO });
  for (const p of original.meta.periodos) {
    assert.deepEqual(anonimo.periodos[p].totales, original.periodos[p].totales, p);
    for (const v of dataset.vendedores) {
      const seudo = mapa.entidades.vendedores[v.id].seudonimo;
      assert.deepEqual(anonimo.periodos[p].vendedores[seudo].totales, original.periodos[p].vendedores[v.id].totales, `${p} ${v.id}`);
    }
  }
});

test('AN-04 anonimización · escala 0,8 preserva proporciones y respeta cobros no mayores que la factura', () => {
  const { dataset: an, informe } = anonimizarDataset(dataset, { clave: CLAVE, escala: 0.8 });
  assert.ok(Math.abs(informe.totales.facturadoAnonimizado - informe.totales.facturadoOriginal * 0.8) < 5);
  const valor = new Map(an.facturas.map((f) => [f.numero, f.valorFacturado]));
  const cobrado = {};
  for (const c of an.cobros) cobrado[c.facturaNumero] = Math.round(((cobrado[c.facturaNumero] || 0) + c.monto) * 100) / 100;
  for (const [n, m] of Object.entries(cobrado)) assert.ok(m <= valor.get(n) + 0.005, `cobros ${n}`);
  assert.equal(an.vendedores[0].cuotas[0].monto, Math.round(dataset.vendedores[0].cuotas[0].monto * 0.8 * 100) / 100);
  const r = importarPlantilla(XLSX, libroABytes(XLSX, datasetAPlantilla(XLSX, an)));
  assert.deepEqual(r.errores, [], 'los datos anonimizados y escalados pasan la validación de importación');
  assert.throws(() => anonimizarDataset(dataset, { clave: 'corta' }), /8 caracteres/);
});

test('AN-05 anonimización · mapa previo mantiene seudónimos entre exportaciones', () => {
  const primera = anonimizarDataset(dataset, { clave: CLAVE });
  const segunda = anonimizarDataset(dataset, { clave: 'clave-nueva-cambiada-99', mapaPrevio: primera.mapa });
  assert.equal(segunda.dataset.vendedores[0].id, primera.dataset.vendedores[0].id);
  assert.equal(segunda.dataset.facturas[10].numero, primera.dataset.facturas[10].numero);
});

test('CT-01 contraste · lectura tolerante, comparación con tolerancia y filas sin correspondencia', () => {
  const res = computeTodo(dataset, { hoy: HOY_DEMO });
  const wb = XLSX.utils.book_new();
  const liq = (v) => res.periodos['2026-08'].vendedores[v].totales.liquidable / 100;
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Periodo: '2026-08', Vendedor: 'V01', 'Comisión pagada': liq('V01') },
      { Periodo: '2026-08', Vendedor: 'V02', 'Comisión pagada': liq('V02') + 25.5 },
      { Periodo: '2026-08', Vendedor: 'V99', 'Comisión pagada': 10 },
      { Periodo: 'x', Vendedor: 'V01', 'Comisión pagada': 'abc' },
    ]),
    'Contraste'
  );
  const { filas, errores } = leerContraste(XLSX, libroABytes(XLSX, wb));
  assert.equal(filas.length, 3);
  assert.equal(errores.length, 1);
  const c = contrastar(res, filas, { tolerancia: 1 });
  assert.equal(c.filas.length, 2);
  assert.equal(c.filas[0].estado, 'ok');
  assert.equal(c.filas[1].estado, 'revisar');
  assert.equal(c.filas[1].diferencia, -25.5);
  assert.equal(c.sinCorrespondencia.length, 1);
  assert.equal(c.totales.revisar, 1);
  const pl = plantillaContraste(XLSX, ['2026-08'], dataset.vendedores);
  assert.deepEqual(pl.SheetNames, ['Contraste', 'Instrucciones']);
});
