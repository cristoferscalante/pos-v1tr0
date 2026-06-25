import React, { useState, useEffect } from 'react';
import {
   LayoutDashboard, TrendingUp, ShoppingCart, Package,
   AlertTriangle, RefreshCw, Wifi, Wallet, LockKeyhole
} from 'lucide-react';
import { cashApi, dashboardApi } from '../api/client';
import type { DashboardSummary, ChartDataPoint, TopProduct, CashSessionResponse } from '../types';
import { useToast } from '../components/Toast';

interface DashboardViewProps {
  token: string | null;
  isOnline: boolean;
}

// ========================
// MINI BAR CHART SVG (no external lib)
// ========================
function BarChart({ data }: { data: ChartDataPoint[] }) {
  if (!data.length) return null;
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
  const chartH = 120;

  return (
    <div className="chart-wrapper">
      <div className="chart-bars">
        {data.map((point, i) => {
          const barH = (point.revenue / maxRevenue) * chartH;
          const isEmpty = point.revenue === 0;
          return (
            <div key={i} className="chart-bar-col">
              <div className="chart-bar-container" style={{ height: chartH }}>
                <div
                  className={`chart-bar ${isEmpty ? 'empty' : ''}`}
                  style={{ height: Math.max(barH, isEmpty ? 4 : 8) }}
                  title={`${point.label}: $${point.revenue.toLocaleString('es-CO')} • ${point.count} venta(s)`}
                />
              </div>
              <span className="chart-bar-label">{point.label}</span>
            </div>
          );
        })}
      </div>
      <div className="chart-legend">
        <span>Últimos {data.length} días — Ingresos diarios</span>
        <span className="chart-max">Máx: ${maxRevenue.toLocaleString('es-CO')}</span>
      </div>
    </div>
  );
}

