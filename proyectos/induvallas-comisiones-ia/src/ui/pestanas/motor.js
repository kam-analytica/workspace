/**
 * Pestaña Motor de cálculo: gauge, ledger paso a paso, cascada, detalle por factura, simulador y explicación.
 * @module ui/pestanas/motor
 */
import { h, limpiar, tarjeta, select, campo, badge, vacio, poner } from '../dom.js';
import { usd, moneda, monedaSigno, pct, periodoLargo } from '../format.js';
import { estado, on, vendedores, nombreVendedor, resultadoPeriodo, seleccionarVendedor, esquemaVigente } from '../estado.js';
import { gauge } from '../componentes/gauge.js';
import { ledger, tablaFacturas } from '../componentes/ledger.js';
import { cascada, barras, PALETA } from '../componentes/graficos.js';
import { explicarLedger } from '../explicar.js';
import { simularVendedor } from '../simulador.js';

const abiertas = new Set(['L9']);
let refs = null;
let graficoCascada = null;
let graficoSim = null;
let simParams = { facturacionAdicional: 0, cobranza60: null, pctAgencia: null, participacionRetail: null };
let temporizador = null;

function pasosCascada(t) {
  const liberado = t.liberadoPeriodo + t.liberadoCartera;
  const pasos = [];
  let nivel = 0;
  pasos.push({ etiqueta: 'Devengado del período', desde: 0, hasta: t.devengado, tipo: 'total' });
  nivel = t.devengado;
  if (t.bonos) {
    pasos.push({ etiqueta: 'Bonos', desde: nivel, hasta: nivel + t.bonos, tipo: 'mas' });
    nivel += t.bonos;
  }
  const noLiberado = nivel - t.liberadoPeriodo;
  pasos.push({ etiqueta: 'Retenido y no liberado del mes', desde: nivel, hasta: nivel - noLiberado, tipo: 'menos' });
  nivel -= noLiberado;
  pasos.push({ etiqueta: 'Liberado de cartera', desde: nivel, hasta: nivel + t.liberadoCartera, tipo: 'mas' });
  nivel += t.liberadoCartera;
  if (t.clawback || t.saldoAnterior) {
    pasos.push({ etiqueta: 'Clawback y saldo anterior', desde: nivel, hasta: nivel - t.clawback - t.saldoAnterior, tipo: 'menos' });
    nivel -= t.clawback + t.saldoAnterior;
  }
  if (t.ajustes) {
    pasos.push({ etiqueta: 'Ajustes manuales', desde: nivel, hasta: nivel + t.ajustes, tipo: t.ajustes > 0 ? 'mas' : 'menos' });
    nivel += t.ajustes;
  }
  pasos.push({ etiqueta: 'Neto antes de tope', desde: 0, hasta: t.netoAntesTope, tipo: 'total' });
  if (t.excedente) pasos.push({ etiqueta: 'Excedente sobre tope', desde: t.netoAntesTope, hasta: t.netoAntesTope - t.excedente, tipo: 'menos' });
  pasos.push({ etiqueta: 'Comisión liquidable', desde: 0, hasta: t.liquidable, tipo: 'final' });
  return pasos;
}

function selectorVendedor() {
  const opciones = vendedores().map((v) => ({ valor: v.id, texto: `${v.nombre}${v.activo === false ? ' (inactivo)' : ''}` }));
  return select(opciones, estado.vendedorId, (id) => seleccionarVendedor(id), { 'aria-label': 'Vendedor' });
}

