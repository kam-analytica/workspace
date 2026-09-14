/**
 * Motor de control: catálogo de alertas. Los mensajes no incluyen cifras formateadas; la UI las compone desde `valores`.
 * @module engine/alertas
 */
export const CATALOGO_ALERTAS = {
  'A-01': { severidad: 'advertencia', regla: 'R-01', titulo: 'Cumplimiento bajo el umbral de comisión' },
  'A-02': { severidad: 'advertencia', regla: 'R-04', titulo: 'Cobranza del período por debajo del mínimo de control' },
  'A-03': { severidad: 'advertencia', regla: 'R-04', titulo: 'Factura con comisión retenida y antigüedad sobre el límite de control' },
  'A-04': { severidad: 'critico', regla: 'R-04', titulo: 'Comisión caducada en el período' },
  'A-05': { severidad: 'advertencia', regla: 'R-05', titulo: 'Tope mensual aplicado; excedente pendiente de política de diferimiento' },
  'A-06': { severidad: 'advertencia', regla: 'R-03', titulo: 'Nota de crédito posterior a la liberación: clawback' },
  'A-07': { severidad: 'info', regla: 'R-01', titulo: 'Cumplimiento cerca de un límite de tramo' },
  'A-08': { severidad: 'critico', regla: 'R-07', titulo: 'Período bloqueado con datos nuevos' },
  'A-09': { severidad: 'advertencia', regla: 'R-01', titulo: 'Vendedor sin cuota cargada para el período' },
  'A-10': { severidad: 'advertencia', regla: 'R-00', titulo: 'Agencia sin porcentaje de comisión definido' },
  'A-11': { severidad: 'critico', regla: 'R-03', titulo: 'Saldo negativo trasladado al período siguiente' },
  'A-12': { severidad: 'critico', regla: 'R-07', titulo: 'Sin esquema o política vigente para el período' },
  'A-13': { severidad: 'advertencia', regla: 'R-04', titulo: 'Reversión o liberación adicional por cambio de política de cobranza' },
  'A-14': { severidad: 'advertencia', regla: 'R-07', titulo: 'Devengo o liberación extemporánea de un período bloqueado' },
};

export function crearAlerta(codigo, datos = {}) {
  const c = CATALOGO_ALERTAS[codigo];
  if (!c) throw new Error(`Alerta desconocida: ${codigo}`);
  return { codigo, severidad: c.severidad, regla: c.regla, titulo: c.titulo, ...datos };
}

/**
 * Umbrales de control de respaldo. La aplicación siempre pasa dataset.control desde src/seed;
 * este objeto solo evita que el motor falle si faltan.
 */
export const CONTROL_FALLBACK = Object.freeze({ cobranzaMinima: 0.7, diasSinCobro: 90, puntosCercaTramo: 0.015 });
