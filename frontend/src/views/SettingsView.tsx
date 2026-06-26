import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Settings, Save, KeyRound, Building2, Info, Shield, 
  Crown, User, Printer, Trash2, Users, Globe, MessageSquare, Plus, ExternalLink, Mail, Send, ReceiptText, RefreshCw
} from 'lucide-react';
import { API_URL, authApi, einvoiceApi } from '../api/client';
import { useToast } from '../components/Toast';
import { getBusinessTypeIcon, getBusinessTypeLabel } from '../components/BusinessTypeSelect';
import type { AuthUser, FactusConnectionResult, FactusNumberingRangesResult, NotificationLog, NotificationRule } from '../types';
import { fileToDataUrl } from '../utils/imageUpload';
import '../styles/branding-upload.css';

interface SettingsViewProps {
  user: AuthUser | null;
  token: string | null;
  onUserUpdate?: (updatedUser: AuthUser) => void;
}

export function SettingsView({ user, token, onUserUpdate }: SettingsViewProps) {
  const { success, error, warning } = useToast();
  
  // Password change state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  
  // Peripherals state
  const [isTestPrinting, setIsTestPrinting] = useState(false);

  // Tenant / Catalog config state
  const [tenantSlug, setTenantSlug] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#6366f1');
  const [savingTenant, setSavingTenant] = useState(false);

  // Collaborators management state
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [collabEmail, setCollabEmail] = useState('');
  const [collabPassword, setCollabPassword] = useState('');
  const [creatingCollab, setCreatingCollab] = useState(false);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [factusEnvironment, setFactusEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [factusClientId, setFactusClientId] = useState('');
  const [factusClientSecret, setFactusClientSecret] = useState('');
  const [factusUsername, setFactusUsername] = useState('');
  const [factusPassword, setFactusPassword] = useState('');
  const [factusTesting, setFactusTesting] = useState(false);
  const [factusLoadingRanges, setFactusLoadingRanges] = useState(false);
  const [factusConnectionResult, setFactusConnectionResult] = useState<FactusConnectionResult | null>(null);
  const [factusRangesResult, setFactusRangesResult] = useState<FactusNumberingRangesResult | null>(null);
  const [electronicInvoicingEnabled, setElectronicInvoicingEnabled] = useState(false);
  const [savingElectronicInvoicing, setSavingElectronicInvoicing] = useState(false);

  // Load tenant details and collaborators if admin
  useEffect(() => {
    if (user?.role === 'admin' && token) {
      // Load Tenant info
      authApi.getTenant(token)
        .then(data => {
          setTenantSlug(data.slug || '');
          setWhatsappNumber(data.meta_data?.whatsapp_number || '');
          setDisplayName(data.meta_data?.display_name || data.name || '');
          setLogoUrl(data.meta_data?.logo_url || '');
          setBannerUrl(data.meta_data?.banner_url || '');
          setBrandColor(data.meta_data?.brand_color || '#6366f1');
          setElectronicInvoicingEnabled(Boolean(data.meta_data?.electronic_invoicing_enabled));
          setFactusEnvironment(data.meta_data?.electronic_invoicing_environment === 'production' ? 'production' : 'sandbox');
          setFactusClientId(data.meta_data?.factus_client_id || '');
          setFactusClientSecret(data.meta_data?.factus_client_secret || '');
          setFactusUsername(data.meta_data?.factus_username || '');
          setFactusPassword(data.meta_data?.factus_password || '');
        })
        .catch(() => {
          error('Error al cargar la configuración del negocio');
        });

      // Load collaborators list
      setLoadingCollaborators(true);
      authApi.listCollaborators(token)
        .then(data => {
          setCollaborators(data);
        })
        .catch(() => {
          error('Error al cargar la lista de colaboradores');
        })
        .finally(() => {
          setLoadingCollaborators(false);
        });

      setLoadingNotifications(true);
      authApi.listNotificationRules(token)
        .then(data => {
          setNotificationRules(data);
          setTestEmail(data.find(rule => rule.recipients?.length)?.recipients?.[0] || user?.email || '');
        })
        .catch(() => {
          error('Error al cargar la configuración de correos');
        })
        .finally(() => {
          setLoadingNotifications(false);
        });

      authApi.listNotificationLogs(token)
        .then(data => {
          setNotificationLogs(data);
        })
        .catch(() => {
          error('Error al cargar la bitácora de correos');
        });
    }
  }, [user, token]);

  const handleTestPrint = () => {
    setIsTestPrinting(true);
    success('Preparando ticket de prueba...');
    setTimeout(() => {
      window.print();
      setIsTestPrinting(false);
    }, 250);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPwd || !newPwd) { warning('Completa todos los campos'); return; }
    if (newPwd !== confirmPwd) { warning('Las contraseñas nuevas no coinciden'); return; }
    if (newPwd.length < 8) { warning('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    setSavingPwd(true);
    try {
      if (!token) return;
      await authApi.changePassword(token, { current_password: currentPwd, new_password: newPwd });
      success('Contraseña actualizada correctamente');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      error(err.message || 'Error al cambiar la contraseña');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleNotificationToggle = async (rule: NotificationRule, enabled: boolean) => {
    if (!token) return;
    try {
      const updated = await authApi.updateNotificationRule(token, rule.id, {
        enabled,
        recipients: rule.recipients || []
      });
      setNotificationRules(prev => prev.map(item => item.id === rule.id ? updated : item));
      success('Regla de notificación actualizada');
    } catch (err: any) {
      error(err.message || 'No se pudo actualizar la regla');
    }
  };

  const handleNotificationRecipients = async (rule: NotificationRule, recipientsRaw: string) => {
    if (!token) return;
    const recipients = recipientsRaw.split(',').map(item => item.trim()).filter(Boolean);
    try {
      const updated = await authApi.updateNotificationRule(token, rule.id, {
        enabled: rule.enabled,
        recipients,
      });
      setNotificationRules(prev => prev.map(item => item.id === rule.id ? updated : item));
      success('Destinatarios actualizados');
    } catch (err: any) {
      error(err.message || 'No se pudieron actualizar los destinatarios');
    }
  };

  const handleSendTestEmail = async () => {
    if (!token || !testEmail) {
      warning('Ingresa un correo de prueba');
      return;
    }
    setSendingTestEmail(true);
    try {
      await authApi.testNotificationEmail(token, testEmail);
      success('Correo de prueba enviado');
    } catch (err: any) {
      error(err.message || 'No se pudo enviar el correo de prueba');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const getFactusCredentialsPayload = () => ({
    environment: factusEnvironment,
    client_id: factusClientId.trim(),
    client_secret: factusClientSecret.trim(),
    username: factusUsername.trim(),
    password: factusPassword,
  });

  const ensureFactusCredentials = () => {
    const payload = getFactusCredentialsPayload();
    if (!token) return null;
    if (!payload.client_id || !payload.client_secret || !payload.username || !payload.password) {
      warning('Completa las credenciales de Factus antes de probar la conexión');
      return null;
    }
    return payload;
  };

  const handleFactusTestConnection = async () => {
    const payload = ensureFactusCredentials();
    if (!payload || !token) return;
    setFactusTesting(true);
    try {
      const result = await einvoiceApi.factusTestConnection(token, payload);
      setFactusConnectionResult(result);
      success('Conexión con Factus validada correctamente');
    } catch (err: any) {
      setFactusConnectionResult(null);
      error(err.message || 'No se pudo validar la conexión con Factus');
    } finally {
      setFactusTesting(false);
    }
  };

  const handleFactusLoadRanges = async () => {
    const payload = ensureFactusCredentials();
    if (!payload || !token) return;
    setFactusLoadingRanges(true);
    try {
      const result = await einvoiceApi.factusNumberingRanges(token, payload);
      setFactusRangesResult(result);
      success('Rangos de numeración consultados correctamente');
    } catch (err: any) {
      setFactusRangesResult(null);
      error(err.message || 'No se pudieron consultar los rangos en Factus');
    } finally {
      setFactusLoadingRanges(false);
    }
  };

  const handleElectronicInvoicingSave = async () => {
    if (!token) return;
    if (electronicInvoicingEnabled && (!factusClientId.trim() || !factusClientSecret.trim() || !factusUsername.trim() || !factusPassword)) {
      warning('Para habilitar facturación electrónica debes completar primero las credenciales de Factus');
      return;
    }

    setSavingElectronicInvoicing(true);
    try {
      const data = await authApi.updateTenant(token, {
        electronic_invoicing_enabled: electronicInvoicingEnabled,
        electronic_invoicing_provider: 'factus',
        electronic_invoicing_environment: factusEnvironment,
        factus_client_id: factusClientId,
        factus_client_secret: factusClientSecret,
        factus_username: factusUsername,
        factus_password: factusPassword,
      });
      success(electronicInvoicingEnabled ? 'Facturación electrónica habilitada para este cliente' : 'Facturación electrónica deshabilitada para este cliente');
      if (user && onUserUpdate) {
        onUserUpdate({
          ...user,
          slug: data.slug,
          business_name: data.name,
          meta_data: data.meta_data,
        });
      }
    } catch (err: any) {
      error(err.message || 'No se pudo guardar la configuración de facturación electrónica');
    } finally {
      setSavingElectronicInvoicing(false);
    }
  };

  const EVENT_LABELS: Record<string, string> = {
    sale_created: 'Venta registrada',
    cash_opened: 'Apertura de caja',
    cash_closed: 'Cierre de caja',
    low_stock_alert: 'Stock bajo',
    daily_summary: 'Resumen diario',
  };

  const handleTenantUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingTenant(true);
    try {
      const data = await authApi.updateTenant(token, {
        slug: tenantSlug,
        whatsapp_number: whatsappNumber,
        display_name: displayName,
        logo_url: logoUrl,
        banner_url: bannerUrl,
        brand_color: brandColor,
      });
      success('Configuración del catálogo actualizada correctamente');
      if (user && onUserUpdate) {
        onUserUpdate({
          ...user,
          slug: data.slug,
          business_name: data.name,
          meta_data: data.meta_data,
        });
      }
    } catch (err: any) {
      error(err.message || 'Error al actualizar la configuración');
    } finally {
      setSavingTenant(false);
    }
  };

  const handleBrandImageChange = async (
    file: File | undefined,
    setter: React.Dispatch<React.SetStateAction<string>>,
    label: string,
  ) => {
    if (!file) return;
    try {
      setter(await fileToDataUrl(file));
    } catch (err: any) {
      error(err.message || `No se pudo cargar el ${label}`);
    }
  };

  const handleCreateCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!collabEmail || !collabPassword) {
      warning('Ingresa correo y contraseña para el colaborador');
      return;
    }
    setCreatingCollab(true);
    try {
      const newCollab = await authApi.createCollaborator(token, {
        email: collabEmail,
        password: collabPassword
      });
      success(`Colaborador ${newCollab.email} creado correctamente`);
      setCollabEmail('');
      setCollabPassword('');
      // Reload collaborators
      const list = await authApi.listCollaborators(token);
      setCollaborators(list);
    } catch (err: any) {
      error(err.message || 'Error al crear el colaborador');
    } finally {
      setCreatingCollab(false);
    }
  };

  const handleDeleteCollaborator = async (userId: string, email: string) => {
    if (!token) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar al colaborador ${email}?`)) return;
    try {
      await authApi.deleteCollaborator(token, userId);
      success('Colaborador eliminado correctamente');
      // Reload collaborators
      const list = await authApi.listCollaborators(token);
      setCollaborators(list);
    } catch (err: any) {
      error(err.message || 'Error al eliminar el colaborador');
    }
  };

  const BUSINESS_TYPE_LABELS: Record<string, React.ReactNode> = {
    veterinaria: <span className="info-type-display">{getBusinessTypeIcon(user?.business_type || '', 14)} {getBusinessTypeLabel(user?.business_type || '')}</span>,
    restaurante: <span className="info-type-display">{getBusinessTypeIcon('restaurante', 14)} Restaurante</span>,
    tienda:      <span className="info-type-display">{getBusinessTypeIcon('tienda', 14)} Tienda / Papelería</span>,
    farmacia:    <span className="info-type-display">{getBusinessTypeIcon('farmacia', 14)} Farmacia</span>,
    otro:        <span className="info-type-display">{getBusinessTypeIcon('otro', 14)} Otro</span>,
  };

  const catalogUrl = `${window.location.origin}/${tenantSlug || user?.slug || ''}`;

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">
            <Settings size={24} className="view-title-icon" />
            Configuración
          </h1>
          <p className="view-subtitle">Gestiona tu negocio y cuenta de usuario</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Business Info */}
        <div className="settings-card glass">
          <div className="settings-card-header">
            <Building2 size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="settings-card-title">Información del Negocio</h2>
          </div>
          <div className="settings-info-grid">
            <div className="info-item">
              <span className="info-label">Nombre del negocio</span>
              <span className="info-value">{user?.business_name || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Tipo de negocio</span>
              <span className="info-value">
                {BUSINESS_TYPE_LABELS[user?.business_type || ''] ||
                  <span className="info-type-display">{getBusinessTypeIcon(user?.business_type || 'otro', 14)} {getBusinessTypeLabel(user?.business_type || '')}</span>
                }
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">ID del Tenant</span>
              <span className="info-value mono">{user?.tenant_id?.slice(0, 8)}...</span>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="settings-card glass">
          <div className="settings-card-header">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="settings-card-title">Cuenta de Usuario</h2>
          </div>
          <div className="settings-info-grid">
            <div className="info-item">
              <span className="info-label">Correo electrónico</span>
              <span className="info-value">{user?.email || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Rol</span>
              <span className="info-value info-role">
                {user?.role === 'admin'
                  ? <><Crown size={14} style={{ color: 'var(--warning)' }} /> Administrador</>
                  : <><User  size={14} style={{ color: 'var(--accent)'  }} /> Cajero</>}
              </span>
            </div>
          </div>
        </div>

        {/* Catalog & WhatsApp Settings (Admin Only) */}
        {user?.role === 'admin' && (
          <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
            <div className="settings-card-header">
              <Globe size={18} style={{ color: 'var(--primary)' }} />
              <h2 className="settings-card-title">Configuración del Catálogo Público</h2>
            </div>
            <form onSubmit={handleTenantUpdate} className="pos-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Tu catálogo público se encuentra activo en:</span>
                  <a 
                    href={catalogUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    {catalogUrl}
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">WhatsApp para Pedidos</label>
                <div style={{ position: 'relative' }}>
                  <MessageSquare size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={e => setWhatsappNumber(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '36px' }}
                    placeholder="Ej. +573001234567"
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Número con código de país al que los clientes enviarán sus carritos de compra.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre Comercial Visible</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="form-input"
                  placeholder="Ej. Veterinaria Huellitas"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Logo del negocio</label>
                <div className="brand-image-field">
                  <div className="brand-image-preview brand-image-preview-logo">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Vista previa del logo" className="brand-image-preview-img brand-image-preview-img-logo" />
                    ) : (
                      <div className="brand-image-placeholder">
                        <Building2 size={20} />
                        <span>Sin logo cargado</span>
                      </div>
                    )}
                  </div>
                  <div className="brand-image-actions">
                    <label className="brand-upload-button">
                      <Plus size={15} />
                      {logoUrl ? 'Cambiar archivo' : 'Seleccionar archivo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async e => {
                          await handleBrandImageChange(e.target.files?.[0], setLogoUrl, 'logo');
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {logoUrl && (
                      <button type="button" className="brand-clear-button" onClick={() => setLogoUrl('')}>
                        <Trash2 size={15} />
                        Quitar imagen
                      </button>
                    )}
                  </div>
                  <span className="brand-upload-hint">PNG, JPG o WEBP. Tamano maximo 1 MB.</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Banner del catalogo</label>
                <div className="brand-image-field">
                  <div className="brand-image-preview brand-image-preview-banner">
                    {bannerUrl ? (
                      <img src={bannerUrl} alt="Vista previa del banner" className="brand-image-preview-img brand-image-preview-img-banner" />
                    ) : (
                      <div className="brand-image-placeholder">
                        <Globe size={20} />
                        <span>Sin banner cargado</span>
                      </div>
                    )}
                  </div>
                  <div className="brand-image-actions">
                    <label className="brand-upload-button">
                      <Plus size={15} />
                      {bannerUrl ? 'Cambiar archivo' : 'Seleccionar archivo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async e => {
                          await handleBrandImageChange(e.target.files?.[0], setBannerUrl, 'banner');
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {bannerUrl && (
                      <button type="button" className="brand-clear-button" onClick={() => setBannerUrl('')}>
                        <Trash2 size={15} />
                        Quitar imagen
                      </button>
                    )}
                  </div>
                  <span className="brand-upload-hint">Usa una imagen horizontal para que se vea mejor en el catalogo publico.</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Color de Marca</label>
                <input
                  type="color"
                  value={brandColor}
                  onChange={e => setBrandColor(e.target.value)}
                  className="form-input"
                  style={{ padding: '6px', height: '44px' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Enlace Personalizado (Slug)</label>
                <div style={{ position: 'relative' }}>
                  <Globe size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={tenantSlug}
                    onChange={e => setTenantSlug(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '36px' }}
                    placeholder="nombre-de-tu-negocio"
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Sub-ruta única para tu catálogo. Ej: pos.v1tr0.com/<strong>slug</strong>
                </span>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <button type="submit" disabled={savingTenant} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
                  <Save size={15} />
                  {savingTenant ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Collaborators Management (Admin Only) */}
        {user?.role === 'admin' && (
          <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
            <div className="settings-card-header">
              <Users size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="settings-card-title">Gestión de Colaboradores y Cajeros</h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
              {/* Form to Register Collaborator */}
              <div>
                <h3 style={{ fontSize: '14px', margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Registrar Nuevo Cajero</h3>
                <form onSubmit={handleCreateCollaborator} className="pos-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Correo Electrónico</label>
                    <input
                      type="email"
                      required
                      value={collabEmail}
                      onChange={e => setCollabEmail(e.target.value)}
                      className="form-input"
                      placeholder="cajero@negocio.com"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña</label>
                    <input
                      type="password"
                      required
                      value={collabPassword}
                      onChange={e => setCollabPassword(e.target.value)}
                      className="form-input"
                      placeholder="Mínimo 8 caracteres"
                      minLength={8}
                    />
                  </div>
                  <button type="submit" disabled={creatingCollab} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={15} />
                    {creatingCollab ? 'Registrando...' : 'Registrar Colaborador'}
                  </button>
                </form>
              </div>

              {/* Collaborators List */}
              <div>
                <h3 style={{ fontSize: '14px', margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Colaboradores Registrados</h3>
                {loadingCollaborators ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando colaboradores...</p>
                ) : collaborators.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay otros colaboradores en tu negocio.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {collaborators.map((c) => (
                      <div 
                        key={c.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '12px 16px', 
                          background: 'rgba(255,255,255,0.02)', 
                          border: '1px solid var(--border)', 
                          borderRadius: '10px' 
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{c.email}</p>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Rol: {c.role === 'cashier' ? 'Cajero' : c.role}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCollaborator(c.id, c.email)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            opacity: 0.7,
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '6px'
                          }}
                          title="Eliminar colaborador"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Change Password */}
        <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
          <div className="settings-card-header">
            <KeyRound size={18} style={{ color: 'var(--warning)' }} />
            <h2 className="settings-card-title">Cambiar Contraseña</h2>
          </div>
          <form onSubmit={handlePasswordChange} className="pos-form" style={{ maxWidth: 480 }}>
            <div className="form-group">
              <label className="form-label">Contraseña actual</label>
              <input
                type="password"
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                className="form-input"
                placeholder="••••••••"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nueva contraseña</label>
              <input
                type="password"
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                className="form-input"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar nueva contraseña</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                className="form-input"
                placeholder="Repite la nueva contraseña"
              />
            </div>
            <button type="submit" disabled={savingPwd} className="btn-primary" style={{ alignSelf: 'flex-start' }}>
              <Save size={15} />
              {savingPwd ? 'Guardando...' : 'Actualizar Contraseña'}
            </button>
          </form>
        </div>

        {user?.role === 'admin' && (
          <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
            <div className="settings-card-header">
              <Mail size={18} style={{ color: 'var(--primary)' }} />
              <h2 className="settings-card-title">Correos y Notificaciones</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
                <div className="form-group">
                  <label className="form-label">Correo de prueba</label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    className="form-input"
                    placeholder="admin@negocio.com"
                  />
                </div>
                <button type="button" onClick={handleSendTestEmail} disabled={sendingTestEmail} className="btn-primary">
                  <Send size={15} />
                  {sendingTestEmail ? 'Enviando...' : 'Enviar prueba'}
                </button>
              </div>

              {loadingNotifications ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando reglas de notificación...</p>
              ) : notificationRules.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay reglas de notificación configuradas.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {notificationRules.map(rule => (
                    <div key={rule.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{EVENT_LABELS[rule.event_type] || rule.event_type}</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{rule.event_type}</p>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={e => handleNotificationToggle(rule, e.target.checked)}
                          />
                          Activa
                        </label>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Destinatarios</label>
                        <input
                          type="text"
                          defaultValue={(rule.recipients || []).join(', ')}
                          onBlur={e => handleNotificationRecipients(rule, e.target.value)}
                          className="form-input"
                          placeholder="admin@negocio.com, ventas@negocio.com"
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                          Separa varios correos con coma.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Bitácora de correos</h3>
                {notificationLogs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay envíos registrados todavía.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {notificationLogs.slice(0, 10).map(log => (
                      <div key={log.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{log.subject}</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{log.recipient} | {log.event_type}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: log.status === 'sent' ? 'var(--success)' : 'var(--warning)' }}>{log.status}</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString('es-CO')}</p>
                          </div>
                        </div>
                        {log.error_message && <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: 'var(--warning)' }}>{log.error_message}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
            <div className="settings-card-header">
              <ReceiptText size={18} style={{ color: 'var(--warning)' }} />
              <h2 className="settings-card-title">Facturación Electrónica por Empresa</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="info-note">
                <Info size={14} />
                <span>La facturación electrónica es opcional por cliente. Si no la activas, este negocio usará solo el POS sin DIAN. Si la activas, podrás probar Factus sandbox y preparar la emisión electrónica.</span>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={electronicInvoicingEnabled} onChange={e => setElectronicInvoicingEnabled(e.target.checked)} />
                Habilitar facturación electrónica para este cliente
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Proveedor</label>
                  <input className="form-input" value="Factus" disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">Ambiente</label>
                  <select className="form-select" value={factusEnvironment} onChange={e => setFactusEnvironment(e.target.value as 'sandbox' | 'production')}>
                    <option value="sandbox">Sandbox</option>
                    <option value="production">Producción</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Client ID</label>
                  <input className="form-input" value={factusClientId} onChange={e => setFactusClientId(e.target.value)} placeholder="Client ID de Factus" />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Secret</label>
                  <input className="form-input" value={factusClientSecret} onChange={e => setFactusClientSecret(e.target.value)} placeholder="Client Secret de Factus" />
                </div>
                <div className="form-group">
                  <label className="form-label">Usuario / Correo</label>
                  <input className="form-input" value={factusUsername} onChange={e => setFactusUsername(e.target.value)} placeholder="usuario@empresa.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña</label>
                  <input type="password" className="form-input" value={factusPassword} onChange={e => setFactusPassword(e.target.value)} placeholder="Contraseña Factus" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleElectronicInvoicingSave} disabled={savingElectronicInvoicing} className="btn-primary">
                  <Save size={15} />
                  {savingElectronicInvoicing ? 'Guardando...' : 'Guardar servicio FE'}
                </button>
                <button type="button" onClick={handleFactusTestConnection} disabled={factusTesting} className="btn-primary">
                  <Globe size={15} />
                  {factusTesting ? 'Validando...' : 'Probar conexión'}
                </button>
                <button type="button" onClick={handleFactusLoadRanges} disabled={factusLoadingRanges} className="btn-secondary">
                  <RefreshCw size={15} />
                  {factusLoadingRanges ? 'Consultando...' : 'Consultar rangos'}
                </button>
              </div>

              {factusConnectionResult && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'rgba(16,185,129,0.06)' }}>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--success)' }}>Conexión verificada</p>
                  <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>Ambiente: {factusConnectionResult.environment} | Token: {factusConnectionResult.token_type || 'Bearer'} | Vigencia: {factusConnectionResult.expires_in || 0}s</p>
                </div>
              )}

              {factusRangesResult && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Rangos activos reportados por Factus</h3>
                  {Array.isArray(factusRangesResult.ranges?.data?.data) && factusRangesResult.ranges.data.data.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {factusRangesResult.ranges.data.data.map((range: any) => (
                        <div key={range.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                          <p style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>{range.prefix} {range.current}</p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Resolución: {range.resolution_number} | Rango: {range.from} - {range.to}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>No se encontraron rangos activos en la respuesta.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Periféricos POS */}
        <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
          <div className="settings-card-header">
            <Printer size={18} style={{ color: 'var(--success)' }} />
            <h2 className="settings-card-title">Periféricos de Punto de Venta (POS)</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '24px'
            }}>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Impresora de Recibos (Ticketera)</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
                  El POS es compatible con cualquier impresora térmica de 58mm u 80mm. Instala la impresora en tu sistema operativo, configúrala como predeterminada o selecciónala en el diálogo de impresión.
                </p>
              </div>
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: 'var(--text-primary)' }}>Cajón Monedero</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
                  Conecta el cable <strong>RJ11</strong> del cajón directamente al puerto <strong>DK (Drawer Kick)</strong> detrás de tu impresora. En las propiedades de tu impresora en Windows, configura la opción para que abra el cajón automáticamente antes de imprimir.
                </p>
              </div>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '12px', 
              alignItems: 'center',
              borderTop: '1px solid var(--border)',
              paddingTop: '16px',
              marginTop: '8px',
              flexWrap: 'wrap'
            }}>
              <button 
                type="button"
                onClick={handleTestPrint} 
                className="btn-primary" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  height: '40px',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  color: '#10b881'
                }}
              >
                <Printer size={16} />
                Probar Impresora y Cajón
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Enviará un ticket de prueba corto. Si el cajón está configurado en el driver de tu ticketera, se abrirá de inmediato.
              </span>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
          <div className="settings-card-header">
            <Info size={18} style={{ color: 'var(--text-muted)' }} />
            <h2 className="settings-card-title">Sistema</h2>
          </div>
          <div className="settings-info-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="info-item">
              <span className="info-label">Versión</span>
              <span className="info-value">V1TR0 POS v1.0.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">Backend URL</span>
              <span className="info-value mono">{API_URL}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Modo</span>
              <span className="info-value">Offline-first PWA</span>
            </div>
          </div>
          <div className="info-note">
            <Info size={14} />
            <span>Las ventas se guardan localmente primero y se sincronizan automáticamente con el servidor cuando hay conexión disponible.</span>
          </div>
        </div>
      </div>

      {/* Test Ticket Printable Area (Rendered at root via Portal) */}
      {isTestPrinting && createPortal(
        <div id="print-ticket-area">
          <div style={{ textAlign: 'center', textTransform: 'uppercase', marginBottom: '8px' }}>
            <strong>V1TR0 POS</strong>
          </div>
          <div style={{ textAlign: 'center', fontSize: '10px', marginBottom: '10px' }}>
            *** TICKET DE PRUEBA ***<br />
            Fecha: {new Date().toLocaleString()}
          </div>
          <div style={{ borderBottom: '1px dashed black', paddingBottom: '6px', marginBottom: '6px', textAlign: 'center', fontSize: '11px' }}>
            SI ESTÁS LEYENDO ESTO,<br />
            LA IMPRESORA TÉRMICA ESTÁ OK.<br />
            <br />
            SI EL CAJÓN ESTÁ CONECTADO,<br />
            DEBERÍA HABERSE ABIERTO.
          </div>
          <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '16px', borderTop: '1px dashed black', paddingTop: '8px' }}>
            V1TR0 POS — Multi-Negocio
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
