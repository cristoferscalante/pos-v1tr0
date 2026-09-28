export const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

// Límite de la foto original que se acepta para comprimir (una foto de celular
// moderno pesa 3-12 MB; la versión optimizada queda en ~40-150 KB).
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('La imagen supera el máximo permitido de 1 MB');
  }

  return blobToDataUrl(file);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

interface CompressOptions {
  maxSize?: number;   // lado más largo en px
  quality?: number;   // 0-1
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // from-image respeta la orientación EXIF (fotos verticales del celular)
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch { /* algunos Safari no aceptan opciones: cae al <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * Redimensiona y recomprime una foto en el navegador antes de guardarla.
 * Prefiere WebP (mismo aspecto con mucho menos peso); si el navegador no sabe
 * codificar WebP (Safari antiguo devuelve PNG), usa JPEG.
 */
export async function compressImage(file: Blob, { maxSize = 1024, quality = 0.8 }: CompressOptions = {}): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo no es una imagen');
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('La foto es demasiado grande (máximo 25 MB)');
  }

  const source = await loadBitmap(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, maxSize / Math.max(width, height));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', Math.min(0.85, quality + 0.02));
  if (!jpeg) throw new Error('No se pudo comprimir la imagen');
  return jpeg;
}

/** Comprime y devuelve un data URL (para logo/banner y fotos sin conexión). */
export async function compressImageToDataUrl(file: Blob, options?: CompressOptions): Promise<string> {
  return blobToDataUrl(await compressImage(file, options));
}
