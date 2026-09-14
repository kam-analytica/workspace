/**
 * Kit de prueba del flujo con datos anonimizados (dist/pruebas/). Uso: npm run prueba
 * 1. Plantilla rellena con datos ficticios "como los enviaría INDUVALLAS".
 * 2. Copia anonimizada (clave de prueba) y mapa de reidentificación.
 * 3. Rol histórico ficticio con seudónimos, con desviaciones deliberadas para el contraste.
 * 4. Instrucciones con los resultados esperados, calculados aquí mismo.
 * El script verifica el ciclo completo (importar → calcular → contrastar) antes de escribir las instrucciones.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cargarXLSX } from '../src/data/xlsx.js';
import { generarDatosDemo, HOY_DEMO } from '../src/seed/demo.js';
import { esquemaDemo, politicasDemo, CONTROL } from '../src/seed/defaults.js';
import { datasetAPlantilla, libroABytes } from '../src/data/plantilla.js';
import { importarPlantilla } from '../src/data/importar.js';
import { anonimizarDataset, serializarMapa } from '../src/data/anonimizar.js';
import { plantillaContraste, leerContraste, contrastar } from '../src/data/contraste.js';
import { computeTodo } from '../src/engine/index.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const carpeta = join(raiz, 'dist', 'pruebas');
mkdirSync(carpeta, { recursive: true });
const VERSION = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).versionEntregable;
const CLAVE = 'prueba-kam-2026';
const PERIODOS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
const usd = (n) => new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const XLSX = await cargarXLSX();
const { dataset } = generarDatosDemo();

// 1) Plantilla rellena con datos ficticios (lado INDUVALLAS)
const archivo1 = join(carpeta, 'Prueba_01_Datos_ficticios_INDUVALLAS.xlsx');
writeFileSync(archivo1, libroABytes(XLSX, datasetAPlantilla(XLSX, dataset)));

// 2) Copia anonimizada y mapa (lo que recibe kam / lo que custodia INDUVALLAS)
const { dataset: anon, mapa, informe } = anonimizarDataset({ ...dataset, cierres: {}, liquidaciones: [] }, { clave: CLAVE });
const archivo2 = join(carpeta, 'Prueba_02_Datos_anonimizados.xlsx');
writeFileSync(archivo2, libroABytes(XLSX, datasetAPlantilla(XLSX, anon)));
const archivoMapa = join(carpeta, 'Prueba_02_Mapa_anonimizacion_NO_COMPARTIR.json');
writeFileSync(archivoMapa, serializarMapa(mapa, { generado: `${HOY_DEMO}T00:00:00`, origen: 'Prueba_01_Datos_ficticios_INDUVALLAS.xlsx', clavePrueba: 'prueba-kam-2026 (solo en este kit de prueba; en producción la clave nunca se escribe en el mapa)' }));

// 3) Rol histórico ficticio con seudónimos: lo que la herramienta calcula, con desviaciones deliberadas
const seudo = (id) => mapa.entidades.vendedores[id].seudonimo;
const resultado = computeTodo({ ...anon, esquemas: [esquemaDemo()], politicas: politicasDemo(), control: { ...CONTROL } }, { hoy: HOY_DEMO });
// Escenario sin la NC de USD 2.200 de agosto sobre la factura de julio de V01: lo que pagó un Excel que nunca la descontó
const ncMaria = anon.notasCredito.find((n) => n.valor === 2200);
const resSinNC = computeTodo({ ...anon, notasCredito: anon.notasCredito.filter((n) => n !== ncMaria), esquemas: [esquemaDemo()], politicas: politicasDemo(), control: { ...CONTROL } }, { hoy: HOY_DEMO });
const desviaciones = [
  { vendedorId: 'V01', periodo: '2026-07', ajuste: () => resSinNC.periodos['2026-07'].vendedores[seudo('V01')].totales.liquidable, motivo: 'El Excel anterior pagó julio antes de la NC de USD 2.200 emitida en agosto y nunca la descontó (R-03)' },
  { vendedorId: 'V02', periodo: '2026-08', ajuste: (t) => t.liquidable - 2550, motivo: 'Error de digitación de USD 25,50 en el rol histórico' },
  { vendedorId: 'V05', periodo: '2026-06', ajuste: (t) => t.liquidable + 10000, motivo: 'Pago duplicado de USD 100,00 en junio' },
  { vendedorId: 'V08', periodo: '2026-08', ajuste: (t) => t.devengado + t.bonos, motivo: 'El Excel anterior pagó el devengado íntegro con la emisión (política v1.0) sin retener por cobranza (R-04)' },
];
const filasContraste = [];
const esperado = [];
for (const p of PERIODOS) {
  for (const v of dataset.vendedores) {
    const t = resultado.periodos[p].vendedores[seudo(v.id)].totales;
    const d = desviaciones.find((x) => x.vendedorId === v.id && x.periodo === p);
    const pagado = d ? d.ajuste(t) : t.liquidable;
    filasContraste.push([p, seudo(v.id), Math.round(pagado) / 100, p === '2026-08' ? Math.round(t.devengado + t.bonos) / 100 : '']);
    if (d) esperado.push({ periodo: p, vendedor: `${seudo(v.id)} (${v.nombre})`, historico: Math.round(pagado) / 100, herramienta: t.liquidable / 100, diferencia: (t.liquidable - Math.round(pagado)) / 100, motivo: d.motivo });
  }
}
const wb = plantillaContraste(XLSX, [], []);
const ws = XLSX.utils.aoa_to_sheet([['periodo', 'vendedor_id', 'comision_pagada', 'devengado_historico'], ...filasContraste]);
ws['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 20 }];
wb.Sheets.Contraste = ws;
const archivo3 = join(carpeta, 'Prueba_03_Rol_historico_contraste.xlsx');
writeFileSync(archivo3, libroABytes(XLSX, wb));

// 4) Verificación del ciclo completo con los archivos escritos: importar la copia anonimizada y contrastar
const importado = importarPlantilla(XLSX, new Uint8Array(await import('node:fs').then((fs) => fs.readFileSync(archivo2))));
if (!importado.valido) throw new Error(`La copia anonimizada no pasa la validación: ${JSON.stringify(importado.errores.slice(0, 3))}`);
const dsImportado = { ...importado.entidades, ajustes: [], cierres: {}, liquidaciones: [], esquemas: [esquemaDemo()], politicas: politicasDemo(), control: { ...CONTROL } };
const resImportado = computeTodo(dsImportado, { hoy: HOY_DEMO });
const lectura = leerContraste(XLSX, new Uint8Array(await import('node:fs').then((fs) => fs.readFileSync(archivo3))));
const contraste = contrastar(resImportado, lectura.filas, { tolerancia: 1 });
if (lectura.errores.length || contraste.sinCorrespondencia.length || contraste.totales.revisar !== desviaciones.length || contraste.totales.ok !== filasContraste.length - desviaciones.length) {
  throw new Error(`Verificación fallida: errores ${lectura.errores.length}, sin correspondencia ${contraste.sinCorrespondencia.length}, ok ${contraste.totales.ok}, revisar ${contraste.totales.revisar}`);
}
// La copia anonimizada debe reproducir el cálculo original
const resOriginal = computeTodo({ ...dataset, cierres: {}, liquidaciones: [] }, { hoy: HOY_DEMO });
for (const p of PERIODOS) if (JSON.stringify(resOriginal.periodos[p].totales) !== JSON.stringify(resImportado.periodos[p].totales)) throw new Error(`Totales distintos en ${p}`);

// 5) Instrucciones con resultados esperados
const filaMd = (e) => `| ${e.periodo} | ${e.vendedor} | ${usd(e.historico)} | ${usd(e.herramienta)} | ${e.diferencia >= 0 ? '+' : '−'}${usd(Math.abs(e.diferencia))} | ${e.motivo} |`;
const md = `# Kit de prueba · datos ficticios · flujo con datos anonimizados

Generado el ${HOY_DEMO} con \`npm run prueba\` (determinista). Todos los datos son ficticios; los nombres de vendedores, clientes y agencias no corresponden a personas ni empresas reales.

## Archivos

| Archivo | Quién lo tendría en producción | Contenido |
|---|---|---|
| \`Prueba_01_Datos_ficticios_INDUVALLAS.xlsx\` | INDUVALLAS | Plantilla rellena "como saldría de INDUVALLAS": ${informe.conteos.vendedores} vendedores con nombre, ${informe.conteos.clientes} clientes, ${informe.conteos.agencias} agencias, ${informe.conteos.facturas} facturas, ${informe.conteos.cobros} cobros y ${informe.conteos.notasCredito} notas de crédito (enero a septiembre 2026) |
| \`Prueba_02_Datos_anonimizados.xlsx\` | kam | La misma información seudonimizada con la clave \`${CLAVE}\` (sin nombres, códigos reales, cargos ni motivos) |
| \`Prueba_02_Mapa_anonimizacion_NO_COMPARTIR.json\` | INDUVALLAS | Mapa de reidentificación seudónimo → nombre real. En producción no se comparte; aquí se incluye para la prueba |
| \`Prueba_03_Rol_historico_contraste.xlsx\` | kam (preparado por INDUVALLAS con seudónimos) | Comisión pagada por vendedor y mes según un "Excel anterior" ficticio: ${filasContraste.length} filas, ${desviaciones.length} con desviaciones deliberadas |

Parámetros usados: los defaults de demostración que la herramienta trae al abrirse sin datos (matriz de 0,50 % a 2,00 %, bonos activos, tope USD 1.500, política v1.0 anterior y v2.0 vigente desde 01-ene-2026 con transición por emisión). Fecha de referencia del cálculo: ${HOY_DEMO}.

Nota: en esta prueba todos los períodos quedan abiertos (una plantilla no trae cierres), por lo que los totales difieren de los del botón «Cargar datos de demostración», donde enero a julio están aprobados y las notas de crédito de agosto generan clawback en lugar de reducir la base del mes de la factura (R-03).

Nota: la versión DEMO de la herramienta trae el mismo ejercicio embebido, sin archivos: al abrirla se cargan solos los datos ficticios (con enero a julio aprobados) y el botón «Rol histórico de la demostración» de Liquidación y auditoría carga un Excel anterior ficticio con cuatro diferencias explicadas. Este kit de archivos sirve para practicar el flujo real (plantilla → anonimización → contraste) y por eso deja todos los períodos abiertos.

## Prueba A · lado kam: importar la copia anonimizada y contrastar

1. Abra \`ComisionesIA_Induvallas_V.${VERSION}.html\`, elija el rol Finanzas y, en la pestaña Datos, pulse «Borrar todos los datos» (la versión DEMO abre con los datos ficticios ya cargados).
2. Datos → Importar archivo… → \`Prueba_02_Datos_anonimizados.xlsx\` → debe indicar **archivo válido** → Reemplazar todos los datos.
3. Fecha de referencia del cálculo: ${HOY_DEMO}. Período: agosto 2026.
4. Liquidación y auditoría → Cargar rol histórico… → \`Prueba_03_Rol_historico_contraste.xlsx\`.

Resultado esperado: **${contraste.totales.ok} coinciden** y **${contraste.totales.revisar} por revisar**, sin filas con error ni sin correspondencia. Las cuatro diferencias, con la explicación que debe encontrarse en el ledger de cada vendedor:

| Período | Vendedor (seudónimo y nombre real según el mapa) | Pagado histórico | Liquidable herramienta | Diferencia | Causa ficticia |
|---|---|---|---|---|---|
${esperado.map(filaMd).join('\n')}

Total histórico ${usd(contraste.totales.historico)} frente a ${usd(contraste.totales.herramienta)} de la herramienta (diferencia ${contraste.totales.diferencia >= 0 ? '+' : '−'}${usd(Math.abs(contraste.totales.diferencia))}).

## Prueba B · lado INDUVALLAS: anonimizar y comprobar que el cálculo no cambia

1. En un navegador sin datos, importe \`Prueba_01_Datos_ficticios_INDUVALLAS.xlsx\` (Reemplazar). Verá los nombres ficticios completos.
2. Fecha de referencia ${HOY_DEMO}. Anote la comisión liquidable total de agosto 2026 en el rol: debe ser **USD ${usd(resOriginal.periodos['2026-08'].totales.liquidable / 100)}**.
3. Datos → Exportar copia anonimizada… → clave \`${CLAVE}\`, escala 1 → se descargan el Excel anonimizado y el mapa. El Excel debe ser idéntico en contenido a \`Prueba_02_Datos_anonimizados.xlsx\` (mismos seudónimos: la anonimización es determinista por clave).
4. Importe el Excel anonimizado que acaba de generar (Reemplazar). El rol de agosto debe mostrar la misma comisión liquidable total, **USD ${usd(resImportado.periodos['2026-08'].totales.liquidable / 100)}**, ahora con seudónimos.

## Prueba C · por línea de comando (sin navegador)

\`\`\`
npm run anonimizar -- dist/pruebas/Prueba_01_Datos_ficticios_INDUVALLAS.xlsx /tmp/anon.xlsx --clave "${CLAVE}"
\`\`\`

Produce \`/tmp/anon.xlsx\` (idéntico a Prueba_02) y \`/tmp/anon.mapa.json\`.

## Qué mirar en el contraste

- Las diferencias por clawback (R-03) y por retención (R-04) son las que la política actualizada introduce frente a un Excel que pagaba con la emisión; la herramienta las explica línea por línea en el Motor de cálculo.
- Las diferencias por error de digitación o pago duplicado no tienen explicación en el ledger: son hallazgos sobre el proceso anterior.
- Con datos reales, cada fila "por revisar" se documenta con regla, dato o supuesto que la origina antes de dar por validado el cálculo.

*kam-Analytica S.A.S. · RUC 1793220761001 · Datos ficticios en modo demostración*
`;
writeFileSync(join(carpeta, 'PRUEBA_DATOS_FICTICIOS.md'), md);

console.log(`Kit de prueba en ${carpeta}`);
console.log(`- Prueba_01: ${informe.conteos.facturas} facturas, ${informe.conteos.cobros} cobros, ${informe.conteos.notasCredito} NC`);
console.log(`- Prueba_02 anonimizada + mapa (${Object.keys(mapa.entidades.facturas).length} facturas mapeadas)`);
console.log(`- Prueba_03 contraste: ${filasContraste.length} filas, esperado ${contraste.totales.ok} coinciden / ${contraste.totales.revisar} por revisar`);
for (const e of esperado) console.log(`  ${e.periodo} ${e.vendedor}: histórico ${usd(e.historico)} vs herramienta ${usd(e.herramienta)} (${e.diferencia >= 0 ? '+' : '−'}${usd(Math.abs(e.diferencia))})`);
console.log(`- Liquidable agosto 2026 (original = anonimizado): USD ${usd(resImportado.periodos['2026-08'].totales.liquidable / 100)}`);
