/**
 * Ledger paso a paso: nueve líneas con código de regla, fórmula con valores y detalle desplegable por factura.
 * @module ui/componentes/ledger
 */
import { h, tabla, badge } from '../dom.js';
import { usd, moneda, monedaSigno, pct, pctCelda, fecha, dias, nombreLinea, nombreCanal, ESTADO_FACTURA } from '../format.js';
import { nombreCliente } from '../estado.js';

export const COLUMNAS_FACTURA = [
  { clave: 'numero', titulo: 'Factura', formato: (v, f) => h('span', { class: 'mono' }, v, f.extemporanea ? badge('extemporánea', 'badge-advertencia') : null) },
  { clave: 'clienteId', titulo: 'Cliente', formato: (v) => nombreCliente(v) },
  { clave: 'fechaEmision', titulo: 'Emisión', formato: (v) => fecha(v) },
  { clave: 'linea', titulo: 'Línea', formato: (v) => nombreLinea(v) },
  { clave: 'canal', titulo: 'Canal', formato: (v) => nombreCanal(v) },
  { clave: 'valorNeto', titulo: 'Valor neto', num: true, formato: (v) => moneda(v) },
  { clave: 'pctAgencia', titulo: '% agencia', num: true, formato: (v) => pct(v, 0) },
  { clave: 'base', titulo: 'Base', num: true, formato: (v) => moneda(v) },
  { clave: 'pct', titulo: '% com.', num: true, formato: (v) => pctCelda(v) },
  { clave: 'devengado', titulo: 'Devengado', num: true, formato: (v) => moneda(v) },
  { clave: 'cobrado', titulo: 'Cobrado', num: true, formato: (v) => moneda(v) },
  { clave: 'dias', titulo: 'Días', num: true, tituloLargo: 'Días desde la emisión a la fecha de evaluación' },
  { clave: 'ultimoCobro', titulo: 'Factor', num: true, formato: (v) => (v ? pct(v.factor, 0) : '—'), ordenar: (f) => f.ultimoCobro?.factor ?? -1 },
  { clave: 'liberadoPeriodo', titulo: 'Liberado', num: true, formato: (v) => monedaSigno(v) },
  { clave: 'retenido', titulo: 'Retenido', num: true, formato: (v) => moneda(v) },
  { clave: 'estado', titulo: 'Estado', formato: (v) => badge(ESTADO_FACTURA[v] || v, v === 'caducada' || v === 'anulada' ? 'badge-critico' : v === 'cobrada' ? 'badge-ok' : 'badge-neutro') },
];

export function tablaFacturas(filas, extra = {}) {
  return tabla({ columnas: COLUMNAS_FACTURA, filas, compacta: true, ordenInicial: { clave: 'fechaEmision', desc: false }, ...extra });
}

