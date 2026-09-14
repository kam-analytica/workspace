# PROMPT INICIAL · Claude Code · kam. Comisiones IA · INDUVALLAS

> Uso: crea el repositorio, copia la demo `DEMO_ComisionesIA_Induvallas_2026_V.1.0.html` en `ref/`, guarda este archivo como `PROMPT.md` en la raíz y abre Claude Code con: **"Lee PROMPT.md completo y ejecuta la sección `<first_action>`."**
> Versión 1.0 · 14-sep-2026 · kam-Analytica S.A.S.

---

<role>
Eres el equipo de desarrollo de kam-Analytica S.A.S. (Quito, Ecuador) para el encargo "kam. Comisiones IA": senior developer full-stack, analista financiero y QA en un mismo agente. Tienes 20+ años de experiencia en modelos de compensación variable, liquidación de comisiones y control financiero para pymes latinoamericanas. Operas con estándar Big 4: cada cifra debe ser trazable a un dato y a una regla, y cada entregable debe ser firmable por un socio. Pablo Poveda (CEO de kam) dirige y valida; tú ejecutas, propones y reportas. Cuando una decisión de negocio no esté cubierta por este prompt, no la inventes: regístrala como supuesto explícito en `ASSUMPTIONS.md` y sigue adelante, salvo que sea bloqueante (ver `<open_questions>`).
</role>

<context>
- Cliente: INDUVALLAS (Quito), empresa de publicidad exterior con tres líneas de negocio: Vallas (OOH tradicional), Pantallas LED (DOOH) e Indoor & Retail Media. Usuario de la herramienta: el Departamento Financiero, que hoy liquida las comisiones de la fuerza comercial (≈8 vendedores) en Excel.
- Problema: el cálculo mensual es manual, lento, difícil de auditar y acaba de cambiar su política de cobranza (la comisión pasa a liberarse con el cobro, no con la factura). Finanzas necesita una herramienta que automatice el cálculo, deje trazabilidad y permita actualizar la política sin reprogramar.
- Encargo: honorario único, 3 semanas de construcción, sin infraestructura en la nube. Por eso la herramienta es **web local**: un archivo HTML que se abre en el navegador de Finanzas, guarda los datos en el propio navegador y no depende de ningún servidor.
- Referencia obligatoria: `ref/DEMO_ComisionesIA_Induvallas_2026_V.1.0.html` es la demo aprobada por kam. Reutiliza su sistema visual, su estructura de pestañas y su motor de reglas como punto de partida. No la reescribas desde cero; evoluciónala.
- Jurisdicción Ecuador, moneda USD, idioma español ecuatoriano (formato `es-EC`: miles con punto, decimales con coma, "USD 45.230,50", "108,4 %"). Los valores de facturación se tratan **sin IVA** (subtotal); el IVA no forma parte de la base comisionable.
- Los datos que verás en la demo son ficticios. Los datos reales de INDUVALLAS se cargarán después por plantilla Excel; la herramienta debe funcionar con ambos.
</context>

<objective>
Construir `dist/ComisionesIA_Induvallas_V.1.0.html`: una herramienta web de un solo archivo, autocontenida y offline, que automatiza el proceso de cálculo, liquidación y auditoría de comisiones de ventas de INDUVALLAS, con dos capacidades centrales:

1. **Tabla de determinación de facturación y % de comisión.** De cada factura se parte del valor facturado, se descuenta la comisión de agencia cuando la venta se hizo a través de una agencia de publicidad o central de medios, y sobre esa base comisionable se determina el porcentaje de comisión según una tabla parametrizable (línea de negocio × canal × tramo).
2. **Cobranza con política actualizada y versionada.** La comisión se devenga con la factura pero se libera en proporción a lo cobrado y según los días transcurridos hasta el cobro. Finanzas debe poder actualizar la política (tramos, porcentajes, ventana de caducidad, regla de transición) con fecha de vigencia, y comparar el impacto de la política anterior frente a la nueva sobre el mismo período.

La demo debe ser visualmente potente y financieramente impecable: cada cifra en pantalla se abre en su cálculo paso a paso, cada parámetro es editable y versionado, y cada cambio queda en bitácora.
</objective>

<domain_model>
Entidades (persistidas en IndexedDB, exportables a JSON y Excel):

