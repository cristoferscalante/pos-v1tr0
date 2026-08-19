import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, Building2, RefreshCw, CheckCircle,
  FileText, CreditCard, Plus, Settings, Search,
  ToggleLeft, ToggleRight, Calendar, TrendingUp, Package,
  Trash2, ExternalLink, Mail, ShoppingBag, Clock, AlertCircle,
  BarChart2, UserCheck
} from 'lucide-react';
import { superadminApi } from '../api/client';
import { useToast } from '../components/Toast';
import type { Tenant } from '../types';

interface SuperAdminViewProps {
  token: string | null;
}

// ── Planes ────────────────────────────────────────────────────
const PLANES = [
  { key: 'free',     label: 'Gratis — 7 días',        color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', dias: 7,  precio: 0,      folios: 0,   incluye_facturacion: false },
  { key: 'standard', label: 'Estándar — $400.000 COP', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  dias: 30, precio: 400000, folios: 0,   incluye_facturacion: false },
  { key: 'premium',  label: 'Premium — $570.000 COP',  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dias: 30, precio: 570000, folios: 100, incluye_facturacion: true  },
];
const FOLIO_PACK_SIZE  = 100;
const FOLIO_PACK_PRICE = 170000;

// ── Helpers ───────────────────────────────────────────────────
function fmt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}
function daysLeft(iso?: string | null) {
  if (!iso) return 0;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function isExpired(iso?: string | null) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}
function cop(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}
function addDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString();
}
function timeAgo(iso?: string | null) {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return fmt(iso);
}

