// App + reader settings, persisted in the kv store.

import { kv } from '../db/kv';
import { DEFAULT_RATING } from '../ffn/constants';
import { createStore, useStore } from './store';

export type ReaderThemeKey = 'light' | 'sepia' | 'paper' | 'mint' | 'dusk' | 'dark' | 'black';

export interface ReaderSettings {
  theme: ReaderThemeKey;
  /** Follow the system light/dark setting (uses `theme` for light, `darkTheme` for dark). */
  matchSystem: boolean;
  darkTheme: ReaderThemeKey;
  font: string;
  fontSize: number; // px
  lineHeight: number; // multiplier
  paragraphSpacing: number; // em
  margin: number; // px each side
  maxWidth: number; // px, reading column
  justify: boolean;
  hyphenate: boolean;
  paged: boolean;
  tapToTurn: boolean;
  keepAwake: boolean;
  immersive: boolean;
  showProgress: boolean;
  autoScrollSpeed: number; // px per second
  brightness: number | null; // null = system
  ttsRate: number;
  ttsPitch: number;
  /** Legacy single voice (still honoured for its own language). */
  ttsVoice?: string;
  /** Chosen voice per language code ("en", "es", …); missing = best installed voice. */
  ttsVoices?: Record<string, string>;
  ttsContinue: boolean;
  /** Lower other apps' audio instead of stopping it (no lock screen controls then). */
  ttsMixWithOthers: boolean;
  /** Announce "Chapter 3: Title" before each chapter when listening. */
  ttsReadTitles: boolean;
}

export interface AppSettings {
  appearance: 'system' | 'light' | 'dark';
  defaultRating: number;
  defaultLanguage: number;
  defaultSort: number;
  notifications: boolean;
  checkIntervalHours: number;
  autoDownloadUpdates: boolean;
  wifiOnly: boolean;
  checkOnLaunch: boolean;
  haptics: boolean;
  excludedFandoms: string[];
  pinnedFandoms: { name: string; path: string }[];
  reader: ReaderSettings;
  lastUpdateCheck?: number;
  onboarded?: boolean;
}

export const DEFAULT_READER: ReaderSettings = {
  theme: 'light',
  matchSystem: true,
  darkTheme: 'dark',
  font: 'Georgia',
  fontSize: 19,
  lineHeight: 1.6,
  paragraphSpacing: 0.9,
  margin: 20,
  maxWidth: 720,
  justify: false,
  hyphenate: false,
  paged: false,
  tapToTurn: true,
  keepAwake: true,
  immersive: false,
  showProgress: true,
  autoScrollSpeed: 30,
  brightness: null,
  ttsRate: 1,
  ttsPitch: 1,
  ttsContinue: true,
  ttsMixWithOthers: false,
  ttsReadTitles: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'system',
  defaultRating: DEFAULT_RATING,
  defaultLanguage: 0,
  defaultSort: 1,
  notifications: true,
  checkIntervalHours: 6,
  autoDownloadUpdates: true,
  wifiOnly: true,
  checkOnLaunch: true,
  haptics: true,
  excludedFandoms: [],
  pinnedFandoms: [],
  reader: DEFAULT_READER,
};

function load(): AppSettings {
  try {
    const saved = kv.getSync<Partial<AppSettings>>('settings');
    return { ...DEFAULT_SETTINGS, ...saved, reader: { ...DEFAULT_READER, ...(saved?.reader ?? {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const settingsStore = createStore<AppSettings>(load());

settingsStore.subscribe(() => {
  kv.set('settings', settingsStore.get()).catch(() => {});
});

export function useSettings<S = AppSettings>(selector?: (s: AppSettings) => S): S {
  return useStore(settingsStore, selector);
}

export function updateSettings(patch: Partial<AppSettings>) {
  settingsStore.set((s) => ({ ...s, ...patch }));
}

export function updateReader(patch: Partial<ReaderSettings>) {
  settingsStore.set((s) => ({ ...s, reader: { ...s.reader, ...patch } }));
}

export function togglePinnedFandom(f: { name: string; path: string }) {
  settingsStore.set((s) => {
    const has = s.pinnedFandoms.some((p) => p.path === f.path);
    return {
      ...s,
      pinnedFandoms: has ? s.pinnedFandoms.filter((p) => p.path !== f.path) : [...s.pinnedFandoms, f],
    };
  });
}
