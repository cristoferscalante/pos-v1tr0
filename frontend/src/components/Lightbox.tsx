import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxItem {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  title: string;
  text?: string;
}

interface Props {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onIndex: (index: number) => void;
}

/**
 * Visor a pantalla completa para capturas y videos: flechas, teclado
 * (← → Esc) y deslizar con el dedo en el celular.
 */
export function Lightbox({ items, index, onClose, onIndex }: Props) {
  const item = items[index];
  const touchX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);

  const go = useCallback((delta: number) => {
    onIndex((index + delta + items.length) % items.length);
    setDragX(0);
  }, [index, items.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (!item) return null;

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.title} onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Cerrar">
        <X size={22} />
      </button>
      {items.length > 1 && (
        <>
          <button type="button" className="lightbox-nav prev" aria-label="Anterior" onClick={e => { e.stopPropagation(); go(-1); }}>
            <ChevronLeft size={26} />
          </button>
          <button type="button" className="lightbox-nav next" aria-label="Siguiente" onClick={e => { e.stopPropagation(); go(1); }}>
            <ChevronRight size={26} />
          </button>
        </>
      )}

      <figure
        className="lightbox-stage"
        onClick={e => e.stopPropagation()}
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchMove={e => { if (touchX.current !== null) setDragX(e.touches[0].clientX - touchX.current); }}
        onTouchEnd={() => {
          if (Math.abs(dragX) > 60 && items.length > 1) go(dragX < 0 ? 1 : -1);
          else setDragX(0);
          touchX.current = null;
        }}
        style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}
      >
        <div className="lightbox-phone" key={item.src}>
          {item.type === 'video' ? (
            <video src={item.src} poster={item.poster} controls autoPlay playsInline muted />
          ) : (
            <img src={item.src} alt={item.title} />
          )}
        </div>
        <figcaption>
          <strong>{item.title}</strong>
          {item.text && <span>{item.text}</span>}
          {items.length > 1 && <em>{index + 1} / {items.length}</em>}
        </figcaption>
      </figure>
    </div>,
    document.body
  );
}

/**
 * Video en bucle y sin sonido que se reproduce solo cuando está en pantalla
 * (y se pausa al salir). Con "reducir movimiento" activado no arranca solo.
 */
export function AutoPlayVideo({ src, poster, className, label }: { src: string; poster?: string; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (video.preload === 'none') video.preload = 'auto';
        video.play().catch(() => { /* el navegador no permitió el autoplay: queda la portada */ });
      } else {
        video.pause();
      }
    }, { threshold: 0.35 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      className={className}
      src={src}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
    />
  );
}
