// Wattpad URLs: recognising pasted links. Link parsing only for now, so a pasted Wattpad link can
// say "coming soon" instead of opening the browser.
//
//   story  https://www.wattpad.com/story/404053457-some-title      (the story id)
//   part   https://www.wattpad.com/1589023894-chapter-title(/page/2) (a part id: which story it
//          belongs to takes a lookup, so it comes back as a 'part' hit)
//   user   https://www.wattpad.com/user/username
//   list   https://www.wattpad.com/list/123 or /reading-list/123

import type { LinkHit } from '../types';

export const WP_ORIGIN = 'https://www.wattpad.com';

const WP_URL = /^(?:https?:\/\/)?(?:(?:www|m|mobile)\.)?wattpad\.com(?::\d+)?(?=[/?#]|$)([^?#]*)/i;

export type WattpadLink =
  | { kind: 'story'; id: string }
  | { kind: 'part'; partId: string; page?: number }
  | { kind: 'user'; username: string }
  | { kind: 'list'; id: string }
  | { kind: 'other'; path: string };

export function storyUrl(id: string): string {
  return `${WP_ORIGIN}/story/${id}`;
}

export function partUrl(partId: string): string {
  return `${WP_ORIGIN}/${partId}`;
}

/** What a Wattpad link points to, or null when it isn't a Wattpad link. Works without "https://". */
export function parseWattpadUrl(input: string): WattpadLink | null {
  const m = input.trim().match(WP_URL);
  if (!m) return null;
  const path = m[1] || '/';
  let x = path.match(/^\/story\/(\d+)(?:[-/]|$)/);
  if (x) return { kind: 'story', id: x[1] };
  x = path.match(/^\/(\d+)(?:-[^/]*)?(?:\/page\/(\d+))?\/?$/);
  if (x) return { kind: 'part', partId: x[1], ...(x[2] ? { page: Number(x[2]) } : {}) };
  x = path.match(/^\/user\/([^/]+)/);
  if (x) {
    let username = x[1];
    try {
      username = decodeURIComponent(username);
    } catch {
      // keep the raw text
    }
    return { kind: 'user', username };
  }
  x = path.match(/^\/(?:reading-)?list\/(\d+)/);
  if (x) return { kind: 'list', id: x[1] };
  return { kind: 'other', path };
}

/** A Wattpad link as a LinkHit. */
export function parseWattpadLink(input: string): LinkHit | null {
  const l = parseWattpadUrl(input);
  if (!l) return null;
  const source = 'wp' as const;
  switch (l.kind) {
    case 'story':
      return { source, kind: 'story', id: l.id, url: storyUrl(l.id) };
    case 'part':
      return { source, kind: 'part', partId: l.partId, url: partUrl(l.partId) };
    case 'user':
      return { source, kind: 'author', id: l.username, url: `${WP_ORIGIN}/user/${encodeURIComponent(l.username)}` };
    case 'list':
      return { source, kind: 'web', url: `${WP_ORIGIN}/list/${l.id}` };
    default:
      return { source, kind: 'web', url: WP_ORIGIN + l.path };
  }
}
