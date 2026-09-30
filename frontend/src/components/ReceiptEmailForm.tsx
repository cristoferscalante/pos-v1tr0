import { useState } from 'react';
import { Mail, Send, CheckCircle } from 'lucide-react';
import { db } from '../db/pos-db';
import { salesApi } from '../api/client';
import { useToast } from './Toast';
import type { LocalSale } from '../types';

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

interface ReceiptEmailFormProps {
  sale: LocalSale;
  token: string | null;
  isOnline: boolean;
  onUpdated?: (sale: LocalSale) => void;
}

/**
 * Pide el correo del cliente y le envía el recibo digital de la venta.
 * El correo sale de la plataforma con el nombre del negocio (ver backend/app/services/receipts.py).
 * Sin conexión, o si la venta aún no llega al servidor, el correo queda guardado en
 * la venta y el servidor envía el recibo al sincronizar.
 */
export function ReceiptEmailForm({ sale, token, isOnline, onUpdated }: ReceiptEmailFormProps) {
  const { success, warning, error } = useToast();
  const sentTo: string | undefined = sale.meta_data?.receipt_status === 'sent' ? sale.meta_data?.receipt_email : undefined;
  const queuedTo: string | undefined = !sentTo && sale.sync_status === 'pending' ? sale.meta_data?.receipt_email : undefined;
  const [open, setOpen] = useState(!sentTo && !queuedTo);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    const value = email.trim();
    if (!isValidEmail(value)) { warning('Escribe un correo válido, por ejemplo cliente@correo.com'); return; }
    setSending(true);
    try {
      if (isOnline && token && sale.sync_status === 'synced') {
        await salesApi.sendReceipt(token, sale.id, value);
        const updated = { ...sale, meta_data: { ...(sale.meta_data || {}), receipt_email: value, receipt_status: 'sent' } };
        await db.sales.update(sale.id, { meta_data: updated.meta_data }).catch(() => {});
        onUpdated?.(updated);
        success(`Recibo enviado a ${value}`);
      } else {
        const updated = { ...sale, meta_data: { ...(sale.meta_data || {}), receipt_email: value } };
        await db.sales.update(sale.id, { meta_data: updated.meta_data });
        onUpdated?.(updated);
        success(`El recibo se enviará a ${value} cuando haya conexión`);
      }
      setOpen(false);
      setEmail('');
    } catch (err) {
      error(err instanceof Error ? err.message : 'No se pudo enviar el recibo');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <div className="receipt-email-status">
        <CheckCircle size={16} />
        <span>{sentTo ? `Recibo enviado a ${sentTo}` : `Se enviará a ${queuedTo} al sincronizar`}</span>
        <button type="button" className="receipt-email-link" onClick={() => setOpen(true)}>Enviar a otro correo</button>
      </div>
    );
  }

  return (
    <div className="receipt-email-form">
      <label className="form-label" htmlFor={`receipt-email-${sale.id}`}>
        <Mail size={13} style={{ verticalAlign: '-2px' }} /> Correo del cliente para el recibo digital
      </label>
      <div className="input-with-action">
        <input
          id={`receipt-email-${sale.id}`}
          type="email"
          inputMode="email"
          autoComplete="off"
          className="form-input"
          placeholder="cliente@correo.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
        />
        <button type="button" className="btn-primary" onClick={send} disabled={sending || !email.trim()}>
          <Send size={16} /> {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
