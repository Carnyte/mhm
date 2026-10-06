// App theme (light / dark) and reader colour themes.

import { useColorScheme } from 'react-native';
import { useSettings, type ReaderThemeKey } from '../state/settings';

export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  primary: string;
  primaryText: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  chip: string;
  chipText: string;
  overlay: string;
}

export const LIGHT: Palette = {
  dark: false,
  bg: '#F4F5F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F6',
  card: '#FFFFFF',
  text: '#15202B',
  textMuted: '#536170',
  textFaint: '#8A96A3',
  border: '#E1E5EB',
  primary: '#1F3A5F',
  primaryText: '#FFFFFF',
  accent: '#2F6FED',
  danger: '#C62828',
  success: '#2E7D32',
  warning: '#B26A00',
  chip: '#E8EDF5',
  chipText: '#2A3B52',
  overlay: 'rgba(10,20,30,0.45)',
};

export const DARK: Palette = {
  dark: true,
  bg: '#0E1116',
  surface: '#161B22',
  surfaceAlt: '#1D232C',
  card: '#161B22',
  text: '#E6EAF0',
  textMuted: '#A3ADBA',
  textFaint: '#6F7A87',
  border: '#272E38',
  primary: '#7FA8E8',
  primaryText: '#0E1116',
  accent: '#6EA0FF',
  danger: '#EF5350',
  success: '#66BB6A',
  warning: '#FFB74D',
  chip: '#232B36',
  chipText: '#C9D4E3',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useTheme(): Palette {
  const scheme = useColorScheme();
  const appearance = useSettings((s) => s.appearance);
  const dark = appearance === 'system' ? scheme === 'dark' : appearance === 'dark';
  return dark ? DARK : LIGHT;
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
