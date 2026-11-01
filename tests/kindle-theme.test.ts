// The Kindle-style colours (FEATURES.md 3a): readable in light and dark (text 7:1, secondary text
// 4.5:1, text on the navy button 4.5:1), one accent, and the classic colours untouched.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { DARK, KINDLE_DARK, KINDLE_LIGHT, LIGHT, paletteFor, type Palette } from '../src/theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe.each([
  ['light', KINDLE_LIGHT],
  ['dark', KINDLE_DARK],
] as [string, Palette][])('Kindle-style %s', (_, c) => {
  it('reads at 7:1 for text on paper and on wash', () => {
    expect(contrast(c.text, c.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(c.text, c.surfaceAlt)).toBeGreaterThanOrEqual(7);
  });

  it('reads at 4.5:1 for secondary and faint text on paper and on wash', () => {
    for (const fg of [c.textMuted, c.textFaint]) {
      expect(contrast(fg, c.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, c.surfaceAlt)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reads at 4.5:1 on the navy button, and navy links read on paper', () => {
    expect(contrast(c.primaryText, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.accent, c.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('has one accent: buttons and links share the navy', () => {
    expect(c.primary).toBe(c.accent);
    expect(c.look).toBe('kindle');
  });
});

describe('paletteFor', () => {
  it('gives the Kindle-style colours only for the Kindle-style look', () => {
    expect(paletteFor('kindle', false)).toBe(KINDLE_LIGHT);
    expect(paletteFor('kindle', true)).toBe(KINDLE_DARK);
    expect(paletteFor('classic', false)).toBe(LIGHT);
    expect(paletteFor('classic', true)).toBe(DARK);
  });

  it('keeps the classic colours as they were', () => {
    expect(LIGHT).toMatchObject({ bg: '#F4F5F8', surface: '#FFFFFF', text: '#15202B', primary: '#1F3A5F', accent: '#2F6FED', look: 'classic' });
    expect(DARK).toMatchObject({ bg: '#0E1116', text: '#E6EAF0', primary: '#7FA8E8', accent: '#6EA0FF', look: 'classic' });
  });
});
