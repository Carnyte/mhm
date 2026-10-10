// AO3 as a Source (see src/sources/types.ts), without logging in:
//
//  - getStory: the work page (metadata, chapter ids, the download link, chapter 1) and, for
//    multi-chapter works, /navigate for the chapter dates;
//  - getChapter: /works/ID/chapters/CID (single-chapter works: /works/ID), with view_adult. A
//    chapter id the library kept can be stale (the creator inserted, deleted or moved chapters):
//    the page then shows another chapter, or AO3 answers 404, and the chapter asked for is fetched
//    by its current id (from that page's chapter menu, or /navigate);
//  - downloadAll: the official HTML download (its link copied from the work page) in one
//    request, cut into chapters as they're needed; the full-work page if the file doesn't match
//    the work (never after AO3 failed, blocked or timed out); never the download host for a
//    restricted work;
//  - checkUpdates: one id search per 20 works, then /navigate for works the search didn't
//    return (or that lost chapters). A new chapter is news; any other edit only makes a download
//    stale. The run stops at the first sign AO3 is in trouble, and before a deadline.
//
// Listing helpers for the AO3 screens (tag pages, search, series, creators) are here too, so
// those screens get site-neutral StoryMeta rows.

import { settingsStore } from '../../state/settings';
import type { LibraryStory } from '../../state/library';
import { isAbortError, POLICIES, RateLimitedError } from '../../net/http';
import type { ChapterContent, DownloadOpts, FetchOpts, LinkHit, Source, StoryInfo, StoryMeta, UpdateCheckOpts, UpdateResult } from '../types';
import {
  Ao3ChapterGoneError,
  Ao3NotFoundError,
  Ao3RestrictedError,
  ao3Fetch,
  fetchById,
  fetchDownload,
  fetchNavigate,
  fetchSearch,
  fetchSeries,
  fetchWorkPage,
  fetchWorksList,
  isAo3Trouble,
} from './api';
import { UPDATE_BATCH } from './constants';
import { ao3Chapter, ao3Info, ao3Meta } from './map';
import { parseDownload } from './parsers/download';
import type { Ao3Listing } from './parsers/listing';
import type { Ao3Navigate } from './parsers/navigate';
import type { Ao3Series } from './parsers/series';
import type { Ao3Chapter, Ao3WorkPage } from './parsers/work';
import { AO3_ORIGIN, parseAo3Link, workUrl, type Ao3Filters, type Ao3Search } from './urls';

export const AO3_BASE_URL = AO3_ORIGIN + '/';

const AO3_POLICY = POLICIES['archiveofourown.org'];

// What the app learnt about works this session: restricted ones seen in listings (opening them
// without logging in would only bounce off AO3's login page), chapter ids per work, and full
// chapter titles by chapter id (a chapter page's menu shortens long ones; /navigate, chapter
// headings and the download have them whole).
const restrictedIds = new Set<string>();
const chapterIds = new Map<string, string[]>();
const fullTitles = new Map<string, Map<string, string>>();

function learn(info: StoryInfo) {
  const ids = info.chapterList.map((c) => c.remoteId);
  if (ids.length && ids.every(Boolean)) chapterIds.set(info.remoteId, ids as string[]);
  if (info.restricted) restrictedIds.add(info.remoteId);
  else restrictedIds.delete(info.remoteId);
}

function learnListing(items: StoryMeta[]) {
  for (const m of items) {
    if (m.restricted) restrictedIds.add(m.remoteId);
    else restrictedIds.delete(m.remoteId);
  }
}

function learnTitles(workId: string, list: readonly { id?: string; remoteId?: string; title: string; abbreviated?: boolean }[]) {
  if (!workId) return;
  let known = fullTitles.get(workId);
  if (!known) {
    known = new Map();
    fullTitles.set(workId, known);
    while (fullTitles.size > 50) fullTitles.delete(fullTitles.keys().next().value as string);
  }
  for (const c of list) {
    const id = c.id ?? c.remoteId;
    if (id && c.title && !c.abbreviated) known.set(id, c.title);
  }
}

