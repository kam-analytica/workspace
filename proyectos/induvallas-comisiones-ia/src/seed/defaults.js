/**
 * Defaults de la demostración (S-26, S-27, S-05). Todo es editable desde la interfaz y versionado; nada de esto
 * es una constante del motor. Datos ficticios: ninguna cifra, cliente o agencia corresponde a INDUVALLAS.
 * @module seed/defaults
 */
import { generarCeldas } from '../engine/parametros.js';

export const ETIQUETA_DEMO = 'Datos ficticios · modo demostración';
export const AUTOR_DEMO = 'kam-Analytica (demo)';

export const CONTROL = { cobranzaMinima: 0.7, diasSinCobro: 90, puntosCercaTramo: 0.015 };

export const TRAMOS = [
  { id: 't0', nombre: 'Sin comisión', desde: 0, multiplicador: 0 },
  { id: 't1', nombre: 'Base reducida', desde: 0.7, multiplicador: 0.5 },
  { id: 't2', nombre: 'Base', desde: 0.9, multiplicador: 1 },
  { id: 't3', nombre: 'Acelerador', desde: 1.0, multiplicador: 1.1 },
  { id: 't4', nombre: 'Sobrecumplimiento', desde: 1.15, multiplicador: 1.25 },
];

/** Tasas del tramo Base. Con los multiplicadores anteriores las celdas van de 0,50 % a 2,00 % (S-26). */
export const TASAS_BASE = {
  vallas: { directo: 0.012, agencia: 0.01 },
  led: { directo: 0.014, agencia: 0.012 },
  retail: { directo: 0.016, agencia: 0.014 },
};

export function esquemaDemo() {
  return {
    id: 'ESQ-2026-01',
    version: '1.0',
    vigenteDesde: '2026-01-01',
    criterioTramo: 'cumplimiento',
    tramos: TRAMOS.map((t) => ({ ...t })),
    tasasBase: JSON.parse(JSON.stringify(TASAS_BASE)),
    celdas: generarCeldas(TASAS_BASE, TRAMOS),
    bonos: { mix: { activo: true, umbralRetail: 0.2, pct: 0.1 }, clienteNuevo: { activo: true, monto: 150, maximo: 5 } },
    tope: { activo: true, monto: 1500 },
    autor: AUTOR_DEMO,
    fecha: '2026-01-01',
    comentario: 'Esquema de demostración. Celdas entre 0,50 % y 2,00 % generadas desde tasa base × multiplicador (S-26). Tope de demostración USD 1.500 (S-27).',
  };
}

export function politicasDemo() {
  return [
    {
      id: 'POL-2025-01',
      version: '1.0',
      vigenteDesde: '2025-01-01',
      modo: 'emision',
      tramos: [],
      caducidadDias: null,
      reglaTransicion: 'emision',
      pctAnticipo: 0,
      autor: AUTOR_DEMO,
      fecha: '2025-01-01',
      comentario: 'Política anterior: 100 % de la comisión pagadera con la emisión de la factura, sin condición de cobro.',
    },
    {
      id: 'POL-2026-01',
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
      autor: AUTOR_DEMO,
      fecha: '2026-01-01',
      comentario: 'Política actualizada: la comisión se libera con el cobro según días emisión → cobro; caduca a los 121 días. Vigencia de demostración 01-ene-2026 (S-05); con datos reales, Finanzas fija la vigencia real.',
    },
  ];
}

const cuotasAnio = (monto) => Array.from({ length: 12 }, (_, i) => ({ periodo: `2026-${String(i + 1).padStart(2, '0')}`, monto }));

export function vendedoresDemo() {
  return [
    { id: 'V01', nombre: 'María Fernanda Salazar', iniciales: 'MS', zona: 'Quito', cargo: 'Ejecutiva senior', activo: true, cuotas: cuotasAnio(60000) },
    { id: 'V02', nombre: 'Andrés Villacís', iniciales: 'AV', zona: 'Quito', cargo: 'Ejecutivo comercial', activo: true, cuotas: cuotasAnio(50000) },
    { id: 'V03', nombre: 'Gabriela Torres', iniciales: 'GT', zona: 'Guayaquil', cargo: 'Ejecutiva comercial', activo: true, cuotas: cuotasAnio(45000) },
    { id: 'V04', nombre: 'Diego Cárdenas', iniciales: 'DC', zona: 'Guayaquil', cargo: 'Ejecutivo comercial', activo: true, cuotas: cuotasAnio(45000) },
    { id: 'V05', nombre: 'Valeria Espinoza', iniciales: 'VE', zona: 'Cuenca', cargo: 'Ejecutiva comercial', activo: true, cuotas: cuotasAnio(35000) },
    { id: 'V06', nombre: 'Juan Pablo Ortiz', iniciales: 'JO', zona: 'Quito', cargo: 'Ejecutivo comercial', activo: true, cuotas: cuotasAnio(50000) },
    { id: 'V07', nombre: 'Carolina Mera', iniciales: 'CM', zona: 'Guayaquil', cargo: 'Ejecutiva Retail Media', activo: true, cuotas: cuotasAnio(40000) },
    { id: 'V08', nombre: 'Sebastián Andrade', iniciales: 'SA', zona: 'Quito', cargo: 'Ejecutivo comercial', activo: true, cuotas: cuotasAnio(40000) },
  ];
}

