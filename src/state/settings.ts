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
  /** Show authors' notes (AO3) collapsed to a one-line bar; tap to open. */
  collapseNotes: boolean;
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
  /** AO3: ask before opening a Mature, Explicit or Not Rated work the first time. */
  askAdult?: boolean;
  /**
   * Fandoms hidden from this site's lists and search, by their exact name (AO3). FanFiction.net's
   * are `AppSettings.excludedFandoms`, where older builds read them.
   */
  hiddenFandoms?: string[];
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
  /** FanFiction.net fandoms hidden from its lists and search (other sites: `sources[id].hiddenFandoms`). */
  excludedFandoms: string[];
  pinnedFandoms: PinnedFandom[];
  sources: Record<SourceId, SourceSettings>;
  reader: ReaderSettings;
  /** When every site with stories to check had last been checked (what the screens show). */
  lastUpdateCheck?: number;
  /** When each site's stories were last all checked: automatic checks are due per site. */
  lastUpdateCheckBySource?: Partial<Record<SourceId, number>>;
  onboarded?: boolean;
  /** The site whose Browse home / search form is showing (when more than one is on). */
  browseSource?: SourceId;
  searchScope?: SourceId;
  /** The newest "What's new" sheet the user has seen (see WHATS_NEW_VERSION). */
  whatsNewSeen?: number;
  /** Format of these settings; see migrateSettings. */
  settingsVersion?: number;
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
  collapseNotes: false,
};

/** FanFiction.net and AO3 are on; Wattpad arrives later. */
export const DEFAULT_SOURCES: Record<SourceId, SourceSettings> = {
  ffn: { enabled: true },
  ao3: { enabled: true, askAdult: true },
  wp: { enabled: false },
  local: { enabled: true },
};

/**
 * 2: AO3 became readable and on by default. Settings saved before held `ao3: {enabled: false}`
 * only because that was the default (there was no switch for it), so it's turned on once;
 * from then on the switch in Settings → Sources is the user's choice and is kept.
 */
export const SETTINGS_VERSION = 2;

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
  settingsVersion: SETTINGS_VERSION,
};

/** Saved settings (any older format) completed with the defaults and brought up to date. */
export function migrateSettings(saved: Partial<AppSettings> | undefined): AppSettings {
  const sources = { ...DEFAULT_SOURCES };
  for (const id of SOURCE_IDS) sources[id] = { ...DEFAULT_SOURCES[id], ...saved?.sources?.[id] };
  if (saved && (saved.settingsVersion ?? 1) < 2) sources.ao3 = { ...sources.ao3, enabled: true };
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    pinnedFandoms: normalizePins(saved?.pinnedFandoms),
    sources,
    reader: { ...DEFAULT_READER, ...(saved?.reader ?? {}) },
    settingsVersion: SETTINGS_VERSION,
  };
}

function load(): AppSettings {
  try {
    return migrateSettings(kv.getSync<Partial<AppSettings>>('settings'));
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

export function updateSource(id: SourceId, patch: Partial<SourceSettings>) {
  settingsStore.set((s) => ({ ...s, sources: { ...s.sources, [id]: { ...s.sources[id], ...patch } } }));
}

/** The fandoms hidden from a site's lists and search. */
export function hiddenFandomsOf(source: SourceId, st: AppSettings = settingsStore.get()): string[] {
  return source === 'ffn' ? st.excludedFandoms : (st.sources[source]?.hiddenFandoms ?? []);
}

/** Whether a work names a hidden fandom, by its exact name (AO3's fandom tags; a crossover names several). */
export function hasHiddenFandom(fandoms: readonly string[] | undefined, hidden: readonly string[]): boolean {
  return !!hidden.length && !!fandoms?.some((f) => hidden.includes(f));
}

/** Hides (or shows again) a fandom in one site's lists and search. */
export function setFandomHidden(source: SourceId, fandom: string, hidden: boolean) {
  const cur = hiddenFandomsOf(source);
  if (cur.includes(fandom) === hidden) return;
  const next = hidden ? [...cur, fandom] : cur.filter((f) => f !== fandom);
  if (source === 'ffn') updateSettings({ excludedFandoms: next });
  else updateSource(source, { hiddenFandoms: next });
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
