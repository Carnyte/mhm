// The site-neutral story model (StoryMeta / StoryInfo from an adapter) and library records, both
// ways: what a story page gives a library record, and a library record shown as a story page when
// the site can't be reached (downloaded stories, offline).

import type { LibraryAuthor, LibraryStory } from '../state/library';
import { sourceOf } from './registry';
import type { AuthorRef, ChapterInfo, StoryInfo, StoryMeta } from './types';

/** A site-neutral story (from an adapter); library records have no `url`. */
export function isStoryMeta(s: object): s is StoryMeta {
  return 'key' in s && 'url' in s;
}

/**
 * An author as the library stores it. FanFiction.net keeps its numeric user id there: that's what
 * the FFN screens and an older build installed again read.
 */
export function libraryAuthor(source: StoryMeta['source'], a: AuthorRef | undefined): LibraryAuthor | undefined {
  // No id: FanFiction.net's "no author link" is dropped; another site's named byline (AO3's
  // "Anonymous") is kept for the name.
  if (!a || (!a.id && (source === 'ffn' || !a.name))) return undefined;
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
  if (m.coAuthors?.length) out.coAuthors = m.coAuthors.map((a) => libraryAuthor(m.source, a)).filter((a): a is LibraryAuthor => !!a);
  if (m.fandoms?.length) out.fandoms = m.fandoms;
  if (m.tags?.length) out.tags = m.tags;
  if (m.plannedChapters !== undefined) out.plannedChapters = m.plannedChapters;
  if (m.restricted !== undefined) out.restricted = m.restricted;
  if (m.mature !== undefined) out.mature = m.mature;
  if (m.version) out.version = m.version;
  const info = m as Partial<StoryInfo>;
  if (info.chapterList?.length) {
    out.chapterTitles = info.chapterList.map((c) => c.title);
    const ids = info.chapterList.map((c) => c.remoteId);
    if (ids.every(Boolean)) out.chapterIds = ids as string[];
  }
  if (info.series) out.series = info.series;
  if (info.ffn?.storyTextId) out.ffn = { storyTextId: info.ffn.storyTextId };
  return out;
}

/**
 * A chapter list with the full titles the library already has wherever the site shortened one
 * (AO3's chapter menu cuts long titles to 51 characters and "..."): a stored title is kept when
 * it's the same chapter (same id, or same number when ids are unknown) and starts with the
 * shortened one. Lists without shortened titles (every FanFiction.net list) come back as they are.
 */
export function withKnownTitles(list: ChapterInfo[], lib: Pick<LibraryStory, 'chapterTitles' | 'chapterIds'> | undefined): ChapterInfo[] {
  if (!lib?.chapterTitles?.length || !list.some((c) => c.abbreviated)) return list;
  const titles = lib.chapterTitles;
  const ids = lib.chapterIds;
  return list.map((c) => {
    if (!c.abbreviated) return c;
    const at = c.remoteId && ids?.length ? ids.indexOf(c.remoteId) : c.number - 1;
    const known = at >= 0 ? titles[at] : undefined;
    const stem = c.title.replace(/\.\.\.$/, '').trimEnd();
    if (!known || known.length <= stem.length || !known.startsWith(stem)) return c;
    const { abbreviated: _short, ...rest } = c;
    return { ...rest, title: known };
  });
}

/**
 * A library record as a story page, for showing it without the site. Chapter titles the library
 * hasn't seen (none stored, or chapters an update check found since) are "Chapter N".
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
    chapterList: Array.from({ length: Math.max(lib.chapters || 0, lib.chapterTitles?.length ?? 0) }, (_, i) => ({
      number: i + 1,
      title: lib.chapterTitles?.[i] ?? `Chapter ${i + 1}`,
      ...(lib.chapterIds?.[i] ? { remoteId: lib.chapterIds[i] } : {}),
    })),
  };
  const author = (a: LibraryAuthor): AuthorRef => ({ source: lib.source, id: String(a.id), name: a.name, ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}) });
  if (lib.author) out.author = author(lib.author);
  if (lib.coAuthors?.length) out.coAuthors = lib.coAuthors.map(author);
  if (lib.fandoms?.length) out.fandoms = lib.fandoms;
  if (lib.tags?.length) out.tags = lib.tags;
  if (lib.plannedChapters !== undefined) out.plannedChapters = lib.plannedChapters;
  if (lib.series) out.series = lib.series;
  if (lib.restricted !== undefined) out.restricted = lib.restricted;
  if (lib.mature !== undefined) out.mature = lib.mature;
  if (lib.version) out.version = lib.version;
  if (lib.ffn) out.ffn = { storyTextId: lib.ffn.storyTextId, breadcrumbs: [] };
  return out;
}