function detalleLinea(led, linea) {
  const v = linea.valores || {};
  switch (linea.codigo) {
    case 'L1':
      return tabla({
        compacta: true,
        columnas: [
          { clave: 'linea', titulo: 'Línea', formato: (x) => nombreLinea(x) },
          { clave: 'canal', titulo: 'Canal', formato: (x) => nombreCanal(x) },
          { clave: 'facturas', titulo: 'Facturas', num: true },
          { clave: 'facturado', titulo: 'Valor neto', num: true, formato: (x) => moneda(x) },
          { clave: 'comisionAgencia', titulo: 'Comisión agencia', num: true, formato: (x) => moneda(x) },
          { clave: 'base', titulo: 'Base comisionable', num: true, formato: (x) => moneda(x) },
        ],
        filas: linea.detalle,
        totales: { linea: 'Total', facturas: v.facturas, facturado: v.valorNeto, comisionAgencia: v.comisionAgencia, base: v.base },
      });
    case 'L2':
      return h('div', null,
        h('p', { class: 'ayuda' }, `Criterio: ${v.criterio === 'facturacion' ? 'facturación absoluta del mes' : 'cumplimiento de cuota'} · cuota ${v.cuota != null ? usd(v.cuota) : '—'}${v.cuotaOrigen === 'anterior' ? ` (tomada de ${v.cuotaPeriodoOrigen})` : ''} · base del mes ${usd(v.baseMes)} · tramo «${v.tramoNombre}»${v.siguienteNombre ? ` · faltan ${usd(v.faltaBase)} de base para «${v.siguienteNombre}»` : ''}`),
        tabla({
          compacta: true,
          columnas: [
            { clave: 'linea', titulo: 'Línea', formato: (x) => nombreLinea(x) },
            { clave: 'canal', titulo: 'Canal', formato: (x) => nombreCanal(x) },
            { clave: 'base', titulo: 'Base', num: true, formato: (x) => moneda(x) },
            { clave: 'pct', titulo: '% celda', num: true, formato: (x) => pctCelda(x) },
            { clave: 'devengado', titulo: 'Devengado', num: true, formato: (x) => moneda(x) },
          ],
          filas: linea.detalle,
          totales: { linea: 'Total', base: v.baseMes, devengado: v.devengado },
        })
      );
    case 'L3': {
      const b = linea.detalle || {};
      return h('div', null,
        h('p', null, `Bono mix: ${b.mix?.activo ? `${b.mix.aplica ? 'aplica' : 'no aplica'} · Retail Media ${pct(b.mix.participacionRetail)} de la base frente al umbral ${pct(b.mix.umbral, 0)} · ${pct(b.mix.pct, 0)} sobre ${usd(b.mix.baseDevengado)} = ${usd(b.mix.monto)}` : 'desactivado'}.`),
        h('p', null, `Bono cliente nuevo: ${b.clienteNuevo?.activo ? `${b.clienteNuevo.cantidad} activado${b.clienteNuevo.cantidad === 1 ? '' : 's'}, ${b.clienteNuevo.reconocidos} reconocido${b.clienteNuevo.reconocidos === 1 ? '' : 's'} (máximo ${b.clienteNuevo.maximo}) × ${usd(b.clienteNuevo.montoUnitario)} = ${usd(b.clienteNuevo.monto)}${b.clienteNuevo.clientes?.length ? ` · ${b.clienteNuevo.clientes.map((c) => nombreCliente(c)).join(', ')}` : ''}` : 'desactivado'}.`)
      );
    }
    case 'L4':
    case 'L5': {
      const extra = linea.codigo === 'L5' ? h('p', { class: 'ayuda' }, `Facturas ${moneda(v.facturas)} · bonos ${moneda(v.bonos)} · reversión por cambio de política ${monedaSigno(v.reversion)} · extemporáneo ${moneda(v.extemporaneo)}`) : h('p', { class: 'ayuda' }, `Facturas ${moneda(v.facturas)} · bonos del período liberados ${moneda(v.bonos)}`);
      return h('div', null, extra, linea.detalle.length ? tablaFacturas(linea.detalle) : h('p', { class: 'silencioso' }, 'Sin liberaciones en este período.'));
    }
    case 'L6': {
      const d = linea.detalle || {};
      return h('div', null,
        h('p', { class: 'ayuda' }, `Retenido en facturas ${moneda(v.retenidoFacturas)} · retenido en bonos ${moneda(v.retenidoBonos)} · caducado en el período ${moneda(v.caducadoPeriodo)} · no liberado por rezago ${moneda(v.rezagoPeriodo)}`),
        d.caducadas?.length ? h('h3', null, 'Caducadas en el período') : null,
        d.caducadas?.length ? tablaFacturas(d.caducadas) : null,
        d.retenidas?.length ? h('h3', { style: { marginTop: '10px' } }, 'Retenidas pendientes de cobro') : null,
        d.retenidas?.length ? tablaFacturas(d.retenidas, { ordenInicial: { clave: 'dias', desc: true } }) : h('p', { class: 'silencioso' }, 'Sin comisiones retenidas.')
      );
    }
    case 'L7':
      return h('div', null,
        h('p', { class: 'ayuda' }, `Clawback en facturas ${moneda(v.clawbackFacturas)} · clawback en bonos ${moneda(v.clawbackBonos)} · saldo negativo del período anterior ${moneda(v.saldoAnterior)}`),
        linea.detalle.length
          ? tabla({ compacta: true, columnas: [{ clave: 'numero', titulo: 'Factura' }, { clave: 'clienteId', titulo: 'Cliente', formato: (x) => nombreCliente(x) }, { clave: 'periodoEmision', titulo: 'Período de emisión' }, { clave: 'notasCredito', titulo: 'NC aplicadas', num: true, formato: (x) => moneda(x) }, { clave: 'liberadoAcumulado', titulo: 'Liberado acumulado', num: true, formato: (x) => moneda(x) }, { clave: 'clawback', titulo: 'Clawback', num: true, formato: (x) => moneda(x) }], filas: linea.detalle })
          : h('p', { class: 'silencioso' }, 'Sin clawback en este período.')
      );
    case 'L8':
      return linea.detalle.length
        ? tabla({ compacta: true, columnas: [{ clave: 'fecha', titulo: 'Fecha', formato: (x) => fecha(x) }, { clave: 'autor', titulo: 'Autor' }, { clave: 'motivo', titulo: 'Motivo' }, { clave: 'monto', titulo: 'Monto', num: true, formato: (x) => monedaSigno(x) }], filas: linea.detalle })
        : h('p', { class: 'silencioso' }, 'Sin ajustes manuales.');
    case 'L9':
      return h('div', { class: 'comparativo' },
        h('span', { class: 'cab' }, 'Neto antes de tope'), h('span', { class: 'num' }, usd(v.netoAntesTope)), h('span'), h('span'),
        h('span', { class: 'cab' }, 'Tope mensual'), h('span', { class: 'num' }, v.topeActivo ? usd(v.tope) : 'sin tope'), h('span'), h('span'),
        h('span', { class: 'cab' }, 'Excedente pendiente de diferimiento'), h('span', { class: 'num' }, usd(v.excedente)), h('span'), h('span'),
        h('span', { class: 'cab' }, 'Saldo negativo al período siguiente'), h('span', { class: 'num' }, usd(v.saldoSiguiente)), h('span'), h('span')
      );
    default:
      return null;
  }
}

