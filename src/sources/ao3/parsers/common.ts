// Pieces every AO3 page shares: bylines, the stats list, dates, tag lists, pagination, and the
// author's text (summaries, notes, chapters) made safe to show.
//
// AO3's markup is semantic and stable (classes such as dd.words, h3.byline), so the parsers key
// on classes, never on positions or wording. Counters AO3 leaves out when they're 0 (comments,
// kudos, bookmarks) read as 0.

import { El, parseCount, text } from '../../../html/dom';
import { sanitizeHtml } from '../../../html/sanitize';
import type { AuthorRef } from '../../types';
import { MAX_LISTING_PAGE } from '../constants';
import { authorId, unescapeTag } from '../urls';

/** A work's series entry: "Part 2 of <series>", with the neighbouring works when the page shows them. */
export interface Ao3SeriesRef {
  id: string;
  title: string;
  part: number;
  prevWorkId?: string;
  nextWorkId?: string;
}

/** Work metadata, the same on a work page, a listing blurb and (partly) the official download. */
export interface Ao3WorkMeta {
  id: string;
  title: string;
  /** Creators in byline order; empty for an anonymous work. */
  authors: AuthorRef[];
  anonymous: boolean;
  /** Plain text, paragraphs separated by blank lines. */
  summary: string;
  rating?: string;
  warnings: string[];
  categories: string[];
  fandoms: string[];
  relationships: string[];
  characters: string[];
  freeforms: string[];
  /** The language's name ("English") and AO3's code ("en"). */
  language?: string;
  languageCode?: string;
  series: Ao3SeriesRef[];
  words: number;
  chapters: number;
  /** null when the author hasn't said how many chapters there will be ("8/?"). */
  plannedChapters: number | null;
  comments: number;
  kudos: number;
  bookmarks: number;
  hits: number;
  /** Unix seconds. */
  published?: number;
  updated?: number;
  complete: boolean;
  /** Only visible to logged-in AO3 users. */
  restricted: boolean;
  /**
   * AO3's version stamp of the work (Unix seconds, `updated_at`): it changes on any edit, so it
   * decides when a download is stale, never whether there's news.
   */
  updatedAt?: number;
}

/** Direct element children of `el`, optionally only those matching a class list. */
export function childEls(el: El, ...classes: string[]): El[] {
  return el.childNodes.filter((c) => c.nodeType === 1 && classes.every((k) => hasClass(c, k)));
}

export function hasClass(el: El, cls: string): boolean {
  return (el.getAttribute('class') ?? '').split(/\s+/).includes(cls);
}

/** "2014-09-30" (AO3 dates are in the site's time zone; noon UTC keeps the day right everywhere). */
export function parseIsoDate(s: string | undefined): number | undefined {
  const m = s?.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) / 1000 : undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "17 Feb 2020" (listing blurbs). */
export function parseBlurbDate(s: string | undefined): number | undefined {
  const m = s?.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!m) return parseIsoDate(s);
  const month = MONTHS.indexOf(m[2].toLowerCase());
  return month < 0 ? undefined : Date.UTC(Number(m[3]), month, Number(m[1]), 12) / 1000;
}

/** "17/17" → 17 of 17, "8/?" → 8 of unknown. */
export function parseChapterCount(s: string | undefined): { chapters: number; planned: number | null } {
  const m = s?.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+|\?)/);
  if (!m) return { chapters: parseCount(s) || 1, planned: null };
  return { chapters: Number(m[1]) || 1, planned: m[2] === '?' ? null : Number(m[2]) };
}

/** A creator link: /users/NAME/pseuds/PSEUD (or /users/NAME). */
export function authorFromHref(href: string | undefined, name: string): AuthorRef | null {
  const m = href?.match(/\/users\/([^/?#]+)(?:\/pseuds\/([^/?#]+))?/);
  if (!m) return null;
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return { source: 'ao3', id: authorId(dec(m[1]), m[2] ? dec(m[2]) : undefined), name };
}

/**
 * The creators named in a byline (a[rel=author]); "Anonymous" bylines have none.
 *
 * An imported work its creator never claimed (Open Doors archives) reads "Jane Writer [archived
 * by <a rel=author>open_doors</a>]": only the archivist is linked, but the work is Jane Writer's.
 * She's named, with no id (she has no AO3 page), and the archivist is left out.
 */
export function parseByline(el: El | null): { authors: AuthorRef[]; anonymous: boolean } {
  if (!el) return { authors: [], anonymous: false };
  const authors: AuthorRef[] = [];
  const add = (ref: AuthorRef) => {
    if (!authors.some((x) => x.id === ref.id && (ref.id || x.name === ref.name))) authors.push(ref);
  };
  // The text since the previous link: "Jane Writer [archived by " right before an archivist's link.
  let before = '';
  const walk = (n: El) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) before += c.rawText;
      else if (c.tagName === 'A') {
        if (c.getAttribute('rel') === 'author') {
          const external = before.match(/^[\s,\]]*(?:by\s+)?([\s\S]*?)\s*\[archived by\s*$/i)?.[1].replace(/\s+/g, ' ').trim();
          const ref = external ? { source: 'ao3' as const, id: '', name: external } : authorFromHref(c.getAttribute('href'), text(c));
          if (ref) add(ref);
        }
        before = '';
      } else if (c.nodeType === 1) walk(c);
    }
  };
  walk(el);
  return { authors, anonymous: !authors.length && /\bAnonymous\b/.test(text(el)) };
}

