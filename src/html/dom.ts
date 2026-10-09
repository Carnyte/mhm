// Shared HTML helpers for every site's parsers. Parsing uses htmlparser2 (the forgiving parser
// behind cheerio, pure JS, works in Hermes and Node) because real-world markup is full of unclosed
// tags. `El` is a small wrapper exposing the DOM-ish subset the parsers need.
//
// Untrusted HTML that will be shown (chapter text from AO3 / Wattpad, imported files) goes through
// sanitize.ts.

import { selectAll, selectOne } from 'css-select';
import { render } from 'dom-serializer';
import { cloneNode, Element, isTag, isText, type AnyNode, type ParentNode } from 'domhandler';
import { removeElement, textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';

export class El {
  constructor(public node: AnyNode) {}

  get nodeType(): number {
    return isText(this.node) ? 3 : isTag(this.node) ? 1 : 9;
  }

  get tagName(): string {
    return isTag(this.node) ? this.node.name.toUpperCase() : '';
  }

  get id(): string {
    return this.getAttribute('id') ?? '';
  }

  get rawText(): string {
    return textContent(this.node);
  }

  get innerHTML(): string {
    const n = this.node as ParentNode;
    return n.children ? render(n.children, { encodeEntities: 'utf8' }) : '';
  }

  get outerHTML(): string {
    return render(this.node, { encodeEntities: 'utf8' });
  }

  get childNodes(): El[] {
    const n = this.node as ParentNode;
    return (n.children ?? []).map((c) => new El(c));
  }

  get parentNode(): El | null {
    return this.node.parent ? new El(this.node.parent) : null;
  }

  getAttribute(name: string): string | undefined {
    return isTag(this.node) ? this.node.attribs[name.toLowerCase()] : undefined;
  }

  hasAttribute(name: string): boolean {
    return isTag(this.node) && name.toLowerCase() in this.node.attribs;
  }

  querySelector(sel: string): El | null {
    const found = selectOne(sel, this.node as ParentNode);
    return found ? new El(found) : null;
  }

  querySelectorAll(sel: string): El[] {
    return selectAll(sel, this.node as ParentNode).map((n) => new El(n));
  }

  remove(): void {
    removeElement(this.node);
  }

  /** Deep copy that can be mutated without touching the original tree. */
  clone(): El {
    const c = cloneNode(this.node, true);
    if (c instanceof Element) c.parent = null;
    return new El(c);
  }
}

const SELECT_RE = /<select\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/select\s*>/gi;

/** FFN writes `<SELECT>` with unclosed `<option>`s; close them explicitly before parsing. */
export function normalizeSelects(html: string): string {
  return html.replace(SELECT_RE, (_m, attrs: string, inner: string) => {
    const parts = inner.replace(/<\/option\s*>/gi, '').split(/(?=<option\b)/i);
    return `<select${attrs}>${parts.map((o) => (/^<option\b/i.test(o) ? o + '</option>' : o)).join('')}</select>`;
  });
}

export function parseHtml(html: string): El {
  return new El(parseDocument(normalizeSelects(html), { decodeEntities: true, lowerCaseAttributeNames: true }));
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  raquo: '»',
  laquo: '«',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
};

/** Decodes entities in raw HTML strings (the parsed tree is already decoded). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Visible text of an element, whitespace collapsed. */
export function text(el: El | null | undefined): string {
  if (!el) return '';
  return el.rawText.replace(/\s+/g, ' ').trim();
}

/** Text directly inside `el`, excluding child elements. */
export function ownText(el: El): string {
  return el.childNodes
    .filter((n) => n.nodeType === 3)
    .map((n) => n.rawText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function attr(el: El | null | undefined, name: string): string | undefined {
  if (!el) return undefined;
  return el.getAttribute(name);
}

/** "37,695" → 37695, "444K" → 444000, "85.3K" → 85300, "1.2M" → 1200000. */
export function parseCount(s: string | undefined): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[2]) n *= m[2].toLowerCase() === 'k' ? 1000 : 1_000_000;
  return Math.round(n);
}
