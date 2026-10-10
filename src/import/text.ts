// Plain text and Markdown files.
//
// Text: chapters start at heading lines ("Chapter 12", "Chapter 12: Title", "CHAPTER ONE",
// "Prologue", "Part II"…) standing alone between blank lines, or, in FanFicFare's TXT layout, at
// titles indented after two blank lines. Lines hard-wrapped at a fixed width (FanFicFare wraps at
// about 78 columns) are joined back into paragraphs; short lines and blank lines stay breaks.
// *Emphasis* and _emphasis_ written with asterisks or underscores become italics.
//
// Markdown: `#` headings are chapters (`##` when a single `#` is the book's title), with the
// common block syntax (paragraphs, emphasis, headings, rules, quotes, lists, code). Raw HTML in
// it is shown as text, never as markup.

import { chapterFromHtml, sanitizeFragment, Stepper, type BookDraft } from './build';
import { decodeBytesAsync } from './decode';
import { findStoryUrl } from './detect';
import { isChapterHeading, labeledFields } from './dom';
import { fieldTags, languageName, parseComplete, parseDate, plainSummary } from './meta';
import type { ImportedChapter } from './types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Text that is HTML-escaped already, made safe inside a quoted attribute. */
const quoteSafe = (s: string) => s.replace(/"/g, '&quot;');

const blank = (l: string | undefined) => l === undefined || l.trim() === '';
const words = (lines: string[]) => lines.join(' ').match(/\S+/g)?.length ?? 0;
const baseName = (fileName: string) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

/** A scene break: "* * *", "***", "---", "~~~", "###", "o0o0o", "=-=-=". */
const SCENE_BREAK = /^\s*(?:(?:[*#~=_+-]\s*){3,}|(?:[oO0]\s*){4,}|(?:=-)+=?)\s*$/;

/** Inline Markdown on one line of text: emphasis, strike, code, links. HTML is escaped first. */
export function inlineMarkdown(s: string): string {
  const kept: string[] = [];
  const keep = (html: string) => `\u0001${kept.push(html) - 1}\u0001`;
  let h = esc(s);
  h = h.replace(/\\([\\`*_{}[\]()#+\-.!~>|])/g, (_m, c: string) => keep(c));
  h = h.replace(/`([^`]+)`/g, (_m, c: string) => keep(`<code>${c}</code>`));
  // Link targets may hold one level of parentheses ("…/Foo_(bar)").
  const target = String.raw`\(\s*([^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+[^)]*)?\)`;
  h = h.replace(new RegExp(String.raw`!\[([^\]]*)\]` + target, 'g'), (_m, alt: string, url: string) =>
    /^https?:\/\//i.test(url) ? keep(`<img src="${quoteSafe(url)}" alt="${quoteSafe(alt)}">`) : alt,
  );
  h = h.replace(new RegExp(String.raw`\[([^\]]+)\]` + target, 'g'), (_m, text: string, url: string) =>
    /^(https?:|mailto:)/i.test(url) ? `<a href="${quoteSafe(url)}">${text}</a>` : text,
  );
  h = h.replace(/\*\*(?=\S)(.*?\S)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w])__(?=\S)(.*?\S)__(?!\w)/g, '$1<strong>$2</strong>');
  h = h.replace(/(^|[^*\w])\*(?=[^\s*])([^*]*?[^\s*])\*(?![*\w])/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?=[^\s_])([^_]*?[^\s_])_(?![_\w])/g, '$1<em>$2</em>');
  h = h.replace(/~~(?=\S)(.*?\S)~~/g, '<del>$1</del>');
  return h.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => kept[Number(i)]);
}

// ── Plain text ───────────────────────────────────────────────────────────────────────────────

/**
 * The width a text is hard-wrapped at, or null when its lines are paragraphs. Wrapped text has
 * nearly no line longer than the width, and its full lines rarely end a sentence.
 */
function wrapWidth(lines: string[]): number | null {
  const lens = lines
    .map((l) => l.trimEnd().length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (lens.length < 8) return null;
  const w = lens[Math.floor(lens.length * 0.95)];
  if (w < 40 || w > 100 || lens[lens.length - 1] > w + 12) return null;
  const full = lines.filter((l) => l.trimEnd().length >= w * 0.6);
  const ending = full.filter((l) => /[.!?"”’')\]…]\s*$/.test(l)).length;
  return ending < full.length * 0.5 ? w : null;
}

interface TextLayout {
  /** Hard-wrap width, or null. */
  width: number | null;
  /** Paragraphs are separated by blank lines (else every line, or every wrapped run, is one). */
  blankSeparated: boolean;
  /** FanFicFare's TXT: Markdown-style headings inside chapters. */
  fff: boolean;
}

/** One block of lines (between blank lines) as HTML. */
function blockHtml(lines: string[], layout: TextLayout): string {
  const first = lines[0].trim();
  if (lines.length === 1 && SCENE_BREAK.test(first)) return '<hr>';
  const atx = layout.fff && lines.length === 1 ? first.match(/^(#{1,6})\s+(.+?)\s*#*$/) : null;
  if (atx) return `<h${atx[1].length}>${inlineMarkdown(atx[2])}</h${atx[1].length}>`;
  const w = layout.width;
  const paras: string[] = [];
  let cur = '';
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const last = i === lines.length - 1;
    cur += inlineMarkdown(line);
    if (last) return;
    const hardBreak = / {2,}$/.test(raw) || raw.endsWith('\\');
    const filled = w != null && raw.trimEnd().length >= w * 0.6;
    if (!layout.blankSeparated) {
      // One paragraph per line, or per wrapped run ending at a short line or before an indent.
      const next = lines[i + 1];
      if (!filled || hardBreak || /^\s/.test(next)) {
        paras.push(cur);
        cur = '';
      } else cur += ' ';
    } else cur += filled && !hardBreak ? ' ' : '<br>';
  });
  if (cur) paras.push(cur);
  return paras.map((p) => `<p>${p}</p>`).join('\n');
}

function linesToHtml(lines: string[], layout: TextLayout): string {
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (blank(l)) {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else cur.push(l);
  }
  if (cur.length) blocks.push(cur);
  return blocks.map((b) => blockHtml(b, layout)).join('\n');
}

interface Section {
  title: string;
  lines: string[];
}

const BYLINE = /^(?:by|author|written by)\s*:?\s+(.+)$/i;

export async function parseTextFile(bytes: Uint8Array, fileName: string, stepper: Stepper): Promise<BookDraft> {
  const decoded = await decodeBytesAsync(bytes, {}, stepper.pause);
  const warnings: string[] = [];
  if (decoded.replaced) warnings.push('Some characters couldn’t be read: the file may use a text encoding FicShelf doesn’t know.');
  const lines = decoded.text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  await stepper.pause();
  const head = lines.slice(0, 120);
  const fff = head.some((l) => /^Story URL:\s*\S/.test(l)) && head.some((l) => /^(Packaged:|TABLE OF CONTENTS\s*$)/.test(l));

  // Chapter headings.
  const starts: { at: number; end: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i % 4096 === 0) await stepper.pause();
    const l = lines[i];
    if (blank(l)) continue;
    if (fff) {
      if (/^ {4,}\S/.test(l) && blank(lines[i - 1]) && blank(lines[i - 2])) {
        let title = l.trim();
        let j = i;
        while (j + 1 < lines.length && !blank(lines[j + 1]) && title.length < 300) title += ' ' + lines[++j].trim();
        starts.push({ at: i, end: j, title });
        i = j;
      }
      continue;
    }
    const t = l.trim();
    if (!blank(lines[i - 1]) || !isChapterHeading(t) || t.length > 80) continue;
    if (blank(lines[i + 1])) starts.push({ at: i, end: i, title: t });
    else if (/^[^:.!?]*\d+\s*$|^(chapter|part)\s+\w+$/i.test(t) && lines[i + 1].trim().length <= 60 && blank(lines[i + 2]) && !/[.,;]$/.test(lines[i + 1].trim())) {
      // "Chapter 1" with its title on the next line.
      starts.push({ at: i, end: i + 1, title: `${t}: ${lines[i + 1].trim()}` });
      i++;
    }
  }
  const useHeadings = fff ? starts.length >= 1 : starts.length >= 2;
  const header = useHeadings ? lines.slice(0, starts[0].at) : lines;
  let sections: Section[] = useHeadings
    ? starts.map((s, k) => ({ title: s.title, lines: lines.slice(s.end + 1, k + 1 < starts.length ? starts[k + 1].at : lines.length) }))
    : [];
  // A table of contents written out as headings leaves empty sections.
  sections = sections.filter((s) => s.lines.some((l) => !blank(l)));
  await stepper.pause();
  if (fff && sections.length) {
    const last = sections[sections.length - 1].lines;
    while (last.length && blank(last[last.length - 1])) last.pop();
    if (/^End file\.?$/i.test(last[last.length - 1]?.trim() ?? '')) last.pop();
  }

  // The header: title, author, labelled fields, a summary.
  const headLines = header.map((l) => l.trim());
  if (fff) {
    // FanFicFare wraps long field values onto the next lines.
    for (let i = headLines.length - 1; i > 0; i--) {
      if (headLines[i] && headLines[i - 1] && !/^[A-Z][\w ]{0,30}:/.test(headLines[i]) && /^[A-Z][\w ]{0,30}:/.test(headLines[i - 1]) && !/^Summary:/i.test(headLines[i - 1])) {
        headLines[i - 1] += ' ' + headLines[i];
        headLines.splice(i, 1);
      }
    }
  }
  const fields = labeledFields(headLines.join('\n'));
  let title = '';
  let author: string | undefined;
  let bodyStart = 0;
  const firstIdx = header.findIndex((l) => !blank(l));
  if (firstIdx >= 0) {
    const first = header[firstIdx].trim();
    const looksLikeTitle = first.length <= 100 && !/[.,;!?"”]$/.test(first) && !/^\w[\w ]*:\s/.test(first) && blank(header[firstIdx + 1]);
    if (looksLikeTitle && (useHeadings || header.slice(firstIdx + 1).some((l) => !blank(l)))) {
      title = first;
      bodyStart = firstIdx + 1;
      const by = header.slice(bodyStart).findIndex((l) => !blank(l));
      const byLine = by >= 0 ? header[bodyStart + by].trim().match(BYLINE) : null;
      if (byLine && byLine[1].length <= 80) {
        author = byLine[1].trim();
        bodyStart += by + 1;
      }
    }
  }
  if (!author && fields.Author) author = fields.Author;
  const layout: TextLayout = {
    width: wrapWidth(lines),
    blankSeparated: lines.filter(blank).length * 4 >= lines.filter((l) => !blank(l)).length,
    fff,
  };

  const chapters: ImportedChapter[] = [];
  const add = (t: string, body: string[]) => {
    const html = sanitizeFragment(linesToHtml(body, layout));
    if (html) chapters.push(chapterFromHtml(t, html));
  };
  if (!useHeadings) {
    await stepper.step(0, 1);
    add(title || baseName(fileName), header.slice(bodyStart));
  } else {
    await stepper.step(0, sections.length);
    // Text before the first chapter that isn't the title page is a chapter of its own.
    const intro = fff ? [] : header.slice(bodyStart).filter((l) => !/^\s*\w[\w ]*:\s/.test(l));
    if (words(intro) >= 150) add('Introduction', intro);
    for (let k = 0; k < sections.length; k++) {
      add(sections[k].title, sections[k].lines);
      await stepper.step(k + 1, sections.length);
    }
  }
  const summaryStart = headLines.findIndex((l) => /^Summary:/i.test(l));
  const summaryText =
    summaryStart >= 0
      ? [headLines[summaryStart].replace(/^Summary:\s*/i, ''), ...headLines.slice(summaryStart + 1)].join('\n').split(/\n\s*\n\s*\n/)[0]
      : undefined;
  return {
    kind: 'txt',
    title: title || baseName(fileName),
    authors: author ? [author] : [],
    summary: plainSummary(summaryText?.split(/\n(?=[A-Z][\w ]*:\s)/)[0]),
    tags: fff ? fieldTags(fields) : undefined,
    rating: fields.Rating,
    language: languageName(fields.Language),
    published: parseDate(fields.Published),
    updated: parseDate(fields.Updated) ?? parseDate(fields.Completed),
    complete: parseComplete(fields),
    chapters,
    images: [],
    sourceUrl: fields['Story URL'] ?? fields.Source ?? findStoryUrl(headLines.join('\n')),
    generator: fff ? 'fanficfare' : undefined,
    warnings,
  };
}

// ── Markdown ─────────────────────────────────────────────────────────────────────────────────

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; lines: string[] }
  | { t: 'hr' }
  | { t: 'quote'; lines: string[] }
  | { t: 'list'; ordered: boolean; start: number; items: string[][] }
  | { t: 'code'; text: string };

const ATX = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^ {0,3}([-*+])\s+(.*)$/;
const ORDERED = /^ {0,3}(\d{1,9})[.)]\s+(.*)$/;
const FENCE = /^ {0,3}(```|~~~)/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

function mdBlocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (blank(l)) {
      flush();
      continue;
    }
    const fence = l.match(FENCE);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i]);
      out.push({ t: 'code', text: body.join('\n') });
      continue;
    }
    if (para.length && /^ {0,3}=+\s*$/.test(l)) {
      out.push({ t: 'h', level: 1, text: para.join(' ') });
      para = [];
      continue;
    }
    if (para.length && /^ {0,3}-+\s*$/.test(l)) {
      out.push({ t: 'h', level: 2, text: para.join(' ') });
      para = [];
      continue;
    }
    const atx = l.match(ATX);
    if (atx) {
      flush();
      out.push({ t: 'h', level: atx[1].length, text: atx[2] ?? '' });
      continue;
    }
    if (HR.test(l)) {
      flush();
      out.push({ t: 'hr' });
      continue;
    }
    if (QUOTE.test(l)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && !blank(lines[i]) && (QUOTE.test(lines[i]) || q.length)) q.push(lines[i++].replace(QUOTE, '$1'));
      i--;
      out.push({ t: 'quote', lines: q });
      continue;
    }
    const item = l.match(BULLET) ?? l.match(ORDERED);
    if (item && !para.length) {
      const ordered = !BULLET.test(l);
      const items: string[][] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const m = lines[j].match(ordered ? ORDERED : BULLET);
        if (m) items.push([m[2]]);
        else if (blank(lines[j])) {
          if (!(lines[j + 1] ?? '').match(ordered ? ORDERED : BULLET)) break;
        } else if (/^\s+\S/.test(lines[j]) && items.length) items[items.length - 1].push(lines[j].trim());
        else break;
      }
      out.push({ t: 'list', ordered, start: ordered ? Number(item[1]) : 1, items });
      i = j - 1;
      continue;
    }
    para.push(l);
  }
  flush();
  return out;
}

function paraHtml(lines: string[]): string {
  return lines.map((l, i) => inlineMarkdown(l.trim()) + (i < lines.length - 1 ? (/ {2,}$|\\$/.test(l) ? '<br>' : ' ') : '')).join('');
}

function blocksHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'h':
          return `<h${b.level}>${inlineMarkdown(b.text)}</h${b.level}>`;
        case 'hr':
          return '<hr>';
        case 'code':
          return `<pre><code>${esc(b.text)}</code></pre>`;
        case 'quote':
          return `<blockquote>${blocksHtml(mdBlocks(b.lines))}</blockquote>`;
        case 'list': {
          const tag = b.ordered ? 'ol' : 'ul';
          const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
          return `<${tag}${start}>${b.items.map((it) => `<li>${paraHtml(it)}</li>`).join('')}</${tag}>`;
        }
        default:
          return SCENE_BREAK.test(b.lines.join(' ')) && b.lines.length === 1 ? '<hr>' : `<p>${paraHtml(b.lines)}</p>`;
      }
    })
    .join('\n');
}

export async function parseMarkdownFile(bytes: Uint8Array, fileName: string, stepper: Stepper): Promise<BookDraft> {
  const decoded = await decodeBytesAsync(bytes, {}, stepper.pause);
  const warnings: string[] = [];
  if (decoded.replaced) warnings.push('Some characters couldn’t be read: the file may use a text encoding FicShelf doesn’t know.');
  let lines = decoded.text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  // YAML front matter: title, author, summary, tags.
  const front: Record<string, string> = {};
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0 && end < 80 && lines.slice(1, end).every((l) => blank(l) || /^[\w -]+:/.test(l) || /^\s+/.test(l))) {
      for (const l of lines.slice(1, end)) {
        const m = l.match(/^([\w -]+):\s*(.*)$/);
        if (m) front[m[1].trim().toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
      lines = lines.slice(end + 1);
    }
  }
  const blocks = mdBlocks(lines);
  const level = (n: number) => blocks.filter((b): b is Extract<Block, { t: 'h' }> => b.t === 'h' && b.level === n);
  const h1 = level(1);
  const h2 = level(2);
  let title = front.title ?? '';
  let chapterLevel = 0;
  if (h1.length === 1 && h2.length >= 1 && blocks.indexOf(h1[0]) < blocks.indexOf(h2[0])) {
    title ||= h1[0].text;
    chapterLevel = 2;
  } else if (h1.length >= 2) chapterLevel = 1;
  else if (h1.length === 1 && blocks.indexOf(h1[0]) === 0) {
    title ||= h1[0].text;
  } else if (h2.length >= 2) chapterLevel = 2;

  const chapters: ImportedChapter[] = [];
  const add = (t: string, bs: Block[]) => {
    const html = sanitizeFragment(blocksHtml(bs));
    if (html) chapters.push(chapterFromHtml(t, html));
  };
  if (!chapterLevel) {
    await stepper.step(0, 1);
    const rest = blocks[0]?.t === 'h' && blocks[0].level === 1 ? blocks.slice(1) : blocks;
    add(title || baseName(fileName), rest);
  } else {
    const starts = blocks.map((b, i) => (b.t === 'h' && b.level === chapterLevel ? i : -1)).filter((i) => i >= 0);
    const intro = blocks.slice(0, starts[0]).filter((b) => !(b.t === 'h' && b.level < chapterLevel));
    const introText = intro.flatMap((b) => (b.t === 'p' ? b.lines : []));
    if (words(introText) >= 150) add('Introduction', intro);
    await stepper.step(0, starts.length);
    for (let k = 0; k < starts.length; k++) {
      const h = blocks[starts[k]] as Extract<Block, { t: 'h' }>;
      add(h.text || `Chapter ${k + 1}`, blocks.slice(starts[k] + 1, starts[k + 1] ?? blocks.length));
      await stepper.step(k + 1, starts.length);
    }
  }
  const introLines = blocks.slice(0, 6).flatMap((b) => (b.t === 'p' ? b.lines : []));
  const fields = labeledFields(introLines.join('\n'));
  const by = introLines.map((l) => l.trim().match(BYLINE)?.[1]).find(Boolean);
  const author = front.author ?? fields.Author ?? by;
  const tags = (front.tags ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .map((label) => ({ kind: 'freeform' as const, label }));
  return {
    kind: 'md',
    title: title.replace(/[*_`]/g, '') || baseName(fileName),
    authors: author ? [author] : [],
    summary: plainSummary(front.summary ?? front.description ?? fields.Summary),
    tags,
    language: languageName(front.language ?? front.lang),
    published: parseDate(front.date ?? fields.Published),
    updated: parseDate(fields.Updated),
    complete: parseComplete(fields),
    chapters,
    images: [],
    sourceUrl: front.source ?? front.url ?? fields['Story URL'] ?? fields.Source,
    warnings,
  };
}
