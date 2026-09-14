/**
 * Fixtures de prueba del motor. Datos ficticios mínimos; ninguna cifra real de INDUVALLAS.
 */
import { generarCeldas } from '../../src/engine/parametros.js';
import { computeTodo } from '../../src/engine/index.js';

export const HOY = '2026-09-14';

export function esquemaBase(extra = {}) {
  const tramos = [
    { id: 't0', nombre: 'Sin comisión', desde: 0, multiplicador: 0 },
    { id: 't1', nombre: 'Base reducida', desde: 0.7, multiplicador: 0.5 },
    { id: 't2', nombre: 'Base', desde: 0.9, multiplicador: 1 },
    { id: 't3', nombre: 'Acelerador', desde: 1.0, multiplicador: 1.25 },
    { id: 't4', nombre: 'Sobrecumplimiento', desde: 1.15, multiplicador: 1.5 },
  ];
  const tasasBase = {
    vallas: { directo: 0.02, agencia: 0.016 },
    led: { directo: 0.024, agencia: 0.02 },
    retail: { directo: 0.03, agencia: 0.026 },
  };
  return {
    id: 'esq-1',
    version: '1.0',
    vigenteDesde: '2025-01-01',
    criterioTramo: 'cumplimiento',
    tramos,
    tasasBase,
    celdas: generarCeldas(tasasBase, tramos),
    bonos: { mix: { activo: true, umbralRetail: 0.2, pct: 0.1 }, clienteNuevo: { activo: true, monto: 150, maximo: 5 } },
    tope: { activo: true, monto: 5000 },
    autor: 'test',
    fecha: '2026-01-01',
    comentario: 'fixture',
    ...extra,
  };
}

export function politicaEmision(extra = {}) {
  return { id: 'pol-1', version: '1.0', vigenteDesde: '2025-01-01', modo: 'emision', tramos: [], reglaTransicion: 'emision', pctAnticipo: 0, autor: 'test', fecha: '2025-01-01', ...extra };
}

export function politicaCobro(extra = {}) {
  return {
    id: 'pol-2',
    version: '2.0',
    vigenteDesde: '2026-01-01',
    modo: 'cobro',
    tramos: [
      { hastaDias: 30, factor: 1 },
      { hastaDias: 60, factor: 1 },
      { hastaDias: 90, factor: 0.8 },
      { hastaDias: 120, factor: 0.5 },
    ],
    caducidadDias: 120,
    reglaTransicion: 'emision',
    pctAnticipo: 0,
    autor: 'test',
    fecha: '2026-01-01',
    ...extra,
  };
}

