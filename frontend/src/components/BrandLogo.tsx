import { useId } from 'react';

/** Logo de V1TR0 POS (el mismo de public/logo.svg y del favicon). */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  const id = `brand-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="V1TR0 POS">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${id})`} />
      <polyline points="146,150 256,352 366,150" fill="none" stroke="#fff" strokeWidth="62" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="150" y1="412" x2="362" y2="412" stroke="#fff" strokeOpacity="0.7" strokeWidth="24" strokeLinecap="round" />
    </svg>
  );
}

/** Logo + nombre, para la landing, el login y el aviso de planes. */
export function BrandLogo({ size = 40, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <span className="brand-logo">
      <BrandMark size={size} />
      <span className="brand-logo-text">
        <span className="brand-logo-name">V1TR0 <span>POS</span></span>
        {subtitle && <span className="brand-logo-sub">{subtitle}</span>}
      </span>
    </span>
  );
}
