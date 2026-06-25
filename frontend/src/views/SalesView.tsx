import React, { useState, useEffect } from 'react';
import {
  BarChart2, Search, ChevronDown, ChevronRight,
  Wifi, WifiOff, Clock, CheckCircle, RefreshCw,
  Banknote, CreditCard, ArrowLeftRight
} from 'lucide-react';
import { db } from '../db/pos-db';
import { CustomSelect } from '../components/CustomSelect';
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

export function SalesView({ token: _token, isOnline: _isOnline }: SalesViewProps) {
  const [sales, setSales] = useState<LocalSale[]>([]);
  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [filterSync, setFilterSync] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSales = async () => {
    setLoading(true);
    const allSales = await db.sales.orderBy('created_at').reverse().toArray();
    setSales(allSales);
    setLoading(false);
  };

  useEffect(() => { loadSales(); }, []);

  const filtered = sales.filter(s => {
    const matchSearch = !search || s.sale_number.toLowerCase().includes(search.toLowerCase());
    const matchPayment = filterPayment === 'all' || s.payment_method === filterPayment;
    const matchSync = filterSync === 'all' || s.sync_status === filterSync;
    return matchSearch && matchPayment && matchSync;
  });

  // Summary of filtered
  const totalRevenue = filtered.reduce((s, sale) => s + sale.total, 0);
  const totalTax = filtered.reduce((s, sale) => s + sale.tax, 0);
  const pendingCount = filtered.filter(s => s.sync_status === 'pending').length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
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
                  <span className={`sync-pill ${sale.sync_status}`}>
                    {sale.sync_status === 'synced'
                      ? <><Wifi size={12} /> Sincronizado</>
                      : <><WifiOff size={12} /> Pendiente</>}
                  </span>
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
