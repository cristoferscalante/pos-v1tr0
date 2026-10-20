// Impresión de recibos en impresoras térmicas (58 mm / 80 mm).
//
// El recibo se arma como texto a columnas fijas (32 columnas en 58 mm, 48 en
// 80 mm), que es como trabajan las ticketeras. Así nada se sale del papel: los
// nombres largos se parten en varias líneas en vez de cortarse. El mismo texto
// sirve para tres formas de imprimir:
//   - 'browser':   diálogo de impresión del navegador (cualquier impresora).
//   - 'rawbt':     app RawBT en Android. Imprime directo, sin diálogo, en la
//                  impresora integrada de terminales tipo Sunmi/PDA, Bluetooth,
//                  USB o red.
//   - 'bluetooth': Web Bluetooth (Chrome en Android/PC) a impresoras BLE.
// La configuración es por dispositivo (cada caja tiene su impresora), por eso
// se guarda en localStorage y no en el servidor.
import type { LocalSale } from '../types';
import type { ReceiptBusiness } from './receiptImage';
import { resolveMediaSrc } from '../api/client';
import { formatDate } from './dates';

export type PaperWidth = '58' | '80';
export type PrintMethod = 'browser' | 'serial' | 'rawbt' | 'bluetooth';

export interface PrinterSettings {
  paper: PaperWidth;
  method: PrintMethod;
  /** Quitar tildes y ñ: para impresoras que no tienen la tabla de caracteres en español. */
  plainText: boolean;
  /** Pulso para abrir el cajón monedero conectado a la impresora. */
  openDrawer: boolean;
  /** Modo básico: solo texto, sin logo, negativo, letra doble ni corte. Para
   * impresoras integradas que no entienden esos comandos y no imprimen nada. */
  basic?: boolean;
}

const SETTINGS_KEY = 'pos_printer_settings';
// En Android (terminales con impresora integrada) el diálogo del navegador no
// llega a la ticketera: por defecto se imprime directo, sin apps (Web Serial).
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
const DEFAULT_SETTINGS: PrinterSettings = { paper: '58', method: isAndroid ? 'serial' : 'browser', plainText: false, openDrawer: true };

export function loadPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* sin almacenamiento: valores por defecto */ }
  return { ...DEFAULT_SETTINGS };
}

export function savePrinterSettings(settings: PrinterSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* noop */ }
}

export const COLUMNS: Record<PaperWidth, number> = { '58': 32, '80': 48 };
/** Ancho imprimible real del cabezal (el papel tiene márgenes que no imprimen). */
const PRINTABLE_MM: Record<PaperWidth, number> = { '58': 48, '80': 72 };

// ---------------------------------------------------------------------------
// Recibo como líneas de texto
// ---------------------------------------------------------------------------

