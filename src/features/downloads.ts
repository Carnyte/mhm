// Offline downloads: fetches every chapter from the story's site and stores the HTML in SQLite.
// Sites that offer the whole story at once (AO3's official download) use their downloadAll, so
// a long work costs one request; others are fetched chapter by chapter, paced by their transport.

import { toast } from '../components/Sheet';
import { chapterStore } from '../db/kv';
import { splitKey, type StoryKey } from '../sources/keys';
import { sourceOf } from '../sources/registry';
import type { FetchOpts, Source, StoryInfo } from '../sources/types';
import { keyOf, libraryStore, patchStory, upsertStory, type AnyStory } from '../state/library';
import { createStore, useStore } from '../state/store';
import { errorMessage } from '../utils/format';
import { applyChapterIds, chapterIdsOf } from './chapterIds';
import { fetchChapter, renderChapter } from './chapters';

export interface DownloadJob {
  key: StoryKey;
  title: string;
  done: number;
  total: number;
  error?: string;
}

export const downloadsStore = createStore<Record<StoryKey, DownloadJob>>({});

export function useDownloadJob(key: StoryKey | null | undefined): DownloadJob | undefined {
  return useStore(downloadsStore, (s) => (key ? s[key] : undefined));
}

export function useDownloadJobs(): DownloadJob[] {
  return Object.values(useStore(downloadsStore));
}

function setJob(key: StoryKey, job: DownloadJob | null) {
  downloadsStore.set((s) => {
    const next = { ...s };
    if (job) next[key] = job;
    else delete next[key];
    return next;
  });
}

export interface DownloadStoryOpts {
  quiet?: boolean;
  /** Refresh a whole-story download even when it looks current. */
  force?: boolean;
  /** 'background' for downloads nobody tapped (after an update check): the site's wider spacing. */
  priority?: FetchOpts['priority'];
}

/**
 * Downloads all missing chapters (sites with a whole-story download: the whole story when the
 * saved copy is stale).
 */
export async function downloadStory(story: AnyStory, opts: DownloadStoryOpts = {}) {
  const key = keyOf(story);
  if (downloadsStore.get()[key]) return;
  const src = sourceOf(key);
  if (src.downloadAll) return downloadWhole(story, src, opts);
  const have = new Set(await chapterStore.list(key));
  setJob(key, { key, title: story.title, done: 0, total: story.chapters || 1 });
  try {
    // Chapter 1 also refreshes metadata (chapter count may have changed).
    let info: StoryInfo | undefined;
    if (!have.has(1) || !('chapterList' in story)) {
      const first = await fetchChapter(key, 1, { quiet: opts.quiet });
      const html = renderChapter(first);
      if (html) await chapterStore.put(key, 1, html);
      have.add(1);
      info = first.story;
    }
    const total = info?.chapters ?? story.chapters ?? 1;
    upsertStory(info ?? story, { downloaded: true, inLibrary: true });
    let done = have.size;
    setJob(key, { key, title: story.title, done, total });
    for (let n = 1; n <= total; n++) {
      if (have.has(n)) continue;
      if (!downloadsStore.get()[key]) return; // cancelled
      const html = renderChapter(await fetchChapter(key, n, { quiet: opts.quiet }));
      if (html) await chapterStore.put(key, n, html);
      done++;
      setJob(key, { key, title: story.title, done, total });
    }
    patchStory(key, { downloaded: true, downloadedChapters: await chapterStore.list(key) });
    if (!opts.quiet) toast(`Downloaded “${story.title}”`, 'success');
  } catch (e) {
    patchStory(key, { downloadedChapters: await chapterStore.list(key) });
    if (!opts.quiet) toast(`Download stopped: ${errorMessage(e)}`, 'error');
  } finally {
    setJob(key, null);
  }
}

const cancelled = () => Object.assign(new Error('The download was cancelled.'), { name: 'AbortError' });

/** The whole story in as few requests as the site allows, each chapter saved as it arrives. */
async function downloadWhole(story: AnyStory, src: Source, opts: DownloadStoryOpts) {
  const key = keyOf(story);
  const title = story.title;
  setJob(key, { key, title, done: 0, total: story.chapters || 1 });
  let total = story.chapters || 1;
  let done = 0;
  try {
    const lib = libraryStore.get().stories[key];
    const have = new Set(await chapterStore.list(key));
    const complete = !!lib?.downloaded && lib.chapters > 0 && Array.from({ length: lib.chapters }, (_, i) => have.has(i + 1)).every(Boolean);
    // A complete copy of the current version isn't downloaded again.
    const knownVersion = complete && !opts.force ? lib?.downloadedVersion : undefined;
    const info: StoryInfo = await src.downloadAll!(
      splitKey(key).remoteId,
      async (c) => {
        if (!downloadsStore.get()[key]) throw cancelled();
        const html = renderChapter(c);
        if (html) await chapterStore.put(key, c.number, html, c.remoteId);
        done++;
        setJob(key, { key, title, done, total });
      },
      {
        quiet: opts.quiet,
        priority: opts.priority,
        knownVersion,
        onInfo: async (i) => {
          total = i.chapters || 1;
          upsertStory(i, { inLibrary: true });
          // Chapters that moved take their saved text and progress along before new text lands.
          await applyChapterIds(key, chapterIdsOf(i));
          setJob(key, { key, title, done, total });
        },
      },
    );
    const upToDate = knownVersion != null && info.version === knownVersion;
    upsertStory(info, {
      downloaded: true,
      inLibrary: true,
      downloadedChapters: await chapterStore.list(key),
      ...(info.version && !upToDate ? { downloadedVersion: info.version } : {}),
    });
    if (!opts.quiet) toast(upToDate ? `“${title}” is already up to date` : `Downloaded “${title}”`, 'success');
  } catch (e) {
    patchStory(key, { downloadedChapters: await chapterStore.list(key) });
    if (!opts.quiet && (e as Error).name !== 'AbortError') toast(`Download stopped: ${errorMessage(e)}`, 'error');
  } finally {
    setJob(key, null);
  }
}

export function cancelDownload(key: StoryKey) {
  setJob(key, null);
}

export async function removeDownload(key: StoryKey) {
  cancelDownload(key);
  await chapterStore.remove(key);
  patchStory(key, { downloaded: false, downloadedChapters: [] });
  toast('Download removed');
}

export async function removeAllDownloads() {
  await chapterStore.removeAll();
  for (const s of Object.values(libraryStore.get().stories)) {
    if (s.downloaded || s.downloadedChapters?.length) patchStory(s.key, { downloaded: false, downloadedChapters: [] });
  }
}

export async function downloadedBytes(key?: StoryKey): Promise<number> {
  return chapterStore.sizeBytes(key);
}