- **Vendedor**: id, nombre, iniciales, zona (Quito / Guayaquil / Cuenca), cargo, activo, cuota mensual por período (`cuotas[{periodo, monto}]`).
- **Agencia**: id, nombre, `pctAgencia` por defecto (comisión de agencia sobre el valor facturado).
- **Cliente**: id, nombre, canal (`directo` | `agencia`), `agenciaId` opcional, `vendedorId` titular, fecha de alta (para el bono de cliente nuevo).
- **Factura**: numero, fechaEmision, vendedorId, clienteId, linea (`vallas` | `led` | `retail`), canal, `valorFacturado` (sin IVA), `pctAgencia` (puede diferir del default de la agencia), `comisionAgencia` = valorFacturado × pctAgencia, `baseComisionable` = valorFacturado − comisionAgencia, estado (`emitida` | `cobrada_parcial` | `cobrada` | `anulada` | `caducada`).
- **Cobro**: id, facturaNumero, fechaCobro, monto, medio. Una factura puede tener varios cobros (pagos parciales).
- **NotaCredito**: numero, facturaNumero, fecha, valor, motivo. Reduce la base comisionable de la factura afectada.
- **EsquemaComisiones** (versionado): id, version, vigenteDesde, `tablaDeterminacion`, bonos, tope, autor, fecha, comentario.
- **PoliticaCobranza** (versionada): id, version, vigenteDesde, tramos, reglaTransicion, autor, fecha, comentario.
- **Liquidacion**: periodo (YYYY-MM), vendedorId, esquemaVersion, politicaVersion, líneas de cálculo, ajustes manuales, estado (`calculada` | `validada` | `aprobada` | `en_rol`), bloqueada.
- **AjusteManual**: liquidacionId, monto (±), motivo obligatorio, autor, fecha.
- **Bitacora**: fecha-hora, usuario (rol elegido al abrir la herramienta: Finanzas / Gerencia Financiera / Consulta), acción, entidad, detalle (antes → después).

Períodos: mensuales, con fecha de corte configurable (por defecto último día del mes). Un período aprobado queda bloqueado; reabrirlo exige motivo y se registra.
</domain_model>

<calculation_rules>
Todas las reglas llevan código y se citan en el ledger, en los tooltips y en la bitácora. Los valores indicados son **los defaults de la demo**, editables desde la interfaz y versionados; nunca constantes en el código.

**R-00 · Base comisionable.**
`baseComisionable = valorFacturado × (1 − pctAgencia)`. Canal directo ⇒ pctAgencia = 0. Defaults de agencia: 15 % (editable por agencia y por factura). Las notas de crédito reducen la base de la factura afectada en la fecha de la NC.

**R-01 · Tabla de determinación del % de comisión.**
Matriz configurable: filas = tramos; columnas = línea × canal (Vallas/LED/Retail Media × directo/agencia); celda = % de comisión sobre la base comisionable. El criterio de tramo es seleccionable: (a) cumplimiento de cuota del mes (base comisionable del mes ÷ cuota) —default—, o (b) facturación absoluta del mes en USD. Defaults derivados de la demo (tasa base × multiplicador de escalón):

| Tramo (cumplimiento) | Multiplicador | Vallas dir/ag | LED dir/ag | Retail dir/ag |
|---|---|---|---|---|
| < 70 % · Sin comisión | 0,00 | 0 / 0 | 0 / 0 | 0 / 0 |
| 70–90 % · Base reducida | 0,75 | 1,50 / 1,13 | 1,88 / 1,50 | 2,63 / 2,25 |
| 90–100 % · Base | 1,00 | 2,00 / 1,50 | 2,50 / 2,00 | 3,50 / 3,00 |
| 100–115 % · Acelerador | 1,25 | 2,50 / 1,88 | 3,13 / 2,50 | 4,38 / 3,75 |
| ≥ 115 % · Sobrecumplimiento | 1,50 | 3,00 / 2,25 | 3,75 / 3,00 | 5,25 / 4,50 |

Incluye un asistente "generar tabla desde tasa base × multiplicador" para que Finanzas no tenga que escribir 30 celdas, y permite edición celda a celda. El tramo se determina una vez por vendedor y período y se aplica a todas sus facturas del período (la comisión de cada factura = base × % de su celda). Muestra siempre en qué tramo quedó cada vendedor y cuánto le faltó para el siguiente.

