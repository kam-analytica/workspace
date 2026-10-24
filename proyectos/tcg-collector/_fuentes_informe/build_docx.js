// RIF_Collectr_2026_V_1_0.docx — Ingeniería inversa funcional de Collectr
// Motor: docx-js (matriz de motores kam-house-style §10, Word nuevo con estructura editorial rica)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, WidthType, ShadingType, BorderStyle,
  LevelFormat, PageNumber, PageBreak, TableOfContents, PositionalTab,
  PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader, VerticalAlign,
  Tab, TabStopType,
} = require("docx");

const [, , FIG_DIR, LOGO, OUT] = process.argv;

// ---------------------------------------------------------------- constantes institucionales
const KAM = {
  magenta: "F652A0", azul: "4C5270", grisOscuro: "6D6D7F", grisMedio: "B8BAC5",
  grisClaro: "F2F2F2", blanco: "FFFFFF", purpura: "8064A2", verde: "83E9A2",
};
const FUENTE = "Calibri";
const PT = (n) => n * 2; // half-points
const CONTENT_W = 9072;  // A4 con márgenes de 2,5 cm
const CLIENTE = "Pablo Sebastián Poveda Hurtado";

// ---------------------------------------------------------------- helpers de texto
function runs(text, base = {}) {
  // **negrita** y ~cursiva~ simples (no se usa "_": aparece en nombres técnicos)
  const out = [];
  const re = /(\*\*[^*]+\*\*|~[^~]+~)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const P = (text, opts = {}) => new Paragraph({
  children: runs(text, opts.run || {}),
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 264 },
  keepNext: opts.keepNext,
});

const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)], pageBreakBefore: false });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });

const bullet = (text, level = 0) => new Paragraph({
  children: runs(text),
  numbering: { reference: "vinetas", level },
  alignment: AlignmentType.LEFT,
  spacing: { after: 60, line: 264 },
});
const numbered = (text, ref = "numeros") => new Paragraph({
  children: runs(text),
  numbering: { reference: ref, level: 0 },
  alignment: AlignmentType.LEFT,
  spacing: { after: 80, line: 264 },
});

// Recuadro de implicación práctica ("so what")
const callout = (title, text) => [
  new Paragraph({
    children: [new TextRun({ text: title, bold: true, color: KAM.azul })],
    shading: { type: ShadingType.CLEAR, fill: KAM.grisClaro, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: KAM.magenta, space: 8 } },
    spacing: { before: 120, after: 0 }, indent: { left: 160, right: 160 }, keepNext: true,
  }),
  new Paragraph({
    children: runs(text),
    shading: { type: ShadingType.CLEAR, fill: KAM.grisClaro, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: KAM.magenta, space: 8 } },
    spacing: { before: 0, after: 200, line: 264 }, indent: { left: 160, right: 160 },
    alignment: AlignmentType.JUSTIFIED, keepLines: true,
  }),
];

// ---------------------------------------------------------------- tablas
let nTabla = 0;
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: KAM.grisMedio };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function tableTitle(title) {
  nTabla += 1;
  return new Paragraph({
    children: [new TextRun({ text: `► Tabla ${nTabla}. ${title}`, bold: true, color: KAM.azul, size: PT(12) })],
    spacing: { before: 200, after: 100 }, keepNext: true,
  });
}

function cell(text, width, { header = false, fill, bold = false, align = AlignmentType.LEFT, size = 9 } = {}) {
  const lines = String(text).split("\n");
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: KAM.azul, color: "auto" }
      : fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    verticalAlign: VerticalAlign.CENTER,
    children: lines.map((ln) => new Paragraph({
      children: header
        ? [new TextRun({ text: ln, bold: true, color: KAM.blanco, size: PT(10) })]
        : runs(ln, { size: PT(size), bold: bold || undefined }),
      alignment: align, spacing: { after: 0, line: 252 },
    })),
  });
}

function table(title, headers, rows, widths, opts = {}) {
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== CONTENT_W) throw new Error(`Anchos de "${title}" suman ${sum}, se esperaba ${CONTENT_W}`);
  const out = [];
  if (title) out.push(tableTitle(title));
  out.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, widths[i], { header: true })) }),
      ...rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((c, i) => cell(c, widths[i], {
          fill: ri % 2 === 1 ? KAM.grisClaro : undefined,
          bold: opts.boldFirstCol && i === 0,
          align: (opts.center || []).includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT,
        })),
      })),
    ],
  }));
  if (opts.source) out.push(new Paragraph({
    children: runs(`Fuente: ${opts.source}`, { size: PT(8), color: KAM.grisOscuro, italics: true }),
    spacing: { before: 60, after: 200 },
  }));
  else out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  return out;
}