/** Construye la tabla del ledger. `abiertas` es un Set de códigos desplegados (persistente entre renders). */
export function ledger(led, { abiertas = new Set() } = {}) {
  const t = h('table', { class: 'ledger' });
  t.append(h('thead', null, h('tr', null, h('th', null, 'Regla'), h('th', null, 'Concepto y fórmula'), h('th', { class: 'num' }, 'Monto'))));
  const tb = h('tbody');
  for (const l of led.lineas) {
    const esTotal = l.codigo === 'L9';
    const fila = h('tr', { class: `ledger-fila ${esTotal ? 'ledger-total' : ''}`, tabindex: 0, 'aria-expanded': abiertas.has(l.codigo) ? 'true' : 'false' },
      h('td', { class: 'ledger-codigo' }, h('span', { class: 'ledger-flecha' }, abiertas.has(l.codigo) ? '▾' : '▸'), l.codigo, h('span', { class: 'regla' }, l.regla)),
      h('td', null, h('div', { class: 'ledger-titulo' }, esTotal ? 'Comisión liquidable' : l.titulo), h('div', { class: 'ledger-formula' }, l.formula)),
      h('td', { class: `ledger-monto ${l.informativa ? 'informativa' : ''}` }, l.informativa ? moneda(l.monto) : monedaSigno(l.monto))
    );
    const det = h('tr', { class: `ledger-detalle ${abiertas.has(l.codigo) ? '' : 'oculto'}` }, h('td', { colspan: 3 }));
    const alternar = () => {
      const abierto = !abiertas.has(l.codigo);
      if (abierto) {
        abiertas.add(l.codigo);
        if (!det.firstChild.firstChild) det.firstChild.append(detalleLinea(led, l) || h('span', { class: 'silencioso' }, 'Sin detalle'));
      } else abiertas.delete(l.codigo);
      det.classList.toggle('oculto', !abierto);
      fila.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      fila.querySelector('.ledger-flecha').textContent = abierto ? '▾' : '▸';
    };
    fila.addEventListener('click', alternar);
    fila.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        alternar();
      }
    });
    if (abiertas.has(l.codigo)) det.firstChild.append(detalleLinea(led, l) || '');
    tb.append(fila, det);
  }
  t.append(tb);
  return t;
}
