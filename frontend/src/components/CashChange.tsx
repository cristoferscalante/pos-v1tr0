import { Banknote } from 'lucide-react';

const BIG_BILLS = [10000, 20000, 50000, 100000];
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/**
 * Montos rápidos: el valor exacto, los dos redondeos más cercanos hacia arriba y
 * los billetes con que suelen pagar ($10.000, $20.000, $50.000, $100.000).
 */
export function quickAmounts(total: number): number[] {
  if (total <= 0) return [];
  const rounds = [...new Set([1000, 5000, 10000].map(step => Math.ceil(total / step) * step))]
    .filter(v => v > total)
    .sort((a, b) => a - b)
    .slice(0, 2);
  const bills = BIG_BILLS.filter(bill => bill > total);
  const extra = total > 100000 ? [Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000] : [];
  return [...new Set([total, ...rounds, ...bills, ...extra])].filter(v => v >= total).sort((a, b) => a - b).slice(0, 6);
}

export const parseAmount = (raw: string) => Number(raw.replace(/[^\d]/g, '')) || 0;

interface Props {
  total: number;
  value: string;
  onChange: (value: string) => void;
}

/** "¿Con cuánto paga?" y cálculo de las vueltas (solo pago en efectivo). */
export function CashChange({ total, value, onChange }: Props) {
  const received = parseAmount(value);
  const change = received - total;
  const status = !received ? 'empty' : change >= 0 ? 'ok' : 'short';

  return (
    <div className="cash-change">
      <label className="section-label" htmlFor="cash-received">¿Con cuánto paga?</label>
      <div className="cash-change-input">
        <Banknote size={18} />
        <input
          id="cash-received"
          inputMode="numeric"
          autoComplete="off"
          className="form-input"
          placeholder="Escribe o toca un valor"
          value={received ? received.toLocaleString('es-CO') : ''}
          onChange={e => onChange(String(parseAmount(e.target.value)))}
        />
      </div>
      <div className="cash-quick">
        {quickAmounts(total).map(amount => (
          <button
            key={amount}
            type="button"
            className={received === amount ? 'active' : ''}
            onClick={() => onChange(String(amount))}
          >
            {amount === total ? 'Exacto' : money(amount)}
          </button>
        ))}
      </div>
      {status !== 'empty' && (
        <div className={`cash-result ${status}`} role="status">
          <span>{status === 'ok' ? 'Vueltas' : 'Falta'}</span>
          <strong>{money(Math.abs(change))}</strong>
        </div>
      )}
    </div>
  );
}
