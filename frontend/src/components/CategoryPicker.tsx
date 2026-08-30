import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Pencil, Trash2, Check, X, Tag, Settings2 } from 'lucide-react';
import { normalizeCategoryName } from '../utils/productCategories';

interface CategoryPickerProps {
  /** Categoría actualmente seleccionada para el producto */
  value: string;
  /** Lista de categorías del negocio (tenant.meta_data.product_categories) */
  categories: string[];
  /** Selecciona una categoría existente para el producto */
  onChange: (value: string) => void;
  /** Crea una categoría nueva y la deja seleccionada */
  onCreate: (name: string) => Promise<void> | void;
  /** Renombra una categoría existente (propaga a los productos que la usan) */
  onRename: (from: string, to: string) => Promise<void> | void;
  /** Elimina una categoría de la lista del negocio */
  onDelete: (name: string) => Promise<void> | void;
  /** Icono opcional (p. ej. el del tipo de negocio) que se muestra en cada chip */
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * Selector de categorías pensado para reutilizar las que el negocio ya creó:
 * todas se ven como chips a la mano, se filtra/crea escribiendo, y en modo
 * "Gestionar" se puede renombrar o borrar cada una sin salir del formulario.
 */
export function CategoryPicker({
  value,
  categories,
  onChange,
  onCreate,
  onRename,
  onDelete,
  icon,
  disabled,
}: CategoryPickerProps) {
  const [query, setQuery] = useState('');
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  const normalizedQuery = normalizeCategoryName(query);

  const filtered = useMemo(() => {
    if (!normalizedQuery) return categories;
    const q = normalizedQuery.toLowerCase();
    return categories.filter(c => c.toLowerCase().includes(q));
  }, [categories, normalizedQuery]);

  const exactExists = categories.some(
    c => c.toLowerCase() === normalizedQuery.toLowerCase()
  );
  const canCreate = !disabled && !manage && !!normalizedQuery && !exactExists;

  const run = async (fn: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    run(async () => {
      await onCreate(normalizedQuery);
      setQuery('');
    });

  const startEdit = (cat: string) => {
    setEditing(cat);
    setEditValue(cat);
  };
  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
  };
  const commitEdit = () =>
    run(async () => {
      const next = normalizeCategoryName(editValue);
      if (next && editing && next !== editing) {
        await onRename(editing, next);
      }
      cancelEdit();
    });

  const selectCategory = (cat: string) => {
    if (disabled || manage) return;
    onChange(cat);
    setQuery('');
  };

  return (
    <div className={`category-picker ${disabled ? 'is-disabled' : ''}`}>
      <div className="category-picker-toolbar">
        <div className="category-picker-search">
          <Tag size={14} />
          <input
            className="category-picker-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar o crear categoría..."
            disabled={disabled}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (canCreate) void handleCreate();
                else if (normalizedQuery && filtered.length >= 1) selectCategory(filtered[0]);
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="category-picker-clear"
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {categories.length > 0 && (
          <button
            type="button"
            className={`category-picker-manage ${manage ? 'active' : ''}`}
            onClick={() => {
              setManage(m => !m);
              cancelEdit();
            }}
            disabled={disabled}
          >
            <Settings2 size={14} />
            {manage ? 'Listo' : 'Gestionar'}
          </button>
        )}
      </div>

      <div className="category-picker-chips">
        {filtered.map(cat => {
          const isSelected = value.toLowerCase() === cat.toLowerCase();

          if (editing === cat) {
            return (
              <span key={cat} className="category-chip is-editing">
                <input
                  autoFocus
                  className="category-chip-edit-input"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitEdit();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                />
                <button
                  type="button"
                  className="category-chip-icon-btn confirm"
                  onClick={() => void commitEdit()}
                  disabled={busy}
                  aria-label="Guardar nombre"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  className="category-chip-icon-btn"
                  onClick={cancelEdit}
                  aria-label="Cancelar"
                >
                  <X size={13} />
                </button>
              </span>
            );
          }

          return (
            <span
              key={cat}
              className={`category-chip ${isSelected ? 'selected' : ''} ${manage ? 'is-managing' : ''}`}
              onClick={() => selectCategory(cat)}
              role={manage ? undefined : 'button'}
              tabIndex={manage || disabled ? -1 : 0}
              onKeyDown={e => {
                if (!manage && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  selectCategory(cat);
                }
              }}
            >
              {icon && <span className="category-chip-icon">{icon}</span>}
              <span className="category-chip-label">{cat}</span>
              {isSelected && !manage && (
                <Check size={12} className="category-chip-check" />
              )}
              {manage && (
                <>
                  <button
                    type="button"
                    className="category-chip-icon-btn"
                    onClick={e => {
                      e.stopPropagation();
                      startEdit(cat);
                    }}
                    aria-label={`Renombrar ${cat}`}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    className="category-chip-icon-btn danger"
                    onClick={e => {
                      e.stopPropagation();
                      void onDelete(cat);
                    }}
                    aria-label={`Eliminar ${cat}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </span>
          );
        })}

        {canCreate && (
          <button
            type="button"
            className="category-chip create"
            onClick={() => void handleCreate()}
            disabled={busy}
          >
            <Plus size={13} />
            Crear «{normalizedQuery}»
          </button>
        )}

        {filtered.length === 0 && !canCreate && (
          <span className="category-picker-empty">
            {categories.length === 0
              ? 'Aún no hay categorías. Escribe un nombre para crear la primera.'
              : 'Ninguna categoría coincide con la búsqueda.'}
          </span>
        )}
      </div>
    </div>
  );
}
