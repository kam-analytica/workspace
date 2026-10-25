// Recorrido completo de la app con TCGdex y Frankfurter simulados: catálogo
// real (fixtures/cards.json) y precios SINTÉTICOS. Ninguna cifra es de mercado.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockResponse } from '../src/sources/fixtures/mockApi';

const IMAGE = readFileSync(new URL('./fixtures/carta-prueba.png', import.meta.url));
const SHOTS = process.env.SCREENSHOT_DIR;

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const TODAY = todayIn('America/Guayaquil');

async function mockApis(page: Page) {
  await page.route(/^https:\/\/(api\.tcgdex\.net|api\.frankfurter\.dev)\//, (route) => {
    const { status, body } = mockResponse(route.request().url(), TODAY);
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route(/^https:\/\/assets\.tcgdex\.net\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: IMAGE }));
}

async function expectToast(page: Page, text: string) {
  await expect(page.locator('.toast', { hasText: text }).first()).toBeVisible();
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function addCard(page: Page, query: string, resultId: string, fill: (page: Page) => Promise<void>) {
  await page.goto('/#agregar');
  await page.locator('#buscar-carta').fill(query);
  await page.getByRole('button', { name: new RegExp(resultId) }).click();
  await expect(page.getByRole('button', { name: 'Agregar a mi carpeta' })).toBeVisible();
  await fill(page);
  await page.getByRole('button', { name: 'Agregar a mi carpeta' }).click();
  await expectToast(page, 'agregada a tu carpeta');
}

test('registra, valora, vende, abre un sellado y exporta la colección', async ({ page }) => {
  await mockApis(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu carpeta está vacía' })).toBeVisible();
  await shot(page, '01-vacia');

  // Alta de dos cartas (idioma por defecto: español -> TCGplayer como aproximación, nivel 2)
  await addCard(page, 'pikachu', 'swsh12.5gg-GG30', async (p) => {
    await expect(p.locator('.finish.on')).toContainText('$6,50');
    await p.locator('#lote-cantidad').fill('2');
    await p.locator('#lote-coste').fill('10,00');
  });
  await addCard(page, 'investigación', 'sv01-189', async (p) => {
    await expect(p.getByRole('heading', { name: 'Investigación de Profesores' })).toBeVisible();
    await p.getByText('Reverse holo', { exact: true }).click();
    await p.locator('#lote-coste').fill('1');
    await shot(p, '02-alta-carta');
  });

  await page.goto('/#panel');
  await expect(page.getByTestId('valor-mercado')).toHaveText('$13,90');

  // Venta parcial: 1 de 2 a $8,00 con $0,50 de comisión sobre coste de $5,00
  await page.locator('.top-row', { hasText: 'Pikachu' }).click();
  await page.getByRole('button', { name: 'Registrar venta o salida' }).click();
  await page.locator('#salida-precio').fill('8,00');
  await page.locator('#salida-comisiones').fill('0,50');
  await page.getByRole('button', { name: 'Guardar salida' }).click();
  await expectToast(page, 'Salida registrada');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByTestId('realizado')).toHaveText('+$2,50');
  await expect(page.getByTestId('valor-mercado')).toHaveText('$7,40');

  // Producto sellado: alta, apertura, carta obtenida y asignación de coste
  await page.goto('/#agregar');
  await page.getByRole('tab', { name: 'Producto sellado' }).click();
  await page.locator('#sellado-nombre').fill('Caja de prueba');
  await page.locator('#sellado-coste').fill('50');
  await page.getByRole('button', { name: 'Agregar sellado' }).click();
  await expectToast(page, 'Caja de prueba agregado');

  await page.goto('/#coleccion');
  await page.locator('.lot-row', { hasText: 'Caja de prueba' }).click();
  await page.getByRole('button', { name: 'Registrar apertura' }).click();
  await page.getByRole('button', { name: 'Guardar apertura' }).click();
  await expectToast(page, 'Apertura registrada');
  await page.getByRole('link', { name: 'Agregar cartas obtenidas' }).click();
  await expect(page.locator('.pull-banner')).toContainText('Caja de prueba');
  await page.locator('#buscar-carta').fill('umbreon');
  await page.getByRole('button', { name: /swsh7-215/ }).click();
  await expect(page.locator('#lote-coste')).toHaveCount(0);
  await page.getByRole('button', { name: 'Agregar a mi carpeta' }).click();
  await expectToast(page, 'agregada a tu carpeta');
  await page.getByRole('button', { name: 'Asignar coste y terminar' }).click();
  await expectToast(page, 'Coste del sellado asignado');

  // Actualización de precios y panel final
  await page.goto('/#panel');
  await page.getByRole('button', { name: /Actualizar precios/ }).click();
  await expectToast(page, 'Precios actualizados para 3 cartas');
  await expect(page.getByTestId('valor-mercado')).toHaveText('$1.457,40');
  await expect(page.getByTestId('no-realizado')).toContainText('+$1.401,40');
  await shot(page, '03-panel-escritorio');

  // Exportación CSV y respaldo
  await page.goto('/#ajustes');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar colección (CSV)' }).click()]);
  expect(csv.suggestedFilename()).toBe(`carpeta-tcg-coleccion-${TODAY}.csv`);
  const csvText = readFileSync((await csv.path())!, 'utf8');
  expect(csvText).toContain('Umbreon VMAX;Evolving Skies;215;Holo;NM;es;;1;50,00;1450,00;1450,00;1400,00;tcgplayer');
  const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar respaldo' }).click()]);
  const json = JSON.parse(readFileSync((await backup.path())!, 'utf8'));
  expect(json.format).toBe('carpeta-tcg');
  expect(json.tables.lots).toHaveLength(4);

  // Persistencia local tras recargar
  await page.goto('/#panel');
  await page.reload();
  await expect(page.getByTestId('valor-mercado')).toHaveText('$1.457,40');

  // Historial: se agregan dos instantáneas previas (sintéticas) para dibujar la evolución
  await page.evaluate(async (today) => {
    const day = (n: number) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    };
    const db: IDBDatabase = await new Promise((ok, ko) => {
      const r = indexedDB.open('carpeta-tcg');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    const tx = db.transaction('snapshots', 'readwrite');
    for (const [n, value] of [[14, 98000], [7, 121500]] as const) {
      tx.objectStore('snapshots').put({ id: `0|${day(n)}`, portfolioId: 0, date: day(n), itemsOnHand: 3, marketValueCents: value, costBasisCents: 5600, unrealizedCents: value - 5600, realizedCents: 250 });
    }
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  }, TODAY);
  await page.reload();
  await expect(page.locator('.chart svg')).toBeVisible();

  // Vistas en teléfono, claro y oscuro, sin desplazamiento horizontal
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, '04-panel-telefono');
  await page.goto('/#coleccion');
  await shot(page, '05-coleccion-telefono');
  await page.locator('.lot-row', { hasText: 'Umbreon' }).click();
  await expect(page.locator('dialog.sheet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, '06-ficha-telefono');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#panel');
  await shot(page, '07-panel-oscuro');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 21, 30)');
});

test('muestra un error claro si TCGdex no responde', async ({ page }) => {
  await page.route(/^https:\/\/api\.tcgdex\.net\//, (route) => route.abort('internetdisconnected'));
  await page.goto('/#agregar');
  await page.locator('#buscar-carta').fill('pikachu');
  await expect(page.getByText('No hay conexión con TCGdex')).toBeVisible();
});
