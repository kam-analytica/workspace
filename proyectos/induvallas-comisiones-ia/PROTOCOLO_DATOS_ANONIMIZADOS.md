# Protocolo de datos anonimizados · kam. Comisiones IA · INDUVALLAS

Versión 1.0 · 14-sep-2026 · kam-Analytica S.A.S.

## 1. Objetivo

Validar el cálculo de comisiones con datos reales de INDUVALLAS sin que kam reciba datos personales de la fuerza comercial ni datos identificables de clientes. INDUVALLAS seudonimiza los datos en su propio equipo con la herramienta y conserva el mapa de reidentificación; kam solo recibe la copia seudonimizada.

## 2. Qué recibe kam y qué no

| Se comparte (copia anonimizada) | No sale de INDUVALLAS |
|---|---|
| Códigos seudónimos de vendedores, agencias, clientes, facturas, cobros y notas de crédito (por ejemplo `V-K7M2QX`, `C-3F9A2C`) | Nombres, códigos reales, cargos, números reales de factura |
| Fechas de emisión, cobro, nota de crédito y alta de cliente | Motivos de notas de crédito y de ajustes (se generalizan) |
| Montos sin IVA, opcionalmente multiplicados por una escala secreta | Autores de versiones de parámetros |
| Líneas, canales, porcentajes de agencia, zonas, medios de pago | Mapa de reidentificación (`Mapa_Anonimizacion_*_NO_COMPARTIR.json`) y la clave |
| Cuotas mensuales (escaladas si se usa escala) | Cierres aprobados y estados de liquidación (kam los recalcula) |

Los datos seudonimizados producen exactamente el mismo cálculo que los originales (prueba AN-03): la validación con kam es válida sin reidentificar nada.

## 3. Pasos para INDUVALLAS (Finanzas)

1. Cargue el mes o los meses a validar en la herramienta con `Plantilla_Datos_Induvallas.xlsx` (pestaña Datos). Corrija los errores que informe el validador.
2. Cree en la herramienta las versiones reales de parámetros (pestañas Tabla de determinación y Política de cobranza): matriz de porcentajes, bonos, tope, tramos de días, caducidad, regla de transición y fechas de vigencia. Sin estos parámetros el cálculo usa los defaults de demostración.
3. Pestaña Datos → **Exportar copia anonimizada…**. Escriba una clave (mínimo 8 caracteres; la misma clave en meses futuros mantiene los seudónimos) y, si desea ocultar cifras reales, una escala (por ejemplo 0,8). Se descargan dos archivos:
   - `Datos_Anonimizados_<fecha>.xlsx`: se envía a kam.
   - `Mapa_Anonimizacion_<fecha>_NO_COMPARTIR.json`: se guarda en INDUVALLAS. Permite traducir los resultados de kam a los nombres reales.
4. Complete `Plantilla_Contraste_Comisiones.xlsx` (pestaña Liquidación y auditoría → Descargar plantilla de contraste) con la comisión pagada según el Excel actual por vendedor y mes, usando los **códigos seudónimos** del mapa si el archivo va a kam, o los códigos reales si el contraste se hace en INDUVALLAS.
5. Envíe a kam: la copia anonimizada, el contraste (con seudónimos) y la ficha de parámetros de la sección 5. Nunca el mapa ni la clave.

Alternativa sin abrir el navegador: `node scripts/anonimizar.mjs entrada.xlsx salida.xlsx --clave "frase" [--escala 0.8] [--mapa mapa_previo.json]`.

## 4. Qué hace kam con los datos

1. Importa la copia anonimizada con la plantilla y registra los parámetros reales como versiones.
2. Recalcula y compara con el contraste: pestaña Liquidación y auditoría → **Cargar rol histórico…**. Cada diferencia mayor a USD 1,00 se explica con el ledger paso a paso y se documenta (regla, dato o supuesto que la origina).
3. Devuelve a INDUVALLAS el informe de contraste con seudónimos; INDUVALLAS lo reidentifica con su mapa.
4. Al cierre del encargo, kam elimina la copia anonimizada.

## 5. Ficha de parámetros reales que kam necesita junto con los datos

| Parámetro | Regla | Formato esperado |
|---|---|---|
| Cuota mensual por vendedor y mes | R-01 | Columnas `cuota_AAAA-MM` de la hoja Vendedores (en base comisionable o en facturación; indicar cuál) |
| Matriz de porcentajes de comisión por tramo, línea y canal, y criterio de tramo | R-01 | Tabla o descripción; rango indicado por Pablo: 0,5 % a 2 % |
| Bonos (mix Retail Media, cliente nuevo) y tope mensual | R-02, R-05 | Umbral, porcentaje, monto y máximo; tope en USD |
| Política de cobranza anterior (vigencia y regla) | R-04 | Hasta 31-ago-2026: 100 % con la emisión (confirmar) |
| Política de cobranza actualizada | R-04 | Tramos de días y factores, plazo de caducidad, regla de transición, vigencia 01-sep-2026 (confirmar) |
| Base de los cobros | R-00, R-04 | Confirmar que los montos de cobro son sin IVA y que las retenciones cuentan como pago |
| Tratamiento de notas de crédito posteriores al pago | R-03 | Confirmar clawback sobre lo cobrado (D-16) |
| Día de corte del período | R-07 | Último día del mes u otro |

## 6. Consideraciones LOPDP

- La seudonimización con clave y mapa en poder de INDUVALLAS reduce el riesgo de identificación en la copia compartida; para INDUVALLAS, que conserva el mapa, los datos siguen siendo personales y mantienen sus obligaciones como responsable. Referencia: Ley Orgánica de Protección de Datos Personales, definiciones de datos anonimizados y seudonimización (artículo 4; texto vigente pendiente de verificación exacta). Este protocolo no sustituye la evaluación del responsable de protección de datos de INDUVALLAS.
- kam actúa sobre datos seudonimizados sin acceso al mapa; la relación se documenta en el contrato del encargo.
- Los montos escalados y las fechas no permiten reidentificar a una persona por sí solos; si INDUVALLAS considera que patrones de facturación podrían identificar a un vendedor, use la escala y omita las zonas (opción disponible en el script).

*kam-Analytica S.A.S. · RUC 1793220761001 · Desarrollado para INDUVALLAS*
