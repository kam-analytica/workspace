/**
 * Validación del importador: normaliza filas de la plantilla, verifica reglas por fila y referencias cruzadas,
 * y devuelve entidades listas para el motor más un informe de errores por hoja y fila. Puro y testeable en Node.
 * @module data/validacion
 */
import { esFechaISO, periodoDeFecha } from '../engine/dates.js';
import { LINEAS, CANALES } from '../engine/parametros.js';
import { serialAISO } from './xlsx.js';

export const HOJAS = ['Vendedores', 'Agencias', 'Clientes', 'Facturas', 'Cobros', 'NotasCredito'];

/** Columnas canónicas por hoja (clave interna → encabezado de la plantilla). */
export const COLUMNAS = {
  Vendedores: { id: 'id', nombre: 'nombre', iniciales: 'iniciales', zona: 'zona', cargo: 'cargo', activo: 'activo' },
  Agencias: { id: 'id', nombre: 'nombre', pctAgencia: 'pct_agencia' },
  Clientes: { id: 'id', nombre: 'nombre', canal: 'canal', agenciaId: 'agencia_id', vendedorId: 'vendedor_id', fechaAlta: 'fecha_alta' },
  Facturas: { numero: 'numero', fechaEmision: 'fecha_emision', vendedorId: 'vendedor_id', clienteId: 'cliente_id', linea: 'linea', canal: 'canal', valorFacturado: 'valor_sin_iva', pctAgencia: 'pct_agencia', fechaAnulacion: 'fecha_anulacion' },
  Cobros: { id: 'id', facturaNumero: 'factura_numero', fechaCobro: 'fecha_cobro', monto: 'monto_sin_iva', medio: 'medio' },
  NotasCredito: { numero: 'numero', facturaNumero: 'factura_numero', fecha: 'fecha', valor: 'valor', motivo: 'motivo' },
};

const OBLIGATORIAS = {
  Vendedores: ['id', 'nombre'],
  Agencias: ['id', 'nombre', 'pctAgencia'],
  Clientes: ['id', 'nombre', 'canal', 'vendedorId'],
  Facturas: ['numero', 'fechaEmision', 'vendedorId', 'clienteId', 'linea', 'valorFacturado'],
  Cobros: ['facturaNumero', 'fechaCobro', 'monto'],
  NotasCredito: ['numero', 'facturaNumero', 'fecha', 'valor'],
};

const ZONAS = ['Quito', 'Guayaquil', 'Cuenca'];

/** Normaliza un encabezado: minúsculas, sin acentos, espacios y guiones a guion bajo, sin sufijos como "(%)". */
export function normalizarEncabezado(h) {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[\s\-.]+/g, '_')
    .replace(/_+$/g, '');
}

const ALIAS = {
  vendedor: 'vendedor_id',
  vendedorid: 'vendedor_id',
  cliente: 'cliente_id',
  clienteid: 'cliente_id',
  agencia: 'agencia_id',
  agenciaid: 'agencia_id',
  factura: 'factura_numero',
  facturanumero: 'factura_numero',
  numero_factura: 'factura_numero',
  fecha_de_emision: 'fecha_emision',
  fechaemision: 'fecha_emision',
  fecha_de_cobro: 'fecha_cobro',
  fechacobro: 'fecha_cobro',
  fecha_de_alta: 'fecha_alta',
  fechaalta: 'fecha_alta',
  valor: 'valor',
  valor_facturado: 'valor_sin_iva',
  valorfacturado: 'valor_sin_iva',
  subtotal: 'valor_sin_iva',
  monto: 'monto_sin_iva',
  pctagencia: 'pct_agencia',
  porcentaje_agencia: 'pct_agencia',
  comision_agencia: 'pct_agencia',
  fecha_de_anulacion: 'fecha_anulacion',
  fechaanulacion: 'fecha_anulacion',
};

/** Convierte una fila cruda (encabezados libres) a claves internas de la hoja. Conserva cuotas `cuota_YYYY-MM`. */
export function mapearFila(hoja, filaCruda) {
  const inversa = {};
  for (const [clave, enc] of Object.entries(COLUMNAS[hoja])) inversa[enc] = clave;
  const out = {};
  for (const [h, v] of Object.entries(filaCruda)) {
    let n = normalizarEncabezado(h);
    n = ALIAS[n] || n;
    if (hoja === 'Vendedores') {
      const m = /^cuota_(\d{4})[_-]?(\d{2})$/.exec(n);
      if (m) {
        out.cuotas = out.cuotas || [];
        if (v !== null && v !== undefined && v !== '') out.cuotas.push({ periodo: `${m[1]}-${m[2]}`, monto: v });
        continue;
      }
    }
    if (hoja === 'NotasCredito' && n === 'valor_sin_iva') n = 'valor';
    const clave = inversa[n];
    if (clave) out[clave] = v;
  }
  return out;
}

