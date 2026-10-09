// AO3 (Archive of Our Own) URLs: building them, and recognising pasted links. Link parsing only
// for now, so a pasted AO3 link can say "coming soon" instead of opening the browser.
//
// Mirrors: ao3.org and archiveofourown.com / .net redirect to archiveofourown.org, and
// archive.transformativeworks.org is the OTW's own alias. Links on any of them name the same work.

import type { LinkHit } from '../types';

export const AO3_ORIGIN = 'https://archiveofourown.org';

const HOST = String.raw`(?:www\.)?(?:archiveofourown\.(?:org|com|net)|ao3\.org|archive\.transformativeworks\.org)`;
const AO3_URL = new RegExp(String.raw`^(?:https?:\/\/)?${HOST}(?::\d+)?(?=[/?#]|$)([^?#]*)(\?[^#]*)?`, 'i');

// Tag names are escaped before percent-encoding (otwarchive Tag#to_param): "/" "&" "." "?" "#".
const TAG_ESCAPES: [string, string][] = [
  ['/', '*s*'],
  ['&', '*a*'],
  ['.', '*d*'],
  ['?', '*q*'],
  ['#', '*h*'],
];

/** A tag name as AO3 writes it in URLs: "Harry Potter - J. K. Rowling" → "Harry%20Potter%20-%20J*d*%20K*d*%20Rowling". */
export function escapeTag(name: string): string {
  let s = name;
  for (const [ch, esc] of TAG_ESCAPES) s = s.split(ch).join(esc);
  return encodeURIComponent(s).replace(/%2A/gi, '*');
}

/** The tag name in a URL path segment (the reverse of escapeTag). */
export function unescapeTag(segment: string): string {
  let s = segment;
  try {
    s = decodeURIComponent(segment); // "+" is a literal plus in a path
  } catch {
    // keep the raw text
  }
  for (const [ch, esc] of TAG_ESCAPES) s = s.split(esc).join(ch);
  return s;
}

export function workPath(id: string, chapterId?: string): string {
  return chapterId ? `/works/${id}/chapters/${chapterId}` : `/works/${id}`;
}

export function workUrl(id: string, chapterId?: string): string {
  return AO3_ORIGIN + workPath(id, chapterId);
}

export function tagWorksPath(tag: string): string {
  return `/tags/${escapeTag(tag)}/works`;
}

export function seriesPath(id: string): string {
  return `/series/${id}`;
}

/** An AO3 author id: 'user/pseud' (a user's default pseud is their user name). */
export function authorId(user: string, pseud?: string): string {
  return `${user}/${pseud || user}`;
}

export type Ao3Link =
  | { kind: 'work'; id: string; chapterId?: string }
  /** /chapters/<id> redirects to its work; the work id isn't in the link. */
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'series'; id: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'user'; user: string; pseud?: string }
  | { kind: 'collection'; name: string }
  /** Any other page on AO3 (search, the home page, news…). */
  | { kind: 'other'; path: string };

const seg = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** What an AO3 link points to, or null when it isn't an AO3 link. Works with or without "https://". */
export function parseAo3Url(input: string): Ao3Link | null {
  const m = input.trim().match(AO3_URL);
  if (!m) return null;
  const path = m[1] || '/';
  const parts = path.split('/').filter(Boolean);
  const [a, b, c, d] = parts;
  if (a === 'works' && b && /^\d+$/.test(b)) {
    if (c === 'chapters' && d && /^\d+$/.test(d)) return { kind: 'work', id: b, chapterId: d };
    return { kind: 'work', id: b };
  }
  if (a === 'chapters' && b && /^\d+$/.test(b)) return { kind: 'chapter', chapterId: b };
  // Works also live under a collection or a creator: /collections/X/works/1, /users/U/pseuds/P/works/1.
  const w = parts.findIndex((p, i) => i > 0 && p === 'works' && /^\d+$/.test(parts[i + 1] ?? ''));
  if (w > 0 && (a === 'collections' || a === 'users')) {
    const id = parts[w + 1];
    const ch = parts[w + 2] === 'chapters' && /^\d+$/.test(parts[w + 3] ?? '') ? parts[w + 3] : undefined;
    return ch ? { kind: 'work', id, chapterId: ch } : { kind: 'work', id };
  }
  if (a === 'series' && b && /^\d+$/.test(b)) return { kind: 'series', id: b };
  if (a === 'tags' && b) return { kind: 'tag', tag: unescapeTag(b) };
  if (a === 'users' && b) {
    if (c === 'pseuds' && d) return { kind: 'user', user: seg(b), pseud: seg(d) };
    return { kind: 'user', user: seg(b) };
  }
  if (a === 'collections' && b) return { kind: 'collection', name: seg(b) };
  return { kind: 'other', path: path + (m[2] ?? '') };
}

/** An AO3 link as a LinkHit (the routes are the AO3 screens that arrive with AO3 reading). */
export function parseAo3Link(input: string): LinkHit | null {
  const l = parseAo3Url(input);
  if (!l) return null;
  const source = 'ao3' as const;
  switch (l.kind) {
    case 'work':
      return { source, kind: 'story', id: l.id, ...(l.chapterId ? { chapterRemoteId: l.chapterId } : {}), url: workUrl(l.id, l.chapterId) };
    case 'chapter':
      return { source, kind: 'part', partId: l.chapterId, url: `${AO3_ORIGIN}/chapters/${l.chapterId}` };
    case 'series':
      return { source, kind: 'route', href: { pathname: '/ao3/series/[id]', params: { id: l.id } }, url: AO3_ORIGIN + seriesPath(l.id) };
    case 'tag':
      return { source, kind: 'route', href: { pathname: '/ao3/works', params: { tag: l.tag } }, url: AO3_ORIGIN + tagWorksPath(l.tag) };
    case 'user':
      return { source, kind: 'author', id: authorId(l.user, l.pseud), url: `${AO3_ORIGIN}/users/${encodeURIComponent(l.user)}` };
    case 'collection':
      return { source, kind: 'web', url: `${AO3_ORIGIN}/collections/${encodeURIComponent(l.name)}` };
    default:
      return { source, kind: 'web', url: AO3_ORIGIN + l.path };
  }
}
