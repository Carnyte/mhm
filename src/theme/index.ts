// App theme (light / dark) and reader colour themes.

import { useColorScheme } from 'react-native';
import type { SourceId } from '../sources/keys';
import { useSettings, type ReaderThemeKey } from '../state/settings';
import { schemeFrom } from './material';

export interface Palette {
  dark: boolean;
  /** The screen's background (Material "surface"). */
  bg: string;
  /** Cards, grouped lists, sheets (surface container low). */
  surface: string;
  /** Pressed rows, text fields, tonal fills (surface container high). */
  surfaceAlt: string;
  card: string;
  /** Bars (tab bar, mini player): surface container. */
  surfaceContainer: string;
  surfaceContainerHigh: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Hairlines and outlines (outline variant). */
  border: string;
  /** Outlined buttons and chips (outline). */
  outline: string;
  primary: string;
  primaryText: string;
  accent: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  /** Selected chips, the tab indicator, tonal buttons. */
  secondaryContainer: string;
  onSecondaryContainer: string;
  /** Toasts (snackbars). */
  inverseSurface: string;
  inverseText: string;
  danger: string;
  success: string;
  warning: string;
  chip: string;
  chipText: string;
  overlay: string;
  /** Each site's colour (source badges, chips); 4.5:1 on the background. Tint: colour + '22'. */
  source: Record<SourceId, string>;
}

const SOURCE_LIGHT: Record<SourceId, string> = { ffn: '#2B4C9B', ao3: '#990000', wp: '#9A3412', local: '#556170' };
const SOURCE_DARK: Record<SourceId, string> = { ffn: '#8FA8F0', ao3: '#F28B82', wp: '#FF9A5C', local: '#A9B4C2' };

/** The app's palette (Material You) from a seed colour, light or dark. */
export function paletteFrom(seed: string, dark: boolean): Palette {
  const m = schemeFrom(seed, dark);
  return {
    dark,
    bg: m.background,
    surface: m.surfaceContainerLow,
    surfaceAlt: m.surfaceContainerHigh,
    card: m.surfaceContainerLow,
    surfaceContainer: m.surfaceContainer,
    surfaceContainerHigh: m.surfaceContainerHigh,
    text: m.onSurface,
    textMuted: m.onSurfaceVariant,
    textFaint: m.outline,
    border: m.outlineVariant,
    outline: m.outline,
    primary: m.primary,
    primaryText: m.onPrimary,
    accent: m.primary,
    primaryContainer: m.primaryContainer,
    onPrimaryContainer: m.onPrimaryContainer,
    secondaryContainer: m.secondaryContainer,
    onSecondaryContainer: m.onSecondaryContainer,
    inverseSurface: m.inverseSurface,
    inverseText: m.inverseOnSurface,
    danger: m.error,
    success: m.success,
    warning: m.warning,
    chip: m.secondaryContainer,
    chipText: m.onSecondaryContainer,
    overlay: dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.38)',
    source: dark ? SOURCE_DARK : SOURCE_LIGHT,
  };
}

/** Each reader theme's seed: the app's tint follows the reader theme (Light is Google blue). */
export const THEME_SEEDS: Record<ReaderThemeKey, string> = {
  light: '#1A73E8',
  sepia: '#9C6B3C',
  paper: '#7D7461',
  mint: '#1E8A5A',
  dusk: '#6466C0',
  dark: '#4F7BC9',
  black: '#6B6F76',
};

const cache = new Map<string, Palette>();
/** The palette for a reader theme in light or dark (made once, then reused). */
export function themePalette(key: ReaderThemeKey, dark: boolean): Palette {
  const id = `${key}:${dark}`;
  let p = cache.get(id);
  if (!p) {
    p = paletteFrom(THEME_SEEDS[key] ?? THEME_SEEDS.light, dark);
    cache.set(id, p);
  }
  return p;
}

export const LIGHT: Palette = themePalette('light', false);
export const DARK: Palette = themePalette('light', true);

/**
 * The app's colours: light or dark from Settings → Appearance (or the phone), tinted by the reader
 * theme in use (its dark-mode theme when "match system" picks that one).
 */
export function useTheme(): Palette {
  const scheme = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const reader = useSettings((s) => s.reader);
  const dark = appearance === 'system' ? scheme === 'dark' : appearance === 'dark';
  const key = reader.matchSystem && scheme === 'dark' ? reader.darkTheme : reader.theme;
  return themePalette(key, dark);
}

export interface ReaderTheme {
  key: ReaderThemeKey;
  label: string;
  bg: string;
  text: string;
  muted: string;
  link: string;
  highlight: string;
  chrome: string;
  dark: boolean;
}

export const READER_THEMES: ReaderTheme[] = [
  { key: 'light', label: 'Light', bg: '#FFFFFF', text: '#1B1B1B', muted: '#6B6B6B', link: '#1F5FBF', highlight: 'rgba(255,214,10,0.45)', chrome: '#F6F6F6', dark: false },
  { key: 'sepia', label: 'Sepia', bg: '#F5ECD9', text: '#3B2F22', muted: '#7A6A55', link: '#7A4B12', highlight: 'rgba(214,150,40,0.35)', chrome: '#EDE2CB', dark: false },
  { key: 'paper', label: 'Paper', bg: '#FAF7F0', text: '#2B2A27', muted: '#77736A', link: '#3B5BA5', highlight: 'rgba(255,214,10,0.4)', chrome: '#F0ECE2', dark: false },
  { key: 'mint', label: 'Mint', bg: '#E6F2EA', text: '#1E2E25', muted: '#5D7366', link: '#1E6B47', highlight: 'rgba(80,200,120,0.35)', chrome: '#D8EADF', dark: false },
  { key: 'dusk', label: 'Dusk', bg: '#2B2D3A', text: '#D9DAE5', muted: '#9A9CB0', link: '#9DB8FF', highlight: 'rgba(160,140,255,0.35)', chrome: '#242631', dark: true },
  { key: 'dark', label: 'Dark', bg: '#16181C', text: '#D4D7DD', muted: '#8B9099', link: '#86A8F0', highlight: 'rgba(255,214,10,0.25)', chrome: '#1E2126', dark: true },
  { key: 'black', label: 'Black', bg: '#000000', text: '#C8C8C8', muted: '#7D7D7D', link: '#7FA4F2', highlight: 'rgba(255,214,10,0.22)', chrome: '#0B0B0B', dark: true },
];

export function readerTheme(key: ReaderThemeKey): ReaderTheme {
  return READER_THEMES.find((t) => t.key === key) ?? READER_THEMES[0];
}

export function useReaderTheme(): ReaderTheme {
  const scheme = useColorScheme();
  const r = useSettings((s) => s.reader);
  if (r.matchSystem && scheme === 'dark') return readerTheme(r.darkTheme);
  return readerTheme(r.theme);
}

export const READER_FONTS = [
  { key: 'System', css: "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif" },
  { key: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
  { key: 'Palatino', css: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif" },
  { key: 'Times', css: "'Times New Roman', Times, serif" },
  { key: 'Charter', css: "Charter, 'Bitstream Charter', Georgia, serif" },
  { key: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { key: 'Helvetica', css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { key: 'Avenir', css: "'Avenir Next', Avenir, 'Segoe UI', sans-serif" },
  { key: 'Courier', css: "'Courier New', Courier, monospace" },
];

export function fontCss(key: string): string {
  return READER_FONTS.find((f) => f.key === key)?.css ?? READER_FONTS[0].css;
}
