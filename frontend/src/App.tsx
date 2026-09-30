import { useRef, useState, useEffect, useCallback } from 'react';
import { db, requestPersistentStorage } from './db/pos-db';
import { authApi, salesApi, mediaApi, setUnauthorizedHandler } from './api/client';
import { ToastProvider, useToast } from './components/Toast';
import { Sidebar } from './components/Sidebar';
import { POSView } from './views/POSView';
import { InventoryView } from './views/InventoryView';
import { SuppliesView } from './views/SuppliesView';
import { SalesView } from './views/SalesView';
import { DashboardView } from './views/DashboardView';
import { SettingsView } from './views/SettingsView';
import { SuperAdminView } from './views/SuperAdminView';
import { PublicCatalogView } from './views/PublicCatalogView';
import type { AuthResponse, AuthUser, LocalProduct, View } from './types';
import { LandingView } from './views/LandingView';
import { AuthView } from './views/AuthView';
import { PlanExpiredScreen, PlanReminder, isPlanExpired } from './components/PlanGate';
import { getProductCategory } from './utils/productCategories';
import { normalizeProduct } from './utils/pricing';
import { dataUrlToBlob } from './utils/imageUpload';

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

function shouldDropInvalidPendingSale(errorMessage: string | undefined): boolean {
  if (!errorMessage) return false;
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes('saledetail_product_id_fkey') ||
    normalized.includes('foreignkeyviolation') ||
    normalized.includes('key (product_id)=') && normalized.includes('is not present in table "product"')
  );
}

