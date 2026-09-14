/**
 * Contraste de la comisión liquidable de la herramienta contra la liquidación histórica de INDUVALLAS (Excel actual).
 * Entrada: hoja con columnas periodo, vendedor_id, comision_pagada (y opcional devengado_historico).
 * @module data/contraste
 */
import { normalizarEncabezado, normalizarNumero } from './validacion.js';
import { deCentavos } from '../engine/money.js';

const ALIAS = { mes: 'periodo', period: 'periodo', vendedor: 'vendedor_id', vendedorid: 'vendedor_id', codigo_vendedor: 'vendedor_id', comision: 'comision_pagada', comision_liquidada: 'comision_pagada', pagado: 'comision_pagada', comisionpagada: 'comision_pagada', devengado: 'devengado_historico', comision_devengada: 'devengado_historico' };

export function plantillaContraste(XLSX, periodos = [], vendedores = []) {
  const wb = XLSX.utils.book_new();
  const filas = [['periodo', 'vendedor_id', 'comision_pagada', 'devengado_historico']];
  for (const p of periodos) for (const v of vendedores) filas.push([p, v.id, '', '']);
  if (!periodos.length) filas.push(['2026-08', 'V01', 1234.56, '']);
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Contraste');
  const wsI = XLSX.utils.aoa_to_sheet([
    ['Contraste de comisiones · kam. Comisiones IA'],
    ['periodo: AAAA-MM del rol histórico.'],
    ['vendedor_id: el mismo código de la hoja Vendedores de la plantilla de datos.'],
    ['comision_pagada: comisión liquidada en el rol histórico del período (USD).'],
    ['devengado_historico: opcional, comisión devengada según el método anterior (USD).'],
  ]);
  XLSX.utils.book_append_sheet(wb, wsI, 'Instrucciones');
  return wb;
}

export function leerContraste(XLSX, datos) {
  const wb = XLSX.read(datos, { type: typeof datos === 'string' ? 'binary' : 'array', raw: true });
  const nombre = wb.SheetNames.find((n) => normalizarEncabezado(n) === 'contraste') || wb.SheetNames[0];
  const crudas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { defval: null, raw: true, blankrows: false });
  const filas = [];
  const errores = [];
  crudas.forEach((c, i) => {
    const f = {};
    for (const [k, v] of Object.entries(c)) {
      let n = normalizarEncabezado(k);
      n = ALIAS[n] || n;
      f[n] = v;
    }
    const periodo = String(f.periodo ?? '').trim().slice(0, 7);
    const vendedorId = String(f.vendedor_id ?? '').trim();
    const monto = normalizarNumero(f.comision_pagada);
    const dev = normalizarNumero(f.devengado_historico);
    if (!/^\d{4}-\d{2}$/.test(periodo) || !vendedorId || monto === null || monto?.error) {
      errores.push({ fila: i + 2, mensaje: 'Fila incompleta o con formato inválido (periodo AAAA-MM, vendedor_id, comision_pagada)' });
      return;
    }
    filas.push({ periodo, vendedorId, comisionPagada: Math.round(monto * 100) / 100, devengadoHistorico: dev && !dev.error ? Math.round(dev * 100) / 100 : null });
  });
  return { filas, errores };
}

/**
 * @param {object} resultado salida de computeTodo
 * @param {object[]} filas de leerContraste
 * @param {{tolerancia?:number, nombres?:(id:string)=>string}} opciones tolerancia en USD
 */
export function contrastar(resultado, filas, { tolerancia = 1, nombres = (id) => id } = {}) {
  const salida = [];
  const sinCorrespondencia = [];
  for (const f of filas) {
    const led = resultado.periodos[f.periodo]?.vendedores[f.vendedorId];
    if (!led) {
      sinCorrespondencia.push(f);
      continue;
    }
    const herramienta = deCentavos(led.totales.liquidable);
    const devengado = deCentavos(led.totales.devengado + led.totales.bonos);
    const diferencia = Math.round((herramienta - f.comisionPagada) * 100) / 100;
    salida.push({
      periodo: f.periodo,
      vendedorId: f.vendedorId,
      vendedor: nombres(f.vendedorId),
      herramienta,
      historico: f.comisionPagada,
      diferencia,
      pct: f.comisionPagada ? diferencia / Math.abs(f.comisionPagada) : null,
      devengadoHerramienta: devengado,
      devengadoHistorico: f.devengadoHistorico,
      estado: Math.abs(diferencia) <= tolerancia ? 'ok' : 'revisar',
    });
  }
  const totales = {
    herramienta: Math.round(salida.reduce((s, x) => s + x.herramienta, 0) * 100) / 100,
    historico: Math.round(salida.reduce((s, x) => s + x.historico, 0) * 100) / 100,
    ok: salida.filter((x) => x.estado === 'ok').length,
    revisar: salida.filter((x) => x.estado === 'revisar').length,
  };
  totales.diferencia = Math.round((totales.herramienta - totales.historico) * 100) / 100;
  return { filas: salida, totales, sinCorrespondencia };
}
