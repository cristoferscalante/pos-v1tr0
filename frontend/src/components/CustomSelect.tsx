import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption<T> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps<T> {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function CustomSelect<T extends string | number>({
  options,
  value,
  onChange,
  className,
  style
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

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
    <div ref={ref} className={`custom-select-wrapper ${className || ''}`} style={style}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`custom-select-trigger ${open ? 'open' : ''}`}
      >
        <span className="custom-select-value">
          {selected?.icon && <span className="custom-select-icon">{selected.icon}</span>}
          <span>{selected ? selected.label : 'Seleccionar...'}</span>
        </span>
        <ChevronDown
          size={16}
          className="custom-select-chevron"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}
        />
      </button>

      {open && (
        <div className="custom-select-dropdown glass animate-fade">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`custom-select-option ${opt.value === value ? 'selected' : ''}`}
            >
              {opt.icon && <span className="custom-select-icon">{opt.icon}</span>}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
