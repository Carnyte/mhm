// Clipped stories in the library ("Clip this page"): a clipped page saved as a new local story, or
// added to the end of one clipped before, and the last chapter taken off again when it was the
// wrong page. A clipped story is an ordinary imported story (offline reader, audiobook, bookmarks)
// whose `local.clip` remembers the site and the page each chapter came from.
//
// Nothing here touches the network: the text is what the page already showed.

import { strToU8 } from 'fflate';
import * as player from '../audio/player';
import { playerStore } from '../audio/state';
import { chapterStore, kv } from '../db/kv';
import { invalidate } from '../hooks/useQuery';
import { wordsOfHtml } from '../import/build';
import { cleanClipUrl } from '../import/clip';
import type { ImportedBook } from '../import/types';
import { hostOf } from '../net/httpCore';
import type { StoryKey } from '../sources/keys';
import type { ChapterRemap } from '../sources/remap';
import { remapStoryState } from '../sources/remap';
import { libraryStore, patchStory, remapStoryBookmarks, type ClipInfo, type LibraryStory } from '../state/library';
import { announceRemap } from './chapterIds';
import { writing } from './importFiles';
import { commitImport, contentHash } from './imports';

export { cleanClipUrl } from '../import/clip';
export { isNativeHost } from '../net/webPolicy';

/** A clipped story and its pages (only stories whose record says they were clipped). */
export type ClippedStory = LibraryStory & { local: NonNullable<LibraryStory['local']> & { clip: ClipInfo } };

const isClipped = (s: LibraryStory | undefined): s is ClippedStory => !!s && s.source === 'local' && !!s.local?.clip;

/** Clipped stories (of one site, given its host), most recently read or added first. */
export function clippedStories(host?: string): ClippedStory[] {
  const site = host?.toLowerCase();
  return Object.values(libraryStore.get().stories)
    .filter(isClipped)
    .filter((s) => !site || s.local.clip.site === site)
    .sort((a, b) => Math.max(b.lastReadAt ?? 0, b.addedAt ?? 0) - Math.max(a.lastReadAt ?? 0, a.addedAt ?? 0));
}

/** The clipped story this tap would most likely add to: the one asked for, else the site's only one. */
export function defaultClipTarget(url: string, clipFor?: string): ClippedStory | undefined {
  const asked = clipFor ? libraryStore.get().stories[clipFor as StoryKey] : undefined;
  if (isClipped(asked)) return asked;
  const site = clippedStories(hostOf(url));
  return site.length === 1 ? site[0] : undefined;
}

/** Where a page was clipped already: the story and its chapter number. */
export function findClippedPage(url: string): { story: ClippedStory; chapter: number } | undefined {
  const clean = cleanClipUrl(url);
  if (!clean) return undefined;
  for (const story of clippedStories()) {
    const i = story.local.clip.urls.indexOf(clean);
    if (i >= 0) return { story, chapter: i + 1 };
  }
  return undefined;
}

const bytesOf = (book: ImportedBook) => strToU8(book.chapters.map((c) => c.html).join('\n'));

/** Saves a clipped page as a new local story; returns its key. */
export async function commitClip(book: ImportedBook, o: { title?: string; authors?: string[]; url: string }): Promise<StoryKey> {
  const url = cleanClipUrl(o.url);
  const site = hostOf(url);
  if (!url.startsWith('https://') || !site) throw new Error('Only secure (https) pages can be clipped.');
  const bytes = bytesOf(book);
  return commitImport(
    book,
    { name: site, size: bytes.length, contentHash: contentHash(bytes) },
    {
      mode: 'local',
      title: o.title,
      authors: o.authors,
      // The page itself is never kept: only its text.
      keepOriginal: false,
      clip: { site, lastUrl: url, urls: book.chapters.map(() => url) },
    },
  );
}

function clippedOrThrow(key: StoryKey): ClippedStory {
  const story = libraryStore.get().stories[key];
  if (!isClipped(story)) throw new Error('That story isn’t a clipped story in your library any more.');
  if (!kv.writable) throw new Error('Nothing can be saved right now: the storage upgrade didn’t finish.');
  return story;
}