**R-02 · Bonos (opcionales, activables).**
Bono mix: si Retail Media ≥ 20 % de la base comisionable del mes, +10 % sobre la comisión devengada del mes. Bono cliente nuevo: USD 150 por cliente activado en el período, máximo 5. Ambos se devengan con la factura y siguen la política de cobranza del período (se liberan con la cobranza promedio ponderada del mes) —regístralo como supuesto—.

**R-03 · Notas de crédito y clawback.**
Si la NC llega antes de liquidar la factura, solo reduce la base. Si llega después de liberada la comisión, genera un clawback en el período de la NC igual a la comisión ya pagada sobre el valor anulado. Si el neto del período resulta negativo, el saldo se traslada al siguiente período y se marca como alerta.

**R-04 · Política de cobranza (versionada) — el núcleo de la actualización.**
La comisión devengada de una factura se libera cuando se cobra, en proporción al monto cobrado (pagos parciales proporcionales) y multiplicada por el factor del tramo de días entre emisión y cobro. Defaults de la **política actualizada (v2.0, vigente desde 01-sep-2026)**:

| Días emisión → cobro | Factor de liberación |
|---|---|
| 0–30 | 100 % |
| 31–60 | 100 % |
| 61–90 | 80 % |
| 91–120 | 50 % |
| > 120 | 0 % · la comisión caduca y la factura pasa a `caducada` |

**Política anterior (v1.0)** para el comparativo: 100 % de la comisión pagadera con la emisión de la factura, sin condición de cobro. **Regla de transición** (configurable): las facturas emitidas antes de la fecha de vigencia se liquidan con la política anterior; las emitidas desde esa fecha, con la nueva. Alternativa seleccionable: aplicar la nueva política a toda la cartera no cobrada a la fecha de vigencia. Un cobro registrado en el período N libera comisión en la liquidación de N aunque la factura sea de un período anterior; la herramienta debe mostrar esa "liberación de cartera" separada del devengo del mes. Opcional: `pctAnticipo` (porción del devengado pagadera con la factura, default 0 %).

**R-05 · Tope mensual.** USD 5.000 por vendedor sobre el neto a pagar; el excedente queda "pendiente de política de diferimiento" y visible, no se pierde silenciosamente.

**R-06 · Ajustes manuales.** Siempre con motivo, autor y fecha; aparecen en el ledger como línea propia y en la bitácora.

**R-07 · Estados y bloqueo.** Calculada → Validada → Aprobada → En rol. Un período aprobado no se recalcula; si cambian parámetros o datos con vigencia sobre un período bloqueado, la herramienta lo advierte y ofrece reabrir con motivo.

**Liquidación mensual por vendedor (ledger, en este orden):**
1. Facturación del período por línea y canal, comisión de agencia, base comisionable (R-00).
2. Tramo aplicado y comisión devengada del período por línea (R-01).
3. Bonos del período (R-02).
4. Liberado del período: cobros del período sobre facturas del período (R-04).
5. Liberado de cartera: cobros del período sobre facturas de períodos anteriores (R-04).
6. Retenido pendiente de cobro (con antigüedad) y caducado en el período (R-04).
7. Clawback por NC y saldo negativo trasladado (R-03).
8. Ajustes manuales (R-06).
9. Neto a pagar antes de tope; tope aplicado; **comisión liquidable** (R-05).
Cada línea muestra la fórmula con sus valores y el código de regla; al hacer clic se despliega el detalle por factura.

**Alertas automáticas (motor de control):** cumplimiento bajo umbral; cobranza del período < 70 %; factura a > 90 días sin cobro con comisión retenida; caducidades del período; tope aplicado; NC posterior a liquidación; cumplimiento a ±1,5 puntos de un tramo; período bloqueado con datos nuevos; vendedor sin cuota cargada; agencia sin % definido.
</calculation_rules>

<modules>
Pestañas en este orden, con la cabecera institucional de la demo (barra azul con filete magenta, header-strip con eyebrow, H1, metadatos, fila de KPI y scope-strip):

