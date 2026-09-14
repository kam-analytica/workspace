/**
 * Exportaciones: rol del período y detalle por factura a Excel y CSV, cartera y alertas.
 * Los montos salen en USD con dos decimales (desde centavos); las fechas como serial de Excel.
 * @module data/exportar
 */
import { deCentavos } from '../engine/money.js';
import { isoASerial } from './xlsx.js';

const FORMATO_FECHA = 'dd-mmm-yyyy';
const FORMATO_MONTO = '#,##0.00';
const FORMATO_PCT = '0.00%';

const LINEA_NOMBRE = { vallas: 'Vallas', led: 'Pantallas LED', retail: 'Retail Media' };
const CANAL_NOMBRE = { directo: 'Directo', agencia: 'Agencia' };

/** Filas del rol: una por vendedor con las nueve líneas del ledger. */
export function filasRol(resultadoPeriodo, dataset) {
  const nombres = new Map((dataset.vendedores || []).map((v) => [v.id, v.nombre]));
  const filas = [];
  for (const l of Object.values(resultadoPeriodo.vendedores || {})) {
    const t = l.totales;
    filas.push({
      periodo: resultadoPeriodo.periodo,
      vendedor_id: l.vendedorId,
      vendedor: nombres.get(l.vendedorId) || l.vendedorId,
      cuota: l.tramo?.cuota != null ? deCentavos(l.tramo.cuota) : null,
      facturado_bruto: deCentavos(t.facturadoBruto),
      notas_credito: deCentavos(t.notasCredito),
      valor_neto: deCentavos(t.valorNeto),
      comision_agencia: deCentavos(t.comisionAgencia),
      base_comisionable: deCentavos(t.base),
      cumplimiento: l.tramo?.cumplimiento ?? null,
      tramo: l.tramo?.tramoNombre || '',
      devengado: deCentavos(t.devengado),
      bonos: deCentavos(t.bonos),
      liberado_periodo: deCentavos(t.liberadoPeriodo),
      liberado_cartera: deCentavos(t.liberadoCartera),
      retenido: deCentavos(t.retenido),
      caducado_periodo: deCentavos(t.caducadoPeriodo),
      no_liberado_rezago: deCentavos(t.rezagoPeriodo),
      clawback: deCentavos(t.clawback),
      saldo_anterior: deCentavos(t.saldoAnterior),
      ajustes: deCentavos(t.ajustes),
      neto_antes_tope: deCentavos(t.netoAntesTope),
      tope: t.tope != null ? deCentavos(t.tope) : null,
      excedente_tope: deCentavos(t.excedente),
      comision_liquidable: deCentavos(t.liquidable),
      saldo_siguiente: deCentavos(t.saldoSiguiente),
      esquema: l.esquemaVersion || '',
    });
  }
  filas.sort((a, b) => a.vendedor.localeCompare(b.vendedor, 'es'));
  return filas;
}

/** Filas de detalle por factura del período. */
export function filasDetalle(resultadoPeriodo, dataset) {
  const nombres = new Map((dataset.vendedores || []).map((v) => [v.id, v.nombre]));
  const clientes = new Map((dataset.clientes || []).map((c) => [c.id, c.nombre]));
  const filas = [];
  for (const l of Object.values(resultadoPeriodo.vendedores || {})) {
    for (const r of l.facturas || []) {
      filas.push({
        periodo: resultadoPeriodo.periodo,
        vendedor: nombres.get(r.vendedorId) || r.vendedorId,
        factura: r.numero,
        fecha_emision: r.fechaEmision,
        periodo_emision: r.periodoEmision,
        cliente: clientes.get(r.clienteId) || r.clienteId,
        linea: LINEA_NOMBRE[r.linea] || r.linea,
        canal: CANAL_NOMBRE[r.canal] || r.canal,
        valor_facturado: deCentavos(r.valorFacturado),
        notas_credito: deCentavos(r.notasCredito),
        valor_neto: deCentavos(r.valorNeto),
        pct_agencia: r.pctAgencia,
        comision_agencia: deCentavos(r.comisionAgencia),
        base: deCentavos(r.base),
        pct_comision: r.pct,
        devengado: deCentavos(r.devengado),
        cobrado: deCentavos(r.cobrado),
        pendiente: deCentavos(r.pendiente),
        dias: r.dias,
        ultimo_cobro: r.ultimoCobro?.fecha || '',
        factor: r.ultimoCobro?.factor ?? null,
        liberado_periodo: deCentavos(r.liberadoPeriodo),
        liberado_acumulado: deCentavos(r.liberadoAcumulado),
        retenido: deCentavos(r.retenido),
        caducado_periodo: deCentavos(r.caducadoPeriodo),
        clawback: deCentavos(r.clawback),
        politica: r.politicaVersion || '',
        estado: r.estado,
      });
    }
  }
  filas.sort((a, b) => a.vendedor.localeCompare(b.vendedor, 'es') || (a.fecha_emision < b.fecha_emision ? -1 : 1));
  return filas;
}

