// Helpers for the import corpus (tests/import-corpus.test.ts): synthetic text made of numbered
// marker words, a small EPUB builder, and one check that compares a book with what a case wants and
// shows every difference in a single diff.

import { parseImport, type ImportedBook, type ImportGenerator } from '../../src/import';
import { buildEpub, ncx, xhtml } from './epub';

/** `tag0 tag1 … tag{n-1}`: n words, each one findable. */
export const words = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
/** One paragraph of n marker words ending in a full stop. */
export const para = (tag: string, n: number) => `<p>${words(tag, n)}.</p>`;
/** About `total` words in paragraphs of `per`; paragraph k's words are tagged `${tag}${k}x`. */
export const paras = (tag: string, total: number, per = 100) => Array.from({ length: Math.ceil(total / per) }, (_, k) => para(`${tag}${k}x`, per)).join('');
export const bytes = (s: string) => new TextEncoder().encode(s);
/** Lines joined into a plain-text file. */
export const lines = (...ls: string[]) => ls.join('\n');

/** A book's text as one string: tags gone, notes kept, entities read. */
export const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const XHTML = 'application/xhtml+xml';

export interface EpubOpts {
  /** Inner XML of <metadata> (default: title "T", creator "A"). */
  meta?: string;
  /** More manifest items: id → [href, media type]. */
  extra?: Record<string, [string, string]>;
  /** Binary files by href under OEBPS/. */
  bin?: Record<string, Uint8Array>;
  /** Reading order by file name, when it isn't the order of `files`. */
  spine?: string[];
}

/** An EPUB 2 under OEBPS/ with an NCX of [label, href] pairs; each file is a body's markup. */
export function epub(toc: [string, string][], files: Record<string, string>, o: EpubOpts = {}): Uint8Array {
  const names = Object.keys(files);
  const manifest: Record<string, [string, string]> = { ncx: ['toc.ncx', 'application/x-dtbncx+xml'], ...o.extra };
  names.forEach((n, i) => (manifest[`f${i}`] = [n, XHTML]));
  const all: Record<string, string | Uint8Array> = { 'OEBPS/toc.ncx': ncx(toc) };
  for (const [n, body] of Object.entries(files)) all[`OEBPS/${n}`] = xhtml(body);
  for (const [n, b] of Object.entries(o.bin ?? {})) all[`OEBPS/${n}`] = b;
  const spine = (o.spine ?? names).map((n) => `f${names.indexOf(n)}`);
  return buildEpub({ metadata: o.meta ?? '<dc:title>T</dc:title><dc:creator>A</dc:creator>', manifest, spine, spineAttrs: 'toc="ncx"', files: all });
}

/** Text dropped with less than this many words needs no warning (a title, a byline, a credit line). */
export const LEFT_OUT_MIN = 40;

export interface Case {
  /** The scenario: repro script, case and what it is ("r3/p1 A: Start-only TOC, 6 files"). */
  name: string;
  file: string;
  input: () => Uint8Array | string;
  /** Why this is the right result, where the trees disagreed. */
  why?: string;
  title?: string;
  authors?: string[];
  /** The origin's story key, or null for none. */
  origin?: string | null;
  sourceUrl?: string | null;
  generator?: ImportGenerator | null;
  summary?: string;
  /** Chapter titles in order; a RegExp where more than one name is right. */
  chapters?: (string | RegExp)[];
  /** How many chapters, where their titles don't matter. */
  count?: number;
  /** Words per chapter, about (5 words or 3%); null skips one. */
  words?: (number | null)[];
  /** The book's words, about. */
  total?: number;
  /** Text somewhere in the book (notes count). */
  has?: string[];
  /** Text in a given chapter, by index. */
  inChapter?: Record<number, string[]>;
  /** Text nowhere in the book. */
  lacks?: string[];
  /** Markup somewhere in the chapters' HTML. */
  html?: string[];
  /** 'none': no warnings at all; a RegExp: one warning matches it. */
  warn?: RegExp | 'none';
  /** Text was left out: a warning says so, with about this many words. */
  leftOut?: number;
  /** Either all of `has` is in the book, or a warning says about `words` words were left out. */
  keptOrWarned?: { has: string[]; words: number };
  /** Must finish within this many ms, with no synchronous stretch longer than `stall` ms. */
  ms?: number;
  stall?: number;
  /** More checks: each returns a problem, or nothing when all is well. */
  extra?: ((book: ImportedBook) => string | undefined)[];
  /** Jest timeout for this case. */
  timeout?: number;
}

const near = (got: number, want: number) => Math.abs(got - want) <= Math.max(5, want * 0.03);

/** A warning that says text was left out, naming a word count within a factor of 2 of `n`. */
export function leftOutWarning(warnings: string[], n: number): string | undefined {
  return warnings.find((w) => /\bleft out\b/i.test(w) && [...w.matchAll(/(\d[\d,]*)\s+words?\b/gi)].some((m) => {
    const said = Number(m[1].replace(/,/g, ''));
    return said >= n / 2 && said <= n * 2;
  }));
}

