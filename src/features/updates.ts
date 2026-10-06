// New-chapter checks for library stories, local notifications, and account sync.

import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getAccountAuthors, getAccountStories, getStory } from '../ffn/api';
import type { StorySummary, UserRef } from '../ffn/types';
import { bridge } from '../net/bridge';
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
          data: { storyId: u.story.id },
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
 * Checks each story's first page for its chapter count. Polite: 2 at a time.
 * Returns the stories that gained chapters.
 */
export async function checkForUpdates(opts: { quiet?: boolean; ids?: number[] } = {}) {
  if (checkStore.get().running) return [];
  const list = opts.ids
    ? opts.ids.map((id) => libraryStore.get().stories[id]).filter(Boolean)
    : storiesToCheck();
  checkStore.set({ running: true, done: 0, total: list.length });
  const updated: { story: LibraryStory; added: number }[] = [];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const s = list[i++];
      try {
        const d = await getStory(s.id, 1, { quiet: opts.quiet });
        const before = s.chapters;
        const next = upsertStory(d, { lastCheckedAt: Date.now() });
        if (next && d.chapters > before) {
          updated.push({ story: next, added: d.chapters - before });
        }
      } catch (e) {
        checkStore.set((c) => ({ ...c, lastError: (e as Error).message }));
      }
      checkStore.set((c) => ({ ...c, done: c.done + 1 }));
    }
  };
  try {
    await Promise.all([worker(), worker()]);
  } finally {
    checkStore.set((c) => ({ ...c, running: false }));
    updateSettings({ lastUpdateCheck: Date.now() });
  }
  await notify(updated);
  await autoDownload(updated.map((u) => u.story));
  return updated;
}

async function autoDownload(stories: LibraryStory[]) {
  const st = settingsStore.get();
  if (!st.autoDownloadUpdates) return;
  const targets = stories.filter((s) => s.downloaded);
  if (!targets.length) return;
  if (st.wifiOnly && Platform.OS !== 'web') {
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.type !== Network.NetworkStateType.WIFI) return;
  }
  for (const s of targets) await downloadStory(s, { quiet: true });
}

/** Pulls Follows / Favorites / followed & favourite authors from the account into the library. */
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
  syncAccountList('followed', follows);
  const favorites = await collectAll('favStories');
  syncAccountList('favorited', favorites);
  try {
    syncAuthors('followed', await collectAuthors('authorAlerts'));
    syncAuthors('favorited', await collectAuthors('favAuthors'));
  } catch {
    // author lists are optional
  }
  setLastSync(Date.now());
  return { follows: follows.length, favorites: favorites.length };
}

export function totalNewChapters(): number {
  return Object.values(libraryStore.get().stories).reduce((n, s) => n + (newChapterCount(s) > 0 ? 1 : 0), 0);
}

export function snoozeStory(id: number, notify: boolean) {
  patchStory(id, { notify });
}

// --- Background task (best effort) --------------------------------------------------------

if (Platform.OS !== 'web') {
  TaskManager.defineTask(UPDATE_TASK, async () => {
    try {
      // The bridge WebView only exists while the app process is alive; skip if it isn't up.
      if (!bridge.pageReady) return BackgroundTask.BackgroundTaskResult.Success;
      await checkForUpdates({ quiet: true });
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
