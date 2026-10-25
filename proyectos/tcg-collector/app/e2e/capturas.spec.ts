// Genera las capturas de pantalla de la documentación con una colección de
// DEMOSTRACIÓN: cartas reales del catálogo de TCGdex (nombre, set y número),
// pero precios ILUSTRATIVOS y arte de carta sustituido por marcadores.
// Solo corre si se indica la carpeta de salida:
//   CAPTURAS_DIR=./capturas npx playwright test capturas
import { expect, test, type Page } from '@playwright/test';

const OUT = process.env.CAPTURAS_DIR;
test.skip(!OUT, 'Define CAPTURAS_DIR para generar las capturas');

const TZ = 'America/Guayaquil';
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

interface DemoCard {
  id: string;
  serie: string;
  set: [string, string, string]; // id, nombre en, nombre es
  name: [string, string]; // en, es
  rarity: string;
  variants: Record<string, boolean>;
  tcgplayer: Record<string, number>;
  cardmarket: Record<string, number>;
  color: [string, string];
}

// Precios ILUSTRATIVOS (no son precios de mercado)
const CARDS: DemoCard[] = [
  { id: 'sv03.5-199', serie: 'sv', set: ['sv03.5', '151', '151'], name: ['Charizard ex', 'Charizard ex'], rarity: 'Special illustration rare', variants: { holo: true }, tcgplayer: { holofoil: 210 }, cardmarket: { trend: 180, avg30: 176 }, color: ['#f2994a', '#b23a1d'] },
  { id: 'swsh7-215', serie: 'swsh', set: ['swsh7', 'Evolving Skies', 'Cielos Evolutivos'], name: ['Umbreon VMAX', 'Umbreon VMAX'], rarity: 'Secret Rare', variants: { holo: true }, tcgplayer: { holofoil: 1350 }, cardmarket: { trend: 1100, avg30: 1080 }, color: ['#2d3561', '#0f1226'] },
  { id: 'sv08-238', serie: 'sv', set: ['sv08', 'Surging Sparks', 'Chispas Fulgurantes'], name: ['Pikachu ex', 'Pikachu ex'], rarity: 'Special illustration rare', variants: { holo: true }, tcgplayer: { holofoil: 420 }, cardmarket: { trend: 360, avg30: 352 }, color: ['#ffd84d', '#e0a100'] },
  { id: 'sv03.5-173', serie: 'sv', set: ['sv03.5', '151', '151'], name: ['Pikachu', 'Pikachu'], rarity: 'Illustration rare', variants: { holo: true }, tcgplayer: { holofoil: 18.5 }, cardmarket: { trend: 14, avg30: 13.6 }, color: ['#fff07a', '#f2b705'] },
  { id: 'swsh12-186', serie: 'swsh', set: ['swsh12', 'Silver Tempest', 'Tempestad Plateada'], name: ['Lugia V', 'Lugia V'], rarity: 'Ultra Rare', variants: { holo: true }, tcgplayer: { holofoil: 230 }, cardmarket: { trend: 190, avg30: 186 }, color: ['#cfd8e6', '#6b7fa3'] },
  { id: 'sv02-269', serie: 'sv', set: ['sv02', 'Paldea Evolved', 'Evoluciones en Paldea'], name: ['Iono', 'e-Nigma'], rarity: 'Special illustration rare', variants: { holo: true }, tcgplayer: { holofoil: 75 }, cardmarket: { trend: 60, avg30: 61 }, color: ['#f6a6d0', '#7b5cd6'] },
  { id: 'sv03.5-094', serie: 'sv', set: ['sv03.5', '151', '151'], name: ['Gengar', 'Gengar'], rarity: 'Rare', variants: { holo: true, reverse: true }, tcgplayer: { holofoil: 2.1, 'reverse-holofoil': 3.2 }, cardmarket: { trend: 1.8, 'trend-holo': 2.6 }, color: ['#8a6bbf', '#3e2a6b'] },
  { id: 'sv03.5-025', serie: 'sv', set: ['sv03.5', '151', '151'], name: ['Pikachu', 'Pikachu'], rarity: 'Common', variants: { normal: true, reverse: true }, tcgplayer: { normal: 0.6, 'reverse-holofoil': 1.4 }, cardmarket: { trend: 0.45, 'trend-holo': 1.1 }, color: ['#ffe680', '#e6b800'] },
  { id: 'sv03.5-001', serie: 'sv', set: ['sv03.5', '151', '151'], name: ['Bulbasaur', 'Bulbasaur'], rarity: 'Common', variants: { normal: true, reverse: true }, tcgplayer: { normal: 0.35, 'reverse-holofoil': 0.9 }, cardmarket: { trend: 0.25, 'trend-holo': 0.7 }, color: ['#9be3a8', '#3f9a5a'] },
  { id: 'sv04.5-234', serie: 'sv', set: ['sv04.5', 'Paldean Fates', 'Destinos de Paldea'], name: ['Charizard ex', 'Charizard ex'], rarity: 'Special illustration rare', variants: { holo: true }, tcgplayer: { holofoil: 130 }, cardmarket: { trend: 110, avg30: 112 }, color: ['#5a5f7d', '#1b1d2b'] },
  { id: 'swsh7-218', serie: 'swsh', set: ['swsh7', 'Evolving Skies', 'Cielos Evolutivos'], name: ['Rayquaza VMAX', 'Rayquaza VMAX'], rarity: 'Secret Rare', variants: { holo: true }, tcgplayer: { holofoil: 640 }, cardmarket: { trend: 520, avg30: 515 }, color: ['#5ed39a', '#1f6b4a'] },
  { id: 'sv03.5-205', serie: 'sv', set: ['sv03.5', '151', '151'], name: ['Mew ex', 'Mew ex'], rarity: 'Hyper rare', variants: { holo: true }, tcgplayer: { holofoil: 95 }, cardmarket: { trend: 82, avg30: 84 }, color: ['#ffe9a8', '#d4a017'] },
  { id: 'sv08-247', serie: 'sv', set: ['sv08', 'Surging Sparks', 'Chispas Fulgurantes'], name: ['Pikachu ex', 'Pikachu ex'], rarity: 'Hyper rare', variants: { holo: true }, tcgplayer: { holofoil: 160 }, cardmarket: { trend: 140, avg30: 138 }, color: ['#ffe9a8', '#c99700'] },
  { id: 'swsh7-217', serie: 'swsh', set: ['swsh7', 'Evolving Skies', 'Cielos Evolutivos'], name: ['Rayquaza VMAX', 'Rayquaza VMAX'], rarity: 'Secret Rare', variants: { holo: true }, tcgplayer: { holofoil: 75 }, cardmarket: { trend: 62, avg30: 63 }, color: ['#f3d36b', '#b8860b'] },
];
const byId = new Map(CARDS.map((c) => [c.id, c]));
const localIdOf = (c: DemoCard) => c.id.slice(c.set[0].length + 1);
const imageOf = (lang: string, c: DemoCard) => `https://assets.tcgdex.net/${lang}/${c.serie}/${c.set[0]}/${localIdOf(c)}`;