// ── Modal edición plan ─────────────────────────────────────────
interface EditModalProps {
  tenant: Tenant;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditPlanModal({ tenant, token, onClose, onSaved }: EditModalProps) {
  const { success, error } = useToast();
  const [planKey, setPlanKey] = useState(tenant.plan_name);
  const [hasElectronic, setHasElectronic] = useState(tenant.has_electronic_billing);
  const [foliosRemaining, setFoliosRemaining] = useState(tenant.folios_remaining);
  const [foliosTotal, setFoliosTotal] = useState(tenant.folios_total);
  const [isActive, setIsActive] = useState(tenant.is_active);
  const [foliosExtra, setFoliosExtra] = useState(0);
  const [saving, setSaving] = useState(false);

  const plan = PLANES.find(p => p.key === planKey) || PLANES[0];
  const nuevaFecha = addDays(plan.dias);
  const foliosFinal = foliosRemaining + foliosExtra;

  const handlePlanChange = (key: string) => {
    const p = PLANES.find(pl => pl.key === key) || PLANES[0];
    setPlanKey(key);
    if (p.incluye_facturacion) setHasElectronic(true);
    if (p.folios > 0 && foliosRemaining === 0) { setFoliosRemaining(p.folios); setFoliosTotal(p.folios); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await superadminApi.updatePlan(token, tenant.id, {
        plan_name: planKey,
        subscription_ends_at: nuevaFecha,
        has_electronic_billing: hasElectronic,
        folios_remaining: foliosFinal,
        folios_total: foliosTotal + foliosExtra,
        is_active: isActive,
      });
      success('Plan actualizado');
      onSaved(); onClose();
    } catch (e: any) { error(e.message || 'Error al actualizar'); }
    finally { setSaving(false); }
  };

  const inp = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text)', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 800 }}>Gestionar suscripción</h3>
        <p style={{ margin: '0 0 20px', color: 'var(--primary)', fontWeight: 600 }}>{tenant.name}</p>
        {tenant.owner_email && <p style={{ margin: '-14px 0 18px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>✉️ {tenant.owner_email}</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Plan */}
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>Plan</label>
            {PLANES.map(p => (
              <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${planKey === p.key ? p.color : 'var(--border)'}`, background: planKey === p.key ? p.bg : 'var(--bg-elevated)', marginBottom: '6px', transition: 'all 0.15s' }}>
                <input type="radio" name="plan" value={p.key} checked={planKey === p.key} onChange={() => handlePlanChange(p.key)} style={{ accentColor: p.color }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.87rem', color: planKey === p.key ? p.color : 'var(--text)' }}>{p.label}</div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{p.dias}d · {p.incluye_facturacion ? `${p.folios} folios DIAN` : 'sin DIAN'}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Nueva fecha */}
          <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '8px', padding: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Calendar size={14} color="#34d399" />
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Nueva fecha de vencimiento</div>
              <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.9rem' }}>{fmt(nuevaFecha)} (+{plan.dias}d desde hoy)</div>
            </div>
          </div>

          {/* Folios extra */}
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border)', padding: '12px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Recargar folios (opcional)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Folios actuales</div>
                <div style={{ fontWeight: 700 }}>{foliosRemaining} / {foliosTotal}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Packs extra (×{FOLIO_PACK_SIZE})</div>
                <input type="number" min={0} max={50} value={foliosExtra / FOLIO_PACK_SIZE} onChange={e => setFoliosExtra(Math.max(0, +e.target.value) * FOLIO_PACK_SIZE)} style={{ ...inp, padding: '6px 10px' }} />
              </div>
            </div>
            {foliosExtra > 0 && <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', borderRadius: '6px', padding: '8px' }}>+{foliosExtra} folios → Total {foliosFinal} · Costo: {cop(foliosExtra / FOLIO_PACK_SIZE * FOLIO_PACK_PRICE)}</div>}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>{cop(FOLIO_PACK_PRICE)} / {FOLIO_PACK_SIZE} folios</div>
          </div>

          {/* Toggles */}
          {[
            { label: 'Facturación electrónica DIAN', sub: 'Transmisión a la DIAN', val: hasElectronic, set: setHasElectronic, activeColor: '#34d399', inactiveColor: 'var(--text-muted)' },
            { label: 'Negocio activo', sub: 'Si inactivo, el login queda bloqueado', val: isActive, set: setIsActive, activeColor: '#34d399', inactiveColor: '#f87171' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{t.label}</div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{t.sub}</div>
              </div>
              <button onClick={() => t.set((v: boolean) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.val ? t.activeColor : t.inactiveColor }}>
                {t.val ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          ))}

          {/* Resumen */}
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px', padding: '10px', fontSize: '0.8rem' }}>
            <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '5px' }}>Resumen</div>
            <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div>📦 Plan: <strong style={{ color: 'var(--text)' }}>{plan.label}</strong></div>
              <div>📅 Vence: <strong style={{ color: 'var(--text)' }}>{fmt(nuevaFecha)}</strong></div>
              <div>📄 Folios: <strong style={{ color: 'var(--text)' }}>{foliosFinal}</strong></div>
              <div>⚡ DIAN: <strong style={{ color: 'var(--text)' }}>{hasElectronic ? 'Sí' : 'No'}</strong></div>
              <div>🔒 Estado: <strong style={{ color: isActive ? '#34d399' : '#f87171' }}>{isActive ? 'Activo' : 'Suspendido'}</strong></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ flex: 2 }}>{saving ? 'Guardando...' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de confirmación de eliminación ──────────────────────
interface DeleteModalProps {
  tenant: Tenant;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteModal({ tenant, token, onClose, onDeleted }: DeleteModalProps) {
  const { success, error } = useToast();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await superadminApi.deleteTenant(token, tenant.id);
      success(`"${tenant.name}" eliminado`);
      onDeleted(); onClose();
    } catch (e: any) { error(e.message || 'Error al eliminar'); }
    finally { setDeleting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trash2 size={18} color="#f87171" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>Eliminar negocio</div>
            <div style={{ color: '#f87171', fontSize: '0.82rem', fontWeight: 600 }}>{tenant.name}</div>
          </div>
        </div>

        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          ⚠️ Esta acción es <strong style={{ color: '#f87171' }}>irreversible</strong>. Se eliminará el negocio y todos sus datos:
          <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
            <li>{tenant.product_count || 0} productos</li>
            <li>{tenant.sale_count_total || 0} ventas</li>
            <li>{tenant.user_count || 0} usuario(s)</li>
          </ul>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Escribe <strong style={{ color: 'var(--text)' }}>{tenant.name}</strong> para confirmar:
          </label>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={tenant.name}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text)', fontSize: '0.88rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
          <button
            onClick={handleDelete}
            disabled={deleting || confirm !== tenant.name}
            style={{ flex: 2, background: confirm === tenant.name ? 'rgba(239,68,68,0.85)' : 'var(--bg-elevated)', color: confirm === tenant.name ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '8px', padding: '10px', fontWeight: 700, cursor: confirm === tenant.name ? 'pointer' : 'not-allowed', fontSize: '0.88rem' }}
          >
            {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vista principal ───────────────────────────────────────────
export function SuperAdminView({ token }: SuperAdminViewProps) {
  const { success, error } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [rechargingId, setRechargingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setTenants(await superadminApi.listTenants(token)); }
    catch (e: any) { error(e.message || 'Error cargando negocios'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleQuickRecharge = async (tenant: Tenant) => {
    if (!token) return;
    setRechargingId(tenant.id);
    try {
      await superadminApi.recharge(token, tenant.id, FOLIO_PACK_SIZE);
      success(`+${FOLIO_PACK_SIZE} folios → "${tenant.name}"`);
      load();
    } catch (e: any) { error(e.message || 'Error al recargar'); }
    finally { setRechargingId(null); }
  };

  const filtered = tenants.filter(t => {
    const q = searchQuery.toLowerCase();
    const m = !q || t.name.toLowerCase().includes(q) || (t.slug || '').toLowerCase().includes(q) || (t.owner_email || '').toLowerCase().includes(q);
    const mp = filterPlan === 'all' || t.plan_name === filterPlan;
    const ms = filterStatus === 'all'
      || (filterStatus === 'active' && t.is_active && !isExpired(t.subscription_ends_at))
      || (filterStatus === 'expired' && isExpired(t.subscription_ends_at))
      || (filterStatus === 'suspended' && !t.is_active)
      || (filterStatus === 'selling' && (t.sale_count_30d || 0) > 0)
      || (filterStatus === 'idle' && (t.sale_count_30d || 0) === 0);
    return m && mp && ms;
  });

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.is_active && !isExpired(t.subscription_ends_at)).length,
    expired: tenants.filter(t => isExpired(t.subscription_ends_at)).length,
    premium: tenants.filter(t => t.plan_name === 'premium').length,
    selling: tenants.filter(t => (t.sale_count_30d || 0) > 0).length,
    withBilling: tenants.filter(t => t.has_electronic_billing).length,
  };

  const sel = { padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text)', fontSize: '0.83rem', cursor: 'pointer' };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(124,58,237,0.4)' }}>
          <Shield size={22} color="white" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Panel de Super Administrador</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>Negocios · Planes · Facturación electrónica · Estadísticas</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '22px' }}>
        {[
          { icon: <Building2 size={15} />, label: 'Negocios', value: stats.total,      color: '#60a5fa' },
          { icon: <CheckCircle size={15} />, label: 'Activos',  value: stats.active,     color: '#34d399' },
          { icon: <AlertCircle size={15} />, label: 'Vencidos', value: stats.expired,    color: '#f87171' },
          { icon: <TrendingUp size={15} />, label: 'Vendiendo', value: stats.selling,    color: '#fbbf24' },
          { icon: <CreditCard size={15} />, label: 'Premium',   value: stats.premium,    color: '#a78bfa' },
          { icon: <FileText size={15} />,   label: 'Con DIAN',  value: stats.withBilling, color: '#34d399' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ color: s.color }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Nombre, slug o email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ ...sel, width: '100%', paddingLeft: '30px', boxSizing: 'border-box' as const }} />
        </div>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={sel}>
          <option value="all">Todos los planes</option>
          <option value="free">Gratis</option>
          <option value="standard">Estándar</option>
          <option value="premium">Premium</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={sel}>
          <option value="all">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="expired">Vencidos</option>
          <option value="suspended">Suspendidos</option>
          <option value="selling">Con ventas (30d)</option>
          <option value="idle">Sin ventas (30d)</option>
        </select>
        <button onClick={load} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', padding: '8px 12px' }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <RefreshCw size={26} style={{ opacity: 0.4, marginBottom: '10px' }} />
          <div>Cargando negocios con estadísticas...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Users size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
          <div>{tenants.length === 0 ? 'No hay negocios registrados' : 'Sin resultados'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(tenant => {
            const plan = PLANES.find(p => p.key === tenant.plan_name);
            const planColor = plan?.color || '#9ca3af';
            const planBg   = plan?.bg    || 'rgba(156,163,175,0.1)';
            const expired  = isExpired(tenant.subscription_ends_at);
            const dl       = daysLeft(tenant.subscription_ends_at);
            const foliosPct = tenant.folios_total > 0 ? (tenant.folios_remaining / tenant.folios_total) * 100 : 0;
            const lowFolios = tenant.has_electronic_billing && tenant.folios_remaining < 20;
            const selling   = (tenant.sale_count_30d || 0) > 0;

            return (
              <div key={tenant.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${!tenant.is_active ? 'rgba(239,68,68,0.3)' : expired ? 'rgba(251,191,36,0.25)' : 'var(--border)'}`,
                borderRadius: '14px', padding: '16px 20px',
                opacity: tenant.is_active ? 1 : 0.65, transition: 'all 0.2s'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>

                  {/* ── Info principal ── */}
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    {/* Nombre + badges de estado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem' }}>{tenant.name}</span>
                      {!tenant.is_active && <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: '5px', padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700 }}>SUSPENDIDO</span>}
                      {expired && tenant.is_active && <span style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderRadius: '5px', padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700 }}>VENCIDO</span>}
                      {lowFolios && <span style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', borderRadius: '5px', padding: '1px 7px', fontSize: '0.68rem', fontWeight: 700 }}>FOLIOS BAJOS</span>}
                    </div>

                    {/* Email del dueño */}
                    {tenant.owner_email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        <Mail size={12} />
                        <span>{tenant.owner_email}</span>
                      </div>
                    )}

                    {/* Slug + tipo */}
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {tenant.slug ? `/${tenant.slug}` : tenant.id.slice(0, 8)} · {tenant.business_type}
                    </div>

                    {/* Badges plan + vencimiento */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <span style={{ background: planBg, color: planColor, borderRadius: '6px', padding: '3px 9px', fontSize: '0.74rem', fontWeight: 600 }}>
                        {plan?.label || tenant.plan_name}
                      </span>
                      <span style={{ background: expired ? 'rgba(239,68,68,0.1)' : dl <= 5 ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.08)', color: expired ? '#f87171' : dl <= 5 ? '#fbbf24' : '#34d399', borderRadius: '6px', padding: '3px 9px', fontSize: '0.74rem' }}>
                        {expired ? `Vencido ${fmt(tenant.subscription_ends_at)}` : `${dl}d · ${fmt(tenant.subscription_ends_at)}`}
                      </span>
                      {tenant.has_electronic_billing && <span style={{ background: 'rgba(167,139,250,0.1)', color: '#a78bfa', borderRadius: '6px', padding: '3px 9px', fontSize: '0.74rem' }}>⚡ DIAN</span>}
                    </div>

                    {/* Stats: productos, ventas, usuarios */}
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <Package size={13} />
                        <span>{tenant.product_count ?? '—'} productos</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <BarChart2 size={13} />
                        <span>{tenant.sale_count_total ?? '—'} ventas totales</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                        <ShoppingBag size={13} style={{ color: selling ? '#34d399' : '#6b7280' }} />
                        <span style={{ color: selling ? '#34d399' : 'var(--text-muted)', fontWeight: selling ? 700 : 400 }}>
                          {selling ? `${tenant.sale_count_30d} ventas (30d) ✓` : 'Sin ventas (30d)'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <Clock size={13} />
                        <span>Última venta: {timeAgo(tenant.last_sale_at)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <UserCheck size={13} />
                        <span>{tenant.user_count ?? 1} usuario(s)</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Folios ── */}
                  {tenant.has_electronic_billing && (
                    <div style={{ minWidth: '120px' }}>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '3px', fontWeight: 600 }}>Folios e-factura</div>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: lowFolios ? '#f87171' : 'var(--text)', marginBottom: '4px' }}>
                        {tenant.folios_remaining}<span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 400 }}> / {tenant.folios_total}</span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '3px', width: `${Math.min(100, foliosPct)}%`, background: foliosPct > 30 ? '#34d399' : foliosPct > 10 ? '#fbbf24' : '#f87171', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  )}

                  {/* ── Acciones ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                    {/* Ver catálogo público */}
                    {tenant.slug && (
                      <a href={`/${tenant.slug}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text)', textDecoration: 'none', cursor: 'pointer' }}>
                        <ExternalLink size={12} /> Catálogo
                      </a>
                    )}
                    {/* Gestionar plan */}
                    <button onClick={() => setEditingTenant(tenant)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '7px 12px' }}>
                      <Settings size={12} /> Gestionar
                    </button>
                    {/* Recarga rápida */}
                    {tenant.has_electronic_billing && (
                      <button onClick={() => handleQuickRecharge(tenant)} disabled={rechargingId === tenant.id} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '7px 12px' }}>
                        <Plus size={12} /> {rechargingId === tenant.id ? '...' : '+100 folios'}
                      </button>
                    )}
                    {/* Eliminar */}
                    <button onClick={() => setDeletingTenant(tenant)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#f87171', cursor: 'pointer' }}>
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabla de planes */}
      <div style={{ marginTop: '28px', padding: '18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CreditCard size={13} /> Estructura de planes
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
          {PLANES.map(p => (
            <div key={p.key} style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${p.color}40`, background: p.bg }}>
              <div style={{ fontWeight: 700, color: p.color, fontSize: '0.82rem', marginBottom: '3px' }}>{p.key.toUpperCase()}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>{p.precio > 0 ? cop(p.precio) : 'Gratis'} · {p.dias}d</div>
                <div>{p.incluye_facturacion ? `✅ ${p.folios} folios DIAN` : '❌ Sin DIAN'}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '10px', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)' }}>
            <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: '0.82rem', marginBottom: '3px' }}>RECARGA</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <div>{cop(FOLIO_PACK_PRICE)} / pack</div>
              <div>✅ {FOLIO_PACK_SIZE} folios</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {editingTenant && token && <EditPlanModal tenant={editingTenant} token={token} onClose={() => setEditingTenant(null)} onSaved={load} />}
      {deletingTenant && token && <DeleteModal tenant={deletingTenant} token={token} onClose={() => setDeletingTenant(null)} onDeleted={load} />}
    </div>
  );
}
