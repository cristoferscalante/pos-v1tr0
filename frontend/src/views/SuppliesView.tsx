import { useEffect, useState } from 'react';
import { Building2, History, Plus, RefreshCw, ShoppingBag, Truck } from 'lucide-react';

import { productsApi, purchasesApi, suppliersApi } from '../api/client';
import { useToast } from '../components/Toast';
import type { ApiProduct, InventoryMovement, Purchase, Supplier } from '../types';


interface SuppliesViewProps {
  token: string | null;
  isOnline: boolean;
  onProductsChange: () => void;
}


export function SuppliesView({ token, isOnline, onProductsChange }: SuppliesViewProps) {
  const { success, error, warning } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('1');
  const [purchaseCost, setPurchaseCost] = useState('0');
  const [purchaseTax, setPurchaseTax] = useState('0');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);

  const load = async () => {
    if (!token || !isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [suppliersData, productsData, purchasesData, movementsData] = await Promise.all([
        suppliersApi.list(token),
        productsApi.list(token),
        purchasesApi.list(token),
        purchasesApi.movements(token),
      ]);
      setSuppliers(suppliersData);
      setProducts(productsData);
      setPurchases(purchasesData);
      setMovements(movementsData);
      if (!selectedSupplierId && suppliersData[0]) setSelectedSupplierId(suppliersData[0].id);
      if (!selectedProductId && productsData[0]) setSelectedProductId(productsData[0].id);
    } catch (err: any) {
      error(err.message || 'No se pudo cargar el módulo de compras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, isOnline]);

  const handleCreateSupplier = async () => {
    if (!token) return;
    if (!supplierName.trim()) {
      warning('Ingresa el nombre del proveedor');
      return;
    }
    setSavingSupplier(true);
    try {
      const supplier = await suppliersApi.create(token, {
        name: supplierName.trim(),
        contact_name: supplierContact.trim() || undefined,
        email: supplierEmail.trim() || undefined,
      });
      success('Proveedor creado correctamente');
      setSuppliers(prev => [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSupplierId(supplier.id);
      setSupplierName('');
      setSupplierContact('');
      setSupplierEmail('');
    } catch (err: any) {
      error(err.message || 'No se pudo crear el proveedor');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleCreatePurchase = async () => {
    if (!token) return;
    if (!selectedSupplierId || !selectedProductId) {
      warning('Selecciona proveedor y producto');
      return;
    }
    if (Number(purchaseQty) <= 0 || Number(purchaseCost) <= 0) {
      warning('La cantidad y el costo deben ser mayores a 0');
      return;
    }

    setSavingPurchase(true);
    try {
      await purchasesApi.create(token, {
        supplier_id: selectedSupplierId,
        invoice_number: purchaseInvoice || undefined,
        tax: Number(purchaseTax || 0),
        notes: purchaseNotes || undefined,
        details: [
          {
            product_id: selectedProductId,
            quantity: Number(purchaseQty),
            unit_cost: Number(purchaseCost),
          },
        ],
      });
      success('Entrada de mercancía registrada');
      setPurchaseInvoice('');
      setPurchaseNotes('');
      setPurchaseTax('0');
      setPurchaseQty('1');
      setPurchaseCost('0');
      await load();
      onProductsChange();
    } catch (err: any) {
      error(err.message || 'No se pudo registrar la compra');
    } finally {
      setSavingPurchase(false);
    }
  };

  if (!isOnline) {
    return (
      <div className="view-container">
        <div className="view-header">
          <div>
            <h1 className="view-title"><Truck size={24} className="view-title-icon" /> Compras y Abastecimiento</h1>
            <p className="view-subtitle">Este módulo requiere conexión al servidor.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title"><Truck size={24} className="view-title-icon" /> Compras y Abastecimiento</h1>
          <p className="view-subtitle">Registra proveedores, entradas de mercancía y movimientos de stock</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={15} /> Actualizar</button>
      </div>

      {loading ? (
        <div className="loading-state">
          <RefreshCw size={32} className="spin" style={{ color: 'var(--primary)' }} />
          <p>Cargando módulo de compras...</p>
        </div>
      ) : (
        <>
          <div className="stats-row">
            <div className="stat-card glass"><div className="stat-icon-wrap" style={{ background: 'rgba(99,102,241,0.15)' }}><Building2 size={20} style={{ color: 'var(--primary)' }} /></div><div><p className="stat-value">{suppliers.length}</p><p className="stat-label">Proveedores</p></div></div>
            <div className="stat-card glass"><div className="stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)' }}><ShoppingBag size={20} style={{ color: 'var(--success)' }} /></div><div><p className="stat-value">{purchases.length}</p><p className="stat-label">Compras</p></div></div>
            <div className="stat-card glass"><div className="stat-icon-wrap" style={{ background: 'rgba(34,211,238,0.15)' }}><History size={20} style={{ color: 'var(--accent)' }} /></div><div><p className="stat-value">{movements.length}</p><p className="stat-label">Movimientos</p></div></div>
          </div>

          <div className="settings-grid">
            <div className="settings-card glass">
              <div className="settings-card-header"><Building2 size={18} style={{ color: 'var(--primary)' }} /><h2 className="settings-card-title">Nuevo Proveedor</h2></div>
              <div className="pos-form">
                <div className="form-group"><label className="form-label">Nombre</label><input className="form-input" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Ej. Distribuidora ABC" /></div>
                <div className="form-group"><label className="form-label">Contacto</label><input className="form-input" value={supplierContact} onChange={e => setSupplierContact(e.target.value)} placeholder="Nombre del asesor" /></div>
                <div className="form-group"><label className="form-label">Correo</label><input className="form-input" value={supplierEmail} onChange={e => setSupplierEmail(e.target.value)} placeholder="compras@proveedor.com" /></div>
                <button type="button" onClick={handleCreateSupplier} disabled={savingSupplier} className="btn-primary"><Plus size={15} /> {savingSupplier ? 'Guardando...' : 'Crear proveedor'}</button>
              </div>
            </div>

            <div className="settings-card glass">
              <div className="settings-card-header"><ShoppingBag size={18} style={{ color: 'var(--success)' }} /><h2 className="settings-card-title">Entrada de Mercancía</h2></div>
              <div className="pos-form">
                <div className="form-group"><label className="form-label">Proveedor</label><select className="form-select" value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Producto</label><select className="form-select" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Cantidad</label><input type="number" className="form-input" value={purchaseQty} onChange={e => setPurchaseQty(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Costo unitario</label><input type="number" className="form-input" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} /></div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Factura</label><input className="form-input" value={purchaseInvoice} onChange={e => setPurchaseInvoice(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Impuesto</label><input type="number" className="form-input" value={purchaseTax} onChange={e => setPurchaseTax(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Notas</label><textarea className="form-input" rows={3} value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} /></div>
                <button type="button" onClick={handleCreatePurchase} disabled={savingPurchase} className="btn-primary"><Plus size={15} /> {savingPurchase ? 'Registrando...' : 'Registrar entrada'}</button>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-panel glass">
              <div className="panel-header"><h3 className="panel-title">Compras Recientes</h3></div>
              {purchases.length === 0 ? <div className="empty-state-sm">Aún no hay compras registradas.</div> : (
                <div className="top-products-list">
                  {purchases.slice(0, 8).map(purchase => (
                    <div key={purchase.id} className="top-product-item">
                      <span className="top-rank"><ShoppingBag size={14} /></span>
                      <div className="top-product-info"><p className="top-product-name">{purchase.invoice_number || 'Sin factura'}</p><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(purchase.created_at).toLocaleString('es-CO')}</div></div>
                      <div className="top-product-stats"><span className="top-revenue">${Number(purchase.total).toLocaleString('es-CO')}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-panel glass">
              <div className="panel-header"><h3 className="panel-title">Movimientos de Inventario</h3></div>
              {movements.length === 0 ? <div className="empty-state-sm">Sin movimientos registrados.</div> : (
                <div className="top-products-list">
                  {movements.slice(0, 8).map(movement => (
                    <div key={movement.id} className="top-product-item">
                      <span className="top-rank"><History size={14} /></span>
                      <div className="top-product-info"><p className="top-product-name">{movement.movement_type}</p><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Stock: {movement.previous_stock} {'->'} {movement.new_stock}</div></div>
                      <div className="top-product-stats"><span className="top-qty">+{movement.quantity}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