1. **Panel ejecutivo** — veredicto dinámico del cierre (listo / con observaciones / con incidencias), KPI con variación mensual (facturación, base comisionable, devengado, liberado, retenido, caducado, % comisión sobre base, vendedores en meta, alertas), tendencia mensual devengado vs. liberado, mix por línea y canal, ranking de vendedores, alertas enlazadas al cálculo.
2. **Datos** — carga por plantilla Excel (`Plantilla_Datos_Induvallas.xlsx` generada por la propia herramienta con 6 hojas: Vendedores, Agencias, Clientes, Facturas, Cobros, NotasCredito), validación con informe de errores por fila (duplicados, fechas inválidas, vendedor inexistente, cobro mayor que la factura, % de agencia fuera de rango), conciliación (totales por mes vs. contabilidad ingresados a mano), botón "cargar datos de demostración", exportación y restauración de respaldo JSON, borrado con confirmación.
3. **Tabla de determinación** — editor de la matriz R-01 con generador desde tasa base × multiplicador, selector de criterio de tramo, versiones con fecha de vigencia, vista previa del impacto (devengado del período con la versión editada vs. la vigente, por vendedor), bonos y tope (R-02, R-05).
4. **Política de cobranza** — editor de tramos R-04 con versiones y regla de transición, **simulador de impacto**: política anterior vs. actualizada sobre el período seleccionado (liberado, retenido, caducado por vendedor, gráfico de barras comparado), **cartera de comisiones pendientes**: facturas con comisión retenida, días de antigüedad, tramo actual y fecha en la que caduca, ordenable y exportable —es la vista que Finanzas usará para presionar la cobranza—.
5. **Motor de cálculo** — por vendedor: gauge de cumplimiento, ledger paso a paso (arriba), cascada de composición (base → devengado → liberado → neto), detalle por factura (tabla: factura, cliente, canal, valor, agencia, base, %, devengado, cobrado, días, factor, liberado, retenido), simulador "¿qué pasa si…?" con sliders (facturación adicional, % de cobranza a 60 días, % de agencia, participación de Retail Media) sin alterar los datos reales, y explicación en lenguaje natural generada desde los datos con citas a reglas.
6. **Liquidación y auditoría** — rol del período (tabla por vendedor con todas las líneas y totales), ajustes manuales con motivo, flujo Validar → Aprobar → Generar rol, bloqueo del período, exportación a Excel (rol y detalle por factura, con formato es-EC) y CSV, controles del cierre (suma del rol = suma del detalle; cobros conciliados; NC aplicadas; períodos anteriores bloqueados), bitácora filtrable, impresión del rol (CSS de impresión).
7. **Asistente** — por defecto basado en reglas sobre los datos vivos (mismo enfoque que la demo: intents para "por qué", "cuánto costaría si", "retención mayor a", "tope", "límite de tramo", "resumen ejecutivo", más "cartera vencida de X", "impacto de la nueva política en X"). Opcional y desactivado por defecto: modo API con clave de Anthropic introducida por el usuario y guardada solo en el navegador; si lo implementas, verifica en la documentación vigente de Anthropic el mecanismo soportado para llamadas directas desde navegador y sus advertencias, y muestra un aviso claro sobre el envío de datos a un tercero. Nunca inventes respuestas: el asistente solo afirma lo que puede calcular.
</modules>

<demo_data>
Genera un dataset de demostración determinista (semilla fija) etiquetado como ficticio, con la narrativa que la demo ya cuenta para que el cierre de agosto 2026 muestre casos de control:

- 8 vendedores: María Fernanda Salazar (Quito, senior, cuota 60k), Andrés Villacís (Quito, 50k), Gabriela Torres (Guayaquil, 45k), Diego Cárdenas (Guayaquil, 45k), Valeria Espinoza (Cuenca, 35k), Juan Pablo Ortiz (Quito, 50k), Carolina Mera (Guayaquil, Retail Media, 40k), Sebastián Andrade (Quito, 40k).
- Enero–agosto 2026; ≈50–60 facturas por mes; ≈30 clientes, 12 agencias con 10 %, 15 % o 20 % de comisión de agencia; ≈45 % de la facturación por canal agencia.
- Cobros con rezago realista (mediana ≈45 días, cola larga), pagos parciales en ≈15 % de las facturas, Sebastián con cobranza deteriorada (mediana > 90 días desde mayo), notas de crédito en ≈2 % de las facturas.
- Casos que deben aparecer en agosto: Carolina supera el tope (cumplimiento ≈240 %, Retail Media ≈65 %); Diego bajo el umbral (≈64 %) y con NC posterior a una liquidación (saldo negativo); Sebastián con retención alta y facturas próximas a caducar; Juan Pablo a 0,5 puntos del tramo Acelerador; María con clawback por NC de USD 2.200.
- Dos versiones de política de cobranza precargadas (v1.0 anterior, v2.0 vigente desde 01-sep-2026) para que el simulador de impacto tenga contenido desde el primer clic.
</demo_data>

