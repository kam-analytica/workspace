# PLAN.md · kam. Comisiones IA · INDUVALLAS

Versión 0.1 · 14-sep-2026 · cierre de Fase 0 (orientación) · kam-Analytica S.A.S.
Fuente de alcance: `PROMPT.md`. Este plan lo operacionaliza; no lo sustituye.

## 1. Síntesis ejecutiva

- Objetivo: entregar `dist/ComisionesIA_Induvallas_V.1.0.html`, herramienta local de un solo archivo que calcula, libera, liquida y audita las comisiones de la fuerza comercial de INDUVALLAS con reglas versionadas R-00 a R-07, evolucionando la demo aprobada.
- Estado: Fase 0 cerrada. Documentos de gobierno creados (`CLAUDE.md`, `PLAN.md`, `ASSUMPTIONS.md`, `DECISIONS.md`). Sin código de producto, conforme a `<first_action>` punto 3.
- Bloqueos antes de la Fase 1: (1) la demo de referencia no está en el repositorio ni se localizó en Drive/Gmail de kam (P-01); (2) las tres preguntas bloqueantes de `<open_questions>` no tienen respuesta en el repositorio (§5).
- Hallazgo material: con la política v2.0 vigente desde 01-sep-2026 y la regla de transición por fecha de emisión (default del prompt), el cierre de agosto 2026 no mostraría retención ni caducidad, en contradicción con los casos exigidos en `<demo_data>` (P-02). Resolución propuesta en §6; requiere decisión de Pablo.
- Esfuerzo estimado: 82 h senior en total (4 h ya consumidas en Fase 0), más 4 h opcionales para el modo API del asistente y 6 h de contingencia si la demo no aparece. Cabe en la ventana de 3 semanas.

## 2. Alcance y entregables

| # | Entregable | Fase |
|---|---|---|
| E1 | `dist/ComisionesIA_Induvallas_V.1.0.html` (archivo único, offline, Chart.js y SheetJS embebidos) | 3 a 5 |
| E2 | `src/` modular (`engine/`, `data/`, `ui/`, `seed/`), `tests/`, `build.mjs`, `package.json` con `build`, `test`, `e2e` | 1 a 5 |
| E3 | `dist/Plantilla_Datos_Induvallas.xlsx` (6 hojas; también descargable desde la pestaña Datos) | 2 |
| E4 | `tests/engine.test.mjs` con ≥ 15 casos de oro en verde; Playwright de humo | 1, 5 |
| E5 | `CLAUDE.md`, `PLAN.md`, `ASSUMPTIONS.md`, `DECISIONS.md` | 0 |
| E6 | `README.md` técnico, `GUIA_USO_Finanzas.md` (una página), `CHANGELOG.md` | 5 |

Fuera de alcance salvo instrucción expresa: infraestructura en la nube, autenticación real, sincronización entre equipos, integración contable, asesoría laboral o legal sobre la política de comisiones.

## 3. Arquitectura propuesta

Flujo de datos:

```
Plantilla Excel / datos demo ─► importador con validación por fila ─► IndexedDB (stores por entidad, versionados)
                                                                          │
      EsquemaComisiones + PoliticaCobranza (versionados) ─────────────────┤
                                                                          ▼
                                                     engine.computeTodo(dataset, opciones)
                                                                          │
                     ┌────────────────────────────────────────────────────┤
                     ▼                                                    ▼
        UI · 7 pestañas (Chart.js)                       exportaciones xlsx / csv / json · impresión
```

Motor (`src/engine/`, puro y determinista):

```
money.js        centavos, redondeo, sumas conciliadas (D-05, D-06)
dates.js        días calendario, período de una fecha, fecha de corte
versiones.js    versión de esquema y política aplicable a un período (D-08)
base.js         R-00 base comisionable por factura, aplicación de NC y anulaciones
tramos.js       R-01 cumplimiento, tramo, % por celda, distancia al siguiente tramo, generador tasa × multiplicador
bonos.js        R-02 bono mix y bono cliente nuevo
cobranza.js     R-04 factor por días, liberación por cobro, pagos parciales, caducidad, transición, anticipo, cartera
clawback.js     R-03 clawback y saldo negativo trasladado
liquidacion.js  ledger de 9 líneas por vendedor y período, R-05 tope, R-06 ajustes, R-07 estados y snapshots
alertas.js      motor de control (10 alertas del prompt)
index.js        computePeriodo() y computeTodo()
```

