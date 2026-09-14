/**
 * Prueba de humo (Fase 5): abre el archivo único por file://, elige rol, carga la demo, recorre las pestañas,
 * importa la plantilla, exporta el rol y verifica que no haya errores de consola.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const version = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).versionEntregable;
const html = join(raiz, 'dist', `ComisionesIA_Induvallas_V.${version}.html`);
const plantilla = join(raiz, 'dist', 'Plantilla_Datos_Induvallas.xlsx');
const capturas = join(raiz, 'tests', 'e2e', 'capturas');

test('humo · demo, pestañas, importación, exportación, sin errores de consola', async ({ page }) => {
  expect(existsSync(html), `${html} debe existir (npm run build)`).toBe(true);
  mkdirSync(capturas, { recursive: true });
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errores.push(`console: ${m.text()}`);
  });

  await page.goto(`file://${html}`);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /^Finanzas/ }).click();
  await expect(page.locator('.marca')).toContainText('Comisiones IA');

  // Recorrido inicial (primera apertura): cuatro páginas y cierre
  const recorrido = page.getByRole('dialog', { name: 'Guía paso a paso' });
  await expect(recorrido).toBeVisible();
  await page.screenshot({ path: join(capturas, '00-recorrido.png') });
  await recorrido.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await recorrido.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await recorrido.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(recorrido.locator('.recorrido-titulo')).toContainText('Por dónde empezar');
  await expect(recorrido.locator('.recorrido-cuerpo')).toContainText('ya están cargados');
  await recorrido.getByLabel('No volver a mostrar al abrir').check();
  await recorrido.getByRole('button', { name: 'Empezar', exact: true }).click();

  // Versión de demostración: los datos ficticios del ejercicio se cargan solos al abrir sin datos
  await expect(page.locator('.header-strip .kpi-fila .kpi')).toHaveCount(9, { timeout: 30000 });
  await expect(page.locator('.cabecera-meta .demo')).toContainText('demostración');
  await expect(page.locator('.scope-strip select')).toHaveValue('2026-08');
  await expect(page.locator('.stepper .paso-hecho')).toHaveCount(1);
  await expect(page.locator('.stepper .paso-actual')).toContainText('Revisar parámetros');
  await page.getByRole('tab', { name: 'Datos' }).click();
  await expect(page.locator('.ayuda-tarjeta').first()).toContainText('Cómo usar · Datos');
  await expect(page.locator('.ayuda-nota').first()).toContainText('ya están cargados');
  await page.screenshot({ path: join(capturas, '01-datos.png'), fullPage: true });

  // Guion de la demostración en el Panel: salto al cálculo de Carolina y al contraste con el Excel anterior
  await page.getByRole('tab', { name: 'Panel ejecutivo' }).click();
  await expect(page.locator('#tarjeta-guion .guion-item')).toHaveCount(6);
  await page.locator('#tarjeta-guion .guion-item').first().getByRole('button', { name: 'Ver' }).click();
  await expect(page.getByRole('tab', { name: 'Motor de cálculo' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tarjeta-cab h2').first()).toContainText('Carolina Mera');
  await page.getByRole('tab', { name: 'Panel ejecutivo' }).click();
  await page.locator('#tarjeta-guion .guion-item').nth(5).getByRole('button', { name: 'Ver' }).click();
  await expect(page.getByRole('tab', { name: 'Liquidación y auditoría' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tarjeta-contraste')).toContainText('60 coinciden');
  await expect(page.locator('#tarjeta-contraste')).toContainText('4 por revisar');
  await expect(page.locator('#tarjeta-contraste .contraste-explicacion li')).toHaveCount(4);
  await page.getByRole('button', { name: 'Glosario' }).click();
  await expect(page.getByRole('dialog', { name: 'Glosario de términos' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  const pestanas = ['Panel ejecutivo', 'Tabla de determinación', 'Política de cobranza', 'Motor de cálculo', 'Liquidación y auditoría', 'Asistente'];
  for (const [i, nombre] of pestanas.entries()) {
    await page.getByRole('tab', { name: nombre }).click();
    await expect(page.getByRole('tab', { name: nombre })).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(capturas, `0${i + 2}-${nombre.split(' ')[0].toLowerCase()}.png`), fullPage: true });
  }

  // Panel: veredicto y ranking
  await page.getByRole('tab', { name: 'Panel ejecutivo' }).click();
  await expect(page.locator('.veredicto-titulo')).toContainText('Cierre');
  await expect(page.locator('.tabla tbody tr').first()).toBeVisible();

  // Motor: ledger, cascada y simulador
  await page.getByRole('tab', { name: 'Motor de cálculo' }).click();
  await expect(page.locator('.ledger tbody tr.ledger-fila')).toHaveCount(9);
  await page.locator('.ledger tbody tr.ledger-fila').nth(3).click();
  await expect(page.locator('.ledger-detalle').nth(3)).toBeVisible();
  await page.locator('input[type=range]').first().fill('10000');
  await page.waitForTimeout(400);
  await expect(page.locator('.comparativo', { hasText: 'Simulado' })).toBeVisible();

  // Asistente
  await page.getByRole('tab', { name: 'Asistente' }).click();
  await page.getByRole('button', { name: '¿Quién superó el tope?' }).click();
  await expect(page.locator('.chat-msg.asistente').last()).toContainText('tope');

  // Liquidación: exportación del rol
  await page.getByRole('tab', { name: 'Liquidación y auditoría' }).click();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar Excel (rol y detalle)' }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toMatch(/Rol_Comisiones_2026-08\.xlsx/);

  // Datos: importar la plantilla generada
  await page.getByRole('tab', { name: 'Datos' }).click();
  const [selector] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar archivo…' }).click()]);
  await selector.setFiles(plantilla);
  await expect(page.locator('.badge-ok', { hasText: 'archivo válido' })).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: join(capturas, '08-importacion.png'), fullPage: true });

  // Exportación anonimizada: dos descargas (xlsx y mapa)
  await page.getByRole('button', { name: 'Exportar copia anonimizada…' }).click();
  await page.getByLabel('Clave de anonimización').fill('clave-de-prueba-2026');
  const descargaAn = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generar y descargar' }).click();
  expect((await descargaAn).suggestedFilename()).toMatch(/Datos_Anonimizados_.*\.xlsx/);
  const descargaMapa = await page.waitForEvent('download');
  expect(descargaMapa.suggestedFilename()).toMatch(/NO_COMPARTIR\.json/);

  // Contraste con liquidación histórica: plantilla descargable
  await page.getByRole('tab', { name: 'Liquidación y auditoría' }).click();
  const descargaContraste = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar plantilla de contraste' }).click();
  expect((await descargaContraste).suggestedFilename()).toBe('Plantilla_Contraste_Comisiones.xlsx');
  await page.getByRole('tab', { name: 'Datos' }).click();

  // Borrar todos los datos desactiva la autocarga de la demo; el botón «Cargar datos de demostración» sigue disponible
  await page.getByRole('button', { name: 'Borrar todos los datos' }).click();
  await page.getByRole('dialog').getByLabel('Escriba BORRAR').fill('BORRAR');
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(page.locator('.stepper .paso-actual')).toContainText('Cargar datos');
  await page.reload();
  await expect(page.locator('.cabecera-meta .rol')).toHaveText('Finanzas'); // el rol se conserva en la sesión
  await expect(page.getByRole('dialog', { name: 'Guía paso a paso' })).toHaveCount(0); // preferencia «No volver a mostrar»
  await expect(page.locator('.vacio').first()).toContainText('Sin datos cargados');
  await page.getByRole('button', { name: 'Cargar datos de demostración' }).click();
  await expect(page.locator('.header-strip .kpi-fila .kpi')).toHaveCount(9, { timeout: 30000 });

  // Cambio de rol a Consulta deshabilita acciones
  await page.getByRole('button', { name: 'Cambiar rol' }).click();
  await page.getByRole('button', { name: /^Consulta/ }).click();
  await expect(page.locator('.cabecera-meta .rol')).toHaveText('Consulta');

  expect(errores, errores.join('\n')).toEqual([]);
});
