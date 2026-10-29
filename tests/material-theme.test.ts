// The app's Material You palettes (src/theme/material.ts, src/theme/index.ts): every reader theme's
// palette, light and dark, keeps text, buttons, chips, links and site colours readable (WCAG 4.5:1
// for text, 3:1 for outlines), tints its surfaces with the theme's hue, and round-trips colours.

import { contrast, lchOf, tone } from '../src/theme/material';
import { paletteFrom, THEME_SEEDS, themePalette } from '../src/theme';
import type { ReaderThemeKey } from '../src/state/settings';

const KEYS = Object.keys(THEME_SEEDS) as ReaderThemeKey[];
const cases = KEYS.flatMap((k) => [false, true].map((dark) => [k, dark] as const));

describe.each(cases)('%s (dark: %s)', (key, dark) => {
  const c = themePalette(key, dark);
  it('keeps text readable on every surface', () => {
    for (const bg of [c.bg, c.surface, c.surfaceAlt, c.card, c.surfaceContainer, c.surfaceContainerHigh]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.primary, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.textFaint, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.success, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.warning, c.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps buttons, chips, containers and toasts readable', () => {
    expect(contrast(c.primaryText, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.chipText, c.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onSecondaryContainer, c.secondaryContainer)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimaryContainer, c.primaryContainer)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.inverseText, c.inverseSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.outline, c.bg)).toBeGreaterThanOrEqual(3);
  });

  it('keeps each site’s colour readable on the background', () => {
    for (const s of Object.values(c.source)) expect(contrast(s, c.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('is light or dark as asked, with surfaces in order', () => {
    expect(c.dark).toBe(dark);
    const l = (x: string) => lchOf(x).l;
    if (dark) expect(l(c.bg)).toBeLessThan(l(c.surface));
    else expect(l(c.bg)).toBeGreaterThan(l(c.surface));
    expect(l(c.surface)).not.toBe(l(c.surfaceAlt));
  });
});

it('tints each theme with its own hue', () => {
  const hue = (k: ReaderThemeKey) => lchOf(themePalette(k, false).primary).h;
  expect(Math.abs(hue('sepia') - hue('mint'))).toBeGreaterThan(40);
  expect(Math.abs(hue('light') - hue('sepia'))).toBeGreaterThan(40);
  // Google blue for the Light theme.
  expect(themePalette('light', false).primary).toBe(paletteFrom('#1A73E8', false).primary);
});

it('converts colours both ways and keeps them in sRGB', () => {
  for (const hex of ['#1A73E8', '#9C6B3C', '#FFFFFF', '#000000', '#1E8A5A']) {
    const { l, c, h } = lchOf(hex);
    const back = tone(h, c, l);
    for (let i = 1; i < 7; i += 2) expect(Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))).toBeLessThanOrEqual(1);
  }
  // A chroma sRGB can't show at that tone is reduced, not wrapped.
  expect(tone(140, 200, 95)).toMatch(/^#[0-9A-F]{6}$/);
  expect(Math.abs(lchOf(tone(140, 200, 95)).l - 95)).toBeLessThan(1);
});