function learnNavigate(workId: string, nav: Ao3Navigate): string[] {
  learnTitles(workId, nav.chapters);
  const ids = nav.chapters.map((c) => c.id);
  if (ids.length) chapterIds.set(workId, ids);
  return ids;
}

/** Forgets what was learnt this session (tests). */
export function resetAo3Session() {
  restrictedIds.clear();
  chapterIds.clear();
  fullTitles.clear();
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** A work page as StoryInfo (and the context its chapters need for notes). */
function infoOf(page: Ao3WorkPage, nav?: Ao3Navigate): StoryInfo {
  const id = page.meta.id;
  if (nav) learnTitles(id, nav.chapters);
  learnTitles(id, page.chapters);
  learnTitles(id, page.chapterIndex);
  const info = ao3Info(page, nav, fullTitles.get(id));
  learn(info);
  return info;
}

/** The chapter a page shows for a chapter id (a single-chapter work's page has no ids). */
function shownChapter(page: Ao3WorkPage, chapterId?: string): Ao3Chapter {
  const c = (chapterId && page.chapters.find((x) => x.id === chapterId)) || page.chapters[0];
  if (!c) throw new Error('This chapter has no text on AO3.');
  return c;
}

function chapterFrom(page: Ao3WorkPage, info: StoryInfo, c: Ao3Chapter): ChapterContent {
  return ao3Chapter(c, {
    workTitle: info.title,
    workNotes: page.workNotes,
    workEndNotes: page.workEndNotes,
    isFirst: c.number === 1,
    isLast: c.number >= info.chapters,
    story: info,
  });
}

/** Every chapter id of a work page, when its chapter menu has them all. */
function idsOf(info: StoryInfo): string[] | undefined {
  const ids = info.chapterList.map((c) => c.remoteId);
  return ids.length && ids.every(Boolean) ? (ids as string[]) : undefined;
}

async function getStory(remoteId: string, o: FetchOpts = {}): Promise<StoryInfo> {
  if (restrictedIds.has(remoteId)) throw new Ao3RestrictedError(remoteId);
  const page = await fetchWorkPage(remoteId, o);
  // The chapter dates are only on /navigate (small, and not counted as a visit).
  const nav =
    page.meta.chapters > 1
      ? await fetchNavigate(remoteId, o).catch((e) => (isAbortError(e) || e instanceof RateLimitedError ? Promise.reject(e) : undefined))
      : undefined;
  return infoOf(page, nav);
}

/** The work's current chapter ids, from /navigate (Ao3NotFoundError when the work is gone). */
async function navigateIds(remoteId: string, o: FetchOpts): Promise<string[]> {
  return learnNavigate(remoteId, await fetchNavigate(remoteId, o));
}

async function getChapter(remoteId: string, ch: { number: number; remoteId?: string }, o: FetchOpts = {}): Promise<ChapterContent> {
  if (restrictedIds.has(remoteId)) throw new Ao3RestrictedError(remoteId);
  let cid = ch.remoteId ?? chapterIds.get(remoteId)?.[ch.number - 1];
  // Whether `cid` came from AO3 during this call (no point asking for it again).
  let fresh = false;
  if (!cid && ch.number > 1) {
    const ids = await navigateIds(remoteId, o);
    cid = ids[ch.number - 1];
    if (!cid) throw new Ao3ChapterGoneError(remoteId, ch.number, ids);
    fresh = true;
  }
  // Chapter 1 without a known id: /works/ID is the first chapter (or the whole single-chapter work).
  let page: Ao3WorkPage;
  try {
    page = await fetchWorkPage(remoteId, { ...o, chapterId: cid });
  } catch (e) {
    // A kept id whose chapter was deleted is a 404, but the work may well be there: /navigate
    // says which (it's a 404 too when the work is gone) and has the current ids.
    if (!(e instanceof Ao3NotFoundError) || !cid || fresh) throw e;
    const ids = await navigateIds(remoteId, o);
    const next = ids[ch.number - 1];
    if (!next || next === cid) throw new Ao3ChapterGoneError(remoteId, ch.number, ids);
    cid = next;
    fresh = true;
    page = await fetchWorkPage(remoteId, { ...o, chapterId: cid, fresh: true });
  }
  let info = infoOf(page);
  let c = shownChapter(page, cid);
  if (c.number !== ch.number) {
    // The kept id is another chapter now (chapters were inserted, deleted or moved). Its page's
    // chapter menu has the current id of the chapter asked for; the text is never handed back
    // under a number it isn't.
    const ids = idsOf(info) ?? (await navigateIds(remoteId, o));
    const next = ids[ch.number - 1];
    if (!next || next === cid) throw new Ao3ChapterGoneError(remoteId, ch.number, ids);
    // Not a page kept from before the chapters changed.
    page = await fetchWorkPage(remoteId, { ...o, chapterId: next, fresh: true });
    info = infoOf(page);
    c = shownChapter(page, next);
    if (c.number !== ch.number) throw new Ao3ChapterGoneError(remoteId, ch.number, idsOf(info) ?? ids);
  }
  return chapterFrom(page, info, c);
}

/** The chapter titles a download or the full-work view has whole, over the page's (maybe shortened) ones. */
function withTitles(info: StoryInfo, titles: (string | undefined)[]): StoryInfo {
  const chapterList = info.chapterList.map((c, i) => {
    const t = titles[i];
    if (!t) return c;
    const { abbreviated: _short, ...rest } = c;
    return { ...rest, title: t };
  });
  learnTitles(info.remoteId, chapterList);
  return { ...info, chapterList };
}

async function downloadAll(remoteId: string, onChapter: (c: ChapterContent) => Promise<void>, o: DownloadOpts = {}): Promise<StoryInfo> {
  const page = await fetchWorkPage(remoteId, { ...o, fresh: true });
  const info = infoOf(page);
  if (o.knownVersion && info.version === o.knownVersion) return info;
  await o.onInfo?.(info);
  const ids = info.chapterList.map((c) => c.remoteId);
  const ctx = (n: number, notes: { workNotes?: string; workEndNotes?: string }) => ({
    workTitle: info.title,
    ...notes,
    isFirst: n === 1,
    isLast: n >= info.chapters,
  });

  // The official download: one request, served from Cloudflare's cache. Never for a restricted
  // work (the download host doesn't check who may see it).
  const href = page.downloads.html;
  if (href && !info.restricted) {
    try {
      const d = parseDownload(await fetchDownload(href, o));
      // Chapter ids are matched by position, so the file must have the chapters the page lists.
      if (d.count && d.count === info.chapterList.length) {
        const titles: (string | undefined)[] = [];
        for (let i = 0; i < d.count; i++) {
          if (o.signal?.aborted) throw Object.assign(new Error('The download was cancelled.'), { name: 'AbortError' });
          const c = d.chapter(i);
          titles[i] = c.title || undefined;
          await onChapter(
            ao3Chapter(
              { ...c, id: ids[i] },
              ctx(c.number, { workNotes: d.preface.workNotes ?? page.workNotes, workEndNotes: d.workEndNotes ?? page.workEndNotes }),
            ),
          );
          await yieldToUi();
        }
        // The download's chapter headings have every title whole.
        return info.chapters > 1 ? withTitles(info, titles) : info;
      }
    } catch (e) {
      // AO3 failing, blocking or timing out isn't asked for its heaviest page next.
      if (isAbortError(e) || e instanceof Ao3RestrictedError || isAo3Trouble(e)) throw e;
      // Otherwise (a file that doesn't parse, a stale link) fall back to the full-work page.
    }
  }

  const full = info.chapters === 1 && page.chapters.length === 1 ? page : await fetchWorkPage(remoteId, { ...o, full: true });
  for (const c of full.chapters) {
    await onChapter(
      ao3Chapter(
        { ...c, id: c.id ?? ids[c.number - 1] },
        ctx(c.number, { workNotes: full.workNotes ?? page.workNotes, workEndNotes: full.workEndNotes ?? page.workEndNotes }),
      ),
    );
    await yieldToUi();
  }
  if (full === page || info.chapters <= 1) return info;
  return withTitles(
    info,
    info.chapterList.map((ch) => full.chapters.find((c) => c.number === ch.number)?.title || undefined),
  );
}

/** What changed for one library work, from its search blurb. */
function compare(s: LibraryStory, m: StoryMeta): UpdateResult {
  const version = m.version;
  // A copy from an imported file has no version yet: it is taken as current (the check records
  // the version), never re-downloaded behind the user's back for it.
  const fromFile = !!s.local && s.downloadedVersion == null;
  return {
    key: s.key,
    meta: m,
    chapters: m.chapters,
    // Only a new chapter is news: AO3's version stamp changes on any edit (tags, collections…).
    changed: m.chapters > s.chapters,
    // A changed work makes the device's copy stale.
    redownload: !!s.downloaded && !!version && !fromFile && version !== s.downloadedVersion,
  };
}

const loggedIn = () => !!ao3Source.session?.get().loggedIn;

async function checkUpdates(stories: LibraryStory[], o: UpdateCheckOpts = {}): Promise<UpdateResult[]> {
  const opts: FetchOpts = { quiet: o.quiet, signal: o.signal, priority: o.priority ?? 'background' };
  const gap = opts.priority === 'background' ? AO3_POLICY.gapBackgroundMs : AO3_POLICY.gapUserMs;
  const results: UpdateResult[] = [];
  const emit = async (rs: UpdateResult[]) => {
    if (!rs.length) return;
    results.push(...rs);
    await o.onResults?.(rs);
  };
  // Works a request would reach only after the deadline wait for the next check (which starts
  // with the works checked longest ago).
  let sent = 0;
  const late = () => {
    if (o.signal?.aborted) throw Object.assign(new Error('The update check was stopped.'), { name: 'AbortError' });
    return o.deadline != null && Date.now() + (sent ? gap : 0) > o.deadline;
  };
  // AO3 failing, challenging the app, or out of reach: nothing more is asked this run.
  const stop = (rest: LibraryStory[], e: unknown) => emit(rest.map((s) => ({ key: s.key, changed: false, error: e as Error })));

  const probe: LibraryStory[] = [];
  for (let i = 0; i < stories.length; i += UPDATE_BATCH) {
    const batch = stories.slice(i, i + UPDATE_BATCH);
    if (late()) return results;
    let found: Map<string, StoryMeta>;
    try {
      sent++;
      const listing = await fetchById(
        batch.map((s) => s.remoteId),
        opts,
      );
      found = new Map(listing.works.map((w) => [w.id, ao3Meta(w)]));
    } catch (e) {
      if (isAbortError(e)) throw e;
      if (isAo3Trouble(e)) {
        await stop(stories.slice(i), e);
        return results;
      }
      await emit(batch.map((s) => ({ key: s.key, changed: false, error: e as Error })));
      continue;
    }
    const out: UpdateResult[] = [];
    for (const s of batch) {
      const m = found.get(s.remoteId);
      if (m) {
        out.push(compare(s, m));
        // Fewer chapters than the library's ids: chapters were deleted, so the ids are stale. (Not
        // the stored count, which this result lowers at once: a run cut short before the probe
        // must still probe next time.)
        if (m.chapters < (s.chapterIds?.length ?? s.chapters)) probe.push(s);
      } else if ((s.restricted || restrictedIds.has(s.remoteId)) && !loggedIn()) {
        // Only for logged-in AO3 users: the search can't return it, and /navigate would only
        // bounce off AO3's login page.
        out.push({ key: s.key, changed: false });
      } else probe.push(s);
    }
    await emit(out);
  }
  // Not in the results (deleted, or not in the search index yet), or shorter than before.
  for (let j = 0; j < probe.length; j++) {
    const s = probe[j];
    if (late()) break;
    try {
      sent++;
      const nav = await fetchNavigate(s.remoteId, opts);
      const ids = learnNavigate(s.remoteId, nav);
      await emit([{ key: s.key, chapters: ids.length, chapterIds: ids, chapterTitles: nav.chapters.map((c) => c.title), changed: ids.length > s.chapters }]);
    } catch (e) {
      if (isAbortError(e)) throw e;
      if (isAo3Trouble(e)) {
        await stop(probe.slice(j), e);
        break;
      }
      if (e instanceof Ao3NotFoundError) await emit([{ key: s.key, changed: false, gone: true }]);
      // Locked since it was saved: remembered, so it isn't probed again while logged out.
      else if (e instanceof Ao3RestrictedError) await emit([{ key: s.key, changed: false, restricted: true }]);
      else await emit([{ key: s.key, changed: false, error: e as Error }]);
    }
  }
  return results;
}

// --- Listings for the AO3 screens ---------------------------------------------------------

export interface Ao3Page {
  items: StoryMeta[];
  lastPage: number;
  total?: string;
  listing: Ao3Listing;
}

function pageOf(listing: Ao3Listing): Ao3Page {
  const items = listing.works.map(ao3Meta);
  learnListing(items);
  return { items, lastPage: listing.lastPage, total: listing.total, listing };
}

export async function listTagWorks(tag: string, f: Ao3Filters, page: number, o?: FetchOpts): Promise<Ao3Page> {
  return pageOf(await fetchWorksList({ tag }, f, page, o));
}

export async function listUserWorks(user: string, pseud: string | undefined, f: Ao3Filters, page: number, o?: FetchOpts): Promise<Ao3Page> {
  return pageOf(await fetchWorksList({ user, pseud }, f, page, o));
}

export async function searchWorks(s: Ao3Search, page: number, o?: FetchOpts): Promise<Ao3Page> {
  return pageOf(await fetchSearch(s, page, o));
}

export async function getSeries(id: string, page: number, o?: FetchOpts): Promise<Ao3Series & { metas: StoryMeta[] }> {
  const s = await fetchSeries(id, page, o);
  const metas = s.items.map(ao3Meta);
  learnListing(metas);
  return { ...s, metas };
}

/** A chapter link (/chapters/CID) names no work: AO3's redirect does. */
async function resolvePart(partId: string, o: FetchOpts = {}): Promise<LinkHit> {
  const r = await ao3Fetch(`/chapters/${partId}?view_adult=true`, o);
  const m = r.url.match(/\/works\/(\d+)(?:\/chapters\/(\d+))?/);
  if (!m) throw new Ao3NotFoundError(r.url);
  return { source: 'ao3', kind: 'story', id: m[1], chapterRemoteId: m[2] ?? partId, url: workUrl(m[1], m[2] ?? partId) };
}

export const ao3Source: Source = {
  id: 'ao3',
  name: 'AO3',
  short: 'AO3',
  transport: 'http',
  caps: {
    browse: true,
    search: true,
    download: true,
    updates: true,
    login: false,
    follow: false,
    endorse: false,
    discuss: 'none',
    accountSync: false,
  },
  reader: { baseUrl: AO3_BASE_URL },
  stableText: true,
  enabled: () => settingsStore.get().sources?.ao3?.enabled !== false,
  parseLink: parseAo3Link,
  resolvePart,
  webUrl: (remoteId, ch) => workUrl(remoteId, ch?.remoteId),
  getStory,
  getChapter,
  downloadAll,
  checkUpdates,
  search: async (q, page, o) => {
    const r = await searchWorks({ ...(q as Ao3Search), query: q.text || (q as Ao3Search).query }, page, o);
    return { items: r.items, lastPage: r.lastPage, total: r.total };
  },
};