/** Runs `fn`, timing it and its longest stretch without a turn of the event loop. */
async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number; stall: number }> {
  const started = Date.now();
  let last = started;
  let stall = 0;
  const tick = setInterval(() => {
    const now = Date.now();
    stall = Math.max(stall, now - last);
    last = now;
  }, 2);
  try {
    const value = await fn();
    const now = Date.now();
    return { value, ms: now - started, stall: Math.max(stall, now - last) };
  } finally {
    clearInterval(tick);
  }
}

/** Imports the case's file and checks the book against everything the case states, in one diff. */
export async function runCase(c: Case): Promise<void> {
  const asked = c.leftOut ?? c.keptOrWarned?.words;
  if (asked !== undefined && asked < LEFT_OUT_MIN) throw new Error(`${c.name}: under ${LEFT_OUT_MIN} words needs no warning`);
  const input = c.input();
  const data = typeof input === 'string' ? bytes(input) : input;
  const { value: book, ms, stall } = await timed(() => parseImport(data, c.file));
  const got: Record<string, unknown> = {};
  const want: Record<string, unknown> = {};
  const put = (key: string, g: unknown, w: unknown) => {
    got[key] = g;
    want[key] = w;
  };
  const texts = book.chapters.map((ch) => plain(ch.html));
  const all = texts.join(' ');

  if (c.title !== undefined) put('title', book.title, c.title);
  if (c.authors) put('authors', book.authors, c.authors);
  if (c.origin !== undefined) put('origin', book.origin?.key ?? null, c.origin);
  if (c.sourceUrl !== undefined) put('sourceUrl', book.sourceUrl ?? null, c.sourceUrl);
  if (c.generator !== undefined) put('generator', book.generator ?? null, c.generator);
  if (c.summary !== undefined) put('summary', book.summary, c.summary);
  if (c.chapters) {
    const titles = book.chapters.map((ch, i) => {
      const w = c.chapters![i];
      return w instanceof RegExp && w.test(ch.title) ? w : ch.title;
    });
    put('chapters', titles, c.chapters);
  }
  if (c.count !== undefined) put('count', book.chapters.length, c.count);
  if (c.words) {
    const wanted = c.words;
    put('words', book.chapters.map((ch, i) => (wanted[i] === null || (wanted[i] !== undefined && near(ch.words, wanted[i]!)) ? wanted[i] : ch.words)), wanted);
  }
  if (c.total !== undefined) put('total', near(book.words, c.total) ? c.total : book.words, c.total);
  const missing: string[] = [];
  for (const m of c.has ?? []) if (!all.includes(m)) missing.push(m);
  for (const [i, marks] of Object.entries(c.inChapter ?? {})) for (const m of marks) if (!(texts[Number(i)] ?? '').includes(m)) missing.push(`#${i}: ${m}`);
  if (c.has || c.inChapter) put('missing', missing, []);
  if (c.lacks) put('unwanted', c.lacks.filter((m) => all.includes(m)), []);
  if (c.html) {
    const markup = book.chapters.map((ch) => ch.html).join('\n');
    put('markup missing', c.html.filter((m) => !markup.includes(m)), []);
  }
  if (c.warn === 'none') put('warnings', book.warnings, []);
  else if (c.warn) put('warning', book.warnings.some((w) => (c.warn as RegExp).test(w)) ? c.warn : book.warnings, c.warn);
  if (c.leftOut !== undefined) {
    const label = `says ~${c.leftOut} words were left out`;
    put('left out', leftOutWarning(book.warnings, c.leftOut) ? label : book.warnings, label);
  }
  if (c.keptOrWarned) {
    const { has, words: n } = c.keptOrWarned;
    const lost = has.filter((m) => !all.includes(m));
    const ok = !lost.length || leftOutWarning(book.warnings, n);
    put('kept or warned', ok ? 'ok' : { lost, warnings: book.warnings }, 'ok');
  }
  if (c.ms !== undefined) put('ms', ms < c.ms ? `< ${c.ms}` : ms, `< ${c.ms}`);
  if (c.stall !== undefined) put('longest stall (ms)', stall < c.stall ? `< ${c.stall}` : stall, `< ${c.stall}`);
  if (c.extra) put('problems', c.extra.map((f) => f(book)).filter(Boolean), []);
  expect(got).toEqual(want);
}

/** Each marker is in the book once, and they come in the order given. */
export const inOrder =
  (...markers: string[]) =>
  (book: ImportedBook): string | undefined => {
    const all = book.chapters.map((ch) => plain(ch.html)).join(' ');
    let at = -1;
    for (const m of markers) {
      const i = all.indexOf(m);
      if (i < 0) return `${m} is missing`;
      if (all.indexOf(m, i + 1) >= 0) return `${m} is there twice`;
      if (i < at) return `${m} is out of order`;
      at = i;
    }
  };

/** Every chapter is a "Part n" of a heading-less text. */
export const allParts = (book: ImportedBook): string | undefined => {
  const odd = book.chapters.map((ch) => ch.title).filter((t) => !/^Part \d+$/.test(t));
  return odd.length ? `not parts: ${odd.join(', ')}` : undefined;
};
