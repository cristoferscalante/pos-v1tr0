// Revisión visual de la landing (celular y escritorio) + visor de capturas
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const OUT = process.argv[2] || '.';
const b = await chromium.launch();

for (const [name, viewport, mobile] of [['mobile', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'es-CO' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.goto(BASE + '/');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/landing-${name}-top.png` });
  // Recorre la página para disparar las animaciones de aparición
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.waitForTimeout(900);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${OUT}/landing-${name}-full.png`, fullPage: true });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const heroPlaying = await p.evaluate(() => { const v = document.querySelector('.landing-phone.front video'); return v && !v.paused; });
  console.log(name, 'overflow-x', overflow, 'hero video playing', heroPlaying);
  // Visor
  await p.evaluate(() => document.querySelectorAll('.landing-gallery-item')[2].click());
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/landing-${name}-lightbox.png` });
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(300);
  console.log(name, 'lightbox caption', await p.locator('.lightbox figcaption strong').textContent());
  await p.keyboard.press('Escape');
  console.log(name, 'lightbox closed', await p.locator('.lightbox').count() === 0);
  await ctx.close();
}
await b.close();
