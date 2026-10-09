// FanFiction.net HTML helpers. The generic ones (El, parseHtml, text, attr, parseCount…) live in
// src/html/dom.ts and are re-exported here, so the FFN parsers keep importing './dom'.

import type { Breadcrumb, PageInfo, SelectField, SelectOption, UserRef } from '../types';
import { attr, decodeEntities, ownText, parseCount, text, type El } from '../../html/dom';

export { attr, decodeEntities, El, normalizeSelects, ownText, parseCount, parseHtml, text } from '../../html/dom';

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
