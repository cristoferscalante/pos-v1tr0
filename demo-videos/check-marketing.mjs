// Capturas de verificación: landing, ingreso, registro, plan vencido y recordatorio
import { chromium } from 'playwright';
import { createStore, mockApi, USER } from './demo-data.mjs';

const out = process.argv[2] || '.';
const base = 'http://localhost:5173';
const b = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function page(opts = phone, user = null) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript(u => {
    localStorage.setItem('pos_theme', 'dark');
    if (u) { localStorage.setItem('pos_token', 'demo'); localStorage.setItem('pos_user', JSON.stringify(u)); }
    else { localStorage.removeItem('pos_token'); localStorage.removeItem('pos_user'); }
  }, user);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  return p;
}

// Landing celular (página completa) y escritorio (primer pantallazo)
let p = await page();
await p.goto(base + '/');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/m1-landing-movil.png`, fullPage: true });
p = await page({ viewport: { width: 1366, height: 800 } });
await p.goto(base + '/');
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/m2-landing-escritorio.png` });
await p.locator('#planes').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/m3-landing-planes.png` });

// Ingreso con el ojo activado y registro
p = await page();
await p.goto(base + '/login');
await p.waitForTimeout(800);
await p.fill('#auth-email', 'rosa@tiendademo.co');
await p.fill('#auth-password', 'MiClave2026');
await p.click('.password-toggle');
await p.screenshot({ path: `${out}/m4-login.png` });
await p.click('role=tab[name="Crear cuenta"]');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/m5-registro.png` });
console.log('url registro:', p.url());

// Plan vencido
p = await page(phone, { ...USER, plan_name: 'free', subscription_active: false, subscription_ends_at: new Date(Date.now() - 86400000).toISOString() });
await mockApi(p, createStore());
await p.route('**/api-proxy/api/v1/auth/subscription', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ plan_name: 'free', subscription_ends_at: new Date(Date.now() - 86400000).toISOString(), subscription_active: false }) }));
await p.goto(base + '/');
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/m6-plan-vencido.png`, fullPage: true });

// Recordatorio: quedan 3 días de prueba
const ends = new Date(Date.now() + 3 * 86400000 - 3600000).toISOString();
p = await page(phone, { ...USER, plan_name: 'free', subscription_active: true, subscription_ends_at: ends });
await mockApi(p, createStore());
await p.route('**/api-proxy/api/v1/auth/subscription', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ plan_name: 'free', subscription_ends_at: ends, subscription_active: true }) }));
await p.goto(base + '/');
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/m7-recordatorio.png` });
await b.close();
console.log('ok');
