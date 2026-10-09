// AO3 as a Source (see src/sources/types.ts), without logging in:
//
//  - getStory: the work page (metadata, chapter ids, the download link, chapter 1) and, for
//    multi-chapter works, /navigate for the chapter dates;
//  - getChapter: /works/ID/chapters/CID (single-chapter works: /works/ID), with view_adult;
//  - downloadAll: the official HTML download (its link copied from the work page) in one
//    request, cut into chapters as they're needed; the full-work page if that fails; never the
//    download host for a restricted work;
//  - checkUpdates: one id search per 20 works, then /navigate for works the search didn't
//    return. A new chapter is news; any other edit only makes a download stale.
//
// Listing helpers for the AO3 screens (tag pages, search, series, creators) are here too, so
// those screens get site-neutral StoryMeta rows.

import { settingsStore } from '../../state/settings';
import type { LibraryStory } from '../../state/library';
import { isAbortError, RateLimitedError } from '../../net/http';
import type { ChapterContent, DownloadOpts, FetchOpts, LinkHit, Source, StoryInfo, StoryMeta, UpdateResult } from '../types';
import {
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
} from './api';
import { UPDATE_BATCH } from './constants';
import { ao3Chapter, ao3Info, ao3Meta } from './map';
import { parseDownload } from './parsers/download';
import type { Ao3Listing } from './parsers/listing';
import type { Ao3Series } from './parsers/series';
import type { Ao3WorkPage } from './parsers/work';
import { AO3_ORIGIN, parseAo3Link, workUrl, type Ao3Filters, type Ao3Search } from './urls';

export const AO3_BASE_URL = AO3_ORIGIN + '/';

// What the app learnt about works this session: restricted ones seen in listings (opening them
// without logging in would only bounce off AO3's login page), and chapter ids per work.
const restrictedIds = new Set<string>();
const chapterIds = new Map<string, string[]>();

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

/** Forgets what was learnt this session (tests). */
export function resetAo3Session() {
  restrictedIds.clear();
  chapterIds.clear();
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** A work page as StoryInfo (and the context its chapters need for notes). */
function infoOf(page: Ao3WorkPage, nav?: Parameters<typeof ao3Info>[1]): StoryInfo {
  const info = ao3Info(page, nav);
  learn(info);
  return info;
}

function chapterFrom(page: Ao3WorkPage, info: StoryInfo, chapterId?: string): ChapterContent {
  const c = (chapterId && page.chapters.find((x) => x.id === chapterId)) || page.chapters[0];
  if (!c) throw new Error('This chapter has no text on AO3.');
  return ao3Chapter(c, {
    workTitle: info.title,
    workNotes: page.workNotes,
    workEndNotes: page.workEndNotes,
    isFirst: c.number === 1,
    isLast: c.number >= info.chapters,
    story: info,
  });
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

async function getChapter(remoteId: string, ch: { number: number; remoteId?: string }, o: FetchOpts = {}): Promise<ChapterContent> {
  if (restrictedIds.has(remoteId)) throw new Ao3RestrictedError(remoteId);
  let cid = ch.remoteId ?? chapterIds.get(remoteId)?.[ch.number - 1];
  if (!cid && ch.number > 1) {
    const nav = await fetchNavigate(remoteId, o);
    const ids = nav.chapters.map((c) => c.id);
    if (ids.length) chapterIds.set(remoteId, ids);
    cid = ids[ch.number - 1];
    if (!cid) throw new Ao3NotFoundError(workUrl(remoteId));
  }
  // Chapter 1 without a known id: /works/ID is the first chapter (or the whole single-chapter work).
  const page = await fetchWorkPage(remoteId, { ...o, chapterId: cid });
  return chapterFrom(page, infoOf(page), cid);
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
        for (let i = 0; i < d.count; i++) {
          if (o.signal?.aborted) throw Object.assign(new Error('The download was cancelled.'), { name: 'AbortError' });
          const c = d.chapter(i);
          await onChapter(
            ao3Chapter(
              { ...c, id: ids[i] },
              ctx(c.number, { workNotes: d.preface.workNotes ?? page.workNotes, workEndNotes: d.workEndNotes ?? page.workEndNotes }),
            ),
          );
          await yieldToUi();
        }
        return info;
      }
    } catch (e) {
      if (isAbortError(e) || e instanceof RateLimitedError || e instanceof Ao3RestrictedError) throw e;
      // Otherwise fall back to the full-work page.
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
  return info;
}

/** What changed for one library work, from its search blurb. */
function compare(s: LibraryStory, m: StoryMeta): UpdateResult {
  const version = m.version;
  return {
    key: s.key,
    meta: m,
    chapters: m.chapters,
    // Only a new chapter is news: AO3's version stamp changes on any edit (tags, collections…).
    changed: m.chapters > s.chapters,
    // A changed work makes the device's copy stale.
    redownload: !!s.downloaded && !!version && version !== s.downloadedVersion,
  };
}

async function checkUpdates(stories: LibraryStory[], o: FetchOpts = {}): Promise<UpdateResult[]> {
  const opts = { ...o, priority: o.priority ?? ('background' as const) };
  const results: UpdateResult[] = [];
  const missing: LibraryStory[] = [];
  for (let i = 0; i < stories.length; i += UPDATE_BATCH) {
    const batch = stories.slice(i, i + UPDATE_BATCH);
    let found: Map<string, StoryMeta>;
    try {
      const listing = await fetchById(
        batch.map((s) => s.remoteId),
        opts,
      );
      found = new Map(listing.works.map((w) => [w.id, ao3Meta(w)]));
    } catch (e) {
      if (isAbortError(e) || e instanceof RateLimitedError) throw e;
      for (const s of batch) results.push({ key: s.key, changed: false, error: e as Error });
      continue;
    }
    for (const s of batch) {
      const m = found.get(s.remoteId);
      if (m) results.push(compare(s, m));
      else missing.push(s);
    }
  }
  // Not in the results: deleted, restricted (not logged in), or not in the search index yet.
  for (const s of missing) {
    try {
      const nav = await fetchNavigate(s.remoteId, opts);
      const ids = nav.chapters.map((c) => c.id);
      results.push({ key: s.key, chapters: ids.length, chapterIds: ids, changed: ids.length > s.chapters });
    } catch (e) {
      if (isAbortError(e) || e instanceof RateLimitedError) throw e;
      if (e instanceof Ao3NotFoundError) results.push({ key: s.key, changed: false, gone: true });
      else if (e instanceof Ao3RestrictedError) results.push({ key: s.key, changed: false });
      else results.push({ key: s.key, changed: false, error: e as Error });
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
