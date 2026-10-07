// Splits chapter HTML into short spoken segments for the audiobook player, and tags the matching
// elements in the HTML with data-tts="<block>" so the reader can highlight what's being read.
// Pure TypeScript (htmlparser2), so the player works without the reader being open.

import { render } from 'dom-serializer';
import { Element, isTag, isText, type AnyNode, type ParentNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { speechText } from './speechText';

/** What separates a segment from the one before it, which decides the pause in between. */
export type SegmentBreak = 'none' | 'paragraph' | 'scene';

export interface Segment {
  text: string;
  /** Index of the tagged element in the chapter HTML (data-tts), or -1 for spoken extras. */
  block: number;
  words: number;
  /** 'none' within a paragraph, 'paragraph' at a new one, 'scene' after a separator or <hr>. */
  breakBefore?: SegmentBreak;
}

export interface SegmentedChapter {
  segments: Segment[];
  /**
   * How many segments at the start are the author's front matter (summary, disclaimer, author's
   * notes) rather than the chapter itself; 0 when there's none or it can't be told apart.
   */
  frontMatter: number;
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
/**
 * Dropped from the reader HTML: their text is serialised unescaped, so re-serialising decoded
 * entities inside them could create live markup (a defence on top of the parser's sanitiser).
 */
const DROP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'xmp', 'noembed', 'noframes', 'plaintext', 'iframe', 'object', 'embed']);

function isBlock(n: AnyNode): n is Element {
  return isTag(n) && BLOCK_TAGS.has(n.name);
}

function hasBlockChild(el: Element): boolean {
  return el.children.some((c) => isTag(c) && !SKIP_TAGS.has(c.name) && (BLOCK_TAGS.has(c.name) || hasBlockChild(c)));
}

