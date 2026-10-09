// A work's own pages: /works/ID (single-chapter works, and the full-work view), and
// /works/ID/chapters/CID (one chapter of a multi-chapter work). They share the header
// (dl.work.meta: tags, series, stats), the preface (title, byline, summary, work notes) and the
// download links; chapter pages add the chapter index (select#selected_id, chapter number → id).
//
// Also recognised: AO3's adult-content notice (shown instead of the work when view_adult isn't
// honoured) and its login page (where a restricted work sends visitors who aren't logged in).

import { El, parseHtml, text } from '../../../html/dom';
import {
  childEls,
  parseByline,
  parseSeriesRef,
  parseStats,
  tagNames,
  userstuffHtml,
  userstuffText,
  workIdFromHref,
  type Ao3SeriesRef,
  type Ao3WorkMeta,
} from './common';

/** One chapter's text and the author's words around it, already sanitized. */
export interface Ao3Chapter {
  /** Position in the work, from 1. */
  number: number;
  /** AO3's chapter id (absent on single-chapter work pages). */
  id?: string;
  /** The chapter's own title ("Watersports"), or "Chapter N" when it has none. */
  title: string;
  html: string;
  summary?: string;
  notes?: string;
  endNotes?: string;
}

export interface Ao3ChapterRef {
  number: number;
  id: string;
  title: string;
  /** Unix seconds (from /navigate only). */
  published?: number;
}

export interface Ao3WorkPage {
  kind: 'work';
  meta: Ao3WorkMeta;
  /** The chapter index (chapter pages of multi-chapter works); empty when the page has none. */
  chapterIndex: Ao3ChapterRef[];
  /** The chapters the page shows: one, or every chapter in the full-work view. */
  chapters: Ao3Chapter[];
  /** Work notes (top of the first chapter) and end notes (after the last), sanitized. */
  workNotes?: string;
  workEndNotes?: string;
  /** The official downloads, exactly as the page links them (`/downloads/ID/Title.html?updated_at=N`). */
  downloads: { html?: string; epub?: string; pdf?: string; azw3?: string; mobi?: string };
  /** AO3 shows the comment form to visitors who aren't logged in. */
  guestComments: boolean;
}

export type Ao3Page = Ao3WorkPage | { kind: 'adult'; workId?: string } | { kind: 'login'; restricted: boolean } | { kind: 'unknown' };

/** The chapter title after "Chapter N: " in a chapter heading, or "Chapter N". */
function chapterTitle(h: El | null, n: number): string {
  const t = text(h);
  const m = t.match(/^Chapter\s+\d+\s*:\s*(.+)$/i);
  return m ? m[1].trim() : t || `Chapter ${n}`;
}

/** "1. Chapter 1" → "Chapter 1" (the chapter index and /navigate number their entries). */
export function stripChapterNumber(s: string): string {
  return s.replace(/^\s*\d+\.\s*/, '').trim();
}

function parseChapterIndex(root: El): Ao3ChapterRef[] {
  return root.querySelectorAll('select#selected_id option').map((o, i) => ({
    number: i + 1,
    id: o.getAttribute('value') ?? '',
    title: stripChapterNumber(text(o)) || `Chapter ${i + 1}`,
  }));
}

/** A `div.chapter#chapter-N` of a chapter page or the full-work view. */
function parseChapterDiv(div: El, fallbackNumber: number): Ao3Chapter {
  const n = Number(div.id.match(/^chapter-(\d+)$/)?.[1]) || fallbackNumber;
  const prefaces = childEls(div, 'chapter', 'preface', 'group');
  const head = prefaces[0] ?? null;
  const link = head?.querySelector('h3.title a[href*="/chapters/"]');
  const body = childEls(div, 'userstuff')[0] ?? null;
  const end =
    div.querySelector(`#chapter_${n}_endnotes`) ??
    prefaces
      .slice(1)
      .map((p) => p.querySelector('div.end.notes'))
      .find(Boolean) ??
    null;
  const block = (el: El | null | undefined) => (el ? userstuffHtml(el.querySelector('blockquote.userstuff')) || undefined : undefined);
  return {
    number: n,
    id: link?.getAttribute('href')?.match(/\/chapters\/(\d+)/)?.[1],
    title: chapterTitle(head?.querySelector('h3.title') ?? null, n),
    html: userstuffHtml(body, { dropLandmark: true }),
    summary: block(head?.querySelector('div.summary.module')),
    notes: block(head?.querySelector('div.notes.module')),
    endNotes: block(end),
  };
}

function seriesOf(meta: El | null): Ao3SeriesRef[] {
  if (!meta) return [];
  return meta
    .querySelectorAll('dd.series span.series')
    .map((span) => {
      const pos = span.querySelector('span.position');
      const ref = pos ? parseSeriesRef(pos) : null;
      if (!ref) return null;
      const prev = workIdFromHref(span.querySelector('a.previous')?.getAttribute('href'));
      const next = workIdFromHref(span.querySelector('a.next')?.getAttribute('href'));
      return { ...ref, ...(prev ? { prevWorkId: prev } : {}), ...(next ? { nextWorkId: next } : {}) };
    })
    .filter((s): s is Ao3SeriesRef => !!s);
}