function cardJson(lang: string, c: DemoCard) {
  const updated = `${TODAY}T03:00:00.000Z`;
  const tp = Object.fromEntries(
    Object.entries(c.tcgplayer).map(([k, v]) => [k, { productId: 1, lowPrice: +(v * 0.85).toFixed(2), midPrice: v, highPrice: +(v * 1.5).toFixed(2), marketPrice: v, directLowPrice: null }]),
  );
  return {
    id: c.id,
    localId: localIdOf(c),
    name: lang === 'es' ? c.name[1] : c.name[0],
    image: imageOf(lang, c),
    rarity: c.rarity,
    category: 'Pokemon',
    set: { id: c.set[0], name: lang === 'es' ? c.set[2] : c.set[1] },
    variants: { normal: false, reverse: false, holo: false, firstEdition: false, ...c.variants },
    pricing: { tcgplayer: { updated, unit: 'USD', ...tp }, cardmarket: { updated, unit: 'EUR', idProduct: 1, ...c.cardmarket } },
  };
}

/** Marcador de arte de carta (SVG), claramente distinto de una imagen real */
function placeholderSvg(c: DemoCard): string {
  const [a, b] = c.color;
  const name = c.name[1].replace(/&/g, '&amp;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="245" height="342" rx="12" fill="#f4e7b8"/><rect x="9" y="9" width="227" height="324" rx="8" fill="url(#g)"/>
<text x="20" y="34" font-family="system-ui,sans-serif" font-size="17" font-weight="700" fill="#fff">${name}</text>
<rect x="20" y="46" width="205" height="150" rx="4" fill="#fff" opacity="0.28"/>
<circle cx="122" cy="121" r="46" fill="#fff" opacity="0.35"/>
<rect x="20" y="210" width="205" height="10" rx="5" fill="#fff" opacity="0.35"/>
<rect x="20" y="230" width="150" height="10" rx="5" fill="#fff" opacity="0.25"/>
<text x="122" y="296" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" letter-spacing="2" fill="#fff" opacity="0.85">VISTA PREVIA</text>
<text x="226" y="322" text-anchor="end" font-family="system-ui,sans-serif" font-size="10" fill="#fff" opacity="0.8">${c.set[0]} · ${localIdOf(c)}</text></svg>`;
}

async function mockApis(page: Page) {
  await page.route(/^https:\/\/api\.frankfurter\.dev\//, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ date: TODAY, base: 'EUR', quote: 'USD', rate: 1.08 }]) }),
  );
  await page.route(/^https:\/\/api\.tcgdex\.net\//, (r) => {
    const u = new URL(r.request().url());
    const [, , lang, endpoint, id] = u.pathname.split('/');
    if (endpoint === 'cards' && id) {
      const c = byId.get(decodeURIComponent(id));
      return c
        ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cardJson(lang, c)) })
        : r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    const q = (u.searchParams.get('name') ?? '').toLowerCase();
    const list = CARDS.filter((c) => (lang === 'es' ? c.name[1] : c.name[0]).toLowerCase().includes(q)).map((c) => ({
      id: c.id,
      localId: localIdOf(c),
      name: lang === 'es' ? c.name[1] : c.name[0],
      image: imageOf(lang, c),
    }));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
  });
  await page.route(/^https:\/\/assets\.tcgdex\.net\//, (r) => {
    const parts = new URL(r.request().url()).pathname.split('/');
    const c = byId.get(`${parts[3]}-${parts[4]}`);
    return c ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: placeholderSvg(c) }) : r.fulfill({ status: 404, body: '' });
  });
  // Marca visible en cada captura: datos de demostración
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = `body::after{content:'Datos de demostración · precios ilustrativos';position:fixed;right:10px;top:calc(env(safe-area-inset-top,0px) + 66px);z-index:25;font:600 10px/1.6 system-ui,sans-serif;letter-spacing:.02em;color:#fff;background:rgb(246 82 160 / 92%);padding:1px 8px;border-radius:999px;pointer-events:none}`;
      document.head.appendChild(s);
    });
  });
}

