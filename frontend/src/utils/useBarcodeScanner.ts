// Lectura de códigos de barras con el lector integrado de terminales Android
// (PDA / "wireless data terminal": Urovo, Sunmi, Chainway, iData, Zebra...) y
// con pistolas USB/Bluetooth.
//
// Estos lectores funcionan como un teclado ("salida por teclado"), pero en
// Android muchos NO mandan tecla por tecla: insertan el código completo de un
// golpe en el campo enfocado (keydown llega como "Unidentified"). Si no hay un
// campo enfocado, el código se pierde. Por eso:
//   - Se mantiene enfocado un campo invisible con inputMode="none" (no abre el
//     teclado en pantalla) siempre que el usuario no esté escribiendo en otro.
//   - Se escucha el evento `input` (llega en ambos modos) y no solo keydown.
//   - Un código es "escaneado" si llegó de golpe o a velocidad de máquina
//     (< 50 ms entre caracteres); termina con Enter/Tab o tras 80 ms de silencio.
//   - Si escriben a mano en el buscador a velocidad normal, no se toca nada.
import { useCallback, useEffect, useRef } from 'react';

export interface ScanInfo {
  /** 'directo': el lector insertó el código de golpe; 'teclas': tecla por tecla. */
  mode: 'directo' | 'teclas';
  avgMs: number | null;
  terminator: 'Enter' | 'Tab' | 'Ninguno';
}

interface Options {
  enabled: boolean;
  /** Código leído. Devuelve true si se usó (se limpia del buscador). */
  onScan: (code: string, info: ScanInfo) => boolean | void;
  /** Texto escrito a mano mientras no había un campo enfocado (p. ej. teclado físico). */
  onType?: (text: string) => void;
  /** Buscador visible: si el lector escribe ahí, también se detecta. */
  searchRef?: React.RefObject<HTMLInputElement | null>;
  /** Para devolver el buscador a como estaba antes del escaneo. */
  setSearch?: (value: string) => void;
  /** Solo en el buscador: aceptar el código solo si corresponde a un producto. */
  isKnownCode?: (code: string) => boolean;
}

const SILENCE_MS = 80;
const SCANNER_MAX_GAP_MS = 50;
const MIN_LENGTH = 3;

/** Quita caracteres de control que algunos lectores agregan (CR, LF, GS de GS1...). */
export const cleanScannedCode = (code: string) => code.replace(/[\u0000-\u001f\u007f]/g, '').trim();

const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

/** Sonido corto y vibración usando el parlante y el vibrador del equipo. */
let audioCtx: AudioContext | null = null;
export function scanFeedback(ok: boolean) {
  try { navigator.vibrate?.(ok ? 40 : [90, 60, 90]); } catch { /* sin vibrador */ }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const ctx = audioCtx;
    const beep = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    if (ok) beep(1800, 0, 0.08);
    else { beep(400, 0, 0.15); beep(300, 0.18, 0.2); }
  } catch { /* sin audio */ }
}

interface Burst { startValue: string; times: number[]; bulk: boolean }

export function useBarcodeScanner({ enabled, onScan, onType, searchRef, setSearch, isKnownCode }: Options) {
  const sinkRef = useRef<HTMLInputElement>(null);
  // Siempre la última versión de los callbacks sin volver a montar listeners
  const cb = useRef({ onScan, onType, setSearch, isKnownCode });
  cb.current = { onScan, onType, setSearch, isKnownCode };

  /** Enfoca el campo invisible si nadie está escribiendo en otro campo. */
  const focusSink = useCallback(() => {
    const sink = sinkRef.current;
    if (!enabled || !sink) return;
    const active = document.activeElement;
    if (active === sink || (isEditable(active) && active !== document.body)) return;
    sink.focus({ preventScroll: true });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const sink = sinkRef.current;
    const search = searchRef?.current || null;
    const bursts = new Map<HTMLInputElement, Burst>();
    const timers = new Map<HTMLInputElement, number>();

    const info = (b: Burst, terminator: ScanInfo['terminator']): ScanInfo => {
      const gaps = b.times.slice(1).map((t, i) => t - b.times[i]);
      return {
        mode: b.bulk ? 'directo' : 'teclas',
        avgMs: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
        terminator,
      };
    };
    const isMachine = (b: Burst) => {
      if (b.bulk) return true;
      const gaps = b.times.slice(1).map((t, i) => t - b.times[i]);
      return gaps.length >= MIN_LENGTH - 1 && gaps.every(g => g < SCANNER_MAX_GAP_MS);
    };

    /** Procesa lo acumulado en un campo. Devuelve true si fue un escaneo. */
    const flush = (el: HTMLInputElement, terminator: ScanInfo['terminator']): boolean => {
      window.clearTimeout(timers.get(el));
      const b = bursts.get(el);
      bursts.delete(el);
      if (el === sink) {
        const raw = el.value;
        el.value = '';
        const code = cleanScannedCode(raw);
        if (!code) return false;
        if (b && isMachine(b) && code.length >= MIN_LENGTH) {
          cb.current.onScan(code, info(b, terminator));
          return true;
        }
        cb.current.onType?.(raw);
        return false;
      }
      // Buscador: solo la parte escrita en esta ráfaga, y solo si es un código conocido
      if (!b || !isMachine(b)) return false;
      const value = el.value;
      const typed = value.startsWith(b.startValue) ? value.slice(b.startValue.length) : value;
      const code = cleanScannedCode(typed);
      if (code.length < MIN_LENGTH || (cb.current.isKnownCode && !cb.current.isKnownCode(code))) return false;
      cb.current.setSearch?.(b.startValue);
      cb.current.onScan(code, info(b, terminator));
      return true;
    };

    const onBeforeInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (!bursts.has(el)) bursts.set(el, { startValue: el.value, times: [], bulk: false });
    };
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      const ie = e as InputEvent;
      const b = bursts.get(el) || { startValue: '', times: [], bulk: false };
      // Varios caracteres en un solo evento = el lector insertó el código de golpe
      // (se excluye pegar con el portapapeles en el buscador).
      if ((ie.data?.length || 0) >= MIN_LENGTH && ie.inputType !== 'insertFromPaste') b.bulk = true;
      b.times.push(performance.now());
      bursts.set(el, b);
      window.clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => flush(el, 'Ninguno'), SILENCE_MS));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLInputElement;
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      if (!bursts.has(el) && !(el === sink && el.value)) return;
      if (el === sink && !bursts.has(el)) bursts.set(el, { startValue: '', times: [], bulk: true });
      if (flush(el, e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const fields = [sink, search].filter(Boolean) as HTMLInputElement[];
    for (const el of fields) {
      el.addEventListener('beforeinput', onBeforeInput);
      el.addEventListener('input', onInput);
      el.addEventListener('keydown', onKeyDown, true);
    }

    // Recuperar el foco del campo invisible al tocar fuera de un campo de texto
    const refocus = () => window.setTimeout(focusSink, 0);
    document.addEventListener('pointerup', refocus, true);
    document.addEventListener('focusout', refocus, true);
    window.addEventListener('focus', refocus);
    focusSink();

    return () => {
      for (const el of fields) {
        el.removeEventListener('beforeinput', onBeforeInput);
        el.removeEventListener('input', onInput);
        el.removeEventListener('keydown', onKeyDown, true);
      }
      document.removeEventListener('pointerup', refocus, true);
      document.removeEventListener('focusout', refocus, true);
      window.removeEventListener('focus', refocus);
      timers.forEach(t => window.clearTimeout(t));
    };
  }, [enabled, focusSink, searchRef]);

  return { sinkRef, focusSink };
}