Firma prevista:

```js
computeTodo(dataset, { hastaPeriodo, hoy, diaCorte })
// dataset: { vendedores, agencias, clientes, facturas, cobros, notasCredito,
//            esquemas, politicas, liquidacionesAprobadas, ajustes }
// → { periodos: { 'YYYY-MM': { [vendedorId]: Ledger } }, cartera: [...], alertas: [...], versionesUsadas }
// Ledger: { lineas: [{ codigo: 'L4', regla: 'R-04', formula, valores, monto, detalle: [...] }], totales, tramo, estado }
```

Los períodos aprobados entran al motor como snapshots inmutables (D-09): el motor no los recalcula, los consume para liberación de cartera, clawback y saldos trasladados.

Datos (`src/data/`): wrapper IndexedDB propio (`db.js`), migraciones secuenciales (`migrations.js`), importador (`import.js`) con informe de errores por fila, plantilla (`plantilla.js`), exportaciones (`export.js`), respaldo JSON (`backup.js`).

Interfaz (`src/ui/`): `app.js` (pestañas, rol, toasts), `format.js`, `components/` (ledger, gauge, badge, cascada, tabla ordenable, bitácora), una carpeta por pestaña.

## 4. Fases, tareas y criterios de aceptación

### Fase 0 · Orientación · 4 h · cerrada 14-sep-2026
Hecho: lectura íntegra del prompt; búsqueda de la demo en repo, Drive y Gmail; creación de `CLAUDE.md`, `PLAN.md`, `ASSUMPTIONS.md`, `DECISIONS.md`, `ref/README.md`; identificación de hallazgos P-01 a P-10; preguntas bloqueantes con default propuesto.
Pendiente: punto 1 de `<first_action>` (lectura de la demo) hasta que el archivo exista.

### Fase 1 · Motor · 16 h
Tareas: `money`, `dates`, `versiones`; R-00 con NC y anulaciones; R-01 con ambos criterios de tramo y generador; R-02; R-04 completo (factor, parcial, caducidad, dos reglas de transición, anticipo, liberación de cartera); R-03 con saldo trasladado; ledger de 9 líneas; R-05; R-06; R-07 con snapshots; alertas; `computeTodo`.
Casos de oro (`tests/engine.test.mjs`, ≥ 15):

| Test | Regla | Caso |
|---|---|---|
| T-01 | R-00 | base con 15 % de agencia |
| T-02 | R-00 | canal directo ⇒ pctAgencia 0 |
| T-03 a T-06 | R-01 | tramo exacto en 70 / 90 / 100 / 115 % (límite inferior inclusivo, D-07) |
| T-07 | R-04 | cobro a 75 días ⇒ 80 % |
| T-08 | R-04 | pago parcial 40 % ⇒ liberación proporcional |
| T-09 | R-04 | caducidad a 121 días |
| T-10 | R-03 | NC antes de liquidar ⇒ solo reduce base |
| T-11 | R-03 | NC después de liberar ⇒ clawback |
| T-12 | R-04 | transición por fecha de emisión |
| T-13 | R-04 | transición sobre cartera no cobrada |
| T-14 | R-05 | tope con excedente visible |
| T-15 | R-03 | saldo negativo trasladado |
| T-16 | R-02 | bono mix exactamente en 20 % |
| T-17 | R-07 | período bloqueado no se recalcula |
| T-18 | ledger | suma del detalle por factura = total del rol, al centavo |
| T-19 | rendimiento | 5.000 facturas y 8 vendedores en < 200 ms |
| T-20 | determinismo | misma entrada ⇒ misma salida (hash) |

Aceptación: 20 tests en verde con `npm test`; sin acceso a DOM ni a IndexedDB desde `engine/`; ninguna constante de negocio en el código.

