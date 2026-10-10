// New-chapter checks for library stories, local notifications, and account sync.

import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { kv } from '../db/kv';
import { getAccountAuthors, getAccountStories } from '../ffn/api';
import { FfnPageError } from '../ffn/parsers/story';
import type { StorySummary, UserRef } from '../ffn/types';
import { bridge } from '../net/bridge';
import { SOURCE_IDS, type SourceId, type StoryKey } from '../sources/keys';
import { getSource } from '../sources/registry';
import type { Source, UpdateResult } from '../sources/types';
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

/**
 * Stories worth checking: followed, favourited-and-incomplete, saved or downloaded, not complete,
 * and not gone from their site. The ones checked longest ago come first, so a check that's cut
 * short (the background window ends) picks up where the last one stopped.
 */
export function storiesToCheck(): LibraryStory[] {
  return Object.values(libraryStore.get().stories)
    .filter((s) => checkable(s.source))
    .filter((s) => s.notify !== false && !s.complete && !s.gone && (s.followed || s.inLibrary || s.downloaded || (s.lastReadAt && s.favorited)))
    .sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0));
}

/** How long the background task may spend asking sites (iOS gives it a short window). */
export const BACKGROUND_BUDGET_MS = 25_000;
/** Downloads refreshed only because the site's version changed, per check (oldest copies first). */
export const MAX_QUIET_REDOWNLOADS = 3;

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

/** A site whose stories can be checked: on, readable, with updates (imported files have none). */
function checkable(id: SourceId): boolean {
  const src = getSource(id);
  return src.caps.updates && src.enabled() && !src.comingSoon;
}

/** Sites with stories to check that can be checked (on, readable). */
function checkableSources(): SourceId[] {
  return [...new Set(storiesToCheck().map((s) => s.source))].filter(checkable);
}

/** When a site's stories were last all checked (before per-site stamps: the last check at all). */
export function lastCheckOf(id: SourceId, st = settingsStore.get()): number {
  return st.lastUpdateCheckBySource?.[id] ?? st.lastUpdateCheck ?? 0;
}

/**
 * Sites whose stories are due a check (the check interval, or `share` of it, has passed since that
 * site was last checked). Each site has its own clock, so a check that could only reach AO3
 * (FanFiction.net's hidden browser wasn't up) never puts off FanFiction.net's.
 */
export function dueSources(now = Date.now(), share = 1): SourceId[] {
  const st = settingsStore.get();
  const interval = Math.max(30, st.checkIntervalHours * 60) * 60_000 * share;
  return checkableSources().filter((id) => now - lastCheckOf(id, st) >= interval);
}

/**
 * Records which sites this check covered (every one of their stories got an answer, an error
 * included: a site that's down isn't asked again at once). `lastUpdateCheck` stays "everything
 * was checked by then", what the screens show: the oldest stamp among sites with stories to check.
 */