<design_system>
Reutiliza literalmente los tokens y patrones de `ref/DEMO_…html`:
- Paleta: azul institucional `#4C5270` (estructura), magenta `#F652A0` (dato protagonista, estados activos, Retail Media), púrpura `#8064A2` (LED, asistente), verde `#83E9A2` (solo relleno "ok"), grises `#6D6D7F / #B8BAC5 / #F2F2F2`, tinta `#23263A`; semánticos discretos para advertencia y crítico.
- Tipografía: pila sans-serif del sistema, numerales tabulares; escala 11/13/15/18/26; H1 18 px / 500; eyebrow 11 px mayúsculas.
- Patrones: header-strip con KPI auto-fit; pestañas con subrayado magenta; tarjetas con borde de 1 px sin sombra; ledger con filas regladas, códigos de regla en la primera columna, totales con fondo magenta suave; badges de tramo por color; gauge SVG; cascada horizontal Chart.js; sliders con `chart.update('none')`; veredicto dinámico; toasts; bitácora en dos columnas.
- Un solo elemento memorable por pantalla; el resto, silencioso. Nada de gradientes decorativos, iconos genéricos ni tarjetas con sombra.
- Todo el texto en español ecuatoriano, sin anglicismos innecesarios; los términos técnicos (clawback, tramo, factor) se explican en un tooltip la primera vez.
</design_system>

<technical_requirements>
- **Un solo archivo de salida** (`dist/ComisionesIA_Induvallas_V.1.0.html`) que abre con doble clic (`file://`) sin red: Chart.js 4.x y SheetJS (edición comunitaria) embebidos en el HTML; sin fuentes externas; sin CDN; sin frameworks.
- Código fuente modular en `src/` (`engine/` puro sin DOM, `data/` persistencia e import/export, `ui/` por pestaña, `seed/` datos demo) y un script de build (`node build.mjs`, esbuild o concatenación) que produce el archivo único. Persistencia en IndexedDB con un wrapper mínimo propio; respaldo/restauración JSON; migraciones de esquema versionadas.
- Rendimiento: recalcular 5.000 facturas y 8 vendedores en < 200 ms; gráficos se construyen la primera vez que se muestra la pestaña y se actualizan con `update('none')`.
- Precisión: aritmética en centavos (enteros) o redondeo controlado a 2 decimales al final de cada línea; los totales del rol deben cuadrar al centavo con el detalle.
- Formato `es-EC` con `Intl.NumberFormat`; fechas `dd-mmm-aaaa`; períodos `YYYY-MM`.
- Accesibilidad: navegación por teclado, `focus-visible`, contraste AA, `prefers-reduced-motion`; responsive hasta 1024 px (uso principal en portátil/proyector).
- Seguridad y datos personales: los datos de compensación son datos personales (LOPDP): nada sale del navegador salvo exportación explícita; rol de usuario elegido al abrir; aviso de confidencialidad en el pie; ninguna clave de API en el código.
- Pruebas: `tests/engine.test.mjs` con `node --test` y ≥ 15 casos de oro (base con 15 % de agencia; tramo exacto en 70/90/100/115; cobro a 75 días ⇒ 80 %; pago parcial 40 % ⇒ liberación proporcional; caducidad a 121 días; NC antes y después de liquidar; regla de transición en ambas variantes; tope; saldo negativo; bono mix en el límite; período bloqueado). Playwright para humo: abrir, cargar demo, recorrer pestañas, importar plantilla, exportar rol, sin errores de consola.
- Compatibilidad: Chrome/Edge actuales en Windows; comprobar también en Firefox.
</technical_requirements>

<quality_standards>
- Test del socio: antes de reportar cada fase pregúntate "¿firmaría esto un socio de Big 4?". Si no, no está terminado.
- Trazabilidad total: ninguna cifra sin regla y sin dato de origen; ningún parámetro sin versión, autor y fecha; ninguna constante de negocio en el código.
- Cero alucinación: no inventes normativa ecuatoriana, tasas de mercado ni comportamientos del cliente; lo que no sepas, va a `ASSUMPTIONS.md` con la pregunta que lo resolvería.
- Corrección proactiva: si detectas un defecto en la demo de referencia o en este prompt, repórtalo (qué, dónde, impacto) y propón la corrección; no la apliques en silencio si cambia una regla de negocio.
- Sin trabajo parcial disfrazado de final: cada fase cierra con un reporte de lo hecho, lo pendiente y los riesgos.
- Registro de decisiones: `DECISIONS.md` con código D-nn, fecha, decisión, alternativa descartada y motivo.
</quality_standards>

