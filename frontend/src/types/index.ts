// ========================
// TIPOS CENTRALIZADOS V1TR0 POS
// ========================

// --- Auth ---
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenant_id: string;
  business_name: string;
  business_type: string;
  slug?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

// --- IndexedDB Local ---
export interface LocalProduct {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost: number;
  stock: number;
  category?: string;
  image?: string;
  tax_rate?: number;
  meta_data?: Record<string, any>;
}

export interface LocalSaleDetail {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface LocalSale {
  id: string;
  sale_number: string;
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  created_at: string;
  sync_status: 'pending' | 'synced';
  cash_session_id?: string;
  sync_error?: string;
  meta_data?: Record<string, any>;
  details: LocalSaleDetail[];
}

export interface LocalCustomer {
  id: string;
  name: string;
  email?: string;
  meta_data?: Record<string, any>;
}

// --- API Server ---
export interface ApiProduct {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost: number;
  stock: number;
  category?: string;
  image?: string;
  tax_rate?: number;
  tenant_id: string;
  meta_data?: Record<string, any>;
}

export interface ApiSale {
  id: string;
  sale_number: string;
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  created_at: string;
  tenant_id: string;
  user_id: string;
  meta_data?: Record<string, any>;
}

// --- Dashboard ---
export interface DashboardSummary {
  counts: { today: number; week: number; month: number };
  revenue: { today: number; week: number; month: number };
  profit: { today: number; week: number; month: number };
  avg_ticket: number;
  low_stock_count: number;
  low_stock_products: { id: string; name: string; stock: number }[];
  payment_breakdown: Record<string, number>;
   current_cash_session?: CashSessionSummary | null;
}

export interface ChartDataPoint {
  date: string;
  label: string;
  count: number;
  revenue: number;
}

export interface TopProduct {
  product_id: string;
  name: string;
  quantity_sold: number;
  revenue: number;
}

export interface CashSession {
  id: string;
  tenant_id: string;
  opened_by_user_id: string;
  closed_by_user_id?: string | null;
  opening_amount: number;
  expected_closing_amount?: number | null;
  actual_closing_amount?: number | null;
  notes?: string | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string | null;
}

export interface CashSessionSummary {
  id: string;
  opened_at: string;
  opening_amount: number;
  sales_count: number;
  sales_total: number;
  expected_amount: number;
}

export interface CashSessionResponse {
  session: CashSession | null;
  sales_count?: number;
  sales_total?: number;
  expected_amount?: number;
  difference_amount?: number;
}

export interface NotificationRule {
  id: string;
  tenant_id: string;
  event_type: string;
  enabled: boolean;
  recipients: string[];
  meta_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  document_number?: string | null;
  address?: string | null;
  city?: string | null;
  payment_terms_days: number;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Purchase {
  id: string;
  tenant_id: string;
  supplier_id: string;
  supplier_name?: string;
  user_id: string;
  invoice_number?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  due_date?: string | null;
  details?: Array<{
    product_id: string;
    name: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
  }>;
  notes?: string | null;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  user_id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  unit_cost?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  created_at: string;
}

// --- UI ---
export type View = 'pos' | 'inventory' | 'supplies' | 'sales' | 'dashboard' | 'settings';
export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type BusinessType = 'veterinaria' | 'restaurante' | 'tienda' | 'farmacia' | 'otro';

export interface CartItem {
  product: LocalProduct;
  quantity: number;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}