export function filasCartera(cartera, dataset) {
  const nombres = new Map((dataset.vendedores || []).map((v) => [v.id, v.nombre]));
  const clientes = new Map((dataset.clientes || []).map((c) => [c.id, c.nombre]));
  return cartera.map((c) => ({
    vendedor: nombres.get(c.vendedorId) || c.vendedorId,
    factura: c.numero,
    cliente: clientes.get(c.clienteId) || c.clienteId,
    fecha_emision: c.fechaEmision,
    valor_neto: deCentavos(c.valorNeto),
    cobrado: deCentavos(c.cobrado),
    pendiente: deCentavos(c.pendiente),
    devengado: deCentavos(c.devengado),
    liberado: deCentavos(c.liberado),
    retenido: deCentavos(c.retenido),
    dias: c.dias,
    factor_hoy: c.factorHoy,
    fecha_limite: c.fechaLimite || '',
    dias_para_caducar: c.diasParaCaducar,
    politica: c.politicaVersion || '',
  }));
}

export function filasAlertas(alertas, dataset) {
  const nombres = new Map((dataset.vendedores || []).map((v) => [v.id, v.nombre]));
  return alertas.map((a) => ({ periodo: a.periodo || '', codigo: a.codigo, severidad: a.severidad, regla: a.regla, vendedor: a.vendedorId ? nombres.get(a.vendedorId) || a.vendedorId : '', factura: a.factura || a.ref || '', titulo: a.titulo, monto: a.monto != null ? deCentavos(a.monto) : null }));
}

const esFecha = (k) => k.startsWith('fecha') || k === 'ultimo_cobro';
const esPct = (k) => k.startsWith('pct_') || k === 'cumplimiento' || k === 'factor' || k === 'factor_hoy';
const esEntero = (k) => k === 'dias' || k === 'dias_para_caducar';

/** Hoja desde filas: fechas ISO → serial con formato; porcentajes y montos con formato. */
export function hojaDesdeObjetos(XLSX, filas, { encabezados } = {}) {
  const cols = encabezados || (filas.length ? Object.keys(filas[0]) : []);
  const aoa = [cols, ...filas.map((f) => cols.map((c) => (f[c] === undefined || f[c] === null ? '' : f[c])))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 1; r <= filas.length; r++) {
    cols.forEach((c, ci) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (!cell) return;
      if (esFecha(c) && typeof cell.v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell.v)) {
        cell.t = 'n';
        cell.v = isoASerial(cell.v);
        cell.z = FORMATO_FECHA;
      } else if (typeof cell.v === 'number') {
        cell.z = esPct(c) ? FORMATO_PCT : esEntero(c) ? '0' : FORMATO_MONTO;
      }
    });
  }
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, Math.min(36, c.length + 4)) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

/** Libro con Rol, Detalle, Cartera y Alertas del período. */
export function libroRol(XLSX, resultado, periodo, dataset) {
  const per = resultado.periodos[periodo];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaDesdeObjetos(XLSX, filasRol(per, dataset)), 'Rol');
  XLSX.utils.book_append_sheet(wb, hojaDesdeObjetos(XLSX, filasDetalle(per, dataset)), 'Detalle');
  XLSX.utils.book_append_sheet(wb, hojaDesdeObjetos(XLSX, filasCartera(resultado.cartera, dataset)), 'Cartera');
  XLSX.utils.book_append_sheet(wb, hojaDesdeObjetos(XLSX, filasAlertas(resultado.alertas.filter((a) => a.periodo === periodo), dataset)), 'Alertas');
  return wb;
}

/** CSV para Excel en español: separador ";" y decimales con coma; fechas ISO; UTF-8 con BOM. */
export function aCSV(filas, { encabezados } = {}) {
  const cols = encabezados || (filas.length ? Object.keys(filas[0]) : []);
  const celda = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 10000) / 10000).replace('.', ',');
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [cols.join(';'), ...filas.map((f) => cols.map((c) => celda(f[c])).join(';'))];
  return `﻿${lineas.join('\r\n')}`;
}
