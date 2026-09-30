// Capturas de la app (negocio de demostración) para la landing: frontend/public/landing/*.jpg
import { chromium } from 'playwright';
import fs from 'node:fs';
import { createStore, mockApi, USER } from './demo-data.mjs';

const OUT = '../frontend/public/landing';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO' });
await ctx.addInitScript(u => {
  localStorage.setItem('pos_token', 'demo');
  localStorage.setItem('pos_user', JSON.stringify({ ...u, subscription_active: true, plan_name: 'standard' }));
  localStorage.setItem('pos_theme', 'dark');
}, USER);
const p = await ctx.newPage();
await mockApi(p, createStore());
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1800);
const shot = async name => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 }); };

// 1. Vender (con carrito)
await p.click('.product-card:has-text("Arroz 500 g")');
await p.click('.product-card:has-text("Aceite 1 L")');
await p.click('.product-card:has-text("Leche 1 L")');
await shot('vender');
// 2. Por mayor
await p.click('role=tab[name="Precios por mayor"]');
await shot('por-mayor');
// 3. Panel
await p.click('.sidebar-nav-item:has-text("Panel")');
await p.waitForTimeout(1200);
await p.locator('.dashboard-panel', { hasText: 'Detal vs Por mayor' }).scrollIntoViewIfNeeded();
await p.evaluate(() => window.scrollBy(0, -120));
await shot('panel');
// 4. Inventario
await p.click('.sidebar-nav-item:has-text("Inventario")');
await p.waitForTimeout(900);
await p.evaluate(() => window.scrollTo(0, 360));
await shot('inventario');
await b.close();
console.log(fs.readdirSync(OUT).map(f => `${f} ${Math.round(fs.statSync(`${OUT}/${f}`).size / 1024)} KB`).join('\n'));
