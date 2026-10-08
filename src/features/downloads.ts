// Offline downloads: fetches every chapter through the bridge and stores the HTML in SQLite.

import { toast } from '../components/Sheet';
import { chapterStore } from '../db/kv';
import type { StoryDetail } from '../ffn/types';
import type { StoryKey } from '../sources/keys';
import { keyOf, libraryStore, patchStory, upsertStory, type AnyStory } from '../state/library';
import { createStore, useStore } from '../state/store';
import { errorMessage } from '../utils/format';
import { fetchChapter } from './chapters';

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

/** Downloads all missing chapters. `onlyNew` only fetches chapters not saved yet (update sync). */
export async function downloadStory(story: AnyStory, opts: { quiet?: boolean } = {}) {
  const key = keyOf(story);
  if (downloadsStore.get()[key]) return;
  const have = new Set(await chapterStore.list(key));
  setJob(key, { key, title: story.title, done: 0, total: story.chapters || 1 });
  try {
    // Chapter 1 also refreshes metadata (chapter count may have changed).
    let detail: StoryDetail | undefined;
    if (!have.has(1) || !('chapterList' in story)) {
      detail = await fetchChapter(key, 1, { quiet: opts.quiet });
      if (detail.chapterHtml) await chapterStore.put(key, 1, detail.chapterHtml);
      have.add(1);
    }
    const total = detail?.chapters ?? story.chapters ?? 1;
    upsertStory(detail ?? story, { downloaded: true, inLibrary: true });
    let done = have.size;
    setJob(key, { key, title: story.title, done, total });
    for (let n = 1; n <= total; n++) {
      if (have.has(n)) continue;
      if (!downloadsStore.get()[key]) return; // cancelled
      const ch = await fetchChapter(key, n, { quiet: opts.quiet });
      if (ch.chapterHtml) await chapterStore.put(key, n, ch.chapterHtml);
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
