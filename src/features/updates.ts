// New-chapter checks for library stories, local notifications, and account sync.

import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { kv } from '../db/kv';
import { getAccountAuthors, getAccountStories } from '../ffn/api';
import type { StorySummary, UserRef } from '../ffn/types';
import { bridge } from '../net/bridge';
import type { SourceId, StoryKey } from '../sources/keys';
import { getSource } from '../sources/registry';
import type { Source } from '../sources/types';
import {
  libraryStore,
  newChapterCount,
  patchStory,
  setLastSync,
  syncAccountList,
  syncAuthors,
  upsertStory,
  type LibraryStory,
} from '../state/library';
import { getSession } from '../state/session';
import { settingsStore, updateSettings } from '../state/settings';
import { createStore, useStore } from '../state/store';
import { applyChapterIds } from './chapterIds';
import { fetchStory } from './chapters';
import { downloadStory } from './downloads';

export const UPDATE_TASK = 'ficshelf-update-check';

interface CheckState {
  running: boolean;
  done: number;
  total: number;
  lastError?: string;
}

export const checkStore = createStore<CheckState>({ running: false, done: 0, total: 0 });
export const useCheckState = () => useStore(checkStore);

/** Stories worth checking: followed, favourited-and-incomplete, saved or downloaded, not complete. */
export function storiesToCheck(): LibraryStory[] {
  return Object.values(libraryStore.get().stories).filter(
    (s) => s.notify !== false && !s.complete && (s.followed || s.inLibrary || s.downloaded || (s.lastReadAt && s.favorited)),
  );
}

