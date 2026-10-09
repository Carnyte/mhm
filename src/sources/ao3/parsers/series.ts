// /series/ID: the series' title, creators, dates, description and stats, and its works (blurbs,
// in series order, 20 to a page).

import { parseCount, parseHtml, text } from '../../../html/dom';
import type { AuthorRef } from '../../types';
import { parseBlurbs, type Ao3Blurb } from './blurb';
import { parseByline, parseIsoDate, parseLastPage, userstuffText } from './common';

export interface Ao3Series {
  id?: string;
  title: string;
  authors: AuthorRef[];
  /** Unix seconds. */
  begun?: number;
  updated?: number;
  description: string;
  notes: string;
  words: number;
  works: number;
  complete: boolean;
  bookmarks: number;
  items: Ao3Blurb[];
  page: number;
  lastPage: number;
}

export function parseSeries(html: string): Ao3Series {
  const root = parseHtml(html);
  const main = root.querySelector('#main') ?? root;
  const meta = main.querySelector('dl.series.meta');
  const field = (label: RegExp) => {
    const dts = meta ? meta.childNodes.filter((c) => c.tagName === 'DT') : [];
    const dt = dts.find((d) => label.test(text(d)));
    if (!dt) return null;
    // The dd right after the dt.
    const kids = meta!.childNodes.filter((c) => c.nodeType === 1);
    const i = kids.findIndex((k) => k.node === dt.node);
    return kids[i + 1]?.tagName === 'DD' ? kids[i + 1] : null;
  };
  const stats = meta?.querySelector('dl.stats');
  const statDd = (label: RegExp) => {
    const kids = stats ? stats.childNodes.filter((c) => c.nodeType === 1) : [];
    const i = kids.findIndex((k) => k.tagName === 'DT' && label.test(text(k)));
    return i >= 0 ? text(kids[i + 1]) : '';
  };
  const items = parseBlurbs(main.querySelector('ul.series.work.index') ?? main);
  return {
    id: main
      .querySelector('a[href^="/series/"][href$="/bookmarks"]')
      ?.getAttribute('href')
      ?.match(/\/series\/(\d+)/)?.[1],
    title: text(main.querySelector('h2.heading')),
    authors: parseByline(field(/Creators?:/)).authors,
    begun: parseIsoDate(text(field(/Series Begun/))),
    updated: parseIsoDate(text(field(/Series Updated/))),
    description: userstuffText(field(/Description/)?.querySelector('blockquote') ?? null),
    notes: userstuffText(field(/^Notes/)?.querySelector('blockquote') ?? null),
    words: parseCount(statDd(/Words/)),
    works: parseCount(statDd(/Works/)) || items.length,
    complete: /^yes/i.test(statDd(/Complete/)),
    bookmarks: parseCount(statDd(/Bookmarks/)),
    items,
    ...parseLastPage(main),
  };
}
