import type { ApiProduct, AuthUser, LocalProduct } from '../types';

type ProductLike = Pick<LocalProduct, 'category' | 'meta_data'> | Pick<ApiProduct, 'category' | 'meta_data'>;

const DEFAULT_CATEGORY_BY_BUSINESS: Record<string, string[]> = {
  veterinaria: ['Medicinas', 'Comida', 'Accesorios', 'Servicios'],
  restaurante: ['Entradas', 'Platos fuertes', 'Bebidas', 'Postres'],
  farmacia: ['Medicinas', 'Cuidado personal', 'Suplementos', 'Servicios'],
  tienda: ['Abarrotes', 'Bebidas', 'Limpieza', 'Varios'],
  retail: ['General'],
  otro: ['General'],
};

export function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function getDefaultProductCategories(businessType?: string | null) {
  const normalizedType = (businessType || 'otro').toLowerCase();
  return DEFAULT_CATEGORY_BY_BUSINESS[normalizedType] || DEFAULT_CATEGORY_BY_BUSINESS.otro;
}

export function getTenantProductCategories(user?: AuthUser | null) {
  const configured = Array.isArray(user?.meta_data?.product_categories)
    ? user?.meta_data?.product_categories
    : [];

  const values = configured
    .map((item: unknown) => normalizeCategoryName(String(item || '')))
    .filter(Boolean);

  return values.length > 0 ? Array.from(new Set(values)) : getDefaultProductCategories(user?.business_type);
}

export function getProductCategory(product: ProductLike) {
  const directCategory = normalizeCategoryName(String(product.category || ''));
  if (directCategory) return directCategory;

  const legacyCategory = normalizeCategoryName(String(product.meta_data?.tipo || ''));
  if (legacyCategory) return legacyCategory;

  return 'General';
}

export function buildCategoryOptions(categories: string[]) {
  return Array.from(new Set(categories.map(normalizeCategoryName).filter(Boolean)));
}
