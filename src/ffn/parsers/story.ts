// Story / chapter page: /s/{id}/{chapter}/{slug}

import type { ChapterRef, StoryDetail } from '../types';
import {
  attr,
  idFromPath,
  imageUrl,
  largeCover,
  ownText,
  parseBreadcrumbs,
  parseHtml,
  sanitizeHtml,
  siteError,
  text,
  userFromLink,
} from './dom';
import { parseMetaElement } from './meta';

export class FfnPageError extends Error {
  constructor(
    message: string,
    public code: 'not_found' | 'login_required' | 'site_error' | 'parse' = 'site_error',
  ) {
    super(message);
    this.name = 'FfnPageError';
  }
}

function jsVar(html: string, name: string): string | undefined {
  const m = html.match(new RegExp(`var\\s+${name}\\s*=\\s*(?:${name}\\s*=\\s*)?([^;\\n]+);`));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
}

export function parseChapterTitle(label: string): ChapterRef | null {
  const m = label.match(/^(\d+)\.\s*(.*)$/);
  if (!m) return null;
  return { number: Number(m[1]), title: m[2].trim() || `Chapter ${m[1]}` };
}

export function parseStoryPage(html: string): StoryDetail {
  const err = siteError(html);
  const root = parseHtml(html);
  const top = root.querySelector('#profile_top');
  if (!top) {
    if (err === 'LOGIN_REQUIRED') throw new FfnPageError('Login required', 'login_required');
    throw new FfnPageError(err ?? 'Story not found.', err ? 'not_found' : 'parse');
  }

  const id = Number(jsVar(html, 'storyid')) || 0;
  const authorA = top.querySelectorAll('a').find((a) => /^\/u\/\d+/.test(attr(a, 'href') ?? ''));
  const author = userFromLink(authorA) ?? { id: Number(jsVar(html, 'userid')) || 0, name: 'Unknown' };
  const metaEl = top.querySelector('span.xgray');
  const meta = parseMetaElement(metaEl);
  const title = text(top.querySelector('b.xcontrast_txt') ?? top.querySelector('b'));
  const summaryEl = top.querySelectorAll('div.xcontrast_txt').find((d) => !d.querySelector('div'));
  const summary = text(summaryEl);

  const chapSelect = root.querySelector('#chap_select');
  let chapterList: ChapterRef[] = [];
  let slug: string | undefined;
  if (chapSelect) {
    const seen = new Set<number>();
    for (const o of chapSelect.querySelectorAll('option')) {
      const c = parseChapterTitle(ownText(o) || text(o));
      if (c && !seen.has(c.number)) {
        seen.add(c.number);
        chapterList.push(c);
      }
    }
    const onChange = attr(chapSelect, 'onChange') ?? attr(chapSelect, 'onchange') ?? '';
    const sm = onChange.match(/\+\s*'\/([^']*)'\s*;?\s*$/);
    if (sm) slug = sm[1];
  }
  if (!chapterList.length) chapterList = [{ number: 1, title }];

  const chapter = Number(jsVar(html, 'chapter')) || 1;
  const storyTextEl = root.querySelector('#storytext');
  const coverThumb = imageUrl(top.querySelector('img.cimage'));
  const coverLarge = imageUrl(root.querySelector('#img_large img')) ?? largeCover(coverThumb);
  const crumbs = parseBreadcrumbs(root.querySelector('#pre_story_links'));
  const fandomCrumb = crumbs.filter((c) => !/^\/[a-z]+\/$/.test(c.path) && !/^\/crossovers\/[a-z]+\/$/.test(c.path));

  return {
    id: id || meta.id || idFromPath(attr(top.querySelector("a[href^='/r/']"), 'href'), /\/r\/(\d+)/) || 0,
    title,
    author,
    summary,
    coverUrl: coverThumb,
    coverLargeUrl: coverLarge,
    fandom: fandomCrumb.map((c) => c.label).join(' & ') || crumbs[crumbs.length - 1]?.label,
    isCrossover: crumbs.some((c) => /Crossovers?/.test(c.label) || /-Crossovers\//.test(c.path)),
    rating: meta.rating,
    language: meta.language,
    genres: meta.genres,
    characters: meta.characters,
    chapters: meta.chapters || chapterList.length,
    words: meta.words,
    reviews: meta.reviews,
    favs: meta.favs,
    follows: meta.follows,
    updated: meta.updated,
    published: meta.published,
    complete: meta.complete,
    meta: meta.text,
    chapterList,
    breadcrumbs: crumbs,
    storyTextId: Number(jsVar(html, 'storytextid')) || undefined,
    currentChapter: chapter,
    chapterHtml: storyTextEl ? sanitizeHtml(storyTextEl.innerHTML) : undefined,
    slug,
  };
}
