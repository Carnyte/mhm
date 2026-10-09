// /media (the media with their most-used fandoms), /media/NAME/fandoms (every fandom of a medium,
// A–Z, with work counts: one very large page, cached for a week), and /autocomplete/fandom.

import { parseCount, parseHtml, text } from '../../../html/dom';
import { tagFromHref } from './common';

export interface Ao3Fandom {
  /** The tag name (what /tags/NAME/works takes). */
  name: string;
  count: number;
}

export interface Ao3Medium {
  name: string;
  top: Ao3Fandom[];
}

/** "(371675)" after a tag link. */
function countAfter(liText: string): number {
  const m = liText.match(/\(([\d,]+)\)\s*$/);
  return m ? parseCount(m[1]) : 0;
}

export function parseMedia(html: string): Ao3Medium[] {
  const root = parseHtml(html);
  return root.querySelectorAll('ul.media li.medium').map((li) => ({
    name: text(li.querySelector('h3.heading a')) || text(li.querySelector('h3.heading')),
    top: li
      .querySelectorAll('ol.index li')
      .map((x) => {
        const a = x.querySelector('a.tag');
        const name = tagFromHref(a?.getAttribute('href')) ?? text(a);
        return { name, count: countAfter(text(x)) };
      })
      .filter((f) => f.name),
  }));
}

export function parseMediumFandoms(html: string): Ao3Fandom[] {
  const root = parseHtml(html);
  const out: Ao3Fandom[] = [];
  for (const li of root.querySelectorAll('ol.fandom.index li.letter ul.tags li')) {
    const a = li.querySelector('a.tag');
    if (!a) continue;
    const name = tagFromHref(a.getAttribute('href')) ?? text(a);
    if (name) out.push({ name, count: countAfter(text(li)) });
  }
  return out;
}

/** /autocomplete/fandom?term=… → tag names. */
export function parseAutocomplete(json: string): string[] {
  try {
    const rows = JSON.parse(json) as { id?: unknown; name?: unknown }[];
    return Array.isArray(rows) ? rows.map((r) => String(r.name ?? r.id ?? '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}
