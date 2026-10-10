// Tree helpers the importers share, on htmlparser2's DOM (domhandler nodes): XML lookups by local
// name (EPUB metadata arrives as `dc:title`, `opf:package`), text with line breaks, "Key: value"
// front-matter fields, and cutting a tree in two at a node, which is how a chapter that starts in
// the middle of a file (a #fragment in an EPUB's table of contents, a heading in an HTML page) is
// separated from the one before it without copying anything.

import { DomHandler, Element, isTag, isText, Text, type AnyNode, type Document, type ParentNode } from 'domhandler';
import { findAll, findOne, removeElement, textContent } from 'domutils';
import { parseDocument, Parser, type ParserOptions } from 'htmlparser2';

/** "dc:title" → "title". */
export const localName = (n: string) => n.slice(n.indexOf(':') + 1).toLowerCase();

const asArray = (root: AnyNode | AnyNode[]) => (Array.isArray(root) ? root : [root]);

/** Elements with this local name, in document order. */
export const els = (root: AnyNode | AnyNode[], name: string): Element[] => findAll((e) => localName(e.name) === name, asArray(root));

export const el = (root: AnyNode | AnyNode[], name: string): Element | null => findOne((e) => localName(e.name) === name, asArray(root), true);

/** An attribute by local name ("opf:scheme" answers to "scheme"). */
export function attrOf(e: Element | null | undefined, name: string): string | undefined {
  if (!e) return undefined;
  if (Object.prototype.hasOwnProperty.call(e.attribs, name)) return e.attribs[name];
  for (const k of Object.keys(e.attribs)) if (localName(k) === name) return e.attribs[k];
  return undefined;
}

export const hasClass = (e: Element, cls: string) => (e.attribs.class ?? '').split(/\s+/).includes(cls);

/** Visible text, whitespace collapsed. */
export const textOf = (n: AnyNode | AnyNode[] | null | undefined) => (n ? textContent(n).replace(/\s+/g, ' ').trim() : '');

export const parseXml = (s: string) => parseDocument(s, { xmlMode: true, decodeEntities: true });

const markupOptions = (xhtml: boolean): ParserOptions => ({ decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: xhtml });

/** `<svg:script>` must meet the sanitizer as the `script` it is. */
function dropPrefixes(doc: Document): Document {
  for (const e of findAll((x) => x.name.includes(':'), doc.children)) e.name = localName(e.name);
  return doc;
}

/**
 * HTML or XHTML, the way the sanitizer wants it (lower-case names). `<p/>` and `<a id="x"/>` are
 * closed where they stand, as XHTML means them; a namespace prefix is dropped from element names.
 */
export function parseMarkup(s: string, xhtml = false): Document {
  return dropPrefixes(parseDocument(s, markupOptions(xhtml)));
}

/** parseMarkup for a whole file: fed to the parser in slices, awaiting `pause` between them. */
export async function parseMarkupAsync(s: string, pause: () => Promise<void>, xhtml = false): Promise<Document> {
  const handler = new DomHandler(undefined, markupOptions(xhtml));
  const parser = new Parser(handler, markupOptions(xhtml));
  const SLICE = 256 * 1024;
  for (let i = 0; i < s.length; i += SLICE) {
    parser.write(s.slice(i, i + SLICE));
    await pause();
  }
  parser.end();
  return dropPrefixes(handler.root);
}

const BLOCKS = new Set([
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'dl',
  'dt',
  'dd',
  'tr',
  'table',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'header',
  'footer',
  'center',
  'pre',
  'hr',
]);

