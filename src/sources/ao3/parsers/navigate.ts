// /works/ID/navigate: the chapter index with each chapter's id and posting date. Small, and AO3
// doesn't count it as a visit to the work (it isn't written into the reader's AO3 history), so
// it's what update checks fall back to.

import { parseHtml, text } from '../../../html/dom';
import { parseByline, parseIsoDate, workIdFromHref } from './common';
import { stripChapterNumber, type Ao3ChapterRef } from './work';
import type { AuthorRef } from '../../types';

export interface Ao3Navigate {
  workId?: string;
  title: string;
  authors: AuthorRef[];
  chapters: Ao3ChapterRef[];
}

export function parseNavigate(html: string): Ao3Navigate {
  const root = parseHtml(html);
  const heading = root.querySelector('#main h2.heading') ?? root.querySelector('h2.heading');
  const workLink = heading?.querySelectorAll('a').find((a) => /^\/works\/\d+$/.test(a.getAttribute('href') ?? ''));
  const chapters: Ao3ChapterRef[] = [];
  for (const li of root.querySelectorAll('ol.chapter.index li')) {
    const a = li.querySelector('a[href*="/chapters/"]');
    const id = a?.getAttribute('href')?.match(/\/chapters\/(\d+)/)?.[1];
    if (!a || !id) continue;
    const n = chapters.length + 1;
    chapters.push({ number: n, id, title: stripChapterNumber(text(a)) || `Chapter ${n}`, published: parseIsoDate(text(li.querySelector('span.datetime'))) });
  }
  return {
    workId: workIdFromHref(workLink?.getAttribute('href') ?? root.querySelector('ol.chapter.index a')?.getAttribute('href')),
    title: text(workLink),
    authors: parseByline(heading).authors,
    chapters,
  };
}
