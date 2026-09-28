import type { LocalProduct } from '../types';

// Modalidad de precio de una venta: al detal (price) o al por mayor (wholesale_price).
export type PriceMode = 'retail' | 'wholesale';

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  retail: 'Detal',
  wholesale: 'Por mayor',
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Precio al por mayor del producto; si no tiene, el precio al detal. */
export function wholesalePrice(product: Pick<LocalProduct, 'price' | 'wholesale_price'>): number {
  return product.wholesale_price === undefined || product.wholesale_price === null
    ? toNumber(product.price)
    : toNumber(product.wholesale_price);
}

export function unitPrice(product: Pick<LocalProduct, 'price' | 'wholesale_price'>, mode: PriceMode): number {
  return mode === 'wholesale' ? wholesalePrice(product) : toNumber(product.price);
}

export function profitFor(price: number, cost: number): number {
  return price - cost;
}

export function marginPct(price: number, cost: number): number {
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}

/**
 * El backend serializa los Decimal como texto ("10000.00"). Se normalizan a
 * número al guardar en IndexedDB para que sumas y toLocaleString funcionen.
 */
export function normalizeProduct<T extends Partial<LocalProduct>>(product: T): T {
  const wp = (product as any).wholesale_price;
  return {
    ...product,
    price: toNumber(product.price),
    cost: toNumber(product.cost),
    stock: toNumber(product.stock),
    tax_rate: product.tax_rate === undefined || product.tax_rate === null ? product.tax_rate : toNumber(product.tax_rate),
    wholesale_price: wp === undefined || wp === null || wp === '' ? undefined : toNumber(wp),
  };
}