function stampChecked(covered: SourceId[], now: number) {
  const st = settingsStore.get();
  const by = { ...st.lastUpdateCheckBySource };
  for (const id of covered) by[id] = now;
  const sites = checkableSources();
  const oldest = sites.length ? Math.min(...sites.map((id) => by[id] ?? st.lastUpdateCheck ?? 0)) : covered.length ? now : (st.lastUpdateCheck ?? 0);
  updateSettings({ lastUpdateCheckBySource: by, ...(oldest > (st.lastUpdateCheck ?? 0) ? { lastUpdateCheck: oldest } : {}) });
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

export interface CheckOptions {
  quiet?: boolean;
  keys?: StoryKey[];
  /** Only these sites (the background task skips FanFiction.net when its hidden browser isn't up). */
  sources?: SourceId[];
  /** Start no request after this time (ms since epoch): the background task's budget. */
  deadline?: number;
  /** Stops the check (the background window ended). */
  signal?: AbortSignal;
  /** Run by the background task (not something the user started). */
  background?: boolean;
}

/**
 * Checks library stories for new chapters, the ones checked longest ago first. FanFiction.net:
 * each story's page, 2 at a time. Sites with a batched check (AO3: one search per 20 works) run
 * alongside, through their own client, and each batch's answers are saved as they arrive.
 * `sources` limits the check to some sites; `deadline` and `signal` cut it short (what was
 * learnt is kept, and the rest is first in line next time). Returns the stories that gained chapters.
 */
export async function checkForUpdates(opts: CheckOptions = {}) {
  // Nothing could be saved after a failed storage upgrade (see MigrationFailed).
  if (checkStore.get().running || !kv.writable) return [];
  const all = opts.keys ? opts.keys.map((key) => libraryStore.get().stories[key]).filter(Boolean) : storiesToCheck();
  const list = all.filter((s) => checkable(s.source) && (!opts.sources || opts.sources.includes(s.source)));
  checkStore.set({ running: true, done: 0, total: list.length });
  const updated: { story: LibraryStory; added: number }[] = [];
  const stale: LibraryStory[] = [];
  const failed = (e: unknown) => checkStore.set((c) => ({ ...c, lastError: (e as Error).message }));
  const tick = (n = 1) => checkStore.set((c) => ({ ...c, done: c.done + n }));
  const stopped = () => !!opts.signal?.aborted || (opts.deadline != null && Date.now() > opts.deadline);
  /** Stories that got an answer (an error included). */
  const answered = new Set<StoryKey>();

  // One story page at a time per worker (FanFiction.net's bridge, two workers).
  const perStory = list.filter((s) => !getSource(s.source).checkUpdates);
  let i = 0;
  const worker = async () => {
    while (i < perStory.length) {
      if (stopped()) return;
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
        // Deleted on the site: checked again later, but not first in line every time.
        if (e instanceof FfnPageError && e.code === 'not_found') patchStory(s.key, { lastCheckedAt: Date.now() });
      }
      answered.add(s.key);
      tick();
    }
  };

  /** One answer of a batched check, saved as it arrives. */
  const apply = async (r: UpdateResult) => {
    const before = libraryStore.get().stories[r.key];
    if (!before) return;
    // Not checked: it keeps its place at the front of the line.
    if (r.error) {
      if (!isAbort(r.error)) failed(r.error);
      return;
    }
    const now = Date.now();
    if (r.gone) {
      // Not on the site any more: not asked about again (opening it clears this).
      patchStory(r.key, { gone: true, lastCheckedAt: now });
      return;
    }
    if (r.restricted) {
      patchStory(r.key, { restricted: true, lastCheckedAt: now });
      return;
    }
    if (r.chapterIds) await applyChapterIds(r.key, r.chapterIds);
    // Titles seen whole and in the current order (AO3's /navigate).
    if (r.chapterTitles?.length) patchStory(r.key, { chapterTitles: [...r.chapterTitles] });
    const seen = r.info ?? r.meta;
    const back = before.gone ? { gone: false } : {};
    if (seen) upsertStory(seen, { lastCheckedAt: now, ...back });
    else patchStory(r.key, (s) => ({ lastCheckedAt: now, ...back, ...(r.chapters && r.chapters > s.chapters ? { chapters: r.chapters } : {}) }));
    const after = libraryStore.get().stories[r.key] ?? before;
    // News is a new chapter only; any other edit just makes a download stale.
    if (r.changed && after.chapters > before.chapters) updated.push({ story: after, added: after.chapters - before.chapters });
    else if (r.redownload && after.downloaded) stale.push(after);
  };

  // Batched checks, one site after another inside each site (its client paces them).
  const batched = async (source: Source) => {
    const stories = list.filter((s) => s.source === source.id);
    if (!stories.length) return;
    const handed = new Set<UpdateResult>();
    const take = async (rs: UpdateResult[]) => {
      for (const r of rs) {
        handed.add(r);
        await apply(r);
        if (!answered.has(r.key)) {
          answered.add(r.key);
          tick();
        }
      }
    };
    try {
      const results = await source.checkUpdates!(stories, {
        quiet: opts.quiet,
        priority: 'background',
        deadline: opts.deadline,
        signal: opts.signal,
        onResults: take,
      });
      // Anything the site didn't hand over as it arrived.
      await take(results.filter((r) => !handed.has(r)));
    } catch (e) {
      if (!isAbort(e)) failed(e);
    }
    // Works the check didn't reach still count towards the progress bar.
    const left = stories.filter((s) => !answered.has(s.key)).length;
    if (left) tick(left);
  };

  try {
    const sites = [...new Set(list.map((s) => s.source))].map(getSource).filter((src) => src.checkUpdates);
    await Promise.all([worker(), worker(), ...sites.map(batched)]);
  } finally {
    checkStore.set((c) => ({ ...c, running: false }));
    if (!opts.keys) {
      // A site counts as checked when every one of its stories got an answer.
      const scope = opts.sources ?? SOURCE_IDS;
      stampChecked(
        scope.filter((id) => list.every((s) => s.source !== id || answered.has(s.key))),
        Date.now(),
      );
    }
  }
  await notify(updated);
  const grown = updated.map((u) => u.story);
  if (!opts.signal?.aborted) await autoDownload(grown, stale, opts);
  return updated;
}

