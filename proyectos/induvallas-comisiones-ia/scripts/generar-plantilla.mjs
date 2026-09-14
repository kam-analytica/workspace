/**
 * Genera dist/Plantilla_Datos_Induvallas.xlsx (entregable E3). Uso: npm run plantilla
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cargarXLSX } from '../src/data/xlsx.js';
import { construirPlantilla, libroABytes } from '../src/data/plantilla.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = await cargarXLSX();
const anio = Number(process.argv[2]) || 2026;
const bytes = libroABytes(XLSX, construirPlantilla(XLSX, { anio, ejemplos: true }));
mkdirSync(join(raiz, 'dist'), { recursive: true });
const destino = join(raiz, 'dist', 'Plantilla_Datos_Induvallas.xlsx');
writeFileSync(destino, bytes);
console.log(`Plantilla generada: ${destino} (${bytes.length} bytes, año ${anio})`);
