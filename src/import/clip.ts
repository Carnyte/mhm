// "Clip this page": a page the user opened in FicShelf's browser, captured as the site showed it
// (src/net/clipScript.ts), made into a book like an imported HTML file. Pure TypeScript.
//
// The page goes through the same cleanup as a saved web page (reader mode, chapter headings, the
// allowlist sanitizer). Then only the text is kept: every picture goes and every link becomes plain
// text (in-page footnote links stay), so no signed image address or tokenised link is stored. The
// site's name comes off the title, and "Story - Chapter 3" titles are split into the story and the
// chapter.

import { render } from 'dom-serializer';
import { findAll, prepend, removeElement } from 'domutils';
import { decodeEntities } from '../html/dom';
import { MAX_CLIP_CHARS } from '../net/clipScript';
import { hostOf } from '../net/httpCore';
import { finishBook, ImageTable, Stepper } from './build';
import { isChapterHeading, parseMarkup } from './dom';
import { parseHtmlPage } from './html';
import { ImportError, type ImportedBook, type ImportedChapter, type ImportOptions } from './types';

export { MAX_CLIP_CHARS };

/** Fewer words than this is a page whose chapter hasn't appeared (a loading screen, a login prompt). */
export const MIN_CLIP_WORDS = 25;

export const CLIP_EMPTY = 'The page doesn’t show any story text yet. Wait until the chapter appears, then tap Clip again.';

export interface ClipOptions extends ImportOptions {
  /** document.title as the page had it (the HTML's own <title> otherwise). */
  title?: string;
  /** The capture stopped checking for hidden text part-way (a very long page). */
  capped?: boolean;
}

/** Query parameters that carry access: tickets, tokens, signatures, sessions. */
const SECRET_PARAM = /^(?:_t|t|token|access_token|auth|key|sig|signature|signed_key|policy|key-pair-id|expires|session|sid|code|ticket)$/i;
const SECRET_PART = /token|sig|auth|session|sessid/i;

/**
 * A page address safe to store: no #fragment, no query parameter that carries access (tickets,
 * tokens, signatures, sessions); others stay ("?chapter=3"). Host in lower case. '' for anything
 * that isn't an http(s) address.
 */
export function cleanClipUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  u.hash = '';
  u.username = '';
  u.password = '';
  for (const name of [...new Set(u.searchParams.keys())]) {
    if (SECRET_PARAM.test(name) || SECRET_PART.test(name)) u.searchParams.delete(name);
  }
  // URL lower-cases the host already; an emptied query leaves no "?".
  return u.toString().replace(/\?$/, '');
}

const SEPARATOR = /\s+[|\-–—·•:»]\s+/;

/** Letters and digits only, lower case: "Royal Road" and "royalroad.com" compare equal. */
const squash = (s: string) => s.toLowerCase().replace(/\.(?:com|net|org|io|co|me|info|xyz)$/, '').replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Names the site goes by, from its address: "global.novelpia.com" → novelpia, globalnovelpia,
 * global; "reader.example.com" → reader, example, readerexample.
 */
function hostNames(host: string): Set<string> {
  const labels = host.replace(/^(?:www|m)\./, '').split('.');
  const names = new Set<string>();
  for (let i = 0; i < labels.length - 1; i++) {
    names.add(squash(labels.slice(i, -1).join('')));
    if (labels[i].length >= 3) names.add(squash(labels[i]));
  }
  names.add(squash(labels.join('')));
  return names;
}

/** The title without the site's name at its start or end ("Story - Chapter 3 | Site" → "Story - Chapter 3"). */
export function stripSiteName(title: string, host: string, siteName?: string): string {
  const names = hostNames(host);
  if (siteName) names.add(squash(siteName));
  const isSite = (s: string) => names.has(squash(s));
  let parts = title.split(SEPARATOR);
  while (parts.length > 1 && isSite(parts[0])) parts = parts.slice(1);
  while (parts.length > 1 && isSite(parts[parts.length - 1])) parts = parts.slice(0, -1);
  // Rebuild with the separators the title had.
  if (parts.length === title.split(SEPARATOR).length) return title.trim();
  const start = title.indexOf(parts[0]);
  const last = parts[parts.length - 1];
  const end = title.lastIndexOf(last) + last.length;
  return title.slice(start, end).trim();
}