// ---------------------------------------------------------------- figuras
let nFig = 0;
function figure(file, widthIn, heightIn, caption, source) {
  nFig += 1;
  const wPx = Math.round(widthIn * 96), hPx = Math.round(heightIn * 96);
  return [
    new Paragraph({
      children: [new ImageRun({ type: "png", data: fs.readFileSync(path.join(FIG_DIR, file)), transformation: { width: wPx, height: hPx },
        altText: { title: caption, description: caption, name: file } })],
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Figura ${nFig}. ${caption}`, bold: true, color: KAM.azul, size: PT(9) })],
      alignment: AlignmentType.CENTER, spacing: { after: 20 }, keepNext: true,
    }),
    new Paragraph({
      children: runs(`Fuente: ${source}`, { size: PT(8), color: KAM.grisOscuro, italics: true }),
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
    }),
  ];
}

// ================================================================= CONTENIDO
const C = [];

// ---------------------------------------------------------------- portada
C.push(new Paragraph({ children: [], spacing: { before: 1400 } }));
C.push(new Paragraph({
  children: [new ImageRun({ type: "png", data: fs.readFileSync(LOGO), transformation: { width: 150, height: Math.round(150 / 1.393) },
    altText: { title: "kam. Analytica", description: "Logotipo kam. Analytica", name: "logo" } })],
  alignment: AlignmentType.CENTER, spacing: { after: 1200 },
}));
C.push(new Paragraph({
  children: [new TextRun({ text: "Ingeniería inversa funcional de Collectr", bold: true, size: PT(14), color: KAM.azul })],
  alignment: AlignmentType.CENTER, spacing: { after: 160 },
}));
C.push(new Paragraph({
  children: [new TextRun({ text: "Especificación base, modelo de datos y hoja de ruta para una aplicación propia de registro y valoración de cartas Pokémon TCG", size: PT(12), color: KAM.grisOscuro })],
  alignment: AlignmentType.CENTER, spacing: { after: 600 }, indent: { left: 720, right: 720 },
}));
C.push(new Paragraph({
  children: [new TextRun({ text: "Preparado para: " + CLIENTE, size: PT(10), color: KAM.grisOscuro })],
  alignment: AlignmentType.CENTER, spacing: { after: 60 },
}));
C.push(new Paragraph({
  children: [new TextRun({ text: "Documento de trabajo · Versión 1.0 · Borrador para validación", size: PT(10), color: KAM.grisOscuro })],
  alignment: AlignmentType.CENTER, spacing: { after: 60 },
}));
C.push(new Paragraph({
  children: [new TextRun({ text: "24 de octubre de 2026", size: PT(10), color: KAM.grisOscuro })],
  alignment: AlignmentType.CENTER,
}));
C.push(new Paragraph({ children: [new PageBreak()] }));

// ---------------------------------------------------------------- índice y hoja de control
C.push(new Paragraph({ children: [new TextRun({ text: "Índice", bold: true, size: PT(12), color: KAM.azul })], spacing: { after: 120 } }));
C.push(new TableOfContents("Índice", { hyperlink: true, headingStyleRange: "1-1" }));
C.push(new Paragraph({ children: [], spacing: { after: 240 } }));
C.push(...table("Hoja de control del documento", ["Campo", "Detalle"], [
  ["Documento", "RIF_Collectr_2026_V_1_0.docx — Reporte de Ingeniería Funcional"],
  ["Versión y estado", "1.0 — borrador completo para validación del Socio; no constituye versión final"],
  ["Fecha de corte de la información", "24 de octubre de 2026"],
  ["Preparado por", "Equipo kam. Analytica (ejecución asistida por IA; control de calidad pendiente del Socio)"],
  ["Archivos asociados", "db/schema.sql — modelo de datos PostgreSQL probado (ver sección 7)"],
  ["Nomenclatura", "Sigla «RIF» provisional: no consta en el catálogo de siglas de la Firma; pendiente de ratificación"],
  ["Tipografía", "Calibri. Figuras rasterizadas con Carlito, sustituto métrico declarado de Calibri"],
], [2600, 6472], { boldFirstCol: true }));
C.push(new Paragraph({ children: [new PageBreak()] }));

// ---------------------------------------------------------------- 1. síntesis ejecutiva
C.push(H1("1. Síntesis ejecutiva"));
C.push(P("Se realizó la ingeniería inversa **funcional** de Collectr —la aplicación de referencia para registrar y valorar colecciones de cartas coleccionables (TCG)— con el propósito de especificar una aplicación propia para el registro de cartas Pokémon. El análisis aplicó la disciplina de evidencia de REA (~Reverse Engineer Anything~): cada hallazgo se presenta con su evidencia, su fuente y sus limitaciones."));
C.push(P("**Decisión de alcance.** No se descompiló el APK de Collectr ni se inspeccionó su API privada. Cuatro razones independientes lo desaconsejan: (i) los Términos de Collectr prohíben expresamente la ingeniería inversa y la extracción automatizada de contenido y precios [S9][S10]; (ii) el Art. 134 num. 3 del COESCCI solo ampara la ingeniería inversa con fines de compatibilidad operativa, investigación o educación [S21], y desarrollar una aplicación sustitutiva no encaja con claridad en esos fines; (iii) el propio REA limita su uso a software propio o cuyo examen esté autorizado [S1]; y (iv) el valor diferencial de Collectr no reside en su binario, sino en datos de precios obtenidos de terceros (TCGplayer, eBay, Cardmarket) [S8], cuya obtención fuera de la API oficial vulneraría sus Términos [S9]."));
C.push(P("**Hallazgos principales.**", { after: 60 }));
C.push(bullet("Collectr se articula en cinco capacidades: catálogo multi-TCG (20+ juegos, 200.000+ productos), precios multifuente refrescados cada 1–2 días, portafolios con coste base y ganancias/pérdidas, escáner de cartas y alertas de precio [S4][S6][S8]."));
C.push(bullet("Monetiza con un modelo ~freemium~: la suscripción PRO (USD 7,99/mes o USD 59,99/año, dato de tercero a marzo de 2026) desbloquea escaneo ilimitado, exportación, filtros y portafolios ilimitados [S7][S11]."));
C.push(bullet("Collectr ofrece una **API oficial** para terceros con licencia limitada, no exclusiva y revocable [S9]. Es la única vía lícita para acceder a sus datos; sus condiciones económicas no son públicas."));
C.push(bullet("Para uso personal, el núcleo de valor de Collectr es replicable con fuentes públicas: TCGdex (catálogo multilingüe, gratuito) y pokemontcg.io v2 (precios TCGplayer y Cardmarket), con migración prevista a su sucesor Scrydex [S15][S16]."));
C.push(P("**Ventaja diferencial propuesta.** La aplicación puede superar a Collectr en rigor financiero: coste por identificación específica, asignación del coste de un sellado abierto a las cartas obtenidas por valor de mercado relativo, jerarquía de valoración 1-2-3 que expone la calidad del dato y tratamiento explícito de cartas en español valoradas con mercados de habla inglesa. No se encontró evidencia pública de que Collectr ofrezca estas funciones.", { before: 120 }));
C.push(...table("Cuadro de mando de Collectr", ["Indicador", "Valor observado", "Evidencia"], [
  ["Juegos de cartas cubiertos", "20+", "A [S4]"],
  ["Productos en catálogo", "200.000+ (ficha de App Store); 400.000+ (página de la API)", "A [S4][S9]"],
  ["Frecuencia de actualización de precios", "Cada 1–2 días (detalle de producto)", "A [S8]"],
  ["Fuentes de precio", "TCGplayer, eBay, Cardmarket y potencialmente mercados secundarios; varía por producto", "A [S8]"],
  ["Precio PRO", "USD 7,99/mes · USD 59,99/año (instantánea del 21-mar-2026)", "B [S11]"],
  ["Cartas graduadas", "Solo PSA, según comparativa 2026 y reseña de usuario; pendiente de verificación", "B [S13][S14]"],
], [3000, 4472, 1600], { center: [2] }));
C.push(...callout("Recomendación",
  "Validar el alcance de la Fase 1 (sección 10) y construir el MVP como aplicación web progresiva (PWA) sobre Supabase, con el esquema de datos entregado (db/schema.sql, 10 pruebas superadas). En paralelo, solicitar condiciones de la API oficial de Collectr y de Scrydex para decidir, en un plazo de 30 días, la fuente de precios de largo plazo antes del fin de vida anunciado de pokemontcg.io."));

// ---------------------------------------------------------------- 2. alcance y método
C.push(H1("2. Alcance, objetivo y método"));
C.push(H2("2.1 Objetivo"));
C.push(P("Identificar qué hace Collectr, cómo está organizado funcionalmente y qué modelo de datos requiere una aplicación equivalente, para traducirlo en una especificación ejecutable: modelo de datos, metodología de valoración, arquitectura, fuentes de datos lícitas y hoja de ruta."));
C.push(H2("2.2 Qué es REA"));
C.push(P("REA (~Reverse Engineer Anything~) es una herramienta de código abierto con licencia MIT que expone, mediante un servidor MCP y una línea de comandos, analizadores para binarios nativos, aplicaciones JavaScript/Electron, ensamblados .NET, sitios web, capturas de red y APK de Android (vía JADX). Versión vigente verificada en el registro npm: **6.7.0** (paquete rea-agents, repositorio morluto/rea) [S1]. Su descargo de responsabilidad establece que la herramienta es para investigación lícita, educación, interoperabilidad, preservación de software y análisis de software propio o cuyo examen esté autorizado [S1]."));
C.push(P("Advertencia operativa: el README oficial pide instalar solo desde el repositorio morluto/rea, rea.tools o el paquete npm rea-agents [S1]; una fuente de tercero reporta una copia del repositorio con un ejecutable troyanizado [S3]."));
C.push(H2("2.3 Decisión metodológica: nivel de análisis"));
C.push(...table("Niveles de ingeniería inversa evaluados", ["Nivel", "Qué revelaría", "¿Aplicado?", "Fundamento"], [
  ["Comportamiento observable", "Funciones, flujos, modelo de negocio, fuentes y frecuencia de datos", "Sí", "Información pública; base de este informe"],
  ["Tráfico de red y API privada", "Endpoints y estructura de respuestas", "No", "Prohibido por los Términos [S9][S10]; los datos son licenciados de terceros"],
  ["Descompilación del APK (REA + JADX)", "Clases, métodos y lógica interna", "No", "Términos [S10]; Art. 134 num. 3 COESCCI [S21]; descargo de REA [S1]"],
], [2100, 2700, 1100, 3172], { center: [2] }));
C.push(P("Con independencia de lo anterior, el entorno de ejecución de esta sesión solo tenía salida de red hacia registros de paquetes (npm y PyPI), por lo que tampoco era técnicamente posible obtener el APK ni consultar las páginas de Collectr de forma directa. Los datos de Collectr provienen de las fichas oficiales, su sitio, su FAQ y sus Términos, recuperados mediante buscador."));
C.push(H2("2.4 Escala de evidencia"));
C.push(...table(null, ["Nivel", "Definición"], [
  ["A", "Fuente primaria oficial: fichas de App Store y Google Play, sitio, FAQ, Términos y documentación del proveedor"],
  ["B", "Fuente de tercero: comparativas, agregadores de precios, reseñas, artículos. Puede tener sesgo comercial"],
  ["C", "Inferencia técnica del consultor, no observada directamente"],
], [1000, 8072], { center: [0] }));
C.push(H2("2.5 Limitaciones"));
C.push(bullet("No se usó la aplicación de forma interactiva; las funciones se documentan según sus fichas, sitio y notas de versión."));
C.push(bullet("Las páginas de Collectr se leyeron a través de fragmentos del buscador; existen tres versiones de Términos con redacción distinta y no se confirmó cuál está vigente ni qué ley rige el contrato."));
C.push(bullet("Los precios de suscripción y de APIs de terceros provienen en parte de fuentes B y pueden haber cambiado."));
C.push(bullet("El texto del COESCCI se tomó de una copia publicada por SAYCE; no se cotejó contra el Registro Oficial."));

// ---------------------------------------------------------------- 3. ficha
C.push(H1("3. Collectr: ficha y modelo de negocio"));
C.push(...table("Ficha técnica de Collectr", ["Atributo", "Detalle", "Evid."], [
  ["Plataformas", "iOS (App Store id1603892248), Android (com.collectrinc.collectr) y web (app.getcollectr.com)", "A [S4][S5][S6]"],
  ["Cobertura", "20+ juegos de cartas; cartas sin graduar (raw), graduadas y producto sellado", "A [S4][S5]"],
  ["Propuesta de valor", "Valor del portafolio, ganancias y pérdidas, coste base y tendencias de mercado en un solo panel", "A [S6]"],
  ["Fuentes de precio", "TCGplayer, eBay, Cardmarket y potencialmente mercados secundarios; la fuente depende del producto", "A [S8]"],
  ["Frecuencia", "Precios de detalle de producto actualizados cada 1–2 días", "A [S8]"],
  ["Monetización", "Freemium. PRO mensual USD 7,99 y anual USD 59,99", "B [S11]"],
  ["Funciones PRO", "Escaneo ilimitado, filtros exclusivos, exportación de datos, fondos personalizados, portafolios ilimitados, Marketplace & Social", "A [S4][S7]"],
  ["API para terceros", "Registro en getcollectr.com/api; claves confidenciales; licencia limitada, no exclusiva y revocable para uso en servicio propio", "A [S9]"],
  ["Restricciones contractuales", "Prohíbe ingeniería inversa, descompilación, extracción automatizada y uso de datos obtenidos por scraping", "A [S9][S10]"],
], [2000, 5572, 1500], { boldFirstCol: true, center: [2] }));
C.push(...callout("Implicación",
  "El activo crítico de Collectr es su canal de datos: la correspondencia entre cientos de miles de productos y varias fuentes de precio, refrescada a diario. Para una colección personal de Pokémon basta con un subconjunto acotado de ese canal, que las APIs públicas ya resuelven; el esfuerzo debe concentrarse en el modelo de coste y valoración, no en replicar el catálogo multi-TCG."));

// ---------------------------------------------------------------- 4. inventario funcional
C.push(H1("4. Inventario funcional: matriz hallazgo–evidencia"));
C.push(P("La matriz siguiente aplica el formato de salida de REA —hallazgo, evidencia, fuente— a nivel de comportamiento, y agrega la decisión de diseño para la aplicación propia (MVP = Fase 1; F2/F3 = fases posteriores)."));
C.push(...table("Capacidades observadas en Collectr y decisión para la aplicación propia",
  ["#", "Módulo", "Capacidad observada", "Plan", "Evid.", "Decisión"], [
  ["1", "Catálogo", "Búsqueda en catálogo multi-TCG", "Free", "A [S4]", "MVP, solo Pokémon; nombres en español"],
  ["2", "Catálogo", "Cartas raw, graduadas y sellado", "Free", "A [S5]", "MVP raw y sellado; graduadas con valor manual"],
  ["3", "Portafolio", "Valor total y tendencias del portafolio", "Free", "A [S6]", "MVP"],
  ["4", "Portafolio", "Varios portafolios y vista consolidada «All Portfolios»", "Free / PRO ilimitado", "A [S4][S7]", "MVP"],
  ["5", "Portafolio", "Coste base y ganancias/pérdidas", "—", "A [S6]", "MVP, con identificación específica"],
  ["6", "Portafolio", "Gráfico de valor de un día a todo el histórico; cambio de moneda", "—", "A [S6]", "F2 (USD en MVP)"],
  ["7", "Portafolio", "Selección múltiple: copiar, mover, eliminar", "—", "A [S4]", "F2"],
  ["8", "Portafolio", "Ranking «Most Valuable» por valor de mercado", "—", "A [S5][S6]", "MVP"],
  ["9", "Precios", "Alertas de subida o bajada con objetivo propio", "—", "A [S5]", "F2"],
  ["10", "Escáner", "Escaneo de cartas por cámara", "Free limitado / PRO", "A [S4]", "F2 (OCR de número y set)"],
  ["11", "Datos", "Exportación de la colección", "PRO", "A [S4][S7]", "MVP (CSV)"],
  ["12", "Social", "Marketplace & Social", "PRO", "A [S7]", "Fuera de alcance"],
  ["13", "Social", "Fondos personalizados", "PRO", "A [S4]", "Fuera de alcance"],
  ["14", "Datos", "API pública para terceros", "—", "A [S9]", "Evaluar como fuente"],
  ["15", "Graduadas", "Valoración de graduadas solo PSA", "—", "B [S13][S14]", "F3 (PSA, BGS, CGC)"],
  ["16", "Deseos", "Lista de deseos", "—", "Sin evidencia", "F2 (incluida en el modelo)"],
], [420, 1150, 2952, 1300, 1150, 2100], { center: [0, 4] }));

// ---------------------------------------------------------------- 5. arquitectura inferida
C.push(H1("5. Arquitectura funcional inferida de Collectr"));
C.push(P("La Figura 1 ordena las capacidades observadas en una arquitectura de cinco capas. Las capas de ingesta y de series históricas no son observables desde fuera: se infieren (nivel C) de la combinación de fuentes múltiples, la frecuencia de refresco y la existencia de gráficos históricos."));
C.push(...figure("fig1_arquitectura_collectr.png", 6.3, 4.4, "Arquitectura funcional inferida de Collectr",
  "kam. Analytica con base en [S4]–[S11]. Las insignias A/B/C indican el nivel de evidencia."));
C.push(P("Dos inferencias tienen consecuencias de diseño. Primera: si la fuente de precio varía por producto [S8], Collectr necesita una tabla de correspondencias producto↔fuente; la aplicación propia la replica con external_ref. Segunda: un refresco de 1–2 días implica que el valor mostrado no es un precio en tiempo real, sino la última observación disponible; la aplicación propia lo hace explícito mostrando la fecha y la fuente de cada precio."));

// ---------------------------------------------------------------- 6. fuentes de datos
C.push(H1("6. Fuentes de datos lícitas para la aplicación propia"));
C.push(...table("Fuentes de catálogo y precios evaluadas (estado a octubre de 2026)",
  ["Fuente", "Contenido", "Acceso y costo", "Estado", "Uso propuesto"], [
  ["TCGdex", "Catálogo Pokémon multilingüe; REST y GraphQL; código abierto", "Gratuito, sin clave [S16]", "Activo", "Catálogo y nombres en español (verificar cobertura por set)"],
  ["pokemontcg.io v2", "Catálogo + precios TCGplayer (USD) y Cardmarket (EUR)", "Gratuito con clave; límites diarios según comparativas [S16]", "Legado: Scrydex anuncia fin de vida sin fecha [S15]", "Precios del MVP"],
  ["Scrydex", "Sucesor oficial de pokemontcg.io; historial, graduadas, población", "De pago; desde USD 29/mes según tercero, pendiente de verificación [S17]", "Activo", "Precios de largo plazo"],
  ["JustTCG", "Precios por impresión y estado", "Plan gratuito según la mayoría de fuentes; información contradictoria [S16][S17]", "Activo", "Calibrar factores por estado"],
  ["API oficial de Collectr", "400.000+ productos raw, graduados y sellados", "Registro; condiciones no publicadas; licencia revocable [S9]", "Activo", "Evaluar: única vía lícita a datos de Collectr"],
  ["API de TCGplayer", "Catálogo y precios de TCGplayer", "Cerrada a nuevos desarrolladores [S19]", "No disponible", "No usar; sus términos prohibirían la extracción automatizada, según guía de tercero [S20]"],
  ["PriceCharting", "Precios de graduadas basados en ventas", "De pago, según terceros [S18]", "Activo", "F3: graduadas"],
  ["Banco Central Europeo", "Tipo de cambio de referencia EUR/USD diario", "Gratuito (fuente institucional; verificar formato de consumo)", "Activo", "Convertir Cardmarket a USD"],
], [1450, 2050, 2050, 1450, 2072], { boldFirstCol: true }));
C.push(...callout("Implicación para cartas en español",
  "TCGplayer es un mercado estadounidense de cartas en inglés. Una carta en español con el mismo set y número se valora con ese precio solo como aproximación: el modelo la clasifica en Nivel 2 y permite sustituirla por el precio de Cardmarket o por un valor manual. No se encontró documentación pública de Collectr sobre esta distinción, que es relevante para un coleccionista en Ecuador."));
C.push(P("No se recomienda el exportador de terceros que extrae el portafolio desde la página web de Collectr [S22]: opera mediante extracción automatizada, que los Términos prohíben. Para migrar una colección existente, la vía lícita es la exportación nativa de Collectr (función PRO) [S7]."));

// ---------------------------------------------------------------- 7. modelo de datos
C.push(H1("7. Modelo de datos propuesto"));
C.push(P("El modelo (Figura 2) separa los datos de referencia —catálogo y precios, que provienen de terceros y se recargan— de los datos transaccionales del usuario —lotes, disposiciones y alertas—. La variante del catálogo (impresión + acabado) es la clave que une ambos dominios, porque es la granularidad a la que cotiza el mercado. El script completo está en db/schema.sql."));
C.push(...figure("fig3_modelo_datos.png", 6.3, 7.6, "Modelo de datos de la aplicación propia (esquema tcg)",
  "kam. Analytica, db/schema.sql v1.0."));
C.push(...table("Decisiones de diseño del modelo", ["Decisión", "Fundamento"], [
  ["Precio a nivel de variante × estado × grado", "El mercado cotiza por acabado (normal, holo, reverse holo, primera edición) y, en graduadas, por nota; un precio por carta sería impreciso"],
  ["Idioma como atributo de la copia, no del catálogo", "La misma impresión existe en varios idiomas con igual set y número; el catálogo no se duplica y la valoración aplica el ajuste de mercado"],
  ["Serie de precios acumulativa con linaje", "Cada observación conserva fuente, tipo, fecha y corrida de ingesta (ingest_run): toda cifra es trazable"],
  ["Lote como unidad de coste", "Coste total del lote (precio, envío, comisiones, aranceles); permite identificación específica y ventas parciales"],
  ["Sellado abierto con autorrelación lot → lot", "El coste del sellado se traslada a las cartas obtenidas; la apertura no genera resultado realizado"],
  ["Falla visible", "Sin precio vigente o sin tipo de cambio, el lote queda «sin valorar» y su coste se reporta aparte; nunca se valora en cero"],
  ["Integridad en base de datos", "Disparadores impiden vender más de lo adquirido, fechar una venta antes de la compra o «abrir» una carta"],
], [3000, 6072], { boldFirstCol: true }));
C.push(...table("Pruebas del modelo con datos sintéticos (PostgreSQL 16)", ["Prueba", "Resultado esperado y obtenido", "Estado"], [
  ["T1 Valoración por lote", "TCGplayer prevalece sobre Cardmarket; precio de 60 días descartado por la ventana de 30 días", "Superada"],
  ["T2 Resultado realizado", "Venta de 1 de 2 copias a USD 15,00 con comisión de USD 1,00 sobre coste de USD 10,00: resultado USD 4,00", "Superada"],
  ["T3 Sobre-disposición", "Vender 2 unidades con 1 disponible queda bloqueado", "Superada"],
  ["T4 Apertura indebida", "Registrar la «apertura» de una carta queda bloqueado", "Superada"],
  ["T5 Coste conjunto", "Sellado de USD 50,00 asignado en USD 28,42 / 21,32 / 0,26; suma exacta; rechazo si un hijo no tiene precio", "Superada"],
  ["T5b Residuo de redondeo", "Residuo de –0,01 imputado al lote de mayor valor; suma exacta de USD 50,00", "Superada"],
  ["T6 Resumen de portafolio", "Valor, coste, coste sin valorar y participación por nivel (87,45 % / 10,23 % / 2,31 %)", "Superada"],
  ["T7 Alertas", "Dispara «por encima de 11,00» con precio 12,00; no dispara «por debajo de 1,00» con 2,20", "Superada"],
  ["T8 Instantánea diaria", "Ejecución repetida el mismo día no duplica registros", "Superada"],
  ["T9 Búsqueda difusa", "Encuentra el nombre localizado con pg_trgm", "Superada"],
  ["T10 Restricciones", "Graduada con cantidad 2 y nota 9,3 rechazadas", "Superada"],
], [2200, 5672, 1200], { boldFirstCol: true, center: [2],
  source: "kam. Analytica. Los importes son sintéticos, construidos solo para probar la lógica; no son precios de mercado." }));

// ---------------------------------------------------------------- 8. valoración
C.push(H1("8. Metodología de coste y valoración"));
C.push(P("Las referencias a NIC 2 y NIIF 13 de esta sección son **analogías metodológicas** (criterio del consultor): un coleccionista persona natural no está obligado a aplicarlas, pero aportan un marco probado, coherente y auditable para medir coste y valor."));
C.push(H2("8.1 Coste: identificación específica"));
C.push(P("Cada lote conserva su coste propio, en línea con NIC 2 párr. 23, que exige la identificación específica para partidas no intercambiables entre sí. Una carta concreta en un estado concreto es, en la práctica, no intercambiable."));
C.push(P("Coste base vigente del lote = coste total del lote × (cantidad en mano ÷ cantidad adquirida).", { align: AlignmentType.CENTER, run: { italics: true, color: KAM.azul } }));
C.push(H2("8.2 Sellado abierto: asignación de coste conjunto"));
C.push(P("Al abrir un sobre o una caja, el coste del sellado se distribuye entre las cartas obtenidas en proporción a su valor de mercado a la fecha de apertura, por analogía con el tratamiento de productos conjuntos de NIC 2 párr. 14. Sin esta asignación, las cartas obtenidas tendrían coste cero y el resultado de la colección quedaría sobrestimado."));
C.push(P("Coste asignado(i) = coste del sellado × V(i) ÷ ΣV,  con V(i) = cantidad(i) × precio unitario(i) a la fecha de apertura.", { align: AlignmentType.CENTER, run: { italics: true, color: KAM.azul } }));
C.push(P("El residuo de redondeo se imputa al lote de mayor valor para que la suma cuadre al centavo. Para aperturas antiguas sin historial de precios, la función admite una fecha de valoración alternativa, que se declara como aproximación."));
C.push(H2("8.3 Valor de mercado: cascada de precios"));
C.push(...figure("fig4_cascada_valoracion.png", 6.3, 4.4, "Cascada de selección del precio unitario",
  "kam. Analytica, función unit_price_usd() de db/schema.sql."));
C.push(H2("8.4 Jerarquía de valoración"));
C.push(P("Cada lote valorado recibe un nivel, por analogía con la jerarquía de valor razonable de NIIF 13 (párr. 76, 81 y 86). El panel muestra qué porcentaje del valor de la colección descansa en cada nivel: es un indicador directo de la calidad del dato."));
C.push(...table("Criterios de nivel de valoración", ["Nivel", "Criterio en la aplicación", "Ejemplo"], [
  ["1", "Precio de mercado activo para la misma variante, con estado exacto (o agregado aplicado a NM) y en el idioma de ese mercado", "Carta en inglés NM con TCGplayer Market Price"],
  ["2", "Dato observable que requiere ajuste: otro mercado, otro idioma o estado inferido de un precio agregado", "Carta en español valorada con TCGplayer o con Cardmarket convertido a USD"],
  ["3", "Estimación manual sin dato de mercado observable", "Graduada sin fuente de precio; error de impresión"],
], [900, 5072, 3100], { center: [0] }));
C.push(H2("8.5 Métricas del panel"));
C.push(bullet("**Valor de mercado:** suma de cantidad en mano × precio unitario, solo de lotes valorados."));
C.push(bullet("**Resultado no realizado:** valor de mercado – coste base de los lotes valorados."));
C.push(bullet("**Resultado realizado:** ingresos netos de ventas – coste liberado por identificación específica."));
C.push(bullet("**Coste sin valorar y lotes sin precio:** se exponen aparte, para no mezclar coste sin contrapartida de valor."));
C.push(bullet("**Rendimiento acumulado (propuesto para F2):** (resultado realizado + resultado no realizado) ÷ coste total adquirido; y TIR por flujos fechados en F3."));
C.push(P("Los factores de ajuste por estado (LP, MP, HP, DMG) se entregan en 1,000, es decir, neutros. No se fijan valores por defecto porque no se dispone de evidencia que los sustente; deben calibrarse con precios por estado (por ejemplo, de JustTCG) antes de activarlos."));

// ---------------------------------------------------------------- 9. arquitectura propuesta
C.push(H1("9. Arquitectura y tecnología recomendadas"));
C.push(...figure("fig2_arquitectura_propuesta.png", 6.3, 3.5, "Arquitectura propuesta para la aplicación propia",
  "kam. Analytica."));
C.push(...table("Comparación de alternativas de cliente", ["Criterio", "A. PWA (React/Next.js)", "B. Expo (React Native)", "C. Flutter"], [
  ["Tiempo a MVP", "Menor", "Medio", "Medio"],
  ["Cámara y escáner", "Suficiente vía navegador", "Nativa, mejor rendimiento", "Nativa"],
  ["Funcionamiento sin conexión", "Limitado", "Bueno (SQLite local)", "Bueno"],
  ["Distribución", "Por URL, instalable desde el navegador", "Tiendas de apps (cuentas de desarrollador; verificar tarifas)", "Tiendas de apps"],
  ["Reutiliza el esquema tcg", "Sí", "Sí", "Sí"],
  ["Recomendación", "MVP (Fase 1)", "Si escáner u offline se vuelven críticos", "No prioritaria"],
], [2200, 2300, 2572, 2000], { boldFirstCol: true }));
C.push(P("Criterios transversales: las claves de API residen solo en funciones del servidor (Edge Functions), nunca en el cliente; la seguridad a nivel de fila (RLS) aísla los datos por usuario; y la ingesta diaria registra su linaje en ingest_run. Para el escáner (F2) se propone reconocer por OCR el número de colección y el código de set impresos en la carta, con confirmación manual, antes que un modelo de reconocimiento de imagen; es la opción de menor costo y mayor precisión esperada para un catálogo cerrado (criterio técnico, a validar con prototipo)."));
C.push(P("Opción de ejecución acelerada: el conector de Lovable disponible en esta cuenta genera aplicaciones React sobre Supabase; el esquema tcg puede cargarse como migración inicial."));

// ---------------------------------------------------------------- 10. hoja de ruta
C.push(H1("10. Hoja de ruta"));
C.push(...table("Historias de usuario priorizadas", ["ID", "Como coleccionista, quiero…", "Criterio de aceptación", "Fase"], [
  ["HU-01", "Buscar una carta por nombre (español o inglés), set o número", "Resultados con imagen, set, número y acabados", "F1"],
  ["HU-02", "Registrar un lote: cantidad, estado, idioma, coste, fecha y canal", "El lote aparece en el portafolio con su coste base", "F1"],
  ["HU-03", "Registrar un sellado, su apertura y las cartas obtenidas", "Coste asignado por valor relativo; suma exacta", "F1"],
  ["HU-04", "Ver el valor de mi colección y su resultado no realizado", "Panel con valor, coste, resultado, % por nivel y lotes sin precio", "F1"],
  ["HU-05", "Registrar ventas e intercambios", "Resultado realizado por identificación específica", "F1"],
  ["HU-06", "Tener varios portafolios y una vista consolidada", "Totales por portafolio y global", "F1"],
  ["HU-07", "Exportar mi colección a CSV", "Todas las columnas de v_lot_position", "F1"],
  ["HU-08", "Ver la evolución histórica del valor", "Gráfico a partir de instantáneas diarias", "F2"],
  ["HU-09", "Mantener una lista de deseos con alertas", "Aviso cuando el precio cruza el umbral", "F2"],
  ["HU-10", "Escanear una carta con la cámara", "Identifica set y número; confirmación manual", "F2"],
  ["HU-11", "Importar mi exportación de Collectr", "Mapeo del archivo a lotes con informe de no coincidencias", "F2"],
  ["HU-12", "Valorar cartas graduadas (PSA, BGS, CGC)", "Precio por nota desde fuente de pago o valor manual", "F3"],
], [800, 3300, 4072, 900], { center: [0, 3] }));
C.push(...table("Fases de ejecución", ["Fase", "Alcance", "Criterio de salida", "Tamaño relativo"], [
  ["F0 Preparación", "Proyecto Supabase, carga del esquema, claves de API, carga del catálogo de los sets de interés, decisión de fuente de precios", "Catálogo cargado y una corrida de ingesta exitosa", "Pequeño"],
  ["F1 MVP", "HU-01 a HU-07", "Colección real registrada y valorada; lotes sin precio identificados", "Medio"],
  ["F2 Ampliación", "HU-08 a HU-11; calibración de factores por estado", "Alertas operativas; escáner con tasa de acierto medida", "Medio-grande"],
  ["F3 Avanzada", "HU-12; multimoneda; TIR; compartir colección", "Graduadas valoradas con fuente de mercado", "Grande"],
], [1500, 3600, 2672, 1300], { boldFirstCol: true,
  source: "Tamaños relativos según criterio del consultor; no constituyen estimación de horas." }));

// ---------------------------------------------------------------- 11. legal y riesgos
C.push(H1("11. Marco legal y matriz de riesgos"));
C.push(...table("Marco normativo, contractual y jurisprudencial", ["Fuente", "Disposición relevante", "Naturaleza", "Implicación"], [
  ["Términos de Collectr (sitio y API)", "Prohíben ingeniería inversa, descompilación, extracción automatizada y uso de datos obtenidos por scraping; la licencia de API es limitada y revocable", "Contrato", "La descompilación o el uso de la API privada expone a incumplimiento contractual, cierre de cuenta y reclamos. Ley aplicable pendiente de verificación"],
  ["COESCCI, Art. 134 num. 3 (R.O. Supl. 899, 9-dic-2016)", "Permite la ingeniería inversa sobre una copia legítima solo para compatibilidad operativa entre programas o con fines de investigación y educativos", "Norma vigente", "Desarrollar una aplicación sustitutiva no encaja con claridad; importar la propia exportación de Collectr (interoperabilidad) sí es defendible y no requiere ingeniería inversa"],
  ["COESCCI, Art. 132", "Adaptaciones necesarias para el uso del software por su usuario legítimo, sin fines comerciales", "Norma vigente", "Sin efecto práctico para este proyecto"],
  ["Excepción legal frente a prohibición contractual", "No se encontró jurisprudencia ni doctrina ecuatoriana sobre si un contrato puede restringir la excepción del Art. 134", "Zona gris", "Riesgo no cuantificable: refuerza la decisión de no descompilar"],
  ["EE.UU. (si rigiera su ley)", "Sega v. Accolade, 977 F.2d 1510 (9th Cir. 1992): desensamblado para interoperabilidad como uso legítimo. Bowers v. Baystate, 320 F.3d 1317 (Fed. Cir. 2003) y Davidson & Assocs. v. Jung, 422 F.3d 630 (8th Cir. 2005): las cláusulas que prohíben la ingeniería inversa son exigibles. 17 U.S.C. §1201(f): excepción estrecha de interoperabilidad", "Jurisprudencia extranjera", "Referencia comparada: la tendencia es hacer valer la prohibición contractual"],
  ["Términos de la API de TCGplayer", "Prohibirían la recolección automatizada fuera de la API (según guía de tercero; texto no revisado directamente)", "Contrato", "No extraer precios del sitio de TCGplayer"],
  ["Propiedad intelectual de Pokémon", "Imágenes, nombres y marcas pertenecen a sus titulares", "Criterio del consultor", "Uso personal de bajo riesgo; si se publica, no usar «Pokémon» ni «Collectr» en nombre o logotipo y respetar los términos de cada API"],
  ["LOPDP (R.O. Supl. 459, 26-may-2021; número de suplemento pendiente de verificación)", "Tratamiento de datos personales", "Norma vigente", "Aplica solo si la aplicación se abre a terceros (correo, colección, fotografías)"],
], [1900, 2900, 1300, 2972], { boldFirstCol: true }));
C.push(...table("Matriz de riesgos del proyecto", ["Riesgo", "Prob.", "Impacto", "Mitigación"], [
  ["Discontinuación de pokemontcg.io v2", "Alta", "Medio", "Adaptadores por fuente (price_source, external_ref); plan B con Scrydex o JustTCG"],
  ["Cartas en español valoradas con mercado en inglés", "Alta", "Medio", "Nivel 2 explícito; Cardmarket o valor manual"],
  ["Graduadas sin fuente de precio", "Alta", "Medio-alto: concentran valor", "Valor manual de Nivel 3 hasta F3"],
  ["Precio desactualizado mostrado como vigente", "Media", "Medio", "Ventana de 30 días; fecha y fuente visibles en cada lote"],
  ["Exposición de claves de API en el cliente", "Media", "Medio", "Claves solo en Edge Functions; auditoría del propio bundle con REA antes de publicar"],
  ["Cambio de términos de los proveedores", "Media", "Medio", "Revisión trimestral; linaje en ingest_run"],
  ["Uso de la API privada o del binario de Collectr", "Evitado por diseño", "Alto", "No se utiliza; acceso solo por la API oficial si se contrata"],
], [2900, 1000, 1800, 3372], { center: [1] }));
C.push(P("Fuera de alcance: si las ventas de cartas llegaran a ser habituales, podrían configurar una actividad económica con efectos tributarios; su evaluación requiere un análisis específico."));

// ---------------------------------------------------------------- 12. REA lícito
C.push(H1("12. Uso lícito de REA dentro del proyecto"));
C.push(P("REA sigue siendo útil en este proyecto cuando se aplica sobre software propio o autorizado:"));
C.push(...table("Casos de uso de REA en el proyecto", ["Caso", "Objetivo", "Base de licitud"], [
  ["Auditar el APK o el bundle web de la aplicación propia antes de distribuirla", "Detectar claves expuestas, permisos excesivos del manifiesto y dependencias", "Software propio"],
  ["Analizar capturas HAR del tráfico de la aplicación propia", "Depurar la integración con las APIs de catálogo y precios", "Software propio"],
  ["Estudiar aplicaciones de código abierto con licencia permisiva", "Tomar referencias de patrones, por ejemplo de escáneres de cartas", "Licencia del proyecto estudiado"],
], [3000, 3872, 2200], { boldFirstCol: true }));
C.push(P("Requisitos según el README: Node.js 22.x (≥ 22.19), 24.x (≥ 24.11) o 26+, y para APK, JADX sin interfaz y un JDK completo. Instalación desde la fuente oficial: npx rea-agents setup [S1]."));

// ---------------------------------------------------------------- 13. próximos pasos
C.push(H1("13. Decisiones pendientes y próximos pasos"));
C.push(numbered("Validar el alcance del MVP (sección 4 y Tabla de historias de usuario)."));
C.push(numbered("Confirmar la alternativa de cliente: PWA recomendada para la Fase 1."));
C.push(numbered("Solicitar condiciones de la API oficial de Collectr y de Scrydex; decidir la fuente de precios de largo plazo en 30 días."));
C.push(numbered("Obtener la clave gratuita de pokemontcg.io para la Fase 1."));
C.push(numbered("Si mantiene una colección en Collectr con plan PRO, exportarla para la migración (HU-11)."));
C.push(numbered("Definir si la aplicación será solo personal o abierta a terceros: cambia el tratamiento de datos personales, de propiedad intelectual y de costos."));
C.push(P("Con su validación, el siguiente entregable es la Fase 0–1 funcional: proyecto Supabase con el esquema tcg, función de ingesta diaria y cliente PWA con las historias HU-01 a HU-07.", { before: 120 }));

// ---------------------------------------------------------------- anexos
C.push(new Paragraph({ children: [new PageBreak()] }));
C.push(H1("Anexo A. Fuentes consultadas"));
C.push(P("Fecha de consulta: 24 de octubre de 2026. Nivel de evidencia según la escala de la sección 2.4.", { after: 60 }));
C.push(...table(null, ["Ref.", "Fuente", "Evid."], [
  ["S1", "Paquete npm rea-agents v6.7.0 y README del repositorio morluto/rea — registry.npmjs.org/rea-agents (consulta directa)", "A"],
  ["S2", "Repositorio oficial de REA — github.com/morluto/rea", "A"],
  ["S3", "Verificación sobre REA y alerta de copia troyanizada — pasqualepillitteri.it/es/news/23847", "B"],
  ["S4", "Collectr en App Store — apps.apple.com/us/app/collectr-tcg-collector-app/id1603892248", "A"],
  ["S5", "Collectr en Google Play — play.google.com/store/apps/details?id=com.collectrinc.collectr", "A"],
  ["S6", "Sitio de Collectr — getcollectr.com y getcollectr.com/track", "A"],
  ["S7", "Collectr PRO — getcollectr.com/pro", "A"],
  ["S8", "FAQ de Collectr «Where do the Prices Come From?» — getcollectr.notion.site", "A"],
  ["S9", "API y Términos de la API de Collectr — getcollectr.com/api y getcollectr.com/api-terms-and-conditions.html", "A"],
  ["S10", "Términos y Condiciones de Collectr — www.getcollectr.com/terms-and-conditions.html y getcollectr.com/marketing-website/terms-and-conditions.html", "A"],
  ["S11", "App Pricing Lab, compras integradas de Collectr (21-mar-2026) — apppricinglab.com/iap/apple/1603892248", "B"],
  ["S12", "TCG Stacked vs Collectr (competidor) — tcgstacked.com/compare/tcg-stacked-vs-collectr", "B"],
  ["S13", "Best Card Collection Tracker Apps 2026 — pregradecards.com/blog/best-card-collection-tracker-apps-2026", "B"],
  ["S14", "Reseñas de Collectr — justuseapp.com/en/app/1603892248/collectr-tcg-portfolio-app/reviews", "B"],
  ["S15", "FAQ de Scrydex — scrydex.com/faq", "A"],
  ["S16", "Comparativa de APIs de Pokémon (proveedor) — pokemonpricetracker.com/api-comparison", "B"],
  ["S17", "TCGplayer API Alternatives 2026 (proveedor) — cardgrader.ai/blog/tcgplayer-api-alternatives", "B"],
  ["S18", "Best Pokemon Card APIs in 2026 — scrapingbee.com/blog/pokemon-card-api", "B"],
  ["S19", "TCGplayer, Getting Started — docs.tcgplayer.com/docs/getting-started", "A"],
  ["S20", "TCGplayer API Terms & Conditions — help.tcgplayer.com/hc/en-us/articles/360061115874", "A"],
  ["S21", "COESCCI, texto publicado por SAYCE (sayce.com.ec) y ficha WIPO Lex 16990; no cotejado con el Registro Oficial", "A"],
  ["S22", "Collectr-Portfolio-Exporter (tercero) — github.com/JCreps/Collectr-Portfolio-Exporter", "B"],
], [700, 7472, 900], { center: [0, 2] }));
C.push(P("Referencias normativas y jurisprudenciales citadas por conocimiento técnico del consultor, no recuperadas en esta sesión: NIC 2 párr. 14, 23 y 24; NIIF 13 párr. 76, 81 y 86; Sega v. Accolade; Bowers v. Baystate; Davidson & Assocs. v. Jung; 17 U.S.C. §1201(f). Se recomienda su cotejo antes de cualquier uso fuera de este documento de trabajo.", { run: { size: PT(9), color: KAM.grisOscuro } }));

C.push(H1("Anexo B. Glosario"));
C.push(...table(null, ["Término", "Definición"], [
  ["TCG", "Trading Card Game: juego de cartas coleccionables"],
  ["Raw", "Carta sin graduar, valorada según su estado de conservación"],
  ["Graduada (slab)", "Carta certificada y encapsulada por una empresa de gradación (PSA, BGS, CGC, SGC) con una nota de 1 a 10"],
  ["Sellado", "Producto sin abrir: sobres, cajas de sobres, Elite Trainer Box"],
  ["NM / LP / MP / HP / DMG", "Estados de conservación: Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged"],
  ["Variante o acabado", "Versión de una impresión con precio propio: normal, holo, reverse holo, primera edición"],
  ["REA", "Reverse Engineer Anything: herramienta de ingeniería inversa para agentes de IA (MCP y CLI)"],
  ["MCP", "Model Context Protocol: protocolo para conectar herramientas a agentes de IA"],
  ["APK", "Paquete de instalación de aplicaciones Android"],
  ["PWA", "Progressive Web App: aplicación web instalable desde el navegador"],
  ["RLS", "Row Level Security: seguridad a nivel de fila en PostgreSQL"],
  ["Clean-room", "Desarrollo a partir de una especificación funcional, sin acceso al código del producto de referencia"],
], [2400, 6672], { boldFirstCol: true }));

// ================================================================= DOCUMENTO
const headerConf = new Header({
  children: [new Paragraph({
    children: [new TextRun({ text: `Documento de uso exclusivo de ${CLIENTE}`, italics: true, size: PT(9), color: KAM.grisOscuro })],
    alignment: AlignmentType.CENTER,
  })],
});
const footer = new Footer({
  children: [new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: KAM.magenta, space: 4 } },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
    children: [
      new TextRun({ text: "kam-Analytica S.A.S. · RUC 1793220761001", size: PT(8), color: KAM.grisOscuro }),
      new TextRun({ children: [new Tab()], size: PT(8) }),
      new TextRun({ text: "Página ", size: PT(8), color: KAM.grisOscuro }),
      new TextRun({ children: [PageNumber.CURRENT], size: PT(8), color: KAM.grisOscuro }),
      new TextRun({ text: " de ", size: PT(8), color: KAM.grisOscuro }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: PT(8), color: KAM.grisOscuro }),
    ],
  })],
});

const doc = new Document({
  creator: "kam. Analytica",
  title: "Ingeniería inversa funcional de Collectr",
  description: "Especificación base para aplicación propia de registro de cartas Pokémon TCG",
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FUENTE, size: PT(10) } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FUENTE, size: PT(13), bold: true, color: KAM.azul },
        paragraph: { spacing: { before: 360, after: 140 }, outlineLevel: 0, keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: KAM.magenta, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FUENTE, size: PT(11), bold: true, color: KAM.azul },
        paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "vinetas", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 260 } }, run: { color: KAM.magenta } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 800, hanging: 260 } } } } ] },
      { reference: "numeros", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 300 } }, run: { bold: true, color: KAM.azul } } } ] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1417, left: 1417, right: 1417, header: 600, footer: 600 } } },
    headers: { default: headerConf },
    footers: { default: footer },
    children: C,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("ok", OUT, buf.length); });