export function normalizarFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { error: 'fecha inválida' };
    const iso = new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return iso;
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return { error: 'serial de fecha fuera de rango' };
    return serialAISO(v);
  }
  const s = String(v).trim();
  if (esFechaISO(s)) return s;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return esFechaISO(iso) ? iso : { error: 'fecha inválida' };
  }
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return esFechaISO(iso) ? iso : { error: 'fecha inválida (se espera dd/mm/aaaa)' };
  }
  return { error: 'formato de fecha no reconocido (use aaaa-mm-dd o dd/mm/aaaa)' };
}

export function normalizarNumero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { error: 'número inválido' };
  let s = String(v).trim().replace(/\s|USD|\$/gi, '');
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : { error: 'número inválido' };
}

/** Porcentaje: acepta 15, "15 %", 0.15 (si ≤ 1 se interpreta como decimal). Devuelve decimal. */
export function normalizarPct(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = normalizarNumero(String(v).replace('%', ''));
  if (n && n.error) return n;
  if (n < 0) return { error: 'porcentaje negativo' };
  if (n <= 1) return n;
  if (n > 100) return { error: 'porcentaje mayor que 100' };
  return n / 100;
}

function normalizarBooleano(v) {
  if (v === null || v === undefined || v === '') return true;
  const s = String(v).trim().toLowerCase();
  if (['si', 'sí', 's', 'true', '1', 'x', 'activo'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'inactivo'].includes(s)) return false;
  return { error: 'valor esperado SI o NO' };
}

const texto = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

/**
 * Valida y normaliza las hojas importadas.
 * @param {Object<string, object[]>} hojas filas crudas por hoja (encabezados de la plantilla)
 * @param {{existente?:object|null, modo?:'reemplazar'|'agregar', cierres?:object}} ctx
 * @returns {{entidades:object, errores:object[], advertencias:object[], resumen:object}}
 */
