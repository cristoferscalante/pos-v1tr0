import { useState, useEffect } from 'react';
import {
  Package, Plus, Pencil, Trash2, Search, X, Save,
  TrendingUp, AlertTriangle, ChevronUp, ChevronDown, Barcode,
  ArrowLeft, ArrowRight, Check, Minus
} from 'lucide-react';
import { db } from '../db/pos-db';
import { authApi, productsApi } from '../api/client';
import { useToast, useConfirm } from '../components/Toast';
import { getBusinessTypeIcon } from '../components/BusinessTypeSelect';
import { CategoryPicker } from '../components/CategoryPicker';
import { fileToDataUrl } from '../utils/imageUpload';
import type { LocalProduct, AuthUser } from '../types';
import { buildCategoryOptions, getProductCategory, getTenantProductCategories, normalizeCategoryName } from '../utils/productCategories';

interface InventoryViewProps {
  products: LocalProduct[];
  token: string | null;
  isOnline: boolean;
  onProductsChange: () => void;
  user: AuthUser | null;
  onUserUpdate?: (user: AuthUser) => void;
}

type SortKey = 'name' | 'price' | 'cost' | 'stock';
type SortDir = 'asc' | 'desc';

const EMPTY_FORM: Partial<LocalProduct> = {
  name: '', sku: '', barcode: '', price: 0, cost: 0, stock: 0, category: '', tax_rate: 19, meta_data: {}
};

const TAX_RATE_OPTIONS: { value: number; label: string }[] = [
  { value: 19, label: '19% General' },
  { value: 5,  label: '5% Reducido' },
  { value: 0,  label: '0% Exento' }
];

const STEP_TITLES = ['Lo esencial', 'Precio y ganancia', 'Stock y categoría', 'Últimos detalles'];

// Borrador del alta de producto: si el modal se cierra sin guardar (cierre
// accidental, sesión expirada, se recarga la pestaña...) los campos NO se
// pierden — quedan en localStorage y se ofrecen al reabrir "Nuevo producto".
// Caduca a las 24h para no arrastrar un borrador viejo para siempre.
const DRAFT_KEY = 'pos_product_draft';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface ProductDraft {
  form: Partial<LocalProduct>;
  productImage: string;
  metaExtra: string;
  step: number;
  savedAt: number;
}

function draftHasContent(form: Partial<LocalProduct>, productImage: string, metaExtra: string) {
  return Boolean(
    form.name?.trim() ||
    (Number(form.price) || 0) > 0 ||
    (Number(form.cost) || 0) > 0 ||
    form.sku?.trim() ||
    form.barcode?.trim() ||
    metaExtra.trim() ||
    productImage
  );
}

function readProductDraft(): ProductDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ProductDraft;
    if (!draft || typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    if (!draftHasContent(draft.form || {}, draft.productImage || '', draft.metaExtra || '')) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function clearProductDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage no disponible */ }
}

