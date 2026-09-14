/**
 * Build del archivo único: dist/ComisionesIA_Induvallas_V.1.0.html
 * Empaqueta src/ui/app.js con esbuild (IIFE, sin minificar el código propio, D-03) y embebe CSS, Chart.js y SheetJS.
 * Uso: node build.mjs
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
const VERSION = pkg.versionEntregable || '1.0';
const SALIDA = join(raiz, 'dist', `ComisionesIA_Induvallas_V.${VERSION}.html`);

const resultado = await build({
  entryPoints: [join(raiz, 'src/ui/app.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: false,
  write: false,
  external: ['node:module'],
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(VERSION), __MODO_DEMO__: JSON.stringify(pkg.modoDemo !== false), __FECHA_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  logLevel: 'warning',
  logOverride: { 'empty-import-meta': 'silent' },
});
const js = resultado.outputFiles[0].text;
const css = readFileSync(join(raiz, 'src/ui/styles.css'), 'utf8');
const chart = readFileSync(join(raiz, 'vendor/chart.umd.js'), 'utf8');
const xlsx = readFileSync(join(raiz, 'vendor/xlsx.full.min.js'), 'utf8');
const plantilla = readFileSync(join(raiz, 'src/ui/plantilla.html'), 'utf8');

const segura = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = plantilla;
const reemplazar = (marca, contenido) => {
  if (!html.includes(marca)) throw new Error(`Marca ${marca} no encontrada en la plantilla`);
  html = html.replace(marca, () => contenido);
};
reemplazar('/*__VERSION__*/', VERSION);
reemplazar('/*__CSS__*/', css);
reemplazar('/*__VENDOR_CHART__*/', segura(chart));
reemplazar('/*__VENDOR_XLSX__*/', segura(xlsx));
reemplazar('/*__APP__*/', segura(js));

mkdirSync(join(raiz, 'dist'), { recursive: true });
writeFileSync(SALIDA, html);
const kb = Math.round(statSync(SALIDA).size / 1024);
console.log(`Build OK → ${SALIDA} (${kb} KB; app ${Math.round(js.length / 1024)} KB, Chart.js ${Math.round(chart.length / 1024)} KB, SheetJS ${Math.round(xlsx.length / 1024)} KB)`);
