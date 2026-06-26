import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, ShoppingCart, Plus, Minus, Trash2,
  CheckCircle, QrCode, Package, CreditCard, Banknote, ArrowLeftRight, Barcode, Printer, X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { db } from '../db/pos-db';
import { salesApi } from '../api/client';
import { useToast } from '../components/Toast';
import { QrScannerModal } from '../components/QrScannerModal';
import type { LocalProduct, LocalSale, LocalSaleDetail, CartItem, PaymentMethod } from '../types';
import { getProductCategory } from '../utils/productCategories';

interface POSViewProps {
  products: LocalProduct[];
  token: string | null;
  isOnline: boolean;
  onSaleComplete: () => void;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'cash',     label: 'Efectivo',      icon: <Banknote size={16} />     },
  { id: 'card',     label: 'Tarjeta',       icon: <CreditCard size={16} />   },
  { id: 'transfer', label: 'Transferencia', icon: <ArrowLeftRight size={16} />},
];

export function POSView({ products, token, isOnline, onSaleComplete }: POSViewProps) {
  const { success, error, warning } = useToast();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [requiresElectronicInvoice, setRequiresElectronicInvoice] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [printMode, setPrintMode] = useState<'receipt' | 'invoice'>('receipt');
  const [customerDocumentCode, setCustomerDocumentCode] = useState('13');
  const [customerIdentification, setCustomerIdentification] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const storedUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('pos_user') || 'null') : null;
  const businessName = storedUser?.meta_data?.display_name || storedUser?.business_name || 'V1TR0 POS';
  const isElectronicInvoicingAvailable = Boolean(storedUser?.meta_data?.electronic_invoicing_enabled);

  // Categories from products
  const categories = ['all', ...Array.from(new Set(
    products.map(p => getProductCategory(p))
  ))];

  const filtered = products.filter(p => {
    const term = search.toLowerCase();
    const matchSearch = !term ||
      p.name.toLowerCase().includes(term) ||
      (p.sku?.toLowerCase().includes(term)) ||
      (p.barcode?.includes(term));
    const matchCat = selectedCategory === 'all' ||
      getProductCategory(p) === selectedCategory;
    return matchSearch && matchCat;
  });

  const addToCart = useCallback((product: LocalProduct) => {
    if (product.stock <= 0) {
      warning(`"${product.name}" sin stock disponible`);
    }
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id
          ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, [warning]);

  // Estados adicionales para diagnóstico y recibo
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<{
    text: string;
    keys: { key: string; time: number }[];
    speed: string;
    terminator: string;
    matchedProduct: string | null;
  } | null>(null);
  const [completedSale, setCompletedSale] = useState<LocalSale | null>(null);

  // Global keydown listener for barcode/QR scanner gun (Capture Phase)
  React.useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();
    let keyTimes: number[] = [];
    let timeoutId: any;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Si el modal de diagnóstico está abierto, no procesar aquí
      if (showDiagnostic) return;

      const target = e.target as HTMLElement;
      const isSearchInput = target === searchRef.current;
      const isOtherInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !isSearchInput;

      // Si está enfocado en otro input, ignorar para permitir la escritura manual lenta
      if (isOtherInput) {
        return;
      }

      const currentTime = Date.now();
      const elapsed = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Si pasa demasiado tiempo entre teclas (más de 90ms), asumimos que es escritura manual lenta y reiniciamos
      if (elapsed > 90) {
        buffer = '';
        keyTimes = [];
      }

      // Si es la tecla Enter o Tab, procesar el buffer acumulado
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 3) {
          const barcode = buffer.trim();
          const match = products.find(p => p.barcode === barcode || p.sku?.toLowerCase() === barcode.toLowerCase());
          if (match) {
            addToCart(match);
            success(`⚡ Escaneado con pistola: ${match.name}`);
            setIsScanning(false);
            setSearch('');
            e.preventDefault();
            e.stopPropagation();
          } else {
            warning(`Código escaneado "${barcode}" no coincide con ningún producto`);
            setSearch('');
            e.preventDefault();
            e.stopPropagation();
          }
        }
        buffer = '';
        keyTimes = [];
        clearTimeout(timeoutId);
        return;
      }

      // Evitar acumular teclas especiales
      if (e.key.length === 1) {
        buffer += e.key;
        keyTimes.push(elapsed);

        // Si detectamos velocidad de escáner en el input de búsqueda, prevenimos la escritura nativa
        // para que no ensucie la caja de texto.
        const isScannerSpeed = keyTimes.length >= 2 && keyTimes.slice(1).every(t => t < 45);
        if (isScannerSpeed && isSearchInput) {
          e.preventDefault();
        }

        // Timeout por si la pistola de código de barras no tiene configurado un sufijo (Enter/Tab)
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          const avgTime = keyTimes.length >= 2
            ? keyTimes.slice(1).reduce((s, t) => s + t, 0) / (keyTimes.length - 1)
            : 999;

          if (buffer.length >= 3 && avgTime < 45) {
            const barcode = buffer.trim();
            const match = products.find(p => p.barcode === barcode || p.sku?.toLowerCase() === barcode.toLowerCase());
            if (match) {
              addToCart(match);
              success(`⚡ Escaneado con pistola (auto): ${match.name}`);
              setIsScanning(false);
              setSearch('');
            } else {
              warning(`Código escaneado "${barcode}" no coincide con ningún producto`);
              setSearch('');
            }
          }
          buffer = '';
          keyTimes = [];
        }, 50); // Procesar tras 50ms de silencio a alta velocidad
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      clearTimeout(timeoutId);
    };
  }, [products, addToCart, success, warning, showDiagnostic]);

  // Diagnostic Modal keydown handler
  React.useEffect(() => {
    if (!showDiagnostic) return;

    let localBuffer = '';
    let times: number[] = [];
    let lastKey = Date.now();
    let terminatorKey = 'Ninguno';
    let timeoutId: any;

    const handleDiagnosticKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      const delay = now - lastKey;
      lastKey = now;

      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      if (e.key === 'Enter') {
        terminatorKey = 'Enter (CR)';
        finalizeScan();
        return;
      }

      if (e.key === 'Tab') {
        terminatorKey = 'Tab';
        finalizeScan();
        return;
      }

      if (e.key.length === 1) {
        localBuffer += e.key;
        times.push(delay);

        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          finalizeScan();
        }, 80);
      }
    };

    const finalizeScan = () => {
      clearTimeout(timeoutId);
      if (localBuffer.length === 0) return;

      const validDelays = times.slice(1);
      const avg = validDelays.length > 0
        ? validDelays.reduce((s, d) => s + d, 0) / validDelays.length
        : 0;

      const code = localBuffer.trim();
      const match = products.find(p => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase());

      setDiagnosticLogs({
        text: code,
        keys: times.map((t, idx) => ({ key: localBuffer[idx] || '', time: t })),
        speed: avg > 0 ? `${avg.toFixed(1)}ms` : 'Instantáneo',
        terminator: terminatorKey,
        matchedProduct: match ? match.name : null
      });

      localBuffer = '';
      times = [];
      terminatorKey = 'Ninguno';
    };

    window.addEventListener('keydown', handleDiagnosticKey, true);
    return () => {
      window.removeEventListener('keydown', handleDiagnosticKey, true);
      clearTimeout(timeoutId);
    };
  }, [showDiagnostic, products]);


  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.product.id !== productId) return i;
      const newQty = i.quantity + delta;
      return newQty > 0 ? { ...i, quantity: newQty } : null;
    }).filter(Boolean) as CartItem[]);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  // Totals
  const total = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const tax = requiresElectronicInvoice && isElectronicInvoicingAvailable
    ? Math.round(cart.reduce((s, i) => {
        const rate = i.product.tax_rate !== undefined ? i.product.tax_rate : 19;
        const itemTotal = i.product.price * i.quantity;
        const itemTax = itemTotal - (itemTotal / (1 + rate / 100));
        return s + itemTax;
      }, 0))
    : 0;
  const subtotal = total - tax;

  const handleElectronicInvoiceToggle = (checked: boolean) => {
    if (!checked) {
      setRequiresElectronicInvoice(false);
      return;
    }

    if (!isElectronicInvoicingAvailable) {
      warning('Este cliente no tiene habilitado el servicio de facturación electrónica.');
      return;
    }

    const confirmed = window.confirm(
      'Esta venta sera grabada con IVA y reportada a la DIAN como factura electronica. ¿Deseas continuar?'
    );

    if (!confirmed) return;

    setRequiresElectronicInvoice(true);
    warning('La venta se procesara con IVA y sera reportada en el flujo de factura electronica.');
  };

  const refreshCompletedSaleFromServer = async (saleId: string) => {
    if (!token || !isOnline) return;
    try {
      const serverSale = await salesApi.get(token, saleId);
      const normalizedSale: LocalSale = {
        id: serverSale.id,
        sale_number: serverSale.sale_number,
        subtotal: Number(serverSale.subtotal),
        tax: Number(serverSale.tax),
        total: Number(serverSale.total),
        payment_method: serverSale.payment_method,
        created_at: serverSale.created_at,
        sync_status: 'synced',
        sync_error: undefined,
        meta_data: serverSale.meta_data,
        details: (serverSale as any).details || [],
      };
      await db.sales.put(normalizedSale);
      setCompletedSale(normalizedSale);
    } catch {
      // noop
    }
  };

  const handlePrint = (mode: 'receipt' | 'invoice') => {
    setPrintMode(mode);
    requestAnimationFrame(() => window.print());
  };

  const handleCheckout = async () => {
    if (cart.length === 0) { warning('El carrito está vacío'); return; }
    if (requiresElectronicInvoice) {
      if (!isOnline || !token) {
        warning('La facturación electrónica requiere conexión a internet y sesión activa.');
        return;
      }
      if (!customerIdentification.trim() || !customerName.trim()) {
        warning('Para emitir factura electrónica debes completar documento y nombre del comprador');
        return;
      }
    }
    setIsCheckingOut(true);
    try {
      const count = await db.sales.count();
      const saleNumber = `POS-${String(1000 + count + 1).padStart(5, '0')}`;
      const now = new Date().toISOString();
      const saleId = crypto.randomUUID();

      const details: LocalSaleDetail[] = cart.map(i => ({
        product_id: i.product.id,
        name: i.product.name,
        quantity: i.quantity,
        price: i.product.price,
        total: i.product.price * i.quantity,
        tax_rate: i.product.tax_rate,
      }));

      const sale: LocalSale = {
        id: saleId,
        sale_number: saleNumber,
        subtotal,
        tax,
        total,
        payment_method: paymentMethod,
        created_at: now,
        sync_status: 'pending',
        sync_error: undefined,
        details,
        meta_data: {
          requires_electronic_invoice: requiresElectronicInvoice,
          dian_status: requiresElectronicInvoice ? 'pending_sync' : 'not_requested',
          customer_document_code: customerDocumentCode,
          customer_identification: customerIdentification.trim(),
          customer_name: customerName.trim(),
          customer_email: customerEmail.trim() || undefined,
          customer_phone: customerPhone.trim() || undefined,
          customer_address: customerAddress.trim() || undefined,
        },
      };

      // Save locally first (offline-first)
      await db.sales.add(sale);

      // Update stock in IndexedDB
      for (const item of cart) {
        const prod = await db.products.get(item.product.id);
        if (prod) {
          prod.stock = Math.max(0, prod.stock - item.quantity);
          await db.products.put(prod);
        }
      }

      // Attempt server sync if online
      if (isOnline && token) {
        try {
          const result = await salesApi.syncOffline(token, [sale]);
          if (result.synced_ids.length > 0) {
            const saved = await db.sales.get(saleId);
            if (saved) {
              saved.sync_status = 'synced';
              saved.sync_error = undefined;
              await db.sales.put(saved);
            }
            await refreshCompletedSaleFromServer(saleId);
          } else if ((result.errors || []).length > 0) {
            const saved = await db.sales.get(saleId);
            if (saved) {
              saved.sync_error = result.errors[0]?.error || 'Error de sincronización';
              await db.sales.put(saved);
            }
          }
        } catch { /* Will sync later */ }
      }

      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      success(`✅ Venta ${saleNumber} registrada — $${total.toLocaleString('es-CO')}`);
      setCompletedSale(sale); // Mostrar modal de recibo
      setPrintMode('receipt');
      setRequiresElectronicInvoice(false);
      setCustomerDocumentCode('13');
      setCustomerIdentification('');
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerAddress('');
      clearCart();
      onSaleComplete();
    } catch (e) {
      error('Error al registrar la venta. Intenta de nuevo.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const term = search.trim();
      if (!term) return;
      
      const match = products.find(p => p.barcode === term || p.sku?.toLowerCase() === term.toLowerCase());
      if (match) {
        addToCart(match);
        success(`⚡ Escaneado: ${match.name}`);
        setSearch('');
      } else {
        warning(`Código "${term}" no coincide con ningún producto registrado`);
      }
    }
  };

  return (
    <div className="pos-layout">
      {/* Left: Product Catalog */}
      <div className="pos-catalog">
        {/* Search + Filter */}
        <div className="pos-catalog-header">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Buscar producto, SKU o código..."
              className="search-input"
              autoFocus
            />
          </div>
          <button 
            onClick={() => { setShowDiagnostic(true); setDiagnosticLogs(null); }}
            className="barcode-badge-status" 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.15)',
              padding: '0 12px',
              borderRadius: '12px',
              color: '#10b881',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.2px',
              height: '42px',
              boxSizing: 'border-box',
              flexShrink: 0,
              cursor: 'pointer',
              outline: 'none',
              transition: 'var(--t-fast)'
            }} 
            title="Probar pistola lectora de códigos de barras (clic para probar)"
          >
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b881',
              boxShadow: '0 0 6px #10b881',
              display: 'inline-block',
              animation: 'pulse 1.5s infinite'
            }} />
            <Barcode size={14} />
            <span className="barcode-badge-text">Pistola Lista</span>
          </button>
          <button
            onClick={() => setIsScanning(true)}
            className="btn-icon-primary"
            title="Escanear QR/Código"
          >
            <QrCode size={18} />
          </button>
        </div>

        {/* Category Pills */}
        <div className="category-pills">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`cat-pill ${selectedCategory === cat ? 'active' : ''}`}
            >
              {cat === 'all' ? 'Todos' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="product-grid">
          {filtered.map(product => (
            <div
              key={product.id}
              onClick={() => addToCart(product)}
              className={`product-card glass glow-hover ${product.stock <= 0 ? 'out-of-stock' : ''}`}
            >
              <div className="product-card-top">
                <span className="sku-badge">{product.sku || '—'}</span>
                <span className={`stock-badge ${product.stock > 5 ? 'good' : product.stock > 0 ? 'low' : 'empty'}`}>
                  {product.stock <= 0 ? 'Agotado' : `Stock: ${product.stock}`}
                </span>
              </div>
              <div className="product-card-image">
                {product.image ? (
                  product.image.startsWith('preset-') ? (
                    <div className={`product-preset-img ${product.image}`}>
                      {product.image === 'preset-food' && '🥩'}
                      {product.image === 'preset-med' && '💊'}
                      {product.image === 'preset-service' && '🩺'}
                      {product.image === 'preset-package' && '📦'}
                    </div>
                  ) : (
                    <img src={product.image} alt={product.name} className="product-img" />
                  )
                ) : (
                  <div className="product-preset-img preset-package">📦</div>
                )}
              </div>
              <div className="product-card-body">
                <h3 className="product-name">{product.name}</h3>
                {product.meta_data?.tipo && (
                  <span className="product-tag">{product.meta_data.tipo}</span>
                )}
              </div>
              <div className="product-card-footer">
                <span className="product-price">${product.price.toLocaleString('es-CO')}</span>
                <button className="btn-add-product" tabIndex={-1}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="empty-catalog">
              <Package size={48} className="empty-icon" />
              <p>No se encontraron productos</p>
              <span>Prueba con otro término de búsqueda</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="pos-cart-panel glass">
        {/* Cart Header */}
        <div className="cart-header">
          <div className="cart-title">
            <ShoppingCart size={18} />
            <span>Venta Actual</span>
            {cart.length > 0 && <span className="cart-count">{cart.reduce((s, i) => s + i.quantity, 0)}</span>}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="btn-ghost-danger">
              <Trash2 size={14} /> Vaciar
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <ShoppingCart size={40} className="empty-icon" />
              <p>Selecciona productos del catálogo</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product.id} className="cart-item animate-fade">
                <div className="cart-item-info">
                  <p className="cart-item-name">{item.product.name}</p>
                  <p className="cart-item-unit">${item.product.price.toLocaleString('es-CO')} c/u</p>
                </div>
                <div className="cart-item-controls">
                  <button onClick={() => updateQty(item.product.id, -1)} className="qty-btn">
                    <Minus size={12} />
                  </button>
                  <span className="qty-value">{item.quantity}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} className="qty-btn">
                    <Plus size={12} />
                  </button>
                  <span className="cart-item-total">
                    ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                  </span>
                  <button onClick={() => removeFromCart(item.product.id)} className="btn-remove-item">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Payment + Totals */}
        <div className="cart-footer">
          {/* Payment Method */}
          <div className="payment-section">
            <label className="section-label">Método de Pago</label>
            <div className="payment-methods">
              {PAYMENT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setPaymentMethod(opt.id)}
                  className={`payment-btn ${paymentMethod === opt.id ? 'selected' : ''}`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {isElectronicInvoicingAvailable && (
            <div className="payment-section">
              <label className="section-label">Factura electrónica</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={requiresElectronicInvoice}
                  onChange={e => handleElectronicInvoiceToggle(e.target.checked)}
                />
                Activar facturación electrónica para esta venta
              </label>
              {requiresElectronicInvoice && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--warning)', lineHeight: 1.5, margin: 0 }}>
                    Esta venta liquidara IVA y sera reportada a la DIAN dentro del flujo de factura electronica.
                  </p>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tipo de documento</label>
                    <select className="form-select" value={customerDocumentCode} onChange={e => setCustomerDocumentCode(e.target.value)}>
                      <option value="13">Cédula de ciudadanía</option>
                      <option value="31">NIT</option>
                      <option value="41">Pasaporte</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Documento del comprador *</label>
                    <input className="form-input" value={customerIdentification} onChange={e => setCustomerIdentification(e.target.value)} placeholder="Ej. 1399995" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Nombre o razón social *</label>
                    <input className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ej. Consumidor Final" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Correo</label>
                    <input className="form-input" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="cliente@correo.com" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="3001234567" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Dirección</label>
                    <input className="form-input" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Dirección del comprador" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Totals */}
          <div className="totals-box">
            <div className="total-row">
              <span>Subtotal</span>
              <span>${subtotal.toLocaleString('es-CO')}</span>
            </div>
            <div className="total-row">
              <span>IVA</span>
              <span>${tax.toLocaleString('es-CO')}</span>
            </div>
            <div className="total-row total-main">
              <span>Total a Cobrar</span>
              <span>${total.toLocaleString('es-CO')}</span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0 || isCheckingOut}
            className="btn-checkout"
          >
            <CheckCircle size={20} />
            <span>{isCheckingOut ? 'Procesando...' : `Cobrar $${total.toLocaleString('es-CO')}`}</span>
          </button>
        </div>
      </div>

      {/* QR Scanner Modal */}
      {isScanning && (
        <QrScannerModal
          onScanSuccess={code => {
            const match = products.find(p => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase());
            if (match) { addToCart(match); success(`Producto escaneado: ${match.name}`); }
            else warning(`Código "${code}" no encontrado en inventario`);
            setIsScanning(false);
          }}
          onClose={() => setIsScanning(false)}
        />
      )}

      {/* Printable Area for Thermal Printer (Rendered at root via Portal to avoid parent display:none) */}
      {completedSale && createPortal(
        <div id="print-ticket-area">
          {printMode === 'receipt' ? (
            <>
              <div style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '8px' }}>
                <strong>{businessName}</strong>
              </div>
              <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '10px' }}>
                Fecha: {new Date(completedSale.created_at).toLocaleString()}<br />
                Factura N°: {completedSale.sale_number}
              </div>
              <div style={{ borderBottom: '1px dashed black', paddingBottom: '6px', marginBottom: '6px' }}>
                {completedSale.details.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ flex: 1, textAlign: 'left' }}>{item.quantity}x {item.name}</span>
                    <span>${(item.price * item.quantity).toLocaleString('es-CO')}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>${completedSale.subtotal.toLocaleString('es-CO')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>IVA:</span>
                  <span>${completedSale.tax.toLocaleString('es-CO')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', borderTop: '1px dashed black', paddingTop: '4px', marginTop: '4px' }}>
                  <span>TOTAL COBRADO:</span>
                  <span>${completedSale.total.toLocaleString('es-CO')}</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '16px', borderTop: '1px dashed black', paddingTop: '8px' }}>
                Gracias por su compra<br />
                {businessName}
              </div>
            </>
          ) : (
            <div className="invoice-print-sheet">
              <div className="invoice-print-header">
                <div>
                  <div className="invoice-print-title">{businessName}</div>
                  <div className="invoice-print-subtitle">Factura electronica de venta</div>
                </div>
                <div className="invoice-print-badge">FE</div>
              </div>
              <div className="invoice-print-meta-grid">
                <div><strong>Numero:</strong> {completedSale.sale_number}</div>
                <div><strong>Fecha:</strong> {new Date(completedSale.created_at).toLocaleString()}</div>
                <div><strong>Metodo:</strong> {completedSale.payment_method === 'cash' ? 'Efectivo' : completedSale.payment_method === 'card' ? 'Tarjeta' : 'Transferencia'}</div>
                <div><strong>Estado DIAN:</strong> {completedSale.meta_data?.dian_status || 'Pendiente'}</div>
                <div><strong>CUFE:</strong> {completedSale.meta_data?.cufe || 'Pendiente de generar'}</div>
                <div><strong>QR DIAN:</strong> {completedSale.meta_data?.qr_url || 'Pendiente de generar'}</div>
              </div>
              <table className="invoice-print-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>Unitario</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {completedSale.details.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>${item.price.toLocaleString('es-CO')}</td>
                      <td>${(item.price * item.quantity).toLocaleString('es-CO')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="invoice-print-totals">
                <div><span>Subtotal</span><strong>${completedSale.subtotal.toLocaleString('es-CO')}</strong></div>
                <div><span>IVA</span><strong>${completedSale.tax.toLocaleString('es-CO')}</strong></div>
                <div className="invoice-print-total-main"><span>Total</span><strong>${completedSale.total.toLocaleString('es-CO')}</strong></div>
              </div>
              <div className="invoice-print-footer">
                Documento preparado para el flujo de facturacion electronica y reporte a la DIAN.
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Venta Completada (Modal de Recibo) */}
      {completedSale && (
        <div className="modal-backdrop animate-fade">
          <div className="modal-content glass animate-slide-up" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: '#10b881', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <CheckCircle size={20} /> Venta Registrada
              </h3>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div className="ticket-virtual">
                <div className="ticket-header">
                  <h4 className="ticket-title">{businessName}</h4>
                  <p className="ticket-subtitle">{completedSale.meta_data?.requires_electronic_invoice ? 'Venta con facturacion electronica' : 'Ticket de Venta'}</p>
                </div>
                <div className="ticket-meta">
                  <strong>Factura N°:</strong> {completedSale.sale_number}<br />
                  <strong>Fecha:</strong> {new Date(completedSale.created_at).toLocaleString()}<br />
                  <strong>Método:</strong> {completedSale.payment_method === 'cash' ? 'Efectivo' : completedSale.payment_method === 'card' ? 'Tarjeta' : 'Transferencia'}
                  {completedSale.meta_data?.requires_electronic_invoice && (
                    <>
                      <br /><strong>DIAN:</strong> {completedSale.meta_data?.dian_status || 'Pendiente'}
                      <br /><strong>CUFE:</strong> {completedSale.meta_data?.cufe || 'Pendiente de generar'}
                    </>
                  )}
                </div>
                <div className="ticket-items">
                  {completedSale.details.map((item, idx) => (
                    <div key={idx} className="ticket-item-row">
                      <span className="ticket-item-name">{item.quantity}x {item.name}</span>
                      <span>${(item.price * item.quantity).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
                <div className="ticket-totals">
                  <div className="ticket-total-row">
                    <span>Subtotal:</span>
                    <span>${completedSale.subtotal.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="ticket-total-row">
                    <span>IVA:</span>
                    <span>${completedSale.tax.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="ticket-total-row main">
                    <span>TOTAL:</span>
                    <span>${completedSale.total.toLocaleString('es-CO')}</span>
                  </div>
                </div>
                <div className="ticket-footer">
                  ¡Gracias por su compra!<br />
                  {businessName}
                </div>
              </div>
            </div>
            <div className="modal-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 20px 20px 20px' }}>
              <button 
                onClick={() => handlePrint('receipt')} 
                className="btn-primary w-full"
                style={{ height: '44px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              >
                <Printer size={18} /> Imprimir Recibo (Abrir Caja)
              </button>
              {completedSale.meta_data?.requires_electronic_invoice && (
                <button 
                  onClick={() => handlePrint('invoice')} 
                  className="btn-secondary w-full"
                  style={{ height: '44px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                >
                  <Printer size={18} /> Imprimir Factura Electronica
                </button>
              )}
              <button 
                onClick={() => setCompletedSale(null)} 
                className="btn-secondary w-full"
                style={{ height: '44px' }}
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Diagnóstico de Pistola Lector */}
      {showDiagnostic && (
        <div className="modal-backdrop animate-fade" onClick={() => setShowDiagnostic(false)}>
          <div className="modal-content glass animate-slide-up" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Barcode size={18} /> Diagnóstico de Pistola
              </h3>
              <button onClick={() => setShowDiagnostic(false)} className="modal-close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px', textAlign: 'center' }}>
              {!diagnosticLogs ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '30px 0' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(16,185,129,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b881',
                    boxShadow: '0 0 16px rgba(16,185,129,0.15)',
                    animation: 'pulse 1.8s infinite'
                  }}>
                    <Barcode size={32} />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: 'var(--text-primary)' }}>Esperando Lectura de Pistola...</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '300px', margin: 0, lineHeight: 1.4 }}>
                      Apunta tu lector de código de barras físico a cualquier código y presiona el gatillo.
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                  <div style={{ 
                    background: 'rgba(16,185,129,0.06)', 
                    border: '1px solid rgba(16,185,129,0.15)', 
                    borderRadius: '8px', 
                    padding: '16px',
                    textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '10px', color: '#10b881', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Texto Capturado</span>
                    <h2 style={{ fontFamily: 'monospace', fontSize: '26px', margin: '4px 0 0 0', color: '#10b881', letterSpacing: '0.5px' }}>{diagnosticLogs.text}</h2>
                  </div>

                  <div className="glass" style={{ padding: '14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Caracteres leídos:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{diagnosticLogs.keys.length} caracteres</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Velocidad promedio:</span>
                      <strong style={{ color: '#10b881' }}>{diagnosticLogs.speed} (Velocidad Escáner)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Sufijo detectado:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{diagnosticLogs.terminator}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>En catálogo local:</span>
                      <strong style={{ color: diagnosticLogs.matchedProduct ? '#10b881' : '#ef4444' }}>
                        {diagnosticLogs.matchedProduct ? `✅ "${diagnosticLogs.matchedProduct}"` : '❌ No registrado'}
                      </strong>
                    </div>
                  </div>

                  <div style={{
                    fontSize: '12px',
                    lineHeight: '1.4',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    {diagnosticLogs.terminator === 'Ninguno' ? (
                      <p style={{ margin: 0 }}>
                        💡 <strong>Aviso de Sufijo:</strong> Tu lector funciona pero <strong>no envía la tecla Enter</strong>. El POS ahora lo soporta automáticamente por tiempo, pero te aconsejamos programar la pistola para que envíe <em>"Enter / Carriage Return (CR)"</em> leyendo su manual.
                      </p>
                    ) : (
                      <p style={{ margin: 0 }}>
                        ✔️ <strong>Configuración Óptima:</strong> Tu lector está configurado perfectamente con el sufijo Enter. Es 100% compatible y responderá de inmediato.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ padding: '0 20px 20px 20px' }}>
              {diagnosticLogs && (
                <button onClick={() => setDiagnosticLogs(null)} className="btn-secondary" style={{ flex: 1 }}>
                  Volver a Escanear
                </button>
              )}
              <button onClick={() => setShowDiagnostic(false)} className="btn-primary" style={{ flex: 1 }}>
                Cerrar Diagnóstico
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
