import React, { useRef, useState, useEffect, useCallback } from 'react';
import { QrCode } from 'lucide-react';
import { db, requestPersistentStorage } from './db/pos-db';
import { authApi, salesApi } from './api/client';
import { ToastProvider, useToast } from './components/Toast';
import { Sidebar } from './components/Sidebar';
import { BusinessTypeSelect } from './components/BusinessTypeSelect';
import { POSView } from './views/POSView';
import { InventoryView } from './views/InventoryView';
import { SuppliesView } from './views/SuppliesView';
import { SalesView } from './views/SalesView';
import { DashboardView } from './views/DashboardView';
import { SettingsView } from './views/SettingsView';
import { PublicCatalogView } from './views/PublicCatalogView';
import type { AuthUser, LocalProduct, View, BusinessType } from './types';

const LEGACY_DEMO_PRODUCT_HINTS = [
  'vacuna parvovirus',
  'collar antipulgas',
  'desparasitante canino',
  'shampoo medicado',
  'alimento premium perros',
  'vac-05',
  'coll-02',
  'med-01',
  'sham-01',
  'alim-01',
  'veterinaria',
];

// ========================
// INNER APP (needs Toast context)
// ========================
function AppInner() {
  const { success, error: showError, info } = useToast();

  // Detectar catálogo público según la ruta
  const path = window.location.pathname.substring(1);
  const isPublicCatalog = path && path !== 'login' && path !== 'register';

  // --- Auth State ---
  const [token, setToken] = useState<string | null>(localStorage.getItem('pos_token'));
  const [user, setUser] = useState<AuthUser | null>(
    JSON.parse(localStorage.getItem('pos_user') || 'null')
  );

  // --- Auth Form State ---
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('veterinaria');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset_token') || '');
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  // --- App State ---
  const [view, setView] = useState<View>('pos');
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncErrorSignatureRef = useRef<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('pos_theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pos_theme', theme);
  }, [theme]);

  // ---- Load local products ----
  const loadProducts = useCallback(async () => {
    const local = await db.products.toArray();
    setProducts(local);
  }, []);

  const checkPending = useCallback(async () => {
    const count = await db.sales.where('sync_status').equals('pending').count();
    setPendingSync(count);
  }, []);

  // ---- Pull products from server ----
  const pullProducts = useCallback(async (authToken: string) => {
    try {
      const { productsApi } = await import('./api/client');
      const serverProducts = await productsApi.list(authToken);

      if (serverProducts.length === 0) {
        const localProducts = await db.products.toArray();
        const demoProductIds = new Set(
          localProducts
            .filter((product) => {
              const name = product.name.toLowerCase();
              const sku = (product.sku || '').toLowerCase();
              const category = (product.category || '').toLowerCase();
              const tipo = String(product.meta_data?.tipo || '').toLowerCase();
              return LEGACY_DEMO_PRODUCT_HINTS.some((hint) => name.includes(hint) || sku.includes(hint) || category.includes(hint) || tipo.includes(hint));
            })
            .map((product) => product.id)
        );

        const productIdsToDelete = demoProductIds.size > 0 ? Array.from(demoProductIds) : localProducts.map((product) => product.id);
        if (productIdsToDelete.length > 0) {
          await db.products.bulkDelete(productIdsToDelete);

          const localSales = await db.sales.toArray();
          const saleIdsToDelete = localSales
            .filter((sale) => sale.details.some((detail) => productIdsToDelete.includes(detail.product_id)))
            .map((sale) => sale.id);

          if (saleIdsToDelete.length > 0) {
            await db.sales.bulkDelete(saleIdsToDelete);
          }

          await checkPending();
          await loadProducts();
        }
        return;
      }

      for (const p of serverProducts) {
        await db.products.put(p as LocalProduct);
      }
      loadProducts();
    } catch { /* offline OK */ }
  }, [loadProducts, checkPending]);

  // ---- Sync pending sales ----
  const syncSales = useCallback(async () => {
    if (!isOnline || !token || isSyncing) return;
    const pending = await db.sales.where('sync_status').equals('pending').toArray();
    if (pending.length === 0) {
      setPendingSync(0);
      return;
    }

    setIsSyncing(true);
    try {
      const result = await salesApi.syncOffline(token, pending);
      for (const id of result.synced_ids) {
        const sale = await db.sales.get(String(id));
        if (sale) {
          sale.sync_status = 'synced';
          sale.sync_error = undefined;
          await db.sales.put(sale);
        }
      }

      for (const syncError of result.errors || []) {
        const failedSale = await db.sales.get(String(syncError.sale_id));
        if (failedSale) {
          failedSale.sync_status = 'pending';
          failedSale.sync_error = syncError.error || 'Error de sincronización';
          await db.sales.put(failedSale);
        }
      }

      if (result.synced_ids.length > 0) {
        success(`${result.synced_ids.length} venta(s) sincronizadas ✓`);
        lastSyncErrorSignatureRef.current = null;
      }
      if ((result.errors || []).length > 0) {
        const errorSignature = JSON.stringify(
          (result.errors || []).map((item) => `${item.sale_id}:${item.error}`)
        );
        if (lastSyncErrorSignatureRef.current !== errorSignature) {
          lastSyncErrorSignatureRef.current = errorSignature;
          showError(`Hay ${(result.errors || []).length} venta(s) con error de sincronización. Revisa el historial.`);
        }
      }
      await checkPending();
    } catch {
      if (lastSyncErrorSignatureRef.current !== 'generic-sync-error') {
        lastSyncErrorSignatureRef.current = 'generic-sync-error';
        showError('Error de sincronización. Se reintentará automáticamente.');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, token, isSyncing, success, showError, checkPending]);

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  // ---- Network events ----
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (token) {
        void pullProducts(token);
      }
      void syncSales();
    };
    const onOffline = () => { setIsOnline(false); info('Sin conexión — ventas guardadas localmente'); };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [syncSales, info, token, pullProducts]);

  useEffect(() => {
    if (!token || !isOnline) return;

    const intervalId = window.setInterval(() => {
      void syncSales();
    }, 15000);

    const syncOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pullProducts(token);
        void syncSales();
      }
    };

    window.addEventListener('focus', syncOnVisibility);
    document.addEventListener('visibilitychange', syncOnVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncOnVisibility);
      document.removeEventListener('visibilitychange', syncOnVisibility);
    };
  }, [token, isOnline, syncSales, pullProducts]);

  // ---- Init ----
  useEffect(() => {
    void loadProducts();
    void checkPending();
    if (token && isOnline) {
      void pullProducts(token);
      void syncSales();
    }
  }, [token, isOnline, loadProducts, checkPending, pullProducts, syncSales]);

  // ---- Auth Handlers ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const data = await authApi.login(loginEmail, loginPassword);
      localStorage.setItem('pos_token', data.access_token);
      localStorage.setItem('pos_user', JSON.stringify(data.user));
      setToken(data.access_token);
      setUser(data.user);
      success(`Bienvenido, ${data.user.business_name}`);
    } catch (e: any) {
      showError(e.message || 'Credenciales incorrectas');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName) { showError('Ingresa el nombre del negocio'); return; }
    setIsSubmitting(true);
    try {
      const data = await authApi.register({
        business_name: businessName,
        business_type: businessType,
        email: loginEmail,
        password: loginPassword,
      });
      localStorage.setItem('pos_token', data.access_token);
      localStorage.setItem('pos_user', JSON.stringify(data.user));
      setToken(data.access_token);
      setUser(data.user);
      success(`¡Negocio "${businessName}" registrado con éxito!`);
    } catch (e: any) {
      showError(e.message || 'Error al registrar el negocio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) { showError('Ingresa tu correo'); return; }
    setIsSubmitting(true);
    try {
      const response = await authApi.forgotPassword(loginEmail);
      success(response.message);
      setIsForgotPasswordMode(false);
    } catch (e: any) {
      showError(e.message || 'No se pudo procesar la solicitud');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !resetPasswordValue) { showError('Completa la información de recuperación'); return; }
    setIsSubmitting(true);
    try {
      const response = await authApi.resetPassword(resetToken, resetPasswordValue);
      success(response.message);
      setResetPasswordValue('');
      setResetToken('');
      const url = new URL(window.location.href);
      url.searchParams.delete('reset_token');
      window.history.replaceState({}, '', url.toString());
    } catch (e: any) {
      showError(e.message || 'No se pudo restablecer la contraseña');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Cashier View Restrictions ----
  useEffect(() => {
    if (user?.role === 'cashier' && !['pos', 'sales'].includes(view)) {
      setView('pos');
    }
  }, [view, user]);

  const handleLogout = () => {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    setToken(null);
    setUser(null);
    setProducts([]);
    info('Sesión cerrada');
  };

  const handleToggleTheme = () => {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  };

  // ========================
  // PUBLIC CATALOG VIEW
  // ========================
  if (isPublicCatalog) {
    return <PublicCatalogView slug={path} />;
  }

  // ========================
  // LOGIN / REGISTER SCREEN
  // ========================
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-bg-glow" />
        <div className="auth-card glass animate-fade">
          {/* Logo */}
          <div className="auth-logo">
            <div className="logo-badge">
              <QrCode size={28} />
            </div>
            <div>
              <h1 className="auth-brand">V1TR0 POS</h1>
              <p className="auth-tagline">Sistema de Punto de Venta Multi-Negocio</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="auth-tabs">
            <button onClick={() => { setIsRegisterMode(false); setIsForgotPasswordMode(false); }} className={`auth-tab ${!isRegisterMode && !isForgotPasswordMode ? 'active' : ''}`}>
              Iniciar Sesión
            </button>
            <button onClick={() => { setIsRegisterMode(true); setIsForgotPasswordMode(false); }} className={`auth-tab ${isRegisterMode ? 'active' : ''}`}>
              Registrar Negocio
            </button>
          </div>

          {resetToken ? (
            <form onSubmit={handleResetPassword} className="auth-form">
              <div className="form-group">
                <label className="form-label">Token de recuperación</label>
                <input
                  type="text" required value={resetToken}
                  onChange={e => setResetToken(e.target.value)}
                  className="form-input" placeholder="Token recibido por correo"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva contraseña</label>
                <input
                  type="password" required value={resetPasswordValue}
                  onChange={e => setResetPasswordValue(e.target.value)}
                  className="form-input" placeholder="Mínimo 8 caracteres"
                  minLength={8}
                />
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-primary w-full auth-submit">
                {isSubmitting ? 'Actualizando...' : 'Restablecer contraseña'}
              </button>
            </form>
          ) : (
          <form onSubmit={isForgotPasswordMode ? handleForgotPassword : (isRegisterMode ? handleRegister : handleLogin)} className="auth-form">
            {isRegisterMode && (
              <>
                <div className="form-group">
                  <label className="form-label">Nombre del Negocio *</label>
                  <input
                    type="text" required value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    className="form-input" placeholder="Ej. Veterinaria Huellitas"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de Negocio</label>
                  <BusinessTypeSelect value={businessType} onChange={setBusinessType} />
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">Correo Electrónico</label>
              <input
                type="email" required value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="form-input" placeholder="correo@negocio.com"
              />
            </div>
            {!isForgotPasswordMode && (
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                type="password" required value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="form-input" placeholder="••••••••"
                minLength={isRegisterMode ? 8 : undefined}
              />
            </div>
            )}
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full auth-submit">
              {isSubmitting
                ? (isForgotPasswordMode ? 'Enviando...' : isRegisterMode ? 'Registrando...' : 'Ingresando...')
                : (isForgotPasswordMode ? 'Enviar correo de recuperación' : isRegisterMode ? 'Crear Cuenta y Comenzar' : 'Ingresar al Sistema')
              }
            </button>
            {!isRegisterMode && (
              <button
                type="button"
                onClick={() => setIsForgotPasswordMode(prev => !prev)}
                className="btn-secondary w-full"
                style={{ marginTop: '10px' }}
              >
                {isForgotPasswordMode ? 'Volver al login' : 'Olvidé mi contraseña'}
              </button>
            )}
          </form>
          )}

          <p className="auth-disclaimer">
            Sistema POS offline-first — tus ventas siempre seguras
          </p>
        </div>
      </div>
    );
  }

  // ========================
  // MAIN APP LAYOUT
  // ========================
  return (
    <div className="app-layout">
      <Sidebar
        currentView={view}
        onNavigate={setView}
        user={user}
        isOnline={isOnline}
        pendingSync={pendingSync}
        isSyncing={isSyncing}
        onSync={syncSales}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
      <main className="app-main">
        {view === 'pos' && (
          <POSView
            products={products}
            token={token}
            isOnline={isOnline}
            onSaleComplete={() => { loadProducts(); checkPending(); }}
          />
        )}
        {view === 'inventory' && (
          <InventoryView
            products={products}
            token={token}
            isOnline={isOnline}
            onProductsChange={loadProducts}
            user={user}
          />
        )}
        {view === 'supplies' && (
          <SuppliesView
            token={token}
            isOnline={isOnline}
            onProductsChange={loadProducts}
          />
        )}
        {view === 'sales' && (
          <SalesView token={token} isOnline={isOnline} />
        )}
        {view === 'dashboard' && (
          <DashboardView token={token} isOnline={isOnline} />
        )}
        {view === 'settings' && (
          <SettingsView 
            user={user} 
            token={token} 
            onUserUpdate={(updatedUser: AuthUser) => {
              setUser(updatedUser);
              localStorage.setItem('pos_user', JSON.stringify(updatedUser));
            }} 
          />
        )}
      </main>
    </div>
  );
}

// ========================
// ROOT EXPORT (wrapped in providers)
// ========================
export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