async function notify(updates: { story: LibraryStory; added: number }[]) {
  if (!settingsStore.get().notifications || Platform.OS === 'web' || !updates.length) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  if (updates.length <= 3) {
    for (const u of updates) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: u.story.title,
          body: `${u.added} new chapter${u.added === 1 ? '' : 's'}${u.story.author ? ` from ${u.story.author.name}` : ''}`,
          // Taps are routed in app/_layout.tsx, which also takes the older `{ storyId }` payload.
          data: { storyKey: u.story.key },
        },
        trigger: null,
      });
    }
  } else {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${updates.length} stories updated`,
        body: updates
          .slice(0, 4)
          .map((u) => u.story.title)
          .join(', '),
        data: { screen: 'updates' },
      },
      trigger: null,
    });
  }
}

/**
 * Checks library stories for new chapters. FanFiction.net: each story's page, 2 at a time. Sites
 * with a batched check (AO3: one search per 20 works) run alongside, through their own client.
 * `sources` limits the check to some sites (the background task skips FanFiction.net when its
 * hidden browser isn't up). Returns the stories that gained chapters.
 */
export async function checkForUpdates(opts: { quiet?: boolean; keys?: StoryKey[]; sources?: SourceId[] } = {}) {
  // Nothing could be saved after a failed storage upgrade (see MigrationFailed).
  if (checkStore.get().running || !kv.writable) return [];
  const all = opts.keys ? opts.keys.map((key) => libraryStore.get().stories[key]).filter(Boolean) : storiesToCheck();
  const list = all.filter((s) => getSource(s.source).enabled() && !getSource(s.source).comingSoon && (!opts.sources || opts.sources.includes(s.source)));
  checkStore.set({ running: true, done: 0, total: list.length });
  const updated: { story: LibraryStory; added: number }[] = [];
  const stale: LibraryStory[] = [];
  const failed = (e: unknown) => checkStore.set((c) => ({ ...c, lastError: (e as Error).message }));
  const tick = (n = 1) => checkStore.set((c) => ({ ...c, done: c.done + n }));

  // One story page at a time per worker (FanFiction.net's bridge, two workers).
  const perStory = list.filter((s) => !getSource(s.source).checkUpdates);
  let i = 0;
  const worker = async () => {
    while (i < perStory.length) {
      const s = perStory[i++];
      try {
        const d = await fetchStory(s.key, { quiet: opts.quiet, priority: 'background' });
        const before = s.chapters;
        const next = upsertStory(d, { lastCheckedAt: Date.now() });
        if (next && d.chapters > before) {
          updated.push({ story: next, added: d.chapters - before });
        }
      } catch (e) {
        failed(e);
      }
      tick();
    }
  };

  // Batched checks, one site after another inside each site (its client paces them).
  const batched = async (source: Source) => {
    const stories = list.filter((s) => s.source === source.id);
    if (!stories.length) return;
    try {
      const results = await source.checkUpdates!(stories, { quiet: opts.quiet, priority: 'background' });
      for (const r of results) {
        const before = libraryStore.get().stories[r.key];
        if (!before) continue;
        if (r.error) failed(r.error);
        if (r.chapterIds) await applyChapterIds(r.key, r.chapterIds);
        const now = Date.now();
        const seen = r.info ?? r.meta;
        if (seen) upsertStory(seen, { lastCheckedAt: now });
        else patchStory(r.key, (s) => ({ lastCheckedAt: now, ...(r.chapters && r.chapters > s.chapters ? { chapters: r.chapters } : {}) }));
        const after = libraryStore.get().stories[r.key] ?? before;
        // News is a new chapter only; any other edit just makes a download stale.
        if (r.changed && after.chapters > before.chapters) updated.push({ story: after, added: after.chapters - before.chapters });
        else if (r.redownload && after.downloaded) stale.push(after);
      }
    } catch (e) {
      failed(e);
    }
    tick(stories.length);
  };

  try {
    const sites = [...new Set(list.map((s) => s.source))].map(getSource).filter((src) => src.checkUpdates);
    await Promise.all([worker(), worker(), ...sites.map(batched)]);
  } finally {
    checkStore.set((c) => ({ ...c, running: false }));
    updateSettings({ lastUpdateCheck: Date.now() });
  }
  await notify(updated);
  const grown = updated.map((u) => u.story);
  await autoDownload(grown, stale);
  return updated;
}

/** New chapters of downloaded stories (and stale whole-story downloads) are fetched quietly. */
async function autoDownload(stories: LibraryStory[], stale: LibraryStory[] = []) {
  const st = settingsStore.get();
  if (!st.autoDownloadUpdates) return;
  const targets = [...stories.filter((s) => s.downloaded), ...stale.filter((s) => !stories.some((x) => x.key === s.key))];
  if (!targets.length) return;
  if (st.wifiOnly && Platform.OS !== 'web') {
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.type !== Network.NetworkStateType.WIFI) return;
  }
  for (const s of targets) await downloadStory(s, { quiet: true });
}

/** Pulls Follows / Favorites / followed & favourite authors from the FanFiction.net account into the library. */
export async function syncAccount(): Promise<{ follows: number; favorites: number } | null> {
  if (!getSession().loggedIn) return null;
  const collectAll = async (list: 'storyAlerts' | 'favStories') => {
    const all: StorySummary[] = [];
    let page = 1;
    let last = 1;
    do {
      const r = await getAccountStories(list, page);
      all.push(...r.rows.map((x) => x.story));
      last = r.page.lastPage;
      page++;
    } while (page <= last && page <= 50);
    return all;
  };
  const collectAuthors = async (list: 'authorAlerts' | 'favAuthors') => {
    const all: UserRef[] = [];
    let page = 1;
    let last = 1;
    do {
      const r = await getAccountAuthors(list, page);
      all.push(...r.rows.map((x) => x.user));
      last = r.page.lastPage;
      page++;
    } while (page <= last && page <= 50);
    return all;
  };
  const follows = await collectAll('storyAlerts');
  syncAccountList('ffn', 'followed', follows);
  const favorites = await collectAll('favStories');
  syncAccountList('ffn', 'favorited', favorites);
  try {
    syncAuthors('ffn', 'followed', await collectAuthors('authorAlerts'));
    syncAuthors('ffn', 'favorited', await collectAuthors('favAuthors'));
  } catch {
    // author lists are optional
  }
  setLastSync(Date.now());
  return { follows: follows.length, favorites: favorites.length };
}

export function totalNewChapters(): number {
  return Object.values(libraryStore.get().stories).reduce((n, s) => n + (newChapterCount(s) > 0 ? 1 : 0), 0);
}

export function snoozeStory(key: StoryKey, notify: boolean) {
  patchStory(key, { notify });
}

// --- Background task (best effort) --------------------------------------------------------

if (Platform.OS !== 'web') {
  TaskManager.defineTask(UPDATE_TASK, async () => {
    try {
      // FanFiction.net goes through its hidden browser, which only exists while the app process is
      // alive; when it isn't up, only the sites the app reaches directly (AO3) are checked.
      await checkForUpdates({ quiet: true, sources: bridge.pageReady ? undefined : ['ao3'] });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function configureBackgroundChecks() {
  if (Platform.OS === 'web') return;
  const st = settingsStore.get();
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(UPDATE_TASK);
    if (st.notifications && !registered) {
      await BackgroundTask.registerTaskAsync(UPDATE_TASK, { minimumInterval: Math.max(15, st.checkIntervalHours * 60) });
    } else if (!st.notifications && registered) {
      await BackgroundTask.unregisterTaskAsync(UPDATE_TASK);
    }
  } catch {
    // Background tasks are unavailable in some environments (simulator, Expo Go).
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}
