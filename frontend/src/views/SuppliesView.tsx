import { useEffect, useState } from 'react';
import { Building2, History, Pencil, Plus, RefreshCw, RotateCcw, ShoppingBag, Truck, Wallet } from 'lucide-react';

import { productsApi, purchasesApi, suppliersApi } from '../api/client';
import { useToast } from '../components/Toast';
import type { ApiProduct, InventoryMovement, Purchase, Supplier } from '../types';


interface SuppliesViewProps {
  token: string | null;
  isOnline: boolean;
  onProductsChange: () => void;
}


interface PurchaseLineForm {
  product_id: string;
  quantity: string;
  unit_cost: string;
}


const EMPTY_LINE: PurchaseLineForm = { product_id: '', quantity: '1', unit_cost: '0' };


export function SuppliesView({ token, isOnline, onProductsChange }: SuppliesViewProps) {
  const { success, error, warning } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [kardex, setKardex] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_name: '', email: '', phone: '', document_number: '', address: '', city: '', payment_terms_days: '0', notes: ''
  });

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineForm[]>([{ ...EMPTY_LINE }]);
  const [purchaseTax, setPurchaseTax] = useState('0');
  const [purchasePaidAmount, setPurchasePaidAmount] = useState('0');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [manualMovementType, setManualMovementType] = useState('adjustment_in');
  const [manualQty, setManualQty] = useState('1');
  const [manualCost, setManualCost] = useState('0');
  const [manualNotes, setManualNotes] = useState('');
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [returnCost, setReturnCost] = useState('0');
  const [returnNotes, setReturnNotes] = useState('');
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [savingMovement, setSavingMovement] = useState(false);

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

      const firstSupplierId = suppliersData[0]?.id || '';
      const firstProductId = productsData[0]?.id || '';
      if (!selectedSupplierId) setSelectedSupplierId(firstSupplierId);
      if (!returnSupplierId) setReturnSupplierId(firstSupplierId);
      if (!selectedProductId) setSelectedProductId(firstProductId);
      setPurchaseLines(prev => prev.map((line, index) => index === 0 && !line.product_id ? { ...line, product_id: firstProductId } : line));

      if (firstProductId) {
        const kardexData = await purchasesApi.kardex(token, firstProductId);
        setKardex(kardexData);
      }
    } catch (err: any) {
      error(err.message || 'No se pudo cargar el módulo de compras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, isOnline]);

  const loadKardex = async (productId: string) => {
    if (!token || !productId) return;
    try {
      const data = await purchasesApi.kardex(token, productId);
      setKardex(data);
    } catch (err: any) {
      error(err.message || 'No se pudo cargar el kardex');
    }
  };

  const handleCreateSupplier = async () => {
    if (!token) return;
    if (!supplierForm.name.trim()) {
      warning('Ingresa el nombre del proveedor');
      return;
    }
    setSavingSupplier(true);
    try {
      const supplier = await suppliersApi.create(token, {
        ...supplierForm,
        name: supplierForm.name.trim(),
        payment_terms_days: Number(supplierForm.payment_terms_days || 0),
      });
      success('Proveedor creado correctamente');
      setSuppliers(prev => [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSupplierId(supplier.id);
      setReturnSupplierId(supplier.id);
      setSupplierForm({ name: '', contact_name: '', email: '', phone: '', document_number: '', address: '', city: '', payment_terms_days: '0', notes: '' });
    } catch (err: any) {
      error(err.message || 'No se pudo crear el proveedor');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleCreateOrUpdatePurchase = async () => {
    if (!token) return;
    if (!selectedSupplierId) {
      warning('Selecciona un proveedor');
      return;
    }

    const normalizedLines = purchaseLines
      .filter(line => line.product_id && Number(line.quantity) > 0 && Number(line.unit_cost) > 0)
      .map(line => ({ product_id: line.product_id, quantity: Number(line.quantity), unit_cost: Number(line.unit_cost) }));

    if (normalizedLines.length === 0) {
      warning('Agrega al menos una línea válida a la compra');
      return;
    }

    setSavingPurchase(true);
    try {
      if (editingPurchase) {
        await purchasesApi.update(token, editingPurchase.id, {
          invoice_number: purchaseInvoice || undefined,
          tax: Number(purchaseTax || 0),
          paid_amount: Number(purchasePaidAmount || 0),
          notes: purchaseNotes || undefined,
        });
        success('Compra actualizada');
      } else {
        await purchasesApi.create(token, {
          supplier_id: selectedSupplierId,
          invoice_number: purchaseInvoice || undefined,
          tax: Number(purchaseTax || 0),
          paid_amount: Number(purchasePaidAmount || 0),
          notes: purchaseNotes || undefined,
          details: normalizedLines,
        });
        success('Entrada de mercancía registrada');
      }

      setEditingPurchase(null);
      setPurchaseInvoice('');
      setPurchaseNotes('');
      setPurchaseTax('0');
      setPurchasePaidAmount('0');
      setPurchaseLines([{ product_id: products[0]?.id || '', quantity: '1', unit_cost: '0' }]);
      await load();
      onProductsChange();
    } catch (err: any) {
      error(err.message || 'No se pudo guardar la compra');
    } finally {
      setSavingPurchase(false);
    }
  };

  const handleCancelPurchase = async (purchase: Purchase) => {
    if (!token) return;
    if (!confirm(`¿Anular la compra ${purchase.invoice_number || purchase.id}?`)) return;
    try {
      await purchasesApi.cancel(token, purchase.id);
      success('Compra anulada correctamente');
      await load();
      onProductsChange();
    } catch (err: any) {
      error(err.message || 'No se pudo anular la compra');
    }
  };

  const handleEditPurchase = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setSelectedSupplierId(purchase.supplier_id);
    setPurchaseInvoice(purchase.invoice_number || '');
    setPurchaseTax(String(Number(purchase.tax || 0)));
    setPurchasePaidAmount(String(Number(purchase.paid_amount || 0)));
    setPurchaseNotes(purchase.notes || '');
  };

  const handleManualMovement = async () => {
    if (!token || !selectedProductId) return;
    if (Number(manualQty) <= 0) {
      warning('La cantidad debe ser mayor a 0');
      return;
    }
    setSavingMovement(true);
    try {
      await purchasesApi.manualMovement(token, {
        product_id: selectedProductId,
        movement_type: manualMovementType,
        quantity: Number(manualQty),
        unit_cost: Number(manualCost || 0) || undefined,
        notes: manualNotes || undefined,
      });
      success('Movimiento manual registrado');
      setManualQty('1');
      setManualCost('0');
      setManualNotes('');
      await load();
      await loadKardex(selectedProductId);
      onProductsChange();
    } catch (err: any) {
      error(err.message || 'No se pudo registrar el movimiento');
    } finally {
      setSavingMovement(false);
    }
  };

  const handleSupplierReturn = async () => {
    if (!token || !selectedProductId || !returnSupplierId) return;
    if (Number(returnQty) <= 0) {
      warning('La cantidad de devolución debe ser mayor a 0');
      return;
    }
    setSavingMovement(true);
    try {
      await purchasesApi.supplierReturn(token, {
        supplier_id: returnSupplierId,
        product_id: selectedProductId,
        quantity: Number(returnQty),
        unit_cost: Number(returnCost || 0) || undefined,
        notes: returnNotes || undefined,
      });
      success('Devolución a proveedor registrada');
      setReturnQty('1');
      setReturnCost('0');
      setReturnNotes('');
      await load();
      await loadKardex(selectedProductId);
      onProductsChange();
    } catch (err: any) {
      error(err.message || 'No se pudo registrar la devolución');
    } finally {
      setSavingMovement(false);
    }
  };

  const addPurchaseLine = () => setPurchaseLines(prev => [...prev, { product_id: products[0]?.id || '', quantity: '1', unit_cost: '0' }]);
  const updatePurchaseLine = (index: number, key: keyof PurchaseLineForm, value: string) => setPurchaseLines(prev => prev.map((line, i) => i === index ? { ...line, [key]: value } : line));
  const removePurchaseLine = (index: number) => setPurchaseLines(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));

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
          <p className="view-subtitle">Compras multilínea, cuentas por pagar, movimientos manuales y kardex por producto</p>
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
            <div className="stat-card glass"><div className="stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)' }}><Wallet size={20} style={{ color: 'var(--warning)' }} /></div><div><p className="stat-value">${purchases.reduce((sum, p) => sum + Number(p.balance_due || 0), 0).toLocaleString('es-CO')}</p><p className="stat-label">Cuentas por pagar</p></div></div>
          </div>

          <div className="settings-grid">
            <div className="settings-card glass">
              <div className="settings-card-header"><Building2 size={18} style={{ color: 'var(--primary)' }} /><h2 className="settings-card-title">Nuevo Proveedor</h2></div>
              <div className="pos-form">
                <div className="form-group"><label className="form-label">Nombre</label><input className="form-input" value={supplierForm.name} onChange={e => setSupplierForm(prev => ({ ...prev, name: e.target.value }))} /></div>
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Contacto</label><input className="form-input" value={supplierForm.contact_name} onChange={e => setSupplierForm(prev => ({ ...prev, contact_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Correo</label><input className="form-input" value={supplierForm.email} onChange={e => setSupplierForm(prev => ({ ...prev, email: e.target.value }))} /></div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Teléfono</label><input className="form-input" value={supplierForm.phone} onChange={e => setSupplierForm(prev => ({ ...prev, phone: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Documento</label><input className="form-input" value={supplierForm.document_number} onChange={e => setSupplierForm(prev => ({ ...prev, document_number: e.target.value }))} /></div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Dirección</label><input className="form-input" value={supplierForm.address} onChange={e => setSupplierForm(prev => ({ ...prev, address: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Ciudad</label><input className="form-input" value={supplierForm.city} onChange={e => setSupplierForm(prev => ({ ...prev, city: e.target.value }))} /></div>
                </div>
                <div className="form-group"><label className="form-label">Días de crédito</label><input type="number" className="form-input" value={supplierForm.payment_terms_days} onChange={e => setSupplierForm(prev => ({ ...prev, payment_terms_days: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Notas</label><textarea className="form-input" rows={2} value={supplierForm.notes} onChange={e => setSupplierForm(prev => ({ ...prev, notes: e.target.value }))} /></div>
                <button type="button" onClick={handleCreateSupplier} disabled={savingSupplier} className="btn-primary"><Plus size={15} /> {savingSupplier ? 'Guardando...' : 'Crear proveedor'}</button>
              </div>
            </div>

            <div className="settings-card glass">
              <div className="settings-card-header"><ShoppingBag size={18} style={{ color: 'var(--success)' }} /><h2 className="settings-card-title">{editingPurchase ? 'Editar Compra' : 'Entrada de Mercancía'}</h2></div>
              <div className="pos-form">
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Proveedor</label><select className="form-select" value={selectedSupplierId} onChange={e => setSelectedSupplierId(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Factura</label><input className="form-input" value={purchaseInvoice} onChange={e => setPurchaseInvoice(e.target.value)} /></div>
                </div>

                {!editingPurchase && purchaseLines.map((line, index) => (
                  <div key={index} className="form-grid-2" style={{ alignItems: 'end' }}>
                    <div className="form-group"><label className="form-label">Producto</label><select className="form-select" value={line.product_id} onChange={e => updatePurchaseLine(index, 'product_id', e.target.value)}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px' }}>
                      <div className="form-group"><label className="form-label">Cantidad</label><input type="number" className="form-input" value={line.quantity} onChange={e => updatePurchaseLine(index, 'quantity', e.target.value)} /></div>
                      <div className="form-group"><label className="form-label">Costo</label><input type="number" className="form-input" value={line.unit_cost} onChange={e => updatePurchaseLine(index, 'unit_cost', e.target.value)} /></div>
                      <button type="button" onClick={() => removePurchaseLine(index)} className="btn-secondary" style={{ height: '40px' }}>-</button>
                    </div>
                  </div>
                ))}

                {!editingPurchase && <button type="button" onClick={addPurchaseLine} className="btn-secondary"><Plus size={15} /> Agregar línea</button>}

                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Impuesto</label><input type="number" className="form-input" value={purchaseTax} onChange={e => setPurchaseTax(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Abono/Pagado</label><input type="number" className="form-input" value={purchasePaidAmount} onChange={e => setPurchasePaidAmount(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Notas</label><textarea className="form-input" rows={3} value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} /></div>
                <button type="button" onClick={handleCreateOrUpdatePurchase} disabled={savingPurchase} className="btn-primary"><Plus size={15} /> {savingPurchase ? 'Guardando...' : editingPurchase ? 'Actualizar compra' : 'Registrar compra'}</button>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="dashboard-panel glass">
              <div className="panel-header"><h3 className="panel-title">Compras y Cuentas por Pagar</h3></div>
              {purchases.length === 0 ? <div className="empty-state-sm">Aún no hay compras registradas.</div> : (
                <div className="top-products-list">
                  {purchases.slice(0, 10).map(purchase => (
                    <div key={purchase.id} className="top-product-item">
                      <span className="top-rank"><ShoppingBag size={14} /></span>
                      <div className="top-product-info">
                        <p className="top-product-name">{purchase.invoice_number || 'Sin factura'} {purchase.status === 'cancelled' ? '(Anulada)' : ''}</p>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Saldo: ${Number(purchase.balance_due || 0).toLocaleString('es-CO')}</div>
                      </div>
                      <div className="top-product-stats">
                        <span className="top-revenue">${Number(purchase.total).toLocaleString('es-CO')}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {purchase.status === 'posted' && <button type="button" className="btn-secondary" onClick={() => handleEditPurchase(purchase)}><Pencil size={13} /></button>}
                          {purchase.status === 'posted' && <button type="button" className="btn-secondary" onClick={() => handleCancelPurchase(purchase)}><RotateCcw size={13} /></button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-panel glass">
              <div className="panel-header"><h3 className="panel-title">Movimientos Manuales y Devolución</h3></div>
              <div className="pos-form">
                <div className="form-group"><label className="form-label">Producto</label><select className="form-select" value={selectedProductId} onChange={e => { setSelectedProductId(e.target.value); loadKardex(e.target.value); }}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="form-grid-2">
                  <div className="form-group"><label className="form-label">Tipo</label><select className="form-select" value={manualMovementType} onChange={e => setManualMovementType(e.target.value)}><option value="adjustment_in">Ajuste entrada</option><option value="adjustment_out">Ajuste salida</option><option value="waste">Merma</option></select></div>
                  <div className="form-group"><label className="form-label">Cantidad</label><input type="number" className="form-input" value={manualQty} onChange={e => setManualQty(e.target.value)} /></div>
                </div>
                <div className="form-group"><label className="form-label">Costo unitario</label><input type="number" className="form-input" value={manualCost} onChange={e => setManualCost(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Notas</label><textarea className="form-input" rows={2} value={manualNotes} onChange={e => setManualNotes(e.target.value)} /></div>
                <button type="button" onClick={handleManualMovement} disabled={savingMovement} className="btn-primary"><History size={15} /> Registrar movimiento</button>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '8px' }}>
                  <div className="form-grid-2">
                    <div className="form-group"><label className="form-label">Proveedor devolución</label><select className="form-select" value={returnSupplierId} onChange={e => setReturnSupplierId(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                    <div className="form-group"><label className="form-label">Cantidad</label><input type="number" className="form-input" value={returnQty} onChange={e => setReturnQty(e.target.value)} /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Costo devolución</label><input type="number" className="form-input" value={returnCost} onChange={e => setReturnCost(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Notas devolución</label><textarea className="form-input" rows={2} value={returnNotes} onChange={e => setReturnNotes(e.target.value)} /></div>
                  <button type="button" onClick={handleSupplierReturn} disabled={savingMovement} className="btn-secondary"><RotateCcw size={15} /> Devolver a proveedor</button>
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-panel glass">
            <div className="panel-header"><h3 className="panel-title">Kardex del Producto</h3></div>
            {kardex.length === 0 ? <div className="empty-state-sm">No hay movimientos para este producto.</div> : (
              <div className="top-products-list">
                {kardex.slice(0, 12).map(item => (
                  <div key={item.id} className="top-product-item">
                    <span className="top-rank"><History size={14} /></span>
                    <div className="top-product-info"><p className="top-product-name">{item.movement_type}</p><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Antes: {item.previous_stock} | Después: {item.new_stock}</div></div>
                    <div className="top-product-stats"><span className="top-qty">{item.quantity > 0 ? '+' : ''}{item.quantity}</span><span className="top-revenue">{new Date(item.created_at).toLocaleDateString('es-CO')}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
