/**
 * Generador determinista del dataset de demostración (D-13). Semilla fija; la narrativa del cierre de agosto 2026
 * (Carolina sobre el tope, Diego bajo el umbral con NC posterior, Sebastián con retención y caducidades,
 * Juan Pablo a 0,5 puntos del Acelerador, María con clawback por NC de USD 2.200) se impone con casos guionizados
 * sobre el ruido base. Los períodos enero a julio se aprueban con el propio motor.
 * @module seed/demo
 */
import { computeTodo } from '../engine/index.js';
import { aCentavos, deCentavos, redondear } from '../engine/money.js';
import { sumarDias, ultimoDiaMes, fechaCorte, rangoPeriodos } from '../engine/dates.js';
import { CONTROL, ETIQUETA_DEMO, AUTOR_DEMO, esquemaDemo, politicasDemo, vendedoresDemo, agenciasDemo, clientesDemo } from './defaults.js';

export const SEMILLA_DEMO = 20260914;
export const HOY_DEMO = '2026-09-14';

/** PRNG mulberry32. */
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

function normal(r) {
  const u1 = Math.max(r(), 1e-12);
  const u2 = r();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function elegir(r, pesos) {
  const total = Object.values(pesos).reduce((s, x) => s + x, 0);
  let acc = r() * total;
  for (const [k, w] of Object.entries(pesos)) {
    acc -= w;
    if (acc <= 0) return k;
  }
  return Object.keys(pesos)[0];
}

const MIX_ESTANDAR = { vallas: 0.55, led: 0.3, retail: 0.15 };

/** Perfiles ficticios por vendedor: cumplimiento medio, dispersión, mix de líneas y rezago de cobro. */
const PERFILES = {
  V01: { media: 1.08, sd: 0.07, mix: MIX_ESTANDAR, lag: 60, meses: { '2026-08': 1.05 } },
  V02: { media: 0.96, sd: 0.08, mix: MIX_ESTANDAR, lag: 60, meses: { '2026-08': 0.93 } },
  V03: { media: 1.02, sd: 0.07, mix: { vallas: 0.45, led: 0.4, retail: 0.15 }, lag: 60, meses: { '2026-08': 1.12 } },
  V04: { media: 0.86, sd: 0.08, mix: MIX_ESTANDAR, lag: 25, meses: { '2026-07': 1.05, '2026-08': 0.64 } },
  V05: { media: 0.92, sd: 0.08, mix: MIX_ESTANDAR, lag: 60, meses: { '2026-08': 0.88 } },
  V06: { media: 1.0, sd: 0.06, mix: MIX_ESTANDAR, lag: 60, meses: { '2026-08': 0.995 }, exacto: ['2026-08'] },
  V07: { media: 1.35, sd: 0.15, mix: { vallas: 0.17, led: 0.25, retail: 0.58 }, lag: 28, meses: { '2026-08': 2.4 } },
  V08: { media: 0.85, sd: 0.08, mix: MIX_ESTANDAR, lag: 60, lagDesde: { periodo: '2026-05', lag: 100 }, meses: { '2026-04': 0.92, '2026-05': 0.88, '2026-06': 0.9, '2026-08': 0.78 } },
};

/** Facturas guionizadas (base en USD; canal y cliente fijos). `sinCobro` deja la factura pendiente para caducar o retener. */
const GUION = [
  // María: cobrada rápido en julio (período aprobado) y NC de USD 2.200 en agosto ⇒ clawback
  { vendedorId: 'V01', periodo: '2026-07', dia: 8, clienteId: 'C02', linea: 'vallas', valor: 14000, cobroDias: 12, nc: { fecha: '2026-08-12', valor: 2200, motivo: 'Diferencia en pauta facturada (ajuste comercial)' } },
  // Diego: factura grande cobrada en julio y NC posterior en agosto ⇒ saldo negativo con cumplimiento bajo el umbral
  { vendedorId: 'V04', periodo: '2026-07', dia: 6, clienteId: 'C16', linea: 'vallas', valor: 28000, cobroDias: 10, nc: { fecha: '2026-08-14', valor: 24500, motivo: 'Anulación parcial de campaña por cambio de alcance' } },
  // Sebastián: tres facturas sin cobro que caducan en agosto (más de 120 días al 31-ago)
  { vendedorId: 'V08', periodo: '2026-04', dia: 6, clienteId: 'C28', linea: 'vallas', valor: 6200, sinCobro: true },
  { vendedorId: 'V08', periodo: '2026-04', dia: 20, clienteId: 'C30', linea: 'led', valor: 5400, sinCobro: true },
  { vendedorId: 'V08', periodo: '2026-05', dia: 1, clienteId: 'C29', linea: 'vallas', valor: 7300, sinCobro: true },
  // Sebastián: tres facturas retenidas próximas a caducar al 14-sep-2026
  { vendedorId: 'V08', periodo: '2026-05', dia: 20, clienteId: 'C28', linea: 'vallas', valor: 6800, sinCobro: true },
  { vendedorId: 'V08', periodo: '2026-05', dia: 28, clienteId: 'C30', linea: 'retail', valor: 4900, sinCobro: true },
  { vendedorId: 'V08', periodo: '2026-06', dia: 5, clienteId: 'C29', linea: 'led', valor: 5100, sinCobro: true },
  // Carolina: clientes nuevos activados en agosto (bono cliente nuevo) y cobro rápido
  { vendedorId: 'V07', periodo: '2026-08', dia: 4, clienteId: 'C31', linea: 'retail', valor: 9000, cobroDias: 12 },
  { vendedorId: 'V07', periodo: '2026-08', dia: 11, clienteId: 'C32', linea: 'retail', valor: 11000, cobroDias: 9 },
];

/**
 * Genera el dataset de demostración.
 * @param {{hoy?:string, semilla?:number, aprobarHasta?:string}} opciones
 * @returns {{dataset:object, bitacora:object[], meta:object}}
 */
export function generarDatosDemo({ hoy = HOY_DEMO, semilla = SEMILLA_DEMO, aprobarHasta = '2026-07' } = {}) {
  const r = prng(semilla);
  const vendedores = vendedoresDemo();
  const agencias = agenciasDemo();
  const clientes = clientesDemo();
  const agenciasPorId = new Map(agencias.map((a) => [a.id, a]));
  const clientesPorVendedor = new Map();
  for (const c of clientes) {
    if (!clientesPorVendedor.has(c.vendedorId)) clientesPorVendedor.set(c.vendedorId, []);
    clientesPorVendedor.get(c.vendedorId).push(c);
  }
  const pctDe = (c) => (c.canal === 'agencia' ? agenciasPorId.get(c.agenciaId)?.pctAgencia ?? 0 : 0);

  const periodos = rangoPeriodos('2026-01', hoy.slice(0, 7));
  const facturas = [];
  const cobros = [];
  const notasCredito = [];
  const guionPorClave = new Map();
  for (const g of GUION) {
    const k = `${g.vendedorId}|${g.periodo}`;
    if (!guionPorClave.has(k)) guionPorClave.set(k, []);
    guionPorClave.get(k).push(g);
  }

  for (const v of vendedores) {
    const perfil = PERFILES[v.id];
    const cartera = clientesPorVendedor.get(v.id).filter((c) => c.fechaAlta <= hoy);
    for (const p of periodos) {
      const [anio, mes] = p.split('-').map(Number);
      const enCurso = p === hoy.slice(0, 7);
      const ultimoDia = enCurso ? Math.max(1, Number(hoy.slice(8, 10)) - 2) : ultimoDiaMes(anio, mes);
      const cuota = v.cuotas.find((c) => c.periodo === p)?.monto ?? 0;
      let cumplimiento = perfil.meses?.[p] ?? Math.max(0.35, perfil.media + perfil.sd * normal(r));
      if (enCurso) cumplimiento *= ultimoDia / ultimoDiaMes(anio, mes);
      const objetivo = aCentavos(cuota * cumplimiento);
      const guion = (guionPorClave.get(`${v.id}|${p}`) || []).filter((g) => !enCurso);
      const baseGuion = guion.reduce((s, g) => s + redondear(aCentavos(g.valor) * (1 - pctDe(clientes.find((c) => c.id === g.clienteId)))), 0);
      const restante = Math.max(objetivo - baseGuion, aCentavos(500));
      const n = enCurso ? 2 + Math.floor(r() * 2) : Math.max(3, 6 + Math.floor(r() * 3) - guion.length);
      const pesos = Array.from({ length: n }, () => 0.5 + r());
      const sumaPesos = pesos.reduce((s, x) => s + x, 0);
      const exacto = perfil.exacto?.includes(p);
      const lineasMes = lineasEstratificadas(r, perfil.mix, n);
      const generadas = [];
      let acumBase = baseGuion;
      for (let i = 0; i < n; i++) {
        const esUltima = i === n - 1;
        let cliente = cartera.filter((c) => c.fechaAlta.slice(0, 7) <= p)[Math.floor(r() * cartera.filter((c) => c.fechaAlta.slice(0, 7) <= p).length)] || cartera[0];
        if (exacto && esUltima) cliente = cartera.find((c) => c.canal === 'directo') || cliente;
        const pct = pctDe(cliente);
        let base = redondear((restante * pesos[i]) / sumaPesos);
        if (exacto && esUltima) base = objetivo - acumBase;
        acumBase += base;
        const valor = pct > 0 ? redondear(base / (1 - pct)) : base;
        const dia = 1 + Math.floor(r() * ultimoDia);
        generadas.push({ vendedorId: v.id, clienteId: cliente.id, linea: lineasMes[i], canal: cliente.canal, pctAgencia: pct, valorCents: valor, fechaEmision: `${p}-${String(dia).padStart(2, '0')}`, lagMediana: lagPara(perfil, p), fast: perfil.lag <= 30 });
      }
      for (const g of guion) {
        const cliente = clientes.find((c) => c.id === g.clienteId);
        generadas.push({ vendedorId: v.id, clienteId: cliente.id, linea: g.linea, canal: cliente.canal, pctAgencia: pctDe(cliente), valorCents: aCentavos(g.valor), fechaEmision: `${p}-${String(g.dia).padStart(2, '0')}`, guion: g });
      }
      for (const f of generadas) facturas.push(f);
    }
  }

  facturas.sort((a, b) => (a.fechaEmision < b.fechaEmision ? -1 : a.fechaEmision > b.fechaEmision ? 1 : a.vendedorId < b.vendedorId ? -1 : 1));
  facturas.forEach((f, i) => {
    f.numero = `001-001-${String(i + 1).padStart(9, '0')}`;
  });

  // Cobros con rezago log-normal (mediana ≈ 45 días, cola larga), pagos parciales ≈ 15 %, medios de pago
  let idCobro = 0;
  const medio = () => elegir(r, { transferencia: 0.72, cheque: 0.2, tarjeta: 0.08 });
  for (const f of facturas) {
    const g = f.guion;
    if (g?.sinCobro) continue;
    if (g?.cobroDias != null) {
      const fecha = sumarDias(f.fechaEmision, g.cobroDias);
      if (fecha <= hoy) cobros.push({ id: `CB-${String(++idCobro).padStart(6, '0')}`, facturaNumero: f.numero, fechaCobro: fecha, monto: deCentavos(f.valorCents), medio: 'transferencia' });
      continue;
    }
    const mediana = f.lagMediana ?? 45;
    const sigma = mediana >= 90 ? 0.45 : 0.6;
    let lag = Math.round(Math.exp(Math.log(mediana) + sigma * normal(r)));
    lag = Math.max(3, Math.min(230, lag));
    if (f.vendedorId === 'V04' && f.fechaEmision >= '2026-08-01' && f.fechaEmision < '2026-09-01') lag = Math.max(lag, 40);
    if (f.vendedorId === 'V07' && f.fechaEmision >= '2026-08-01' && f.fechaEmision < '2026-09-01') lag = Math.min(lag, 18);
    const parcial = r() < 0.19;
    if (parcial) {
      const frac = 0.3 + r() * 0.3;
      const monto1 = redondear(f.valorCents * frac);
      const fecha1 = sumarDias(f.fechaEmision, Math.max(2, Math.round(lag * 0.6)));
      const fecha2 = sumarDias(f.fechaEmision, lag);
      if (fecha1 <= hoy) cobros.push({ id: `CB-${String(++idCobro).padStart(6, '0')}`, facturaNumero: f.numero, fechaCobro: fecha1, monto: deCentavos(monto1), medio: medio() });
      if (fecha2 <= hoy) cobros.push({ id: `CB-${String(++idCobro).padStart(6, '0')}`, facturaNumero: f.numero, fechaCobro: fecha2, monto: deCentavos(f.valorCents - monto1), medio: medio() });
    } else {
      const fecha = sumarDias(f.fechaEmision, lag);
      if (fecha <= hoy) cobros.push({ id: `CB-${String(++idCobro).padStart(6, '0')}`, facturaNumero: f.numero, fechaCobro: fecha, monto: deCentavos(f.valorCents), medio: medio() });
    }
  }

  // Notas de crédito ≈ 2 % más las guionizadas
  let idNC = 0;
  const motivos = ['Descuento comercial posterior', 'Error en tarifa facturada', 'Días no exhibidos', 'Cambio de formato acordado'];
  for (const f of facturas) {
    const g = f.guion;
    if (g?.nc) {
      notasCredito.push({ numero: `NC-001-001-${String(++idNC).padStart(7, '0')}`, facturaNumero: f.numero, fecha: g.nc.fecha, valor: g.nc.valor, motivo: g.nc.motivo });
      continue;
    }
    if (g) continue;
    if (r() < 0.02) {
      const fecha = sumarDias(f.fechaEmision, 10 + Math.floor(r() * 50));
      if (fecha > hoy) continue;
      const valor = deCentavos(redondear(f.valorCents * (0.05 + r() * 0.25)));
      notasCredito.push({ numero: `NC-001-001-${String(++idNC).padStart(7, '0')}`, facturaNumero: f.numero, fecha, valor, motivo: motivos[Math.floor(r() * motivos.length)] });
    }
  }

  const dataset = {
    vendedores,
    agencias,
    clientes,
    facturas: facturas.map((f) => ({ numero: f.numero, fechaEmision: f.fechaEmision, vendedorId: f.vendedorId, clienteId: f.clienteId, linea: f.linea, canal: f.canal, valorFacturado: deCentavos(f.valorCents), pctAgencia: f.pctAgencia })),
    cobros,
    notasCredito,
    ajustes: [],
    esquemas: [esquemaDemo()],
    politicas: politicasDemo(),
    cierres: {},
    liquidaciones: [],
    control: { ...CONTROL },
  };

  // Aprobación de períodos con el propio motor (D-09): cada cierre se calcula con `hoy` = fecha de aprobación
  const bitacora = [];
  const registrar = (fechaHora, usuario, accion, entidad, detalle) => bitacora.push({ fechaHora, usuario, accion, entidad, detalle });
  registrar(`${hoy}T08:00:00`, 'Finanzas', 'Carga de datos de demostración', 'Datos', `${facturas.length} facturas, ${cobros.length} cobros, ${notasCredito.length} notas de crédito · ${ETIQUETA_DEMO}`);
  registrar('2026-01-01T09:00:00', AUTOR_DEMO, 'Creación de versión', 'EsquemaComisiones', 'v1.0 vigente desde 01-ene-2026');
  registrar('2025-01-01T09:00:00', AUTOR_DEMO, 'Creación de versión', 'PoliticaCobranza', 'v1.0 vigente desde 01-ene-2025 (anterior)');
  registrar('2026-01-01T09:05:00', AUTOR_DEMO, 'Creación de versión', 'PoliticaCobranza', 'v2.0 vigente desde 01-ene-2026 (actualizada)');
  for (const p of rangoPeriodos('2026-01', aprobarHasta)) {
    const fechaAprobacion = sumarDias(fechaCorte(p), 5);
    const res = computeTodo(dataset, { hoy: fechaAprobacion, hastaPeriodo: p });
    dataset.cierres[p] = { periodo: p, fecha: fechaAprobacion, autor: 'Gerencia Financiera', motivo: null, snapshot: res.periodos[p] };
    for (const v of vendedores) dataset.liquidaciones.push({ periodo: p, vendedorId: v.id, estado: 'en_rol', fechaEstado: fechaAprobacion, usuario: 'Gerencia Financiera' });
    registrar(`${fechaAprobacion}T10:00:00`, 'Gerencia Financiera', 'Aprobación de período', 'Liquidacion', `Período ${p} aprobado y bloqueado · rol generado`);
  }
  const abiertos = rangoPeriodos(sumarDias(fechaCorte(aprobarHasta), 1).slice(0, 7), hoy.slice(0, 7));
  for (const p of abiertos) for (const v of vendedores) dataset.liquidaciones.push({ periodo: p, vendedorId: v.id, estado: 'calculada', fechaEstado: hoy, usuario: 'Finanzas' });

  return { dataset, bitacora, meta: { semilla, hoy, etiqueta: ETIQUETA_DEMO, aprobadoHasta: aprobarHasta, facturas: facturas.length, cobros: cobros.length, notasCredito: notasCredito.length } };
}

function lagPara(perfil, periodo) {
  if (perfil.lagDesde && periodo >= perfil.lagDesde.periodo) return perfil.lagDesde.lag;
  return perfil.lag;
}

/** Reparte n facturas entre líneas en proporción al mix (mayor resto) y baraja el orden. */
function lineasEstratificadas(r, mix, n) {
  const entradas = Object.entries(mix);
  const exactos = entradas.map(([l, w]) => [l, (w * n) / entradas.reduce((s, [, x]) => s + x, 0)]);
  const conteo = exactos.map(([l, x]) => [l, Math.floor(x), x - Math.floor(x)]);
  let faltan = n - conteo.reduce((s, [, c]) => s + c, 0);
  for (const fila of [...conteo].sort((a, b) => b[2] - a[2])) {
    if (faltan <= 0) break;
    fila[1] += 1;
    faltan -= 1;
  }
  const lista = [];
  for (const [l, c] of conteo) for (let i = 0; i < c; i++) lista.push(l);
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

