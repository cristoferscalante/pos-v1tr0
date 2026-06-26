import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Search, Plus, Minus, Trash2, Store, X, MessageCircle, ArrowRight } from 'lucide-react';
import { publicCatalogApi, API_URL } from '../api/client';
import type { ApiProduct } from '../types';
import { getBusinessTypeIcon, getBusinessTypeLabel } from '../components/BusinessTypeSelect';

interface PublicCatalogViewProps {
  slug: string;
}

interface CartItem {
  product: ApiProduct;
  quantity: number;
}

export function PublicCatalogView({ slug }: PublicCatalogViewProps) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const storeName = tenant?.meta_data?.display_name || tenant?.name || 'Tu negocio';

  const resolveImageSrc = (src?: string) => {
    if (!src) return '';
    return src.startsWith('http') || src.startsWith('data:') ? src : `${API_URL}${src}`;
  };

  const openWhatsApp = (message: string) => {
    const whatsappNumber = tenant?.meta_data?.whatsapp_number;
    if (!whatsappNumber) {
      alert('Este negocio no tiene configurado un número de WhatsApp para recibir pedidos.');
      return;
    }

    const cleanNumber = whatsappNumber.replace(/[^\d+]/g, '');
    window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`, '_blank');
  };

  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
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

  const addToCart = (product: ApiProduct) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const getCartTotal = () => {
    return cart.reduce((acc, item) => acc + (Number(item.product.price) * item.quantity), 0);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSendOrder = () => {
    if (cart.length === 0) return;

    let message = `*Pedido para ${storeName}*\n\n`;
    cart.forEach(item => {
      const itemTotal = Number(item.product.price) * item.quantity;
      message += `• *${item.quantity}x* ${item.product.name} _(${formatCurrency(Number(item.product.price))} c/u)_ = *${formatCurrency(itemTotal)}*\n`;
    });
    message += `\n*Total a pagar: ${formatCurrency(getCartTotal())}*\n\n_Enviado desde el catálogo público de ${storeName}._`;
    openWhatsApp(message);
  };

  const handleBuyNow = (product: ApiProduct) => {
    const message = `*Compra directa para ${storeName}*\n\n• *1x* ${product.name} = *${formatCurrency(Number(product.price))}*\n\n_Enviado desde el catálogo público._`;
    openWhatsApp(message);
  };

  const categories = useMemo(() => {
    const values = Array.from(new Set(products.map(p => String(p.meta_data?.tipo || p.category || 'General').trim()).filter(Boolean)));
    return ['all', ...values];
  }, [products]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    const productCategory = String(p.meta_data?.tipo || p.category || 'General').trim();
    const matchesCategory = selectedCategory === 'all' || productCategory === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const featuredProducts = filteredProducts.slice(0, 4);

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

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="public-catalog-container" style={tenant?.meta_data?.brand_color ? ({ ['--catalog-accent' as string]: tenant.meta_data.brand_color } as React.CSSProperties) : undefined}>
      {tenant?.meta_data?.banner_url && (
        <div style={{ width: '100%', maxHeight: '260px', overflow: 'hidden', borderBottom: '1px solid var(--border)' }}>
          <img src={resolveImageSrc(tenant.meta_data.banner_url)} alt={storeName} style={{ width: '100%', height: '260px', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      {/* Header */}
      <header className="catalog-header glass">
        <div className="header-info">
          <div className="store-badge" style={tenant?.meta_data?.brand_color ? { background: tenant.meta_data.brand_color } : undefined}>
            {tenant?.meta_data?.logo_url ? (
              <img src={resolveImageSrc(tenant.meta_data.logo_url)} alt={storeName} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 8 }} />
            ) : (
              <Store size={24} />
            )}
          </div>
          <div>
            <h1 className="store-name">{storeName}</h1>
            <p className="store-type">
              {getBusinessTypeIcon(tenant.business_type, 14)} {getBusinessTypeLabel(tenant.business_type)}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="catalog-search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="catalog-search-input"
            placeholder="Buscar productos por nombre o SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Cart Button */}
        <button
          className={`catalog-cart-btn ${cartCount > 0 ? 'pulse' : ''}`}
          onClick={() => setIsCartOpen(true)}
        >
          <ShoppingCart size={20} />
          {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
        </button>
      </header>

      <section className="catalog-hero glass">
        <div className="catalog-hero-copy">
          <span className="catalog-hero-kicker">Catálogo online</span>
          <h2 className="catalog-hero-title">Compra directo con {storeName}</h2>
          <p className="catalog-hero-text">Explora el catálogo, agrega al carrito o compra al instante por WhatsApp con el negocio dueño de este catálogo.</p>
          <div className="catalog-hero-actions">
            <button className="btn-add-cart" onClick={() => document.getElementById('catalog-products')?.scrollIntoView({ behavior: 'smooth' })}>
              <ArrowRight size={16} /> Ver productos
            </button>
            <button className="btn-secondary" onClick={() => openWhatsApp(`Hola ${storeName}, quiero información del catálogo.`)}>
              <MessageCircle size={16} /> WhatsApp
            </button>
          </div>
        </div>
        <div className="catalog-hero-side">
          <div className="catalog-hero-stat">
            <span className="catalog-hero-stat-value">{products.length}</span>
            <span className="catalog-hero-stat-label">Productos disponibles</span>
          </div>
          <div className="catalog-hero-stat">
            <span className="catalog-hero-stat-value">{cartCount}</span>
            <span className="catalog-hero-stat-label">Items en carrito</span>
          </div>
        </div>
      </section>

      {categories.length > 1 && (
        <section className="catalog-categories">
          {categories.map(category => (
            <button
              key={category}
              type="button"
              className={`catalog-category-chip ${selectedCategory === category ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category === 'all' ? 'Todos' : category}
            </button>
          ))}
        </section>
      )}

      {/* Main Grid */}
      <main className="catalog-main" id="catalog-products">
        {filteredProducts.length === 0 ? (
          <div className="no-products-found">
            <p>No se encontraron productos coincidentes en el inventario.</p>
          </div>
        ) : (
          <>
            {featuredProducts.length > 0 && (
              <section className="catalog-section">
                <div className="catalog-section-head">
                  <h3 className="catalog-section-title">Destacados</h3>
                  <span className="catalog-section-subtitle">Selección recomendada del negocio</span>
                </div>
                <div className="catalog-grid">
                  {featuredProducts.map(product => (
                    <div key={`featured-${product.id}`} className="product-store-card glass product-store-card-featured">
                      <div className="product-card-img-container">
                        {product.image ? (
                          <img
                            src={resolveImageSrc(product.image)}
                            alt={product.name}
                            className="product-card-img"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';
                            }}
                          />
                        ) : (
                          <div className="product-card-no-img">
                            <Store size={32} />
                          </div>
                        )}
                      </div>
                      <div className="product-card-body">
                        <span className="product-card-sku">{product.sku || 'Producto destacado'}</span>
                        <h3 className="product-card-title">{product.name}</h3>
                        <div className="product-card-footer">
                          <span className="product-card-price">{formatCurrency(Number(product.price))}</span>
                          <div className="catalog-product-actions">
                            <button className="btn-add-cart" onClick={() => addToCart(product)}>
                              <ShoppingCart size={16} /> Añadir
                            </button>
                            <button className="btn-secondary" onClick={() => handleBuyNow(product)}>
                              Comprar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="catalog-section">
              <div className="catalog-section-head">
                <h3 className="catalog-section-title">Todo el catálogo</h3>
                <span className="catalog-section-subtitle">Productos listos para agregar al carrito o comprar al instante</span>
              </div>
              <div className="catalog-grid">
                {filteredProducts.map(product => (
                  <div key={product.id} className="product-store-card glass">
                    <div className="product-card-img-container">
                      {product.image ? (
                        <img
                          src={resolveImageSrc(product.image)}
                          alt={product.name}
                          className="product-card-img"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';
                          }}
                        />
                      ) : (
                        <div className="product-card-no-img">
                          <Store size={32} />
                        </div>
                      )}
                    </div>
                    <div className="product-card-body">
                      <span className="product-card-sku">{product.sku || 'Sin SKU'}</span>
                      <h3 className="product-card-title">{product.name}</h3>
                      <div className="product-card-footer">
                        <span className="product-card-price">{formatCurrency(Number(product.price))}</span>
                        <div className="catalog-product-actions">
                          <button className="btn-add-cart" onClick={() => addToCart(product)}>
                            <ShoppingCart size={16} /> Añadir
                          </button>
                          <button className="btn-secondary" onClick={() => handleBuyNow(product)}>
                            Comprar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      <button className="catalog-whatsapp-fab" onClick={() => openWhatsApp(`Hola ${storeName}, necesito ayuda con mi pedido.`)}>
        <MessageCircle size={18} /> WhatsApp
      </button>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="cart-drawer-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="cart-drawer glass" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Tu Pedido</h2>
              <button className="btn-close-drawer" onClick={() => setIsCartOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              {cart.length === 0 ? (
                <div className="empty-cart-message">
                  <ShoppingCart size={48} />
                  <p>El carrito está vacío</p>
                </div>
              ) : (
                <div className="drawer-cart-list">
                  {cart.map(item => (
                    <div key={item.product.id} className="drawer-cart-item">
                      <div className="item-details">
                        <h4>{item.product.name}</h4>
                        <span className="item-price">{formatCurrency(Number(item.product.price))}</span>
                      </div>
                      <div className="item-controls">
                        <div className="quantity-selector">
                          <button onClick={() => updateQuantity(item.product.id, -1)}>
                            <Minus size={14} />
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, 1)}>
                            <Plus size={14} />
                          </button>
                        </div>
                        <button className="btn-delete-item" onClick={() => removeFromCart(item.product.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="drawer-footer">
                <div className="drawer-total-row">
                  <span>Total</span>
                  <span className="drawer-total">{formatCurrency(getCartTotal())}</span>
                </div>
                <button className="btn-send-whatsapp" onClick={handleSendOrder}>
                  <MessageCircle size={18} />
                  Enviar pedido por WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
