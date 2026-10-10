// An allowlist sanitizer for HTML from outside the app (AO3 and Wattpad chapter text, imported
// files), built on the same htmlparser2 / dom-serializer stack as the parsers. It works on the
// parsed tree, not on text, so tricks that fool regexes (split tags, entities, odd whitespace in
// "javascript:") don't get through.
//
// Kept: text formatting, paragraphs, headings, lists, tables, quotes, images and links with safe
// URLs, and a few presentational attributes (align, a small set of inline styles).
// Dropped with their content: scripts, styles, frames, objects, SVG, MathML, form controls, media,
// <base>, <meta>, <link>. Unknown tags (and <form>, <body>…) are unwrapped: their text stays.
// Event handlers, javascript:/vbscript:/data: URLs (except data: images), and ids / classes that
// would collide with the reader page's own are removed.
//
// Imported books (src/import) also pass a hook that points each <img> at the book's own image
// (`ficshelf-img:<n>`), drop relative links (they lead nowhere inside the app) and drop classes.
//
// FanFiction.net's parsers keep their own sanitizer (src/ffn/parsers/dom.ts sanitizeHtml).

import { render } from 'dom-serializer';
import { isTag, isText, type AnyNode, type Element, type ParentNode } from 'domhandler';
import { parseDocument } from 'htmlparser2';

export interface SanitizeOptions {
  /** Extra attributes to keep on every element, e.g. ['data-p-id'] (Wattpad paragraph ids). */
  keepAttrs?: string[];
  /** Inline styles: 'safe' keeps alignment / emphasis / indents (default); 'none' drops them all. */
  styles?: 'safe' | 'none';
  /**
   * Called with each <img>'s src before it's checked: the src to use instead, or null to drop the
   * image. A result of the form `ficshelf-img:<n>` (an imported book's own image) is kept as is.
   */
  image?: (src: string) => string | null;
  /** 'drop' removes relative URLs from href / src / cite ('#fragment' links stay). Default 'keep'. */
  relativeUrls?: 'keep' | 'drop';
  /** 'none' removes every class attribute. Default 'keep' (minus the reader's own classes). */
  classes?: 'keep' | 'none';
}

/** An imported book's own image, by its index in the book (see src/import). */
export const IMAGE_REF = /^ficshelf-img:\d{1,6}$/;

/** Elements removed together with everything inside them. */
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'param',
  'svg',
  'math',
  'noscript',
  'template',
  'base',
  'link',
  'meta',
  'title',
  'head',
  'input',
  'button',
  'select',
  'option',
  'optgroup',
  'textarea',
  'datalist',
  'output',
  'progress',
  'meter',
  'keygen',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'picture',
  'map',
  'area',
  'portal',
  'dialog',
  'xmp',
  'plaintext',
  'listing',
  'slot',
]);

const ALIGN = ['align'];
const CELL = ['align', 'valign', 'colspan', 'rowspan', 'width', 'scope'];

/** Elements kept, with the attributes each may have (besides the global ones). */
const ALLOWED: Record<string, string[]> = {
  a: ['href', 'name'],
  abbr: [],
  acronym: [],
  address: [],
  article: [],
  aside: [],
  b: [],
  bdi: [],
  bdo: [],
  big: [],
  blockquote: ['cite'],
  br: [],
  caption: ALIGN,
  center: [],
  cite: [],
  code: [],
  col: ['span', 'width', 'align'],
  colgroup: ['span', 'width', 'align'],
  dd: [],
  del: ['cite', 'datetime'],
  details: ['open'],
  dfn: [],
  div: ALIGN,
  dl: [],
  dt: [],
  em: [],
  figcaption: [],
  figure: [],
  font: ['color', 'size'],
  footer: [],
  h1: ALIGN,
  h2: ALIGN,
  h3: ALIGN,
  h4: ALIGN,
  h5: ALIGN,
  h6: ALIGN,
  header: [],
  hr: ['align', 'width', 'size', 'noshade'],
  i: [],
  img: ['src', 'alt', 'width', 'height', 'align'],
  ins: ['cite', 'datetime'],
  kbd: [],
  li: ['value', 'type'],
  mark: [],
  ol: ['start', 'type', 'reversed'],
  p: ALIGN,
  pre: [],
  q: ['cite'],
  rp: [],
  rt: [],
  ruby: [],
  s: [],
  samp: [],
  section: [],
  small: [],
  span: [],
  strike: [],
  strong: [],
  sub: [],
  summary: [],
  sup: [],
  table: ['align', 'border', 'cellpadding', 'cellspacing', 'width', 'summary'],
  tbody: ['align', 'valign'],
  td: CELL,
  tfoot: ['align', 'valign'],
  th: CELL,
  thead: ['align', 'valign'],
  time: ['datetime'],
  tr: ['align', 'valign'],
  tt: [],
  u: [],
  ul: ['type'],
  var: [],
  wbr: [],
};

