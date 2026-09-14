/**
 * Anonimización (seudonimización determinista) del dataset para compartirlo fuera de INDUVALLAS sin datos personales.
 * Conserva montos (opcionalmente escalados), fechas, canales, líneas, porcentajes y todas las referencias cruzadas,
 * de modo que el motor produce exactamente el mismo resultado sobre los datos seudonimizados (prueba AN-03).
 * El mapa de correspondencia se entrega aparte y nunca acompaña a los datos compartidos.
 * @module data/anonimizar
 */

/** FNV-1a de 32 bits con semilla y mezcla final. */
function hash32(texto, semilla) {
  let h = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código estable de 6 caracteres a partir de clave, tipo e identificador. */
export function codigoSeudonimo(clave, tipo, id) {
  const a = hash32(`${clave}${tipo}${id}`, 0x811c9dc5);
  const b = hash32(`${id}${tipo}${clave}`, 0x1b873593);
  let n = (BigInt(a) << 32n) | BigInt(b);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALFABETO[Number(n % 32n)];
    n /= 32n;
  }
  return out;
}

const escalar = (v, escala) => Math.round(Number(v) * escala * 100) / 100;

const PREFIJOS = { vendedores: 'V', agencias: 'AG', clientes: 'C', facturas: 'F', cobros: 'CB', notasCredito: 'NC' };

/**
 * @param {object} dataset dataset del motor (USD con 2 decimales)
 * @param {{clave:string, escala?:number, mapaPrevio?:object|null, conservarZona?:boolean, conservarMedio?:boolean}} opciones
 * @returns {{dataset:object, mapa:object, informe:object}}
 */