export interface TicketLine {
  text: string;         // ya alineado y con el largo exacto de la columna
  bold?: boolean;
  big?: boolean;        // doble alto (no cambia el ancho, así no se sale)
  invert?: boolean;     // blanco sobre negro (el TOTAL)
  boxed?: boolean;      // las líneas seguidas con boxed van dentro de un recuadro
  image?: string;       // línea de imagen (logo del negocio), centrada
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;
// toLocaleString mete espacios especiales (p. m.) que las impresoras no conocen
const clean = (s: string) => String(s ?? '').replace(/[   ]/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();

function wrapText(text: string, width: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let word of words) {
    // Palabra más larga que la línea (códigos, CUFE...): se parte a la fuerza
    while (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Como wrapText, pero si la línea no cabe la parte primero por los " · ",
 * así un teléfono o el NIT no quedan cortados a la mitad. */
const wrapParts = (text: string, width: number) =>
  clean(text).length <= width ? wrapText(text, width) : text.split(' · ').flatMap(part => wrapText(part, width));

const center = (s: string, w: number) => {
  const left = Math.max(0, Math.floor((w - s.length) / 2));
  return (' '.repeat(left) + s).padEnd(w);
};

/** Texto a la izquierda y valor a la derecha en la misma línea. */
function leftRight(left: string, right: string, w: number, indent = 0): string[] {
  left = ' '.repeat(indent) + clean(left); right = clean(right);
  if (left.length + 1 + right.length <= w) return [left + ' '.repeat(w - left.length - right.length) + right];
  return [...wrapText(left, w).map(l => l.padEnd(w)), right.padStart(w)];
}

const qtyText = (q: number) => Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));

/** Recibo con el diseño "Con logo": logo, nombre, razón social y NIT, recuadro
 * con los datos de contacto, tabla CANT / PRODUCTO / TOTAL y el total resaltado. */
export function buildTicketLines(sale: LocalSale, biz: ReceiptBusiness, paper: PaperWidth): TicketLine[] {
  const w = COLUMNS[paper];
  const out: TicketLine[] = [];
  const push = (text: string, opts: Omit<TicketLine, 'text'> = {}) => out.push({ text, ...opts });
  const sep = (ch = '-') => push(ch.repeat(w));
  const meta = sale.meta_data || {};

  // Encabezado del negocio
  if (biz.logoUrl) push('', { image: resolveMediaSrc(biz.logoUrl) });
  wrapText(biz.name, w).forEach(l => push(center(l, w), { bold: true, big: true }));
  if (biz.idLine) wrapParts(biz.idLine, w).forEach(l => push(center(l, w)));
  (biz.contactLines || []).forEach(line => wrapParts(line, w).forEach(l => push(center(l, w), { boxed: true })));

  // Datos de la venta
  const title = meta.requires_electronic_invoice ? 'FACTURA' : 'RECIBO';
  leftRight(`${title} ${sale.sale_number}`, PAYMENT_LABELS[sale.payment_method] || sale.payment_method, w).forEach(l => push(l, { bold: true }));
  leftRight(
    formatDate(sale.created_at, { day: '2-digit', month: '2-digit', year: '2-digit' }),
    formatDate(sale.created_at, { hour: 'numeric', minute: '2-digit' }),
    w,
  ).forEach(l => push(l));
  if (meta.price_mode === 'wholesale') push(center('*** VENTA AL POR MAYOR ***', w), { bold: true });

  // Tabla de productos: CANT | PRODUCTO (se parte en varias líneas) | TOTAL
  const qtyW = 4;
  const totalW = paper === '58' ? 10 : 12;
  const nameW = w - qtyW - totalW - 2;
  sep('=');
  push(`${'CANT'.padEnd(qtyW)} ${'PRODUCTO'.padEnd(nameW)} ${'TOTAL'.padStart(totalW)}`, { bold: true });
  for (const item of sale.details) {
    const nameLines = wrapText(item.name, nameW);
    if (item.quantity !== 1) nameLines.push(...wrapText(`c/u ${money(item.price)}`, nameW));
    nameLines.forEach((name, idx) => {
      const qty = idx === 0 ? qtyText(item.quantity) : '';
      const total = idx === 0 ? money(item.price * item.quantity) : '';
      push(`${qty.padEnd(qtyW)} ${name.padEnd(nameW)} ${total.padStart(totalW)}`);
    });
  }
  sep('=');

  // Totales
  leftRight('Subtotal', money(sale.subtotal), w).forEach(l => push(l));
  leftRight('IVA', money(sale.tax), w).forEach(l => push(l));
  leftRight('TOTAL', money(sale.total), w - 2).forEach(l => push(` ${l} `, { bold: true, big: true, invert: true }));
  if (Number(meta.cash_received) > 0) {
    leftRight('Recibido', money(meta.cash_received), w).forEach(l => push(l));
    leftRight('Vueltas', money(meta.cash_change || 0), w).forEach(l => push(l, { bold: true }));
  }

  if (meta.requires_electronic_invoice) {
    sep();
    leftRight('Numero FE', clean(meta.factus_bill_number || 'Pendiente'), w).forEach(l => push(l));
    leftRight('Estado DIAN', clean(meta.dian_status || 'Pendiente'), w).forEach(l => push(l));
    push('CUFE:'.padEnd(w));
    wrapText(meta.cufe || 'Pendiente de generar', w).forEach(l => push(l.padEnd(w)));
  }

  push('');
  wrapText(biz.footer, w).forEach(l => push(center(l, w)));
  return out;
}

// ---------------------------------------------------------------------------
// ESC/POS
// ---------------------------------------------------------------------------

// Tabla PC850 (ESC t 2): la que traen casi todas las ticketeras y cubre el español.
const CP850: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, '¿': 0xa8, '¡': 0xad, '°': 0xf8, '·': 0xfa,
};

function encodeText(text: string, plain: boolean): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) { bytes.push(code); continue; }
    if (!plain && CP850[ch] !== undefined) { bytes.push(CP850[ch]); continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base.charCodeAt(0) < 0x80) bytes.push(base.charCodeAt(0));
    else bytes.push(0x3f); // '?'
  }
  return bytes;
}

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