// ========================
// DASHBOARD VIEW
// ========================
export function DashboardView({ token, isOnline }: DashboardViewProps) {
  const { success, error } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDays, setChartDays] = useState(7);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cashSession, setCashSession] = useState<CashSessionResponse | null>(null);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [closingAmount, setClosingAmount] = useState('0');
  const [cashNotes, setCashNotes] = useState('');
  const [cashActionLoading, setCashActionLoading] = useState(false);

  const load = async () => {
    if (!token || !isOnline) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, c, t] = await Promise.all([
        dashboardApi.summary(token),
        dashboardApi.chart(token, chartDays),
        dashboardApi.topProducts(token, 5),
      ]);
      const currentCashSession = await cashApi.current(token);
      setSummary(s);
      setChartData(c);
      setTopProducts(t);
      setCashSession(currentCashSession);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, isOnline, chartDays]);

  useEffect(() => {
    if (cashSession?.expected_amount !== undefined) {
      setClosingAmount(String(cashSession.expected_amount));
    }
  }, [cashSession?.expected_amount]);

  const handleOpenCashSession = async () => {
    if (!token) return;
    setCashActionLoading(true);
    try {
      await cashApi.open(token, { opening_amount: Number(openingAmount || 0), notes: cashNotes || undefined });
      success('Caja abierta correctamente');
      setCashNotes('');
      await load();
    } catch (err: any) {
      error(err.message || 'No se pudo abrir la caja');
    } finally {
      setCashActionLoading(false);
    }
  };

  const handleCloseCashSession = async () => {
    if (!token || !cashSession?.session?.id) return;
    setCashActionLoading(true);
    try {
      await cashApi.close(token, cashSession.session.id, {
        actual_closing_amount: Number(closingAmount || 0),
        notes: cashNotes || undefined,
      });
      success('Caja cerrada correctamente');
      setCashNotes('');
      await load();
    } catch (err: any) {
      error(err.message || 'No se pudo cerrar la caja');
    } finally {
      setCashActionLoading(false);
    }
  };

  const maxRevenue = Math.max(...(topProducts.map(p => p.revenue)), 1);

  if (!isOnline) {
    return (
      <div className="view-container">
        <div className="view-header">
          <h1 className="view-title"><LayoutDashboard size={24} className="view-title-icon" />Dashboard</h1>
        </div>
        <div className="offline-notice glass">
          <Wifi size={40} style={{ opacity: 0.4 }} />
          <h3>Sin conexión</h3>
          <p>El dashboard requiere conexión al servidor para mostrar métricas actualizadas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container">
      {/* Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <LayoutDashboard size={24} className="view-title-icon" />
            Dashboard
          </h1>
          {lastUpdated && (
            <p className="view-subtitle">
              Actualizado: {lastUpdated.toLocaleTimeString('es-CO')}
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary">
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <RefreshCw size={36} className="spin" style={{ color: 'var(--primary)' }} />
          <p>Cargando métricas...</p>
        </div>
      ) : !summary ? (
        <div className="empty-state-large glass">
          <LayoutDashboard size={48} className="empty-icon" />
          <h3>No hay datos disponibles</h3>
          <p>Realiza ventas para ver las métricas del negocio aquí.</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card glass" style={{ '--kpi-color': 'var(--primary)' } as React.CSSProperties}>
              <div className="kpi-icon-wrap">
                <ShoppingCart size={22} />
              </div>
              <div className="kpi-content">
                <p className="kpi-value">{summary.counts.today}</p>
                <p className="kpi-label">Ventas hoy</p>
                <p className="kpi-sub">Semana: {summary.counts.week} • Mes: {summary.counts.month}</p>
              </div>
            </div>

            <div className="kpi-card glass" style={{ '--kpi-color': 'var(--success)' } as React.CSSProperties}>
              <div className="kpi-icon-wrap">
                <TrendingUp size={22} />
              </div>
              <div className="kpi-content">
                <p className="kpi-value">${summary.revenue.today.toLocaleString('es-CO')}</p>
                <p className="kpi-label">Ingresos hoy</p>
                <p className="kpi-sub">Semana: ${summary.revenue.week.toLocaleString('es-CO')}</p>
              </div>
            </div>

            <div className="kpi-card glass" style={{ '--kpi-color': '#10b981' } as React.CSSProperties}>
              <div className="kpi-icon-wrap">
                <TrendingUp size={22} />
              </div>
              <div className="kpi-content">
                <p className="kpi-value">${summary.profit.today.toLocaleString('es-CO')}</p>
                <p className="kpi-label">Ganancia hoy</p>
                <p className="kpi-sub">
                  Semana: ${summary.profit.week.toLocaleString('es-CO')} • Margen: {summary.revenue.month > 0 ? ((summary.profit.month / summary.revenue.month) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>

            <div className="kpi-card glass" style={{ '--kpi-color': 'var(--accent)' } as React.CSSProperties}>
              <div className="kpi-icon-wrap">
                <TrendingUp size={22} />
              </div>
              <div className="kpi-content">
                <p className="kpi-value">${summary.avg_ticket.toLocaleString('es-CO')}</p>
                <p className="kpi-label">Ticket promedio</p>
                <p className="kpi-sub">Mes: ${summary.revenue.month.toLocaleString('es-CO')}</p>
              </div>
            </div>

            <div className="kpi-card glass" style={{ '--kpi-color': summary.low_stock_count > 0 ? 'var(--warning)' : 'var(--success)' } as React.CSSProperties}>
              <div className="kpi-icon-wrap">
                <Package size={22} />
              </div>
              <div className="kpi-content">
                <p className="kpi-value">{summary.low_stock_count}</p>
                <p className="kpi-label">Stock bajo</p>
                <p className="kpi-sub">Productos con &lt;5 unidades</p>
              </div>
            </div>
          </div>

          {/* Chart + Top Products */}
          <div className="dashboard-grid">
            <div className="dashboard-panel glass">
              <div className="panel-header">
                <h3 className="panel-title">Caja</h3>
              </div>

              {cashSession?.session ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div className="stat-card glass" style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                        <Wallet size={16} />
                        <span style={{ fontSize: '12px' }}>Base</span>
                      </div>
                      <p className="stat-value" style={{ fontSize: '18px' }}>${Number(cashSession.session.opening_amount || 0).toLocaleString('es-CO')}</p>
                    </div>
                    <div className="stat-card glass" style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
                        <TrendingUp size={16} />
                        <span style={{ fontSize: '12px' }}>Ventas</span>
                      </div>
                      <p className="stat-value" style={{ fontSize: '18px' }}>${Number(cashSession.sales_total || 0).toLocaleString('es-CO')}</p>
                    </div>
                    <div className="stat-card glass" style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
                        <LockKeyhole size={16} />
                        <span style={{ fontSize: '12px' }}>Esperado</span>
                      </div>
                      <p className="stat-value" style={{ fontSize: '18px' }}>${Number(cashSession.expected_amount || 0).toLocaleString('es-CO')}</p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Monto de cierre declarado</label>
                    <input type="number" className="form-input" value={closingAmount} onChange={e => setClosingAmount(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notas de caja</label>
                    <textarea className="form-input" rows={3} value={cashNotes} onChange={e => setCashNotes(e.target.value)} />
                  </div>
                  <button onClick={handleCloseCashSession} disabled={cashActionLoading} className="btn-primary">
                    <LockKeyhole size={15} />
                    {cashActionLoading ? 'Cerrando...' : 'Cerrar caja'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>No hay caja abierta. Abre una antes de iniciar ventas supervisadas.</p>
                  <div className="form-group">
                    <label className="form-label">Monto inicial</label>
                    <input type="number" className="form-input" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notas</label>
                    <textarea className="form-input" rows={3} value={cashNotes} onChange={e => setCashNotes(e.target.value)} />
                  </div>
                  <button onClick={handleOpenCashSession} disabled={cashActionLoading} className="btn-primary">
                    <Wallet size={15} />
                    {cashActionLoading ? 'Abriendo...' : 'Abrir caja'}
                  </button>
                </div>
              )}
            </div>

            {/* Bar Chart */}
            <div className="dashboard-panel glass">
              <div className="panel-header">
                <h3 className="panel-title">Ventas por día</h3>
                <div className="chart-period-btns">
                  {[7, 14, 30].map(d => (
                    <button
                      key={d}
                      onClick={() => setChartDays(d)}
                      className={`period-btn ${chartDays === d ? 'active' : ''}`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <BarChart data={chartData} />
            </div>

            {/* Top Products */}
            <div className="dashboard-panel glass">
              <div className="panel-header">
                <h3 className="panel-title">Top Productos del Mes</h3>
              </div>
              {topProducts.length === 0 ? (
                <div className="empty-state-sm">Sin ventas este mes</div>
              ) : (
                <div className="top-products-list">
                  {topProducts.map((p, i) => {
                    const pct = (p.revenue / maxRevenue) * 100;
                    return (
                      <div key={p.product_id} className="top-product-item">
                        <span className="top-rank">#{i + 1}</span>
                        <div className="top-product-info">
                          <p className="top-product-name">{p.name}</p>
                          <div className="top-bar-bg">
                            <div className="top-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="top-product-stats">
                          <span className="top-qty">{p.quantity_sold} uds</span>
                          <span className="top-revenue">${p.revenue.toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Low Stock Alert */}
          {summary.low_stock_count > 0 && (
            <div className="alert-panel glass">
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <div>
                <p className="alert-title">Productos con stock bajo</p>
                <div className="low-stock-chips">
                  {summary.low_stock_products.map(p => (
                    <span key={p.id} className="low-stock-chip">
                      {p.name} <strong>({p.stock})</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Payment Breakdown */}
          {Object.keys(summary.payment_breakdown).length > 0 && (
            <div className="payment-breakdown-panel glass">
              <h3 className="panel-title" style={{ marginBottom: 12 }}>Métodos de Pago (Mes)</h3>
              <div className="breakdown-items">
                {Object.entries(summary.payment_breakdown).map(([method, count]) => {
                  const labels: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
                  const total = Object.values(summary.payment_breakdown).reduce((a, b) => a + b, 0);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={method} className="breakdown-item">
                      <span className="breakdown-label">{labels[method] || method}</span>
                      <div className="breakdown-bar-bg">
                        <div className="breakdown-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="breakdown-value">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
