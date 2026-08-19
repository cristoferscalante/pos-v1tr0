import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X, AlertCircle, Trash2 } from 'lucide-react';
import type { Toast } from '../types';

// ─────────────────────────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────────────────────────
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = React.createContext<{
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}>({ confirm: async () => false });

export function useConfirm() {
  return React.useContext(ConfirmContext);
}

function ConfirmDialog({ state, onClose }: { state: ConfirmState; onClose: (val: boolean) => void }) {
  const variantColors = {
    danger:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  btn: '#ef4444', icon: <Trash2 size={18} color="#f87171" /> },
    warning: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', btn: '#f59e0b', icon: <AlertTriangle size={18} color="#fbbf24" /> },
    info:    { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.3)', btn: '#6366f1', icon: <Info size={18} color="#818cf8" /> },
  };
  const v = variantColors[state.variant || 'warning'];

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={() => onClose(false)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 999999, padding: '16px', backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #1a1f2e)',
          border: `1px solid ${v.border}`,
          borderRadius: '16px', padding: '24px',
          width: '100%', maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          animation: 'slideUp 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {v.icon}
          </div>
          <div style={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>
            {state.title || 'Confirmar acción'}
          </div>
        </div>

        {/* Message */}
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted, #9ca3af)', marginBottom: '20px', lineHeight: 1.5 }}>
          {state.message}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => onClose(false)}
            style={{
              padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border, #2a2f3e)',
              background: 'var(--bg-elevated, #252b3b)', color: 'var(--text-muted, #9ca3af)',
              cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
            }}
          >
            {state.cancelText || 'Cancelar'}
          </button>
          <button
            onClick={() => onClose(true)}
            style={{
              padding: '9px 20px', borderRadius: '8px', border: 'none',
              background: v.btn, color: 'white',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
              boxShadow: `0 4px 12px ${v.btn}50`,
            }}
          >
            {state.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOAST CONTEXT
// ─────────────────────────────────────────────────────────────
interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

export const ToastContext = React.createContext<ToastContextValue>({
  showToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

// ─────────────────────────────────────────────────────────────
// COMBINED PROVIDER (Toast + Confirm)
// ─────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const recentToastTimestamps = useRef<Map<string, number>>(new Map());

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const key = `${type}:${message}`;
    const now = Date.now();
    const lastShownAt = recentToastTimestamps.current.get(key) || 0;
    if (now - lastShownAt < 3000) return;

    setToasts(prev => {
      const duplicate = prev.some(t => t.type === type && t.message === message);
      if (duplicate) return prev;
      const id = crypto.randomUUID();
      recentToastTimestamps.current.set(key, now);
      setTimeout(() => setToasts(c => c.filter(t => t.id !== id)), 4500);
      return [...prev, { id, type, message }];
    });
  }, []);

  const success = useCallback((m: string) => showToast(m, 'success'), [showToast]);
  const error   = useCallback((m: string) => showToast(m, 'error'),   [showToast]);
  const warning = useCallback((m: string) => showToast(m, 'warning'), [showToast]);
  const info    = useCallback((m: string) => showToast(m, 'info'),    [showToast]);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ ...opts, resolve });
    });
  }, []);

  const handleConfirmClose = (val: boolean) => {
    confirmState?.resolve(val);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      <ConfirmContext.Provider value={{ confirm }}>
        {children}
        <ToastContainer toasts={toasts} onDismiss={id => setToasts(p => p.filter(t => t.id !== id))} />
        {confirmState && <ConfirmDialog state={confirmState} onClose={handleConfirmClose} />}
        <style>{`
          @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
          @keyframes slideUp { from { transform: translateY(20px) scale(0.95); opacity: 0 } to { transform: translateY(0) scale(1); opacity: 1 } }
          @keyframes slideIn { from { transform: translateX(24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        `}</style>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastContext);
}

// ─────────────────────────────────────────────────────────────
// TOAST CONTAINER
// ─────────────────────────────────────────────────────────────
const ICONS: Record<Toast['type'], React.ReactNode> = {
  success: <CheckCircle  size={17} />,
  error:   <XCircle      size={17} />,
  warning: <AlertTriangle size={17} />,
  info:    <Info          size={17} />,
};

const COLORS: Record<Toast['type'], string> = {
  success: 'var(--success, #34d399)',
  error:   'var(--danger,  #f87171)',
  warning: 'var(--warning, #fbbf24)',
  info:    'var(--accent,  #818cf8)',
};

const LABELS: Record<Toast['type'], string> = {
  success: 'Éxito',
  error:   'Error',
  warning: 'Aviso',
  info:    'Info',
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99998, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(true);
  const color = COLORS[toast.type];

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px',
      background: 'var(--bg-card, rgba(15,20,32,0.97))',
      backdropFilter: 'blur(20px)',
      border: `1px solid ${color}30`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 12,
      boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${color}10`,
      color: 'var(--text, #f1f5f9)',
      fontSize: 13,
      transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(28px)',
      animation: 'slideIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      maxWidth: '100%',
      wordBreak: 'break-word',
    }}>
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>{ICONS[toast.type]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.78rem', color, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {LABELS[toast.type]}
        </div>
        <div style={{ lineHeight: 1.4, color: 'var(--text-muted, #cbd5e1)' }}>{toast.message}</div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #64748b)', display: 'flex', padding: 2, flexShrink: 0 }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INLINE ERROR BANNER (para errores de formularios/páginas)
// ─────────────────────────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 16px', borderRadius: '10px',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
      color: '#fca5a5', fontSize: '0.85rem', marginBottom: '12px',
    }}>
      <AlertCircle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 2, display: 'flex' }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
