// Chapter text for the reader, the audiobook and downloads: the copy saved on the device, or the
// story's site (through its Source, see src/sources/registry.ts).

import { chapterStore } from '../db/kv';
import { splitKey, type StoryKey } from '../sources/keys';
import { withKnownTitles } from '../sources/meta';
import { sourceOf } from '../sources/registry';
import type { ChapterContent, ChapterInfo, FetchOpts, StoryInfo } from '../sources/types';
import { libraryStore, patchStory } from '../state/library';
import { applyChapterIds, chapterIdsOf } from './chapterIds';

export function getSavedChapter(key: StoryKey, chapter: number): Promise<string | undefined> {
  return chapterStore.get(key, chapter);
}

/** Saves one chapter (the reader caches chapters you read, too), with the site's id for it. */
export function saveChapter(key: StoryKey, chapter: number, html: string, remoteId?: string): Promise<void> {
  return chapterStore.put(key, chapter, html, remoteId);
}

/** A story page's chapter ids, stored for a library story (moving reading state if they changed). */
async function syncChapterIds(key: StoryKey, info: StoryInfo | undefined) {
  const ids = info && chapterIdsOf(info);
  if (ids) await applyChapterIds(key, ids).catch(() => {});
}

/** The story's page from its site: metadata and chapter list. */
export async function fetchStory(key: StoryKey, opts: FetchOpts = {}): Promise<StoryInfo> {
  // async, so a key this can't fetch rejects (and shows an error) instead of throwing.
  const info = await sourceOf(key).getStory(splitKey(key).remoteId, opts);
  await syncChapterIds(key, info);
  // An update check found it gone, but here it is again.
  if (libraryStore.get().stories[key]?.gone) patchStory(key, { gone: false });
  return info;
}

/**
 * One chapter from the story's site. Chapter pages also carry the story's metadata (`story`) on
 * FanFiction.net and AO3, so reading a chapter refreshes the chapter count at no extra request.
 */
export async function fetchChapter(key: StoryKey, chapter: number | ChapterInfo, opts: FetchOpts = {}): Promise<ChapterContent> {
  const ch: ChapterInfo = typeof chapter === 'number' ? { number: chapter, title: '' } : { ...chapter };
  // The site's id for the chapter, when the library knows it (AO3 chapters are fetched by id).
  if (!ch.remoteId) {
    const id = libraryStore.get().stories[key]?.chapterIds?.[ch.number - 1];
    if (id) ch.remoteId = id;
  }
  let c: ChapterContent;
  try {
    c = await sourceOf(key).getChapter(splitKey(key).remoteId, ch, opts);
  } catch (e) {
    // A chapter that's gone comes with the story's current chapter ids (AO3): reading state
    // moves along before the error is shown.
    const ids = (e as { chapterIds?: unknown })?.chapterIds;
    if (Array.isArray(ids) && ids.length) await applyChapterIds(key, ids as string[]).catch(() => {});
    throw e;
  }
  // The text is saved and progress recorded under the number asked for, so it must be that chapter.
  if (c.number !== ch.number) throw new Error(`The site sent chapter ${c.number} instead of chapter ${ch.number}. Try again.`);
  await syncChapterIds(key, c.story);
  // The chapter menu AO3 pages carry shortens long titles; the library may know them whole.
  if (c.story) {
    const chapterList = withKnownTitles(c.story.chapterList, libraryStore.get().stories[key]);
    if (chapterList !== c.story.chapterList) c = { ...c, story: { ...c.story, chapterList } };
  }
  return c;
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

/**
 * A saved chapter the reader can show without asking the site: any saved chapter of a downloaded
 * story; for a site whose chapter text rarely changes (AO3), also a chapter read or prefetched
 * earlier, as long as it's still that chapter (its id is the library's id for the number) and the
 * story's version stamp isn't newer than the copy (an edit makes it stale).
 */
export async function usableSavedChapter(key: StoryKey, chapter: number): Promise<string | undefined> {
  const lib = libraryStore.get().stories[key];
  if (!lib) return undefined;
  const row = await chapterStore.getRow(key, chapter);
  if (!row?.html) return undefined;
  if (lib.downloaded) return row.html;
  if (!sourceOf(key).stableText) return undefined;
  const id = lib.chapterIds?.[chapter - 1];
  if (!id || row.remoteId !== id) return undefined;
  if (lib.version && (row.savedAt ?? 0) < lib.version * 1000) return undefined;
  return row.html;
}

/** Chapter text: the saved copy when there is one (works offline and in the background), else the site. */
export async function loadChapter(key: StoryKey, chapter: number): Promise<LoadedChapter> {
  const saved = await getSavedChapter(key, chapter);
  if (saved) return { html: saved, offline: true };
  const c = await fetchChapter(key, chapter);
  const html = renderChapter(c);
  if (html) saveChapter(key, chapter, html, c.remoteId).catch(() => {});
  return { html, story: c.story, offline: false };
}

/**
 * Fetches and saves a chapter in the background unless it's saved already, so it opens instantly.
 * For a site whose saved chapters the reader shows again (AO3), "saved" means a copy the reader
 * will use (see usableSavedChapter), so opening the chapter never asks the site a second time.
 */
export function prefetchChapter(key: StoryKey, chapter: number) {
  (sourceOf(key).stableText ? usableSavedChapter(key, chapter) : getSavedChapter(key, chapter))
    .then((have) => {
      if (have) return;
      return fetchChapter(key, chapter, { quiet: true, priority: 'background' }).then((c) => {
        const html = renderChapter(c);
        if (html) return saveChapter(key, chapter, html, c.remoteId);
      });
    })
    .catch(() => {});
}
