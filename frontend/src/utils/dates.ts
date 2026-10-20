// Fechas del POS. El backend guarda todo en UTC (datetime.utcnow) y lo
// devuelve SIN zona ("2026-10-20T20:05:00"). JavaScript interpreta esa cadena
// como hora LOCAL, así que una venta de las 3:05 p. m. se mostraba como
// 8:05 p. m. (5 horas de más en Colombia). Aquí se trata como UTC y se muestra
// siempre en hora de Colombia, aunque el celular tenga otra zona configurada.
export const BUSINESS_TIME_ZONE = 'America/Bogota';

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function parseServerDate(value: string | number | Date | null | undefined): Date {
  if (value instanceof Date) return value;
  if (value == null || value === '') return new Date(NaN);
  if (typeof value === 'number') return new Date(value);
  const s = value.trim();
  // Solo fecha ("2026-10-20"): JS ya la toma como UTC; se deja igual
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`);
  return new Date(HAS_ZONE.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

export function formatDate(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
): string {
  const d = parseServerDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', { timeZone: BUSINESS_TIME_ZONE, ...options });
}
