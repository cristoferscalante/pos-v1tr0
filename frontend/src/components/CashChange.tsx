import { Banknote } from 'lucide-react';

const BILLS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/** Montos rápidos: el valor exacto y los redondeos hacia arriba con billetes colombianos. */
export function quickAmounts(total: number): number[] {
  if (total <= 0) return [];
  const options = new Set<number>([total]);
  for (const step of [1000, 5000, 10000, 20000, 50000, 100000]) {
    const up = Math.ceil(total / step) * step;
    if (up > total) options.add(up);
  }
  for (const bill of BILLS) if (bill > total) options.add(bill);
  return [...options].sort((a, b) => a - b).slice(0, 5);
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
