import { useEffect, useState } from 'react';
import { ReceiptText, Save } from 'lucide-react';
import { authApi } from '../api/client';
import { useToast } from './Toast';
import type { AuthUser } from '../types';

interface Props {
  token: string | null;
  user: AuthUser | null;
  onUserUpdate?: (user: AuthUser) => void;
}

const FIELDS = [
  { key: 'business_legal_name', label: 'Razón social', placeholder: 'Ej. Panificadora La Espiga S.A.S.', type: 'text' },
  { key: 'business_nit', label: 'NIT / Documento', placeholder: 'Ej. 901.234.567-8', type: 'text' },
  { key: 'business_address', label: 'Dirección', placeholder: 'Ej. Cra 7 # 12-34', type: 'text' },
  { key: 'business_city', label: 'Ciudad', placeholder: 'Ej. Villavicencio', type: 'text' },
  { key: 'business_phone', label: 'Teléfono', placeholder: 'Ej. 608 123 4567', type: 'tel' },
  { key: 'receipt_reply_to_email', label: 'Correo del negocio', placeholder: 'ventas@tunegocio.com', type: 'email' },
] as const;

type Key = (typeof FIELDS)[number]['key'] | 'receipt_footer';

/**
 * Datos del negocio que salen en el ticket impreso y en el recibo digital por correo.
 * El "Correo del negocio" es a donde llegan las respuestas de los clientes al recibo
 * (el correo sale de la plataforma, pero con el nombre de este negocio).
 */
export function BusinessReceiptSettings({ token, user, onUserUpdate }: Props) {
  const { success, error } = useToast();
  const [values, setValues] = useState<Record<Key, string>>(() => {
    const meta = user?.meta_data || {};
    return Object.fromEntries([...FIELDS.map(f => f.key), 'receipt_footer'].map(k => [k, String(meta[k] || '')])) as Record<Key, string>;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    authApi.getTenant(token).then(tenant => {
      const meta = tenant?.meta_data || {};
      setValues(v => Object.fromEntries(Object.keys(v).map(k => [k, String(meta[k] ?? v[k as Key] ?? '')])) as Record<Key, string>);
    }).catch(() => { /* sin conexión: quedan los datos guardados en la sesión */ });
  }, [token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const data = await authApi.updateTenant(token, values);
      success('Datos del recibo guardados');
      if (user && onUserUpdate) onUserUpdate({ ...user, meta_data: { ...(user.meta_data || {}), ...values, ...(data?.meta_data || {}) } });
    } catch (err: any) {
      error(err.message || 'No se pudieron guardar los datos del recibo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card glass" style={{ gridColumn: 'span 2' }}>
      <div className="settings-card-header">
        <ReceiptText size={18} style={{ color: 'var(--primary)' }} />
        <h2 className="settings-card-title">Datos del negocio para recibos</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Aparecen en el ticket impreso y en el recibo que le llega al cliente por correo. Los clientes que respondan
        el recibo le escribirán al <strong>correo del negocio</strong>.
      </p>
      <form onSubmit={save} className="pos-form">
        <div className="form-grid-2">
          {FIELDS.map(f => (
            <div key={f.key} className="form-group">
              <label className="form-label" htmlFor={`receipt-${f.key}`}>{f.label}</label>
              <input
                id={`receipt-${f.key}`}
                type={f.type}
                className="form-input"
                placeholder={f.placeholder}
                value={values[f.key]}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="receipt-footer">Mensaje al final del recibo</label>
          <input
            id="receipt-footer"
            className="form-input"
            maxLength={240}
            placeholder="Ej. ¡Gracias por tu compra! Cambios hasta 8 días con este recibo."
            value={values.receipt_footer}
            onChange={e => setValues(v => ({ ...v, receipt_footer: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          <Save size={16} /> {saving ? 'Guardando…' : 'Guardar datos del recibo'}
        </button>
      </form>
    </div>
  );
}