export function agenciasDemo() {
  const nombres = [
    ['Agencia Cóndor', 0.15],
    ['Central de Medios Pichincha', 0.2],
    ['Ideas 593', 0.1],
    ['Nexo Publicidad', 0.15],
    ['Andes Media', 0.15],
    ['Estudio Guayas', 0.1],
    ['Ruta Creativa', 0.2],
    ['Puntoclave', 0.15],
    ['Marca Sur', 0.1],
    ['Orbe Comunicación', 0.15],
    ['Vértice Medios', 0.2],
    ['Pixel & Papel', 0.1],
  ];
  return nombres.map(([nombre, pct], i) => ({ id: `AG${String(i + 1).padStart(2, '0')}`, nombre, pctAgencia: pct }));
}

/**
 * 32 clientes ficticios. `vendedorId` es el titular. Los dos últimos se activan en agosto 2026 (bono cliente nuevo de Carolina).
 */
export function clientesDemo() {
  const filas = [
    ['C01', 'Lácteos San Isidro', 'V01', 'directo', null, '2024-03-11'],
    ['C02', 'Constructora Horizonte', 'V01', 'agencia', 'AG01', '2023-09-02'],
    ['C03', 'Cadena Farma Salud', 'V01', 'agencia', 'AG02', '2024-06-18'],
    ['C04', 'Bebidas Tropical', 'V01', 'directo', null, '2022-11-05'],
    ['C05', 'Cooperativa Sierra Central', 'V01', 'directo', null, '2025-02-20'],
    ['C06', 'Automotriz Andina', 'V02', 'directo', null, '2023-04-14'],
    ['C07', 'Inmobiliaria Cumbre', 'V02', 'agencia', 'AG03', '2024-08-01'],
    ['C08', 'Moda Urbana', 'V02', 'directo', null, '2025-01-09'],
    ['C09', 'Clínica Los Andes', 'V02', 'agencia', 'AG04', '2023-12-12'],
    ['C10', 'Retail La Cesta', 'V03', 'directo', null, '2022-05-30'],
    ['C11', 'Telecom Andina', 'V03', 'agencia', 'AG06', '2024-02-27'],
    ['C12', 'Aseguradora Sol', 'V03', 'agencia', 'AG07', '2023-07-19'],
    ['C13', 'Universidad del Litoral Ficticia', 'V03', 'directo', null, '2025-03-03'],
    ['C14', 'Electrodomésticos Norte', 'V04', 'directo', null, '2023-10-10'],
    ['C15', 'Restaurantes El Fogón', 'V04', 'agencia', 'AG08', '2024-11-21'],
    ['C16', 'Banca Ficticia del Río', 'V04', 'directo', null, '2022-08-08'],
    ['C17', 'Turismo Cuenca Viva', 'V05', 'directo', null, '2024-05-15'],
    ['C18', 'Cerámicas del Azuay', 'V05', 'agencia', 'AG09', '2023-03-23'],
    ['C19', 'Panificadora Tomebamba', 'V05', 'directo', null, '2025-06-02'],
    ['C20', 'Tecnología Nube 593', 'V06', 'agencia', 'AG10', '2024-01-17'],
    ['C21', 'Supermercados La Rueda', 'V06', 'directo', null, '2022-02-14'],
    ['C22', 'Gimnasios Vital', 'V06', 'directo', null, '2025-04-28'],
    ['C23', 'Editorial Páramo', 'V06', 'directo', null, '2023-06-06'],
    ['C24', 'Cosméticos Aurora', 'V07', 'agencia', 'AG12', '2024-09-09'],
    ['C25', 'Snacks Andinos', 'V07', 'directo', null, '2023-01-31'],
    ['C26', 'Hogar & Deco', 'V07', 'agencia', 'AG01', '2025-05-12'],
    ['C27', 'Bebés y Más', 'V07', 'directo', null, '2024-04-04'],
    ['C28', 'Ferretería El Tornillo', 'V08', 'directo', null, '2023-08-25'],
    ['C29', 'Óptica Mirador', 'V08', 'agencia', 'AG02', '2024-10-30'],
    ['C30', 'Transporte Rápido Express', 'V08', 'directo', null, '2025-07-07'],
    ['C31', 'Helados Glaciar', 'V07', 'directo', null, '2026-08-03'],
    ['C32', 'Librería Cordillera', 'V07', 'agencia', 'AG05', '2026-08-10'],
  ];
  return filas.map(([id, nombre, vendedorId, canal, agenciaId, fechaAlta]) => ({ id, nombre, canal, agenciaId: agenciaId || undefined, vendedorId, fechaAlta }));
}
