/**
 * Anonimiza una plantilla de datos rellena (o una exportación de la herramienta) sin abrir el navegador.
 * Uso: node scripts/anonimizar.mjs <entrada.xlsx> <salida.xlsx> --clave "frase secreta" [--escala 1] [--mapa mapa_previo.json]
 * Produce además <salida>.mapa.json (custodia exclusiva de INDUVALLAS) e imprime el informe.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cargarXLSX } from '../src/data/xlsx.js';
import { importarPlantilla } from '../src/data/importar.js';
import { datasetAPlantilla, libroABytes } from '../src/data/plantilla.js';
import { anonimizarDataset, serializarMapa } from '../src/data/anonimizar.js';

const args = process.argv.slice(2);
const opcion = (nombre, def = null) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : def;
};
const posicionales = args.filter((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));
const [entrada, salida] = posicionales;
if (!entrada || !salida || !opcion('--clave')) {
  console.error('Uso: node scripts/anonimizar.mjs <entrada.xlsx> <salida.xlsx> --clave "frase secreta" [--escala 1] [--mapa mapa_previo.json]');
  process.exit(1);
}
const XLSX = await cargarXLSX();
const bytes = new Uint8Array(readFileSync(entrada));
const r = importarPlantilla(XLSX, bytes);
if (!r.valido) {
  console.error(`La plantilla tiene ${r.errores.length} errores; corríjalos antes de anonimizar:`);
  for (const e of r.errores.slice(0, 20)) console.error(`  ${e.hoja} fila ${e.fila} · ${e.mensaje}`);
  process.exit(2);
}
const mapaPrevio = opcion('--mapa') ? JSON.parse(readFileSync(opcion('--mapa'), 'utf8')) : null;
const { dataset, mapa, informe } = anonimizarDataset({ ...r.entidades, esquemas: [], politicas: [], ajustes: [] }, { clave: opcion('--clave'), escala: Number(opcion('--escala', '1')), mapaPrevio });
writeFileSync(salida, libroABytes(XLSX, datasetAPlantilla(XLSX, dataset)));
const rutaMapa = salida.replace(/\.xlsx$/i, '') + '.mapa.json';
writeFileSync(rutaMapa, serializarMapa(mapa, { generado: new Date().toISOString(), origen: entrada }));
console.log(`Datos anonimizados: ${salida}`);
console.log(`Mapa de reidentificación (NO compartir): ${rutaMapa}`);
console.log(JSON.stringify(informe, null, 2));