function workIdOf(root: El): string | undefined {
  const fromLinks = [
    root.querySelector('li.chapter.entire a')?.getAttribute('href'),
    root.querySelector('li.chapter.bychapter a')?.getAttribute('href'),
    root.querySelector('#chapters h3.title a')?.getAttribute('href'),
    root.querySelector('dd.bookmarks a')?.getAttribute('href'),
    root.querySelector('li.download a')?.getAttribute('href')?.replace('/downloads/', '/works/'),
    root.querySelector('form.new_comment')?.getAttribute('action'),
    root.querySelector('a[href*="/works/"][href$="/share"]')?.getAttribute('href'),
  ];
  for (const h of fromLinks) {
    const id = workIdFromHref(h ?? undefined);
    if (id) return id;
  }
  const kudo = root.querySelector('form#new_kudo input[name="kudo[commentable_id]"]')?.getAttribute('value');
  return kudo && /^\d+$/.test(kudo) ? kudo : undefined;
}

export function parseWorkPage(html: string): Ao3Page {
  const root = parseHtml(html);
  const meta = root.querySelector('dl.work.meta');
  if (!meta) {
    if (root.querySelector('p.caution') && /adult content/i.test(text(root.querySelector('#main h2')) + text(root.querySelector('p.caution')))) {
      return { kind: 'adult', workId: workIdFromHref(root.querySelector('ul.actions a[href*="view_adult"]')?.getAttribute('href')) };
    }
    if (root.querySelector('form#new_user')) {
      return {
        kind: 'login',
        restricted: /restricted|only available to registered users/i.test(text(root.querySelector('#main .flash')) + html.slice(0, 4000)),
      };
    }
    return { kind: 'unknown' };
  }
  const preface = root.querySelector('#workskin > div.preface.group') ?? root.querySelector('div.preface.group');
  const { authors, anonymous } = parseByline(preface?.querySelector('h3.byline') ?? null);
  const stats = parseStats(meta.querySelector('dl.stats'));
  const tags = (cls: string) => tagNames(meta.querySelector(`dd.${cls}.tags`));
  const chaptersEl = root.querySelector('#chapters');
  const chapterDivs = chaptersEl ? childEls(chaptersEl, 'chapter') : [];
  const chapters = chapterDivs.length
    ? chapterDivs.map((d, i) => parseChapterDiv(d, i + 1))
    : chaptersEl
      ? [{ number: 1, title: '', html: userstuffHtml(childEls(chaptersEl, 'userstuff')[0] ?? null) }]
      : [];
  const dl = (ext: string) =>
    root
      .querySelectorAll('li.download a')
      .map((a) => a.getAttribute('href') ?? '')
      .find((h) => new RegExp(`^/downloads/\\d+/[^?#]*\\.${ext}(?:[?#]|$)`).test(h));
  const htmlHref = dl('html');
  const updatedAt = Number(htmlHref?.match(/updated_at=(\d+)/)?.[1]) || undefined;
  const complete = stats.plannedChapters != null && stats.chapters >= stats.plannedChapters;
  const workNotes = preface ? userstuffHtml(childEls(preface, 'notes', 'module')[0]?.querySelector('blockquote.userstuff') ?? null) : '';
  const workEnd = userstuffHtml(root.querySelector('#work_endnotes blockquote.userstuff'));
  return {
    kind: 'work',
    meta: {
      id: workIdOf(root) ?? '',
      title: text(preface?.querySelector('h2.title')) || 'Untitled',
      authors,
      anonymous,
      summary: userstuffText(preface?.querySelector('div.summary blockquote.userstuff') ?? null),
      rating: tags('rating')[0],
      warnings: tags('warning'),
      categories: tags('category'),
      fandoms: tags('fandom'),
      relationships: tags('relationship'),
      characters: tags('character'),
      freeforms: tags('freeform'),
      language: text(meta.querySelector('dd.language')) || stats.language,
      languageCode: meta.querySelector('dd.language')?.getAttribute('lang') || stats.languageCode,
      series: seriesOf(meta),
      words: stats.words,
      chapters: stats.chapters,
      plannedChapters: stats.plannedChapters,
      comments: stats.comments,
      kudos: stats.kudos,
      bookmarks: stats.bookmarks,
      hits: stats.hits,
      published: stats.published,
      updated: stats.statusDate ?? stats.published,
      complete: complete || stats.completedLabel,
      restricted: !!preface?.querySelector('h2.title img[title="Restricted"]'),
      updatedAt,
    },
    chapterIndex: parseChapterIndex(root),
    chapters,
    workNotes: workNotes || undefined,
    workEndNotes: workEnd || undefined,
    downloads: { html: htmlHref, epub: dl('epub'), pdf: dl('pdf'), azw3: dl('azw3'), mobi: dl('mobi') },
    guestComments:
      !!root.querySelector('form.new_comment input[name="comment[name]"]') || /All fields are required/.test(text(root.querySelector('form.new_comment'))),
  };
}