function renderSimulador() {
  const led = resultadoPeriodo()?.vendedores[estado.vendedorId];
  if (!led) return;
  const t0 = performance.now();
  const r = simularVendedor(estado.dataset, estado.periodo, estado.hoy, estado.vendedorId, simParams);
  const real = r.real;
  const sim = r.simulado;
  limpiar(refs.simResultado);
  if (!real || !sim) {
    poner(refs.simResultado, vacio('Sin datos para simular.'));
    return;
  }
  const fila = (nombre, a, b, fmt = usd) => [h('span', null, nombre), h('span', { class: 'num' }, fmt(a)), h('span', { class: 'num' }, fmt(b)), h('span', { class: `num ${b - a > 0 ? 'positivo' : b - a < 0 ? 'negativo' : 'silencioso'}` }, typeof a === 'number' && fmt === usd ? monedaSigno(b - a) : '')];
  poner(refs.simResultado, 
    h('div', { class: 'comparativo' },
      h('span', { class: 'cab' }, 'Concepto'), h('span', { class: 'cab num' }, 'Real'), h('span', { class: 'cab num' }, 'Simulado'), h('span', { class: 'cab num' }, 'Δ'),
      fila('Cumplimiento', real.cumplimiento, sim.cumplimiento, (v) => pct(v)),
      h('span', null, 'Tramo'), h('span', { class: 'num' }, real.tramoNombre), h('span', { class: 'num' }, sim.tramoNombre), h('span'),
      fila('Base comisionable', real.base, sim.base),
      fila('Devengado', real.devengado, sim.devengado),
      fila('Bonos', real.bonos, sim.bonos),
      fila('Liberado del período', real.liberadoPeriodo, sim.liberadoPeriodo),
      fila('Retenido', real.retenido, sim.retenido),
      fila('Neto antes de tope', real.netoAntesTope, sim.netoAntesTope),
      fila('Comisión liquidable', real.liquidable, sim.liquidable)
    ),
    h('p', { class: 'ayuda', style: { marginTop: '8px' } }, `Simulación sobre una copia de los datos del vendedor, sin cierres, en ${Math.round(performance.now() - t0)} ms. Nada se modifica.`)
  );
  const series = [
    { nombre: 'Real', datos: [real.devengado, real.liberadoPeriodo, real.liquidable], color: PALETA.azul },
    { nombre: 'Simulado', datos: [sim.devengado, sim.liberadoPeriodo, sim.liquidable], color: PALETA.mag },
  ];
  if (!graficoSim) {
    graficoSim = barras({ etiquetas: ['Devengado', 'Liberado del período', 'Liquidable'], series, alto: 200 });
    poner(refs.simGrafico, graficoSim.el);
  } else graficoSim.actualizar(['Devengado', 'Liberado del período', 'Liquidable'], series);
}

function deslizador(etiqueta, min, max, paso, valor, formato, onCambio) {
  const salida = h('span', { class: 'valor' }, formato(valor));
  const r = h('input', { type: 'range', class: 'deslizador', min, max, step: paso, value: valor, 'aria-label': etiqueta });
  r.addEventListener('input', () => {
    salida.textContent = formato(Number(r.value));
    clearTimeout(temporizador);
    temporizador = setTimeout(() => onCambio(Number(r.value)), 120);
  });
  return h('div', { class: 'simulador-fila' }, h('span', null, etiqueta), r, salida);
}

function actualizar() {
  if (!refs) return;
  const per = resultadoPeriodo();
  limpiar(refs.selector).append(selectorVendedor());
  const led = per?.vendedores[estado.vendedorId];
  limpiar(refs.gauge);
  limpiar(refs.ledger);
  limpiar(refs.facturas);
  limpiar(refs.explicacion);
  limpiar(refs.titulo);
  if (!led) {
    poner(refs.gauge, vacio('Sin liquidación para este vendedor en el período.'));
    return;
  }
  const t = led.tramo || {};
  const esquema = esquemaVigente();
  poner(refs.titulo, h('h2', null, `${nombreVendedor(led.vendedorId)} · ${periodoLargo(estado.periodo)}`), per.bloqueado ? badge('período aprobado', 'badge-bloqueado') : badge(per.enCurso ? 'período en curso' : 'período abierto', 'badge-info'));
  poner(refs.gauge, 
    gauge({ cumplimiento: t.sinMedida ? null : t.cumplimiento, tramos: esquema?.tramos || [], tramoId: t.tramoId, subtitulo: t.sinMedida ? 'Sin cuota cargada (A-09)' : `Cuota ${usd(t.cuota)} · base ${usd(t.baseMes)}` }),
    h('div', { class: 'cen', style: { marginTop: '6px' } }, badge(t.tramoNombre || '—', `badge-${t.tramoId || 't0'}`), t.siguienteNombre && t.faltaBase > 0 ? h('div', { class: 'ayuda', style: { marginTop: '4px' } }, `Faltan ${usd(t.faltaBase)} de base para «${t.siguienteNombre}» (${pct(t.siguienteDesde, 0)})`) : h('div', { class: 'ayuda', style: { marginTop: '4px' } }, t.siguienteNombre ? '' : 'Tramo máximo alcanzado'))
  );
  poner(refs.ledger, ledger(led, { abiertas }));
  const pasos = pasosCascada(led.totales);
  limpiar(refs.cascadaNota).append(`Base comisionable ${usd(led.totales.base)} × % del tramo = devengado ${usd(led.totales.devengado)}. La base no se grafica: es dos órdenes de magnitud mayor que la comisión (D-27).`);
  if (!graficoCascada) {
    graficoCascada = cascada({ pasos });
    poner(refs.cascada, graficoCascada.el);
  } else graficoCascada.actualizar(pasos);
  poner(refs.facturas, led.facturas.length ? tablaFacturas(led.facturas) : vacio('Sin facturas con movimiento en el período.'));
  const parrafos = explicarLedger(led, { nombre: nombreVendedor(led.vendedorId), periodo: estado.periodo, politicaVersion: led.facturas.find((r) => r.esDelPeriodo)?.politicaVersion, alertas: (estado.resultado.alertas || []).filter((a) => a.periodo === estado.periodo) });
  poner(refs.explicacion, parrafos.map((p) => h('p', null, p)));
  renderSimulador();
}

