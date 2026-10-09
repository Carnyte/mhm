// Chapter text for the reader, the audiobook and downloads: the copy saved on the device, or the
// story's site (through its Source, see src/sources/registry.ts).

import { chapterStore } from '../db/kv';
import { splitKey, type StoryKey } from '../sources/keys';
import { sourceOf } from '../sources/registry';
import type { ChapterContent, ChapterInfo, FetchOpts, StoryInfo } from '../sources/types';

export function getSavedChapter(key: StoryKey, chapter: number): Promise<string | undefined> {
  return chapterStore.get(key, chapter);
}

/** Saves one chapter (the reader caches chapters you read, too). */
export function saveChapter(key: StoryKey, chapter: number, html: string): Promise<void> {
  return chapterStore.put(key, chapter, html);
}

/** The story's page from its site: metadata and chapter list. */
export async function fetchStory(key: StoryKey, opts: FetchOpts = {}): Promise<StoryInfo> {
  // async, so a key this can't fetch rejects (and shows an error) instead of throwing.
  return sourceOf(key).getStory(splitKey(key).remoteId, opts);
}

/**
 * One chapter from the story's site. On FanFiction.net the chapter's page also carries the story's
 * metadata (`story`), so reading a chapter refreshes the chapter count at no extra request.
 */
export async function fetchChapter(key: StoryKey, chapter: number | ChapterInfo, opts: FetchOpts = {}): Promise<ChapterContent> {
  const ch = typeof chapter === 'number' ? { number: chapter, title: '' } : chapter;
  return sourceOf(key).getChapter(splitKey(key).remoteId, ch, opts);
}

const notes = (html: string | undefined, pos: 'before' | 'after') =>
  html?.trim() ? `<aside class="fs-notes" data-pos="${pos}">${html}</aside>` : '';

/**
 * A chapter as the reader shows it and the device saves it: the author's notes before and after
 * the text become asides (`.fs-notes[data-pos]`), which the reader styles and the audiobook can
 * skip. Chapters without notes (all of FanFiction.net's) are just their text.
 */
export function renderChapter(c: Pick<ChapterContent, 'html' | 'notesBefore' | 'notesAfter'>): string {
  return notes(c.notesBefore, 'before') + c.html + notes(c.notesAfter, 'after');
}

export interface LoadedChapter {
  html: string;
  /** The story's metadata, when the text came from the site and its page carried it. */
  story?: StoryInfo;
  offline: boolean;
}

/** Chapter text: the saved copy when there is one (works offline and in the background), else the site. */
export async function loadChapter(key: StoryKey, chapter: number): Promise<LoadedChapter> {
  const saved = await getSavedChapter(key, chapter);
  if (saved) return { html: saved, offline: true };
  const c = await fetchChapter(key, chapter);
  const html = renderChapter(c);
  if (html) saveChapter(key, chapter, html).catch(() => {});
  return { html, story: c.story, offline: false };
}

/** Fetches and saves a chapter in the background unless it's saved already, so it opens instantly. */
export function prefetchChapter(key: StoryKey, chapter: number) {
  getSavedChapter(key, chapter)
    .then((have) => {
      if (have) return;
      return fetchChapter(key, chapter, { quiet: true, priority: 'background' }).then((c) => {
        const html = renderChapter(c);
        if (html) return saveChapter(key, chapter, html);
      });
    })
    .catch(() => {});
}