/** "Story - Chapter 3" → story "Story", chapter "Chapter 3" (either way round); else just the story. */
export function splitTitle(title: string): { story: string; chapter?: string } {
  const parts = title.split(SEPARATOR);
  if (parts.length < 2) return { story: title.trim() };
  const at = parts.findIndex((p) => isChapterHeading(p, true));
  if (at < 0) return { story: title.trim() };
  // The chapter part runs to the end when it's last ("Story - Chapter 3: The Fall" keeps its subtitle).
  const m = [...title.matchAll(new RegExp(SEPARATOR.source, 'g'))];
  const cut = (i: number) => (i === 0 ? 0 : m[i - 1].index! + m[i - 1][0].length);
  if (at === 0) {
    // "Chapter 3 - Story": the chapter is the first part, the story the rest.
    return { story: title.slice(cut(1)).trim(), chapter: parts[0].trim() };
  }
  return { story: title.slice(0, m[at - 1].index).trim(), chapter: title.slice(cut(at)).trim() };
}

/** <meta property="og:site_name"> as the capture kept it. */
function metaSiteName(html: string): string | undefined {
  const head = html.slice(0, Math.min(html.length, 200_000));
  const tag = head.match(/<meta\b[^>]*(?:property|name)="og:site_name"[^>]*>/i)?.[0];
  const content = tag?.match(/\bcontent="([^"]*)"/i)?.[1];
  return content ? decodeEntities(content).trim() || undefined : undefined;
}

function pageTitle(html: string): string | undefined {
  const t = html.slice(0, Math.min(html.length, 200_000)).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? decodeEntities(t).replace(/\s+/g, ' ').trim() || undefined : undefined;
}

/** A chapter with its pictures removed and its links turned into text (in-page links stay). */
function textOnly(c: ImportedChapter): ImportedChapter {
  if (!/<(?:img|picture|source|a)\b/i.test(c.html)) return c;
  const doc = parseMarkup(c.html);
  for (const e of findAll((x) => x.name === 'img' || x.name === 'picture' || x.name === 'source', doc.children)) removeElement(e);
  for (const a of findAll((x) => x.name === 'a' && !(x.attribs.href ?? '').startsWith('#'), doc.children)) {
    for (const child of [...a.children]) prepend(a, child);
    removeElement(a);
  }
  return { ...c, html: render(doc, { encodeEntities: 'utf8' }) };
}

/**
 * A clipped page as a book: kind 'html', generator 'clip', `sourceUrl` the cleaned page address,
 * text only. Throws ImportError 'too-large' or 'empty' (with a message for the user).
 */
export async function parseClip(html: string, pageUrl: string, opts: ClipOptions = {}): Promise<ImportedBook> {
  if (html.length > MAX_CLIP_CHARS) throw new ImportError('too-large', 'This page is too large to clip.');
  const stepper = new Stepper(opts);
  stepper.check();
  const host = hostOf(pageUrl);
  const images = new ImageTable(() => undefined);
  const draft = await parseHtmlPage(html, stepper, images);
  draft.chapters = draft.chapters.map(textOnly);
  let book: ImportedBook;
  try {
    book = finishBook(draft, host);
  } catch (e) {
    if (e instanceof ImportError && e.code === 'empty') throw new ImportError('empty', CLIP_EMPTY);
    throw e;
  }
  if (book.words < MIN_CLIP_WORDS) throw new ImportError('empty', CLIP_EMPTY);

  const raw = (opts.title?.replace(/\s+/g, ' ').trim() || pageTitle(html)) ?? '';
  const named = splitTitle(stripSiteName(raw, host, metaSiteName(html)));
  const heading = draft.title.trim();
  // A one-chapter page is titled from the page: its chapter part, else its heading, else the story.
  if (book.chapters.length === 1) {
    const fromHeading = heading && heading !== raw && heading !== named.story ? heading : undefined;
    book.chapters[0] = { ...book.chapters[0], title: named.chapter ?? fromHeading ?? (named.story || book.chapters[0].title) };
  }
  book.title = named.story || book.title || host;
  if (opts.capped) book.warnings.push('This page is very long, so FicShelf didn’t check all of it for hidden text: some of it may be included.');
  const url = cleanClipUrl(pageUrl);
  return {
    ...book,
    kind: 'html',
    generator: 'clip',
    images: [],
    ...(url ? { sourceUrl: url } : {}),
  };
}

/** The book's chapters as one chapter (each one's title kept as a heading): "Keep as one chapter". */
export function asOneChapter(book: ImportedBook, title = book.chapters[0]?.title ?? book.title): ImportedBook {
  if (book.chapters.length < 2) return book;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = book.chapters.map((c) => `<h3>${esc(c.title)}</h3>\n${c.html}`).join('\n');
  return { ...book, chapters: [{ title, html, words: book.words }] };
}
