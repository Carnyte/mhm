// Offline downloads: fetches every chapter through the bridge and stores the HTML in SQLite.

import { toast } from '../components/Sheet';
import { chapterStore } from '../db/kv';
import { getStory } from '../ffn/api';
import type { StoryDetail, StorySummary } from '../ffn/types';
import { libraryStore, patchStory, upsertStory, type LibraryStory } from '../state/library';
import { createStore, useStore } from '../state/store';
import { errorMessage } from '../utils/format';

export interface DownloadJob {
  storyId: number;
  title: string;
  done: number;
  total: number;
  error?: string;
}

export const downloadsStore = createStore<Record<number, DownloadJob>>({});

export function useDownloadJob(id: number): DownloadJob | undefined {
  return useStore(downloadsStore, (s) => s[id]);
}

export function useDownloadJobs(): DownloadJob[] {
  return Object.values(useStore(downloadsStore));
}

function setJob(id: number, job: DownloadJob | null) {
  downloadsStore.set((s) => {
    const next = { ...s };
    if (job) next[id] = job;
    else delete next[id];
    return next;
  });
}

/** Saves one chapter (used by the reader so chapters you read are cached too). */
export async function saveChapter(storyId: number, chapter: number, html: string) {
  await chapterStore.put(storyId, chapter, html);
}

export async function getSavedChapter(storyId: number, chapter: number): Promise<string | undefined> {
  return chapterStore.get(storyId, chapter);
}

/** Downloads all missing chapters. `onlyNew` only fetches chapters not saved yet (update sync). */
export async function downloadStory(story: StorySummary | StoryDetail | LibraryStory, opts: { quiet?: boolean } = {}) {
  if (downloadsStore.get()[story.id]) return;
  const have = new Set(await chapterStore.list(story.id));
  setJob(story.id, { storyId: story.id, title: story.title, done: 0, total: story.chapters || 1 });
  try {
    // Chapter 1 also refreshes metadata (chapter count may have changed).
    let detail: StoryDetail | undefined;
    if (!have.has(1) || !('chapterList' in story)) {
      detail = await getStory(story.id, 1, { quiet: opts.quiet });
      if (detail.chapterHtml) await chapterStore.put(story.id, 1, detail.chapterHtml);
      have.add(1);
    }
    const total = detail?.chapters ?? story.chapters ?? 1;
    upsertStory(detail ?? (story as StorySummary), { downloaded: true, inLibrary: true });
    let done = have.size;
    setJob(story.id, { storyId: story.id, title: story.title, done, total });
    for (let n = 1; n <= total; n++) {
      if (have.has(n)) continue;
      if (!downloadsStore.get()[story.id]) return; // cancelled
      const ch = await getStory(story.id, n, { quiet: opts.quiet });
      if (ch.chapterHtml) await chapterStore.put(story.id, n, ch.chapterHtml);
      done++;
      setJob(story.id, { storyId: story.id, title: story.title, done, total });
    }
    patchStory(story.id, { downloaded: true, downloadedChapters: await chapterStore.list(story.id) });
    if (!opts.quiet) toast(`Downloaded “${story.title}”`, 'success');
  } catch (e) {
    patchStory(story.id, { downloadedChapters: await chapterStore.list(story.id) });
    if (!opts.quiet) toast(`Download stopped: ${errorMessage(e)}`, 'error');
  } finally {
    setJob(story.id, null);
  }
}

export function cancelDownload(id: number) {
  setJob(id, null);
}

export async function removeDownload(id: number) {
  cancelDownload(id);
  await chapterStore.remove(id);
  patchStory(id, { downloaded: false, downloadedChapters: [] });
  toast('Download removed');
}

export async function removeAllDownloads() {
  await chapterStore.removeAll();
  for (const s of Object.values(libraryStore.get().stories)) {
    if (s.downloaded || s.downloadedChapters?.length) patchStory(s.id, { downloaded: false, downloadedChapters: [] });
  }
}

export async function downloadedBytes(id?: number): Promise<number> {
  return chapterStore.sizeBytes(id);
}
