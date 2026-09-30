import { useMemo, useState } from 'react';
import { Download, Share2 } from 'lucide-react';
import { useToast } from './Toast';
import type { LocalSale } from '../types';
import { businessFromUser, downloadBlob, receiptFileName, renderReceiptImage, shareReceiptImage } from '../utils/receiptImage';

/** Botones para compartir (WhatsApp, etc.) o descargar la imagen del recibo. */
export function ReceiptImageActions({ sale }: { sale: LocalSale }) {
  const { success, error } = useToast();
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  const canShareFiles = useMemo(() => {
    try {
      const probe = new File([new Blob(['x'], { type: 'image/png' })], 'r.png', { type: 'image/png' });
      return Boolean(navigator.canShare?.({ files: [probe] }));
    } catch {
      return false;
    }
  }, []);

  const build = async () => {
    const user = JSON.parse(localStorage.getItem('pos_user') || 'null');
    const biz = businessFromUser(user);
    const blob = await renderReceiptImage(sale, biz);
    return { blob, name: receiptFileName(sale, biz), title: `Recibo ${sale.sale_number} · ${biz.name}` };
  };

  const onDownload = async () => {
    setBusy('download');
    try {
      const { blob, name } = await build();
      downloadBlob(blob, name);
      success('Imagen del recibo descargada');
    } catch (err) {
      error(err instanceof Error ? err.message : 'No se pudo generar la imagen');
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    setBusy('share');
    try {
      const { blob, name, title } = await build();
      const shared = await shareReceiptImage(blob, name, title);
      if (!shared) {
        downloadBlob(blob, name);
        success('Tu dispositivo no permite compartir directo: descargamos la imagen');
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'No se pudo compartir el recibo');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="receipt-image-actions">
      {canShareFiles && (
        <button type="button" className="btn-secondary" onClick={onShare} disabled={busy !== null}>
          <Share2 size={17} /> {busy === 'share' ? 'Preparando…' : 'Compartir'}
        </button>
      )}
      <button type="button" className="btn-secondary" onClick={onDownload} disabled={busy !== null}>
        <Download size={17} /> {busy === 'download' ? 'Generando…' : 'Descargar imagen'}
      </button>
    </div>
  );
}