export interface RasterImage { widthBytes: number; height: number; data: Uint8Array }

/** Imagen en blanco y negro (1 bit por punto) para el comando GS v 0. */
async function rasterizeImage(url: string, widthDots: number): Promise<RasterImage | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const width = Math.max(8, Math.round(widthDots / 8) * 8);
    const height = Math.max(1, Math.round(img.naturalHeight * width / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const px = ctx.getImageData(0, 0, width, height).data; // falla si la imagen es de otro dominio sin CORS
    const widthBytes = width / 8;
    const data = new Uint8Array(widthBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        if (lum < 150) data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    return { widthBytes, height, data };
  } catch {
    return null; // sin logo: el recibo sale igual
  }
}

export function buildEscPos(lines: TicketLine[], settings: PrinterSettings, images: Record<string, RasterImage | null> = {}): Uint8Array {
  const w = COLUMNS[settings.paper];
  const b: number[] = [];
  b.push(ESC, 0x40);                       // inicializar
  b.push(ESC, 0x74, settings.plainText ? 0 : 2); // tabla de caracteres PC850
  b.push(ESC, 0x61, 0);                    // izquierda: las líneas ya traen el ancho exacto del cabezal (32/48 col.), así ocupan todo el papel
  const reset = () => b.push(ESC, 0x45, 0, GS, 0x21, 0, GS, 0x42, 0);
  const text = (t: string) => b.push(...encodeText(t, settings.plainText), LF);
  if (settings.basic) {
    // Solo inicializar y texto ASCII: lo entiende cualquier ticketera
    const basic: number[] = [ESC, 0x40];
    for (const line of lines) if (!line.image) basic.push(...encodeText(line.text.trimEnd(), true), LF);
    basic.push(LF, LF, LF, LF);
    return new Uint8Array(basic);
  }
  lines.forEach((line, idx) => {
    if (line.image) {
      const raster = images[line.image];
      if (raster) {
        b.push(ESC, 0x61, 1);              // centrado
        b.push(GS, 0x76, 0x30, 0, raster.widthBytes & 0xff, raster.widthBytes >> 8, raster.height & 0xff, raster.height >> 8);
        b.push(...raster.data, LF);
        b.push(ESC, 0x61, 0);
      }
      return;
    }
    const prevBoxed = idx > 0 && !!lines[idx - 1].boxed;
    const nextBoxed = idx < lines.length - 1 && !!lines[idx + 1].boxed;
    reset();
    if (line.boxed && !prevBoxed) text('-'.repeat(w)); // recuadro de contacto: línea arriba
    b.push(ESC, 0x45, line.bold ? 1 : 0);  // negrita
    b.push(GS, 0x21, line.big ? 0x01 : 0x00); // doble alto
    b.push(GS, 0x42, line.invert ? 1 : 0); // blanco sobre negro
    text(line.invert ? line.text : line.text.trimEnd());
    if (line.boxed && !nextBoxed) { reset(); text('-'.repeat(w)); } // y línea abajo
  });
  reset();
  b.push(ESC, 0x64, 4);                    // avanzar papel para poder cortar
  b.push(GS, 0x56, 0x42, 0x00);            // corte parcial (se ignora si no tiene cortador)
  if (settings.openDrawer) b.push(ESC, 0x70, 0x00, 0x19, 0xfa); // abrir cajón
  return new Uint8Array(b);
}

// ---------------------------------------------------------------------------
// Envío a la impresora
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** RawBT (Android): recibe los bytes ESC/POS por intent e imprime sin diálogo.
 * Si la app no está instalada, Android abre su página en Play Store. */
function printViaRawBT(data: Uint8Array) {
  window.location.href = `intent:base64,${toBase64(data)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

// Servicios BLE que usan las ticketeras más comunes (genéricas chinas, Xprinter,
// MTP, Goojprt, Phomemo ESC/POS...).
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
];

// La impresora elegida se recuerda mientras la app esté abierta (Web Bluetooth
// no permite reconectar sin que el usuario la vuelva a elegir tras recargar).
let bleDevice: any = null;
let bleCharacteristic: any = null;

export const isBluetoothSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
export const bluetoothPrinterName = () => (bleDevice?.name as string | undefined) || null;

async function findWritableCharacteristic(server: any): Promise<any> {
  for (const uuid of BLE_PRINTER_SERVICES) {
    let service: any;
    try { service = await server.getPrimaryService(uuid); } catch { continue; }
    const chars: any[] = await service.getCharacteristics();
    const writable = chars.find(c => c.properties.writeWithoutResponse || c.properties.write);
    if (writable) return writable;
  }
  throw new Error('La impresora no tiene un canal de impresión compatible');
}

async function getBleCharacteristic(forceChoose: boolean): Promise<any> {
  if (!isBluetoothSupported()) throw new Error('Este navegador no permite Bluetooth. Usa Chrome en Android o la app RawBT.');
  if (!forceChoose && bleDevice?.gatt?.connected && bleCharacteristic) return bleCharacteristic;
  if (forceChoose || !bleDevice) {
    // Debe llamarse dentro del clic del usuario: el navegador muestra la lista de equipos
    bleDevice = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICES,
    });
  }
  const server = await bleDevice.gatt.connect();
  bleCharacteristic = await findWritableCharacteristic(server);
  return bleCharacteristic;
}

async function printViaBluetooth(data: Uint8Array, forceChoose = false) {
  const ch = await getBleCharacteristic(forceChoose);
  // Paquetes pequeños: muchas impresoras BLE no aceptan más de 20 bytes por envío
  const CHUNK = 20;
  for (let i = 0; i < data.length; i += CHUNK) {
    const part = data.slice(i, i + CHUNK);
    if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part);
    else await ch.writeValue(part);
  }
}

// ---------------------------------------------------------------------------
// Impresora integrada / Bluetooth clásico, sin apps (Web Serial)
// ---------------------------------------------------------------------------
// Muchas terminales Android (Sunmi y similares) exponen la impresora integrada
// como un dispositivo Bluetooth clásico ya emparejado ("InnerPrinter"), y las
// ticketeras Bluetooth comunes también son Bluetooth clásico (perfil SPP).
// Chrome para Android habla con ellos por Web Serial, sin instalar nada. El
// permiso queda guardado: se elige una sola vez por equipo.
const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
let serialPort: any = null;

export const isSerialSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).serial;

async function getSerialPort(forceChoose: boolean): Promise<any> {
  if (!isSerialSupported()) throw new Error('Este navegador no permite conectar la impresora directamente. Actualiza Chrome o usa RawBT.');
  const serial = (navigator as any).serial;
  if (!forceChoose && !serialPort) {
    const ports: any[] = await serial.getPorts();   // elegida antes en este equipo
    serialPort = ports[0] || null;
  }
  if (forceChoose || !serialPort) {
    // Debe llamarse dentro del clic: Chrome muestra la lista de equipos emparejados
    serialPort = await serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
  }
  return serialPort;
}

async function printViaSerial(data: Uint8Array) {
  const port = await getSerialPort(false);
  if (!port.writable) await port.open({ baudRate: 9600 });
  const writer = port.writable.getWriter();
  try {
    // Por partes, para no desbordar el búfer de impresoras lentas
    for (let i = 0; i < data.length; i += 512) await writer.write(data.slice(i, i + 512));
  } finally {
    writer.releaseLock();
  }
}

/** Mensaje para el usuario cuando falla la impresión (null = canceló a propósito). */
export function printerErrorMessage(e: any, method: PrintMethod): string | null {
  if (e?.name === 'NotFoundError') {
    // En "integrada", la lista de Chrome sale vacía si el equipo no tiene la
    // impresora como Bluetooth emparejado; cancelar es lo único que se puede hacer.
    return method === 'serial'
      ? 'No se encontró la impresora. Revisa que el Bluetooth esté encendido y la impresora emparejada en Ajustes → Bluetooth. Si no aparece ahí, tu equipo no la expone por Bluetooth: usa "Directa (RawBT)".'
      : null;
  }
  return e?.message || 'No se pudo imprimir';
}

/** Elige (o cambia) la impresora integrada / Bluetooth clásico. Llamar desde un clic. */
export async function chooseSerialPrinter(): Promise<string> {
  const port = await getSerialPort(true);
  const info = port.getInfo?.() || {};
  return info.bluetoothServiceClassId ? 'Impresora Bluetooth' : 'Impresora';
}

/** Elige (o cambia) la impresora Bluetooth. Llamar desde un clic. */
export async function chooseBluetoothPrinter(): Promise<string> {
  await getBleCharacteristic(true);
  return bluetoothPrinterName() || 'Impresora';
}

/** Quita el recibo de impresión que haya quedado (si el navegador no avisó afterprint). */
export function clearThermalPrint() {
  document.getElementById('thermal-print-root')?.remove();
  document.getElementById('thermal-print-style')?.remove();
}

/** Imprime con el diálogo del navegador usando el mismo texto a columnas. */
async function printViaBrowser(lines: TicketLine[], paper: PaperWidth) {
  const cols = COLUMNS[paper];
  const widthMm = PRINTABLE_MM[paper];
  // Tamaño de letra para que las columnas llenen el ancho imprimible
  // (en fuentes monoespaciadas cada carácter mide ~0.6 del tamaño; se deja
  // holgura para que ninguna fuente parta la línea).
  const fontMm = (widthMm / cols / 0.64).toFixed(2);

  clearThermalPrint();

  const style = document.createElement('style');
  style.id = 'thermal-print-style';
  style.textContent = `
    @page { size: ${paper}mm auto; margin: 0; }
    #thermal-print-root { display: none; }
    @media print {
      /* Ancho completo de la hoja y el ticket centrado: si el sistema usa un papel
         más ancho que el ticket, el recibo no queda pegado a la izquierda. */
      html, body { width: 100% !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
      body > *:not(#thermal-print-root) { display: none !important; }
      #thermal-print-root {
        display: block !important; width: ${widthMm}mm; margin: 0 auto; padding: 2mm 0 6mm;
        color: #000 !important; background: #fff !important;
        font-family: 'Roboto Mono', 'Droid Sans Mono', 'DejaVu Sans Mono', Consolas, 'Lucida Console', 'Courier New', monospace;
        font-size: ${fontMm}mm; line-height: 1.25; font-weight: 600;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      #thermal-print-root div { white-space: pre-wrap; overflow-wrap: anywhere; color: #000 !important; }
      #thermal-print-root .b { font-weight: 800; }
      #thermal-print-root .big { line-height: 1.9; }
      #thermal-print-root .big span { display: inline-block; transform: scaleY(1.6); }
      #thermal-print-root .inv { background: #000 !important; color: #fff !important; border-radius: 0.6mm; margin: 1mm 0; }
      #thermal-print-root .inv span { color: #fff !important; }
      #thermal-print-root .box { border: 0.35mm solid #000; border-radius: 1mm; padding: 0.8mm 0; margin: 1.2mm 0; }
      #thermal-print-root .logo { display: flex; justify-content: center; margin-bottom: 1.5mm; }
      #thermal-print-root .logo img { max-width: 20mm; max-height: 20mm; object-fit: contain; filter: grayscale(1) contrast(1.6); }
    }`;
  const root = document.createElement('div');
  root.id = 'thermal-print-root';
  let box: HTMLDivElement | null = null;
  for (const line of lines) {
    const div = document.createElement('div');
    if (line.image) {
      div.className = 'logo';
      const img = document.createElement('img');
      img.src = line.image;
      img.alt = '';
      div.appendChild(img);
      root.appendChild(div);
      box = null;
      continue;
    }
    if (line.bold) div.classList.add('b');
    if (line.invert) div.classList.add('inv');
    if (line.big) {
      // Doble alto como en la ticketera: más alto, mismo ancho
      div.classList.add('big');
      const span = document.createElement('span');
      span.textContent = line.text.trimEnd();
      div.appendChild(span);
    } else {
      div.textContent = line.text.trimEnd() || ' ';
    }
    // Líneas del recuadro de contacto: dentro de un borde
    if (line.boxed) {
      if (!box) { box = document.createElement('div'); box.className = 'box'; root.appendChild(box); }
      box.appendChild(div);
    } else {
      box = null;
      root.appendChild(div);
    }
  }
  document.head.appendChild(style);
  document.body.appendChild(root);

  // Esperar el logo antes de abrir el diálogo (si no, sale en blanco); si no carga, se omite
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map(img => img.decode().catch(() => { img.parentElement?.remove(); })));

  const cleanup = () => { root.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  requestAnimationFrame(() => window.print());
}

export async function printTicket(lines: TicketLine[], settings: PrinterSettings) {
  if (settings.method === 'browser') return printViaBrowser(lines, settings.paper);
  // Logo a ~18 mm (144 puntos a 203 ppp), en blanco y negro
  const images: Record<string, RasterImage | null> = {};
  if (!settings.basic) for (const line of lines) if (line.image && !(line.image in images)) images[line.image] = await rasterizeImage(line.image, 144);
  const data = buildEscPos(lines, settings, images);
  if (settings.method === 'rawbt') return printViaRawBT(data);
  if (settings.method === 'serial') return printViaSerial(data);
  return printViaBluetooth(data);
}

export function printSaleReceipt(sale: LocalSale, biz: ReceiptBusiness, settings = loadPrinterSettings()) {
  return printTicket(buildTicketLines(sale, biz, settings.paper), settings);
}

/** Hoja de prueba para comprobar ancho de papel, tildes y conexión. */
export function printTestPage(settings: PrinterSettings) {
  const w = COLUMNS[settings.paper];
  const lines: TicketLine[] = [
    { text: center('PRUEBA DE IMPRESORA', w), bold: true, big: true },
    { text: '='.repeat(w) },
    { text: `Papel ${settings.paper} mm - ${w} columnas` },
    { text: '1234567890'.repeat(Math.ceil(w / 10)).slice(0, w) },
    { text: 'Tildes: áéíóú ÁÉÍÓÚ ñÑ ¿¡' },
    { text: `${'Izquierda'}${'Derecha'.padStart(w - 9)}` },
    { text: '='.repeat(w) },
    { text: center('Si ves la linea de numeros', w) },
    { text: center('completa, el ancho esta bien.', w) },
  ];
  return printTicket(lines, { ...settings, openDrawer: false });
}