/** Text with a line break for every <br> and block, for reading "Key: value" lines. */
export function blockText(root: AnyNode | AnyNode[]): string {
  let out = '';
  const walk = (nodes: AnyNode[]) => {
    for (const n of nodes) {
      if (isText(n)) out += n.data.replace(/\s+/g, ' ');
      else if (isTag(n)) {
        if (n.name === 'br') out += '\n';
        else if (n.name === 'td' || n.name === 'th') {
          out += ' ';
          walk(n.children);
          out += ' ';
        } else if (BLOCKS.has(n.name)) {
          out += '\n';
          walk(n.children);
          out += '\n';
        } else if (n.name !== 'script' && n.name !== 'style') walk(n.children);
      }
    }
  };
  walk(asArray(root));
  return out
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const FIELD_KEYS =
  'Status|Published|Updated|Completed|Packaged|Words|Chapters|Rating|Category|Categories|Genre|Genres|Characters|Relationships|Pairings|Fandom|Fandoms|Series|Warnings|Language|Summary|Story URL|Source|Original source|Author URL|Author|By';
const FIELD_LINE = new RegExp(`^(${FIELD_KEYS})\\s*:\\s*(.*)$`, 'i');
/** AO3's Stats line puts several fields on one line. */
const INLINE_FIELD = /\b(Published|Updated|Completed|Words|Chapters):\s*(.+?)(?=\s+(?:Published|Updated|Completed|Words|Chapters|Comments|Kudos|Bookmarks|Hits):|$)/g;

/**
 * "Key: value" lines of front matter (FanFicFare's title page, FicHub's introduction, AO3's Stats,
 * a text file's header), keys as written ("Status", "Published"…); the first of each key wins.
 */
export function labeledFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: string) => {
    const key = k.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUrl\b/, 'URL');
    if (v.trim() && !(key in out)) out[key] = v.trim();
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const inline = [...line.matchAll(INLINE_FIELD)];
    if (inline.length > 1 && inline[0].index === 0) {
      for (const f of inline) add(f[1], f[2]);
      continue;
    }
    const m = line.match(FIELD_LINE);
    if (m) add(m[1], m[2]);
  }
  return out;
}

function shallowClone(e: Element): Element {
  return new Element(e.name, { ...e.attribs });
}

/** Makes `children` the node list of `parent`, fixing every link. */
function setChildren(parent: ParentNode, children: AnyNode[]) {
  children.forEach((c, i) => {
    c.parent = parent;
    c.prev = children[i - 1] ?? null;
    c.next = children[i + 1] ?? null;
  });
  parent.children = children;
}

/** Nodes that belong to no parent any more, linked to each other only. */
function detached(nodes: AnyNode[]): AnyNode[] {
  nodes.forEach((c, i) => {
    c.parent = null;
    c.prev = nodes[i - 1] ?? null;
    c.next = nodes[i + 1] ?? null;
  });
  return nodes;
}

/** Takes all of `parent`'s children out of it (detached, in order). */
export function takeAll(parent: ParentNode): AnyNode[] {
  const kids = parent.children;
  parent.children = [];
  return detached(kids);
}

/**
 * Cuts everything before `marker` (in document order) out of `root` and returns it (detached),
 * wrapped in copies of the elements it sat in: like a DOM Range from the start of `root` to
 * `marker`. What stays in `root` starts at `marker`, inside its original ancestors. Nodes are
 * moved, not copied. A marker outside `root` cuts nothing.
 */
export function splitBefore(root: ParentNode, marker: AnyNode): AnyNode[] {
  const chain: AnyNode[] = [];
  for (let n: AnyNode | null = marker; n && n !== root; n = n.parent) chain.push(n);
  if (chain[chain.length - 1]?.parent !== root) return [];
  let carried: AnyNode[] = [];
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const parent = node.parent as ParentNode;
    const at = parent.children.indexOf(node);
    const before = parent.children.slice(0, at);
    setChildren(parent, parent.children.slice(at));
    if (i > 0 && carried.length) {
      // The ancestor `node` was split: its first half is a copy holding what came before.
      const half = shallowClone(node as Element);
      setChildren(half, carried);
      carried = [...before, half];
    } else carried = before;
  }
  return detached(carried);
}