const GLOBAL_ATTRS = ['title', 'lang', 'dir', 'id', 'class', 'style'];

/** Ids and classes the reader page uses itself (src/reader/template.ts, src/audio/segments.ts). */
const RESERVED_IDS = new Set(['wrap', 'text', 'end', 'next', 'mark', 'review']);
const RESERVED_CLASSES = new Set(['hd', 'story', 'end', 'alt', 'tts', 'find', 'cur', 'paged', 'fs-notes']);

const STYLE_PROPS = new Set([
  'text-align',
  'font-style',
  'font-weight',
  'font-variant',
  'text-decoration',
  'text-decoration-line',
  'text-indent',
  'text-transform',
  'white-space',
  'vertical-align',
  'margin-left',
  'margin-right',
  'padding-left',
  'direction',
]);

/** Deeper elements are unwrapped (hostile nesting would otherwise exhaust the stack). */
const MAX_DEPTH = 120;

const LINK_SCHEMES = new Set(['http', 'https', 'mailto']);
const CITE_SCHEMES = new Set(['http', 'https']);
const DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=\s]*$/i;

/**
 * A URL attribute's value, or undefined when it isn't safe: only the given schemes, relative
 * URLs and #fragments. Control characters and whitespace (which browsers ignore inside a scheme,
 * as in "java\tscript:") are removed before the check: `visible` is the URL's first 64 characters
 * that count.
 */
const visible = (s: string) => {
  // Only the start matters (the scheme), so a long URL (a data: image) isn't walked to its end.
  let out = '';
  for (let i = 0; i < s.length && out.length < 64; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x20 && (c < 0x7f || c > 0x9f)) out += s[i];
  }
  return out;
};

/** The attributes a tag may keep, or undefined when the tag isn't allowed (own keys only: no "constructor"). */
function allowedAttrs(name: string): string[] | undefined {
  return Object.prototype.hasOwnProperty.call(ALLOWED, name) ? ALLOWED[name] : undefined;
}

function safeUrl(value: string, schemes: Set<string>, images = false, relative: 'keep' | 'drop' = 'keep'): string | undefined {
  // Check exactly what is returned: strip from both ends what browsers ignore (C0 controls,
  // space) and what trim() removes (Unicode spaces such as U+00A0, U+FEFF, U+2028, U+3000).
  const url = value.replace(/^[\s\x00-\x20]+|[\s\x00-\x20]+$/g, '');
  const v = visible(url);
  if (!v) return undefined;
  if (images && DATA_IMAGE.test(url)) return url;
  const m = v.match(/^([a-z][a-z0-9+.-]*):/i);
  if (m && !schemes.has(m[1].toLowerCase())) return undefined;
  if (!m && relative === 'drop' && !v.startsWith('#')) return undefined;
  return url;
}

