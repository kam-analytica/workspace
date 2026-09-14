# CLAUDE.md · kam. Comisiones IA · INDUVALLAS

Guía operativa de este proyecto para Claude Code. Léela completa antes de tocar código. La fuente de verdad del alcance y de las reglas de negocio es `PROMPT.md`; este archivo la resume y fija convenciones. Todo lo que aquí se afirme y contradiga a `PROMPT.md` se resuelve a favor de `PROMPT.md`, salvo decisión registrada en `DECISIONS.md`.

## 1. Qué es este proyecto

Herramienta web local de un solo archivo (`dist/ComisionesIA_Induvallas_V.1.1.html`) que calcula, libera, liquida y audita las comisiones de la fuerza comercial de INDUVALLAS (publicidad exterior, Quito). Usuario: Departamento Financiero. Sin servidor, sin red, sin CDN; datos en IndexedDB del navegador. Jurisdicción Ecuador, moneda USD, idioma español ecuatoriano, formato `es-EC`.

Referencia visual prevista: `ref/DEMO_ComisionesIA_Induvallas_2026_V.1.0.html`. No estuvo disponible; el sistema visual se reconstruyó desde `<design_system>` con autorización de Pablo (S-01). Si aparece, hacer revisión de paridad.

## 2. Estructura del proyecto

```
proyectos/induvallas-comisiones-ia/
├── PROMPT.md            encargo completo (fuente de verdad)
├── CLAUDE.md            este archivo
├── PLAN.md              fases, entregables, criterios de aceptación, horas
├── ASSUMPTIONS.md       supuestos S-nn con la pregunta que los resolvería
├── DECISIONS.md         decisiones D-nn (fecha, alternativa descartada, motivo)
├── ref/                 demo de referencia
├── src/
│   ├── engine/          motor puro: sin DOM, sin IndexedDB, sin Date.now()
│   ├── data/            persistencia IndexedDB, migraciones, import/export, plantilla Excel
│   ├── ui/              una carpeta por pestaña + componentes compartidos + format.js
│   └── seed/            generador determinista de datos de demostración
├── vendor/              Chart.js 4.x UMD y SheetJS CE, con licencia y hash
├── tests/               engine.test.mjs (node --test) y e2e/ (Playwright)
├── build.mjs            produce el archivo único en dist/
├── package.json         scripts build · test · e2e
└── dist/                ComisionesIA_Induvallas_V.1.1.html · Plantilla_Datos_Induvallas.xlsx
```

Todo existe (Fases 0 a 5). `src/ui/` contiene `app.js` (arranque), `estado.js`, `acciones.js`, `dom.js`, `format.js`, `explicar.js`, `simulador.js`, `componentes/` (gauge, ledger, graficos), `pestanas/` (una por pestaña) y `asistente/intents.js`.

## 3. Comandos

```
npm test           # node --test "tests/**/*.test.mjs"   motor (37), datos (10), seed (9), anonimización y contraste (6): 62 casos
npm run plantilla  # node scripts/generar-plantilla.mjs   regenera dist/Plantilla_Datos_Induvallas.xlsx
npm run build      # node build.mjs                        genera dist/ComisionesIA_Induvallas_V.<versionEntregable>.html (≈ 1,4 MB)
npm run anonimizar # node scripts/anonimizar.mjs           seudonimiza una plantilla rellena (ver PROTOCOLO_DATOS_ANONIMIZADOS.md)
npm run prueba     # node scripts/generar-prueba.mjs       regenera dist/pruebas/ (kit de prueba ficticio autoverificado)
npm run e2e        # playwright test                       humo en Chromium sobre dist/ (usa /opt/pw-browsers/chromium si existe)
```

Dependencias de desarrollo: `chart.js@4.5.1` y `xlsx@0.18.5` (SheetJS CE, copiadas a `vendor/` con licencia y hash, D-23), `esbuild@0.28.2` y `@playwright/test@1.63.0`. `npm install` las trae; el motor y las pruebas unitarias corren con Node 22. Tras cualquier cambio en `src/`: `npm test && npm run build && npm run e2e`.

Regla: nunca cerrar una sesión con `dist/` roto. Si el build falla, se corrige o se revierte antes de terminar.

## 4. Convenciones de código

