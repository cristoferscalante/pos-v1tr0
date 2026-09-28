// Graba un video vertical (celular) por módulo del POS.
// Uso:  node record.mjs            -> todos los módulos
//       node record.mjs vender     -> solo los indicados
// Requiere el frontend corriendo (npm run dev en frontend/, puerto 5173).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { createStore, mockApi, USER, ean13 } from './demo-data.mjs';
import { overlayScript } from './overlay.mjs';
import { ensureAssets } from './assets.mjs';
import { SCENARIOS } from './scenarios.mjs';

const BASE_URL = process.env.POS_URL || 'http://localhost:5173';
const OUT_DIR = path.resolve('output');
const RAW_DIR = path.join(OUT_DIR, 'raw');
const ASSETS_DIR = path.resolve('assets');
const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2;

fs.mkdirSync(RAW_DIR, { recursive: true });

const wanted = process.argv.slice(2);
const scenarios = SCENARIOS.filter(s => wanted.length === 0 || wanted.includes(s.id));
if (scenarios.length === 0) {
  console.error('Módulos disponibles:', SCENARIOS.map(s => s.id).join(', '));
  process.exit(1);
}

// Cada guion define qué código "ve" la cámara falsa (va dentro del video y4m);
// Chromium solo acepta un archivo de cámara por navegador, así que se lanza uno por video.
async function launchFor(scenario) {
  const code = scenario.cameraCode || ean13('770123450099');
  const setup = await chromium.launch();
  const assets = await ensureAssets(setup, ASSETS_DIR, code);
  await setup.close();
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${assets.y4mPath}`,
    ],
  });
  return { browser, photoPath: assets.photoPath };
}

function helpers(page, photoPath) {
  let step = 0;
  const sleep = ms => page.waitForTimeout(ms);
  const loc = target => (typeof target === 'string' ? page.locator(target).first() : target);
  const api = {
    page,
    sleep,
    photoPath,
    async scroll(dy, { wait = 900 } = {}) {
      await page.mouse.wheel(0, dy);
      await sleep(wait);
    },
    async title(heading, text, icon, ms = 2600) {
      await page.evaluate(([h, t, i]) => window.__demo.title(true, h, t, i), [heading, text, icon]);
      await sleep(ms);
      await page.evaluate(() => window.__demo.title(false));
      await sleep(500);
    },
    async say(text, { pos = 'bottom', wait = 2200, numbered = true } = {}) {
      if (numbered) step += 1;
      await page.evaluate(([t, p, s]) => window.__demo.caption(t, p, s), [text, pos, numbered ? String(step) : '']);
      await sleep(wait);
    },
    async hide(wait = 300) {
      await page.evaluate(() => window.__demo.caption(null));
      await sleep(wait);
    },
    async pointAt(target) {
      const l = loc(target);
      await l.scrollIntoViewIfNeeded();
      const b = await l.boundingBox();
      if (b) await page.evaluate(([x, y]) => window.__demo.tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]);
      return l;
    },
    async tap(target, { wait = 900 } = {}) {
      const l = loc(target);
      await l.waitFor({ state: 'visible', timeout: 10000 });
      await l.scrollIntoViewIfNeeded();
      await sleep(200);
      await api.pointAt(l);
      await sleep(280);
      await l.click();
      await sleep(wait);
    },
    async type(target, text, { wait = 600, delay = 85 } = {}) {
      await api.tap(target, { wait: 250 });
      await loc(target).pressSequentially(text, { delay });
      await sleep(wait);
    },
    async clear(target) {
      await loc(target).fill('');
    },
    // Toca un botón que abre el selector de archivos (cámara/galería) y entrega la foto
    async chooseFile(target, file, { wait = 1500 } = {}) {
      const chooser = page.waitForEvent('filechooser');
      await api.tap(target, { wait: 100 });
      await (await chooser).setFiles(file);
      await sleep(wait);
    },
  };
  return api;
}

async function recordScenario(scenario) {
  const store = createStore();
  const { browser, photoPath } = await launchFor(scenario);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'dark',
    permissions: ['camera'],
    recordVideo: { dir: RAW_DIR, size: { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE } },
  });
  await context.addInitScript(overlayScript);
  await context.addInitScript(({ loggedIn, user }) => {
    // Portada negra desde el primer cuadro (tapa la carga de la página)
    const cover = document.createElement('div');
    cover.id = '__demo-cover';
    cover.style.cssText = 'position:fixed;inset:0;background:#070b12;z-index:2147483646;transition:opacity .4s';
    document.addEventListener('DOMContentLoaded', () => document.documentElement.appendChild(cover));
    window.__demoUncover = () => { const c = document.getElementById('__demo-cover'); if (c) { c.style.opacity = '0'; setTimeout(() => c.remove(), 450); } };
    if (loggedIn) {
      localStorage.setItem('pos_token', 'demo-token');
      localStorage.setItem('pos_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
    }
    localStorage.setItem('pos_theme', 'dark');
  }, { loggedIn: scenario.loggedIn !== false, user: USER });
  // Evita abrir WhatsApp de verdad desde el catálogo público
  await context.addInitScript(() => { window.open = () => null; });

  const page = await context.newPage();
  await mockApi(page, store);
  page.on('pageerror', err => console.warn('  [error en la página]', err.message));

  const h = helpers(page, photoPath);
  await page.goto(`${BASE_URL}${scenario.path || '/'}`);
  await page.waitForLoadState('networkidle');
  await h.sleep(800);
  await page.evaluate(() => window.__demoUncover());

  try {
    await scenario.run(h);
    await h.hide(200);
    await h.sleep(900);
  } catch (err) {
    console.error(`  ✗ ${scenario.id}: ${err.message}`);
    await page.screenshot({ path: path.join(OUT_DIR, `${scenario.id}-error.png`) });
    throw err;
  } finally {
    const video = page.video();
    await context.close();
    const raw = path.join(RAW_DIR, `${scenario.id}.webm`);
    await video.saveAs(raw);
    await video.delete();
    await browser.close();
    const mp4 = path.join(OUT_DIR, `${scenario.file}.mp4`);
    execFileSync(ffmpegPath, [
      '-y', '-loglevel', 'error', '-ss', '1.2', '-i', raw,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-r', '30', '-movflags', '+faststart', mp4,
    ]);
    console.log(`  ✓ ${path.relative(process.cwd(), mp4)}`);
  }
}

for (const scenario of scenarios) {
  console.log(`▶ ${scenario.title}`);
  try {
    await recordScenario(scenario);
  } catch (err) {
    console.error(`  ✗ ${scenario.id}: ${err.stack || err}`);
    process.exitCode = 1;
  }
}