function safeStyle(style: string): string | undefined {
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (!STYLE_PROPS.has(prop) || !value || value.length > 64) continue;
    if (!/^[-\w\s.,%]+$/.test(value) || /expression|javascript|url/i.test(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.length ? out.join('; ') : undefined;
}

function cleanAttrs(name: string, attribs: Record<string, string>, o: SanitizeOptions): Record<string, string> {
  const allowed = allowedAttrs(name) ?? [];
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(attribs)) {
    const key = rawKey.toLowerCase();
    if (key.startsWith('on')) continue;
    if (!GLOBAL_ATTRS.includes(key) && !allowed.includes(key) && !o.keepAttrs?.includes(key)) continue;
    let v: string | undefined = value;
    switch (key) {
      case 'href':
        v = safeUrl(value, LINK_SCHEMES, false, o.relativeUrls);
        break;
      case 'src':
        v = IMAGE_REF.test(value) && o.image ? value : safeUrl(value, CITE_SCHEMES, true, o.relativeUrls);
        break;
      case 'cite':
        v = safeUrl(value, CITE_SCHEMES, false, o.relativeUrls);
        break;
      case 'style':
        v = o.styles === 'none' ? undefined : safeStyle(value);
        break;
      case 'id':
        v = /^[A-Za-z][\w:.-]*$/.test(value) && !RESERVED_IDS.has(value) ? value : undefined;
        break;
      case 'class':
        v =
          o.classes === 'none'
            ? undefined
            : value
                .split(/\s+/)
                .filter((c) => /^[\w-]+$/.test(c) && !RESERVED_CLASSES.has(c))
                .join(' ') || undefined;
        break;
    }
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Makes untrusted HTML safe to put in the reader page. */
export function sanitizeHtml(html: string, opts: SanitizeOptions = {}): string {
  const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  return render(sanitizeChildren(doc, opts), { encodeEntities: 'utf8' }).trim();
}

/**
 * sanitizeHtml for a tree that is already parsed (imported books parse each file once): cleans
 * `root`'s children in place and returns them. `root` itself is left as it is. Tag and attribute
 * names must be lower case, as htmlparser2 gives them in HTML mode.
 */
export function sanitizeChildren(root: ParentNode, opts: SanitizeOptions = {}): AnyNode[] {
  // Pre-order list of the elements to clean (without descending into dropped ones), then clean
  // them children-first: each element is replaced by itself, its children (unwrapped) or nothing.
  const order: { el: Element; depth: number }[] = [];
  const stack: { node: AnyNode; depth: number }[] = root.children.map((node) => ({ node, depth: 1 }));
  stack.reverse();
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!isTag(node) || DROP.has(node.name)) continue;
    order.push({ el: node, depth });
    for (let i = node.children.length - 1; i >= 0; i--) stack.push({ node: node.children[i], depth: depth + 1 });
  }
  const replacement = new Map<AnyNode, AnyNode[]>();
  const keptChildren = (parent: ParentNode): AnyNode[] => {
    const out: AnyNode[] = [];
    for (const child of parent.children) {
      if (isText(child)) out.push(child);
      else if (isTag(child)) for (const r of replacement.get(child) ?? []) out.push(r); // no spread: a <body> can have 100k children
      // Comments, doctypes, CDATA and processing instructions are dropped.
    }
    return out;
  };
  const adopt = (parent: ParentNode, children: AnyNode[]) => {
    children.forEach((c, i) => {
      c.parent = parent;
      c.prev = children[i - 1] ?? null;
      c.next = children[i + 1] ?? null;
    });
    parent.children = children;
  };
  for (let i = order.length - 1; i >= 0; i--) {
    const { el, depth } = order[i];
    const children = keptChildren(el);
    if (el.name === 'img' && opts.image) {
      const src = opts.image(el.attribs.src ?? '');
      if (src === null) {
        replacement.set(el, []);
        continue;
      }
      el.attribs.src = src;
    }
    if (allowedAttrs(el.name) && depth <= MAX_DEPTH) {
      adopt(el, children);
      el.attribs = cleanAttrs(el.name, el.attribs, opts);
      replacement.set(el, [el]);
    } else replacement.set(el, children);
  }
  const top = keptChildren(root);
  adopt(root, top);
  return top;
}
