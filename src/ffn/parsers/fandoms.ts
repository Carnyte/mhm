// Fandom directories: /anime/, /crossovers/anime/, /crossovers/Naruto/1402/, /communities/anime/ …

import type { FandomEntry } from '../types';
import { attr, decodeEntities, parseCount, parseHtml, text } from './dom';

export interface FandomDirectory {
  title?: string;
  fandoms: FandomEntry[];
  /** "/Naruto-Crossovers/1402/0/" on a crossover partner page. */
  allCrossoversPath?: string;
}

export function parseFandomDirectory(html: string): FandomDirectory {
  const root = parseHtml(html);
  const fandoms: FandomEntry[] = [];
  const seen = new Set<string>();
  const push = (name: string, path: string, countLabel: string) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    fandoms.push({ name, path, countLabel, count: parseCount(countLabel) });
  };

  const list = root.querySelector('#list_output');
  if (list) {
    for (const div of list.querySelectorAll('div')) {
      const a = div.querySelector('a');
      if (!a) continue;
      const gray = div.querySelector('.gray') ?? div.querySelector('span');
      push(attr(a, 'title') ?? text(a), attr(a, 'href') ?? '', text(gray).replace(/[()]/g, ''));
    }
  }

  // Crossover category pages render the list in JS from setxcat(xsc_i,"Name",count,"/link/") calls.
  if (!fandoms.length) {
    const re = /setxcat\(\s*xsc_i\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      push(decodeEntities(m[1].replace(/\\(.)/g, '$1')), m[3], m[2]);
    }
  }

  // Community/forum/beta directories use plain tables of links with gray counts.
  if (!fandoms.length) {
    const content = root.querySelector('#content_wrapper_inner') ?? root;
    for (const td of content.querySelectorAll('td, div')) {
      const a = td.querySelector('a');
      const gray = td.querySelector('.gray');
      if (!a || !gray || td.querySelectorAll('a').length !== 1) continue;
      const href = attr(a, 'href') ?? '';
      if (!/^\/(communities|forums|betareaders)\//.test(href)) continue;
      push(text(a), href, text(gray).replace(/[()]/g, ''));
    }
  }

  const allA = root.querySelectorAll('a').find((a) => /^\/[^/]+-Crossovers\/\d+\/0\/?$/.test(attr(a, 'href') ?? ''));
  const title = text(root.querySelector('title')).replace(/\s*\|\s*FanFiction\s*$/i, '') || undefined;
  return { fandoms, allCrossoversPath: attr(allA, 'href'), title };
}
