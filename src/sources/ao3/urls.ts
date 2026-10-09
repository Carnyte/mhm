// AO3 (Archive of Our Own) URLs: building every request the app makes, and recognising pasted
// links. Work and chapter pages always carry view_adult=true (FicShelf asks before showing adult
// works itself, see the adult gate), so AO3's own notice never stands between the reader and the
// text.
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

/** A work or chapter page, with AO3's adult-content notice skipped (the app asks first itself). */
export function workPageUrl(id: string, chapterId?: string): string {
  return `${workUrl(id, chapterId)}?view_adult=true`;
}

/** Every chapter on one page (the download fallback). */
export function fullWorkUrl(id: string): string {
  return `${workUrl(id)}?view_full_work=true&view_adult=true`;
}

/** The chapter index with dates; not counted as a visit to the work. */
export function navigateUrl(id: string): string {
  return `${workUrl(id)}/navigate`;
}

export function mediaUrl(): string {
  return `${AO3_ORIGIN}/media`;
}

/** Every fandom of a medium ("TV Shows"), A–Z. */
export function mediumFandomsUrl(medium: string): string {
  return `${AO3_ORIGIN}/media/${escapeTag(medium)}/fandoms`;
}

export function autocompleteUrl(kind: 'fandom' | 'character' | 'relationship' | 'freeform', term: string): string {
  return `${AO3_ORIGIN}/autocomplete/${kind}?term=${encodeURIComponent(term)}`;
}

export function seriesUrl(id: string, page = 1): string {
  return AO3_ORIGIN + seriesPath(id) + (page > 1 ? `?page=${page}` : '');
}

/** The listing filters of tag and creator pages (AO3's form#work-filters). */
export interface Ao3Filters {
  sort?: string;
  /** Include one rating (AO3's filter takes one). */
  rating?: number;
  warnings?: number[];
  categories?: number[];
  excludeRatings?: number[];
  excludeWarnings?: number[];
  excludeCategories?: number[];
  /** Facet tag ids by group (characters, relationships, additional tags, fandoms). */
  include?: Partial<Record<'fandom' | 'character' | 'relationship' | 'freeform', string[]>>;
  exclude?: Partial<Record<'fandom' | 'character' | 'relationship' | 'freeform', string[]>>;
  /** '' any, 'T' only, 'F' none. */
  crossover?: '' | 'T' | 'F';
  complete?: '' | 'T' | 'F';
  wordsFrom?: number;
  wordsTo?: number;
  /** "Search within results". */
  query?: string;
  language?: string;
}

/** The fields of AO3's work search (/works/search). */
export interface Ao3Search {
  query?: string;
  title?: string;
  creators?: string;
  /** Comma-separated tag names. */
  fandoms?: string;
  characters?: string;
  relationships?: string;
  freeforms?: string;
  rating?: number;
  warnings?: number[];
  categories?: number[];
  complete?: '' | 'T' | 'F';
  crossover?: '' | 'T' | 'F';
  singleChapter?: boolean;
  /** AO3's range syntax: "<1000", ">50000", "1000-5000". */
  wordCount?: string;
  language?: string;
  /** "<7 days", "2 weeks ago"… */
  revisedAt?: string;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

const nonEmpty = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && !v.length);

/** A tag name as AO3's filter form sends it (escaped, not percent-encoded: URLSearchParams does that). */
function tagParam(name: string): string {
  let s = name;
  for (const [ch, esc] of TAG_ESCAPES) s = s.split(ch).join(esc);
  return s;
}

/** How many filters are set (the "Filters (n)" chip). */
export function countFilters(f: Ao3Filters | Ao3Search): number {
  return Object.entries(f).filter(
    ([k, v]) =>
      k !== 'sort' &&
      k !== 'sortDirection' &&
      (k === 'include' || k === 'exclude' ? Object.values(v ?? {}).some((x) => nonEmpty(x)) : nonEmpty(v) && v !== false),
  ).length;
}

/**
 * A tag's works (or a creator's), one page. Without filters it's the plain listing
 * (/tags/T/works); with filters it's what AO3's filter form submits (/works?tag_id=…).
 */
