import { useState, useEffect } from 'react';
import {
  Package, Plus, Pencil, Trash2, Search, X, Save,
  TrendingUp, AlertTriangle, ChevronUp, ChevronDown, Barcode
} from 'lucide-react';
import { db } from '../db/pos-db';
import { authApi, productsApi } from '../api/client';
import { useToast } from '../components/Toast';
import { getBusinessTypeIcon } from '../components/BusinessTypeSelect';
import { CustomSelect } from '../components/CustomSelect';
import { fileToDataUrl } from '../utils/imageUpload';
import type { SelectOption } from '../components/CustomSelect';
import type { LocalProduct, AuthUser } from '../types';
import { buildCategoryOptions, getProductCategory, getTenantProductCategories, normalizeCategoryName } from '../utils/productCategories';

interface InventoryViewProps {
  products: LocalProduct[];
  token: string | null;
  isOnline: boolean;
  onProductsChange: () => void;
  user: AuthUser | null;
}

type SortKey = 'name' | 'price' | 'cost' | 'stock';
type SortDir = 'asc' | 'desc';

const EMPTY_FORM: Partial<LocalProduct> = {
  name: '', sku: '', barcode: '', price: 0, cost: 0, stock: 0, category: '', tax_rate: 19, meta_data: {}
};

const TAX_RATE_OPTIONS: SelectOption<number>[] = [
  { value: 19, label: '19% (General)' },
  { value: 5,  label: '5% (Reducido)' },
  { value: 0,  label: '0% (Exento)' }
];

