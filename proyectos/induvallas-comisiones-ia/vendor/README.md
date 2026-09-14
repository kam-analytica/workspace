# vendor/ · bibliotecas embebidas en el archivo único

| Archivo | Biblioteca | Versión | Licencia | Origen |
|---|---|---|---|---|
| `chart.umd.js` | Chart.js | 4.5.1 | MIT (`LICENSE.chartjs.md`) | paquete npm `chart.js@4.5.1`, `dist/chart.umd.js` |
| `xlsx.full.min.js` | SheetJS Community Edition | 0.18.5 | Apache-2.0 (`LICENSE.sheetjs.txt`) | paquete npm `xlsx@0.18.5`, `dist/xlsx.full.min.js` |
| `xlsx.full.min.cjs` | copia byte a byte del anterior con extensión `.cjs` para cargarlo desde Node en las pruebas | | | |

Hashes en `SHA256SUMS.txt` (`sha256sum -c SHA256SUMS.txt`). Sin CDN: el build embebe estos archivos en `dist/ComisionesIA_Induvallas_V.1.0.html`.
Nota (D-11): la política de red del entorno de desarrollo bloquea cdn.sheetjs.com, por lo que se usa la última edición comunitaria publicada en npm (0.18.5). Si INDUVALLAS requiere 0.20.x, se reemplaza el archivo y se actualiza el hash.
