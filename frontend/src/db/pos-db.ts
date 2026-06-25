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

// Re-export types for backwards compat (avoid breaking existing imports)
export type { LocalProduct, LocalSale, LocalCustomer };
export type { LocalSaleDetail } from '../types';