function montar(cont) {
  refs = {
    selector: h('div'),
    titulo: h('div', { class: 'tarjeta-cab', style: { marginBottom: 0 } }),
    gauge: h('div'),
    ledger: h('div'),
    cascada: h('div'),
    cascadaNota: h('p', { class: 'ayuda' }),
    facturas: h('div'),
    explicacion: h('div'),
    simResultado: h('div'),
    simGrafico: h('div'),
  };
  graficoCascada = null;
  graficoSim = null;
  const controles = h('div', null,
    deslizador('Facturación adicional (USD)', 0, 50000, 500, simParams.facturacionAdicional / 100, (v) => usd(v * 100), (v) => { simParams.facturacionAdicional = v * 100; renderSimulador(); }),
    deslizador('Cobranza a 60 días (% del mes)', 0, 100, 5, simParams.cobranza60 == null ? 0 : simParams.cobranza60 * 100, (v) => `${v} %`, (v) => { simParams.cobranza60 = v === 0 ? null : v / 100; renderSimulador(); }),
    deslizador('% de comisión de agencia', 0, 30, 1, simParams.pctAgencia == null ? 15 : simParams.pctAgencia * 100, (v) => `${v} %`, (v) => { simParams.pctAgencia = v / 100; renderSimulador(); }),
    deslizador('Participación de Retail Media', 0, 100, 5, simParams.participacionRetail == null ? 0 : simParams.participacionRetail * 100, (v) => `${v} %`, (v) => { simParams.participacionRetail = v === 0 ? null : v / 100; renderSimulador(); }),
    h('p', { class: 'ayuda' }, 'Cobranza a 60 días en 0 % y Retail Media en 0 % significan «sin cambio». El % de agencia se aplica solo a las facturas por agencia del período.')
  );
  poner(cont, 
    h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-cab' }, refs.titulo, h('div', { class: 'acciones' }, campo('Vendedor', refs.selector)))),
    h('div', { class: 'rejilla rejilla-13' },
      tarjeta('Cumplimiento y tramo', refs.gauge, { memorable: true }),
      tarjeta('Cascada de composición', [refs.cascadaNota, refs.cascada], { subtitulo: 'Devengado → liberado → neto → liquidable' })
    ),
    tarjeta('Ledger paso a paso', refs.ledger, { subtitulo: 'Cada línea cita su regla; haga clic para ver el detalle por factura' }),
    tarjeta('Detalle por factura', refs.facturas, { subtitulo: 'Facturas del período y de cartera con movimiento' }),
    h('div', { class: 'rejilla rejilla-2' },
      tarjeta('Simulador «¿qué pasa si…?»', [controles, refs.simGrafico, refs.simResultado], { subtitulo: 'No altera los datos reales' }),
      tarjeta('Explicación del cálculo', refs.explicacion, { subtitulo: 'Generada desde los datos, con citas a las reglas' })
    )
  );
  actualizar();
}

on('resultado', () => refs && estado.pestana === 'motor' && actualizar());
on('periodo', () => refs && estado.pestana === 'motor' && actualizar());
on('vendedor', () => refs && estado.pestana === 'motor' && actualizar());

export default { id: 'motor', titulo: 'Motor de cálculo', montar, actualizar, desmontar() { refs = null; graficoCascada = null; graficoSim = null; } };