export function worksListUrl(target: { tag: string } | { user: string; pseud?: string }, f: Ao3Filters = {}, page = 1): string {
  const filtered = countFilters(f) > 0 || (f.sort && f.sort !== 'revised_at');
  if (!filtered) {
    const base =
      'tag' in target
        ? tagWorksPath(target.tag)
        : target.pseud
          ? `/users/${encodeURIComponent(target.user)}/pseuds/${encodeURIComponent(target.pseud)}/works`
          : `/users/${encodeURIComponent(target.user)}/works`;
    return AO3_ORIGIN + base + (page > 1 ? `?page=${page}` : '');
  }
  const q = new URLSearchParams();
  q.append('commit', 'Sort and Filter');
  const add = (k: string, v: unknown) => nonEmpty(v) && q.append(k, String(v));
  const each = (k: string, list?: (string | number)[]) => list?.forEach((v) => q.append(k, String(v)));
  add('work_search[sort_column]', f.sort);
  add('include_work_search[rating_ids][]', f.rating);
  each('include_work_search[archive_warning_ids][]', f.warnings);
  each('include_work_search[category_ids][]', f.categories);
  for (const [g, ids] of Object.entries(f.include ?? {})) each(`include_work_search[${g}_ids][]`, ids);
  each('exclude_work_search[rating_ids][]', f.excludeRatings);
  each('exclude_work_search[archive_warning_ids][]', f.excludeWarnings);
  each('exclude_work_search[category_ids][]', f.excludeCategories);
  for (const [g, ids] of Object.entries(f.exclude ?? {})) each(`exclude_work_search[${g}_ids][]`, ids);
  add('work_search[crossover]', f.crossover);
  add('work_search[complete]', f.complete);
  add('work_search[words_from]', f.wordsFrom);
  add('work_search[words_to]', f.wordsTo);
  add('work_search[query]', f.query);
  add('work_search[language_id]', f.language);
  if ('tag' in target) q.append('tag_id', tagParam(target.tag));
  else {
    q.append('user_id', target.user);
    if (target.pseud) q.append('pseud_id', target.pseud);
  }
  if (page > 1) q.append('page', String(page));
  return `${AO3_ORIGIN}/works?${q.toString()}`;
}

/** One page of work search results. */
export function searchUrl(s: Ao3Search, page = 1): string {
  const q = new URLSearchParams();
  q.append('commit', 'Search');
  const add = (k: string, v: unknown) => nonEmpty(v) && q.append(`work_search[${k}]`, String(v));
  add('query', s.query);
  add('title', s.title);
  add('creators', s.creators);
  add('fandom_names', s.fandoms);
  add('character_names', s.characters);
  add('relationship_names', s.relationships);
  add('freeform_names', s.freeforms);
  add('rating_ids', s.rating);
  s.warnings?.forEach((id) => q.append('work_search[archive_warning_ids][]', String(id)));
  s.categories?.forEach((id) => q.append('work_search[category_ids][]', String(id)));
  add('complete', s.complete);
  add('crossover', s.crossover);
  if (s.singleChapter) add('single_chapter', 1);
  add('word_count', s.wordCount);
  add('language_id', s.language);
  add('revised_at', s.revisedAt);
  add('sort_column', s.sort);
  add('sort_direction', s.sortDirection ?? (s.sort && s.sort !== '_score' ? 'desc' : undefined));
  if (page > 1) q.append('page', String(page));
  return `${AO3_ORIGIN}/works/search?${q.toString()}`;
}

/** Up to 20 works by id, newest change first: one request answers an update check for all of them. */
export function idSearchUrl(ids: string[]): string {
  return searchUrl({ query: `id:(${ids.join(' OR ')})`, sort: 'revised_at', sortDirection: 'desc' });
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

/** The user and pseud of an AO3 author id ('user/pseud'). */
export function splitAuthorId(id: string): { user: string; pseud?: string } {
  const [user, pseud] = id.split('/');
  return pseud && pseud !== user ? { user, pseud } : { user };
}

/** An AO3 link as a LinkHit (works open in the app, tags and series on their AO3 screens). */
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
