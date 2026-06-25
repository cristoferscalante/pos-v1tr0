export const MAX_IMAGE_SIZE_BYTES = 1024 * 1024;

export async function fileToDataUrl(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('La imagen supera el máximo permitido de 1 MB');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}
