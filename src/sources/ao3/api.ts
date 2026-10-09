// Every request FicShelf makes to AO3. All of them go through the polite HTTP client
// (src/net/http.ts), whose AO3 policy keeps one request in flight with at least 1.5 s between
// requests (5 s for background update checks) and honours AO3's 429s; each answer is checked
// for a Cloudflare challenge (src/net/blocks.ts).
//
// Rules kept here (see the AO3 policy in the design notes):
//  - work and chapter pages always ask with view_adult=true (the app asks before adult works);
//  - only AO3's own hosts are fetched, and never a /cdn-cgi/ link (Cloudflare's hidden bot trap);
//  - the official download's address is only ever the one a work page links, never built;
//  - a restricted work's login redirect is reported as such (logging in comes later), and the
//    download host is never asked for a restricted work;
//  - fandom lists and the media page are cached for a week.

import { httpCache } from '../../db/kv';
import { detectAo3Block, SourceBlockedError } from '../../net/blocks';
import { HttpTimeoutError, httpText, isAbortError, NetworkError, RateLimitedError, type HttpResponse } from '../../net/http';
import type { FetchOpts } from '../types';
import { FANDOM_CACHE_MS } from './constants';
import { parseListing, type Ao3Listing } from './parsers/listing';
import { parseAutocomplete, parseMedia, parseMediumFandoms, type Ao3Fandom, type Ao3Medium } from './parsers/media';
import { parseNavigate, type Ao3Navigate } from './parsers/navigate';
import { parseSeries, type Ao3Series } from './parsers/series';
import { parseWorkPage, type Ao3WorkPage } from './parsers/work';
import {
  AO3_ORIGIN,
  autocompleteUrl,
  fullWorkUrl,
  idSearchUrl,
  mediaUrl,
  mediumFandomsUrl,
  navigateUrl,
  searchUrl,
  seriesUrl,
  workPageUrl,
  workUrl,
  worksListUrl,
  type Ao3Filters,
  type Ao3Search,
} from './urls';

/** Only visible to logged-in AO3 users (AO3 redirected to its login page). */
export class Ao3RestrictedError extends Error {
  constructor(public workId?: string) {
    super('This work is only available to people logged in to AO3. Open it on AO3 to read it there.');
    this.name = 'Ao3RestrictedError';
  }
  get url(): string {
    return this.workId ? workUrl(this.workId) : AO3_ORIGIN;
  }
}

export class Ao3NotFoundError extends Error {
  constructor(
    public url: string,
    message = 'AO3 says this page doesn’t exist. The work may have been deleted or hidden by its creator.',
  ) {
    super(message);
    this.name = 'Ao3NotFoundError';
  }
}

/**
 * The work is there but has no chapter with that number any more (its creator deleted chapters).
 * `chapterIds` are the work's current ids, so the library can move reading state along.
 */
export class Ao3ChapterGoneError extends Ao3NotFoundError {
  constructor(
    workId: string,
    public chapter: number,
    public chapterIds?: string[],
  ) {
    super(workUrl(workId), `This work has no chapter ${chapter} on AO3 any more. Its creator may have deleted chapters; the chapter list is up to date now.`);
    this.name = 'Ao3ChapterGoneError';
  }
}

/** AO3 showed its adult-content notice although the request skipped it. */
export class Ao3AdultNoticeError extends Error {
  constructor(public workId?: string) {
    super('AO3 asked to confirm adult content before showing this work. Try again, or open it on AO3.');
    this.name = 'Ao3AdultNoticeError';
  }
}

export class Ao3UnavailableError extends Error {
  constructor(public status: number) {
    super(`AO3 is busy or down for maintenance right now (error ${status}). Try again in a few minutes.`);
    this.name = 'Ao3UnavailableError';
  }
}

/**
 * AO3 is down, overloaded, challenging the app or out of reach. Whatever was going to be asked
 * next waits: update checks stop for the run, and a failed download doesn't fall back to the
 * full-work page (the heaviest page AO3 renders).
 */