export function InventoryView({ products, token, isOnline, onProductsChange, user, onUserUpdate }: InventoryViewProps) {
  const { success, error, warning } = useToast();
  const { confirm } = useConfirm();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LocalProduct | null>(null);
  const [form, setForm] = useState<Partial<LocalProduct>>(EMPTY_FORM);
  const [productImage, setProductImage] = useState<string>('');
  const [metaExtra, setMetaExtra] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tenantCategories, setTenantCategories] = useState<string[]>(() => getTenantProductCategories(user, products));
  const [step, setStep] = useState(1);
  const [visitedMax, setVisitedMax] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);

  const [archivedSuggestion, setArchivedSuggestion] = useState<LocalProduct | null>(null);

  // Guarda el borrador del alta mientras se está creando un producto (no al editar).
  useEffect(() => {
    if (!showForm || editingProduct) return;
    if (!draftHasContent(form, productImage, metaExtra)) return;
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ form, productImage, metaExtra, step, savedAt: Date.now() } satisfies ProductDraft)
        );
      } catch { /* storage lleno o no disponible: seguimos sin borrador */ }
    }, 400);
    return () => clearTimeout(handle);
  }, [showForm, editingProduct, form, productImage, metaExtra, step]);

  useEffect(() => {
    setTenantCategories(getTenantProductCategories(user, products));
  }, [user, products]);

  // Chequear si el código de barras corresponde a un producto archivado
  useEffect(() => {
    const code = form.barcode?.trim();
    if (!code || code.length < 3 || editingProduct || !token || !isOnline) {
      setArchivedSuggestion(null);
      return;
    }

    const handler = setTimeout(async () => {
      try {
        const results = await productsApi.list(token, { barcode: code, include_archived: true });
        const found = results.find(p => p.barcode === code && p.is_archived);
        if (found) {
          setArchivedSuggestion(found as LocalProduct);
        } else {
          setArchivedSuggestion(null);
        }
      } catch {
        setArchivedSuggestion(null);
      }
    }, 450);

    return () => clearTimeout(handler);
  }, [form.barcode, editingProduct, token, isOnline]);


  // Global keydown listener when modal is open to capture barcode scanner gun
  useEffect(() => {
    if (!showForm) return;

    let buffer = '';
    let lastKeyTime = Date.now();
    let keyTimes: number[] = [];
    let timeoutId: any;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // If focused on the barcode input itself, let the native input handle character insertion.
      // We only intercept Enter/Tab to prevent form submit or unexpected behavior.
      const isBarcodeField = target.tagName === 'INPUT' &&
        (target as HTMLInputElement).placeholder === 'Escanear o escribir';

      if (isBarcodeField) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          target.blur();
          success(`⚡ Código escaneado: ${(target as HTMLInputElement).value || buffer}`);
        }
        return;
      }

      // If focused on another input (like Name, Price), we want to intercept rapid scanner typing
      const isOtherInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      const currentTime = Date.now();
      const elapsed = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Reset buffer if delay is too long
      if (elapsed > 90) {
        buffer = '';
        keyTimes = [];
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 3) {
          const code = buffer.trim();
          setForm(f => ({ ...f, barcode: code }));
          success(`⚡ Código de barras capturado: ${code}`);
          e.preventDefault();
          e.stopPropagation();
        }
        buffer = '';
        keyTimes = [];
        clearTimeout(timeoutId);
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        keyTimes.push(elapsed);

        // Si detectamos velocidad de escáner en otro input, prevenimos la escritura nativa para que no lo ensucie
        const isScannerSpeed = keyTimes.length >= 2 && keyTimes.slice(1).every(t => t < 45);
        if (isScannerSpeed && isOtherInput) {
          e.preventDefault();
        }

        // Timeout por si la pistola no envía Enter/Tab
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const avgTime = keyTimes.length >= 2
            ? keyTimes.slice(1).reduce((s, t) => s + t, 0) / (keyTimes.length - 1)
            : 999;

          if (buffer.length >= 3 && avgTime < 45) {
            const code = buffer.trim();
            setForm(f => ({ ...f, barcode: code }));
            success(`⚡ Código de barras capturado: ${code}`);
          }
          buffer = '';
          keyTimes = [];
        }, 50);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      clearTimeout(timeoutId);
    };
  }, [showForm, success]);

  // Filter + Sort
  const filtered = products
    .filter(p => {
      const t = search.toLowerCase();
      return !t || p.name.toLowerCase().includes(t) ||
        (p.sku?.toLowerCase().includes(t)) || (p.barcode?.includes(t));
    })
    .sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const cmp = typeof va === 'string'
        ? va.localeCompare(String(vb))
        : Number(va) - Number(vb);
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
      : <ChevronUp size={14} style={{ opacity: 0.2 }} />;

  const startBlankCreate = () => {
    // Preseleccionamos una categoría existente del negocio si la hay; si el
    // negocio aún no tiene ninguna, se queda vacío y el paso 3 obliga a crearla.
    setForm({ ...EMPTY_FORM, category: tenantCategories[0] || '' });
    setMetaExtra('');
    setProductImage('');
    setStep(1);
    setVisitedMax(1);
    setDraftRestored(false);
  };

  const openCreate = () => {
    setEditingProduct(null);
    const draft = readProductDraft();
    if (draft) {
      // Retomamos lo que quedó a medias la última vez (ver DRAFT_KEY).
      setForm({ ...EMPTY_FORM, ...draft.form });
      setProductImage(draft.productImage || '');
      setMetaExtra(draft.metaExtra || '');
      const restoredStep = Math.min(4, Math.max(1, Math.round(draft.step) || 1));
      setStep(restoredStep);
      setVisitedMax(restoredStep);
      setDraftRestored(true);
    } else {
      startBlankCreate();
    }
    setShowForm(true);
  };

  const discardDraft = () => {
    clearProductDraft();
    startBlankCreate();
  };

  const openEdit = (p: LocalProduct) => {
    setEditingProduct(p);
    setForm({ ...p, category: getProductCategory(p) });
    setProductImage(p.image || '');
    setMetaExtra(p.meta_data?.detalle_especifico || '');
    // Al editar, los 4 pasos ya están disponibles: los datos vienen precargados.
    setStep(1);
    setVisitedMax(4);
    setDraftRestored(false);
    setShowForm(true);
  };

  const goNext = () => {
    if (step === 1) {
      if (!form.name?.trim()) { warning('Escribe el nombre del producto'); return; }
      if (!form.price || Number(form.price) <= 0) { warning('El precio de venta debe ser mayor a 0'); return; }
    }
    if (step === 3 && !normalizeCategoryName(String(form.category || ''))) {
      warning('Elige una categoría para el producto');
      return;
    }
    const next = Math.min(4, step + 1);
    setStep(next);
    setVisitedMax(m => Math.max(m, next));
  };

  const goBack = () => setStep(s => Math.max(1, s - 1));

  // Ganancia y margen en vivo (paso 2 y tarjeta de resumen)
  const priceNum = Number(form.price) || 0;
  const costNum = Number(form.cost) || 0;
  const unitProfit = priceNum - costNum;
  const marginPct = priceNum > 0 ? (unitProfit / priceNum) * 100 : 0;
  const marginTier: 'good' | 'ok' | 'low' = marginPct >= 30 ? 'good' : marginPct >= 10 ? 'ok' : 'low';
  const marginColor = marginTier === 'good' ? 'var(--success)' : marginTier === 'ok' ? 'var(--warning)' : 'var(--danger)';

  const syncTenantCategories = async (categories: string[]) => {
    const normalized = buildCategoryOptions(categories);
    setTenantCategories(normalized);
    if (!token || !isOnline) return normalized;

    try {
      const updatedTenant = await authApi.updateTenant(token, { product_categories: normalized });
      const refreshedCategories = buildCategoryOptions(updatedTenant.meta_data?.product_categories || normalized);
      setTenantCategories(refreshedCategories);
      return refreshedCategories;
    } catch {
      // Sin conexión con el servidor: el listado queda guardado localmente
      // (user.meta_data → localStorage) y se reintenta al crear/editar otra
      // categoría o al guardar un producto (handleSave reenvía la lista).
      return normalized;
    }
  };

  // Persiste el listado de categorías del negocio en el usuario (y de ahí a
  // localStorage vía App.onUserUpdate), para que sobreviva a recargar la página
  // o cerrar sesión. El servidor ya lo tiene por authApi.updateTenant.
  const persistUserCategories = (categories: string[]) => {
    if (user && onUserUpdate) {
      onUserUpdate({ ...user, meta_data: { ...(user.meta_data || {}), product_categories: categories } });
    }
  };

  const handleCreateCategory = async (rawName: string) => {
    const category = normalizeCategoryName(rawName);
    if (!category) {
      warning('Escribe un nombre para la categoría');
      return;
    }

    const existing = tenantCategories.find(item => item.toLowerCase() === category.toLowerCase());
    if (existing) {
      setForm(prev => ({ ...prev, category: existing }));
      warning('Esa categoría ya existe, la dejamos seleccionada');
      return;
    }

    try {
      const syncedCategories = await syncTenantCategories([...tenantCategories, category]);
      setForm(prev => ({ ...prev, category }));
      persistUserCategories(syncedCategories);
      success(`Categoría "${category}" creada y lista para reutilizar`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'No se pudo crear la categoría');
    }
  };

  // Reescribe la categoría en los productos que la usaban (IndexedDB + servidor)
  // para que renombrar una categoría no deje productos "huérfanos" con la etiqueta
  // vieja. Devuelve cuántos productos se tocaron.
  const rewriteProductsCategory = async (from: string, to: string) => {
    const affected = products.filter(
      p => getProductCategory(p).toLowerCase() === from.toLowerCase()
    );
    for (const product of affected) {
      const updated: LocalProduct = {
        ...product,
        category: to,
        meta_data: { ...(product.meta_data || {}), tipo: to },
        sync_status: isOnline && token ? 'synced' : 'pending',
        sync_error: undefined,
      };
      await db.products.put(updated);
      if (isOnline && token) {
        try {
          const res = await productsApi.update(token, product.id, updated);
          await db.products.put({ ...(res as LocalProduct), sync_status: 'synced', sync_error: undefined });
        } catch {
          await db.products.put({ ...updated, sync_status: 'pending', sync_error: 'Pendiente de sincronización' });
        }
      }
    }
    return affected.length;
  };

  const handleRenameCategory = async (from: string, rawTo: string) => {
    const target = normalizeCategoryName(rawTo);
    if (!target) {
      warning('El nombre de la categoría no puede quedar vacío');
      return;
    }
    if (
      target.toLowerCase() !== from.toLowerCase() &&
      tenantCategories.some(item => item.toLowerCase() === target.toLowerCase())
    ) {
      warning('Ya existe otra categoría con ese nombre');
      return;
    }

    try {
      const nextList = tenantCategories.map(item =>
        item.toLowerCase() === from.toLowerCase() ? target : item
      );
      const syncedCategories = await syncTenantCategories(nextList);
      persistUserCategories(syncedCategories);

      const touched = await rewriteProductsCategory(from, target);

      setForm(prev =>
        normalizeCategoryName(String(prev.category || '')).toLowerCase() === from.toLowerCase()
          ? { ...prev, category: target }
          : prev
      );
      onProductsChange();
      success(
        touched > 0
          ? `Categoría renombrada a "${target}" en ${touched} producto${touched === 1 ? '' : 's'}`
          : `Categoría renombrada a "${target}"`
      );
    } catch (err) {
      error(err instanceof Error ? err.message : 'No se pudo renombrar la categoría');
    }
  };

  const handleDeleteCategory = async (name: string) => {
    const inUse = products.filter(
      p => getProductCategory(p).toLowerCase() === name.toLowerCase()
    ).length;

    const ok = await confirm({
      title: 'Eliminar categoría',
      message: inUse > 0
        ? `${inUse} producto${inUse === 1 ? '' : 's'} usa${inUse === 1 ? '' : 'n'} "${name}". Se quitará de la lista; esos productos conservarán la etiqueta hasta que los edites.`
        : `¿Eliminar la categoría "${name}"?`,
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const nextList = tenantCategories.filter(item => item.toLowerCase() !== name.toLowerCase());
      const syncedCategories = await syncTenantCategories(nextList);
      persistUserCategories(syncedCategories);

      setForm(prev =>
        normalizeCategoryName(String(prev.category || '')).toLowerCase() === name.toLowerCase()
          ? { ...prev, category: syncedCategories[0] || '' }
          : prev
      );
      success('Categoría eliminada de la lista');
    } catch (err) {
      error(err instanceof Error ? err.message : 'No se pudo eliminar la categoría');
    }
  };

  const handleSave = async () => {
    if (!form.name) { warning('El nombre del producto es obligatorio'); return; }
    if (!form.price || form.price <= 0) { warning('El precio debe ser mayor a 0'); return; }
    const selectedCategory = normalizeCategoryName(String(form.category || ''));
    if (!selectedCategory) { warning('Selecciona una categoría'); return; }
    setIsSaving(true);
    try {
      const productData: LocalProduct = {
        id: editingProduct?.id || crypto.randomUUID(),
        name: form.name!,
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        price: Number(form.price),
        cost: Number(form.cost) || 0,
        // Al editar un producto existente, el stock NO se toma del formulario:
        // el backend ya ignora el campo "stock" en PUT /products/{id} (para no
        // pisar una venta o compra concurrente, ver hallazgo 5.4 del plan de
        // mejora), así que aquí se conserva el valor que ya tenía el producto en
        // vez del que estaba en pantalla cuando se abrió el formulario. Para
        // productos nuevos sí se usa el stock inicial capturado en el formulario.
        stock: editingProduct ? editingProduct.stock : (Number(form.stock) || 0),
        category: selectedCategory,
        image: productImage || undefined,
        tax_rate: form.tax_rate !== undefined ? Number(form.tax_rate) : 19,
        sync_status: isOnline && token ? 'synced' : 'pending',
        sync_error: undefined,
        meta_data: {
          tipo: selectedCategory,
          detalle_especifico: metaExtra || undefined,
        },
      };

      if (!tenantCategories.some(category => category.toLowerCase() === selectedCategory.toLowerCase())) {
        const syncedCategories = await syncTenantCategories([...tenantCategories, selectedCategory]);
        persistUserCategories(syncedCategories);
      }

      // Save/update in IndexedDB
      await db.products.put(productData);

      // Sync to server if online
      if (isOnline && token) {
        try {
          if (editingProduct) {
            const updated = await productsApi.update(token, productData.id, productData);
            await db.products.put({ ...(updated as LocalProduct), sync_status: 'synced', sync_error: undefined });
          } else {
            const created = await productsApi.create(token, productData as any);
            await db.products.put({ ...(created as LocalProduct), sync_status: 'synced', sync_error: undefined });
          }
        } catch (e) {
          productData.sync_status = 'pending';
          productData.sync_error = 'Producto pendiente de sincronización';
          await db.products.put(productData);
          warning('Guardado localmente. Se sincronizará cuando haya conexión.');
        }
      }

      if (!editingProduct) {
        // El producto quedó guardado: el borrador ya no hace falta.
        clearProductDraft();
        setDraftRestored(false);
      }
      success(editingProduct ? 'Producto actualizado ✓' : 'Producto creado ✓');
      setShowForm(false);
      onProductsChange();
    } catch (e) {
      error('Error al guardar el producto');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (product: LocalProduct) => {
    const ok = await confirm({ title: 'Eliminar producto', message: `¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`, confirmText: 'Eliminar', variant: 'danger' });
    if (!ok) return;
    setDeletingId(product.id);
    try {
      await db.products.delete(product.id);
      if (isOnline && token) {
        try { await productsApi.delete(token, product.id); } catch { /* local only */ }
      }
      success(`"${product.name}" eliminado`);
      onProductsChange();
    } catch {
      error('Error al eliminar el producto');
    } finally {
      setDeletingId(null);
    }
  };

  // Stats
  const totalValue = products.reduce((s, p) => s + p.price * p.stock, 0);
  const lowStock = products.filter(p => p.stock < 5 && p.stock > 0).length;
  const outOfStock = products.filter(p => p.stock <= 0).length;


  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <Package size={24} className="view-title-icon" />
            Inventario
          </h1>
          <p className="view-subtitle">{products.length} productos registrados</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Nuevo Producto
        </button>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Package size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <p className="stat-value">{products.length}</p>
            <p className="stat-label">Total productos</p>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <TrendingUp size={20} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <p className="stat-value">${totalValue.toLocaleString('es-CO')}</p>
            <p className="stat-label">Valor en inventario</p>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
          </div>
          <div>
            <p className="stat-value">{lowStock}</p>
            <p className="stat-label">Stock bajo (&lt;5)</p>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(239,68,68,0.15)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
          </div>
          <div>
            <p className="stat-value">{outOfStock}</p>
            <p className="stat-label">Sin stock</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="search-box" style={{ width: '100%', maxWidth: 380 }}>
        <Search className="search-icon" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU o código..."
          className="search-input"
        />
      </div>

      {/* Table */}
      <div className="table-wrapper glass">
        <table className="data-table cards-mobile">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')} className="sortable">
                <span className="sortable-wrapper">
                  Producto <SortIcon col="name" />
                </span>
              </th>
              <th>SKU</th>
              <th onClick={() => handleSort('price')} className="sortable">
                <span className="sortable-wrapper">
                  Precio <SortIcon col="price" />
                </span>
              </th>
              <th onClick={() => handleSort('cost')} className="sortable">
                <span className="sortable-wrapper">
                  Costo <SortIcon col="cost" />
                </span>
              </th>
              <th>Margen</th>
              <th onClick={() => handleSort('stock')} className="sortable">
                <span className="sortable-wrapper">
                  Stock <SortIcon col="stock" />
                </span>
              </th>
              <th>Categoría</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(product => {
              const margin = product.cost > 0
                ? ((product.price - product.cost) / product.price * 100)
                : 0;
              return (
                <tr key={product.id} className="table-row">
                  <td className="td-product-name td-card-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="product-list-thumbnail" style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {product.image ? (
                          product.image.startsWith('preset-') ? (
                            <div className={`product-preset-img ${product.image}`} style={{ fontSize: '14px', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {product.image === 'preset-food' && '🥩'}
                              {product.image === 'preset-med' && '💊'}
                              {product.image === 'preset-service' && '🩺'}
                              {product.image === 'preset-package' && '📦'}
                            </div>
                          ) : (
                            <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )
                        ) : (
                          <span style={{ fontSize: '14px' }}>📦</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{product.name}</span>
                        {product.barcode && (
                          <span className="barcode-label" style={{ marginTop: '2px' }}>{product.barcode}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="SKU"><span className="sku-pill">{product.sku || '—'}</span></td>
                  <td className="td-money" data-label="Precio">
                    <div>${product.price.toLocaleString('es-CO')}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 500 }}>
                      IVA: {product.tax_rate !== undefined ? product.tax_rate : 19}%
                    </div>
                  </td>
                  <td className="td-money" data-label="Costo">${product.cost.toLocaleString('es-CO')}</td>
                  <td data-label="Margen">
                    <span className={`margin-badge ${margin >= 30 ? 'good' : margin >= 10 ? 'ok' : 'low'}`}>
                      {margin.toFixed(1)}%
                    </span>
                  </td>
                  <td data-label="Stock">
                    <span className={`stock-badge ${product.stock > 5 ? 'good' : product.stock > 0 ? 'low' : 'empty'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td data-label="Categoría">
                    <span className="cat-tag-icon">
                      {getBusinessTypeIcon(user?.business_type || 'otro', 13)}
                      {getProductCategory(product)}
                    </span>
                  </td>
                  <td className="td-card-actions">
                    <div className="action-btns">
                      <button onClick={() => openEdit(product)} className="btn-action edit" title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        disabled={deletingId === product.id}
                        className="btn-action delete"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="table-empty">
            <Package size={40} />
            <p>No hay productos que mostrar</p>
          </div>
        )}
      </div>

      {/* Alta de producto — asistente por pasos */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-box glass" onClick={e => e.stopPropagation()}>

            <div className="modal-header" style={{ marginBottom: '14px', alignItems: 'flex-start' }}>
              <div>
                <h2 className="modal-title">{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Paso {step} de 4 &middot; {STEP_TITLES[step - 1]}
                </p>
              </div>
              <button onClick={() => setShowForm(false)} className="modal-close">
                <X size={20} />
              </button>
            </div>

            {/* Barra de progreso — los tramos ya visitados son clicables */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Ir al paso ${n}: ${STEP_TITLES[n - 1]}`}
                  onClick={() => { if (n <= visitedMax) setStep(n); }}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', border: 'none',
                    padding: '9px 0', background: 'transparent',
                    cursor: n <= visitedMax ? 'pointer' : 'default',
                  }}
                >
                  <span style={{
                    display: 'block', width: '100%', height: '4px', borderRadius: '2px',
                    background: n <= step ? 'var(--primary)' : 'rgba(255,255,255,0.09)',
                    transition: 'background var(--t-fast)',
                  }} />
                </button>
              ))}
            </div>

            {/* Borrador recuperado: el alta anterior se cerró sin guardar */}
            {draftRestored && !editingProduct && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                padding: '10px 12px', marginBottom: '16px', borderRadius: 'var(--r-md)',
                background: 'var(--primary-dim)', border: '1px solid var(--border-active)',
              }}>
                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Retomamos el producto que estabas agregando.
                </span>
                <button
                  type="button"
                  onClick={discardDraft}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--primary)',
                    fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Empezar de cero
                </button>
              </div>
            )}

            {/* PASO 1 — Lo esencial */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.2px' }}>¿Qué vas a vender?</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                    Empieza por lo básico. El resto lo completas en 3 pasos cortos.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Nombre del producto *</label>
                  <input
                    className="form-input"
                    style={{ fontSize: '15px' }}
                    value={form.name || ''}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej. Alimento para perros 10 kg"
                    autoFocus
                  />
                  <p className="form-hint" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Así aparecerá en el punto de venta y en tus reportes.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Precio de venta ($ COP) *</label>
                  <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-input)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', padding: '0 14px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600, borderRight: '1px solid var(--border)' }}>$</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ border: 'none', borderRadius: 0, background: 'transparent', fontSize: '17px', fontWeight: 700 }}
                      value={form.price || ''}
                      onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Imagen del producto — opcional</label>
                  <div className="image-upload-box glass">
                    {productImage ? (
                      <div className="image-preview-container">
                        {productImage.startsWith('preset-') ? (
                          <div className={`product-preset-img ${productImage}`} style={{ fontSize: '32px' }}>
                            {productImage === 'preset-food' && '🥩'}
                            {productImage === 'preset-med' && '💊'}
                            {productImage === 'preset-service' && '🩺'}
                            {productImage === 'preset-package' && '📦'}
                          </div>
                        ) : (
                          <img src={productImage} alt="Vista previa" className="image-preview" />
                        )}
                        <button type="button" onClick={() => setProductImage('')} className="btn-remove-image">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label className="image-upload-trigger">
                        <Plus size={16} />
                        <span>Subir archivo o elegir un ícono</span>
                        <input type="file" accept="image/*" onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setProductImage(await fileToDataUrl(file));
                          } catch (err) {
                            error(err instanceof Error ? err.message : 'No se pudo cargar la imagen');
                          }
                        }} style={{ display: 'none' }} />
                      </label>
                    )}
                  </div>
                  <div className="preset-options">
                    <button type="button" onClick={() => setProductImage('preset-package')} className={`preset-btn ${productImage === 'preset-package' ? 'active' : ''}`}>📦 Caja</button>
                    <button type="button" onClick={() => setProductImage('preset-food')} className={`preset-btn ${productImage === 'preset-food' ? 'active' : ''}`}>🥩 Comida</button>
                    <button type="button" onClick={() => setProductImage('preset-med')} className={`preset-btn ${productImage === 'preset-med' ? 'active' : ''}`}>💊 Medicina</button>
                    <button type="button" onClick={() => setProductImage('preset-service')} className={`preset-btn ${productImage === 'preset-service' ? 'active' : ''}`}>🩺 Servicio</button>
                  </div>
                </div>
              </div>
            )}

            {/* PASO 2 — Precio y ganancia */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.2px' }}>¿Cuánto te cuesta y cuánto ganas?</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                    Con el costo calculamos tu ganancia al instante. Si no lo sabes aún, déjalo en cero y ajústalo luego.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                    <label className="form-label">Precio de venta ($ COP) *</label>
                    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-input)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, borderRight: '1px solid var(--border)' }}>$</span>
                      <input type="number" className="form-input" style={{ border: 'none', borderRadius: 0, background: 'transparent', fontSize: '15px', fontWeight: 700 }} value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                    <label className="form-label">Costo de compra ($ COP)</label>
                    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-input)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, borderRight: '1px solid var(--border)' }}>$</span>
                      <input type="number" className="form-input" style={{ border: 'none', borderRadius: 0, background: 'transparent', fontSize: '15px', fontWeight: 700 }} value={form.cost || ''} onChange={e => setForm(f => ({ ...f, cost: Number(e.target.value) }))} placeholder="0" />
                    </div>
                  </div>
                </div>

                {priceNum > 0 && costNum > 0 ? (
                  <div style={{ padding: '16px 17px', borderRadius: 'var(--r-lg)', background: marginTier === 'good' ? 'var(--success-bg)' : marginTier === 'ok' ? 'var(--warning-bg)' : 'var(--danger-bg)', border: `1px solid ${marginColor}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: marginColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <TrendingUp size={18} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14.5px', fontWeight: 700, color: marginColor }}>
                          {unitProfit >= 0 ? 'Ganas' : 'Pierdes'} ${Math.abs(unitProfit).toLocaleString('es-CO')} por unidad
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Margen del {marginPct.toFixed(1)}% sobre el precio de venta
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '12px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, marginPct))}%`, height: '100%', background: marginColor }} />
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                    Agrega el costo de compra para ver tu ganancia y margen al instante.
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">IVA aplicado</label>
                  <div style={{ display: 'inline-flex', padding: '4px', background: 'var(--surface-input)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', gap: '4px', flexWrap: 'wrap' }}>
                    {TAX_RATE_OPTIONS.map(opt => {
                      const active = (form.tax_rate ?? 19) === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, tax_rate: opt.value }))}
                          style={{
                            padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap',
                            background: active ? 'var(--primary)' : 'transparent',
                            color: active ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="form-hint" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    El precio que escribiste ya incluye IVA. Se usa para la factura electrónica.
                  </p>
                </div>
              </div>
            )}

            {/* PASO 3 — Stock y categoría */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.2px' }}>Inventario y organización</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                    Reutiliza una de tus categorías o crea una nueva escribiendo. Todo queda guardado para la próxima vez.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">{editingProduct ? 'Stock actual' : 'Stock inicial'}</label>
                  {editingProduct ? (
                    <>
                      <input type="number" className="form-input" value={form.stock ?? 0} disabled readOnly title="El stock de un producto existente no se edita aquí, para evitar pisar ventas o compras registradas mientras el formulario estaba abierto." />
                      <p className="form-hint" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Para ajustar el stock de un producto existente usa Suministros → Movimientos manuales (entrada, salida o merma). Así queda un registro de por qué cambió.
                      </p>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-input)' }}>
                        <button type="button" aria-label="Restar una unidad" onClick={() => setForm(f => ({ ...f, stock: Math.max(0, (Number(f.stock) || 0) - 1) }))} style={{ padding: '0 14px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Minus size={15} />
                        </button>
                        <input type="number" value={form.stock || ''} onChange={e => setForm(f => ({ ...f, stock: Math.max(0, Number(e.target.value) || 0) }))} placeholder="0" style={{ width: '80px', textAlign: 'center', border: 'none', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, fontFamily: 'inherit' }} />
                        <button type="button" aria-label="Sumar una unidad" onClick={() => setForm(f => ({ ...f, stock: (Number(f.stock) || 0) + 1 }))} style={{ padding: '0 14px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Plus size={15} />
                        </button>
                      </div>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>unidades disponibles hoy</span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Categoría *</label>
                  <CategoryPicker
                    value={String(form.category || tenantCategories[0] || '')}
                    categories={tenantCategories}
                    icon={getBusinessTypeIcon(user?.business_type || 'otro', 13)}
                    onChange={value => setForm(f => ({ ...f, category: value }))}
                    onCreate={handleCreateCategory}
                    onRename={handleRenameCategory}
                    onDelete={handleDeleteCategory}
                  />
                  <p className="form-hint" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Toca una categoría para asignarla. Escribe para buscar o crear una nueva.
                    Con “Gestionar” puedes renombrarlas o eliminarlas.
                  </p>
                </div>
              </div>
            )}

            {/* PASO 4 — Últimos detalles */}
            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.2px' }}>Revisa y listo</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                    Todo lo de abajo es opcional. Si no lo necesitas ahora, {editingProduct ? 'guarda' : 'crea el producto'} y edítalo cuando quieras.
                  </p>
                </div>

                {/* Tarjeta de resumen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '14px 15px', borderRadius: 'var(--r-lg)', background: 'var(--primary-dim)', border: '1px solid var(--border-active)' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '11px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '20px' }}>
                    {productImage
                      ? (productImage.startsWith('preset-')
                          ? (productImage === 'preset-food' ? '🥩' : productImage === 'preset-med' ? '💊' : productImage === 'preset-service' ? '🩺' : '📦')
                          : <img src={productImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                      : '📦'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {form.name || 'Producto sin nombre'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>${priceNum.toLocaleString('es-CO')}</span>
                      <span>·</span>
                      <span>{editingProduct ? `${form.stock ?? 0} en stock` : `${Number(form.stock) || 0} en stock`}</span>
                      <span>·</span>
                      <span className="cat-tag-icon" style={{ fontSize: '11px' }}>
                        {getBusinessTypeIcon(user?.business_type || 'otro', 11)}
                        {normalizeCategoryName(String(form.category || '')) || 'Sin categoría'}
                      </span>
                    </div>
                  </div>
                  {priceNum > 0 && costNum > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: marginColor, background: 'rgba(255,255,255,0.06)', padding: '5px 9px', borderRadius: 'var(--r-full)' }}>
                      {marginPct.toFixed(0)}%
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                    <label className="form-label">SKU / Código interno</label>
                    <input className="form-input" value={form.sku || ''} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej. ALM-PERRO-10" />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label">Código de barras</label>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#10b881', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b881', display: 'inline-block', boxShadow: '0 0 8px #10b881', animation: 'pulse 1.5s infinite' }} />
                        Pistola lista
                      </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="form-input"
                        value={form.barcode || ''}
                        onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                        placeholder="Escanear o escribir"
                        style={{ paddingRight: '36px' }}
                      />
                      <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#10b881', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                        <Barcode size={16} />
                      </div>
                    </div>
                  </div>
                </div>

                {archivedSuggestion && (
                  <div style={{ padding: '10px 12px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                      💡 Producto archivado con este código: <strong style={{ color: 'var(--text)' }}>"{archivedSuggestion.name}"</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(f => ({
                          ...f,
                          name: archivedSuggestion.name,
                          sku: archivedSuggestion.sku || '',
                          price: archivedSuggestion.price,
                          cost: archivedSuggestion.cost,
                          category: archivedSuggestion.category || '',
                          tax_rate: archivedSuggestion.tax_rate || 19,
                          meta_data: archivedSuggestion.meta_data || {},
                        }));
                        if (archivedSuggestion.image) setProductImage(archivedSuggestion.image);
                        if (archivedSuggestion.meta_data) {
                          const entries = Object.entries(archivedSuggestion.meta_data)
                            .filter(([k]) => k !== 'category_path')
                            .map(([k, v]) => `${k}: ${v}`);
                          setMetaExtra(entries.join(', '));
                        }
                        setArchivedSuggestion(null);
                        success('Sugerencia cargada en el formulario');
                      }}
                      style={{ background: '#6366f1', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.74rem' }}
                    >
                      Sugerir datos
                    </button>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Detalle adicional</label>
                  <textarea
                    className="form-input"
                    value={metaExtra}
                    onChange={e => setMetaExtra(e.target.value)}
                    placeholder="Ej. Raza/Especie, marca, lote, fecha de vencimiento, etc."
                    rows={2}
                    style={{ resize: 'vertical', width: '100%', minHeight: '60px' }}
                  />
                </div>
              </div>
            )}

            {/* Navegación */}
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              {step === 1 ? (
                <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
              ) : (
                <button onClick={goBack} className="btn-secondary">
                  <ArrowLeft size={16} /> Atrás
                </button>
              )}
              {step < 4 ? (
                <button onClick={goNext} className="btn-primary">
                  Siguiente <ArrowRight size={16} />
                </button>
              ) : (
                <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                  {isSaving ? <Save size={16} /> : <Check size={16} />}
                  {isSaving ? 'Guardando...' : editingProduct ? 'Guardar cambios' : 'Crear producto'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
