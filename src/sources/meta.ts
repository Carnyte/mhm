// The site-neutral story model (StoryMeta / StoryInfo from an adapter) and library records, both
// ways: what a story page gives a library record, and a library record shown as a story page when
// the site can't be reached (downloaded stories, offline).

import type { LibraryAuthor, LibraryStory } from '../state/library';
import { sourceOf } from './registry';
import type { AuthorRef, StoryInfo, StoryMeta } from './types';

/** A site-neutral story (from an adapter); library records have no `url`. */
export function isStoryMeta(s: object): s is StoryMeta {
  return 'key' in s && 'url' in s;
}

/**
 * An author as the library stores it. FanFiction.net keeps its numeric user id there: that's what
 * the FFN screens and an older build installed again read.
 */
export function libraryAuthor(source: StoryMeta['source'], a: AuthorRef | undefined): LibraryAuthor | undefined {
  if (!a?.id) return undefined;
  const out: LibraryAuthor = { id: source === 'ffn' && /^\d+$/.test(a.id) ? Number(a.id) : a.id, name: a.name };
  if (a.avatarUrl) out.avatarUrl = a.avatarUrl;
  return out;
}

/** The metadata a story page or list row gives a library record. */
export function libraryMetaFromMeta(m: StoryMeta | StoryInfo): Partial<LibraryStory> {
  const out: Partial<LibraryStory> = {
    key: m.key,
    source: m.source,
    remoteId: m.remoteId,
    title: m.title,
    summary: m.summary,
    fandom: m.fandom,
    isCrossover: m.isCrossover,
    rating: m.rating,
    language: m.language,
    genres: m.genres,
    characters: m.characters,
    chapters: m.chapters,
    words: m.words,
    stats: { ...m.stats },
    updated: m.updated,
    published: m.published,
    complete: m.complete,
  };
  const author = libraryAuthor(m.source, m.author);
  if (author) out.author = author;
  if (m.coverUrl) out.coverUrl = m.coverUrl;
  const info = m as Partial<StoryInfo>;
  if (info.chapterList?.length) out.chapterTitles = info.chapterList.map((c) => c.title);
  if (info.ffn?.storyTextId) out.ffn = { storyTextId: info.ffn.storyTextId };
  return out;
}

/**
 * A library record as a story page, for showing it without the site. Chapter titles the library
 * hasn't seen are "Chapter N".
 */
export function infoFromLibrary(lib: LibraryStory): StoryInfo {
  const out: StoryInfo = {
    key: lib.key,
    source: lib.source,
    remoteId: lib.remoteId,
    url: sourceOf(lib.key).webUrl(lib.remoteId),
    title: lib.title,
    summary: lib.summary,
    fandom: lib.fandom,
    isCrossover: lib.isCrossover,
    rating: lib.rating,
    language: lib.language,
    genres: lib.genres ?? [],
    characters: lib.characters,
    chapters: lib.chapters,
    words: lib.words,
    stats: { ...lib.stats },
    updated: lib.updated,
    published: lib.published,
    complete: lib.complete,
    coverUrl: lib.coverUrl,
    chapterList: (lib.chapterTitles ?? Array.from({ length: lib.chapters }, (_, i) => `Chapter ${i + 1}`)).map((title, i) => ({ number: i + 1, title })),
  };
  if (lib.author) out.author = { source: lib.source, id: String(lib.author.id), name: lib.author.name, ...(lib.author.avatarUrl ? { avatarUrl: lib.author.avatarUrl } : {}) };
  if (lib.ffn) out.ffn = { storyTextId: lib.ffn.storyTextId, breadcrumbs: [] };
  return out;
}