/** A new <div> holding detached nodes (from takeAll / splitBefore). */
export function boxOf(nodes: AnyNode[] = []): Element {
  const box = new Element('div', {});
  setChildren(box, nodes);
  return box;
}

/** Appends detached nodes to a box. */
export function append(box: ParentNode, nodes: AnyNode[]) {
  if (nodes.length) setChildren(box, box.children.concat(nodes));
}

/** Headings that name a chapter: "Chapter 3", "Chapter Three: Title", "Prologue", "Part II", "12.", "XIV". */
export const CHAPTER_HEADING =
  /^(?:(?:chapter|ch\.?|chap\.?|part|book|volume|vol\.?|act|episode|section)\s*[\dIVXLCivxlc]+\b|(?:chapter|part|book)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b|(?:prologue|epilogue|interlude|afterword|foreword|omake|side story|extra)\b|\d{1,4}\s*(?:[.:)\-–—]|$)|[IVXLC]{1,8}\s*(?:[.:)\-–—]|$))/i;

export function isChapterHeading(s: string): boolean {
  const t = s.trim();
  if (t.length > 120 || !CHAPTER_HEADING.test(t)) return false;
  // A sentence isn't a heading: "Extra credit was given.", "1. The first rule is never to …".
  if (/[.!?,;:]$/.test(t) && t.length > 30) return false;
  return !(/^(?:\d{1,4}|[IVXLC]{1,8})\s*[.:)\-–—]\s*\S/i.test(t) && t.length > 60);
}

/** Lower case, punctuation and spaces gone: "Chapter 1: The Start" ≈ "chapter 1 – the start". */
export function normTitle(s: string): string {
  return s.toLowerCase().replace(/[\s.,:;!?'"“”‘’()[\]{}<>\-–—&*/#_~]+/g, '');
}

const HEADING = /^h[1-6]$/;

const hasContent = (n: AnyNode): boolean =>
  isText(n) ? n.data.trim() !== '' : isTag(n) && (n.name === 'img' || n.name === 'hr' || n.children.some(hasContent));

/** The first text node with words in it, in document order. */
function firstText(nodes: AnyNode[]): Text | null {
  for (const n of nodes) {
    if (isText(n) && n.data.trim()) return n;
    if (isTag(n) && n.name !== 'script' && n.name !== 'style') {
      const t = firstText(n.children);
      if (t) return t;
    }
  }
  return null;
}

/**
 * Removes the chapter's title where the text repeats it at the very top (a heading, or a bare
 * line, as FicHub writes it twice): the reader shows the title itself. Any of `titles` matches.
 */
export function dropRepeatedTitle(box: Element, titles: string[]) {
  const wanted = new Set(titles.map(normTitle).filter(Boolean));
  if (!wanted.size) return;
  for (let round = 0; round < 3; round++) {
    const t = firstText(box.children);
    if (!t) return;
    let heading: AnyNode | null = null;
    for (let p: AnyNode | null = t.parent; p && p !== box; p = p.parent) if (isTag(p) && HEADING.test(p.name)) heading = p;
    if (heading && wanted.has(normTitle(textOf(heading)))) removeElement(heading);
    else if (wanted.has(normTitle(t.data))) {
      // A bare line: remove it, and the elements it leaves empty.
      let n: AnyNode = t;
      while (n.parent && n.parent !== box && !(n.parent as ParentNode).children.some((c) => c !== n && hasContent(c))) n = n.parent;
      removeElement(n);
    } else return;
  }
}

/** Removes <div>s (and similar wrappers) left with nothing in them. */
export function pruneEmptyWrappers(root: ParentNode) {
  for (const e of findAll((x) => /^(div|section|span|header|footer|center|article)$/.test(x.name), root.children).reverse()) {
    if (!hasContent(e) && !findOne((x) => x.name === 'br', e.children, true)) removeElement(e);
  }
}

export { hasContent };
