import React, { useState, useEffect } from 'react';
import {
  BarChart2, Search, ChevronDown, ChevronRight,
  Wifi, WifiOff, Clock, CheckCircle, RefreshCw,
  Banknote, CreditCard, ArrowLeftRight, Trash2, ExternalLink
} from 'lucide-react';
import { db } from '../db/pos-db';
import { useConfirm } from '../components/Toast';
import { CustomSelect } from '../components/CustomSelect';
import { salesApi } from '../api/client';
import type { SelectOption } from '../components/CustomSelect';
import type { LocalSale } from '../types';

interface SalesViewProps {
  token: string | null;
  isOnline: boolean;
}

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  cash:     <Banknote size={13} />,
  card:     <CreditCard size={13} />,
  transfer: <ArrowLeftRight size={13} />,
};
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia'
};

const PAYMENT_FILTER_OPTIONS: SelectOption<string>[] = [
  { value: 'all',      label: 'Todos los métodos' },
  { value: 'cash',     label: 'Efectivo',      icon: <Banknote size={14} /> },
  { value: 'card',     label: 'Tarjeta',       icon: <CreditCard size={14} /> },
  { value: 'transfer', label: 'Transferencia', icon: <ArrowLeftRight size={14} /> }
];

const SYNC_FILTER_OPTIONS: SelectOption<string>[] = [
  { value: 'all',     label: 'Todo el estado' },
  { value: 'pending', label: 'Pendiente sync', icon: <Clock size={14} /> },
  { value: 'synced',  label: 'Sincronizado',   icon: <CheckCircle size={14} /> }
];

