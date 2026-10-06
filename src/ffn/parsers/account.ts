// Account pages (story/author alerts, favourites, private messages).
// These need a login, so their exact markup could not be inspected when this was written.
// The parsers are adaptive: rows are located through story / user / PM links and the
// page's own forms are used for removals (see forms.ts).

import type { AccountAuthorRow, AccountStoryRow, PmMessage, PmSummary, StorySummary } from '../types';
import {
  attr,
  idFromPath,
  parseHtml,
  parsePagination,
  sanitizeHtml,
  text,
  userFromLink,
  xutime,
  type El,
} from './dom';
import { metaHtmlToText, parseMetaText } from './meta';
import { parseStoryItems } from './storyList';

export function isLoginRequired(html: string): boolean {
  return /You must be logged in to access this page/i.test(html) || /<form[^>]+name=['"]?login/i.test(html);
}

function rowsOf(root: El): El[] {
  const rows = root.querySelectorAll('tr');
  if (rows.length) return rows;
  return root.querySelectorAll('div.z-list, li, div.row');
}

function checkboxValue(row: El): string | undefined {
  const cb = row.querySelector("input[type='checkbox'], input[type=checkbox], input[TYPE=checkbox]");
  return attr(cb, 'value');
}

export function parseAccountStories(html: string): { rows: AccountStoryRow[]; page: ReturnType<typeof parsePagination> } {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const page = parsePagination(content, /[?&]p(?:age)?=(\d+)/);

  // If the page uses the standard z-list cards, reuse the normal parser.
  const zl = parseStoryItems(content);
  if (zl.length) {
    const rows = content.querySelectorAll('div.z-list').map((z, i) => ({ story: zl[i], removeValue: checkboxValue(z) }));
    return { rows: rows.filter((r) => r.story), page };
  }

  const out: AccountStoryRow[] = [];
  const seen = new Set<number>();
  for (const row of rowsOf(content)) {
    const storyA = row.querySelectorAll('a').find((a) => /^(?:https?:\/\/www\.fanfiction\.net)?\/s\/\d+/.test(attr(a, 'href') ?? ''));
    const id = idFromPath(attr(storyA, 'href'), /\/s\/(\d+)/);
    if (!storyA || !id || seen.has(id)) continue;
    // Skip nested container rows that hold many stories.
    if (row.querySelectorAll('tr').length > 0) continue;
    seen.add(id);
    const authorA = row.querySelectorAll('a').find((a) => /\/u\/\d+/.test(attr(a, 'href') ?? ''));
    const metaText = metaHtmlToText(row.innerHTML);
    const meta = parseMetaText(metaText);
    const times = row.querySelectorAll('[data-xutime]').map((t) => xutime(t)!).filter(Boolean);
    // Candidate fandom cells: plain text cells without links, dates or checkboxes.
    const cells = row
      .querySelectorAll('td')
      .filter((td) => !td.querySelector('a, input, [data-xutime]'))
      .map((td) => text(td));
    const story: StorySummary = {
      id,
      title: text(storyA),
      author: userFromLink(authorA),
      summary: '',
      fandom: meta.fandom ?? cells.find((c) => c && !/^\d/.test(c) && c.length < 80),
      genres: meta.genres,
      rating: meta.rating,
      chapters: meta.chapters,
      words: meta.words,
      reviews: meta.reviews,
      favs: meta.favs,
      follows: meta.follows,
      updated: meta.updated ?? (times.length ? Math.max(...times) : undefined),
      published: meta.published,
      complete: meta.complete,
      meta: '',
    };
    out.push({ story, removeValue: checkboxValue(row) });
  }
  return { rows: out, page };
}

export function parseAccountAuthors(html: string): { rows: AccountAuthorRow[]; page: ReturnType<typeof parsePagination> } {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const out: AccountAuthorRow[] = [];
  const seen = new Set<number>();
  for (const row of rowsOf(content)) {
    if (row.querySelectorAll('tr').length > 0) continue;
    const a = row.querySelectorAll('a').find((x) => /\/u\/\d+/.test(attr(x, 'href') ?? ''));
    const user = userFromLink(a);
    if (!user || seen.has(user.id)) continue;
    seen.add(user.id);
    out.push({ user, removeValue: checkboxValue(row), meta: text(row).replace(user.name, '').trim() || undefined });
  }
  return { rows: out, page: parsePagination(content, /[?&]p(?:age)?=(\d+)/) };
}

/** PM inbox / sent lists: rows containing a link into /pm2/ (read view). */
export function parsePmList(html: string): PmSummary[] {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const out: PmSummary[] = [];
  const seen = new Set<string>();
  for (const row of rowsOf(content)) {
    if (row.querySelectorAll('tr').length > 0) continue;
    const link = row
      .querySelectorAll('a')
      .find((a) => /\/pm2\/(?!post|inbox|sent|compose)[\w.]+\?.*\d/.test(attr(a, 'href') ?? ''));
    if (!link) continue;
    const path = attr(link, 'href')!;
    const id = path.match(/(?:id|pmid|mid|threadid|tid)=(\d+)/i)?.[1] ?? path;
    if (seen.has(id)) continue;
    seen.add(id);
    const userA = row.querySelectorAll('a').find((a) => /\/u\/\d+/.test(attr(a, 'href') ?? ''));
    const time = row.querySelector('[data-xutime]');
    const cells = row.querySelectorAll('td').map((td) => text(td)).filter(Boolean);
    out.push({
      id,
      path,
      subject: text(link) || '(no subject)',
      with: userFromLink(userA),
      withName: userA ? text(userA) : cells.find((c) => c !== text(link) && c.length < 40),
      date: xutime(time),
      dateLabel: text(time) || undefined,
      unread: !!row.querySelector('b, strong, .unread, .badge-important') || /unread|new/i.test(attr(row, 'class') ?? ''),
    });
  }
  return out;
}

export function parsePmMessage(html: string): PmMessage {
  const root = parseHtml(html);
  const content = root.querySelector('#content_wrapper_inner') ?? root;
  const userA = content.querySelectorAll('a').find((a) => /\/u\/\d+/.test(attr(a, 'href') ?? ''));
  const replyA = content.querySelectorAll('a').find((a) => /pm2\/post\.php/.test(attr(a, 'href') ?? ''));
  // The message body is the largest text block on the page.
  let best: El | null = null;
  let bestLen = 0;
  for (const el of content.querySelectorAll('div, td, p')) {
    if (el.querySelector('table, form')) continue;
    const len = text(el).length;
    if (len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  const subjectEl = content.querySelector('b, strong, h1, h2, .tcat');
  return {
    subject: text(subjectEl) || 'Message',
    from: userFromLink(userA),
    date: xutime(content.querySelector('[data-xutime]')),
    html: best ? sanitizeHtml(best.innerHTML) : '',
    replyPath: attr(replyA, 'href'),
  };
}
