# CHANGELOG · kam. Comisiones IA · INDUVALLAS

Nomenclatura `V.mayor.menor`. Fechas dd-mmm-aaaa.

## V.1.1 · 14-sep-2026

Preparación para la validación con datos reales anonimizados de INDUVALLAS.

- Anonimización determinista (`src/data/anonimizar.js`): seudónimos estables por clave para vendedores, agencias, clientes, facturas, cobros y notas de crédito; conserva fechas, montos (con escala opcional), líneas, canales, porcentajes y cuotas; elimina nombres, cargos, motivos y autores; el motor produce el mismo resultado sobre los datos seudonimizados (prueba AN-03). Botón "Exportar copia anonimizada…" en Datos y script `npm run anonimizar`. El mapa de reidentificación se descarga aparte y nunca contiene la clave.
- Contraste con la liquidación histórica (`src/data/contraste.js`): plantilla `Plantilla_Contraste_Comisiones.xlsx`, carga del rol histórico y tabla de diferencias por vendedor y período con tolerancia de USD 1,00, en Liquidación y auditoría.
- `PROTOCOLO_DATOS_ANONIMIZADOS.md`: qué se comparte, pasos para Finanzas, ficha de parámetros reales y consideraciones LOPDP.
- 6 pruebas nuevas (AN-01 a AN-05, CT-01); humo Playwright ampliado con la exportación anonimizada y la plantilla de contraste.
- Reemplazar datos conserva la bitácora (D-28).

## V.1.0 · 14-sep-2026

Primera versión completa del archivo único `dist/ComisionesIA_Induvallas_V.1.0.html`.

### Motor (Fase 1)
- Reglas R-00 a R-07: base comisionable, matriz de tramos con criterio configurable, bonos, política de cobranza versionada con transición por emisión o por cartera, caducidad, clawback por diferencia de estados, tope, ajustes, saldo trasladado, snapshots de períodos aprobados, cartera y 14 alertas del motor de control.
- Aritmética en centavos con conciliación telescópica al centavo; 5.000 facturas en ≈ 70 ms.
- 37 casos de oro en `tests/engine.test.mjs`.

### Datos (Fase 2)
- Plantilla Excel de 6 hojas más Instrucciones; importador tolerante a encabezados con informe de errores por fila; exportación de rol, detalle, cartera y alertas a Excel y CSV es-EC; respaldo JSON versionado; IndexedDB con migraciones y almacén en memoria de respaldo; repositorio con bitácora, versiones append-only, ajustes con motivo, aprobación, reapertura y borrado confirmado.
- Dataset de demostración determinista con la narrativa del cierre de agosto 2026 y períodos enero a julio aprobados por el propio motor.
- 19 pruebas en `tests/data.test.mjs` y `tests/seed.test.mjs`.

### Interfaz (Fases 3 y 4)
- Siete pestañas: Panel ejecutivo, Datos, Tabla de determinación, Política de cobranza, Motor de cálculo, Liquidación y auditoría, Asistente.
- Sistema visual reconstruido desde `<design_system>` del prompt y la identidad kam (cabecera azul con filete magenta, KPI auto-fit, pestañas con subrayado magenta, tarjetas sin sombra, ledger reglado, badges de tramo, gauge SVG, cascada Chart.js, sliders con `update('none')`, veredicto dinámico, toasts, bitácora en dos columnas, impresión).
- Asistente basado en reglas con ocho intents; sin modo API externa.

### Empaquetado (Fase 5)
- `build.mjs` con esbuild: código propio legible, Chart.js 4.5.1 y SheetJS CE 0.18.5 embebidos; CSP sin red.
- Prueba de humo Playwright: rol, demo, siete pestañas, ledger, simulador, asistente, exportación de rol, importación de plantilla, cambio de rol, cero errores de consola.

### Desviaciones documentadas
- La demo de referencia `ref/DEMO_…html` no estuvo disponible; el sistema visual se reconstruyó desde la especificación con autorización de Pablo Poveda (P-01).
- Q2: matriz por tramos con celdas entre 0,50 % y 2,00 % (S-26) y tope de demostración USD 1.500 (S-27), pendientes de confirmación con INDUVALLAS.
- La cascada omite la barra de base comisionable por escala (D-27); la base se muestra como texto.
- Verificación en Firefox pendiente: no disponible en el entorno de construcción (solo Chromium). Se recomienda una prueba manual con `GUIA_USO_Finanzas.md` antes de la entrega al cliente.
