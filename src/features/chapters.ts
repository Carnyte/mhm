// Chapter text for the reader, the audiobook and downloads: the copy saved on the device, or the
// site. Stories are FanFiction.net ones for now; other sites plug in here later.

import { chapterStore } from '../db/kv';
import { getStory } from '../ffn/api';
import type { StoryDetail } from '../ffn/types';
import { ffnId } from '../sources/ffn/map';
import type { StoryKey } from '../sources/keys';

export function getSavedChapter(key: StoryKey, chapter: number): Promise<string | undefined> {
  return chapterStore.get(key, chapter);
}

/** Saves one chapter (the reader caches chapters you read, too). */
export function saveChapter(key: StoryKey, chapter: number, html: string): Promise<void> {
  return chapterStore.put(key, chapter, html);
}

/** The story's page for one chapter, from the site: metadata, chapter list and the chapter's text. */
export async function fetchChapter(key: StoryKey, chapter: number, opts: { quiet?: boolean } = {}): Promise<StoryDetail> {
  // async, so a key this can't fetch yet rejects (and shows an error) instead of throwing.
  return getStory(ffnId(key), chapter, opts);
}

export interface LoadedChapter {
  html: string;
  /** The story page, when the text came from the site. */
  detail?: StoryDetail;
  offline: boolean;
}

/** Chapter text: the saved copy when there is one (works offline and in the background), else the site. */
export async function loadChapter(key: StoryKey, chapter: number): Promise<LoadedChapter> {
  const saved = await getSavedChapter(key, chapter);
  if (saved) return { html: saved, offline: true };
  const detail = await fetchChapter(key, chapter);
  if (detail.chapterHtml) saveChapter(key, chapter, detail.chapterHtml).catch(() => {});
  return { html: detail.chapterHtml ?? '', detail, offline: false };
}

/** Fetches and saves a chapter in the background unless it's saved already, so it opens instantly. */
export function prefetchChapter(key: StoryKey, chapter: number) {
  getSavedChapter(key, chapter)
    .then((have) => {
      if (have) return;
      return fetchChapter(key, chapter, { quiet: true }).then((d) => {
        if (d.chapterHtml) return saveChapter(key, chapter, d.chapterHtml);
      });
    })
    .catch(() => {});
}