### Fase 2 · Datos · 14 h
Tareas: modelo y wrapper IndexedDB con migraciones; plantilla Excel de 6 hojas más hoja "Instrucciones" con listas desplegables y ejemplo; importador con informe por fila (duplicados, fechas inválidas, vendedor o cliente inexistente, cobro mayor que la factura, % de agencia fuera de rango, NC mayor que la factura, período aprobado afectado); conciliación mensual contra totales contables ingresados a mano; respaldo y restauración JSON; borrado con confirmación; generador determinista de datos demo con la narrativa de agosto 2026; exportación de rol y detalle a Excel (formato es-EC) y CSV.
Aceptación: la plantilla generada se reimporta sin errores (ida y vuelta); cada regla de validación tiene un caso que la dispara; restaurar un respaldo y recalcular reproduce el mismo hash que la Fase 1; el dataset demo cumple los casos de `<demo_data>` (verificados por test).

### Fase 3 · Interfaz · 32 h
Orden: Motor de cálculo (8 h) → Liquidación y auditoría (6 h) → Panel ejecutivo (6 h) → Datos (4 h) → Tabla de determinación (4 h) → Política de cobranza (4 h).
Aceptación por pestaña:
- Motor de cálculo: gauge, ledger con fórmula y código de regla por línea, detalle por factura al clic, cascada, simulador con sliders que no altera datos, explicación en lenguaje natural con citas a reglas.
- Liquidación y auditoría: rol por vendedor, ajustes con motivo, flujo Validar → Aprobar → Generar rol, bloqueo, exportación Excel y CSV, controles de cierre, bitácora filtrable, impresión.
- Panel ejecutivo: veredicto dinámico, KPI con variación mensual, tendencia devengado vs. liberado, mix por línea y canal, ranking, alertas enlazadas.
- Datos: descarga de plantilla, importación con informe de errores, conciliación, demo, respaldo y restauración, borrado.
- Tabla de determinación: editor de matriz, generador, criterio de tramo, versiones con vigencia, vista previa de impacto, bonos y tope.
- Política de cobranza: editor de tramos, versiones, regla de transición, simulador anterior vs. actualizada con gráfico, cartera de comisiones pendientes ordenable y exportable.
- Transversal: gráficos creados al mostrar la pestaña y actualizados con `update('none')`; formato es-EC en todas las cifras; teclado y `focus-visible`.

### Fase 4 · Asistente · 6 h (+ 4 h opcionales)
Intents basados en reglas: por qué, cuánto costaría si, retención mayor a, tope, límite de tramo, resumen ejecutivo, cartera vencida de X, impacto de la nueva política en X. El asistente solo afirma lo que calcula. Modo API desactivado por defecto; se implementa solo si queda tiempo, tras verificar en la documentación vigente de Anthropic el mecanismo soportado para llamadas desde navegador, con aviso de envío de datos a un tercero y clave guardada únicamente en el navegador.
Aceptación: cada intent responde con cifras trazables al ledger; consulta fuera de alcance recibe respuesta explícita de "no puedo calcularlo".

### Fase 5 · QA y empaquetado · 10 h
Tareas: `build.mjs` (esbuild, código propio legible, vendors embebidos); Playwright de humo (abrir por `file://`, cargar demo, recorrer pestañas, importar plantilla, exportar rol, cero errores de consola); revisión es-EC pantalla por pantalla; prueba en Firefox; `README.md`, `GUIA_USO_Finanzas.md`, `CHANGELOG.md`; pie institucional; aviso LOPDP; test del socio final.
Aceptación: `npm run build && npm test && npm run e2e` en verde; el archivo abre con doble clic sin red; tamaño y tiempo de carga documentados.

### Resumen de horas

| Fase | Horas | Acumulado |
|---|---|---|
| 0 · Orientación | 4 | 4 |
| 1 · Motor | 16 | 20 |
| 2 · Datos | 14 | 34 |
| 3 · Interfaz | 32 | 66 |
| 4 · Asistente | 6 (+4 opc.) | 72 |
| 5 · QA y empaquetado | 10 | 82 |
| Contingencia si la demo no aparece (reconstruir sistema visual desde la especificación) | 6 | 88 |

## 5. Preguntas bloqueantes (responder antes de la Fase 1)

