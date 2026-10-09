// AO3's official HTML download (download.archiveofourown.org/downloads/ID/Title.html): the whole
// work in one file, served from Cloudflare's cache and versioned by `updated_at`. Layout
// (otwarchive app/views/downloads):
//
//   #preface    tags, title, byline, summary, work notes
//   #chapters   per chapter: div.meta.group (h2 "Chapter N: Title", chapter summary / notes)
//               <!--chapter content--> div.userstuff <!--/chapter content-->
//               then div.meta#endnotesN (chapter end notes)
//   #afterword  work end notes, works inspired by this one
//
// A work that isn't chaptered has no chapter headings: #chapters holds one div.userstuff.
//
// A long work is a big file, so it isn't parsed as one document: it's cut at the chapter-content
// markers (HTML comments, which AO3 strips from what authors write, so they can't be faked) and
// each chapter is parsed on its own, as the download loop asks for it.

import { El, parseHtml, text } from '../../../html/dom';
import type { AuthorRef } from '../../types';
import { childEls, hasClass, parseByline, userstuffHtml, userstuffText, workIdFromHref } from './common';
import type { Ao3Chapter } from './work';

const OPEN = '<!--chapter content-->';
const CLOSE = '<!--/chapter content-->';

export interface Ao3DownloadPreface {
  workId?: string;
  title: string;
  authors: AuthorRef[];
  summary: string;
  /** Sanitized. */
  workNotes?: string;
  /** "17/17" from the stats line. */
  chapters?: number;
}

export interface Ao3Download {
  preface: Ao3DownloadPreface;
  /** Sanitized work end notes (from #afterword). */
  workEndNotes?: string;
  /** Number of chapters in the file. */
  count: number;
  /** Parses chapter i (from 0) on demand. */
  chapter(i: number): Ao3Chapter;
}

/** The chapter's label / blockquote pairs: "Chapter Summary" then its text, "Chapter Notes" then its text. */
function metaBlocks(meta: El | null): { summary?: string; notes?: string } {
  const out: { summary?: string; notes?: string } = {};
  if (!meta) return out;
  let label = '';
  for (const el of childEls(meta)) {
    if (el.tagName === 'P' && !hasClass(el, 'byline')) label = text(el);
    else if (el.tagName === 'BLOCKQUOTE') {
      const html = userstuffHtml(el) || undefined;
      if (/summary/i.test(label)) out.summary = html;
      else out.notes = html;
    }
  }
  return out;
}

function headingTitle(meta: El | null, n: number): string {
  const t = text(meta?.querySelector('h2.heading'));
  const m = t.match(/^Chapter\s+\d+\s*:\s*(.+)$/i);
  return m ? m[1].trim() : `Chapter ${n}`;
}

/** The first element of a fragment that is a direct child of the fragment's root and matches. */
function topLevel(root: El, pred: (el: El) => boolean): El | null {
  // A fragment cut from inside #chapters can start inside it; look one level down too.
  for (const el of childEls(root)) {
    if (pred(el)) return el;
  }
  for (const el of childEls(root)) {
    for (const c of childEls(el)) if (pred(c)) return c;
  }
  return null;
}

const isMetaGroup = (el: El) => el.tagName === 'DIV' && hasClass(el, 'meta') && hasClass(el, 'group');
const isEndNotes = (el: El) => el.tagName === 'DIV' && hasClass(el, 'meta') && /^endnotes\d+$/.test(el.id);

function parsePreface(html: string): Ao3DownloadPreface {
  const root = parseHtml(html);
  const pre = root.querySelector('#preface') ?? root;
  const metaDiv = pre.querySelector('div.meta');
  let summary = '';
  let workNotes: string | undefined;
  let label = '';
  for (const el of metaDiv ? childEls(metaDiv) : []) {
    if (el.tagName === 'P') label = text(el);
    else if (el.tagName === 'BLOCKQUOTE') {
      if (/summary/i.test(label)) summary = userstuffText(el);
      else if (/notes/i.test(label)) workNotes = userstuffHtml(el) || undefined;
    }
  }
  const stats = pre
    .querySelectorAll('dl.tags dt')
    .find((dt) => /stats/i.test(text(dt)))
    ?.parentNode?.querySelectorAll('dd')
    .map(text)
    .find((t) => /Chapters:/.test(t));
  return {
    workId: workIdFromHref(
      pre
        .querySelectorAll('p.message a')
        .map((a) => a.getAttribute('href') ?? '')
        .find((h) => /\/works\/\d+/.test(h)),
    ),
    title: text(pre.querySelector('h1')),
    authors: parseByline(pre.querySelector('div.byline')).authors,
    summary,
    workNotes,
    chapters: Number(stats?.match(/Chapters:\s*(\d+)/)?.[1]) || undefined,
  };
}

export function parseDownload(html: string): Ao3Download {
  const start = html.indexOf('<div id="chapters"');
  const end = html.lastIndexOf('<div id="afterword"');
  const body = start < 0 ? '' : html.slice(start, end > start ? end : undefined);
  const preface = parsePreface(start < 0 ? html : html.slice(0, start));
  const after = end > start ? parseHtml(html.slice(end)) : null;
  const workEndNotes = userstuffHtml(after?.querySelector('#endnotes blockquote.userstuff') ?? null) || undefined;

  const pieces = body.split(OPEN);
  if (pieces.length < 2) {
    // Not chaptered: the whole work is the one div.userstuff inside #chapters.
    return {
      preface,
      workEndNotes,
      count: body ? 1 : 0,
      chapter: () => {
        const root = parseHtml(body);
        const wrap = root.querySelector('#chapters');
        const text1 = wrap ? (childEls(wrap, 'userstuff')[0] ?? null) : null;
        return { number: 1, title: preface.title, html: userstuffHtml(text1) };
      },
    };
  }

  // pieces[0] is chapter 1's heading block; pieces[i] (i ≥ 1) is chapter i's text, then its end
  // notes and chapter i + 1's heading block. Each piece is parsed on its own (twice at most), never
  // the whole file at once. What comes after a text is read from the fragment's top level, where
  // nothing an author wrote can sit (their words are always inside a blockquote or div.userstuff).
  const headingOf = (i: number): El | null =>
    i === 0 ? parseHtml(pieces[0]).querySelector('div.meta.group') : topLevel(parseHtml(pieces[i].split(CLOSE).slice(1).join(CLOSE)), isMetaGroup);
  return {
    preface,
    workEndNotes,
    count: pieces.length - 1,
    chapter: (i: number): Ao3Chapter => {
      const n = i + 1;
      const meta = headingOf(i);
      const [textPart, ...restParts] = pieces[i + 1].split(CLOSE);
      const body1 = parseHtml(textPart).querySelector('div.userstuff');
      const endNotes = topLevel(parseHtml(restParts.join(CLOSE)), isEndNotes);
      const { summary, notes } = metaBlocks(meta);
      return {
        number: n,
        title: headingTitle(meta, n),
        html: userstuffHtml(body1),
        summary,
        notes,
        endNotes: userstuffHtml(endNotes?.querySelector('blockquote.userstuff') ?? null) || undefined,
      };
    },
  };
}
