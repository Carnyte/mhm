// A work's blurb in an AO3 listing (tag pages, search results, a creator's works, a series):
// `li.work.blurb#work_ID`. Restricted works carry a lock image in the heading; counters that are
// 0 aren't printed at all.

import { El, text } from '../../../html/dom';
import {
  hasClass,
  parseBlurbDate,
  parseByline,
  parseRequiredTags,
  parseSeriesRef,
  parseStats,
  tagNames,
  userstuffText,
  workIdFromHref,
  type Ao3WorkMeta,
} from './common';

export interface Ao3Blurb extends Ao3WorkMeta {
  /** The newest chapter's id (the chapter count links to it). */
  latestChapterId?: string;
}

/** The `<!-- updated_at=NNN -->` comment in a blurb's header. */
function updatedAtOf(header: El | null): number | undefined {
  if (!header) return undefined;
  for (const c of header.childNodes) {
    const n = c.node as { type?: string; data?: string };
    if (n.type === 'comment') {
      const m = n.data?.match(/updated_at=(\d+)/);
      if (m) return Number(m[1]);
    }
  }
  return undefined;
}

export function parseBlurb(li: El): Ao3Blurb | null {
  const id = li.id.match(/^work_(\d+)$/)?.[1] ?? workIdFromHref(li.querySelector('h4.heading a[href^="/works/"]')?.getAttribute('href'));
  if (!id) return null;
  const header = li.querySelector('div.header.module');
  const heading = header?.querySelector('h4.heading') ?? null;
  const titleLink = heading?.querySelectorAll('a').find((a) => /^\/works\/\d+/.test(a.getAttribute('href') ?? ''));
  const { authors, anonymous } = parseByline(heading);
  const req = parseRequiredTags(header?.querySelector('ul.required-tags') ?? null);
  const tags = li.querySelector('ul.tags');
  const group = (cls: string) => (tags ? tags.querySelectorAll(`li.${cls}`).flatMap((x) => tagNames(x)) : []);
  const stats = parseStats(li.querySelector('dl.stats'));
  const chaptersLink = li.querySelector('dl.stats dd.chapters a')?.getAttribute('href');
  const warnings = group('warnings');
  const revised = parseBlurbDate(text(header?.querySelector('p.datetime')));
  return {
    id,
    title: text(titleLink) || 'Untitled',
    authors,
    anonymous: anonymous || hasClass(header ?? li, 'anonymous'),
    summary: userstuffText(li.querySelector('blockquote.userstuff.summary')),
    rating: req.rating,
    warnings: warnings.length ? warnings : req.warnings,
    categories: req.categories,
    fandoms: tagNames(header?.querySelector('h5.fandoms') ?? null),
    relationships: group('relationships'),
    characters: group('characters'),
    freeforms: group('freeforms'),
    language: stats.language,
    languageCode: stats.languageCode,
    series: li
      .querySelectorAll('ul.series li')
      .map(parseSeriesRef)
      .filter((s): s is NonNullable<typeof s> => !!s),
    words: stats.words,
    chapters: stats.chapters,
    plannedChapters: stats.plannedChapters,
    comments: stats.comments,
    kudos: stats.kudos,
    bookmarks: stats.bookmarks,
    hits: stats.hits,
    updated: revised,
    complete: req.complete || (stats.plannedChapters != null && stats.chapters >= stats.plannedChapters),
    restricted: !!heading?.querySelector('img[title="Restricted"]'),
    updatedAt: updatedAtOf(header),
    latestChapterId: chaptersLink?.match(/\/chapters\/(\d+)/)?.[1],
  };
}

/** Every work blurb under `root` (bookmark blurbs of works are read as their work). */
export function parseBlurbs(root: El): Ao3Blurb[] {
  const out: Ao3Blurb[] = [];
  const seen = new Set<string>();
  for (const li of root.querySelectorAll('li.work.blurb, li.bookmark.blurb')) {
    const b = parseBlurb(li);
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}