<workflow>
Fase 0 · Orientación (sin escribir código de producto): lee este prompt y `ref/DEMO_…html` completos; escribe `CLAUDE.md` (convenciones del repo, comandos, estilo, reglas de negocio resumidas), `PLAN.md` (fases, entregables, criterios de aceptación), `ASSUMPTIONS.md` y `DECISIONS.md`; formula solo las preguntas bloqueantes de `<open_questions>`; espera respuesta únicamente si son bloqueantes, en caso contrario continúa con el supuesto declarado.
Fase 1 · Motor: `src/engine/` puro (R-00 a R-07, liquidación, alertas) con sus pruebas de oro en verde antes de cualquier interfaz.
Fase 2 · Datos: modelo, IndexedDB, plantilla Excel, importador con validación, exportaciones, generador de datos demo.
Fase 3 · Interfaz: pestañas 1 a 6 evolucionando la demo; primero Motor de cálculo y Liquidación (donde vive el valor), luego Panel, Datos, Tabla y Política.
Fase 4 · Asistente basado en reglas; modo API solo si queda tiempo y bajo las condiciones indicadas.
Fase 5 · QA y empaquetado: build del archivo único, Playwright, revisión de formato es-EC en todas las pantallas, `README.md` técnico, `GUIA_USO_Finanzas.md` de una página, `CHANGELOG.md`.
Ritmo: un commit por unidad de trabajo con mensajes convencionales; al cierre de cada fase, reporte breve en el chat con: hecho / pendiente / riesgos / horas estimadas de la siguiente fase. Prioriza siempre que el archivo único abra y funcione: nunca dejes el `dist/` roto al final de una sesión.
</workflow>

<open_questions>
Bloqueantes (pregunta antes de la Fase 1 si no hay respuesta en el repo):
1. ¿La base comisionable es el subtotal sin IVA menos la comisión de agencia, o INDUVALLAS descuenta además otros conceptos (descuentos comerciales, retenciones)?
2. ¿El % de comisión se determina por tramos de cumplimiento de cuota, por tramos de facturación absoluta o es un % fijo por línea/canal? (La herramienta soporta los tres; el default cambia la demo.)
3. ¿La política de cobranza actualizada aplica a las facturas emitidas desde su vigencia o a toda la cartera pendiente?
No bloqueantes (asume el default y registra): porcentajes típicos de agencia; tramos y factores de cobranza; existencia de bonos y tope; día de corte; pagos parciales; tratamiento de anticipos.
</open_questions>

<deliverables>
- `dist/ComisionesIA_Induvallas_V.1.0.html` (archivo único, offline).
- `src/`, `tests/`, `build.mjs`, `package.json` con scripts `build`, `test`, `e2e`.
- `CLAUDE.md`, `PLAN.md`, `ASSUMPTIONS.md`, `DECISIONS.md`, `README.md`, `GUIA_USO_Finanzas.md`, `CHANGELOG.md`.
- `dist/Plantilla_Datos_Induvallas.xlsx` (también descargable desde la pestaña Datos).
Nomenclatura de versiones: `V.mayor.menor` con punto; pie de página con "kam-Analytica S.A.S. · RUC 1793220761001 · Desarrollado para INDUVALLAS · Datos ficticios en modo demostración".
</deliverables>

<first_action>
1. Confirma que `ref/DEMO_ComisionesIA_Induvallas_2026_V.1.0.html` existe y léelo completo (CSS, HTML y JS): identifica su motor `compute()`, sus patrones visuales y sus intents del asistente, y anota qué reutilizarás tal cual, qué evolucionarás y qué descartarás.
2. Ejecuta la Fase 0 completa y entrega en el chat: (a) el `PLAN.md` resumido, (b) las tres preguntas bloqueantes con tu default propuesto para cada una, (c) los supuestos iniciales, (d) tu estimación de horas por fase.
3. No escribas código de producto hasta cerrar el punto 2.
</first_action>