/** Colección de demostración, escrita directamente en IndexedDB */
async function seed(page: Page) {
  const catalog = CARDS.map((c) => ({
    itemId: c.id,
    kind: 'card',
    setId: c.set[0],
    setName: c.set[1],
    name: c.name[0],
    localNames: { en: c.name[0], es: c.name[1] },
    number: localIdOf(c),
    rarity: c.rarity,
    image: imageOf('es', c),
    finishes: [c.variants.normal && 'normal', c.variants.holo && 'holofoil', c.variants.reverse && 'reverse_holofoil'].filter(Boolean),
    updatedAt: `${TODAY}T00:00:00.000Z`,
  }));
  const sealed = (itemId: string, name: string, setName: string) => ({
    itemId, kind: 'sealed', setId: null, setName, name, localNames: { es: name }, number: null, rarity: null, image: null, finishes: ['sealed'], updatedAt: `${TODAY}T00:00:00.000Z`,
  });
  catalog.push(sealed('sealed-demo-etb', 'Caja de entrenador élite', '151') as never, sealed('sealed-demo-blister', 'Blíster de 3 sobres', '151') as never);

  const lot = (id: number, variantId: string, p: Record<string, unknown>) => ({
    id, portfolioId: 1, variantId, quantity: 1, condition: 'NM', language: 'es', grader: null, grade: null, certNumber: null,
    acquiredOn: '2026-01-10', channel: 'purchase', acquisitionCostCents: 0, parentLotId: null, manualUnitValueCents: null, notes: null,
    createdAt: `${TODAY}T00:00:00.000Z`, ...p,
  });
  const lots = [
    lot(1, 'sv03.5-199#holofoil', { language: 'en', acquiredOn: '2026-03-14', acquisitionCostCents: 16500 }),
    lot(2, 'swsh7-215#holofoil', { language: 'en', acquiredOn: '2025-11-02', acquisitionCostCents: 98000, notes: 'Comprada en torneo local' }),
    lot(3, 'sv08-238#holofoil', { acquiredOn: '2026-02-20', acquisitionCostCents: 38000 }),
    lot(4, 'sv03.5-173#holofoil', { quantity: 2, acquiredOn: '2026-05-10', acquisitionCostCents: 3000 }),
    lot(5, 'swsh12-186#holofoil', { quantity: 2, language: 'en', acquiredOn: '2025-12-15', acquisitionCostCents: 36000 }),
    lot(6, 'sv02-269#holofoil', { condition: 'LP', acquiredOn: '2026-04-02', channel: 'trade', acquisitionCostCents: 5500 }),
    lot(7, 'sealed-demo-etb#sealed', { acquiredOn: '2026-06-01', acquisitionCostCents: 5999, manualUnitValueCents: 9500 }),
    lot(8, 'sealed-demo-blister#sealed', { acquiredOn: '2026-09-12', acquisitionCostCents: 1800 }),
    lot(9, 'sv03.5-025#normal', { quantity: 3, acquiredOn: '2026-09-12', channel: 'pack_pull', parentLotId: 8, acquisitionCostCents: 549 }),
    lot(10, 'sv03.5-001#reverse_holofoil', { acquiredOn: '2026-09-12', channel: 'pack_pull', parentLotId: 8, acquisitionCostCents: 275 }),
    lot(11, 'sv03.5-094#reverse_holofoil', { acquiredOn: '2026-09-12', channel: 'pack_pull', parentLotId: 8, acquisitionCostCents: 976 }),
    lot(12, 'sv04.5-234#holofoil', { language: 'en', grader: 'PSA', grade: 10, acquiredOn: '2026-07-18', acquisitionCostCents: 41000, manualUnitValueCents: 52000 }),
    lot(13, 'swsh7-218#holofoil', { portfolioId: 2, language: 'en', acquiredOn: '2025-10-05', acquisitionCostCents: 41000 }),
  ];
  const disposals = [
    { id: 1, lotId: 5, disposedOn: '2026-08-30', quantity: 1, channel: 'sale', unitProceedsCents: 24500, feesCents: 1840, notes: null },
    { id: 2, lotId: 8, disposedOn: '2026-09-12', quantity: 1, channel: 'opened', unitProceedsCents: 0, feesCents: 0, notes: null },
  ];
  const watch = [
    { id: 1, variantId: 'sv03.5-205#holofoil', condition: 'NM', language: 'en', direction: 'below', thresholdCents: 10000, isActive: true, lastTriggeredAt: null, createdAt: `${TODAY}T00:00:00.000Z` },
    { id: 2, variantId: 'sv08-247#holofoil', condition: 'NM', language: 'en', direction: null, thresholdCents: null, isActive: true, lastTriggeredAt: null, createdAt: `${TODAY}T00:00:00.000Z` },
    { id: 3, variantId: 'swsh7-217#holofoil', condition: 'NM', language: 'en', direction: 'below', thresholdCents: 6000, isActive: true, lastTriggeredAt: null, createdAt: `${TODAY}T00:00:00.000Z` },
  ];
  const portfolios = [
    { id: 1, name: 'Principal', isDefault: true, createdAt: `${TODAY}T00:00:00.000Z` },
    { id: 2, name: 'Para vender', isDefault: false, createdAt: `${TODAY}T00:00:00.000Z` },
  ];
  await page.evaluate(
    async (data) => {
      const db: IDBDatabase = await new Promise((ok, ko) => {
        const r = indexedDB.open('carpeta-tcg');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
      });
      const tx = db.transaction(['catalog', 'portfolios', 'lots', 'disposals', 'watch', 'settings'], 'readwrite');
      tx.objectStore('portfolios').clear();
      for (const [store, rows] of Object.entries(data)) for (const row of rows as object[]) tx.objectStore(store).put(row);
      const settings = tx.objectStore('settings');
      const req = settings.get('settings');
      req.onsuccess = () => settings.put({ key: 'settings', value: { ...req.result.value, lastRefreshAt: null } });
      await new Promise((ok) => (tx.oncomplete = ok));
      db.close();
    },
    { catalog, portfolios, lots, disposals, watch },
  );
}

