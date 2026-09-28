// Genera los recursos de las grabaciones:
//  - camera-<código>.y4m: video para la cámara falsa de Chromium con un código de
//    barras EAN-13 real (bwip-js), así el escáner de la app lo lee de verdad.
//  - foto-azucar.jpg: "foto" del producto que se toma en el alta.
import fs from 'node:fs';
import path from 'node:path';
import bwipjs from 'bwip-js';

const W = 640;
const H = 480;

// Pone la etiqueta con el código sobre una "mesa" y devuelve el cuadro en YUV 4:2:0
const cameraFrameScript = async ({ pngB64, W, H, shift }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${pngB64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  // Fondo claro: con un fondo oscuro el binarizador de ZXing no encuentra la zona de silencio
  x.fillStyle = '#d9c7a8'; x.fillRect(0, 0, W, H);
  // Escala entera: redimensionar a 0.78x deja barras de 3 y 4 px alternadas y el lector falla
  const scale = Math.max(1, Math.floor(Math.min((W * 0.85) / img.width, (H * 0.7) / img.height)));
  const w = img.width * scale;
  const h = img.height * scale;
  x.fillStyle = '#fff';
  const left = Math.round((W - w) / 2) + shift;
  const top = Math.round((H - h) / 2);
  x.fillRect(left - 24, top - 24, w + 48, h + 48);
  x.imageSmoothingEnabled = false;
  x.drawImage(img, left, top, w, h);

  const px = x.getImageData(0, 0, W, H).data;
  const Y = new Uint8Array(W * H);
  const U = new Uint8Array((W / 2) * (H / 2));
  const V = new Uint8Array((W / 2) * (H / 2));
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 4;
      const r = px[k], g = px[k + 1], b = px[k + 2];
      Y[j * W + i] = Math.max(0, Math.min(255, 0.299 * r + 0.587 * g + 0.114 * b));
      if (j % 2 === 0 && i % 2 === 0) {
        const ci = (j / 2) * (W / 2) + i / 2;
        U[ci] = Math.max(0, Math.min(255, -0.169 * r - 0.331 * g + 0.5 * b + 128));
        V[ci] = Math.max(0, Math.min(255, 0.5 * r - 0.419 * g - 0.081 * b + 128));
      }
    }
  }
  const all = new Uint8Array(Y.length + U.length + V.length);
  all.set(Y); all.set(U, Y.length); all.set(V, Y.length + U.length);
  let s = '';
  for (let i = 0; i < all.length; i += 0x8000) s += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
  return btoa(s);
};

const photoScript = () => {
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 1200;
  const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, 1200);
  bg.addColorStop(0, '#d6c3a5'); bg.addColorStop(1, '#a9885f');
  x.fillStyle = bg; x.fillRect(0, 0, 1600, 1200);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.ellipse(820, 1010, 380, 60, 0, 0, 7); x.fill();
  const bag = x.createLinearGradient(520, 0, 1100, 0);
  bag.addColorStop(0, '#f8fafc'); bag.addColorStop(0.5, '#ffffff'); bag.addColorStop(1, '#e2e8f0');
  x.fillStyle = bag;
  x.beginPath(); x.moveTo(560, 230); x.lineTo(1060, 230); x.lineTo(1110, 1000); x.lineTo(510, 1000); x.closePath(); x.fill();
  x.fillStyle = '#1d4ed8'; x.fillRect(560, 430, 530, 250);
  x.fillStyle = '#fff'; x.font = 'bold 110px Arial'; x.textAlign = 'center'; x.fillText('AZÚCAR', 820, 560);
  x.font = 'bold 64px Arial'; x.fillText('1 kg', 820, 640);
  x.fillStyle = '#ef4444'; x.beginPath(); x.arc(820, 820, 70, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.fillText('REFINADA', 820, 835);
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
};

export async function ensureAssets(browser, dir, barcode) {
  fs.mkdirSync(dir, { recursive: true });
  const y4mPath = path.join(dir, `camera-${barcode}.y4m`);
  const photoPath = path.join(dir, 'foto-azucar.jpg');
  if (fs.existsSync(y4mPath) && fs.existsSync(photoPath)) return { y4mPath, photoPath };

  const png = await bwipjs.toBuffer({
    bcid: 'ean13', text: barcode, scale: 3, height: 26, includetext: true, textxalign: 'center',
    paddingwidth: 14, paddingheight: 6, backgroundcolor: 'FFFFFF',
  });
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  // La etiqueta entra deslizándose (~2 s, como al acercar el celular) y luego
  // queda quieta y centrada: así el escáner alcanza a verse en el video.
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`);
  const frames = [];
  const SLIDE = 30;
  for (let i = 0; i <= SLIDE; i++) {
    const t = i / SLIDE;
    const shift = Math.round((1 - t) ** 2 * W * 1.1);
    const frame = Buffer.from(await page.evaluate(cameraFrameScript, { pngB64: png.toString('base64'), W, H, shift }), 'base64');
    const repeat = i === SLIDE ? 45 : 1;
    for (let k = 0; k < repeat; k++) frames.push(Buffer.from('FRAME\n'), frame);
  }
  fs.writeFileSync(y4mPath, Buffer.concat([header, ...frames]));
  fs.writeFileSync(photoPath, Buffer.from(await page.evaluate(photoScript), 'base64'));
  await page.close();
  return { y4mPath, photoPath };
}
