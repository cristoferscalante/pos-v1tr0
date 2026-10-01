// Copia los videos de escritorio a la landing en versión liviana (1280 px) con su portada.
// Uso: node landing-videos.mjs   (después de node record.mjs --desktop)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const OUT = '../frontend/public/landing/videos';
const NAMES = ['vender', 'inventario', 'panel', 'catalogo'];

for (const name of NAMES) {
  const src = `output/escritorio-${name}.mp4`;
  if (!fs.existsSync(src)) { console.warn(`falta ${src}`); continue; }
  const mp4 = `${OUT}/escritorio-${name}.mp4`;
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow',
    '-crf', '26', '-an', '-movflags', '+faststart', mp4]);
  // Portada: un cuadro ya dentro de la app (después del título)
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-ss', '7', '-i', src, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '5',
    `${OUT}/escritorio-${name}.jpg`]);
  console.log(`${mp4} ${Math.round(fs.statSync(mp4).size / 1024)} KB`);
}
