# CHANGELOG · kam. Comisiones IA · INDUVALLAS

Nomenclatura `V.mayor.menor`. Fechas dd-mmm-aaaa.

## V.1.3 · 14-sep-2026

Versión de demostración con los datos del ejercicio dentro de la herramienta.

- Autocarga de la demo: al abrir sin datos se cargan solos los datos ficticios del ejercicio (enero a septiembre 2026, fecha de referencia 14-sep-2026) con registro en la bitácora. Tras «Borrar todos los datos» ya no se recargan solos; el botón «Cargar datos de demostración» sigue disponible. Bandera de build `modoDemo` en `package.json` (D-33).
- Ejercicio de contraste sin archivos: botón «Rol histórico de la demostración» en Liquidación y auditoría. Carga un «Excel anterior» ficticio (enero a agosto, 64 filas) con cuatro diferencias deliberadas y explicadas (NC no descontada R-03, error de digitación, pago duplicado R-06 y pago sin retención por cobranza R-04), cada una con botón «Ver» al lugar del cálculo. Generador determinista `rolHistoricoDemo` en `src/seed/demo.js`; prueba S-10.
- Guion de la demostración con un sexto paso (el contraste) que abre la pantalla con el ejercicio ya cargado; notas «Versión de demostración» en las tarjetas «Cómo usar» de Datos y Liquidación; recorrido y barra de pasos actualizados.
- Humo Playwright: autocarga, sexto paso del guion, contraste embebido y borrado con recarga sin autocarga. `dist/` conserva solo V.1.3.
- Corrección: tras «Borrar todos los datos» el recálculo ya no invoca al motor con un dataset vacío (evitaba errores de consola «Parámetros inválidos»).

## V.1.2 · 14-sep-2026

Capa didáctica para que el usuario sepa qué hacer paso a paso.

- Recorrido inicial de cuatro páginas al abrir por primera vez (reabrible con «Guía paso a paso» o la tecla «?»): qué hace la herramienta, las siete pestañas, cómo leer una comisión y por dónde empezar.
- Barra de pasos del cierre mensual encima del contenido: Cargar datos → Revisar parámetros → Revisar cálculo y alertas → Validar y aprobar → Generar y exportar el rol; marca lo hecho, señala el paso actual con la instrucción concreta y lleva a la pestaña correspondiente.
- Tarjeta «Cómo usar esta pestaña» al inicio de cada pestaña con propósito y pasos numerados (plegable; recuerda su estado).
- Glosario de 26 términos con definición y regla; los términos aparecen subrayados en KPI y ledger, con definición al pasar el ratón y clic para abrir el glosario.
- Guion de la demostración en el Panel ejecutivo: los cinco casos de control de agosto 2026 con qué mirar, reglas y botón «Ver» que abre el cálculo del vendedor.
- Humo Playwright ampliado con recorrido, barra de pasos, guion y glosario.
- `dist/` conserva solo el entregable vigente (V.1.1 queda en el historial de git); el kit de prueba toma la versión desde `package.json`.

## V.1.1 · 14-sep-2026

Preparación para la validación con datos reales anonimizados de INDUVALLAS.

- Anonimización determinista (`src/data/anonimizar.js`): seudónimos estables por clave para vendedores, agencias, clientes, facturas, cobros y notas de crédito; conserva fechas, montos (con escala opcional), líneas, canales, porcentajes y cuotas; elimina nombres, cargos, motivos y autores; el motor produce el mismo resultado sobre los datos seudonimizados (prueba AN-03). Botón "Exportar copia anonimizada…" en Datos y script `npm run anonimizar`. El mapa de reidentificación se descarga aparte y nunca contiene la clave.
- Contraste con la liquidación histórica (`src/data/contraste.js`): plantilla `Plantilla_Contraste_Comisiones.xlsx`, carga del rol histórico y tabla de diferencias por vendedor y período con tolerancia de USD 1,00, en Liquidación y auditoría.
- `PROTOCOLO_DATOS_ANONIMIZADOS.md`: qué se comparte, pasos para Finanzas, ficha de parámetros reales y consideraciones LOPDP.
- 6 pruebas nuevas (AN-01 a AN-05, CT-01); humo Playwright ampliado con la exportación anonimizada y la plantilla de contraste.
- Reemplazar datos conserva la bitácora (D-28).
- Kit de prueba con datos ficticios en `dist/pruebas/` (`npm run prueba`): plantilla rellena, copia anonimizada con mapa, rol histórico con cuatro desviaciones deliberadas e instrucciones con resultados esperados; el script verifica el ciclo importar → calcular → contrastar antes de escribirlas.

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