export function isAo3Trouble(e: unknown): boolean {
  return (
    e instanceof RateLimitedError ||
    e instanceof Ao3UnavailableError ||
    e instanceof SourceBlockedError ||
    e instanceof HttpTimeoutError ||
    e instanceof NetworkError
  );
}

const AO3_HOST = /^https:\/\/(?:download\.)?archiveofourown\.org(?=[/?#]|$)/i;

/** An AO3 address: paths are on archiveofourown.org; other hosts and /cdn-cgi/ links are refused. */
export function ao3Url(pathOrUrl: string): string {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : AO3_ORIGIN + (pathOrUrl.startsWith('/') ? '' : '/') + pathOrUrl;
  if (!AO3_HOST.test(url)) throw new Error(`Not an AO3 address: ${url}`);
  if (/\/cdn-cgi\//i.test(url)) throw new Error('FicShelf never follows Cloudflare’s hidden links.');
  return url;
}

const isLoginRedirect = (url: string) => /^https:\/\/archiveofourown\.org\/users\/login\b/i.test(url);

export interface Ao3RequestOpts extends FetchOpts {
  timeoutMs?: number;
  method?: 'GET' | 'HEAD';
}

/** GET an AO3 page through the polite client; HTTP errors become the errors above. */
export async function ao3Fetch(pathOrUrl: string, o: Ao3RequestOpts = {}): Promise<HttpResponse> {
  const url = ao3Url(pathOrUrl);
  const r = detectAo3Block(
    await httpText(url, {
      method: o.method ?? 'GET',
      priority: o.priority ?? 'user',
      signal: o.signal,
      timeoutMs: o.timeoutMs,
      headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
    }),
  );
  if (isLoginRedirect(r.url)) throw new Ao3RestrictedError(url.match(/\/works\/(\d+)/)?.[1]);
  if (r.status === 404 || r.status === 410) throw new Ao3NotFoundError(url);
  if (r.status >= 500) throw new Ao3UnavailableError(r.status);
  if (r.status >= 400) throw new Error(`AO3 answered with error ${r.status}.`);
  return r;
}

// Work pages just fetched, reused for a few minutes: opening a story and then its first chapter
// (or downloading it) doesn't ask AO3 for the same page twice.
const RECENT_MS = 5 * 60_000;
const recent = new Map<string, { at: number; page: Ao3WorkPage }>();

function remember(url: string, page: Ao3WorkPage) {
  recent.delete(url);
  recent.set(url, { at: Date.now(), page });
  while (recent.size > 6) recent.delete(recent.keys().next().value as string);
}

/** Forgets the reused pages (tests, and after a download refreshes a work). */
export function forgetRecentPages() {
  recent.clear();
}

/** A work page (chapter 1 of a multi-chapter work, or the given chapter), or the full work. */
export async function fetchWorkPage(id: string, opts: Ao3RequestOpts & { chapterId?: string; full?: boolean; fresh?: boolean } = {}): Promise<Ao3WorkPage> {
  const url = opts.full ? fullWorkUrl(id) : workPageUrl(id, opts.chapterId);
  const hit = recent.get(url);
  if (hit && !opts.fresh && Date.now() - hit.at < RECENT_MS) return hit.page;
  const r = await ao3Fetch(url, opts);
  let page = parseWorkPage(r.text);
  // /works/ID redirects a multi-chapter work to its first chapter without the view_adult parameter
  // (AO3 sets a cookie for that instead). Should the notice come back, ask the final page with it.
  if (page.kind === 'adult' && r.url !== url && !/[?&]view_adult=true/.test(r.url) && /\/works\/\d+\/chapters\/\d+/.test(r.url)) {
    page = parseWorkPage((await ao3Fetch(`${r.url.split(/[?#]/)[0]}?view_adult=true`, opts)).text);
  }
  switch (page.kind) {
    case 'work':
      if (!page.meta.id) page.meta.id = id;
      remember(url, page);
      // The first chapter's page is also what /works/ID shows: remember it under both.
      if (!opts.chapterId && !opts.full && page.chapters[0]?.id) remember(workPageUrl(id, page.chapters[0].id), page);
      return page;
    case 'adult':
      throw new Ao3AdultNoticeError(id);
    case 'login':
      throw new Ao3RestrictedError(id);
    default:
      throw new Error('AO3 sent a page FicShelf doesn’t recognise. Open the work on AO3 instead.');
  }
}

/** The chapter index with dates. Not written into the reader's AO3 history. */
export async function fetchNavigate(id: string, o: Ao3RequestOpts = {}): Promise<Ao3Navigate> {
  return parseNavigate((await ao3Fetch(navigateUrl(id), o)).text);
}

/**
 * The official HTML download. `href` must be the link a work page gave (`/downloads/ID/…`);
 * AO3 redirects it to download.archiveofourown.org, served from Cloudflare's cache.
 */
export async function fetchDownload(href: string, o: Ao3RequestOpts = {}): Promise<string> {
  if (!/^(?:https:\/\/(?:download\.)?archiveofourown\.org)?\/downloads\/\d+\/[^/?#]+\.html\?updated_at=\d+$/.test(href)) {
    throw new Error('Not an AO3 download link.');
  }
  return (await ao3Fetch(href, { timeoutMs: 60_000, ...o })).text;
}

export async function fetchSearch(s: Ao3Search, page = 1, o: Ao3RequestOpts = {}): Promise<Ao3Listing> {
  return parseListing((await ao3Fetch(searchUrl(s, page), o)).text);
}

/** Up to 20 works by id in one search (update checks). */
export async function fetchById(ids: string[], o: Ao3RequestOpts = {}): Promise<Ao3Listing> {
  return parseListing((await ao3Fetch(idSearchUrl(ids), o)).text);
}

export async function fetchWorksList(
  target: { tag: string } | { user: string; pseud?: string },
  f: Ao3Filters = {},
  page = 1,
  o: Ao3RequestOpts = {},
): Promise<Ao3Listing> {
  return parseListing((await ao3Fetch(worksListUrl(target, f, page), o)).text);
}

export async function fetchSeries(id: string, page = 1, o: Ao3RequestOpts = {}): Promise<Ao3Series> {
  const s = parseSeries((await ao3Fetch(seriesUrl(id, page), o)).text);
  return { ...s, id };
}

/** Cached for a week; a stale copy is used when AO3 can't be reached. */
async function cached<T>(key: string, load: () => Promise<T>, opts: { force?: boolean } = {}): Promise<T> {
  const hit = await httpCache.get(key).catch(() => undefined);
  if (hit && !opts.force && Date.now() - hit.fetchedAt < FANDOM_CACHE_MS) {
    try {
      return JSON.parse(hit.body) as T;
    } catch {
      // unreadable: fetch again
    }
  }
  try {
    const value = await load();
    await httpCache.put(key, JSON.stringify(value)).catch(() => {});
    return value;
  } catch (e) {
    if (hit && !isAbortError(e)) {
      try {
        return JSON.parse(hit.body) as T;
      } catch {
        // fall through
      }
    }
    throw e;
  }
}

export function fetchMedia(o: Ao3RequestOpts & { force?: boolean } = {}): Promise<Ao3Medium[]> {
  return cached('ao3:media', async () => parseMedia((await ao3Fetch(mediaUrl(), o)).text), o);
}

/** Every fandom of a medium (one very large page), cached for a week. */
export function fetchMediumFandoms(medium: string, o: Ao3RequestOpts & { force?: boolean } = {}): Promise<Ao3Fandom[]> {
  return cached(`ao3:fandoms:${medium}`, async () => parseMediumFandoms((await ao3Fetch(mediumFandomsUrl(medium), o)).text), o);
}

/** Fandom names matching `term` (callers debounce, and ask only from 2 characters). */
export async function fetchFandomSuggestions(term: string, o: Ao3RequestOpts = {}): Promise<string[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  return parseAutocomplete((await ao3Fetch(autocompleteUrl('fandom', t), o)).text);
}