function nodeText(n: AnyNode): string {
  // Newlines in the HTML source aren't line breaks; only <br> and blocks are.
  if (isText(n)) return n.data.replace(/\s+/g, ' ');
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
  // Letters-only dividers, used where the site strips symbols: "xXx", "oOoOo", "Line Break". The
  // case has to alternate, so "Zzz" or "Ooo" still count as words.
  if (s.length <= 24 && !/["“”'‘’.!?…]/.test(s)) {
    const only = s.replace(/[^A-Za-z]/g, '');
    if (/^([a-z])\1*$/i.test(only) && /[a-z][A-Z]/.test(only)) return false;
    if (/^[^A-Za-z]*(?:line|page|scene)\s*-?\s*break[^A-Za-z]*$/i.test(s)) return false;
  }
  return true;
}

/** A wordless reply or beat ("“…”", "?!", "..."): dialogue, not a scene separator like "* * *". */
const WORDLESS_REPLY = /^["“”'‘’«»(\[]*(?:[.…]+[!?‽]*|[!?‽]+[.…]*)["“”'‘’»)\]]*$/;

// A line that opens with one of these is the author talking, not the story. The first group may
// run straight into the note ("Disclaimer I don't own…", "Rated T for language"); the second needs
// a colon, or a dash and a space; the rest a colon. Quoted text is dialogue, never a label, so
// "“Thanks—” she said" or "“Rating: ten out of ten,” Sirius said" in the story don't count.
const NOTE_START = new RegExp(
  '^[\\s\\[(<{=*_~-]*(?:' +
    "(author(?:['’]?s['’]?)?\\s+notes?|disclaimers?)\\b|a\\s*/\\s*n\\b|a\\.\\s?n(?:\\.|\\s*[:\\-–—])|rated\\s+(?:k\\+?|t|m|ma)\\b|" +
    '(?:summary|chapter summary|warnings?|content warnings?|trigger warnings?|pairings?|rating)\\s*(?::|[\\-–—]\\s)|' +
    '(?:an|n/a|notes?|tw|cw|rated|ships?|beta(?:\'?d)?(?: by| reader)?|edited|updated|thanks|dedicat\\w*|word ?count|words|genres?|' +
    'characters|fandoms?|tags|spoilers?|timeline|setting|recap|reviews?|review replies|(?:previously|last time)(?: on[^:.!?]{0,40})?)\\s*:' +
    ')',
  'i',
);
/** "AN - thanks": capitals and a space after the dash, so "An— an idea" in the story doesn't count. */
const AN_DASH = /^[\s\[(<{=*_~-]*AN\s*[-–—]\s/;

export function isNoteLine(text: string): boolean {
  if (AN_DASH.test(text)) return true;
  const m = NOTE_START.exec(text);
  // A bare "Author's notes" / "Disclaimers" running on in lower case is a sentence ("Disclaimers were…").
  return !!m && !(m[1] && /^\s+(?!i\b)[a-z]/.test(text.slice(m[0].length)));
}

/** "Chapter 3: The Lake", "Chapter Three", "Ch. 12", "Prologue": where the story starts after the notes. */
const CHAPTER_HEADING =
  /^[\s*_~"“-]*(?:chapter\s*\d+|chapter\s+(?:[ivxlc]+|[a-z]+(?:-[a-z]+)?)(?=\s*(?:$|[:.\-–—]))|ch\.?\s*\d+|prologue\b|epilogue\b|interlude\b)/i;

interface BlockInfo {
  text: string;
  /** A scene separator ("* * *", <hr>) comes right before this block. */
  scene: boolean;
  words: number;
  /** The block's lines (split at <br>), when it has more than one. */
  lines?: string[];
}

/** Every line is the author's: "A/N: hi!<br>Harry walked in." in one paragraph holds story too. */
function isNoteBlock(b: BlockInfo): boolean {
  return (b.lines ?? [b.text]).every(isNoteLine);
}

/**
 * Number of blocks at the start of a chapter that are the author's front matter. It ends at the
 * first scene separator or chapter heading after a note ("Summary:", "Disclaimer", "A/N:") near
 * the top, when at most a short sign-off ("Enjoy!") comes between them; otherwise only the
 * labelled paragraphs at the very top count. Never the whole chapter (an author's-note-only
 * chapter is read as is). Errs towards reading a note rather than skipping story.
 */
export function frontMatterBlocks(blocks: BlockInfo[]): number {
  const WINDOW = 15;
  /** Unlabelled paragraphs allowed between the last note and the separator. */
  const MAX_TAIL = 2;
  const total = blocks.reduce((n, b) => n + b.words, 0);
  const maxWords = Math.max(400, total * 0.4);
  let notes = 0;
  let tail = 0; // unlabelled blocks since the last note
  let run = -1; // end of the run of labelled blocks at the very top
  let words = 0;
  for (let i = 0; i < Math.min(blocks.length, WINDOW); i++) {
    const b = blocks[i];
    if (i > 0 && notes && (b.scene || (b.text.length <= 100 && CHAPTER_HEADING.test(b.text)))) {
      return words <= maxWords && tail <= MAX_TAIL ? i : run < 0 ? i : run;
    }
    if (isNoteBlock(b)) {
      notes++;
      tail = 0;
    } else {
      // Before the first note only a title line may come: a sentence there means the story has begun.
      if (!notes && (b.text.length > 60 || /[.!?…"”’]$/.test(b.text)) && !CHAPTER_HEADING.test(b.text)) return 0;
      tail++;
      if (run < 0) run = i;
    }
    words += b.words;
    if (!notes && i >= 2) return 0; // no note near the top
  }
  if (run < 0) return notes && notes < blocks.length ? notes : 0;
  return run;
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

function dropUnsafe(parent: ParentNode) {
  parent.children = parent.children.filter((c) => !(isTag(c) && DROP_TAGS.has(c.name)));
  relink(parent);
  for (const c of parent.children) if (isTag(c)) dropUnsafe(c);
}

export function segmentChapter(html: string): SegmentedChapter {
  const doc = parseDocument(html ?? '', { decodeEntities: true, lowerCaseAttributeNames: true });
  const segments: Segment[] = [];
  let block = 0;
  /** A scene separator ("* * *", <hr>, …) was passed since the last spoken block. */
  let sceneBreak = false;
  const blockInfo: BlockInfo[] = [];

  const addBlock = (text: string): number | null => {
    const raw = clean(text);
    if (raw && !isSpeakable(raw) && !WORDLESS_REPLY.test(raw)) sceneBreak = true;
    const t = raw && isSpeakable(raw) ? speechText(raw) : '';
    if (!t) return null;
    const b = block++;
    const breakBefore: SegmentBreak = !segments.length ? 'none' : sceneBreak ? 'scene' : 'paragraph';
    sceneBreak = false;
    const lines = text.split('\n').map(clean).filter((l) => l && isSpeakable(l));
    blockInfo.push({ text: raw, scene: breakBefore === 'scene', words: countWordsIn(raw), lines: lines.length > 1 ? lines : undefined });
    splitText(t).forEach((part, i) => segments.push({ text: part, block: b, words: countWordsIn(part), breakBefore: i ? 'none' : breakBefore }));
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
      if (isTag(child) && DROP_TAGS.has(child.name)) continue;
      if (isBlock(child)) {
        flushRun(parent, run, out);
        run = [];
        if (child.name === 'hr') sceneBreak = true;
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

  dropUnsafe(doc);
  walk(doc);
  const notes = frontMatterBlocks(blockInfo);
  return {
    segments,
    frontMatter: notes ? segments.filter((x) => x.block < notes).length : 0,
    html: render(doc.children, { encodeEntities: 'utf8' }),
    words: segments.reduce((n, s) => n + s.words, 0),
    blocks: block,
  };
}
