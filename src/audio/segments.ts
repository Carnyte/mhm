// Splits chapter HTML into short spoken segments for the audiobook player, and tags the matching
// elements in the HTML with data-tts="<block>" so the reader can highlight what's being read.
// Pure TypeScript (htmlparser2), so the player works without the reader being open.

import { render } from 'dom-serializer';
import { Element, isTag, isText, type AnyNode, type ParentNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';

export interface Segment {
  text: string;
  /** Index of the tagged element in the chapter HTML (data-tts), or -1 for spoken extras. */
  block: number;
  words: number;
}

export interface SegmentedChapter {
  segments: Segment[];
  /** Chapter HTML with data-tts attributes added. */
  html: string;
  words: number;
  blocks: number;
}

/** Long paragraphs are split at sentence boundaries so pause / skip stay responsive. */
export const MAX_SEGMENT_CHARS = 420;

const BLOCK_TAGS = new Set([
  'p', 'div', 'center', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'ul', 'ol', 'dl', 'dd', 'dt',
  'table', 'pre', 'section', 'article', 'header', 'footer', 'aside', 'hr', 'figure',
]);
/** Treated as one unit even if they contain blocks (splitting tables / pre would break markup). */
const LEAF_BLOCK_TAGS = new Set(['table', 'pre', 'hr', 'figure']);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);

function isBlock(n: AnyNode): n is Element {
  return isTag(n) && BLOCK_TAGS.has(n.name);
}

function hasBlockChild(el: Element): boolean {
  return el.children.some((c) => isTag(c) && !SKIP_TAGS.has(c.name) && (BLOCK_TAGS.has(c.name) || hasBlockChild(c)));
}

function nodeText(n: AnyNode): string {
  if (isText(n)) return n.data;
  if (!isTag(n) || SKIP_TAGS.has(n.name)) return '';
  if (n.name === 'br') return '\n';
  const inner = n.children.map(nodeText).join('');
  if (n.name === 'td' || n.name === 'th') return ` ${inner} `;
  return BLOCK_TAGS.has(n.name) || n.name === 'tr' ? `\n${inner}\n` : inner;
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Separator lines like "* * *", "~~~~" or "-o-o-" aren't worth reading aloud. */
export function isSpeakable(s: string): boolean {
  const letters = s.match(/[A-Za-z0-9\u00C0-\u024F\u0370-\u1FFF\u3040-\uFFEF]/g)?.length ?? 0;
  if (!letters) return false;
  // A single letter repeated with separators between ("-x-x-x-", "~o~o~") is decoration, but
  // short dialogue like "I-I...", "Mm." or "Zzz…" has quotes or sentence punctuation.
  if (s.length <= 24 && !/["“”'‘’.!?…]/.test(s) && /[^A-Za-z\s]/.test(s)) {
    const only = s.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (/^([a-z])\1*$/.test(only)) return false;
  }
  return true;
}

function countWordsIn(s: string): number {
  return s.match(/\S+/g)?.length ?? 0;
}

/** Splits text into chunks of at most `max` characters, preferring sentence then clause breaks. */
export function splitText(text: string, max = MAX_SEGMENT_CHARS): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["'”’»)\]]*|$)\s*/g) ?? [text];
  const pieces: string[] = [];
  for (const s of sentences) {
    if (s.length <= max) {
      pieces.push(s);
      continue;
    }
    // A very long sentence: break at clause punctuation, then at spaces.
    const clauses = s.match(/[^,;:—–]+(?:[,;:—–]+|$)\s*/g) ?? [s];
    for (const c of clauses) {
      if (c.length <= max) {
        pieces.push(c);
        continue;
      }
      let rest = c;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        pieces.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      if (rest) pieces.push(rest);
    }
  }
  const out: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + p.length > max) {
      out.push(cur.trim());
      cur = '';
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

function relink(parent: ParentNode) {
  const kids = parent.children;
  for (let i = 0; i < kids.length; i++) {
    kids[i].parent = parent;
    kids[i].prev = kids[i - 1] ?? null;
    kids[i].next = kids[i + 1] ?? null;
  }
}

export function segmentChapter(html: string): SegmentedChapter {
  const doc = parseDocument(html ?? '', { decodeEntities: true, lowerCaseAttributeNames: true });
  const segments: Segment[] = [];
  let block = 0;

  const addBlock = (text: string): number | null => {
    const t = clean(text);
    if (!t || !isSpeakable(t)) return null;
    const b = block++;
    for (const part of splitText(t)) segments.push({ text: part, block: b, words: countWordsIn(part) });
    return b;
  };

  // Inline content directly inside a container (text with <br>s, no <p>): split at blank lines
  // (two or more <br>) and wrap each group in <span data-tts> so it can still be highlighted.
  const flushRun = (parent: ParentNode, run: AnyNode[], out: AnyNode[]) => {
    let content: AnyNode[] = [];
    let gap: AnyNode[] = []; // <br>s and whitespace not yet assigned to a group
    const emit = () => {
      if (!content.length) return;
      const b = addBlock(content.map(nodeText).join(''));
      if (b == null) {
        out.push(...content);
      } else {
        const span = new Element('span', { 'data-tts': String(b) }, content);
        relink(span);
        span.parent = parent;
        out.push(span);
      }
      content = [];
    };
    for (const n of run) {
      if ((isTag(n) && n.name === 'br') || (isText(n) && !n.data.trim())) {
        gap.push(n);
        continue;
      }
      if (gap.filter((g) => isTag(g)).length >= 2) {
        emit();
        out.push(...gap);
      } else {
        content.push(...gap);
      }
      gap = [];
      content.push(n);
    }
    emit();
    out.push(...gap);
  };

  const walk = (parent: ParentNode) => {
    const out: AnyNode[] = [];
    let run: AnyNode[] = [];
    for (const child of [...parent.children]) {
      if (isTag(child) && SKIP_TAGS.has(child.name)) {
        out.push(child);
        continue;
      }
      if (isBlock(child)) {
        flushRun(parent, run, out);
        run = [];
        if (!LEAF_BLOCK_TAGS.has(child.name) && hasBlockChild(child)) {
          walk(child);
        } else {
          const b = addBlock(nodeText(child));
          if (b != null) child.attribs['data-tts'] = String(b);
        }
        out.push(child);
      } else if (isTag(child) && hasBlockChild(child)) {
        // Inline wrapper around blocks (e.g. <span><p>…</p></span>): look inside.
        flushRun(parent, run, out);
        run = [];
        walk(child);
        out.push(child);
      } else {
        run.push(child);
      }
    }
    flushRun(parent, run, out);
    parent.children = out;
    relink(parent);
  };

  walk(doc);
  return {
    segments,
    html: render(doc.children, { encodeEntities: 'utf8' }),
    words: segments.reduce((n, s) => n + s.words, 0),
    blocks: block,
  };
}