/** Historial ilustrativo de 60 días que termina en la instantánea real de hoy */
async function seedHistory(page: Page) {
  await page.evaluate(async (today) => {
    const db: IDBDatabase = await new Promise((ok, ko) => {
      const r = indexedDB.open('carpeta-tcg');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    });
    const read = (store: string) =>
      new Promise<any[]>((ok) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => ok(q.result);
      });
    const snaps = (await read('snapshots')).filter((s) => s.date === today);
    const disposals = await read('disposals');
    // Coste de lo que hoy está en mano, por fecha de adquisición (sin contar dos veces sellados abiertos ni ventas)
    const lots = (await read('lots')).map((l) => {
      const out = disposals.filter((d) => d.lotId === l.id).reduce((a, d) => a + d.quantity, 0);
      return { ...l, acquisitionCostCents: (l.acquisitionCostCents * (l.quantity - out)) / l.quantity };
    });
    const tx = db.transaction('snapshots', 'readwrite');
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    for (const s of snaps) {
      const own = lots.filter((l) => s.portfolioId === 0 || l.portfolioId === s.portfolioId);
      const ratio = s.costBasisCents > 0 ? s.marketValueCents / s.costBasisCents : 1;
      let walk = 0;
      for (let n = 60; n >= 1; n--) {
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - n);
        const date = d.toISOString().slice(0, 10);
        const cost = Math.round(own.filter((l) => l.acquiredOn <= date).reduce((a, l) => a + l.acquisitionCostCents, 0));
        walk += rand() * 0.035;
        const r = 1 + (ratio - 1) * (1 - n / 75) + walk * (n / 60);
        tx.objectStore('snapshots').put({ id: `${s.portfolioId}|${date}`, portfolioId: s.portfolioId, date, itemsOnHand: s.itemsOnHand, marketValueCents: Math.round(cost * r), costBasisCents: cost, unrealizedCents: Math.round(cost * r) - cost, realizedCents: s.realizedCents });
      }
    }
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  }, TODAY);
}

