import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart, Package, BarChart2, Settings, LayoutDashboard, Truck,
  QrCode, Wifi, WifiOff, RefreshCw, LogOut, ChevronRight, Sun, Moon, Shield, MoreHorizontal, X
} from 'lucide-react';
import { getBusinessTypeLabel } from './BusinessTypeSelect';
import type { View, AuthUser } from '../types';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  user: AuthUser | null;
  isOnline: boolean;
  pendingSync: number;
  isSyncing: boolean;
  onSync: () => void;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

interface NavItem {
  view: View;
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  badge?: number;
}

// En móvil la barra inferior solo muestra estas vistas; el resto va en la hoja "Más"
const MOBILE_PRIMARY: View[] = ['pos', 'inventory', 'sales', 'dashboard'];

export function Sidebar({
  currentView, onNavigate, user, isOnline, pendingSync, isSyncing, onSync, onLogout, theme, onToggleTheme
}: SidebarProps) {
  const navItems: NavItem[] = [
    { view: 'pos',       icon: <ShoppingCart size={20} />,    label: 'Punto de Venta', shortLabel: 'Vender' },
    { view: 'inventory', icon: <Package size={20} />,         label: 'Inventario'     },
    { view: 'supplies',  icon: <Truck size={20} />,           label: 'Compras'        },
    { view: 'sales',     icon: <BarChart2 size={20} />,       label: 'Ventas',        badge: pendingSync || undefined },
    { view: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard',     shortLabel: 'Panel' },
    { view: 'settings',  icon: <Settings size={20} />,        label: 'Configuración'  },
  ];

  const filteredNavItems = user?.role === 'cashier'
    ? navItems.filter(item => item.view === 'pos' || item.view === 'sales')
    : navItems;

  const superAdminItems: NavItem[] = user?.is_superadmin
    ? [{ view: 'superadmin', icon: <Shield size={20} />, label: 'Administración POS' }]
    : [];

  const [moreOpen, setMoreOpen] = useState(false);
  const secondaryItems = [...filteredNavItems.filter(i => !MOBILE_PRIMARY.includes(i.view)), ...superAdminItems];
  const moreActive = secondaryItems.some(i => i.view === currentView);
  const roleLabel = user?.is_superadmin ? 'Super Admin' : user?.role === 'admin' ? 'Administrador' : 'Cajero';

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const goFromSheet = (view: View) => { setMoreOpen(false); onNavigate(view); };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        {user?.meta_data?.logo_url ? (
          <div className="logo-badge-sm" style={{ background: 'rgba(255,255,255,0.95)', overflow: 'hidden' }}>
            <img src={user.meta_data.logo_url} alt={user.meta_data.display_name || user.business_name} style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 6 }} />
          </div>
        ) : (
          <div className="logo-badge-sm" style={user?.meta_data?.brand_color ? { background: user.meta_data.brand_color } : undefined}>
            <QrCode size={18} />
          </div>
        )}
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">{user?.meta_data?.display_name || user?.business_name || 'Mi Negocio'}</span>
          <span className="sidebar-brand-sub">{getBusinessTypeLabel(user?.business_type || '') || 'Negocio'}</span>
          <span className="sidebar-brand-meta">Hecho con V1TR0</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Navegación principal">
        {filteredNavItems.map(item => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`sidebar-nav-item ${currentView === item.view ? 'active' : ''} ${MOBILE_PRIMARY.includes(item.view) ? '' : 'nav-secondary'}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.shortLabel && <span className="nav-label-short">{item.shortLabel}</span>}
            {item.badge && item.badge > 0 && (
              <span className="nav-badge">{item.badge}</span>
            )}
            {currentView === item.view && <ChevronRight size={14} className="nav-arrow" />}
          </button>
        ))}
        {superAdminItems.length > 0 && (
          <>
            <div className="nav-secondary" style={{ height: '1px', background: 'var(--border)', margin: '8px 12px', opacity: 0.5 }} />
            {superAdminItems.map(item => (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                className={`sidebar-nav-item nav-secondary ${currentView === item.view ? 'active' : ''}`}
                style={{ color: currentView === item.view ? undefined : '#a78bfa' }}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {currentView === item.view && <ChevronRight size={14} className="nav-arrow" />}
              </button>
            ))}
          </>
        )}

        {/* Solo móvil: abre la hoja con el resto de vistas y los controles del footer */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`sidebar-nav-item nav-more ${moreActive ? 'active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <span className="nav-icon"><MoreHorizontal size={20} /></span>
          <span className="nav-label-short">Más</span>
        </button>
      </nav>

      {/* Bottom Status */}
      <div className="sidebar-footer">
        {/* Sync Status */}
        <button
          onClick={onSync}
          disabled={isSyncing || pendingSync === 0 || !isOnline}
          className={`sidebar-sync-btn ${pendingSync > 0 ? 'has-pending' : ''}`}
          title={pendingSync > 0 ? `${pendingSync} venta(s) pendiente(s)` : 'Todo sincronizado'}
        >
          <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'Sincronizando...' : pendingSync > 0 ? `Sync (${pendingSync})` : 'Al día'}</span>
        </button>

        {/* Online/Offline */}
        <div className={`sidebar-status ${isOnline ? 'online' : 'offline'}`}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{isOnline ? 'En línea' : 'Sin conexión'}</span>
        </div>

        <button
          onClick={onToggleTheme}
          className="sidebar-sync-btn"
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
        </button>

        {/* User + Logout */}
        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <span className="sidebar-user-avatar">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </span>
            <div>
              <p className="sidebar-user-email">{user?.email}</p>
              <p className="sidebar-user-role">{roleLabel}</p>
            </div>
          </div>
          <button onClick={onLogout} className="sidebar-logout" title="Cerrar sesión">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Hoja "Más" (móvil). Portal: el backdrop-filter del sidebar rompería position:fixed */}
      {moreOpen && createPortal(
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet more-sheet" role="dialog" aria-modal="true" aria-label="Más opciones" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <div className="more-sheet-user">
              <span className="sidebar-user-avatar more-sheet-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</span>
              <div className="more-sheet-user-info">
                <p className="more-sheet-name">{user?.meta_data?.display_name || user?.business_name || 'Mi Negocio'}</p>
                <p className="more-sheet-email">{user?.email} · {roleLabel}</p>
              </div>
              <button type="button" className="sheet-close" onClick={() => setMoreOpen(false)} aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            <div className="more-sheet-status">
              <div className={`sidebar-status ${isOnline ? 'online' : 'offline'}`}>
                {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span>{isOnline ? 'En línea' : 'Sin conexión'}</span>
              </div>
              <button
                type="button"
                onClick={onSync}
                disabled={isSyncing || pendingSync === 0 || !isOnline}
                className={`sidebar-sync-btn ${pendingSync > 0 ? 'has-pending' : ''}`}
              >
                <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
                <span>{isSyncing ? 'Sincronizando...' : pendingSync > 0 ? `Sincronizar (${pendingSync})` : 'Todo al día'}</span>
              </button>
            </div>

            <div className="more-sheet-list">
              {secondaryItems.map(item => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => goFromSheet(item.view)}
                  className={`more-sheet-row ${currentView === item.view ? 'active' : ''}`}
                >
                  <span className="more-sheet-icon">{item.icon}</span>
                  <span className="more-sheet-label">{item.label}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
              <button type="button" onClick={onToggleTheme} className="more-sheet-row">
                <span className="more-sheet-icon">{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</span>
                <span className="more-sheet-label">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
              </button>
              <button type="button" onClick={() => { setMoreOpen(false); onLogout(); }} className="more-sheet-row danger">
                <span className="more-sheet-icon"><LogOut size={20} /></span>
                <span className="more-sheet-label">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}
