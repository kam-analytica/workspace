# kam. Comisiones IA · INDUVALLAS · V.1.1

Herramienta web local de un solo archivo para calcular, liberar, liquidar y auditar las comisiones de la fuerza comercial de INDUVALLAS. Se abre con doble clic en el navegador del Departamento Financiero, guarda los datos en el propio navegador (IndexedDB) y no depende de ningún servidor ni conexión.

Desarrollada por kam-Analytica S.A.S. (RUC 1793220761001) conforme a `PROMPT.md`. Datos ficticios en modo demostración.

## Entregables

| Archivo | Contenido |
|---|---|
| `dist/ComisionesIA_Induvallas_V.1.1.html` | La herramienta completa (≈ 1,4 MB): interfaz, motor, Chart.js 4.5.1 y SheetJS CE 0.18.5 embebidos |
| `PROTOCOLO_DATOS_ANONIMIZADOS.md` | Cómo compartir datos reales seudonimizados con kam y qué parámetros acompañan a los datos |
| `dist/Plantilla_Datos_Induvallas.xlsx` | Plantilla de carga con 6 hojas de datos más Instrucciones; también se descarga desde la pestaña Datos |
| `GUIA_USO_Finanzas.md` | Guía de uso de una página para Finanzas |
| `CHANGELOG.md` | Historial de versiones |

## Requisitos

- Chrome o Edge actuales en Windows (uso principal). Verificado también en Chromium con Playwright. Firefox: compatible con IndexedDB y `file://`; ver `CHANGELOG.md` para el estado de la verificación.
- Sin instalación. Copiar el archivo HTML a una carpeta local y abrirlo. Cada navegador y perfil de usuario tiene su propio almacén de datos.

## Estructura del código

```
src/engine/   motor puro y determinista (R-00 a R-07, liquidación, alertas, cartera)
src/data/     validación e importación de la plantilla, exportaciones, respaldo JSON, IndexedDB, repositorio, anonimización, contraste
src/seed/     defaults de demostración y generador determinista del dataset ficticio
src/ui/       interfaz sin frameworks: formato es-EC, componentes, siete pestañas, asistente por reglas
vendor/       Chart.js y SheetJS con licencias y SHA-256
tests/        casos de oro del motor, datos y seed (node --test) y humo en navegador (Playwright)
build.mjs     empaqueta todo en un solo HTML con esbuild
```

## Comandos

```
npm install          # dependencias de desarrollo (esbuild, Playwright, Chart.js, SheetJS)
npm test             # 62 pruebas unitarias e integradas
npm run build        # genera dist/ComisionesIA_Induvallas_V.1.0.html
npm run e2e          # prueba de humo en Chromium sobre dist/
npm run plantilla    # regenera dist/Plantilla_Datos_Induvallas.xlsx
npm run anonimizar   # node scripts/anonimizar.mjs entrada.xlsx salida.xlsx --clave "frase" [--escala 0.8]
```

## Reglas de negocio implementadas

| Código | Regla | Dónde |
|---|---|---|
| R-00 | Base comisionable = valor sin IVA − comisión de agencia; las NC reducen la base | `engine/base.js` |
| R-01 | % de comisión por matriz tramo × línea × canal; tramo por cumplimiento de cuota o facturación | `engine/tramos.js` |
| R-02 | Bono mix Retail Media y bono por cliente nuevo | `engine/bonos.js` |
| R-03 | Notas de crédito: reducen base antes de liquidar; clawback después de liberar; saldo negativo trasladado | `engine/liquidacion.js` |
| R-04 | Política de cobranza versionada: liberación por cobro × factor por días, caducidad, transición, cartera | `engine/cobranza.js`, `engine/versiones.js` |
| R-05 | Tope mensual con excedente visible | `engine/liquidacion.js` |
| R-06 | Ajustes manuales con motivo, autor y fecha | `data/repositorio.js` |
| R-07 | Estados, bloqueo de períodos aprobados (snapshots) y reapertura con motivo | `engine/index.js`, `data/repositorio.js` |

Los parámetros (matriz, bonos, tope, tramos de días, factores, caducidad, regla de transición) nunca son constantes del código: viven en versiones de `EsquemaComisiones` y `PoliticaCobranza` con fecha de vigencia, autor y comentario.

## Precisión y rendimiento

- Aritmética en centavos enteros; el rol cuadra al centavo con el detalle por factura (prueba T-18).
- 5.000 facturas y 8 vendedores en ≈ 70 ms en caliente (prueba T-19).
- Cálculo determinista: misma entrada, misma salida (prueba T-20).

## Datos personales y seguridad

Los datos de compensación son datos personales (LOPDP). La herramienta no realiza ninguna conexión de red (CSP `connect-src 'none'`), no usa fuentes externas ni CDN, y solo saca información del navegador mediante exportaciones explícitas (Excel, CSV, JSON). El rol elegido al abrir no es una autenticación: identifica al usuario en la bitácora. El modo de asistente con API externa no está habilitado en V.1.0.

## Supuestos y decisiones

`ASSUMPTIONS.md` (S-01 a S-35) y `DECISIONS.md` (D-01 a D-30) documentan cada supuesto de negocio pendiente de confirmación y cada decisión técnica con su alternativa descartada. `PLAN.md` recoge las fases y los criterios de aceptación.
