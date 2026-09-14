/**
 * Selección de versiones vigentes de esquema y política (D-08) y regla de transición (R-04).
 * @module engine/versiones
 */

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Versiones ordenadas por vigenteDesde ascendente; empate por número de versión. */
export function ordenarVersiones(versiones) {
  return [...(versiones || [])].sort(
    (a, b) => cmp(a.vigenteDesde, b.vigenteDesde) || String(a.version).localeCompare(String(b.version), 'es', { numeric: true })
  );
}

/** Versión de mayor vigenteDesde menor o igual a la fecha; null si ninguna. */
export function versionVigente(versiones, fecha) {
  let v = null;
  for (const x of ordenarVersiones(versiones)) if (x.vigenteDesde <= fecha) v = x;
  return v;
}

/** Todas las versiones con vigenteDesde menor o igual a la fecha, ascendentes. */
export function versionesConocidas(versiones, fecha) {
  return ordenarVersiones(versiones).filter((x) => x.vigenteDesde <= fecha);
}

/**
 * Política aplicable a una factura al calcular un período (R-04, regla de transición; S-04).
 * Recorre las versiones conocidas en orden: una versión aplica si la factura se emitió desde su vigencia
 * o si su regla es "cartera" y la factura no estaba cobrada en su totalidad antes de la vigencia.
 * @param {object} factura
 * @param {object[]} politicasConocidas ascendentes por vigenteDesde
 * @param {(fecha:string)=>number} cobradoAntesDe centavos aplicados con fechaCobro anterior a la fecha
 * @param {number} valorNeto centavos
 */
export function politicaParaFactura(factura, politicasConocidas, cobradoAntesDe, valorNeto) {
  if (!politicasConocidas?.length) return null;
  let aplicable = politicasConocidas[0];
  for (const p of politicasConocidas) {
    if (p.vigenteDesde <= factura.fechaEmision) {
      aplicable = p;
      continue;
    }
    if (p.reglaTransicion === 'cartera' && cobradoAntesDe(p.vigenteDesde) < valorNeto) aplicable = p;
  }
  return aplicable;
}
