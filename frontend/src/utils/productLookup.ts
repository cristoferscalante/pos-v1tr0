import type { LocalProduct } from '../types';

/** Busca un producto por el texto leído del escáner (código de barras o SKU). */
export function findProductByCode<T extends Pick<LocalProduct, 'barcode' | 'sku'>>(products: T[], code: string): T | undefined {
  const term = code.trim();
  if (!term) return undefined;
  const lower = term.toLowerCase();
  return products.find(p => p.barcode === term || p.sku?.toLowerCase() === lower);
}
