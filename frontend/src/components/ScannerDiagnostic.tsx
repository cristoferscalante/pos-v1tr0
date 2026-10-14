import { useEffect, useRef, useState } from 'react';
import { Barcode, X } from 'lucide-react';

export interface ScanResult {
  text: string;
  speed: string;
  terminator: string;
  mode: string;
  matchedProduct: string | null;
}

interface Props {
  result: ScanResult | null;
  onClose: () => void;
  onReset: () => void;
  /** Código leído en el campo de prueba visible. */
  onTestScan: (code: string) => void;
}

const describe = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  if (!node || !node.tagName) return '—';
  if (node.classList?.contains('scan-sink')) return 'campo del lector';
  if (node.classList?.contains('scanner-test-input')) return 'campo de prueba';
  return node.tagName.toLowerCase() + (node.className && typeof node.className === 'string' ? `.${node.className.split(' ')[0]}` : '');
};

/**
 * Prueba del lector de códigos. Además del resultado, muestra en vivo cada
 * evento que llega del dispositivo (teclas, texto insertado, pegado) para ver
 * cómo envía el lector integrado de la terminal y por qué no se reconoce.
 */
export function ScannerDiagnostic({ result, onClose, onReset, onTestScan }: Props) {
  const [events, setEvents] = useState<string[]>([]);
  const testTimer = useRef<number | undefined>(undefined);
  const submitTest = (input: HTMLInputElement) => {
    window.clearTimeout(testTimer.current);
    const code = input.value.trim();
    input.value = '';
    if (code) onTestScan(code);
  };

  useEffect(() => {
    const t0 = performance.now();
    const add = (text: string) => setEvents(prev => [`${Math.round(performance.now() - t0)}ms  ${text}`, ...prev].slice(0, 40));
    const onKey = (e: KeyboardEvent) => add(`tecla "${e.key}" código=${e.code || '-'} keyCode=${e.keyCode} en ${describe(e.target)}`);
    const onInput = (e: Event) => {
      const ie = e as InputEvent;
      add(`texto ${ie.inputType || 'input'} "${ie.data ?? ''}" en ${describe(e.target)}`);
    };
    const onPaste = (e: ClipboardEvent) => add(`pegado "${e.clipboardData?.getData('text') ?? ''}" en ${describe(e.target)}`);
    const onFocus = (e: FocusEvent) => add(`foco en ${describe(e.target)}`);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('input', onInput, true);
    window.addEventListener('paste', onPaste, true);
    window.addEventListener('focusin', onFocus, true);
    add(`listo · foco actual: ${describe(document.activeElement)}`);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('input', onInput, true);
      window.removeEventListener('paste', onPaste, true);
      window.removeEventListener('focusin', onFocus, true);
    };
  }, []);

  return (
    <div className="modal-backdrop animate-fade" onClick={onClose}>
      <div className="modal-content glass animate-slide-up" style={{ maxWidth: '460px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Barcode size={18} /> Probar lector de códigos
          </h3>
          <button onClick={onClose} className="modal-close" aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body scanner-diag">
          {result ? (
            <div className={`scanner-diag-result ${result.matchedProduct ? 'ok' : 'missing'}`}>
              <span className="scanner-diag-label">Código leído</span>
              <strong className="scanner-diag-code">{result.text}</strong>
              <span>{result.matchedProduct ? `Producto: ${result.matchedProduct}` : 'No hay ningún producto con este código'}</span>
              <small>{result.mode} · {result.speed} · final: {result.terminator}</small>
            </div>
          ) : (
            <p className="scanner-diag-wait">
              Presiona el botón de escaneo del equipo apuntando a un código. Si no aparece nada abajo, el lector no está
              enviando el código como teclado: en los ajustes del lector del equipo elige <strong>salida por teclado</strong>
              (Keyboard / Keystroke / Emulación de teclado) en vez de <em>Broadcast</em>.
            </p>
          )}

          <label className="form-label" htmlFor="scanner-test-input">Si no funciona: toca este campo y vuelve a escanear</label>
          <input
            id="scanner-test-input"
            className="form-input scanner-test-input"
            placeholder="Toca aquí y escanea"
            autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); submitTest(e.currentTarget); } }}
            onInput={e => {
              const input = e.currentTarget;
              window.clearTimeout(testTimer.current);
              testTimer.current = window.setTimeout(() => submitTest(input), 300);
            }}
          />

          <div className="scanner-diag-log" aria-live="polite">
            <span className="scanner-diag-label">Lo que envía el dispositivo</span>
            {events.length === 0 ? <div>Sin eventos todavía</div> : events.map((ev, i) => <div key={i}>{ev}</div>)}
          </div>
          <small className="scanner-diag-version">Versión {__APP_VERSION__}</small>
        </div>
        <div className="modal-actions" style={{ padding: '0 20px 20px 20px' }}>
          {result && (
            <button onClick={() => { onReset(); setEvents([]); }} className="btn-secondary" style={{ flex: 1 }}>
              Volver a escanear
            </button>
          )}
          <button onClick={onClose} className="btn-primary" style={{ flex: 1 }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
