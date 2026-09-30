// Capturas de la app (negocio de demostración) para la landing: frontend/public/landing/*.jpg
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createStore, mockApi, USER, ean13 } from './demo-data.mjs';
import { ensureAssets } from './assets.mjs';

const OUT = '../frontend/public/landing';
const BASE = 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });

// Cámara falsa con el código de la gaseosa (para la captura del escáner)
const setup = await chromium.launch();
const { y4mPath, photoPath } = await ensureAssets(setup, 'assets', ean13('770123450007'));
await setup.close();
const b = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4mPath}`],
});

async function newPage(loggedIn = true) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO', permissions: ['camera'] });
  await ctx.addInitScript(({ u, loggedIn }) => {
    localStorage.setItem('pos_theme', 'dark');
    if (loggedIn) {
      localStorage.setItem('pos_token', 'demo');
      localStorage.setItem('pos_user', JSON.stringify({ ...u, subscription_active: true, plan_name: 'standard' }));
    }
  }, { u: USER, loggedIn });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message, String(e.stack || '').slice(0, 400)));
  await mockApi(p, createStore());
  await p.route('**/api-proxy/api/v1/auth/subscription', r => r.fulfill({ contentType: 'application/json', body: '{"plan_name":"standard","subscription_ends_at":null,"subscription_active":true}' }));
  return p;
}
const shot = async (p, name, wait = 700) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 }); };

let p = await newPage();
await p.goto(BASE + '/');
await p.waitForTimeout(1800);
// 1. Vender con carrito
await p.click('.product-card:has-text("Arroz 500 g")');
await p.click('.product-card:has-text("Aceite 1 L")');
await p.click('.product-card:has-text("Leche 1 L")');
await shot(p, 'vender');
// 2. Precios por mayor
await p.click('role=tab[name="Precios por mayor"]');
await shot(p, 'por-mayor');
// 3. Carrito con efectivo y vueltas
await p.click('.pos-mobile-bar');
await p.waitForTimeout(500);
await p.click('.cash-quick button:has-text("$20.000")');
await p.locator('.cash-change').scrollIntoViewIfNeeded();
await shot(p, 'vueltas');
// 4. Recibo (venta registrada)
await p.click('.btn-checkout');
await p.waitForTimeout(2500);
await p.addStyleTag({ content: '.toast-container{display:none!important}' });
await shot(p, 'recibo', 300);
await p.getByRole('button', { name: 'Nueva Venta' }).click();
// 5. Escáner leyendo un código
await p.click('[aria-label="Escanear código con la cámara"]');
await shot(p, 'escaner', 1000);
await p.waitForTimeout(3000);
// 6. Panel
await p.click('.sidebar-nav-item:has-text("Panel")');
await p.waitForTimeout(1200);
await p.locator('.dashboard-panel', { hasText: 'Detal vs Por mayor' }).scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, -140));
await shot(p, 'panel');
// 7. Inventario
// Clic por DOM: tras el Panel la barra inferior a veces queda tapada por un aviso
await p.evaluate(() => [...document.querySelectorAll('.sidebar-nav-item')].find(b => b.textContent.includes('Inventario'))?.click());
await p.waitForTimeout(900);
await p.evaluate(() => window.scrollTo(0, 360));
await shot(p, 'inventario');
// 8. Alta de producto: paso 2 con ganancia por mayor y detal
await p.evaluate(() => window.scrollTo(0, 0));
await p.click('button:has-text("Nuevo Producto")');
await p.waitForTimeout(600);
const modal = p.locator('.modal-box');
await modal.locator('input.form-input').first().fill('Azúcar 1 kg');
await modal.locator('input[type="number"]').first().fill('5200');
const chooser = p.waitForEvent('filechooser');
await modal.locator('label:has-text("Tomar foto")').click();
await (await chooser).setFiles(photoPath);
await p.waitForTimeout(1500);
await shot(p, 'alta-foto');
await modal.getByRole('button', { name: /Siguiente/ }).click();
await p.waitForTimeout(400);
await modal.locator('.money-input input').nth(0).fill('3600');
await modal.locator('.money-input input').nth(2).fill('4500');
await shot(p, 'alta-ganancia');
await p.context().close();

// 9. Catálogo en línea (cliente)
p = await newPage(false);
await p.goto(BASE + '/tienda-dona-rosa');
await p.waitForTimeout(1600);
await p.locator('.pcat-card', { hasText: 'Arroz 500 g' }).locator('.pcat-add').click();
await p.locator('.pcat-card', { hasText: 'Aceite 1 L' }).locator('.pcat-add').click();
await p.locator('.pcat-grid').scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, -60));
await shot(p, 'catalogo');

await b.close();
console.log(fs.readdirSync(OUT).filter(f => f.endsWith('.jpg')).map(f => `${f} ${Math.round(fs.statSync(`${OUT}/${f}`).size / 1024)} KB`).join('\n'));
