// Shared HTML helpers. Parsing uses htmlparser2 (the forgiving parser behind cheerio, pure JS,
// works in Hermes and Node) because FFN's markup is full of unclosed tags. `El` is a small
// wrapper exposing the DOM-ish subset the parsers need.

import { selectAll, selectOne } from 'css-select';
import { render } from 'dom-serializer';
import { cloneNode, Element, isTag, isText, type AnyNode, type ParentNode } from 'domhandler';
import { removeElement, textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';
import type { Breadcrumb, PageInfo, SelectField, SelectOption, UserRef } from '../types';

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

export function xutime(el: El | null | undefined): number | undefined {
  const v = attr(el, 'data-xutime');
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function idFromPath(path: string | undefined, re: RegExp): number | undefined {
  if (!path) return undefined;
  const m = path.match(re);
  return m ? Number(m[1]) : undefined;
}

export function userFromLink(a: El | null | undefined): UserRef | undefined {
  const href = attr(a, 'href');
  const id = idFromPath(href, /\/u\/(\d+)/) ?? idFromPath(href, /\/beta\/(\d+)/);
  if (!a || !id) return undefined;
  return { id, name: text(a) };
}

/** Cover/avatar URL from an <img>, preferring lazy-load `data-original`, skipping the placeholder. */
export function imageUrl(img: El | null | undefined): string | undefined {
  if (!img) return undefined;
  const src = attr(img, 'data-original') || attr(img, 'src');
  if (!src || /\/static\/images\/d_60_90/.test(src)) return undefined;
  return src;
}

/** Larger version of a cover thumbnail (/image/123/75/ → /image/123/180/). */
export function largeCover(url: string | undefined): string | undefined {
  return url?.replace(/\/image\/(\d+)\/75\/?$/, '/image/$1/180/');
}

/**
 * Pagination block: "638K | Page <b>1</b> <a>2</a> … <a>Last</a> <a>Next »</a>".
 * Works for p=, ppage= and path-style (/0/3/2/) pagination.
 */
export function parsePagination(root: El, pageRegex: RegExp): PageInfo {
  let page = 1;
  let lastPage = 1;
  let totalLabel: string | undefined;
  let nextPath: string | undefined;
  const anchors = root.querySelectorAll('a');
  const pageOf = (href: string | undefined) => {
    const m = href?.match(pageRegex);
    return m ? Number(m[1]) : undefined;
  };
  for (const a of anchors) {
    const label = text(a);
    const href = attr(a, 'href');
    if (/^Next\b/.test(label) && href) {
      nextPath = href;
      const n = pageOf(href);
      if (n) page = n - 1;
    }
    if (label === 'Last') {
      const n = pageOf(href);
      if (n) lastPage = n;
    }
    if (/^\d+$/.test(label)) {
      const n = pageOf(href);
      if (n && n > lastPage) lastPage = n;
    }
  }
  // Current page is the <b> number in the pager block.
  const pager = anchors.find((a) => /^Next\b|^Last$|^\d+$/.test(text(a)) && pageOf(attr(a, 'href')))
    ?.parentNode as El | undefined;
  if (pager) {
    const b = pager.querySelector('b');
    if (b && /^\d+$/.test(text(b))) page = Number(text(b));
    const t = ownText(pager).match(/^([\d.,]+[KM]?)\s*(?:found:?)?\s*\|?\s*Page/i);
    if (t) totalLabel = t[1];
  }
  if (lastPage < page) lastPage = page;
  return { page, lastPage, totalLabel, nextPath };
}

export function parseSelect(sel: El): SelectField {
  // Some facet selects have no name and set a JS variable instead (onChange="ff_beta_genreid = …").
  const onChange = attr(sel, 'onChange') ?? attr(sel, 'onchange') ?? '';
  const jsName = onChange.match(/ff_(\w+?)\s*=\s*this\.options/)?.[1]?.replace(/^beta_/, '');
  const name = attr(sel, 'name') ?? jsName ?? '';
  const options: SelectOption[] = [];
  let value: string | undefined;
  for (const o of sel.querySelectorAll('option')) {
    const v = attr(o, 'value') ?? '';
    // Options are often unclosed (<option value=1>Foo<option ...>), so take own text only.
    const raw = ownText(o) || text(o);
    const cm = raw.match(/^(.*?)\s*\(([\d,]+)\)\s*$/);
    const opt: SelectOption = {
      value: v,
      label: (cm ? cm[1] : raw).trim(),
      count: cm ? parseCount(cm[2]) : undefined,
      selected: o.hasAttribute('selected'),
    };
    if (opt.selected) value = v;
    options.push(opt);
  }
  return { name, options, value, target: jsName ?? name };
}

export function parseSelects(root: El): Record<string, SelectField> {
  const out: Record<string, SelectField> = {};
  for (const sel of root.querySelectorAll('select')) {
    const f = parseSelect(sel);
    if (f.name) out[f.name] = f;
  }
  return out;
}

export function parseBreadcrumbs(container: El | null): Breadcrumb[] {
  if (!container) return [];
  return container
    .querySelectorAll('a')
    .map((a) => ({ label: text(a), path: attr(a, 'href') ?? '' }))
    .filter((b) => b.path && b.label && b.path !== '/');
}

/** True when the HTML is FFN's generic error / not found page. */
export function siteError(html: string): string | null {
  const m = html.match(/<span class=['"]?gui_warning['"]?>([\s\S]*?)<\/span>/i);
  if (m) return decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (/Story Not Found/i.test(html) && !/id=['"]?storytext/i.test(html)) return 'Story not found.';
  if (/FanFiction\.Net Error Type/i.test(html)) return 'FanFiction.net returned an error for this page.';
  if (/You must be logged in to access this page/i.test(html)) return 'LOGIN_REQUIRED';
  return null;
}

/** Strips scripts, inline handlers and site chrome from user HTML (chapters, bios, reviews). */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed|form|input|button|select|textarea)[\s\S]*?>/gi, '')
    .replace(/<\/(iframe|object|embed|form|button|select|textarea)>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}
