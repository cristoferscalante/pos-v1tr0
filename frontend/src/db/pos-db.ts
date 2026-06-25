import Dexie, { type Table } from 'dexie';
import type { LocalProduct, LocalSale, LocalCustomer } from '../types';

class POSDatabase extends Dexie {
  products!: Table<LocalProduct>;
  sales!: Table<LocalSale>;
  customers!: Table<LocalCustomer>;

  constructor() {
    super('POSDatabase');
    this.version(2).stores({
      products: 'id, name, sku, barcode, category',
      sales: 'id, sale_number, sync_status, created_at, payment_method',
      customers: 'id, name, email',
    });
  }
}

export const db = new POSDatabase();
export type { POSDatabase };

export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
    return false;
  }

  try {
    if (typeof navigator.storage.persisted === 'function') {
      const alreadyPersistent = await navigator.storage.persisted();
      if (alreadyPersistent) return true;
    }

    return navigator.storage.persist();
  } catch {
    return false;
  }
}

// Re-export types for backwards compat (avoid breaking existing imports)
export type { LocalProduct, LocalSale, LocalCustomer };
export type { LocalSaleDetail } from '../types';