| # | Pregunta | Default propuesto por kam | Motivo |
|---|---|---|---|
| Q1 | ¿La base comisionable es el subtotal sin IVA menos la comisión de agencia, o se descuentan además descuentos comerciales o retenciones? | Subtotal sin IVA − comisión de agencia. Los descuentos comerciales ya están netos en el subtotal facturado. Las retenciones en la fuente no reducen la base ni el cobro aplicado (S-02, S-06). | Es lo que dice R-00; las retenciones son anticipos de impuestos de INDUVALLAS, no un costo de la venta. Si la respuesta es "sí, otros conceptos", la Factura gana un campo `otrosDescuentos` y R-00 lo resta. |
| Q2 | ¿El % de comisión se determina por tramos de cumplimiento de cuota, por tramos de facturación absoluta o es un % fijo por línea y canal? | Cumplimiento de cuota (S-03). | Default del prompt y única lectura compatible con la narrativa de la demo (Carolina 240 %, Diego 64 %, Juan Pablo a 0,5 puntos). El % fijo es un caso degenerado de la matriz (una sola fila), sin código adicional. |
| Q3 | ¿La política v2.0 aplica a las facturas emitidas desde su vigencia o a toda la cartera pendiente a esa fecha? | Por fecha de emisión (S-04), con la alternativa "cartera no cobrada" seleccionable. | Menor riesgo laboral: las comisiones integran la remuneración y aplicar una política menos favorable a comisiones ya devengadas puede ser cuestionado (S-24; INDUVALLAS debe validarlo con su asesor laboral). Tiene un efecto colateral sobre la demo que se resuelve en P-02. |

Formato de respuesta sugerido: "Q1 default / Q2 default / Q3 default / P-02 opción A" o las variantes que correspondan.

## 6. Hallazgos sobre el prompt y el entorno (P-nn)

| # | Hallazgo | Impacto | Propuesta |
|---|---|---|---|
| P-01 | La demo `ref/DEMO_ComisionesIA_Induvallas_2026_V.1.0.html` no existe en el repo ni en Drive ni en Gmail. | Bloquea el punto 1 de `<first_action>` y la Fase 3 ("evolucionar, no reescribir"). | Pablo carga el archivo en `ref/` (o lo adjunta al chat). Si no aparece en la semana 1, se reconstruye el sistema visual desde `<design_system>` (+ 6 h) y se documenta la desviación. |
| P-02 | v2.0 vigente desde 01-sep-2026 + transición por fecha de emisión ⇒ todas las facturas ene-ago 2026 se liquidan con v1.0 (100 % con la emisión). El cierre de agosto no tendría retenido, caducado ni "facturas próximas a caducar", pero `<demo_data>` exige esos casos. | Contradicción entre `<calculation_rules>` R-04 y `<demo_data>`. | Opción A (recomendada): en el dataset ficticio, v2.0 con `vigenteDesde` 01-ene-2026 ("vigencia de demostración") y v1.0 desde 01-ene-2025; el simulador compara ambas sobre cualquier período; con datos reales Finanzas fija 01-sep-2026. Opción B: mantener 01-sep-2026 y usar la regla "cartera no cobrada" como default (más agresiva y con riesgo laboral, S-24). Opción C: mostrar la retención solo en el simulador (la pestaña Motor de cálculo de agosto quedaría sin retención). Se implementa la que Pablo elija. |
| P-03 | La matriz R-01 muestra celdas redondeadas (1,13 / 1,88 / 2,63 / 3,13 / 4,38) mientras el producto exacto es 1,125 / 1,875 / 2,625 / 3,125 / 4,375. | Diferencias de centavos entre "generar desde tasa base" y "tabla del prompt". | Almacenar el valor exacto con hasta 4 decimales de porcentaje y mostrar hasta 3; Finanzas puede redondear celda a celda (S-21, D-05). |
| P-04 | Los tramos "70–90 %", "90–100 %" no definen a qué tramo pertenece el límite exacto. | Ambigüedad en el caso de prueba "tramo exacto en 70/90/100/115". | Límite inferior inclusivo, superior exclusivo (D-07): 90,0 % ⇒ Base; 100,0 % ⇒ Acelerador. |
| P-05 | No se define en qué base se registran los cobros (con o sin IVA, con o sin retenciones). | La proporción cobrado ÷ facturado sería incorrecta si el cobro incluye IVA. | `Cobro.monto` es el valor aplicado a la factura sin IVA, con retenciones como forma de pago (S-06). Si Finanzas registra brutos, la plantilla añade `montoConIVA`. Ligado a Q1. |
| P-06 | Los tramos 0–30 y 31–60 tienen el mismo factor (100 %). | Ninguno funcional. | Se conservan como filas separadas para que Finanzas pueda diferenciarlas; se confirma que es intencional. |
| P-07 | R-03 no define el clawback cuando la factura estaba parcialmente liberada. | Sin fórmula, el resultado no es reproducible. | Clawback = liberado acumulado de la factura × (valorNC ÷ valorFacturado original); la porción retenida se reduce al mismo % de tramo (S-12). |
| P-08 | R-02 dice que los bonos "se liberan con la cobranza promedio ponderada del mes", sin definir el cálculo en períodos posteriores. | Bonos no trazables. | Liberación acumulada del bono = bono × (liberado acumulado ÷ devengado) de las facturas del vendedor en ese período, recalculada cada mes; caduca en la misma proporción (S-11). |
| P-09 | La cuota se compara con la base comisionable (neta de agencia); en la práctica las cuotas suelen fijarse en facturación. | Un vendedor con 45 % de ventas por agencia al 15 % pierde ≈ 7 puntos de cumplimiento. | Default según el prompt (base comisionable); se añade selector "cumplimiento sobre facturación" si INDUVALLAS lo confirma (S-14). |
| P-10 | El repositorio de la sesión es `kam-analytica/workspace` (multi-proyecto), no un repo dedicado. | `CLAUDE.md` raíz no puede ser específico de INDUVALLAS. | Proyecto en `proyectos/induvallas-comisiones-ia/` con `CLAUDE.md` propio; el raíz recibe un índice (D-01). Reversible con `git mv`. |