async function settle(page: Page) {
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 12_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

async function snap(page: Page, name: string, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

test.use({ locale: 'es-EC', timezoneId: TZ, serviceWorkers: 'block' });

test('capturas de la app con datos de demostración', async ({ page }) => {
  test.setTimeout(120_000);
  await mockApis(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu carpeta está vacía' })).toBeVisible();
  await snap(page, 'telefono-00-bienvenida');

  await seed(page);
  await page.reload();
  await expect(page.locator('.toast', { hasText: 'Precios actualizados' })).toBeVisible({ timeout: 20_000 });
  await settle(page);
  await seedHistory(page);
  await page.reload();
  await expect(page.locator('.chart svg')).toBeVisible();

  // Teléfono, tema claro
  await snap(page, 'telefono-01-panel');
  await page.locator('.panel', { hasText: 'Evolución' }).scrollIntoViewIfNeeded();
  await snap(page, 'telefono-02-panel-evolucion');
  await page.goto('/#coleccion');
  await snap(page, 'telefono-03-coleccion');
  await page.locator('.lot-row', { hasText: 'Umbreon VMAX' }).click();
  await expect(page.locator('dialog.sheet')).toBeVisible();
  await snap(page, 'telefono-04-ficha');
  await page.locator('dialog.sheet .sheet-body').evaluate((el) => el.parentElement!.scrollTo({ top: 520 }));
  await snap(page, 'telefono-05-ficha-acciones');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.goto('/#agregar');
  await page.locator('#buscar-carta').fill('charizard');
  await expect(page.locator('.result')).toHaveCount(2);
  await snap(page, 'telefono-06-busqueda');
  await page.getByRole('button', { name: /sv03\.5-199/ }).click();
  await expect(page.getByRole('button', { name: 'Agregar a mi carpeta' })).toBeVisible();
  await snap(page, 'telefono-07-alta-carta');
  await page.goto('/#agregar');
  await page.reload();
  await page.getByRole('tab', { name: 'Producto sellado' }).click();
  await snap(page, 'telefono-08-alta-sellado');
  await page.goto('/#deseos');
  await snap(page, 'telefono-09-deseos');
  await page.goto('/#ajustes');
  await snap(page, 'telefono-10-ajustes');

  // Teléfono, tema oscuro
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#panel');
  await snap(page, 'oscuro-01-panel');
  await page.goto('/#coleccion');
  await snap(page, 'oscuro-02-coleccion');
  await page.locator('.lot-row', { hasText: 'Charizard ex' }).first().click();
  await snap(page, 'oscuro-03-ficha');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Escritorio, tema claro
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/#panel');
  await snap(page, 'escritorio-01-panel', true);
  await page.goto('/#coleccion');
  await snap(page, 'escritorio-02-coleccion', true);
  await page.goto('/#agregar');
  await page.reload();
  await page.locator('#buscar-carta').fill('pikachu');
  await expect(page.locator('.result')).toHaveCount(4);
  await snap(page, 'escritorio-03-busqueda');
});