export function InventoryView({ products, token, isOnline, onProductsChange, user }: InventoryViewProps) {
  const { success, error, warning } = useToast();
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
  const [tenantCategories, setTenantCategories] = useState<string[]>(() => getTenantProductCategories(user));
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    setTenantCategories(getTenantProductCategories(user));
  }, [user]);

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

  const openCreate = () => {
    setEditingProduct(null);
    const defaultCategory = tenantCategories[0] || 'General';
    setForm({ ...EMPTY_FORM, category: defaultCategory });
    setMetaExtra('');
    setProductImage('');
    setNewCategoryName('');
    setShowForm(true);
  };

  const openEdit = (p: LocalProduct) => {
    setEditingProduct(p);
    setForm({ ...p, category: getProductCategory(p) });
    setProductImage(p.image || '');
    setMetaExtra(p.meta_data?.detalle_especifico || '');
    setNewCategoryName('');
    setShowForm(true);
  };

  const syncTenantCategories = async (categories: string[]) => {
    const normalized = buildCategoryOptions(categories);
    setTenantCategories(normalized);
    if (!token) return normalized;

    const updatedTenant = await authApi.updateTenant(token, { product_categories: normalized });
    const refreshedCategories = buildCategoryOptions(updatedTenant.meta_data?.product_categories || normalized);
    setTenantCategories(refreshedCategories);
    return refreshedCategories;
  };

  const handleCreateCategory = async () => {
    const category = normalizeCategoryName(newCategoryName);
    if (!category) {
      warning('Escribe un nombre para la categoría');
      return;
    }

    if (tenantCategories.some(item => item.toLowerCase() === category.toLowerCase())) {
      warning('Esa categoría ya existe');
      setForm(prev => ({ ...prev, category }));
      setNewCategoryName('');
      return;
    }

    try {
      const syncedCategories = await syncTenantCategories([...tenantCategories, category]);
      setForm(prev => ({ ...prev, category }));
      setNewCategoryName('');
      success('Categoría creada correctamente');
      if (user) {
        user.meta_data = { ...(user.meta_data || {}), product_categories: syncedCategories };
      }
    } catch (err: any) {
      error(err.message || 'No se pudo crear la categoría');
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
        stock: Number(form.stock) || 0,
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
        if (user) {
          user.meta_data = { ...(user.meta_data || {}), product_categories: syncedCategories };
        }
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
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
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
        <table className="data-table">
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
                  <td className="td-product-name">
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
                  <td><span className="sku-pill">{product.sku || '—'}</span></td>
                  <td className="td-money">
                    <div>${product.price.toLocaleString('es-CO')}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 500 }}>
                      IVA: {product.tax_rate !== undefined ? product.tax_rate : 19}%
                    </div>
                  </td>
                  <td className="td-money">${product.cost.toLocaleString('es-CO')}</td>
                  <td>
                    <span className={`margin-badge ${margin >= 30 ? 'good' : margin >= 10 ? 'ok' : 'low'}`}>
                      {margin.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span className={`stock-badge ${product.stock > 5 ? 'good' : product.stock > 0 ? 'low' : 'empty'}`}>
                      {product.stock}
                    </span>
                  </td>
                  <td>
                    <span className="cat-tag-icon">
                      {getBusinessTypeIcon(user?.business_type || 'otro', 13)}
                      {getProductCategory(product)}
                    </span>
                  </td>
                  <td>
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

      {/* Product Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-box glass" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
              </h2>
              <button onClick={() => setShowForm(false)} className="modal-close">
                <X size={20} />
              </button>
                    <div className="form-grid-2">
              {/* Image Uploader */}
              <div className="image-upload-wrapper">
                <label className="form-label">Imagen del Producto</label>
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
                        <img src={productImage} alt="Preview" className="image-preview" />
                      )}
                      <button type="button" onClick={() => setProductImage('')} className="btn-remove-image">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="image-upload-trigger">
                      <Plus size={16} />
                      <span>Subir archivo o seleccionar preset</span>
                      <input type="file" accept="image/*" onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setProductImage(await fileToDataUrl(file));
                        } catch (err: any) {
                          error(err.message || 'No se pudo cargar la imagen');
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

              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Alimento para perros 10kg" />
              </div>
              <div className="form-group">
                <label className="form-label">SKU / Código interno</label>
                <input className="form-input" value={form.sku || ''} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej. SKU-001" />
              </div>
              <div className="form-group">
                <label className="form-label">Precio de venta ($ COP) *</label>
                <input type="number" className="form-input" value={form.price || ''} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Costo de compra ($ COP)</label>
                <input type="number" className="form-input" value={form.cost || ''} onChange={e => setForm(f => ({ ...f, cost: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Tasa de IVA (%)</label>
                <CustomSelect
                  options={TAX_RATE_OPTIONS}
                  value={form.tax_rate !== undefined ? form.tax_rate : 19}
                  onChange={val => setForm(f => ({ ...f, tax_rate: val }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Stock inicial</label>
                <input type="number" className="form-input" value={form.stock || ''} onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría *</label>
                <CustomSelect
                  options={tenantCategories.map(category => ({
                    value: category,
                    label: category,
                    icon: getBusinessTypeIcon(user?.business_type || 'otro', 14),
                  }))}
                  value={String(form.category || tenantCategories[0] || 'General')}
                  onChange={value => setForm(f => ({ ...f, category: value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Crear nueva categoría</label>
                <div className="inventory-category-create-row">
                  <input
                    className="form-input"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="Ej. Snacks, Combos, Accesorios"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCreateCategory();
                      }
                    }}
                  />
                  <button type="button" onClick={() => void handleCreateCategory()} className="btn-secondary inventory-category-create-btn">
                    <Plus size={14} />
                    Crear
                  </button>
                </div>
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Código de barras</label>
                  <span className="barcode-status-indicator" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    color: '#10b881',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10b881',
                      display: 'inline-block',
                      boxShadow: '0 0 8px #10b881',
                      animation: 'pulse 1.5s infinite'
                    }} />
                    Pistola Lista
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
                  <div style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#10b881',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }} title="Pistola de código de barras conectada y lista para emular entrada de teclado">
                    <Barcode size={16} />
                  </div>
                </div>
              </div>
              <div className="form-group form-group-full">
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
            </div>        </div>

            <div className="modal-actions">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSave} disabled={isSaving} className="btn-primary">
                <Save size={16} />
                {isSaving ? 'Guardando...' : 'Guardar Producto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
