// Material You colours for the app: a whole palette (surfaces, text, buttons, containers) made from
// one seed colour, the way Google's apps make theirs. Each reader theme has its own seed, so the
// app's tint follows the reader theme the user picked (src/theme/index.ts).
//
// Colours are picked by tone (CIELAB lightness, 0 black – 100 white) at a hue and chroma taken from
// the seed, like Material's tonal palettes: text and buttons sit at tones far enough apart that the
// contrast always holds (tests/material-theme.test.ts checks every theme in light and dark). A
// colour that doesn't fit in sRGB at a tone loses chroma until it does. Pure TypeScript.

export interface Lch {
  l: number;
  c: number;
  h: number;
}

const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** '#RRGGBB' → linear sRGB 0..1. */
function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
}

/** Relative luminance (WCAG) of a '#RRGGBB' colour. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two '#RRGGBB' colours (1 – 21). */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** '#RRGGBB' → LCh (CIELAB, D65). */
export function lchOf(hex: string): Lch {
  const [r, g, b] = rgbOf(hex);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
  const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  return { l: 116 * fy - 16, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** LCh → linear sRGB (may be outside 0..1). */
function rgbFromLch({ l, c, h }: Lch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (f: number) => (f ** 3 > EPS ? f ** 3 : (116 * f - 16) / KAPPA);
  const x = inv(fx) * XN;
  const y = (l > KAPPA * EPS ? fy ** 3 : l / KAPPA) * YN;
  const z = inv(fz) * ZN;
  return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-5 && v <= 1 + 1e-5);

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(1, gam(Math.max(0, Math.min(1, v))))) * 255)
    .toString(16)
    .padStart(2, '0');

/** The colour at a tone (0–100) with the hue and as much of the chroma as sRGB allows. */
export function tone(h: number, c: number, l: number): string {
  let rgb = rgbFromLch({ l, c, h });
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(rgbFromLch({ l, c: mid, h }))) lo = mid;
      else hi = mid;
    }
    rgb = rgbFromLch({ l, c: lo, h });
  }
  return `#${rgb.map(hex2).join('').toUpperCase()}`;
}

/** The Material roles the app uses, at their tones for light or dark. */
export interface MaterialScheme {
  dark: boolean;
  background: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  inverseSurface: string;
  inverseOnSurface: string;
  error: string;
  success: string;
  warning: string;
}

/** A light or dark scheme from a seed colour ('#RRGGBB'). */
export function schemeFrom(seed: string, dark: boolean): MaterialScheme {
  const s = lchOf(seed);
  const h = s.h;
  // Primary keeps the seed's colourfulness (a grey seed stays nearly grey); secondary is a muted
  // version for containers and the tab indicator; neutrals carry only a hint of the hue.
  const p = Math.max(12, Math.min(64, s.c));
  const sec = Math.min(16, p / 2 + 2);
  const n = Math.min(4, p / 6);
  const nv = Math.min(8, p / 4);
  const P = (l: number) => tone(h, p, l);
  const S = (l: number) => tone(h, sec, l);
  const N = (l: number) => tone(h, n, l);
  const NV = (l: number) => tone(h, nv, l);
  return dark
    ? {
        dark,
        background: N(6),
        surfaceContainerLow: N(10),
        surfaceContainer: N(12),
        surfaceContainerHigh: N(17),
        surfaceContainerHighest: N(22),
        onSurface: N(90),
        onSurfaceVariant: NV(80),
        outline: NV(60),
        outlineVariant: NV(30),
        primary: P(80),
        onPrimary: P(20),
        primaryContainer: P(30),
        onPrimaryContainer: P(90),
        secondaryContainer: S(30),
        onSecondaryContainer: S(90),
        inverseSurface: N(90),
        inverseOnSurface: N(20),
        error: '#F2B8B5',
        success: '#6DD58C',
        warning: '#FFB95C',
      }
    : {
        dark,
        background: N(98),
        surfaceContainerLow: N(96),
        surfaceContainer: N(94),
        surfaceContainerHigh: N(92),
        surfaceContainerHighest: N(90),
        onSurface: N(10),
        onSurfaceVariant: NV(30),
        outline: NV(45),
        outlineVariant: NV(80),
        primary: P(40),
        onPrimary: '#FFFFFF',
        primaryContainer: P(90),
        onPrimaryContainer: P(10),
        secondaryContainer: S(90),
        onSecondaryContainer: S(10),
        inverseSurface: N(20),
        inverseOnSurface: N(95),
        error: '#B3261E',
        success: '#146C2E',
        warning: '#8C5000',
      };
}
