// Genera la imagen (PNG) del recibo de una venta para descargarla o compartirla
// (WhatsApp, etc.). Se dibuja en un canvas en el propio celular: funciona sin
// conexión y no depende de librerías externas.
import type { LocalSale } from '../types';

export interface ReceiptBusiness {
  name: string;
  color?: string;
  lines: string[];      // razón social, NIT, dirección, teléfonos...
  footer: string;
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
const W = 720;          // 360 px lógicos × 2 para que se vea nítida
const PAD = 48;
const FONT = "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif";

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`;

/** Datos del negocio guardados en la sesión (Configuración → Datos del negocio para recibos). */
export function businessFromUser(user: any): ReceiptBusiness {
  const m = user?.meta_data || {};
  return {
    name: m.display_name || user?.business_name || 'Mi negocio',
    color: /^#[0-9a-fA-F]{6}$/.test(m.brand_color || '') ? m.brand_color : '#4f46e5',
    lines: [
      m.business_legal_name,
      m.business_nit ? `NIT ${m.business_nit}` : '',
      [m.business_address, m.business_city].filter(Boolean).join(', '),
      [m.business_phone ? `Tel. ${m.business_phone}` : '', m.whatsapp_number ? `WhatsApp ${m.whatsapp_number}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean),
    footer: m.receipt_footer || '¡Gracias por su compra!',
  };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderReceiptImage(sale: LocalSale, biz: ReceiptBusiness): Promise<Blob> {
  try { await document.fonts?.ready; } catch { /* fuentes del sistema */ }
  const color = biz.color || '#4f46e5';
  const wholesale = sale.meta_data?.price_mode === 'wholesale';
  const date = new Date(sale.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

  // Se dibuja dos veces: la primera solo mide el alto total
  const draw = (ctx: CanvasRenderingContext2D, paint: boolean): number => {
    let y = 0;
    const text = (t: string, x: number, font: string, fill: string, align: CanvasTextAlign = 'left') => {
      ctx.font = font;
      ctx.textAlign = align;
      if (paint) { ctx.fillStyle = fill; ctx.fillText(t, x, y); }
    };

    // Encabezado con el color del negocio
    const headerH = 150 + (wholesale ? 44 : 0);
    if (paint) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, headerH);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.roundRect(PAD, 38, 76, 76, 20);
      ctx.fill();
    }
    y = 90;
    text(biz.name.slice(0, 1).toUpperCase(), PAD + 38, `700 40px ${FONT}`, '#fff', 'center');
    ctx.font = `700 34px ${FONT}`;
    const nameLines = wrap(ctx, biz.name, W - PAD * 2 - 100).slice(0, 2);
    y = nameLines.length > 1 ? 66 : 78;
    for (const l of nameLines) { text(l, PAD + 100, `700 34px ${FONT}`, '#fff'); y += 38; }
    text('Recibo de compra', PAD + 100, `400 24px ${FONT}`, 'rgba(255,255,255,0.9)');
    if (wholesale) {
      y += 44;
      if (paint) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.roundRect(PAD + 100, y - 30, 280, 40, 20);
        ctx.fill();
      }
      text('VENTA AL POR MAYOR', PAD + 120, `700 22px ${FONT}`, '#fff');
    }
    y = headerH + 44;

    // Datos del negocio
    for (const l of biz.lines) {
      ctx.font = `400 22px ${FONT}`;
      for (const part of wrap(ctx, l, W - PAD * 2)) { text(part, PAD, `400 22px ${FONT}`, '#4b5563'); y += 32; }
    }
    if (biz.lines.length) y += 12;

    // Datos de la venta
    const info: [string, string][] = [
      ['Recibo N.°', sale.sale_number],
      ['Fecha', date],
      ['Forma de pago', PAYMENT_LABELS[sale.payment_method] || sale.payment_method],
      ['Tipo de precio', wholesale ? 'Por mayor' : 'Detal'],
    ];
    const boxTop = y - 8;
    const boxH = info.length * 40 + 28;
    if (paint) {
      ctx.fillStyle = '#f3f4f6';
      ctx.beginPath();
      ctx.roundRect(PAD - 12, boxTop, W - (PAD - 12) * 2, boxH, 18);
      ctx.fill();
    }
    y = boxTop + 44;
    for (const [k, v] of info) {
      text(k, PAD + 8, `400 23px ${FONT}`, '#6b7280');
      text(v, W - PAD - 8, `600 23px ${FONT}`, '#111827', 'right');
      y += 40;
    }
    y = boxTop + boxH + 44;

    // Productos
    text('DETALLE', PAD, `700 20px ${FONT}`, '#6b7280');
    y += 20;
    for (const d of sale.details) {
      y += 34;
      ctx.font = `600 25px ${FONT}`;
      const nameParts = wrap(ctx, d.name, W - PAD * 2 - 170);
      text(money(d.total), W - PAD, `700 25px ${FONT}`, '#111827', 'right');
      for (let i = 0; i < nameParts.length; i++) {
        if (i > 0) y += 32;
        text(nameParts[i], PAD, `600 25px ${FONT}`, '#111827');
      }
      y += 32;
      text(`${d.quantity} × ${money(d.price)}`, PAD, `400 21px ${FONT}`, '#6b7280');
      y += 18;
      if (paint) { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(PAD, y, W - PAD * 2, 2); }
    }

    // Totales
    y += 44;
    const units = sale.details.reduce((s, d) => s + Number(d.quantity || 0), 0);
    text('Artículos', PAD, `400 23px ${FONT}`, '#6b7280');
    text(String(units), W - PAD, `600 23px ${FONT}`, '#111827', 'right');
    y += 36;
    text('Subtotal', PAD, `400 23px ${FONT}`, '#6b7280');
    text(money(sale.subtotal), W - PAD, `600 23px ${FONT}`, '#111827', 'right');
    if (Number(sale.tax) > 0) {
      y += 36;
      text('IVA', PAD, `400 23px ${FONT}`, '#6b7280');
      text(money(sale.tax), W - PAD, `600 23px ${FONT}`, '#111827', 'right');
    }
    y += 58;
    text('Total pagado', PAD, `700 30px ${FONT}`, '#111827');
    text(money(sale.total), W - PAD, `800 42px ${FONT}`, color, 'right');

    // Pie
    y += 44;
    if (paint) { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(PAD, y, W - PAD * 2, 2); }
    y += 50;
    ctx.font = `500 23px ${FONT}`;
    for (const l of wrap(ctx, biz.footer, W - PAD * 2)) { text(l, W / 2, `500 23px ${FONT}`, '#374151', 'center'); y += 32; }
    y += 6;
    text(biz.name, W / 2, `700 22px ${FONT}`, color, 'center');
    y += 36;
    text('Comprobante de pago · no es factura electrónica', W / 2, `400 18px ${FONT}`, '#9ca3af', 'center');
    return y + 40;
  };

  const measure = document.createElement('canvas').getContext('2d')!;
  const height = Math.ceil(draw(measure, false));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'alphabetic';
  draw(ctx, true);

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'));
}

export function receiptFileName(sale: LocalSale, biz: ReceiptBusiness) {
  const slug = biz.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `recibo-${slug || 'venta'}-${sale.sale_number}.png`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Comparte la imagen con las apps del celular (WhatsApp, etc.). Devuelve false si no se puede. */
export async function shareReceiptImage(blob: Blob, fileName: string, title: string): Promise<boolean> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
  } catch (err: any) {
    if (err?.name === 'AbortError') return true; // el usuario cerró el menú de compartir
    return false;
  }
  return true;
}
