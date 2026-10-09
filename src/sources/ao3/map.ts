// Parsed AO3 pages as the site-neutral story model: listing blurbs and work pages as
// StoryMeta / StoryInfo, chapters as ChapterContent with the author's notes around the text.

import { toKey, type StoryKey } from '../keys';
import type { AuthorRef, ChapterContent, ChapterInfo, SeriesRef, StoryInfo, StoryMeta, Tag } from '../types';
import { isAdultRating } from './constants';
import type { Ao3SeriesRef, Ao3WorkMeta } from './parsers/common';
import type { Ao3Navigate } from './parsers/navigate';
import type { Ao3Chapter, Ao3WorkPage } from './parsers/work';
import { workUrl } from './urls';

export function ao3Key(id: string | number): StoryKey {
  return toKey('ao3', id);
}

/** The byline AO3 shows for a work with no visible creator. */
export const ANONYMOUS: AuthorRef = { source: 'ao3', id: '', name: 'Anonymous' };

export function ao3Tags(m: Ao3WorkMeta): Tag[] {
  const tags: Tag[] = [];
  const add = (kind: Tag['kind'], labels: string[]) => labels.forEach((label) => tags.push({ kind, label }));
  if (m.rating) add('rating', [m.rating]);
  add('warning', m.warnings);
  add('category', m.categories);
  add('fandom', m.fandoms);
  add('relationship', m.relationships);
  add('character', m.characters);
  add('freeform', m.freeforms);
  return tags;
}

function seriesRefs(list: Ao3SeriesRef[]): SeriesRef[] {
  return list.map((s) => ({
    id: s.id,
    title: s.title,
    part: s.part,
    ...(s.prevWorkId ? { prevId: s.prevWorkId } : {}),
    ...(s.nextWorkId ? { nextId: s.nextWorkId } : {}),
  }));
}

/** A work (from a listing or its own page) as a site-neutral StoryMeta. */
export function ao3Meta(m: Ao3WorkMeta): StoryMeta {
  const people = m.relationships.length ? m.relationships : m.characters;
  const out: StoryMeta = {
    key: ao3Key(m.id),
    source: 'ao3',
    remoteId: m.id,
    url: workUrl(m.id),
    title: m.title,
    author: m.authors[0] ?? (m.anonymous ? ANONYMOUS : undefined),
    summary: m.summary,
    fandom: m.fandoms.join(', ') || undefined,
    fandoms: m.fandoms,
    isCrossover: m.fandoms.length > 1,
    rating: m.rating,
    language: m.language,
    // AO3 has no genres; its tags are grouped by kind (see ao3Tags / the story page's tag groups).
    genres: [],
    characters: people.length ? people.slice(0, 4).join(', ') + (people.length > 4 ? '…' : '') : undefined,
    tags: ao3Tags(m),
    chapters: m.chapters,
    plannedChapters: m.plannedChapters,
    words: m.words,
    stats: { kudos: m.kudos, hits: m.hits, bookmarks: m.bookmarks, comments: m.comments },
    updated: m.updated,
    published: m.published,
    complete: m.complete,
    restricted: m.restricted,
    mature: isAdultRating(m.rating),
  };
  if (m.authors.length > 1) out.coAuthors = m.authors.slice(1);
  if (m.updatedAt) out.version = m.updatedAt;
  return out;
}

/**
 * The chapter list a work page (and /navigate, when fetched) gives. The chapter menu of a chapter
 * page shortens long titles, so a shortened entry takes the title from the chapter's own heading
 * when the page shows it, else from `known` (chapter id → full title, learnt from /navigate and
 * downloads), else stays flagged `abbreviated` (the library keeps a full title it has).
 */
function chapterList(page: Ao3WorkPage, nav?: Ao3Navigate, known?: ReadonlyMap<string, string>): ChapterInfo[] {
  if (nav?.chapters.length)
    return nav.chapters.map((c) => ({ number: c.number, title: c.title, remoteId: c.id, ...(c.published ? { published: c.published } : {}) }));
  if (page.chapterIndex.length)
    return page.chapterIndex.map((c) => {
      const shown = page.chapters.find((x) => x.id === c.id && x.number === c.number)?.title;
      const full = shown || (c.abbreviated ? known?.get(c.id) : undefined);
      return { number: c.number, title: full || c.title, remoteId: c.id, ...(c.abbreviated && !full ? { abbreviated: true } : {}) };
    });
  // The full-work view, or a work with a single chapter so far: the chapters on the page.
  const list = page.chapters.map((c) => ({ number: c.number, title: c.title || page.meta.title, ...(c.id ? { remoteId: c.id } : {}) }));
  if (list.length === 1 && page.meta.chapters === 1 && page.meta.published) (list[0] as ChapterInfo).published = page.meta.published;
  return list.length ? list : [{ number: 1, title: page.meta.title }];
}

/** A work page as a site-neutral StoryInfo. `known`: full chapter titles by chapter id. */
export function ao3Info(page: Ao3WorkPage, nav?: Ao3Navigate, known?: ReadonlyMap<string, string>): StoryInfo {
  const meta = ao3Meta(page.meta);
  const list = chapterList(page, nav, known);
  return {
    ...meta,
    // The chapter index is the truth about how many chapters can be opened.
    chapters: Math.max(1, list.length >= meta.chapters ? list.length : meta.chapters),
    chapterList: list,
    series: seriesRefs(page.meta.series),
    ao3: {
      ...(page.downloads.html ? { downloadHtmlHref: page.downloads.html } : {}),
      guestComments: page.guestComments,
    },
  };
}

const section = (label: string, html: string) => `<p><strong>${label}</strong></p>${html}`;

/** Author's notes as one block, each part under its label. */
function joinNotes(parts: [string, string | undefined][]): string | undefined {
  const present = parts.filter((p): p is [string, string] => !!p[1]?.trim());
  if (!present.length) return undefined;
  return present.map(([label, html]) => section(label, html)).join('');
}

export interface ChapterContext {
  workTitle: string;
  /** Work notes go before the first chapter, work end notes after the last. */
  workNotes?: string;
  workEndNotes?: string;
  isFirst: boolean;
  isLast: boolean;
  story?: StoryInfo;
}

/** One chapter with its notes: summary and notes before the text, end notes after (as AO3 shows them). */
export function ao3Chapter(c: Ao3Chapter, ctx: ChapterContext): ChapterContent {
  const workNotes = ctx.isFirst ? ctx.workNotes : undefined;
  const workEnd = ctx.isLast ? ctx.workEndNotes : undefined;
  const out: ChapterContent = {
    number: c.number,
    title: c.title || ctx.workTitle,
    html: c.html,
  };
  const before = joinNotes([
    ['Summary:', c.summary],
    [workNotes && c.notes ? 'Work notes:' : 'Notes:', workNotes],
    [workNotes && c.notes ? 'Chapter notes:' : 'Notes:', c.notes],
  ]);
  const after = joinNotes([
    ['Notes:', c.endNotes],
    ['End notes:', workEnd],
  ]);
  if (before) out.notesBefore = before;
  if (after) out.notesAfter = after;
  if (c.id) out.remoteId = c.id;
  if (ctx.story) out.story = ctx.story;
  return out;
}
