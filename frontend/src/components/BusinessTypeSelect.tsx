import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Heart, UtensilsCrossed, Store, Pill, Package } from 'lucide-react';
import type { BusinessType } from '../types';

export interface BusinessTypeOption {
  value: BusinessType;
  label: string;
  icon: React.ReactNode;
}

export const BUSINESS_TYPE_OPTIONS: BusinessTypeOption[] = [
  { value: 'veterinaria', label: 'Veterinaria',       icon: <Heart       size={15} /> },
  { value: 'restaurante', label: 'Restaurante',       icon: <UtensilsCrossed size={15} /> },
  { value: 'tienda',      label: 'Tienda / Papelería',icon: <Store       size={15} /> },
  { value: 'farmacia',    label: 'Farmacia',          icon: <Pill        size={15} /> },
  { value: 'otro',        label: 'Otro',              icon: <Package     size={15} /> },
];

export function getBusinessTypeIcon(type: string, size = 15): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    veterinaria: <Heart          size={size} />,
    restaurante: <UtensilsCrossed size={size} />,
    tienda:      <Store          size={size} />,
    farmacia:    <Pill           size={size} />,
    otro:        <Package        size={size} />,
  };
  return icons[type] || <Package size={size} />;
}

export function getBusinessTypeLabel(type: string): string {
  return BUSINESS_TYPE_OPTIONS.find(o => o.value === type)?.label || type;
}

interface Props {
  value: BusinessType;
  onChange: (value: BusinessType) => void;
  className?: string;
}

export function BusinessTypeSelect({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = BUSINESS_TYPE_OPTIONS.find(o => o.value === value) || BUSINESS_TYPE_OPTIONS[0];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`custom-select-wrapper ${className || ''}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`custom-select-trigger ${open ? 'open' : ''}`}
      >
        <span className="custom-select-value">
          <span className="custom-select-icon">{selected.icon}</span>
          <span>{selected.label}</span>
        </span>
        <ChevronDown
          size={16}
          className="custom-select-chevron"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="custom-select-dropdown glass animate-fade">
          {BUSINESS_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
            >
              <span className="custom-select-icon">{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
