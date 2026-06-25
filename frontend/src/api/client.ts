// ========================
// API CLIENT CENTRALIZADO V1TR0 POS
// ========================
import type {
  AuthResponse, ApiProduct, ApiSale,
  DashboardSummary, ChartDataPoint, TopProduct, LocalSale, CashSessionResponse, NotificationRule,
  Supplier, Purchase, InventoryMovement, NotificationLog
} from '../types';

const rawApiUrl = typeof import.meta.env.VITE_API_URL === 'string' ? import.meta.env.VITE_API_URL.trim() : '';
export const API_URL = rawApiUrl || '/api-proxy';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        detail = (await res.json()).detail || detail;
      } else {
        const text = await res.text();
        detail = text || detail;
      }
    } catch { /* */ }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return undefined as T;
  }
  return res.json();
}

// --- Auth ---
export const authApi = {
  login: (email: string, password: string): Promise<AuthResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    return fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    }).then(async res => {
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const detail = contentType.includes('application/json')
          ? (await res.json()).detail || 'Error de autenticación'
          : (await res.text()) || 'Error de autenticación';
        throw new ApiError(res.status, detail);
      }
      return res.json();
    });
  },

  register: (data: {
    business_name: string;
    business_type: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> =>
    request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  forgotPassword: (email: string): Promise<{ status: string; message: string }> =>
    request('/api/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (tokenValue: string, newPassword: string): Promise<{ status: string; message: string }> =>
    request('/api/v1/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: tokenValue, new_password: newPassword }) }),

  getTenant: (token: string): Promise<any> =>
    request('/api/v1/auth/tenant', {}, token),

  updateTenant: (token: string, data: { name?: string; slug?: string; whatsapp_number?: string; display_name?: string; logo_url?: string; banner_url?: string; brand_color?: string }): Promise<any> =>
    request('/api/v1/auth/tenant', { method: 'PUT', body: JSON.stringify(data) }, token),

  listCollaborators: (token: string): Promise<any[]> =>
    request('/api/v1/auth/collaborators', {}, token),

  createCollaborator: (token: string, data: { email: string; password: string }): Promise<any> =>
    request('/api/v1/auth/collaborators', { method: 'POST', body: JSON.stringify(data) }, token),

  deleteCollaborator: (token: string, userId: string): Promise<void> =>
    request(`/api/v1/auth/collaborators/${userId}`, { method: 'DELETE' }, token),

  changePassword: (token: string, data: { current_password: string; new_password: string }): Promise<{ status: string }> =>
    request('/api/v1/auth/change-password', { method: 'POST', body: JSON.stringify(data) }, token),

  listNotificationRules: (token: string): Promise<NotificationRule[]> =>
    request('/api/v1/auth/notifications', {}, token),

  updateNotificationRule: (token: string, ruleId: string, data: { enabled?: boolean; recipients?: string[]; meta_data?: Record<string, any> }): Promise<NotificationRule> =>
    request(`/api/v1/auth/notifications/${ruleId}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  testNotificationEmail: (token: string, recipient: string): Promise<{ status: string; message: string }> =>
    request('/api/v1/auth/notifications/test', { method: 'POST', body: JSON.stringify({ recipient }) }, token),

  listNotificationLogs: (token: string): Promise<NotificationLog[]> =>
    request('/api/v1/purchases/notification-logs', {}, token),
};

// --- Products ---
export const productsApi = {
  list: (token: string): Promise<ApiProduct[]> =>
    request('/api/v1/products/', {}, token),

  create: (token: string, data: Omit<ApiProduct, 'tenant_id'>): Promise<ApiProduct> =>
    request('/api/v1/products/', { method: 'POST', body: JSON.stringify(data) }, token),

  update: (token: string, id: string, data: Partial<ApiProduct>): Promise<ApiProduct> =>
    request(`/api/v1/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  delete: (token: string, id: string): Promise<void> =>
    request(`/api/v1/products/${id}`, { method: 'DELETE' }, token),
};

// --- Sales ---
export const salesApi = {
  list: (token: string): Promise<ApiSale[]> =>
    request('/api/v1/sales/', {}, token),

  syncOffline: (token: string, sales: LocalSale[]): Promise<{ synced_ids: string[]; errors: any[] }> =>
    request('/api/v1/sales/sync', { method: 'POST', body: JSON.stringify({ sales }) }, token),
};

export const cashApi = {
  current: (token: string): Promise<CashSessionResponse> =>
    request('/api/v1/cash/current', {}, token),

  list: (token: string): Promise<CashSessionResponse[]> =>
    request('/api/v1/cash/', {}, token),

  open: (token: string, data: { opening_amount: number; notes?: string }): Promise<CashSessionResponse> =>
    request('/api/v1/cash/open', { method: 'POST', body: JSON.stringify(data) }, token),

  close: (token: string, sessionId: string, data: { actual_closing_amount: number; notes?: string }): Promise<CashSessionResponse> =>
    request(`/api/v1/cash/${sessionId}/close`, { method: 'POST', body: JSON.stringify(data) }, token),
};

export const suppliersApi = {
  list: (token: string): Promise<Supplier[]> =>
    request('/api/v1/suppliers/', {}, token),

  create: (token: string, data: { name: string; contact_name?: string; email?: string; phone?: string; document_number?: string; address?: string; city?: string; payment_terms_days?: number; notes?: string }): Promise<Supplier> =>
    request('/api/v1/suppliers/', { method: 'POST', body: JSON.stringify(data) }, token),

  update: (token: string, supplierId: string, data: Partial<Supplier>): Promise<Supplier> =>
    request(`/api/v1/suppliers/${supplierId}`, { method: 'PUT', body: JSON.stringify(data) }, token),
};

export const purchasesApi = {
  list: (token: string, params?: { supplier_id?: string; balance_only?: boolean }): Promise<Purchase[]> => {
    const search = new URLSearchParams();
    if (params?.supplier_id) search.set('supplier_id', params.supplier_id);
    if (params?.balance_only) search.set('balance_only', 'true');
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request(`/api/v1/purchases/${suffix}`, {}, token);
  },

  get: (token: string, purchaseId: string): Promise<Purchase> =>
    request(`/api/v1/purchases/${purchaseId}`, {}, token),

  create: (token: string, data: { supplier_id: string; invoice_number?: string; tax?: number; paid_amount?: number; due_date?: string; notes?: string; details: { product_id: string; quantity: number; unit_cost: number }[] }): Promise<Purchase> =>
    request('/api/v1/purchases/', { method: 'POST', body: JSON.stringify(data) }, token),

  update: (token: string, purchaseId: string, data: { invoice_number?: string; tax?: number; paid_amount?: number; due_date?: string; notes?: string }): Promise<Purchase> =>
    request(`/api/v1/purchases/${purchaseId}`, { method: 'PUT', body: JSON.stringify(data) }, token),

  cancel: (token: string, purchaseId: string): Promise<Purchase> =>
    request(`/api/v1/purchases/${purchaseId}/cancel`, { method: 'POST' }, token),

  addPayment: (token: string, purchaseId: string, data: { amount: number; payment_method?: string; notes?: string }): Promise<Purchase> =>
    request(`/api/v1/purchases/${purchaseId}/payments`, { method: 'POST', body: JSON.stringify(data) }, token),

  accountsPayableSummary: (token: string): Promise<{ total_balance: number; overdue_count: number; upcoming_count: number; overdue: Purchase[]; upcoming: Purchase[] }> =>
    request('/api/v1/purchases/accounts-payable/summary', {}, token),

  movements: (token: string): Promise<InventoryMovement[]> =>
    request('/api/v1/purchases/movements', {}, token),

  kardex: (token: string, productId: string): Promise<InventoryMovement[]> =>
    request(`/api/v1/purchases/products/${productId}/kardex`, {}, token),

  manualMovement: (token: string, data: { product_id: string; movement_type: string; quantity: number; unit_cost?: number; notes?: string }): Promise<any> =>
    request('/api/v1/purchases/movements/manual', { method: 'POST', body: JSON.stringify(data) }, token),

  supplierReturn: (token: string, data: { supplier_id: string; product_id: string; quantity: number; unit_cost?: number; notes?: string }): Promise<any> =>
    request('/api/v1/purchases/returns', { method: 'POST', body: JSON.stringify(data) }, token),
};

// --- Dashboard ---
export const dashboardApi = {
  summary: (token: string): Promise<DashboardSummary> =>
    request('/api/v1/dashboard/summary', {}, token),

  chart: (token: string, days = 7): Promise<ChartDataPoint[]> =>
    request(`/api/v1/dashboard/chart?days=${days}`, {}, token),

  topProducts: (token: string, limit = 5): Promise<TopProduct[]> =>
    request(`/api/v1/dashboard/top-products?limit=${limit}`, {}, token),
};

// --- Public Catalog ---
export const publicCatalogApi = {
  fetch: (slug: string): Promise<{ tenant: any; products: ApiProduct[] }> =>
    request(`/api/v1/products/public/${slug}`),
};

export { ApiError };