- JavaScript ES2022 con módulos nativos. Sin frameworks, sin TypeScript; tipos documentados con JSDoc.
- `src/engine/` es puro y determinista: recibe datos y parámetros, devuelve resultados. "Hoy" y la fecha de corte llegan como argumentos.
- Dinero: enteros en centavos. Porcentajes: decimales con hasta 4 decimales de porcentaje (0.01125 = 1,125 %). Redondeo a centavos al cierre de cada línea del ledger (D-05, D-06).
- Fechas en datos: cadenas ISO `YYYY-MM-DD`; períodos `YYYY-MM`. Nunca objetos `Date` persistidos. La antigüedad de una factura no se persiste: se calcula al vuelo.
- Entrada del motor: `computeTodo(dataset, { hoy, hastaPeriodo, diaCorte })`. Importes de entrada en USD con 2 decimales; toda salida en centavos enteros. Los períodos aprobados entran como `dataset.cierres[periodo].snapshot` (salida del propio motor) y no se recalculan.
- Formato de salida solo en `src/ui/format.js`: `es-EC` con `Intl.NumberFormat`, "USD 45.230,50", "108,4 %", fechas `dd-mmm-aaaa`.
- Ninguna constante de negocio en el código. Tasas, tramos, factores, bonos y tope viven en `EsquemaComisiones` y `PoliticaCobranza` versionados; los defaults de la demo viven en `src/seed/`.
- Toda regla tiene código (R-00 a R-07) y se cita en ledger, tooltips, bitácora y nombres de tests.
- Español ecuatoriano en interfaz, comentarios y mensajes de commit. Sin anglicismos innecesarios.
- Commits convencionales: `feat(engine): …`, `feat(ui): …`, `fix: …`, `test: …`, `docs: …`, `build: …`. Un commit por unidad de trabajo.
- Sin claves, sin datos reales de INDUVALLAS ni de terceros en el repo. Los datos demo se etiquetan como ficticios.
- Accesibilidad: navegación por teclado, `focus-visible`, contraste AA, `prefers-reduced-motion`.

## 5. Reglas de negocio (resumen; el detalle manda en PROMPT.md)

- R-00 Base comisionable = valorFacturado (sin IVA) × (1 − pctAgencia). Directo ⇒ 0 %. Las NC reducen la base de la factura afectada.
- R-01 % de comisión por matriz tramo × (línea × canal); tramo por vendedor y período según cumplimiento de cuota (default) o facturación absoluta.
- R-02 Bono mix (Retail Media ≥ 20 % de la base ⇒ +10 % del devengado) y bono cliente nuevo (USD 150, máx. 5). Activables.
- R-03 NC antes de liquidar reduce base; NC después de liberar genera clawback; neto negativo se traslada al período siguiente con alerta.
- R-04 Política de cobranza versionada: liberación proporcional al cobro × factor por días emisión→cobro; > 120 días caduca. Regla de transición configurable. Liberación de cartera separada del devengo del mes.
- R-05 Tope USD 5.000 por vendedor sobre el neto; excedente visible como pendiente.
- R-06 Ajustes manuales con motivo, autor y fecha.
- R-07 Estados Calculada → Validada → Aprobada → En rol; período aprobado bloqueado; reapertura con motivo.

Ledger por vendedor y período, en este orden: (1) facturación y base, (2) tramo y devengado, (3) bonos, (4) liberado del período, (5) liberado de cartera, (6) retenido y caducado, (7) clawback y saldo trasladado, (8) ajustes, (9) neto, tope y comisión liquidable.

## 6. Flujo de trabajo

- Fases y criterios de aceptación en `PLAN.md`. Cada fase cierra con reporte: hecho / pendiente / riesgos / horas de la siguiente.
- Supuesto nuevo ⇒ `ASSUMPTIONS.md` (S-nn) con la pregunta que lo resolvería. Decisión técnica ⇒ `DECISIONS.md` (D-nn). Nunca cambiar una regla de negocio en silencio: se reporta y se propone.
- Antes de reportar una fase: test del socio ("¿firmaría esto un socio de Big 4?"). Si la respuesta es no, la fase no está terminada.
- Rama de trabajo: `claude/new-session-jtcits`. Sin push a otras ramas sin autorización.

## 7. Estado

- Fase 0 cerrada el 14-sep-2026. Respuestas de Pablo: Q1 default, Q2 "variable, entre 0,5 % y 2 %" (S-26), Q3 default. P-02 opción A aplicada como default sin objeción.
- Fase 1 cerrada el 14-sep-2026: motor puro en `src/engine/` con 37 casos de oro en verde y 5.000 facturas en ≈ 70 ms en caliente.
- Fase 2 cerrada el 14-sep-2026: `src/data/` (validación, plantilla, importador, exportaciones, respaldo, IndexedDB y repositorio), `src/seed/` (demo determinista con la narrativa de agosto 2026 y cierres enero a julio), 19 pruebas adicionales.
- Fases 3, 4 y 5 cerradas el 14-sep-2026 con autorización de Pablo para reconstruir el sistema visual sin la demo: `src/ui/` completo, asistente por reglas, `build.mjs`, humo Playwright en verde, `README.md`, `GUIA_USO_Finanzas.md`, `CHANGELOG.md`. Entregable V.1.0 en `dist/`.
- V.1.1 (14-sep-2026): anonimización determinista con mapa y clave, contraste con la liquidación histórica y protocolo de datos anonimizados (S-39, S-40). La validación se hará con datos reales seudonimizados de INDUVALLAS.
- Pendientes de validación con Pablo o INDUVALLAS: S-26, S-27, S-35, S-37, S-38, S-39, S-40 y paridad con la demo si aparece. Modo API del asistente no implementado (S-37).
