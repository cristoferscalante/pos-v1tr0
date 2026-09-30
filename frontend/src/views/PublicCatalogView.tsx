import { useState, useEffect, useMemo } from 'react';
import { ShoppingBag, Search, Plus, Minus, Store, X, MessageCircle, ArrowRight, ScanLine, Check } from 'lucide-react';
import { publicCatalogApi, API_URL } from '../api/client';
import type { ApiProduct } from '../types';
import { getBusinessTypeLabel } from '../components/BusinessTypeSelect';
import { getProductCategory } from '../utils/productCategories';
import { QrScannerModal } from '../components/QrScannerModal';
import { useToast } from '../components/Toast';
import '../styles/public-catalog.css';

interface PublicCatalogViewProps {
  slug: string;
}

// El catálogo público no recibe el stock exacto: el backend manda la disponibilidad
// y solo la cantidad cuando quedan pocas unidades.
type PublicProduct = ApiProduct & {
  availability?: 'available' | 'low' | 'out';
  stock_left?: number | null;
};

type PriceMode = 'detal' | 'mayor';

// Colores de las fichas sin foto: [fondo, texto], elegidos por el nombre del producto
const TILE_COLORS: [string, string][] = [
  ['#EAD8C2', '#5A3517'],
  ['#F6E7A6', '#5C4A00'],
  ['#DCD6F5', '#35287A'],
  ['#CFE4F5', '#153E5E'],
  ['#F4CFC8', '#6E1E12'],
  ['#D3EDE6', '#18513F'],
  ['#E5EFC4', '#3D4B10'],
  ['#EEEBE2', '#4A463C'],
];

const tileColors = (name: string) => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
};

const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[1][0]).toUpperCase();
};

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);

