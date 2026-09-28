import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Flashlight, FlashlightOff, ImageUp, CameraOff } from 'lucide-react';

interface QrScannerModalProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
  title?: string;
}

// QR + los códigos de barras que traen los productos en Colombia (EAN/UPC) y
// los que suelen imprimir las etiquetadoras (Code 128/39).
const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
];

type ScannerState = 'starting' | 'scanning' | 'denied' | 'unavailable';

/**
 * Lector de QR y código de barras con la cámara trasera del celular.
 * Se cierra solo al leer un código y devuelve el texto en onScanSuccess.
 */
export function QrScannerModal({ onScanSuccess, onClose, title = 'Escanear código' }: QrScannerModalProps) {
  const reactId = useId();
  const elementId = `qr-reader-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const doneRef = useRef(false);
  // Callbacks en refs: los padres pasan funciones inline y un re-render no debe reiniciar la cámara
  const onScanRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScanSuccess;
  onCloseRef.current = onClose;

  const [state, setState] = useState<ScannerState>('starting');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [fileError, setFileError] = useState('');

  const finish = (text: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { navigator.vibrate?.(60); } catch { /* */ }
    onScanRef.current(text.trim());
    onCloseRef.current();
  };

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId, {
      verbose: false,
      formatsToSupport: FORMATS,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
    scannerRef.current = scanner;
    let cancelled = false;

    const startPromise = scanner.start(
      { facingMode: 'environment' },
      {
        fps: 12,
        // Recuadro ancho y bajo: sirve para QR y para códigos de barras 1D
        qrbox: (w, h) => {
          const width = Math.floor(Math.min(w * 0.85, 420));
          return { width, height: Math.floor(Math.min(h * 0.6, width * 0.6)) };
        },
        videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      },
      text => finish(text),
      () => { /* frame sin código: normal */ },
    );
    startPromise.then(() => {
      if (cancelled) return;
      setState('scanning');
      try {
        setTorchSupported(scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported());
      } catch { /* sin linterna */ }
    }).catch((err: unknown) => {
      if (cancelled) return;
      const msg = String((err as any)?.name || err || '');
      setState(/NotAllowed|Permission/i.test(msg) ? 'denied' : 'unavailable');
    });

    return () => {
      cancelled = true;
      // Si la cámara todavía está arrancando (p. ej. el doble montaje de React en
      // desarrollo, o cerrar muy rápido), hay que esperar a que arranque para
      // detenerla; si no, queda un segundo lector con la cámara encendida.
      startPromise
        .then(() => scanner.stop())
        .then(() => scanner.clear())
        .catch(() => { try { scanner.clear(); } catch { /* ya limpio */ } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleTorch = async () => {
    try {
      await scannerRef.current?.getRunningTrackCameraCapabilities().torchFeature().apply(!torchOn);
      setTorchOn(v => !v);
    } catch { setTorchSupported(false); }
  };

  // Alternativa sin cámara en vivo: leer el código desde una foto
  const scanFromFile = async (file?: File) => {
    if (!file || !scannerRef.current) return;
    setFileError('');
    try {
      if (scannerRef.current.isScanning) await scannerRef.current.stop();
      const text = await scannerRef.current.scanFile(file, false);
      finish(text);
    } catch {
      setFileError('No se encontró ningún código en la foto. Intenta con más luz y más cerca.');
    }
  };

  return createPortal(
    <div className="scanner-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="scanner-sheet">
        <div className="scanner-header">
          <h3 className="scanner-title">{title}</h3>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Cerrar escáner">
            <X size={20} />
          </button>
        </div>

        <div className="scanner-viewport">
          <div id={elementId} className="scanner-video" />
          {state === 'starting' && <p className="scanner-status">Abriendo cámara…</p>}
          {(state === 'denied' || state === 'unavailable') && (
            <div className="scanner-status scanner-error">
              <CameraOff size={32} />
              <p>
                {state === 'denied'
                  ? 'Permite el acceso a la cámara en tu navegador para leer códigos.'
                  : 'No se encontró una cámara disponible en este dispositivo.'}
              </p>
            </div>
          )}
        </div>

        <p className="scanner-hint">Apunta al código QR o de barras del producto; se lee solo.</p>
        {fileError && <p className="scanner-file-error">{fileError}</p>}

        <div className="scanner-actions">
          {torchSupported && (
            <button type="button" className="btn-secondary" onClick={toggleTorch}>
              {torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
              {torchOn ? 'Apagar linterna' : 'Linterna'}
            </button>
          )}
          <label className="btn-secondary scanner-file-btn">
            <ImageUp size={18} /> Leer desde foto
            <input type="file" accept="image/*" hidden onChange={e => scanFromFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
    </div>,
    document.body
  );
}
