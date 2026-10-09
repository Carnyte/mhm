// FanFiction.net items (list rows, story pages) as the site-neutral story model and as library
// records, and back. The one place outside the FFN-only screens that reads an FFN story key as a
// number.

import { absolute, storyPath } from '../../ffn/urls';
import type { StoryDetail, StorySummary, UserRef } from '../../ffn/types';
import type { LibraryStory } from '../../state/library';
import { SOURCE_NAMES, splitKey, toKey, type StoryKey } from '../keys';
import type { AuthorRef, ChapterContent, StoryInfo, StoryMeta } from '../types';

/** A story from a site this build can't open yet (only reachable through a hand-made link). */
export class UnsupportedSourceError extends Error {
  constructor(key: StoryKey) {
    super(`${SOURCE_NAMES[splitKey(key).source]} stories can't be opened in this version of FicShelf yet.`);
  }
}

export function ffnKey(id: number): StoryKey {
  return toKey('ffn', id);
}

/** The FanFiction.net story number in a key. Throws for another site's story. */
export function ffnId(key: StoryKey): number {
  const { source, remoteId } = splitKey(key);
  if (source !== 'ffn') throw new UnsupportedSourceError(key);
  return Number(remoteId);
}

/** The story's page on fanfiction.net (chapter 1 unless given). */
export function ffnStoryUrl(id: number | string, chapter = 1): string {
  return absolute(storyPath(Number(id), chapter));
}

/** A FanFiction.net user as an AuthorRef (id 0, "no author link", becomes an empty id). */
export function ffnAuthor(u: UserRef): AuthorRef {
  const a: AuthorRef = { source: 'ffn', id: u.id ? String(u.id) : '', name: u.name };
  if (u.avatarUrl) a.avatarUrl = u.avatarUrl;
  return a;
}

/** An author as FanFiction.net's own screens take it (numeric id; 0 when unknown). */
export function ffnUser(a: { id: number | string; name: string; avatarUrl?: string }): UserRef {
  const u: UserRef = { id: Number(a.id) || 0, name: a.name };
  if (a.avatarUrl) u.avatarUrl = a.avatarUrl;
  return u;
}

/** A FanFiction.net list row (or story page) as a site-neutral StoryMeta. */
export function ffnMeta(s: StorySummary): StoryMeta {
  const out: StoryMeta = {
    key: ffnKey(s.id),
    source: 'ffn',
    remoteId: String(s.id),
    url: ffnStoryUrl(s.id),
    title: s.title,
    summary: s.summary,
    fandom: s.fandom,
    isCrossover: s.isCrossover,
    rating: s.rating,
    language: s.language,
    genres: s.genres,
    characters: s.characters,
    chapters: s.chapters,
    words: s.words,
    stats: { reviews: s.reviews, favs: s.favs, follows: s.follows },
    updated: s.updated,
    published: s.published,
    complete: s.complete,
  };
  if (s.author) out.author = ffnAuthor(s.author);
  if (s.coverUrl) out.coverUrl = s.coverUrl;
  return out;
}

/** A parsed FanFiction.net story page as a site-neutral StoryInfo. */
export function ffnInfo(d: StoryDetail): StoryInfo {
  return {
    ...ffnMeta(d),
    chapterList: d.chapterList.map((c) => ({ number: c.number, title: c.title })),
    coverLargeUrl: d.coverLargeUrl,
    ffn: {
      // The review form id on later chapter pages isn't the story's, so only chapter 1 sets it.
      storyTextId: d.currentChapter === 1 ? d.storyTextId : undefined,
      breadcrumbs: d.breadcrumbs,
      slug: d.slug,
    },
  };
}

/** One chapter page as ChapterContent; the page's story metadata comes along. */
export function ffnChapter(d: StoryDetail, chapter: number): ChapterContent {
  return {
    number: chapter,
    title: d.chapterList.find((c) => c.number === chapter)?.title,
    html: d.chapterHtml ?? '',
    story: ffnInfo(d),
    ffn: { storyTextId: d.storyTextId },
  };
}

/** The metadata a FanFiction.net list row or story page gives a library record. */
export function libraryMetaFromFfn(src: StorySummary | StoryDetail): Partial<LibraryStory> {
  const d = src as StoryDetail;
  const out: Partial<LibraryStory> = {
    key: ffnKey(src.id),
    source: 'ffn',
    remoteId: String(src.id),
    title: src.title,
    summary: src.summary,
    fandom: src.fandom,
    isCrossover: src.isCrossover,
    rating: src.rating,
    language: src.language,
    genres: src.genres,
    characters: src.characters,
    chapters: src.chapters,
    words: src.words,
    stats: { reviews: src.reviews, favs: src.favs, follows: src.follows },
    updated: src.updated,
    published: src.published,
    complete: src.complete,
  };
  if (src.author?.id) out.author = src.author;
  if (src.coverUrl) out.coverUrl = src.coverUrl;
  if (d.chapterList?.length) out.chapterTitles = d.chapterList.map((c) => c.title);
  // The review form id on later chapter pages isn't the story's, so only chapter 1 sets it.
  if (d.storyTextId && d.currentChapter === 1) out.ffn = { storyTextId: d.storyTextId };
  return out;
}
