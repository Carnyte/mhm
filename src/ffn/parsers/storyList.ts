// Story lists: fandom / crossover lists, search results, Just In, profile tabs, community archives.
// Each story is a `div.z-list` containing a.stitle, the author link, div.z-indent (summary) and
// div.z-padtop2.xgray (metadata).

import type { StoryListPage, StorySummary } from '../types';
import {
  attr,
  idFromPath,
  imageUrl,
  parseBreadcrumbs,
  parseHtml,
  parsePagination,
  parseSelects,
  text,
  userFromLink,
  type El,
} from './dom';
import { parseMetaElement } from './meta';

export function parseStoryItem(z: El): StorySummary | null {
  const titleA = z.querySelector('a.stitle');
  const href = attr(titleA, 'href') ?? attr(z, 'data-storyid');
  const id = idFromPath(href, /\/s\/(\d+)/) ?? (Number(attr(z, 'data-storyid')) || undefined);
  if (!id) return null;

  const authorA = z.querySelectorAll('a').find((a) => /^\/u\/\d+/.test(attr(a, 'href') ?? ''));
  const metaEl = z.querySelector('.z-padtop2') ?? z.querySelector('.xgray');
  const meta = parseMetaElement(metaEl);

  // Summary is the z-indent text minus the nested metadata div.
  const indent = z.querySelector('.z-indent');
  let summary = '';
  if (indent) {
    const clone = parseHtml(indent.innerHTML);
    clone.querySelectorAll('.z-padtop2, .xgray').forEach((n) => n.remove());
    summary = text(clone);
  }

  const title = attr(z, 'data-title') ?? text(titleA);
  const story: StorySummary = {
    id,
    title,
    author: userFromLink(authorA),
    summary,
    coverUrl: imageUrl(z.querySelector('img.cimage') ?? titleA?.querySelector('img')),
    fandom: attr(z, 'data-category') ?? meta.fandom,
    isCrossover: meta.isCrossover,
    rating: meta.rating,
    language: meta.language,
    genres: meta.genres,
    characters: meta.characters,
    chapters: Number(attr(z, 'data-chapters')) || meta.chapters,
    words: Number(attr(z, 'data-wordcount')) || meta.words,
    reviews: Number(attr(z, 'data-ratingtimes')) || meta.reviews,
    favs: meta.favs,
    follows: meta.follows,
    updated: Number(attr(z, 'data-dateupdate')) || meta.updated,
    published: Number(attr(z, 'data-datesubmit')) || meta.published,
    complete: attr(z, 'data-statusid') ? attr(z, 'data-statusid') === '2' : meta.complete,
    meta: meta.text,
  };
  return story;
}

export function parseStoryItems(root: El, selector = 'div.z-list'): StorySummary[] {
  const seen = new Set<number>();
  const out: StorySummary[] = [];
  for (const z of root.querySelectorAll(selector)) {
    const s = parseStoryItem(z);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
}

/** /book/Harry-Potter/?…, /X-and-Y-Crossovers/1/2/?…, /j/…, /community/… story listings. */
export function parseStoryListPage(html: string): StoryListPage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const stories = parseStoryItems(content);
  const page = parsePagination(content, /[?&](?:p|ppage)=(\d+)/);
  const filters = parseSelects(content);
  const crumbs = parseBreadcrumbs(
    content.querySelector('#pre_story_links') ?? content.querySelector('.lc-left'),
  );
  const related: StoryListPage['related'] = {};
  for (const a of content.querySelectorAll('a')) {
    const href = attr(a, 'href') ?? '';
    if (!related.crossovers && /^\/crossovers\/[^/]+\/\d+\/$/.test(href)) related.crossovers = href;
    else if (!related.communities && /^\/communities\/[a-z]+\/[^/]+\/$/.test(href)) related.communities = href;
    else if (!related.forums && /^\/forums\/[a-z]+\/[^/]+\/$/.test(href)) related.forums = href;
  }
  return { stories, page, filters, breadcrumbs: crumbs, title: pageTitle(root), related };
}

/** "<title>Harry Potter FanFiction Archive | FanFiction</title>" → "Harry Potter". */
export function pageTitle(root: El): string | undefined {
  const t = text(root.querySelector('title'));
  if (!t) return undefined;
  return (
    t
      .replace(/\s*\|\s*FanFiction\s*$/i, '')
      .replace(/\s*FanFiction Archive\s*$/i, '')
      .replace(/\s*Crossover\s*$/i, '')
      .trim() || undefined
  );
}