export function validarImportacion(hojas, ctx = {}) {
  const modo = ctx.modo || 'reemplazar';
  const existente = modo === 'agregar' && ctx.existente ? ctx.existente : null;
  const cierres = ctx.cierres || existente?.cierres || {};
  const errores = [];
  const advertencias = [];
  const error = (hoja, fila, campo, codigo, mensaje, valor) => errores.push({ hoja, fila, campo, codigo, mensaje, valor: valor ?? null });
  const advertir = (hoja, fila, campo, codigo, mensaje, valor) => advertencias.push({ hoja, fila, campo, codigo, mensaje, valor: valor ?? null });

  const filas = {};
  for (const h of HOJAS) filas[h] = (hojas[h] || []).map((f, i) => ({ fila: i + 2, datos: mapearFila(h, f) })).filter((x) => Object.values(x.datos).some((v) => v !== null && v !== undefined && v !== ''));

  const requerir = (hoja, x) => {
    let ok = true;
    for (const campo of OBLIGATORIAS[hoja]) {
      const v = x.datos[campo];
      if (v === null || v === undefined || v === '') {
        error(hoja, x.fila, campo, 'E-OBLIG', `Falta el campo obligatorio "${COLUMNAS[hoja][campo]}"`);
        ok = false;
      }
    }
    return ok;
  };
  const unico = (hoja, x, campo, vistos) => {
    const v = texto(x.datos[campo]);
    if (v && vistos.has(v)) {
      error(hoja, x.fila, campo, 'E-DUP', `Valor duplicado en "${COLUMNAS[hoja][campo]}": ${v}`, v);
      return false;
    }
    if (v) vistos.add(v);
    return true;
  };
  const fecha = (hoja, x, campo, obligatoria) => {
    const r = normalizarFecha(x.datos[campo]);
    if (r === null) {
      if (obligatoria) error(hoja, x.fila, campo, 'E-OBLIG', `Falta la fecha "${COLUMNAS[hoja][campo]}"`);
      return null;
    }
    if (r.error) {
      error(hoja, x.fila, campo, 'E-FECHA', `Fecha inválida en "${COLUMNAS[hoja][campo]}": ${r.error}`, x.datos[campo]);
      return null;
    }
    return r;
  };
  const numero = (hoja, x, campo, { min = null, obligatoria = true } = {}) => {
    const r = normalizarNumero(x.datos[campo]);
    if (r === null) {
      if (obligatoria) error(hoja, x.fila, campo, 'E-OBLIG', `Falta el valor "${COLUMNAS[hoja][campo]}"`);
      return null;
    }
    if (r.error) {
      error(hoja, x.fila, campo, 'E-NUM', `Valor no numérico en "${COLUMNAS[hoja][campo]}"`, x.datos[campo]);
      return null;
    }
    if (min != null && r < min) {
      error(hoja, x.fila, campo, 'E-RANGO', `"${COLUMNAS[hoja][campo]}" debe ser mayor o igual que ${min}`, r);
      return null;
    }
    return Math.round(r * 100) / 100;
  };

  // Vendedores
  const vendedores = new Map((existente?.vendedores || []).map((v) => [v.id, v]));
  const idsV = new Set();
  for (const x of filas.Vendedores) {
    if (!requerir('Vendedores', x) || !unico('Vendedores', x, 'id', idsV)) continue;
    const activo = normalizarBooleano(x.datos.activo);
    if (activo.error) error('Vendedores', x.fila, 'activo', 'E-VALOR', activo.error, x.datos.activo);
    const zona = texto(x.datos.zona);
    if (zona && !ZONAS.includes(zona)) advertir('Vendedores', x.fila, 'zona', 'A-ZONA', `Zona fuera de las habituales (${ZONAS.join(', ')})`, zona);
    const cuotas = [];
    for (const c of x.datos.cuotas || []) {
      const m = normalizarNumero(c.monto);
      if (m === null) continue;
      if (m.error || m < 0) {
        error('Vendedores', x.fila, `cuota_${c.periodo}`, 'E-NUM', 'Cuota inválida', c.monto);
        continue;
      }
      cuotas.push({ periodo: c.periodo, monto: Math.round(m * 100) / 100 });
    }
    const nombre = texto(x.datos.nombre);
    vendedores.set(texto(x.datos.id), {
      id: texto(x.datos.id),
      nombre,
      iniciales: texto(x.datos.iniciales) || iniciales(nombre),
      zona: zona || '',
      cargo: texto(x.datos.cargo) || '',
      activo: activo.error ? true : activo,
      cuotas,
    });
  }

  // Agencias
  const agencias = new Map((existente?.agencias || []).map((a) => [a.id, a]));
  const idsA = new Set();
  for (const x of filas.Agencias) {
    if (!requerir('Agencias', x) || !unico('Agencias', x, 'id', idsA)) continue;
    const pct = normalizarPct(x.datos.pctAgencia);
    if (pct === null || pct.error) {
      error('Agencias', x.fila, 'pctAgencia', 'E-PCT', `Porcentaje de agencia inválido: ${pct?.error || 'vacío'}`, x.datos.pctAgencia);
      continue;
    }
    if (pct > 0.5) advertir('Agencias', x.fila, 'pctAgencia', 'A-PCT', 'Porcentaje de agencia inusualmente alto', pct);
    agencias.set(texto(x.datos.id), { id: texto(x.datos.id), nombre: texto(x.datos.nombre), pctAgencia: pct });
  }

  // Clientes
  const clientes = new Map((existente?.clientes || []).map((c) => [c.id, c]));
  const idsC = new Set();
  for (const x of filas.Clientes) {
    if (!requerir('Clientes', x) || !unico('Clientes', x, 'id', idsC)) continue;
    const canal = String(x.datos.canal).trim().toLowerCase();
    if (!CANALES.includes(canal)) {
      error('Clientes', x.fila, 'canal', 'E-VALOR', `Canal debe ser ${CANALES.join(' o ')}`, x.datos.canal);
      continue;
    }
    const vendedorId = texto(x.datos.vendedorId);
    if (!vendedores.has(vendedorId)) error('Clientes', x.fila, 'vendedorId', 'E-REF', `Vendedor inexistente: ${vendedorId}`, vendedorId);
    const agenciaId = texto(x.datos.agenciaId);
    if (canal === 'agencia' && !agenciaId) advertir('Clientes', x.fila, 'agenciaId', 'A-AG', 'Cliente por agencia sin agencia asignada: se pedirá % en cada factura');
    if (agenciaId && !agencias.has(agenciaId)) error('Clientes', x.fila, 'agenciaId', 'E-REF', `Agencia inexistente: ${agenciaId}`, agenciaId);
    const fechaAlta = fecha('Clientes', x, 'fechaAlta', false);
    clientes.set(texto(x.datos.id), { id: texto(x.datos.id), nombre: texto(x.datos.nombre), canal, agenciaId: agenciaId || undefined, vendedorId, fechaAlta: fechaAlta || undefined });
  }

  // Facturas
  const facturas = new Map((existente?.facturas || []).map((f) => [f.numero, f]));
  const numerosF = new Set();
  for (const x of filas.Facturas) {
    if (!requerir('Facturas', x) || !unico('Facturas', x, 'numero', numerosF)) continue;
    const numeroF = texto(x.datos.numero);
    if (existente && facturas.has(numeroF)) {
      error('Facturas', x.fila, 'numero', 'E-DUP', `La factura ${numeroF} ya existe en los datos cargados`, numeroF);
      continue;
    }
    const fechaEmision = fecha('Facturas', x, 'fechaEmision', true);
    const vendedorId = texto(x.datos.vendedorId);
    const clienteId = texto(x.datos.clienteId);
    if (!vendedores.has(vendedorId)) error('Facturas', x.fila, 'vendedorId', 'E-REF', `Vendedor inexistente: ${vendedorId}`, vendedorId);
    const cliente = clientes.get(clienteId);
    if (!cliente) error('Facturas', x.fila, 'clienteId', 'E-REF', `Cliente inexistente: ${clienteId}`, clienteId);
    const linea = String(x.datos.linea).trim().toLowerCase().replace('retail media', 'retail').replace('pantallas', 'led');
    if (!LINEAS.includes(linea)) error('Facturas', x.fila, 'linea', 'E-VALOR', `Línea debe ser ${LINEAS.join(', ')}`, x.datos.linea);
    let canal = texto(x.datos.canal)?.toLowerCase() || cliente?.canal || null;
    if (canal && !CANALES.includes(canal)) {
      error('Facturas', x.fila, 'canal', 'E-VALOR', `Canal debe ser ${CANALES.join(' o ')}`, x.datos.canal);
      canal = null;
    }
    const valor = numero('Facturas', x, 'valorFacturado', { min: 0.01 });
    let pct = normalizarPct(x.datos.pctAgencia);
    if (pct && pct.error) {
      error('Facturas', x.fila, 'pctAgencia', 'E-PCT', `Porcentaje de agencia inválido: ${pct.error}`, x.datos.pctAgencia);
      pct = null;
    }
    if (canal === 'agencia' && pct === null && cliente && !(cliente.agenciaId && agencias.has(cliente.agenciaId))) {
      advertir('Facturas', x.fila, 'pctAgencia', 'A-PCT', 'Factura por agencia sin porcentaje: se calculará con 0 % y alerta A-10');
    }
    const fechaAnulacion = fecha('Facturas', x, 'fechaAnulacion', false);
    if (fechaEmision && fechaAnulacion && fechaAnulacion < fechaEmision) error('Facturas', x.fila, 'fechaAnulacion', 'E-FECHA', 'La anulación es anterior a la emisión');
    if (fechaEmision && cierres[periodoDeFecha(fechaEmision)]?.snapshot) advertir('Facturas', x.fila, 'fechaEmision', 'A-BLOQ', `La factura cae en el período aprobado ${periodoDeFecha(fechaEmision)}: se liquidará en el primer período abierto (alerta A-08)`);
    if (!fechaEmision || !valor || !LINEAS.includes(linea)) continue;
    const f = { numero: numeroF, fechaEmision, vendedorId, clienteId, linea, canal: canal || 'directo', valorFacturado: valor };
    if (pct !== null) f.pctAgencia = pct;
    if (fechaAnulacion) f.fechaAnulacion = fechaAnulacion;
    facturas.set(numeroF, f);
  }

  // Cobros
  const cobros = new Map((existente?.cobros || []).map((c) => [c.id, c]));
  const idsCb = new Set();
  const cobradoPorFactura = new Map();
  for (const c of cobros.values()) cobradoPorFactura.set(c.facturaNumero, (cobradoPorFactura.get(c.facturaNumero) || 0) + c.monto);
  let autoCobro = cobros.size;
  for (const x of filas.Cobros) {
    if (!requerir('Cobros', x)) continue;
    let id = texto(x.datos.id);
    if (!id) id = `CB-${String(++autoCobro).padStart(6, '0')}`;
    else if (!unico('Cobros', x, 'id', idsCb)) continue;
    if (existente && cobros.has(id)) {
      error('Cobros', x.fila, 'id', 'E-DUP', `El cobro ${id} ya existe en los datos cargados`, id);
      continue;
    }
    const facturaNumero = texto(x.datos.facturaNumero);
    const f = facturas.get(facturaNumero);
    if (!f) {
      error('Cobros', x.fila, 'facturaNumero', 'E-REF', `Factura inexistente: ${facturaNumero}`, facturaNumero);
      continue;
    }
    const fechaCobro = fecha('Cobros', x, 'fechaCobro', true);
    const monto = numero('Cobros', x, 'monto', { min: 0.01 });
    if (!fechaCobro || !monto) continue;
    if (fechaCobro < f.fechaEmision) error('Cobros', x.fila, 'fechaCobro', 'E-FECHA', `Cobro anterior a la emisión de la factura (${f.fechaEmision})`, fechaCobro);
    const acumulado = (cobradoPorFactura.get(facturaNumero) || 0) + monto;
    if (acumulado > f.valorFacturado + 0.005) error('Cobros', x.fila, 'monto', 'E-RANGO', `Cobro mayor que la factura: acumulado ${acumulado.toFixed(2)} sobre ${f.valorFacturado.toFixed(2)}`, monto);
    cobradoPorFactura.set(facturaNumero, acumulado);
    if (cierres[periodoDeFecha(fechaCobro)]?.snapshot) advertir('Cobros', x.fila, 'fechaCobro', 'A-BLOQ', `El cobro cae en el período aprobado ${periodoDeFecha(fechaCobro)}: se liberará en el primer período abierto (alerta A-08)`);
    cobros.set(id, { id, facturaNumero, fechaCobro, monto, medio: texto(x.datos.medio) || 'transferencia' });
  }

  // Notas de crédito
  const notasCredito = new Map((existente?.notasCredito || []).map((n) => [n.numero, n]));
  const numerosN = new Set();
  const ncPorFactura = new Map();
  for (const n of notasCredito.values()) ncPorFactura.set(n.facturaNumero, (ncPorFactura.get(n.facturaNumero) || 0) + n.valor);
  for (const x of filas.NotasCredito) {
    if (!requerir('NotasCredito', x) || !unico('NotasCredito', x, 'numero', numerosN)) continue;
    const numeroN = texto(x.datos.numero);
    if (existente && notasCredito.has(numeroN)) {
      error('NotasCredito', x.fila, 'numero', 'E-DUP', `La nota de crédito ${numeroN} ya existe en los datos cargados`, numeroN);
      continue;
    }
    const facturaNumero = texto(x.datos.facturaNumero);
    const f = facturas.get(facturaNumero);
    if (!f) {
      error('NotasCredito', x.fila, 'facturaNumero', 'E-REF', `Factura inexistente: ${facturaNumero}`, facturaNumero);
      continue;
    }
    const fechaN = fecha('NotasCredito', x, 'fecha', true);
    const valor = numero('NotasCredito', x, 'valor', { min: 0.01 });
    if (!fechaN || !valor) continue;
    if (fechaN < f.fechaEmision) error('NotasCredito', x.fila, 'fecha', 'E-FECHA', `Nota de crédito anterior a la emisión de la factura (${f.fechaEmision})`, fechaN);
    const acumulado = (ncPorFactura.get(facturaNumero) || 0) + valor;
    if (acumulado > f.valorFacturado + 0.005) error('NotasCredito', x.fila, 'valor', 'E-RANGO', `Notas de crédito mayores que la factura: acumulado ${acumulado.toFixed(2)} sobre ${f.valorFacturado.toFixed(2)}`, valor);
    ncPorFactura.set(facturaNumero, acumulado);
    if (cierres[periodoDeFecha(fechaN)]?.snapshot) advertir('NotasCredito', x.fila, 'fecha', 'A-BLOQ', `La nota de crédito cae en el período aprobado ${periodoDeFecha(fechaN)}: se aplicará en el primer período abierto (alerta A-08)`);
    notasCredito.set(numeroN, { numero: numeroN, facturaNumero, fecha: fechaN, valor, motivo: texto(x.datos.motivo) || '' });
  }

  const entidades = {
    vendedores: [...vendedores.values()],
    agencias: [...agencias.values()],
    clientes: [...clientes.values()],
    facturas: [...facturas.values()],
    cobros: [...cobros.values()],
    notasCredito: [...notasCredito.values()],
  };
  const resumen = {};
  for (const h of HOJAS) resumen[h] = { filas: filas[h].length, errores: errores.filter((e) => e.hoja === h).length, advertencias: advertencias.filter((a) => a.hoja === h).length };
  return { entidades, errores, advertencias, resumen, valido: errores.length === 0 };
}

function iniciales(nombre) {
  return String(nombre || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}
