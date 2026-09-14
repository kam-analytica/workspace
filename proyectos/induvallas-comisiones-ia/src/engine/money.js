/**
 * Dinero en centavos enteros (D-05). Porcentajes como decimales (0.15 = 15 %).
 * Ninguna función de este módulo formatea: el formato es-EC vive en src/ui/format.js.
 * @module engine/money
 */

/** USD decimal (máximo 2 decimales) → centavos enteros. */
export function aCentavos(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n)) return 0;
  // El factor (1 + EPSILON) absorbe el ruido binario (1.005 × 100 = 100.49999999999999) antes de redondear
  return redondear(n * 100 * (1 + Number.EPSILON));
}

/** Centavos → USD decimal. Solo para exportar o mostrar. */
export function deCentavos(centavos) {
  return centavos / 100;
}

/** Redondeo a entero, mitad hacia arriba en valor absoluto (simétrico para negativos). */
export function redondear(x) {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

/** centavos × porcentaje, redondeado a centavos. */
export function aplicarPct(centavos, pct) {
  return redondear(centavos * (Number(pct) || 0));
}

/** Porcentaje con hasta 4 decimales de porcentaje (6 del decimal): 0.01125 = 1,125 % (S-21). */
export function redondearPct(x) {
  return Math.round((Number(x) || 0) * 1e6) / 1e6;
}

/** Suma de una colección aplicando una función (por defecto identidad). */
export function suma(items, f = (x) => x) {
  let total = 0;
  for (const it of items) total += Number(f(it)) || 0;
  return total;
}

/** Razón segura a/b; devuelve null si b es 0 o no finito. */
export function razon(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}
