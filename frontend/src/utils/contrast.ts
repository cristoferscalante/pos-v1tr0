// Ajusta el color de marca que elige cada negocio para que siempre se lea (WCAG AA, 4.5:1).

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function parseHex(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c: Rgb) => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t) as Rgb;

/** Mezcla `color` hacia `toward` lo mínimo necesario para contrastar con `against`. */
function ensureContrast(color: Rgb, against: Rgb, toward: Rgb): Rgb {
  for (let t = 0; t <= 1; t += 0.04) {
    const c = mix(color, toward, t);
    if (ratio(c, against) >= 4.5) return c;
  }
  return toward;
}

/** Color de fondo para botones con texto blanco. */
export function fillForWhiteText(hex: string): string {
  const rgb = parseHex(hex);
  return rgb ? toHex(ensureContrast(rgb, WHITE, BLACK)) : hex;
}

/** Variables CSS del color de marca para el tema activo. */
export function brandThemeVars(hex: string, theme: 'dark' | 'light'): Record<string, string> {
  const rgb = parseHex(hex);
  if (!rgb) return {};
  const fill = ensureContrast(rgb, WHITE, BLACK);
  // El fondo más exigente de cada tema donde el color se usa como texto
  const text = theme === 'light'
    ? ensureContrast(rgb, [216, 220, 253], BLACK)
    : ensureContrast(rgb, [28, 32, 63], WHITE);
  return {
    '--primary': toHex(fill),
    '--primary-hover': toHex(mix(fill, BLACK, 0.15)),
    '--primary-text': toHex(text),
    '--primary-rgb': fill.map(Math.round).join(', '),
  };
}
