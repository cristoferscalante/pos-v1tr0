import React from 'react';
import {
  ShoppingCart, Package, BarChart2, Settings, LayoutDashboard, Truck,
  QrCode, Wifi, WifiOff, RefreshCw, LogOut, ChevronRight, Sun, Moon
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
  badge?: number;
}

export function Sidebar({
  currentView, onNavigate, user, isOnline, pendingSync, isSyncing, onSync, onLogout, theme, onToggleTheme
}: SidebarProps) {
  const navItems: NavItem[] = [
    { view: 'pos',       icon: <ShoppingCart size={20} />,    label: 'Punto de Venta' },
    { view: 'inventory', icon: <Package size={20} />,         label: 'Inventario'     },
    { view: 'supplies',  icon: <Truck size={20} />,           label: 'Compras'        },
    { view: 'sales',     icon: <BarChart2 size={20} />,       label: 'Ventas',        badge: pendingSync || undefined },
    { view: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard'      },
    { view: 'settings',  icon: <Settings size={20} />,        label: 'Configuración'  },
  ];

  const filteredNavItems = user?.role === 'cashier'
    ? navItems.filter(item => item.view === 'pos' || item.view === 'sales')
    : navItems;

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
      <nav className="sidebar-nav">
        {filteredNavItems.map(item => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`sidebar-nav-item ${currentView === item.view ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="nav-badge">{item.badge}</span>
            )}
            {currentView === item.view && <ChevronRight size={14} className="nav-arrow" />}
          </button>
        ))}
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
              <p className="sidebar-user-role">{user?.role === 'admin' ? 'Administrador' : 'Cajero'}</p>
            </div>
          </div>
          <button onClick={onLogout} className="sidebar-logout" title="Cerrar sesión">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