/** The tag names in a tag list (`a.tag`). */
export function tagNames(el: El | null): string[] {
  return el
    ? el
        .querySelectorAll('a.tag')
        .map((a) => text(a))
        .filter(Boolean)
    : [];
}

/** The tag a /tags/NAME/works link names. */
export function tagFromHref(href: string | undefined): string | undefined {
  const m = href?.match(/\/tags\/([^/?#]+)/);
  return m ? unescapeTag(m[1]) : undefined;
}

/** The counters of a `dl.stats`; missing ones are 0 (AO3 leaves out zero comments, kudos and bookmarks). */
export function parseStats(dl: El | null) {
  const dd = (cls: string) => dl?.querySelector(`dd.${cls}`) ?? null;
  const { chapters, planned } = parseChapterCount(text(dd('chapters')));
  const lang = dd('language');
  const status = text(dl?.querySelector('dt.status'));
  return {
    words: parseCount(text(dd('words'))),
    chapters,
    plannedChapters: planned,
    comments: parseCount(text(dd('comments'))),
    kudos: parseCount(text(dd('kudos'))),
    bookmarks: parseCount(text(dd('bookmarks'))),
    hits: parseCount(text(dd('hits'))),
    language: text(lang) || undefined,
    languageCode: lang?.getAttribute('lang') || undefined,
    published: parseIsoDate(text(dd('published'))),
    /** "Updated:" or "Completed:" date, when the work changed after it was first posted. */
    statusDate: parseIsoDate(text(dd('status'))),
    completedLabel: /complete/i.test(status),
  };
}

const TEXT_BLOCKS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE', 'HR', 'CENTER']);

/** Author's text as plain text, with blank lines between paragraphs (summaries on cards). */
export function userstuffText(el: El | null): string {
  if (!el) return '';
  let out = '';
  const walk = (n: El) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.rawText.replace(/\s+/g, ' ');
      else if (c.tagName === 'BR') out += '\n';
      else if (c.nodeType === 1) {
        const block = TEXT_BLOCKS.has(c.tagName);
        if (block) out += '\n\n';
        walk(c);
        if (block) out += '\n\n';
      }
    }
  };
  walk(el);
  return out
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n');
}

/** Author's HTML (a blockquote.userstuff, a chapter body) made safe to show. */
export function userstuffHtml(el: El | null, opts: { dropLandmark?: boolean } = {}): string {
  if (!el) return '';
  const c = el.clone();
  if (opts.dropLandmark) for (const h of c.querySelectorAll('h3.landmark')) h.remove();
  return sanitizeHtml(c.innerHTML);
}

/** The rating / warnings / categories / complete flags of a blurb's `ul.required-tags` (from `title`). */
export function parseRequiredTags(ul: El | null) {
  const title = (sel: string) => ul?.querySelector(sel)?.getAttribute('title') ?? '';
  const split = (s: string) =>
    s
      .split(/\s*,\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    rating: title('span.rating') || undefined,
    warnings: split(title('span.warnings')),
    categories: split(title('span.category')).filter((c) => c !== 'No category'),
    complete: /complete-yes/.test(ul?.querySelector('span.iswip')?.getAttribute('class') ?? '') || /^Complete Work$/i.test(title('span.iswip')),
  };
}

/** The work id of a /works/ID link. */
export function workIdFromHref(href: string | undefined): string | undefined {
  return href?.match(/\/works\/(\d+)/)?.[1];
}

/** "Part 2 of <a href=/series/9>Name</a>" (a blurb's `ul.series li`, a work's `span.position`). */
export function parseSeriesRef(el: El): Ao3SeriesRef | null {
  const a = el.querySelector('a[href*="/series/"]');
  const id = a?.getAttribute('href')?.match(/\/series\/(\d+)/)?.[1];
  if (!a || !id) return null;
  const part = Number(text(el).match(/Part\s+(\d+)/i)?.[1]) || 1;
  return { id, title: text(a), part };
}

/** A listing's page count (`ol.pagination`), capped at what AO3 serves. */
export function parseLastPage(root: El): { page: number; lastPage: number } {
  const pag = root.querySelector('ol.pagination');
  if (!pag) return { page: 1, lastPage: 1 };
  let last = 1;
  for (const a of pag.querySelectorAll('li a, li span')) {
    const n = Number(text(a).replace(/,/g, ''));
    if (Number.isFinite(n) && n > last) last = n;
  }
  const page = Number(text(pag.querySelector('.current')).replace(/,/g, '')) || 1;
  return { page, lastPage: Math.min(MAX_LISTING_PAGE, Math.max(last, page)) };
}