export function SalesView({ token, isOnline }: SalesViewProps) {
  const { confirm } = useConfirm();
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterSync, setFilterSync] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Antes esta vista solo leía el IndexedDB local del navegador y nunca
  // consultaba al servidor (salesApi.list nunca se llamaba). En un negocio con
  // más de una caja, cada dispositivo mostraba un historial de ventas
  // incompleto y distinto al de los demás, y si se borraba la caché del
  // navegador "desaparecían" ventas de la vista aunque siguieran en el
  // servidor. Ver hallazgo 5.1 del plan de mejora.
  //
  // Ahora, con conexión, el servidor es la fuente de verdad (incluye ventas
  // hechas en cualquier caja del negocio, ya con el sale_number y los montos
  // definitivos que asigna el backend). Las ventas que siguen pendientes de
  // sincronizar desde ESTE dispositivo (guardadas solo en IndexedDB mientras
  // se hicieron offline) se agregan encima para no perderlas de vista mientras
  // esperan a sincronizarse.
  const loadSales = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const localSales = await db.sales.orderBy('created_at').reverse().toArray();

      if (isOnline && token) {
        try {
          const serverSales = await salesApi.list(token);
          const serverIds = new Set(serverSales.map(s => s.id));
          const pendingLocalOnly = localSales.filter(
            s => s.sync_status === 'pending' && !serverIds.has(s.id)
          );
          const merged: LocalSale[] = [
            ...pendingLocalOnly,
            ...serverSales.map(s => ({
              id: s.id,
              sale_number: s.sale_number,
              // El backend serializa los Decimal como string en JSON. Si se
              // dejan como string, la suma de totales los CONCATENA en vez de
              // sumarlos ("$010000.0010000.00...") y el formato por fila no
              // aplica separadores de miles. Se coercionan a número aquí.
              subtotal: Number(s.subtotal),
              tax: Number(s.tax),
              total: Number(s.total),
              payment_method: s.payment_method,
              created_at: s.created_at,
              sync_status: 'synced' as const,
              meta_data: s.meta_data,
              details: (s.details || []).map(d => ({
                ...d,
                price: Number((d as any).price),
                total: Number((d as any).total),
                quantity: Number((d as any).quantity),
              })),
            })),
          ];
          merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setSales(merged);
          return;
        } catch (err: any) {
          // Si falla la consulta al servidor (token vencido, error de red
          // puntual, etc.) se cae de vuelta a lo que haya en IndexedDB en vez
          // de dejar la pantalla vacía, y se avisa que los datos pueden estar
          // incompletos.
          setLoadError('No se pudo obtener el historial completo del servidor. Mostrando solo lo guardado en este dispositivo.');
        }
      }

      setSales(localSales);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSales(); }, [isOnline, token]);

  const filtered = sales.filter(s => {
    const matchSearch = !search || s.sale_number.toLowerCase().includes(search.toLowerCase());
    const matchPayment = filterPayment === 'all' || s.payment_method === filterPayment;
    const matchSync = filterSync === 'all' || s.sync_status === filterSync;
    return matchSearch && matchPayment && matchSync;
  });

  // Summary of filtered
  // Number(...) defensivo: garantiza suma numérica aunque alguna venta venga de
  // IndexedDB con los montos guardados como string.
  const totalRevenue = filtered.reduce((s, sale) => s + Number(sale.total), 0);
  const totalTax = filtered.reduce((s, sale) => s + Number(sale.tax), 0);
  const pendingCount = filtered.filter(s => s.sync_status === 'pending').length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const handleDeletePendingSale = async (sale: LocalSale) => {
    if (sale.sync_status !== 'pending') return;
    const ok = await confirm({ title: 'Eliminar venta pendiente', message: `¿Eliminar ${sale.sale_number}? Esta acción solo borra el registro local.`, confirmText: 'Eliminar', variant: 'warning' });
    if (!ok) return;
    await db.sales.delete(sale.id);
    await loadSales();
  };

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <BarChart2 size={24} className="view-title-icon" />
            Historial de Ventas
          </h1>
          <p className="view-subtitle">{filtered.length} ventas • Total: ${totalRevenue.toLocaleString('es-CO')}</p>
        </div>
        <button onClick={loadSales} className="btn-secondary">
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {!isOnline && (
        <div className="banner-warning" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', fontSize: '13px' }}>
          Sin conexión: mostrando solo las ventas guardadas en este dispositivo. Puede haber ventas de otras cajas que aún no ves aquí.
        </div>
      )}
      {loadError && (
        <div className="banner-warning" style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', fontSize: '13px' }}>
          {loadError}
        </div>
      )}

      {/* Summary Cards */}
      <div className="stats-row">
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(99,102,241,0.15)' }}>
            <BarChart2 size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <p className="stat-value">{filtered.length}</p>
            <p className="stat-label">Ventas mostradas</p>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(16,185,129,0.15)' }}>
            <Banknote size={20} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <p className="stat-value">${totalRevenue.toLocaleString('es-CO')}</p>
            <p className="stat-label">Ingresos totales</p>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(6,182,212,0.15)' }}>
            <CheckCircle size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="stat-value">${totalTax.toLocaleString('es-CO')}</p>
            <p className="stat-label">IVA recaudado</p>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-icon-wrap" style={{ background: 'rgba(245,158,11,0.15)' }}>
            <Clock size={20} style={{ color: 'var(--warning)' }} />
          </div>
          <div>
            <p className="stat-value">{pendingCount}</p>
            <p className="stat-label">Sin sincronizar</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-row">
        <div className="search-box" style={{ flex: 1, maxWidth: 300 }}>
          <Search className="search-icon" />
          <input
            className="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por N° de venta..."
          />
        </div>
        <CustomSelect
          options={PAYMENT_FILTER_OPTIONS}
          value={filterPayment}
          onChange={val => setFilterPayment(val)}
          style={{ width: '200px' }}
        />
        <CustomSelect
          options={SYNC_FILTER_OPTIONS}
          value={filterSync}
          onChange={val => setFilterSync(val)}
          style={{ width: '200px' }}
        />
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="loading-state">
          <RefreshCw size={32} className="spin" style={{ color: 'var(--primary)' }} />
          <p>Cargando ventas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state-large glass">
          <BarChart2 size={52} className="empty-icon" />
          <h3>Sin ventas registradas</h3>
          <p>Las ventas realizadas en el punto de venta aparecerán aquí.</p>
        </div>
      ) : (
        <div className="sales-list">
          {filtered.map(sale => (
            <div key={sale.id} className="sale-card glass">
              {/* Sale Header */}
              <div
                className="sale-card-header"
                onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}
              >
                <div className="sale-main-info">
                  <span className="sale-number">{sale.sale_number}</span>
                  <span className="sale-date">{formatDate(sale.created_at)}</span>
                </div>
                <div className="sale-right-info">
                  <span className={`payment-pill ${sale.payment_method}`}>
                    {PAYMENT_ICONS[sale.payment_method]}
                    {PAYMENT_LABELS[sale.payment_method] || sale.payment_method}
                  </span>
                  {sale.meta_data?.requires_electronic_invoice && (
                    <span className="payment-pill card">
                      FE
                    </span>
                  )}
                  <span className={`sync-pill ${sale.sync_status}`}>
                    {sale.sync_status === 'synced'
                      ? <><Wifi size={12} /> Sincronizado</>
                      : <><WifiOff size={12} /> Pendiente</>}
                  </span>
                  {sale.sync_status === 'pending' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleDeletePendingSale(sale); }}
                      className="btn-secondary"
                      style={{ padding: '6px 10px' }}
                      title="Eliminar venta pendiente local"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <span className="sale-total">${sale.total.toLocaleString('es-CO')}</span>
                  {expandedId === sale.id
                    ? <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />}
                </div>
              </div>

              {/* Sale Detail (expandable) */}
              {expandedId === sale.id && (
                <div className="sale-detail animate-fade">
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cant.</th>
                        <th>P. Unit.</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.details.map((d, i) => (
                        <tr key={i}>
                          <td>{d.name}</td>
                          <td>{d.quantity}</td>
                          <td>${d.price.toLocaleString('es-CO')}</td>
                          <td>${d.total.toLocaleString('es-CO')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="sale-subtotals">
                    <span>Subtotal: ${sale.subtotal.toLocaleString('es-CO')}</span>
                    <span>IVA (19%): ${sale.tax.toLocaleString('es-CO')}</span>
                    <strong>Total: ${sale.total.toLocaleString('es-CO')}</strong>
                  </div>
                  {sale.sync_error && (
                    <div style={{ marginTop: '10px', color: 'var(--warning)', fontSize: '12px' }}>
                      Error de sync: {sale.sync_error}
                    </div>
                  )}
                  {sale.meta_data?.requires_electronic_invoice && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                      <div><strong>Estado FE:</strong> {sale.meta_data?.factus_status || sale.meta_data?.dian_status || 'Pendiente'}</div>
                      {sale.meta_data?.dian_is_simulated && (
                        <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger, #ef4444)', fontWeight: 600 }}>
                          ⚠ No transmitido a la DIAN: este documento se generó localmente y NO es una factura electrónica válida. {sale.meta_data?.dian_warning || 'Configura Factus en Configuración para emitir facturación electrónica real.'}
                        </div>
                      )}
                      {sale.meta_data?.factus_bill_number && <div><strong>Número FE:</strong> {sale.meta_data.factus_bill_number}</div>}
                      {sale.meta_data?.cufe && <div style={{ wordBreak: 'break-all' }}><strong>CUFE:</strong> {sale.meta_data.cufe}</div>}
                      {sale.meta_data?.qr_url && (
                        <a href={sale.meta_data.qr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <ExternalLink size={13} /> Ver QR DIAN
                        </a>
                      )}
                      {sale.meta_data?.factus_public_url && (
                        <a href={sale.meta_data.factus_public_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <ExternalLink size={13} /> Abrir factura en Factus
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