export function anonimizarDataset(dataset, { clave, escala = 1, mapaPrevio = null, conservarZona = true, conservarMedio = true } = {}) {
  if (!clave || String(clave).length < 8) throw new Error('La clave de anonimización debe tener al menos 8 caracteres');
  if (!(escala > 0) || escala > 10) throw new Error('La escala debe ser un número mayor que 0 y no mayor que 10');
  const mapa = { tipo: 'kam.comisiones-ia.mapa-anonimizacion', version: 1, escala, entidades: {} };
  const usados = new Set();
  const previos = mapaPrevio?.entidades || {};

  function asignar(tipo, id, extra = {}) {
    const prefijo = PREFIJOS[tipo];
    if (!mapa.entidades[tipo]) mapa.entidades[tipo] = {};
    if (mapa.entidades[tipo][id]) return mapa.entidades[tipo][id].seudonimo;
    let seudonimo = previos[tipo]?.[id]?.seudonimo || null;
    if (!seudonimo) {
      let codigo = codigoSeudonimo(clave, tipo, String(id));
      let intento = 0;
      while (usados.has(`${tipo}|${codigo}`)) codigo = codigoSeudonimo(clave, tipo, `${id}#${++intento}`);
      seudonimo = `${prefijo}-${codigo}`;
    }
    usados.add(`${tipo}|${seudonimo.slice(prefijo.length + 1)}`);
    mapa.entidades[tipo][id] = { seudonimo, ...extra };
    return seudonimo;
  }
  const ref = (tipo, id, extra) => mapa.entidades[tipo]?.[id]?.seudonimo || asignar(tipo, id, extra);

  const vendedores = (dataset.vendedores || []).map((v) => {
    const id = asignar('vendedores', v.id, { nombre: v.nombre });
    const codigo = id.slice(2);
    return { id, nombre: `Vendedor ${codigo}`, iniciales: codigo.slice(0, 2), zona: conservarZona ? v.zona || '' : '', cargo: 'Ejecutivo comercial', activo: v.activo !== false, cuotas: (v.cuotas || []).map((c) => ({ periodo: c.periodo, monto: escalar(c.monto, escala) })) };
  });
  const agencias = (dataset.agencias || []).map((a) => {
    const id = asignar('agencias', a.id, { nombre: a.nombre });
    return { id, nombre: `Agencia ${id.slice(3)}`, pctAgencia: a.pctAgencia };
  });
  const clientes = (dataset.clientes || []).map((c) => {
    const id = asignar('clientes', c.id, { nombre: c.nombre });
    return { id, nombre: `Cliente ${id.slice(2)}`, canal: c.canal, agenciaId: c.agenciaId ? ref('agencias', c.agenciaId, { nombre: c.agenciaId }) : undefined, vendedorId: ref('vendedores', c.vendedorId, { nombre: c.vendedorId }), fechaAlta: c.fechaAlta };
  });
  const facturas = (dataset.facturas || []).map((f) => {
    const numero = asignar('facturas', f.numero);
    const out = { numero, fechaEmision: f.fechaEmision, vendedorId: ref('vendedores', f.vendedorId, { nombre: f.vendedorId }), clienteId: ref('clientes', f.clienteId, { nombre: f.clienteId }), linea: f.linea, canal: f.canal, valorFacturado: escalar(f.valorFacturado, escala) };
    if (f.pctAgencia != null) out.pctAgencia = f.pctAgencia;
    if (f.fechaAnulacion) out.fechaAnulacion = f.fechaAnulacion;
    return out;
  });
  const valorPorFactura = new Map(facturas.map((f) => [f.numero, f.valorFacturado]));

  /** Escala montos ligados a una factura sin superar su valor (el redondeo independiente podría excederlo por un centavo). */
  function escalarLigado(lista, campoRef, campoMonto, campoId, tipo, extraSalida) {
    const acum = new Map();
    return lista.map((x) => {
      const facturaNumero = ref('facturas', x[campoRef]);
      let monto = escalar(x[campoMonto], escala);
      const previo = acum.get(facturaNumero) || 0;
      const tope = valorPorFactura.get(facturaNumero);
      if (tope != null && previo + monto > tope) monto = Math.max(0, Math.round((tope - previo) * 100) / 100);
      acum.set(facturaNumero, previo + monto);
      return { [campoId]: asignar(tipo, x[campoId]), facturaNumero, monto, ...extraSalida(x) };
    });
  }
  const cobros = escalarLigado(dataset.cobros || [], 'facturaNumero', 'monto', 'id', 'cobros', (c) => ({ fechaCobro: c.fechaCobro, medio: conservarMedio ? c.medio || 'transferencia' : 'transferencia' }));
  const notasCredito = escalarLigado(dataset.notasCredito || [], 'facturaNumero', 'valor', 'numero', 'notasCredito', (n) => ({ fecha: n.fecha, motivo: 'Ajuste comercial' })).map(({ monto, ...n }) => ({ ...n, valor: monto }));
  const ajustes = (dataset.ajustes || []).map((a, i) => ({ id: `AJ-${String(i + 1).padStart(4, '0')}`, periodo: a.periodo, vendedorId: ref('vendedores', a.vendedorId, { nombre: a.vendedorId }), monto: escalar(a.monto, escala), motivo: 'Ajuste manual', autor: 'Finanzas', fecha: a.fecha }));
  const esquemas = (dataset.esquemas || []).map((e) => ({ ...e, autor: 'Finanzas', tope: e.tope ? { ...e.tope, monto: escalar(e.tope.monto, escala) } : e.tope, bonos: e.bonos?.clienteNuevo ? { ...e.bonos, clienteNuevo: { ...e.bonos.clienteNuevo, monto: escalar(e.bonos.clienteNuevo.monto, escala) } } : e.bonos }));
  const politicas = (dataset.politicas || []).map((p) => ({ ...p, autor: 'Finanzas' }));

  const salida = { vendedores, agencias, clientes, facturas, cobros, notasCredito, ajustes, esquemas, politicas, cierres: {}, liquidaciones: [], control: { ...(dataset.control || {}) } };
  const suma = (lista, campo) => Math.round(lista.reduce((s, x) => s + Number(x[campo] || 0), 0) * 100) / 100;
  const informe = {
    escala,
    conteos: { vendedores: vendedores.length, agencias: agencias.length, clientes: clientes.length, facturas: facturas.length, cobros: cobros.length, notasCredito: notasCredito.length },
    totales: { facturadoOriginal: suma(dataset.facturas || [], 'valorFacturado'), facturadoAnonimizado: suma(facturas, 'valorFacturado'), cobradoOriginal: suma(dataset.cobros || [], 'monto'), cobradoAnonimizado: suma(cobros, 'monto') },
    eliminado: ['nombres y códigos reales', 'cargos', 'motivos de notas de crédito y ajustes', 'autores de versiones', 'cierres aprobados y estados de liquidación (se recalculan)'],
    conservado: ['fechas', escala !== 1 ? `montos × ${escala}` : 'montos', 'líneas y canales', 'porcentajes de agencia', escala !== 1 ? `cuotas × ${escala}` : 'cuotas', 'parámetros de esquema y política', conservarZona ? 'zonas' : null, conservarMedio ? 'medios de pago' : null].filter(Boolean),
  };
  return { dataset: salida, mapa, informe };
}

export function serializarMapa(mapa, extra = {}) {
  return JSON.stringify({ ...mapa, ...extra, advertencia: 'Este mapa permite reidentificar los datos anonimizados. Custodia exclusiva de INDUVALLAS; no compartir.' }, null, 2);
}
