import type { ApiProduct, AuthUser, LocalProduct } from '../types';

type ProductLike = Pick<LocalProduct, 'category' | 'meta_data'> | Pick<ApiProduct, 'category' | 'meta_data'>;

export function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Categorías del negocio disponibles para asignar a un producto.
 *
 * Las categorías son PROPIAS de cada negocio (viven en
 * `tenant.meta_data.product_categories`): un negocio nuevo empieza SIN
 * categorías y va creando las suyas. Aquí combinamos, sin duplicar y en
 * este orden:
 *  1. Las que el negocio ha guardado (`tenant.meta_data.product_categories`).
 *  2. Las que ya están en uso en alguno de sus productos — así una categoría
 *     "usada en otros productos" siempre aparece aunque el listado guardado se
 *     haya quedado corto (p. ej. sesión vieja en localStorage).
 *
 * Si el negocio todavía no tiene ninguna, devuelve `[]` (no inventamos
 * categorías por defecto): el formulario obliga a crear la primera.
 */
export function getTenantProductCategories(user?: AuthUser | null, products?: ProductLike[]) {
  const configured = Array.isArray(user?.meta_data?.product_categories)
    ? user?.meta_data?.product_categories
    : [];

  const fromConfig = configured
    .map((item: unknown) => normalizeCategoryName(String(item || '')))
    .filter(Boolean);

  const fromProducts = (products || [])
    .map(getProductCategory)
    .map(normalizeCategoryName)
    .filter(Boolean);

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const category of [...fromConfig, ...fromProducts]) {
    const key = category.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(category);
    }
  }

  return merged;
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
