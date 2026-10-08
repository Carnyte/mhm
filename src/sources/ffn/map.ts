// FanFiction.net items (list rows, story pages) as library records and back. The one place outside
// the FFN-only screens that reads an FFN story key as a number.

import type { StoryDetail, StorySummary } from '../../ffn/types';
import type { LibraryStory } from '../../state/library';
import { SOURCE_NAMES, splitKey, toKey, type StoryKey } from '../keys';

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

/** A library record as a FanFiction.net story page, for showing it offline. */
export function libraryToFfnDetail(lib: LibraryStory, chapter = 1, unknownAuthor = ''): StoryDetail {
  const { key, source: _source, remoteId: _remoteId, stats, ffn, ...rest } = lib;
  return {
    ...rest,
    id: ffnId(key),
    author: lib.author ?? { id: 0, name: unknownAuthor },
    reviews: stats.reviews ?? 0,
    favs: stats.favs ?? 0,
    follows: stats.follows ?? 0,
    storyTextId: ffn?.storyTextId,
    meta: '',
    chapterList: (lib.chapterTitles ?? Array.from({ length: lib.chapters }, (_, i) => `Chapter ${i + 1}`)).map((t, i) => ({ number: i + 1, title: t })),
    breadcrumbs: [],
    currentChapter: chapter,
  };
}