/**
 * New chapters of downloaded stories (and stale whole-story downloads) are fetched quietly, in
 * the background queue. Refreshes only because the site's version changed (AO3 edits) are a few
 * per check, oldest copies first and not after the deadline: the rest stay stale and come up
 * again at the next check.
 */
async function autoDownload(stories: LibraryStory[], stale: LibraryStory[] = [], o: { deadline?: number; signal?: AbortSignal; background?: boolean } = {}) {
  const st = settingsStore.get();
  if (!st.autoDownloadUpdates) return;
  // A download reads the story's page, which a site with accounts records in the user's history
  // (AO3): never from the background while logged in there. The next check the user starts does it.
  const allowed = (s: LibraryStory) => !(o.background && getSource(s.source).session?.get().loggedIn);
  const grown = stories.filter((s) => s.downloaded && allowed(s));
  const refresh = stale
    .filter(allowed)
    .filter((s) => !stories.some((x) => x.key === s.key))
    .sort((a, b) => (a.downloadedVersion ?? 0) - (b.downloadedVersion ?? 0))
    .slice(0, MAX_QUIET_REDOWNLOADS);
  if (!grown.length && !refresh.length) return;
  if (st.wifiOnly && Platform.OS !== 'web') {
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.type !== Network.NetworkStateType.WIFI) return;
  }
  for (const s of grown) {
    if (o.signal?.aborted) return;
    await downloadStory(s, { quiet: true, priority: 'background' });
  }
  for (const s of refresh) {
    if (o.signal?.aborted || (o.deadline != null && Date.now() > o.deadline)) return;
    await downloadStory(s, { quiet: true, priority: 'background' });
  }
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

/**
 * The background task's check, of the sites that are due: FanFiction.net goes through its hidden
 * browser, which only exists while the app process is alive; when it isn't up, only the sites the
 * app reaches directly (AO3) are checked. iOS gives the task a short window, so it stops starting
 * requests after BACKGROUND_BUDGET_MS, and at once when iOS says the window is over.
 */
export async function runBackgroundCheck() {
  // Sites checked recently (the app was open) wait; iOS doesn't run the task on the dot, hence half
  // the interval.
  const sources = dueSources(Date.now(), 0.5).filter((id) => id !== 'ffn' || bridge.pageReady);
  if (!sources.length) return;
  const ctrl = new AbortController();
  let sub: { remove: () => void } | undefined;
  try {
    sub = BackgroundTask.addExpirationListener?.(() => ctrl.abort());
  } catch {
    // Not available in this environment.
  }
  try {
    await checkForUpdates({
      quiet: true,
      sources,
      deadline: Date.now() + BACKGROUND_BUDGET_MS,
      signal: ctrl.signal,
      background: true,
    });
  } finally {
    sub?.remove();
  }
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask(UPDATE_TASK, async () => {
    try {
      await runBackgroundCheck();
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