// ========================
// INNER APP (needs Toast context)
// ========================
function AppInner() {
  const { success, error: showError, info } = useToast();

  // Detectar catálogo público según la ruta
  const path = window.location.pathname.substring(1).replace(/\/+$/, '');
  const isAuthPath = path === 'login' || path === 'register' || path === 'registro';
  const isPublicCatalog = path !== '' && !isAuthPath;
  const hasResetToken = new URLSearchParams(window.location.search).has('reset_token');

  // --- Auth State ---
  const [token, setToken] = useState<string | null>(localStorage.getItem('pos_token'));
  const [user, setUser] = useState<AuthUser | null>(
    JSON.parse(localStorage.getItem('pos_user') || 'null')
  );

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
    const brandColor = user?.meta_data?.brand_color;
    if (brandColor) {
      document.documentElement.style.setProperty('--primary', brandColor);
    } else {
      document.documentElement.style.removeProperty('--primary');
    }
  }, [theme, user?.meta_data?.brand_color]);

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
        // Nunca borramos productos que aún no se sincronizaron con el servidor:
        // un producto recién creado sin conexión (sync_status 'pending') todavía
        // no aparece en la lista del servidor y lo perderíamos sin remedio.
        const deletableProducts = localProducts.filter((product) => product.sync_status !== 'pending');
        const demoProductIds = new Set(
          deletableProducts
            .filter((product) => {
              const name = product.name.toLowerCase();
              const sku = (product.sku || '').toLowerCase();
              const category = getProductCategory(product).toLowerCase();
              return LEGACY_DEMO_PRODUCT_HINTS.some((hint) => name.includes(hint) || sku.includes(hint) || category.includes(hint));
            })
            .map((product) => product.id)
        );

        const productIdsToDelete = demoProductIds.size > 0 ? Array.from(demoProductIds) : deletableProducts.map((product) => product.id);
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
        await db.products.put(normalizeProduct(p as LocalProduct));
      }
      loadProducts();
    } catch { /* offline OK */ }
  }, [loadProducts, checkPending]);

  // ---- Sync pending sales ----
  const syncProducts = useCallback(async () => {
    if (!isOnline || !token) return;

    const pendingProducts = (await db.products.toArray()).filter((product) => product.sync_status === 'pending');
    if (pendingProducts.length === 0) return;

    for (const product of pendingProducts) {
      try {
        // Foto tomada sin conexión: se guardó comprimida como data URL; ahora se
        // sube como archivo para no cargar la base de datos con base64.
        let image = product.image;
        if (image?.startsWith('data:')) {
          try {
            image = await mediaApi.uploadProductImage(token, await dataUrlToBlob(image));
          } catch { /* se reintenta en la próxima sincronización */ }
        }
        const created = await (await import('./api/client')).productsApi.create(token, {
          id: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          price: product.price,
          wholesale_price: product.wholesale_price,
          cost: product.cost,
          stock: product.stock,
          category: product.category,
          image,
          tax_rate: product.tax_rate,
          meta_data: product.meta_data,
        } as any);
        await db.products.put({ ...normalizeProduct(created as LocalProduct), sync_status: 'synced', sync_error: undefined });
      } catch (error: any) {
        product.sync_error = error?.message || 'Producto pendiente de sincronización';
        await db.products.put(product);
      }
    }

    await loadProducts();
  }, [isOnline, token, loadProducts]);

  const syncSales = useCallback(async () => {
    if (!isOnline || !token || isSyncing) return;
    await syncProducts();
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
          const syncErrorMessage = syncError.error || 'Error de sincronización';
          if (shouldDropInvalidPendingSale(syncErrorMessage)) {
            await db.sales.delete(failedSale.id);
            continue;
          }
          failedSale.sync_status = 'pending';
          failedSale.sync_error = syncErrorMessage;
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
  }, [isOnline, token, isSyncing, success, showError, checkPending, syncProducts]);

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

  // ---- Guardar cambios del usuario (persisten en localStorage) ----
  const handleUserUpdate = useCallback((updatedUser: AuthUser) => {
    setUser(updatedUser);
    localStorage.setItem('pos_user', JSON.stringify(updatedUser));
  }, []);

  // ---- Hidratar meta del negocio al abrir la app ----
  // El /login solo trae lo básico y el pos_user de localStorage puede quedar
  // viejo (categorías creadas en otro equipo o antes de este cambio). Traemos
  // las categorías del negocio desde el servidor y las mezclamos.
  useEffect(() => {
    if (!token || !isOnline) return;
    let cancelled = false;
    (async () => {
      try {
        const tenant = await authApi.getTenant(token);
        if (cancelled) return;
        const categories = Array.isArray(tenant?.meta_data?.product_categories)
          ? tenant.meta_data.product_categories
          : null;
        if (!categories) return;
        setUser(prev => {
          if (!prev) return prev;
          const prevCategories = prev.meta_data?.product_categories || [];
          if (JSON.stringify(prevCategories) === JSON.stringify(categories)) return prev;
          const next = { ...prev, meta_data: { ...(prev.meta_data || {}), product_categories: categories } };
          localStorage.setItem('pos_user', JSON.stringify(next));
          return next;
        });
      } catch { /* sin permisos de admin u offline: se ignora */ }
    })();
    return () => { cancelled = true; };
  }, [token, isOnline]);

  // ---- Sesión iniciada desde AuthView (login o registro) ----
  const handleAuthenticated = (data: AuthResponse, welcome: string) => {
    localStorage.setItem('pos_token', data.access_token);
    localStorage.setItem('pos_user', JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
    window.history.replaceState({}, '', '/');
    success(welcome);
  };

  // ---- Estado del plan (prueba de 7 días / plan pago activado por el superadmin) ----
  const [checkingPlan, setCheckingPlan] = useState(false);
  const refreshSubscription = useCallback(async (manual = false) => {
    const currentToken = localStorage.getItem('pos_token');
    if (!currentToken || !navigator.onLine) return;
    if (manual) setCheckingPlan(true);
    try {
      const sub = await authApi.getSubscription(currentToken);
      setUser(prev => {
        if (!prev) return prev;
        const next = { ...prev, ...sub };
        localStorage.setItem('pos_user', JSON.stringify(next));
        return next;
      });
      if (manual) {
        if (sub.subscription_active) success('¡Tu plan está activo! Gracias por confiar en V1TR0 POS');
        else info('Todavía no vemos tu plan activo. Si ya pagaste, escríbenos por WhatsApp.');
      }
    } catch { /* sin conexión: se usa el último estado guardado */ }
    finally { if (manual) setCheckingPlan(false); }
  }, [success, info]);

  useEffect(() => {
    if (!token) return;
    // Si llegó con sesión a /login o /registro, se va a la app
    if (isAuthPath) window.history.replaceState({}, '', '/');
    refreshSubscription();
    const id = window.setInterval(() => refreshSubscription(), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [token, isOnline, refreshSubscription, isAuthPath]);

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

  // Auto-logout cuando el backend responde 401 en una petición autenticada
  // (token de 24h expirado, o usuario/negocio desactivado). Ver hallazgo 5.5.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!localStorage.getItem('pos_token')) return; // ya deslogueado, evita loops
      localStorage.removeItem('pos_token');
      localStorage.removeItem('pos_user');
      setToken(null);
      setUser(null);
      setProducts([]);
      showError('Tu sesión expiró. Vuelve a iniciar sesión.');
    });
    return () => setUnauthorizedHandler(null);
  }, [showError]);

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
  // LANDING / INGRESO
  // ========================
  if (!token) {
    if (path === '' && !hasResetToken) return <LandingView />;
    return (
      <AuthView
        initialMode={path === 'registro' || path === 'register' ? 'register' : 'login'}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // ========================
  // PLAN VENCIDO: "Compra tu plan"
  // ========================
  if (isPlanExpired(user)) {
    return (
      <PlanExpiredScreen
        user={user!}
        checking={checkingPlan}
        onRefresh={() => refreshSubscription(true)}
        onLogout={handleLogout}
      />
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
        <PlanReminder user={user} />
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
            onUserUpdate={handleUserUpdate}
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
            onUserUpdate={handleUserUpdate}
          />
        )}
        {view === 'superadmin' && user?.is_superadmin && (
          <SuperAdminView token={token} />
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
