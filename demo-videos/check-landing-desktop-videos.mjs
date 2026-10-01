// Revisión de la pestaña "En el computador" de la sección de videos (celular y escritorio)
import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const b = await chromium.launch();
for (const [name, viewport, mobile] of [['mobile', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
  const p = await (await b.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: 'es-CO' })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto('http://localhost:5173/#videos');
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-in')));
  await p.getByRole('tab', { name: 'En el computador' }).click();
  await p.locator('.landing-device-toggle').scrollIntoViewIfNeeded();
  await p.evaluate(() => document.querySelector('.landing-videos.desktop').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/vid-${name}.png` });
  const playing = await p.evaluate(() => [...document.querySelectorAll('.landing-laptop video')].map(v => !v.paused));
  console.log(name, 'laptop videos playing', playing, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p.evaluate(() => document.querySelector('.landing-laptop').click());
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/vid-${name}-lightbox.png` });
}
await b.close();