export function cuotas(monto, desde = '2026-01', hasta = '2026-12') {
  const out = [];
  let [a, m] = desde.split('-').map(Number);
  for (;;) {
    const p = `${a}-${String(m).padStart(2, '0')}`;
    out.push({ periodo: p, monto });
    if (p >= hasta) break;
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out;
}

/** Dataset mínimo: un vendedor con cuota 10.000, un cliente directo, una agencia al 15 % y un cliente por agencia. */
export function datasetBase(extra = {}) {
  return {
    vendedores: [{ id: 'V1', nombre: 'Vendedor Uno', iniciales: 'VU', zona: 'Quito', cargo: 'Ejecutivo', activo: true, cuotas: cuotas(10000) }],
    agencias: [{ id: 'AG1', nombre: 'Agencia Uno', pctAgencia: 0.15 }],
    clientes: [
      { id: 'C1', nombre: 'Cliente Directo', canal: 'directo', vendedorId: 'V1', fechaAlta: '2025-06-01' },
      { id: 'C2', nombre: 'Cliente Agencia', canal: 'agencia', agenciaId: 'AG1', vendedorId: 'V1', fechaAlta: '2025-06-01' },
    ],
    facturas: [],
    cobros: [],
    notasCredito: [],
    ajustes: [],
    cierres: {},
    esquemas: [esquemaBase()],
    politicas: [politicaEmision(), politicaCobro()],
    control: { cobranzaMinima: 0.7, diasSinCobro: 90, puntosCercaTramo: 0.015 },
    ...extra,
  };
}

export function factura(numero, fechaEmision, valorFacturado, { vendedorId = 'V1', clienteId = 'C1', linea = 'vallas', canal, pctAgencia, fechaAnulacion } = {}) {
  const f = { numero, fechaEmision, vendedorId, clienteId, linea, valorFacturado };
  if (canal) f.canal = canal;
  if (pctAgencia != null) f.pctAgencia = pctAgencia;
  if (fechaAnulacion) f.fechaAnulacion = fechaAnulacion;
  return f;
}

export function cobro(id, facturaNumero, fechaCobro, monto, medio = 'transferencia') {
  return { id, facturaNumero, fechaCobro, monto, medio };
}

export function notaCredito(numero, facturaNumero, fecha, valor, motivo = 'ajuste') {
  return { numero, facturaNumero, fecha, valor, motivo };
}

export function run(ds, opciones = {}) {
  return computeTodo(ds, { hoy: HOY, ...opciones });
}

export function ledger(res, periodo, vendedorId = 'V1') {
  const p = res.periodos[periodo];
  if (!p) throw new Error(`Sin período ${periodo}`);
  const l = p.vendedores[vendedorId];
  if (!l) throw new Error(`Sin ledger ${vendedorId} en ${periodo}`);
  return l;
}

export function linea(l, codigo) {
  return l.lineas.find((x) => x.codigo === codigo);
}

export function fila(l, numero) {
  return l.facturas.find((r) => r.numero === numero);
}

export function alertas(res, codigo, periodo) {
  return res.alertas.filter((a) => a.codigo === codigo && (!periodo || a.periodo === periodo));
}

/** PRNG determinista (mulberry32). */
export function prng(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sumarDiasISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dataset aleatorio determinista para pruebas de conciliación y rendimiento. */
export function datasetAleatorio({ semilla = 7, vendedores = 4, clientes = 40, facturas = 300, desde = '2026-01-01', meses = 8, cobrosMax = 2, pctNC = 0.05, pctAnulada = 0.01 } = {}) {
  const r = prng(semilla);
  const ds = datasetBase();
  ds.vendedores = [];
  ds.clientes = [];
  ds.agencias = [
    { id: 'AG1', nombre: 'Agencia 10', pctAgencia: 0.1 },
    { id: 'AG2', nombre: 'Agencia 15', pctAgencia: 0.15 },
    { id: 'AG3', nombre: 'Agencia 20', pctAgencia: 0.2 },
  ];
  for (let i = 1; i <= vendedores; i++) ds.vendedores.push({ id: `V${i}`, nombre: `Vendedor ${i}`, iniciales: `V${i}`, zona: 'Quito', cargo: 'Ejecutivo', activo: true, cuotas: cuotas(30000 + i * 5000) });
  for (let i = 1; i <= clientes; i++) {
    const agencia = r() < 0.45;
    ds.clientes.push({
      id: `C${i}`,
      nombre: `Cliente ${i}`,
      canal: agencia ? 'agencia' : 'directo',
      agenciaId: agencia ? `AG${1 + Math.floor(r() * 3)}` : undefined,
      vendedorId: `V${1 + (i % vendedores)}`,
      fechaAlta: i % 9 === 0 ? sumarDiasISO(desde, Math.floor(r() * meses * 30)) : '2025-03-01',
    });
  }
  const lineas = ['vallas', 'led', 'retail'];
  for (let i = 1; i <= facturas; i++) {
    const c = ds.clientes[Math.floor(r() * clientes)];
    const dia = Math.floor(r() * meses * 30);
    const fecha = sumarDiasISO(desde, dia);
    const valor = Math.round((500 + r() * 15000) * 100) / 100;
    const f = { numero: `F-${String(i).padStart(5, '0')}`, fechaEmision: fecha, vendedorId: c.vendedorId, clienteId: c.id, linea: lineas[Math.floor(r() * 3)], canal: c.canal, valorFacturado: valor };
    if (r() < pctAnulada) f.fechaAnulacion = sumarDiasISO(fecha, 5 + Math.floor(r() * 60));
    ds.facturas.push(f);
    const n = Math.floor(r() * (cobrosMax + 1));
    let restante = valor;
    for (let k = 0; k < n && restante > 0; k++) {
      const lag = Math.floor(r() * 200);
      const parcial = k < n - 1 && r() < 0.3 ? Math.round(restante * (0.2 + r() * 0.5) * 100) / 100 : restante;
      ds.cobros.push({ id: `CB-${i}-${k}`, facturaNumero: f.numero, fechaCobro: sumarDiasISO(fecha, lag), monto: parcial, medio: 'transferencia' });
      restante = Math.round((restante - parcial) * 100) / 100;
    }
    if (r() < pctNC) ds.notasCredito.push({ numero: `NC-${i}`, facturaNumero: f.numero, fecha: sumarDiasISO(fecha, Math.floor(r() * 120)), valor: Math.round(valor * (0.05 + r() * 0.5) * 100) / 100, motivo: 'descuento' });
  }
  return ds;
}