## 7. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| La demo nunca llega o llega tarde | Media | Alto en Fase 3 | Contingencia de 6 h; motor y datos no dependen de ella |
| Respuestas a Q1–Q3 cambian el modelo de datos | Media | Medio | Motor parametrizado desde el inicio; plantilla Excel se genera desde el modelo |
| Datos reales con casos no previstos (facturas anuladas parcialmente, cobros sin factura) | Alta | Medio | Validación por fila con informe; entidades con estado; bitácora |
| Rendimiento con 5.000 facturas y gráficos | Baja | Medio | Test T-19; gráficos perezosos con `update('none')` |
| IndexedDB borrado por el navegador (limpieza de datos de sitio) | Media | Alto | Respaldo JSON con recordatorio en el cierre de cada período; guía de uso |
| Riesgo laboral por aplicación retroactiva de v2.0 | Media | Alto para el cliente | Advertencia S-24; INDUVALLAS decide con asesor laboral; la herramienta soporta ambas reglas |

## 8. Cronograma (3 semanas, sujeto a respuestas el 15-sep-2026)

| Semana | Fechas | Fases |
|---|---|---|
| 1 | 15-sep a 19-sep-2026 | Fase 1 (motor + tests) y Fase 2 (datos, plantilla, demo) |
| 2 | 22-sep a 26-sep-2026 | Fase 3 (interfaz completa) |
| 3 | 29-sep a 03-oct-2026 | Fase 4, Fase 5, validación de Pablo, V.1.0 |

## 9. Reutilización de la demo (provisional, sin el archivo)

Clasificación basada únicamente en la descripción de `<design_system>` y `<modules>`; se completa al leer el archivo.

- Reutilizar tal cual: tokens de color y tipografía, header-strip con KPI auto-fit, pestañas con subrayado magenta, tarjetas de 1 px sin sombra, ledger reglado con códigos de regla, badges de tramo, gauge SVG, cascada Chart.js, sliders con `update('none')`, veredicto dinámico, toasts, bitácora en dos columnas.
- Evolucionar: `compute()` monolítico ⇒ motor modular con versiones de esquema y política, cobranza R-04, clawback R-03 y snapshots R-07; intents del asistente ⇒ se añaden "cartera vencida de X" e "impacto de la nueva política en X"; datos en memoria ⇒ IndexedDB con importación por plantilla.
- Descartar: datos y constantes de negocio embebidos en el código; cualquier referencia a CDN o fuentes externas; gradientes o iconos decorativos si existieran.