/**
 * Adds a clipped page's chapters to the end of a clipped story. Reading progress and bookmarks
 * stay; the new chapters count as read-ready (no "new chapter" badge). Returns the first new
 * chapter's number.
 */
export async function appendClip(key: StoryKey, book: ImportedBook, pageUrl: string): Promise<number> {
  const story = clippedOrThrow(key);
  const url = cleanClipUrl(pageUrl);
  if (!url.startsWith('https://')) throw new Error('Only secure (https) pages can be clipped.');
  if (writing.has(key)) throw new Error('This story is being saved already. Try again in a moment.');
  const n = story.chapters;
  const numbers = book.chapters.map((_, i) => n + 1 + i);
  writing.add(key);
  try {
    await chapterStore.putMany(
      key,
      book.chapters.map((c, i) => ({ number: numbers[i], html: c.html })),
    );
  } catch (e) {
    // Nothing half-added stays behind.
    await chapterStore.renumber(key, new Map(numbers.map((m) => [m, null]))).catch(() => {});
    throw e;
  } finally {
    writing.delete(key);
  }
  const count = n + book.chapters.length;
  const size = bytesOf(book).length;
  patchStory(key, (s) => {
    const local = s.local!;
    const clip = local.clip!;
    return {
      chapters: count,
      chapterTitles: [...Array.from({ length: n }, (_, i) => s.chapterTitles?.[i] ?? `Chapter ${i + 1}`), ...book.chapters.map((c) => c.title)],
      words: (s.words ?? 0) + book.words,
      updated: Math.floor(Date.now() / 1000),
      downloaded: true,
      downloadedChapters: [...new Set([...(s.downloadedChapters ?? []), ...numbers])].sort((a, b) => a - b),
      knownChapters: count,
      local: { ...local, chapters: count, size: local.size + size, clip: { ...clip, lastUrl: url, urls: [...clip.urls.slice(0, n), ...book.chapters.map(() => url)] } },
    };
  });
  invalidate(`story:${key}`);
  return n + 1;
}

/**
 * Takes the last chapter off a clipped story (a page clipped by mistake). Reading progress there
 * moves back to the chapter before; bookmarks in it move with it; a listening position in it is
 * dropped. A one-chapter story can't lose its only chapter: delete the story instead.
 */
export async function undoLastClip(key: StoryKey): Promise<void> {
  const story = clippedOrThrow(key);
  const n = story.chapters;
  if (n <= 1) throw new Error('This story has only one chapter. Delete the story instead.');
  if (writing.has(key)) throw new Error('This story is being saved right now. Try again in a moment.');
  const ps = playerStore.get();
  if (ps.story?.key === key && ps.chapter === n) player.stop();
  const html = (await chapterStore.get(key, n)) ?? '';
  const words = html ? wordsOfHtml(html) : 0;
  const bytes = html ? strToU8(html).length : 0;
  await chapterStore.renumber(key, new Map([[n, null]]));
  const moves: Record<number, number> = {};
  for (let i = 1; i < n; i++) moves[i] = i;
  const r: ChapterRemap = { moves, removed: [n], changed: true };
  patchStory(key, (s) => {
    const local = s.local!;
    const clip = local.clip!;
    const urls = clip.urls.slice(0, n - 1);
    return {
      ...remapStoryState(s, r),
      chapters: n - 1,
      chapterTitles: s.chapterTitles?.slice(0, n - 1),
      words: Math.max(0, (s.words ?? 0) - words),
      knownChapters: n - 1,
      local: { ...local, chapters: n - 1, size: Math.max(0, local.size - bytes), clip: { ...clip, urls, lastUrl: urls[urls.length - 1] ?? clip.lastUrl } },
    };
  });
  remapStoryBookmarks(key, r);
  announceRemap(key, r);
  invalidate(`story:${key}`);
}
