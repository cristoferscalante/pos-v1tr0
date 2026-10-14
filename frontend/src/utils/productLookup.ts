import type { LocalProduct } from '../types';

/** Busca un producto por el texto leído del escáner (código de barras o SKU). */
export function findProductByCode<T extends Pick<LocalProduct, 'barcode' | 'sku'>>(products: T[], code: string): T | undefined {
  const term = code.trim();
  if (!term) return undefined;
  const lower = term.toLowerCase();
  const exact = products.find(p => p.barcode === term || p.sku?.toLowerCase() === lower)
    || products.find(p => p.barcode?.toLowerCase() === lower);
  if (exact || !/^\d+$/.test(term)) return exact;
  // UPC-A (12 dígitos) y EAN-13 son el mismo código con un 0 adelante: según cómo
  // esté configurado el lector llega con o sin ese 0.
  const digits = term.replace(/^0+/, '');
  return products.find(p => !!p.barcode && /^\d+$/.test(p.barcode) && p.barcode.replace(/^0+/, '') === digits);
}