export function PublicCatalogView({ slug }: PublicCatalogViewProps) {
  const { warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [priceMode, setPriceMode] = useState<PriceMode>('detal');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNote, setOrderNote] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const storeName = tenant?.meta_data?.display_name || tenant?.name || 'Tu negocio';

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        setErrorMsg(null);
        const data = await publicCatalogApi.fetch(slug);
        setTenant(data.tenant);
        setProducts(data.products);
      } catch (err: any) {
        setErrorMsg(err.message || 'No se pudo cargar el catálogo del negocio.');
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [slug]);

  const resolveImageSrc = (src?: string) => {
    if (!src) return '';
    return src.startsWith('http') || src.startsWith('data:') ? src : `${API_URL}${src}`;
  };

  const openWhatsApp = (message: string) => {
    const whatsappNumber = tenant?.meta_data?.whatsapp_number;
    if (!whatsappNumber) {
      warning('Este negocio no tiene configurado un número de WhatsApp para recibir pedidos.');
      return;
    }
    const cleanNumber = whatsappNumber.replace(/[^\d+]/g, '');
    window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Precio al por mayor: solo si el negocio lo habilitó en Configuración (el backend
  // ni lo envía si no) y si el producto tiene uno distinto del detal.
  const hasWholesale = (product: PublicProduct) =>
    product.wholesale_price != null && Number(product.wholesale_price) > 0 && Number(product.wholesale_price) !== Number(product.price);

  const wholesaleEnabled = Boolean(tenant?.wholesale_enabled) && products.some(hasWholesale);
  const isMayor = wholesaleEnabled && priceMode === 'mayor';

  const unitPrice = (product: PublicProduct) =>
    isMayor && hasWholesale(product) ? Number(product.wholesale_price) : Number(product.price);

  const isSoldOut = (product: PublicProduct) => product.availability === 'out';
  const maxQty = (product: PublicProduct) =>
    product.availability === 'low' && product.stock_left ? product.stock_left : Infinity;

  const changeQty = (product: PublicProduct, delta: number) => {
    if (isSoldOut(product) && delta > 0) return;
    if (delta > 0 && (cart[product.id] || 0) >= maxQty(product)) {
      warning(`Solo quedan ${maxQty(product)} unidades de "${product.name}".`);
      return;
    }
    setCart(prev => {
      const next = Math.max(0, Math.min(maxQty(product), (prev[product.id] || 0) + delta));
      const updated = { ...prev };
      if (next === 0) delete updated[product.id];
      else updated[product.id] = next;
      return updated;
    });
  };

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const cartLines = Object.entries(cart)
    .map(([id, quantity]) => ({ product: productById.get(id), quantity }))
    .filter((line): line is { product: PublicProduct; quantity: number } => Boolean(line.product));
  const cartCount = cartLines.reduce((acc, l) => acc + l.quantity, 0);
  const cartTotal = cartLines.reduce((acc, l) => acc + unitPrice(l.product) * l.quantity, 0);
  const retailTotal = cartLines.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0);
  const savings = isMayor ? retailTotal - cartTotal : 0;

  const handleSendOrder = () => {
    if (cartLines.length === 0) return;
    let message = `*Pedido para ${storeName}*\n`;
    if (isMayor) message += `_Precios por mayor_\n`;
    message += '\n';
    cartLines.forEach(({ product, quantity }) => {
      const price = unitPrice(product);
      message += `• *${quantity}x* ${product.name} _(${formatCurrency(price)} c/u)_ = *${formatCurrency(price * quantity)}*\n`;
    });
    message += `\n*Total estimado: ${formatCurrency(cartTotal)}*`;
    if (savings > 0) message += `\n_Ahorro por mayor: ${formatCurrency(savings)}_`;
    if (orderNote.trim()) message += `\n\n*Nota:* ${orderNote.trim()}`;
    message += `\n\n_Enviado desde el catálogo en línea de ${storeName}._`;
    openWhatsApp(message);
  };

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(p => {
      const category = getProductCategory(p);
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [{ key: 'all', label: 'Todo', count: products.length }, ...Array.from(counts, ([key, count]) => ({ key, label: key, count }))];
  }, [products]);

  const query = searchQuery.trim().toLowerCase();
  const filteredProducts = products.filter(p => {
    const matchesSearch = !query ||
      p.name.toLowerCase().includes(query) ||
      (p.sku && p.sku.toLowerCase().includes(query)) ||
      (p.barcode && p.barcode.toLowerCase().includes(query));
    const matchesCategory = selectedCategory === 'all' || getProductCategory(p) === selectedCategory;
    const matchesAvailability = !onlyAvailable || !isSoldOut(p);
    return matchesSearch && matchesCategory && matchesAvailability;
  });

  const availableCount = products.filter(p => !isSoldOut(p)).length;
  const detailProduct = detailId ? productById.get(detailId) : undefined;

  const handleScan = (code: string) => {
    const needle = code.trim().toLowerCase();
    const found = products.find(p =>
      (p.barcode && p.barcode.toLowerCase() === needle) || (p.sku && p.sku.toLowerCase() === needle));
    if (found) {
      setDetailId(found.id);
    } else {
      setSearchQuery(code);
      warning('No encontramos un producto con ese código en el catálogo.');
    }
  };

  if (loading) {
    return (
      <div className="catalog-loading">
        <div className="spinner"></div>
        <p>Cargando catálogo...</p>
      </div>
    );
  }

  if (errorMsg || !tenant) {
    return (
      <div className="catalog-error-view">
        <Store size={64} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
        <h1>Negocio no encontrado</h1>
        <p className="error-detail">{errorMsg || 'El catálogo solicitado no existe.'}</p>
        <a href="/" className="btn-primary" style={{ marginTop: '16px', display: 'inline-flex', textDecoration: 'none' }}>
          Ir a V1TR0 POS
        </a>
      </div>
    );
  }

  const brandColor = tenant?.meta_data?.brand_color;
  const logoUrl = tenant?.meta_data?.logo_url;
  const bannerUrl = tenant?.meta_data?.banner_url;

  const renderTile = (product: PublicProduct, className: string) => {
    const [bg, fg] = tileColors(product.name);
    return (
      <span className={`pcat-tile ${className} ${isSoldOut(product) ? 'is-out' : ''}`} style={{ background: bg, color: fg }}>
        {product.image ? (
          <img src={resolveImageSrc(product.image)} alt="" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : null}
        <span className="pcat-tile-mark">{initials(product.name)}</span>
      </span>
    );
  };

  const renderStock = (product: PublicProduct) => {
    if (product.availability === 'out') return <span className="pcat-stock is-out">Agotado</span>;
    if (product.availability === 'low') {
      return <span className="pcat-stock is-low">{product.stock_left ? `Últimas ${product.stock_left}` : 'Últimas unidades'}</span>;
    }
    return <span className="pcat-stock">Disponible</span>;
  };

  const altPriceLabel = (product: PublicProduct) => {
    if (!wholesaleEnabled) return null;
    if (!hasWholesale(product)) return 'Solo precio detal';
    return isMayor ? `Detal ${formatCurrency(Number(product.price))}` : `Por mayor ${formatCurrency(Number(product.wholesale_price))}`;
  };

  const renderStepper = (product: PublicProduct, variant: 'card' | 'line' | 'sheet') => (
    <div className={`pcat-stepper is-${variant}`}>
      <button type="button" aria-label={`Quitar uno de ${product.name}`} onClick={() => changeQty(product, -1)}>
        <Minus size={16} />
      </button>
      <span>{cart[product.id] || 0}</span>
      <button type="button" aria-label={`Agregar uno de ${product.name}`} onClick={() => changeQty(product, 1)}>
        <Plus size={16} />
      </button>
    </div>
  );

  const priceModeToggle = (
    <div className="pcat-mode" role="group" aria-label="Tipo de precio">
      <button type="button" className={!isMayor ? 'active' : ''} aria-pressed={!isMayor} onClick={() => setPriceMode('detal')}>Precio detal</button>
      <button type="button" className={isMayor ? 'active' : ''} aria-pressed={isMayor} onClick={() => setPriceMode('mayor')}>Por mayor</button>
    </div>
  );

  const orderPanel = (
    <>
      <div className="pcat-order-head">
        <h2>Tu pedido</h2>
        {wholesaleEnabled && <span className="pcat-pill">{isMayor ? 'Precio por mayor' : 'Precio detal'}</span>}
      </div>
      {cartLines.length === 0 ? (
        <div className="pcat-empty">Agrega productos y aquí verás el total antes de enviarlo.</div>
      ) : (
        <div className="pcat-lines">
          {cartLines.map(({ product, quantity }) => (
            <div key={product.id} className="pcat-line">
              {renderTile(product, 'is-thumb')}
              <div className="pcat-line-info">
                <div className="pcat-line-name">{product.name}</div>
                <div className="pcat-line-unit">{quantity} × {formatCurrency(unitPrice(product))}</div>
                <div className="pcat-line-total">{formatCurrency(unitPrice(product) * quantity)}</div>
              </div>
              {renderStepper(product, 'line')}
            </div>
          ))}
        </div>
      )}
      <label className="pcat-note">
        Nota para el negocio (opcional)
        <textarea
          rows={2}
          value={orderNote}
          onChange={e => setOrderNote(e.target.value)}
          placeholder="Ej.: entregar después de las 5 p. m."
        />
      </label>
      <div className="pcat-totals">
        <div className="pcat-totals-row"><span>{cartCount} {cartCount === 1 ? 'unidad' : 'unidades'}</span><span className="pcat-mono">{formatCurrency(cartTotal)}</span></div>
        {savings > 0 && (
          <div className="pcat-totals-row is-savings"><span>Ahorras por mayor</span><span className="pcat-mono">− {formatCurrency(savings)}</span></div>
        )}
        <div className="pcat-totals-row is-total"><span>Total estimado</span><span className="pcat-mono">{formatCurrency(cartTotal)}</span></div>
      </div>
      <button type="button" className="pcat-send" onClick={handleSendOrder} disabled={cartLines.length === 0}>
        <MessageCircle size={20} />
        Enviar pedido por WhatsApp
      </button>
      <p className="pcat-fineprint">El negocio confirma disponibilidad y total final por chat.</p>
    </>
  );

  return (
    <div className="pcat" style={brandColor ? ({ ['--pcat-accent' as string]: brandColor } as React.CSSProperties) : undefined}>
      <header className="pcat-header">
        <div className="pcat-header-inner">
          <div className="pcat-brand">
            <div className="pcat-logo">
              {logoUrl ? <img src={resolveImageSrc(logoUrl)} alt="" /> : initials(storeName)}
            </div>
            <div className="pcat-brand-text">
              <div className="pcat-store-name">{storeName}</div>
              <div className="pcat-store-sub">{getBusinessTypeLabel(tenant.business_type) || 'Catálogo en línea'}</div>
            </div>
          </div>
          <div className="pcat-search is-header">
            <label className="pcat-search-field">
              <Search size={18} aria-hidden="true" />
              <span className="pcat-sr">Buscar productos</span>
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, categoría o SKU"
              />
            </label>
            <button type="button" className="pcat-scan" aria-label="Escanear código de barras" onClick={() => setIsScannerOpen(true)}>
              <ScanLine size={20} />
            </button>
          </div>
          <button type="button" className="pcat-cart-btn" aria-label="Ver pedido" onClick={() => setIsCartOpen(true)}>
            <ShoppingBag size={20} />
            <span className="pcat-cart-btn-label">Pedido</span>
            {cartCount > 0 && <span className="pcat-cart-badge">{cartCount}</span>}
          </button>
        </div>
      </header>

      <main className="pcat-main">
        <section className={`pcat-hero ${wholesaleEnabled ? '' : 'is-retail'}`}>
          <div className="pcat-hero-card" style={bannerUrl ? { ['--pcat-banner' as string]: `url("${resolveImageSrc(bannerUrl)}")` } as React.CSSProperties : undefined}>
            <button type="button" className="pcat-sticker" onClick={() => openWhatsApp(`Hola ${storeName}, quiero hacer un pedido.`)}>
              Pide por WhatsApp
            </button>
            <span className="pcat-kicker">Inventario en vivo</span>
            <h1 className="pcat-hero-title">Lo que hay hoy en tienda.</h1>
            <div className="pcat-hero-chips">
              <span>{availableCount} {availableCount === 1 ? 'producto disponible' : 'productos disponibles'}</span>
              <span>{wholesaleEnabled ? 'Precios detal y por mayor' : 'Precios actualizados desde inventario'}</span>
            </div>
          </div>
          {wholesaleEnabled ? (
            <div className="pcat-hero-side">
              <div>
                <h2>¿Compras para tu negocio?</h2>
                <p>Activa precios por mayor y el catálogo y tu pedido se recalculan al instante.</p>
              </div>
              {priceModeToggle}
            </div>
          ) : (
            <div className="pcat-hero-side">
              <h2>Pedir es así de simple</h2>
              <ol className="pcat-steps">
                <li><span>1</span>Elige productos y cantidades</li>
                <li><span>2</span>Revisa el total de tu pedido</li>
                <li><span>3</span>Envíalo por WhatsApp al negocio</li>
              </ol>
            </div>
          )}
        </section>

        <div className="pcat-search is-mobile">
          <label className="pcat-search-field">
            <Search size={18} aria-hidden="true" />
            <span className="pcat-sr">Buscar productos</span>
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar producto o SKU"
            />
          </label>
          <button type="button" className="pcat-scan" aria-label="Escanear código de barras" onClick={() => setIsScannerOpen(true)}>
            <ScanLine size={22} />
          </button>
        </div>
        {wholesaleEnabled && <div className="pcat-mode-mobile">{priceModeToggle}</div>}

        <div className="pcat-layout">
          <aside className="pcat-filters">
            <div className="pcat-filters-label">Categorías</div>
            <div className="pcat-cats">
              {categories.map(category => (
                <button
                  key={category.key}
                  type="button"
                  className={selectedCategory === category.key ? 'active' : ''}
                  aria-pressed={selectedCategory === category.key}
                  onClick={() => setSelectedCategory(category.key)}
                >
                  {category.key === 'all' ? 'Todo el catálogo' : category.label}
                  <span className="pcat-mono">{category.count}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`pcat-avail ${onlyAvailable ? 'active' : ''}`}
              aria-pressed={onlyAvailable}
              onClick={() => setOnlyAvailable(v => !v)}
            >
              <Check size={16} /> Solo disponibles
            </button>
          </aside>

          <section className="pcat-products" id="catalog-products">
            <div className="pcat-products-head">
              <h2>{selectedCategory === 'all' ? 'Todo el catálogo' : selectedCategory}</h2>
              <span>
                {filteredProducts.length === 1 ? '1 producto' : `${filteredProducts.length} productos`}
                {wholesaleEnabled ? ` · ${isMayor ? 'Precio por mayor' : 'Precio detal'}` : ''}
              </span>
            </div>
            {filteredProducts.length === 0 ? (
              <div className="pcat-empty is-large">No encontramos productos con esa búsqueda. Prueba otra palabra o escanea el código.</div>
            ) : (
              <div className="pcat-grid">
                {filteredProducts.map(product => {
                  const qty = cart[product.id] || 0;
                  const alt = altPriceLabel(product);
                  return (
                    <article key={product.id} className="pcat-card">
                      <button type="button" className="pcat-card-media" aria-label={`Ver detalle de ${product.name}`} onClick={() => setDetailId(product.id)}>
                        {renderTile(product, 'is-card')}
                        {renderStock(product)}
                      </button>
                      <div className="pcat-card-body">
                        {product.sku && <div className="pcat-sku">{product.sku}</div>}
                        <h3 className="pcat-card-name">{product.name}</h3>
                        <div className="pcat-card-prices">
                          <span className="pcat-price">{formatCurrency(unitPrice(product))}</span>
                          {alt && <span className="pcat-alt">{alt}</span>}
                        </div>
                      </div>
                      {isSoldOut(product) ? (
                        <button type="button" className="pcat-soldout" disabled>Sin existencias</button>
                      ) : qty > 0 ? (
                        renderStepper(product, 'card')
                      ) : (
                        <button type="button" className="pcat-add" onClick={() => changeQty(product, 1)}>
                          <Plus size={16} /> Agregar
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="pcat-order" aria-label="Tu pedido">{orderPanel}</aside>
        </div>
      </main>

      {cartCount > 0 && !isCartOpen && !detailProduct && (
        <button type="button" className="pcat-cartbar" onClick={() => setIsCartOpen(true)}>
          <span className="pcat-cartbar-count">{cartCount}</span>
          <span className="pcat-cartbar-text">
            <small>Tu pedido</small>
            <strong>{formatCurrency(cartTotal)}</strong>
          </span>
          <span className="pcat-cartbar-cta">Ver pedido <ArrowRight size={16} /></span>
        </button>
      )}

      {isCartOpen && (
        <div className="pcat-overlay is-drawer" onClick={() => setIsCartOpen(false)}>
          <div className="pcat-sheet" role="dialog" aria-modal="true" aria-label="Tu pedido" onClick={e => e.stopPropagation()}>
            <div className="pcat-grabber" />
            <button type="button" className="pcat-close" aria-label="Cerrar pedido" onClick={() => setIsCartOpen(false)}>
              <X size={18} />
            </button>
            {orderPanel}
          </div>
        </div>
      )}

      {detailProduct && (
        <div className="pcat-overlay is-detail" onClick={() => setDetailId(null)}>
          <div className="pcat-sheet pcat-detail" role="dialog" aria-modal="true" aria-label={detailProduct.name} onClick={e => e.stopPropagation()}>
            <div className="pcat-grabber" />
            <div className="pcat-detail-media">
              {renderTile(detailProduct, 'is-detail')}
              {renderStock(detailProduct)}
              <button type="button" className="pcat-close" aria-label="Cerrar ficha" onClick={() => setDetailId(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="pcat-detail-info">
              <div className="pcat-sku">
                {[getProductCategory(detailProduct), detailProduct.sku && `SKU ${detailProduct.sku}`].filter(Boolean).join(' · ')}
              </div>
              <h2>{detailProduct.name}</h2>
              {wholesaleEnabled && hasWholesale(detailProduct) ? (
                <div className="pcat-detail-prices">
                  <div className={!isMayor ? 'active' : ''}>
                    <small>Detal</small>
                    <strong>{formatCurrency(Number(detailProduct.price))}</strong>
                  </div>
                  <div className={isMayor ? 'active' : ''}>
                    <small>Por mayor</small>
                    <strong>{formatCurrency(Number(detailProduct.wholesale_price))}</strong>
                  </div>
                </div>
              ) : (
                <div className="pcat-detail-price">{formatCurrency(Number(detailProduct.price))}</div>
              )}
              {isSoldOut(detailProduct) ? (
                <div className="pcat-detail-out">Agotado por ahora</div>
              ) : (
                <div className="pcat-detail-actions">
                  {renderStepper(detailProduct, 'sheet')}
                  {(cart[detailProduct.id] || 0) > 0 ? (
                    <button type="button" className="pcat-add is-big" onClick={() => { setDetailId(null); setIsCartOpen(true); }}>
                      Ir al pedido · {formatCurrency(cartTotal)}
                    </button>
                  ) : (
                    <button type="button" className="pcat-add is-big" onClick={() => changeQty(detailProduct, 1)}>
                      <Plus size={16} /> Agregar al pedido
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <QrScannerModal
          title="Escanear producto"
          onScanSuccess={handleScan}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </div>
  );
}
