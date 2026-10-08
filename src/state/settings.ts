// App + reader settings, persisted in the kv store.

import { kv } from '../db/kv';
import { normalizePins } from '../db/migrations/v2';
import { DEFAULT_RATING } from '../ffn/constants';
import { SOURCE_IDS, type SourceId } from '../sources/keys';
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
  /** Pauses between paragraphs, after chapter titles and at scene breaks. */
  ttsPauses: 'off' | 'natural' | 'long';
  /** Start chapters after the author's front matter (summary, disclaimer, notes). */
  ttsSkipNotes: boolean;
}

/** A fandom pinned to Browse. `path` is the site's own listing path. */
export interface PinnedFandom {
  source: SourceId;
  name: string;
  path: string;
}

/** Per-site switches (Settings → Sources). */
export interface SourceSettings {
  enabled: boolean;
}

export interface AppSettings {
  appearance: 'system' | 'light' | 'dark';
  /** FanFiction.net browsing defaults (its own rating / language / sort codes). */
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
  pinnedFandoms: PinnedFandom[];
  sources: Record<SourceId, SourceSettings>;
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
  ttsPauses: 'natural',
  ttsSkipNotes: true,
};

/** FanFiction.net is on; the other sites are switched on as they arrive. */
export const DEFAULT_SOURCES: Record<SourceId, SourceSettings> = {
  ffn: { enabled: true },
  ao3: { enabled: false },
  wp: { enabled: false },
  local: { enabled: true },
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
  sources: DEFAULT_SOURCES,
  reader: DEFAULT_READER,
};

function load(): AppSettings {
  try {
    const saved = kv.getSync<Partial<AppSettings>>('settings');
    const sources = { ...DEFAULT_SOURCES };
    for (const id of SOURCE_IDS) sources[id] = { ...DEFAULT_SOURCES[id], ...saved?.sources?.[id] };
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      pinnedFandoms: normalizePins(saved?.pinnedFandoms),
      sources,
      reader: { ...DEFAULT_READER, ...(saved?.reader ?? {}) },
    };
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

export function togglePinnedFandom(f: PinnedFandom) {
  const same = (p: PinnedFandom) => p.source === f.source && p.path === f.path;
  settingsStore.set((s) => {
    const has = s.pinnedFandoms.some(same);
    return {
      ...s,
      pinnedFandoms: has ? s.pinnedFandoms.filter((p) => !same(p)) : [...s.pinnedFandoms, f],
    };
  });
}
