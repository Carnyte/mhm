// Local library: saved / followed / favourite / downloaded stories, reading progress, history,
// bookmarks, collections, authors, drafts and recent searches.
//
// Every story is keyed by its source-qualified StoryKey ('ffn:123'). Records are normalised as
// they're read, so a row an older build wrote (v1 shape) still loads correctly.

import { kv } from '../db/kv';
import {
  authorKeyFromKv,
  legacyStoryIds,
  mergeAuthor,
  mergeStory,
  normalizeAuthor,
  normalizeBookmarks,
  normalizeCollections,
  normalizeSearches,
  normalizeStory,
} from '../db/migrations/v2';
import type { StoryDetail, StorySummary, UserRef } from '../ffn/types';
import { libraryMetaFromFfn } from '../sources/ffn/map';
import { authorKey, normalizeKey, splitKey, toKey, type SourceId, type StoryKey } from '../sources/keys';
import { createStore, useStore } from './store';

/** Counters a site shows for a story; each site fills the ones it has (FFN: reviews, favs, follows). */
export interface StoryStats {
  reviews?: number;
  favs?: number;
  follows?: number;
  kudos?: number;
  hits?: number;
  bookmarks?: number;
  comments?: number;
  reads?: number;
  votes?: number;
}

export interface LibraryStory {
  key: StoryKey;
  source: SourceId;
  /** The site's own id. Opaque: only that site's code reads it as a number. */
  remoteId: string;
  title: string;
  author?: UserRef;
  summary: string;
  fandom?: string;
  isCrossover?: boolean;
  rating?: string;
  language?: string;
  genres: string[];
  characters?: string;
  chapters: number;
  words: number;
  stats: StoryStats;
  updated?: number;
  published?: number;
  complete: boolean;
  coverUrl?: string;
  chapterTitles?: string[];
  /** FanFiction.net only: the id its review form needs. */
  ffn?: { storyTextId?: number };
  /** FanFiction.net only: the numeric id, kept for an older build installed again. Read `key`. */
  id?: number;

  inLibrary: boolean;
  followed?: boolean;
  favorited?: boolean;
  downloaded?: boolean;
  downloadedChapters?: number[];

  lastReadAt?: number;
  lastChapter?: number;
  lastProgress?: number;
  readChapters?: number[];
  chapterProgress?: Record<string, number>;

  /** Chapter count the user has "seen" (story opened or update acknowledged). */
  knownChapters?: number;
  lastCheckedAt?: number;
  addedAt: number;
  notify?: boolean;
}

export interface Bookmark {
  id: string;
  storyKey: StoryKey;
  /** FanFiction.net stories also keep the bare id, so an older build can still open the bookmark. */
  storyId?: number;
  storyTitle: string;
  chapter: number;
  progress: number;
  note?: string;
  excerpt?: string;
  createdAt: number;
}

export interface Collection {
  id: string;
  name: string;
  storyKeys: StoryKey[];
  /** The FanFiction.net ids among `storyKeys`, in order, still written for older builds. */
  storyIds?: number[];
  createdAt: number;
}

export interface SavedAuthor {
  /** `<source>:<id>`, see authorKey(). */
  key: string;
  source: SourceId;
  id: string;
  name: string;
  avatarUrl?: string;
  followed?: boolean;
  favorited?: boolean;
  storyCount?: number;
}

export interface Draft {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RecentSearch {
  source: SourceId;
  keywords: string;
  type: string;
  at: number;
}

/** Anything the library takes a story from: a library record, or a FanFiction.net list row / page. */
export type AnyStory = StorySummary | StoryDetail | LibraryStory;

export function isLibraryStory(s: AnyStory): s is LibraryStory {
  return 'key' in s;
}

/** The key of any story: a library record's own, or 'ffn:<id>' for a FanFiction.net item. */
export function keyOf(s: AnyStory): StoryKey {
  return isLibraryStory(s) ? s.key : toKey('ffn', s.id);
}

/** A story's counters, whichever shape it comes in. */
export function statsOf(s: AnyStory): StoryStats {
  return isLibraryStory(s) ? s.stats : { reviews: s.reviews, favs: s.favs, follows: s.follows };
}

interface LibraryState {
  stories: Record<StoryKey, LibraryStory>;
  bookmarks: Bookmark[];
  collections: Collection[];
  /** By author key ('ffn:501'). */
  authors: Record<string, SavedAuthor>;
  drafts: Draft[];
  searches: RecentSearch[];
  /** Last FanFiction.net account sync. */
  lastSync?: number;
}

function load(): LibraryState {
  const stories: Record<StoryKey, LibraryStory> = {};
  const authors: Record<string, SavedAuthor> = {};
  try {
    // The row key decides which story a record is: v1 rows an older build left behind count, and
    // a row whose key names no story (an older build can write `story:undefined`) is ignored.
    for (const [k, v] of kv.entriesSync<unknown>('story:')) {
      const key = normalizeKey(k.slice('story:'.length));
      const s = key && normalizeStory(v, key);
      if (s) stories[s.key] = stories[s.key] ? mergeStory(stories[s.key], s) : s;
    }
    for (const [k, v] of kv.entriesSync<unknown>('author:')) {
      const key = authorKeyFromKv(k.slice('author:'.length));
      const a = key && normalizeAuthor(v, key);
      if (a) authors[a.key] = authors[a.key] ? mergeAuthor(authors[a.key], a) : a;
    }
    return {
      stories,
      authors,
      bookmarks: normalizeBookmarks(kv.getSync('bookmarks')),
      collections: normalizeCollections(kv.getSync('collections')),
      drafts: kv.getSync<Draft[]>('drafts') ?? [],
      searches: normalizeSearches(kv.getSync('searches')) as RecentSearch[],
      lastSync: kv.getSync<number>('lastSync'),
    };
  } catch {
    return { stories, authors, bookmarks: [], collections: [], drafts: [], searches: [] };
  }
}

export const libraryStore = createStore<LibraryState>(load());

/** Reads the library from storage again (after a migration retry succeeded). */
export function reloadLibrary() {
  libraryStore.set(load());
}

export function useLibrary<S>(selector: (s: LibraryState) => S): S {
  return useStore(libraryStore, selector);
}

export function useLibraryStory(key: StoryKey | null | undefined): LibraryStory | undefined {
  return useStore(libraryStore, (s) => (key ? s.stories[key] : undefined));
}

function persistStory(s: LibraryStory | undefined, key: StoryKey) {
  if (!s) kv.delete(`story:${key}`).catch(() => {});
  // FanFiction.net records carry their numeric id too, so an older build installed again can read them.
  else kv.set(`story:${key}`, s.source === 'ffn' ? { ...s, id: Number(s.remoteId) } : s).catch(() => {});
}

/** Whether a story record is worth keeping (otherwise it is dropped to keep storage small). */
function keep(s: LibraryStory): boolean {
  return s.inLibrary || !!s.followed || !!s.favorited || !!s.downloaded || !!s.lastReadAt;
}

const META_FIELDS = [
  'key',
  'source',
  'remoteId',
  'title',
  'summary',
  'fandom',
  'isCrossover',
  'rating',
  'language',
  'genres',
  'characters',
  'chapters',
  'words',
  'stats',
  'updated',
  'published',
  'complete',
] as const;

function metaFrom(src: AnyStory): Partial<LibraryStory> {
  let out: Partial<LibraryStory>;
  if (isLibraryStory(src)) {
    out = {};
    for (const f of META_FIELDS) (out as Record<string, unknown>)[f] = src[f];
    if (src.author?.id) out.author = src.author;
    if (src.coverUrl) out.coverUrl = src.coverUrl;
  } else out = libraryMetaFromFfn(src);
  // Drop undefined so partial list data doesn't wipe richer saved data.
  for (const k of Object.keys(out) as (keyof LibraryStory)[]) if (out[k] === undefined) delete out[k];
  if (!src.summary) delete out.summary;
  return out;
}

export function upsertStory(src: AnyStory, patch: Partial<LibraryStory> = {}, opts: { create?: boolean } = { create: true }): LibraryStory | undefined {
  const key = keyOf(src);
  let result: LibraryStory | undefined;
  libraryStore.set((st) => {
    const prev = st.stories[key];
    if (!prev && !opts.create) return st;
    const { source, remoteId } = splitKey(key);
    const defaults = { key, source, remoteId, stats: {}, genres: [] as string[], summary: '', inLibrary: false, addedAt: Date.now() };
    const meta = metaFrom(src);
    const next = { ...defaults, ...(prev ?? {}), ...meta, ...patch } as LibraryStory;
    // Per-site data is merged, not replaced, by partial updates.
    if (prev?.ffn && meta.ffn) next.ffn = { ...prev.ffn, ...meta.ffn, ...patch.ffn };
    result = next;
    if (!keep(next)) {
      const { [key]: _drop, ...rest } = st.stories;
      persistStory(undefined, key);
      return { ...st, stories: rest };
    }
    persistStory(next, key);
    return { ...st, stories: { ...st.stories, [key]: next } };
  });
  return result;
}

export function patchStory(key: StoryKey, patch: Partial<LibraryStory> | ((s: LibraryStory) => Partial<LibraryStory>)) {
  libraryStore.set((st) => {
    const prev = st.stories[key];
    if (!prev) return st;
    const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
    if (!keep(next)) {
      const { [key]: _drop, ...rest } = st.stories;
      persistStory(undefined, key);
      return { ...st, stories: rest };
    }
    persistStory(next, key);
    return { ...st, stories: { ...st.stories, [key]: next } };
  });
}

/** A collection with new members; the legacy FanFiction.net id list follows along. */
function withKeys(c: Collection, storyKeys: StoryKey[]): Collection {
  return { ...c, storyKeys, storyIds: legacyStoryIds(storyKeys) };
}

export function removeStory(key: StoryKey) {
  libraryStore.set((st) => {
    const { [key]: _drop, ...rest } = st.stories;
    persistStory(undefined, key);
    return {
      ...st,
      stories: rest,
      collections: st.collections.map((c) => (c.storyKeys.includes(key) ? withKeys(c, c.storyKeys.filter((x) => x !== key)) : c)),
    };
  });
  persistCollections();
}

export function setInLibrary(src: AnyStory, inLibrary: boolean) {
  upsertStory(src, { inLibrary, knownChapters: libraryStore.get().stories[keyOf(src)]?.knownChapters ?? src.chapters });
}

/** Called whenever a chapter is opened in the reader. */
export function recordReading(src: StoryDetail | LibraryStory, chapter: number, progress: number) {
  const prev = libraryStore.get().stories[keyOf(src)];
  const read = new Set(prev?.readChapters ?? []);
  if (progress > 0.97) read.add(chapter);
  const chapterProgress = { ...(prev?.chapterProgress ?? {}), [chapter]: progress };
  const patch: Partial<LibraryStory> = {
    lastReadAt: Date.now(),
    lastChapter: chapter,
    lastProgress: progress,
    readChapters: [...read].sort((a, b) => a - b),
    chapterProgress,
    knownChapters: Math.max(prev?.knownChapters ?? 0, src.chapters),
  };
  upsertStory(src, patch);
}

export function markChapterRead(key: StoryKey, chapter: number, read: boolean) {
  patchStory(key, (s) => {
    const set = new Set(s.readChapters ?? []);
    if (read) set.add(chapter);
    else set.delete(chapter);
    return { readChapters: [...set].sort((a, b) => a - b) };
  });
}

export function markAllRead(key: StoryKey, read: boolean) {
  patchStory(key, (s) => ({
    readChapters: read ? Array.from({ length: s.chapters }, (_, i) => i + 1) : [],
    knownChapters: s.chapters,
  }));
}

export function acknowledgeUpdates(key: StoryKey) {
  patchStory(key, (s) => ({ knownChapters: s.chapters }));
}

export function newChapterCount(s: LibraryStory): number {
  return Math.max(0, s.chapters - (s.knownChapters ?? s.chapters));
}

export function unreadCount(s: LibraryStory): number {
  const read = s.readChapters?.length ?? 0;
  return Math.max(0, s.chapters - read);
}

export function storyProgress(s: LibraryStory): number {
  if (!s.chapters) return 0;
  const read = s.readChapters?.length ?? 0;
  return Math.min(1, read / s.chapters);
}

export function clearHistory() {
  libraryStore.set((st) => {
    const stories: Record<StoryKey, LibraryStory> = {};
    for (const s of Object.values(st.stories)) {
      const next = { ...s, lastReadAt: undefined };
      if (keep(next)) {
        stories[s.key] = next;
        persistStory(next, s.key);
      } else persistStory(undefined, s.key);
    }
    return { ...st, stories };
  });
}

// --- Account sync -------------------------------------------------------------------------

/**
 * Replaces the followed/favourited flags of one site's stories with what that site's account
 * has now. Other sites' stories are never touched.
 */
export function syncAccountList(source: SourceId, kind: 'followed' | 'favorited', stories: AnyStory[]) {
  const keys = new Set(stories.map(keyOf));
  for (const s of stories) {
    const prev = libraryStore.get().stories[keyOf(s)];
    upsertStory(s, { [kind]: true, knownChapters: prev?.knownChapters ?? s.chapters });
  }
  for (const s of Object.values(libraryStore.get().stories)) {
    if (s.source === source && s[kind] && !keys.has(s.key)) patchStory(s.key, { [kind]: false });
  }
}

/** An author as the library saves it. */
function savedAuthor(source: SourceId, user: { id: number | string; name: string; avatarUrl?: string }): SavedAuthor {
  const id = String(user.id);
  const out: SavedAuthor = { key: authorKey({ source, id }), source, id, name: user.name };
  if (user.avatarUrl) out.avatarUrl = user.avatarUrl;
  return out;
}

function persistAuthor(a: SavedAuthor | undefined, key: string) {
  if (!a) kv.delete(`author:${key}`).catch(() => {});
  else kv.set(`author:${key}`, a).catch(() => {});
}

/** Same as syncAccountList, for one site's followed / favourite authors. */
export function syncAuthors(source: SourceId, kind: 'followed' | 'favorited', users: UserRef[]) {
  libraryStore.set((st) => {
    const authors = { ...st.authors };
    const incoming = users.map((u) => savedAuthor(source, u));
    const keys = new Set(incoming.map((a) => a.key));
    for (const a of incoming) authors[a.key] = { ...authors[a.key], ...a, [kind]: true };
    for (const a of Object.values(authors)) {
      if (a.source === source && a[kind] && !keys.has(a.key)) authors[a.key] = { ...a, [kind]: false };
    }
    for (const a of Object.values(authors)) {
      if (!a.followed && !a.favorited) {
        delete authors[a.key];
        persistAuthor(undefined, a.key);
      } else persistAuthor(a, a.key);
    }
    return { ...st, authors };
  });
}

export function setAuthorFlag(source: SourceId, user: UserRef, kind: 'followed' | 'favorited', value: boolean) {
  libraryStore.set((st) => {
    const incoming = savedAuthor(source, user);
    const a: SavedAuthor = { ...st.authors[incoming.key], ...incoming, [kind]: value };
    const authors = { ...st.authors };
    if (!a.followed && !a.favorited) {
      delete authors[a.key];
      persistAuthor(undefined, a.key);
    } else {
      authors[a.key] = a;
      persistAuthor(a, a.key);
    }
    return { ...st, authors };
  });
}

export function setLastSync(t: number) {
  libraryStore.set((st) => ({ ...st, lastSync: t }));
  kv.set('lastSync', t).catch(() => {});
}

// --- Bookmarks -------------------------------------------------------------------------------

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function persistBookmarks() {
  kv.set('bookmarks', libraryStore.get().bookmarks).catch(() => {});
}

export function addBookmark(b: Omit<Bookmark, 'id' | 'createdAt' | 'storyId'>) {
  const [entry] = normalizeBookmarks([{ ...b, id: uid(), createdAt: Date.now() }]);
  libraryStore.set((st) => ({ ...st, bookmarks: [entry, ...st.bookmarks] }));
  persistBookmarks();
}

export function removeBookmark(id: string) {
  libraryStore.set((st) => ({ ...st, bookmarks: st.bookmarks.filter((b) => b.id !== id) }));
  persistBookmarks();
}

export function updateBookmarkNote(id: string, note: string) {
  libraryStore.set((st) => ({ ...st, bookmarks: st.bookmarks.map((b) => (b.id === id ? { ...b, note } : b)) }));
  persistBookmarks();
}

// --- Collections -----------------------------------------------------------------------------

function persistCollections() {
  kv.set('collections', libraryStore.get().collections).catch(() => {});
}

export function createCollection(name: string): Collection {
  const c: Collection = { id: uid(), name: name.trim() || 'Untitled', storyKeys: [], storyIds: [], createdAt: Date.now() };
  libraryStore.set((st) => ({ ...st, collections: [...st.collections, c] }));
  persistCollections();
  return c;
}

export function renameCollection(id: string, name: string) {
  libraryStore.set((st) => ({ ...st, collections: st.collections.map((c) => (c.id === id ? { ...c, name } : c)) }));
  persistCollections();
}

export function deleteCollection(id: string) {
  libraryStore.set((st) => ({ ...st, collections: st.collections.filter((c) => c.id !== id) }));
  persistCollections();
}

export function toggleInCollection(collectionId: string, story: AnyStory) {
  const key = keyOf(story);
  const inLib = libraryStore.get().stories[key];
  if (!inLib) upsertStory(story, { inLibrary: true, knownChapters: story.chapters });
  else if (!inLib.inLibrary) patchStory(key, { inLibrary: true });
  libraryStore.set((st) => ({
    ...st,
    collections: st.collections.map((c) =>
      c.id !== collectionId ? c : withKeys(c, c.storyKeys.includes(key) ? c.storyKeys.filter((x) => x !== key) : [...c.storyKeys, key]),
    ),
  }));
  persistCollections();
}

// --- Drafts ------------------------------------------------------------------------------------

function persistDrafts() {
  kv.set('drafts', libraryStore.get().drafts).catch(() => {});
}

export function saveDraft(d: Partial<Draft> & { id?: string }): Draft {
  const now = Date.now();
  let saved!: Draft;
  libraryStore.set((st) => {
    const prev = d.id ? st.drafts.find((x) => x.id === d.id) : undefined;
    saved = {
      id: prev?.id ?? uid(),
      title: d.title ?? prev?.title ?? '',
      body: d.body ?? prev?.body ?? '',
      tags: d.tags ?? prev?.tags ?? [],
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    return { ...st, drafts: [saved, ...st.drafts.filter((x) => x.id !== saved.id)] };
  });
  persistDrafts();
  return saved;
}

export function deleteDraft(id: string) {
  libraryStore.set((st) => ({ ...st, drafts: st.drafts.filter((d) => d.id !== id) }));
  persistDrafts();
}

// --- Recent searches -------------------------------------------------------------------------

export function addRecentSearch(source: SourceId, keywords: string, type: string) {
  const k = keywords.trim();
  if (!k) return;
  libraryStore.set((st) => ({
    ...st,
    searches: [
      { source, keywords: k, type, at: Date.now() },
      ...st.searches.filter((s) => !(s.source === source && s.keywords === k && s.type === type)),
    ].slice(0, 20),
  }));
  kv.set('searches', libraryStore.get().searches).catch(() => {});
}

export function clearRecentSearches() {
  libraryStore.set((st) => ({ ...st, searches: [] }));
  kv.set('searches', []).catch(() => {});
}

// --- Backup ------------------------------------------------------------------------------------

export const BACKUP_VERSION = 2;

export interface BackupFile {
  app: 'ficshelf';
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  stories: LibraryStory[];
  bookmarks: Bookmark[];
  collections: Collection[];
  authors: SavedAuthor[];
  drafts: Draft[];
}

export function exportBackup(): BackupFile {
  const st = libraryStore.get();
  return {
    app: 'ficshelf',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    stories: Object.values(st.stories).map((s) => ({ ...s, downloaded: false, downloadedChapters: [] })),
    bookmarks: st.bookmarks,
    collections: st.collections,
    authors: Object.values(st.authors),
    drafts: st.drafts,
  };
}

/**
 * Merges a backup into the current library; returns the number of stories imported. Takes v1
 * files (numeric FanFiction.net ids, read as 'ffn:' keys) as well as current ones.
 */
export function importBackup(data: unknown): number {
  const file = data as Partial<BackupFile> & { version?: number };
  if (file?.app !== 'ficshelf' || !Array.isArray(file.stories)) throw new Error('This is not a FicShelf backup file.');
  if ((file.version ?? 1) > BACKUP_VERSION) throw new Error('This backup is from a newer version of FicShelf. Update the app, then restore it.');
  let n = 0;
  libraryStore.set((st) => {
    const stories = { ...st.stories };
    for (const raw of file.stories as unknown[]) {
      const s = normalizeStory(raw);
      if (!s) continue;
      const prev = stories[s.key];
      const merged: LibraryStory = { ...s, ...prev, inLibrary: s.inLibrary || !!prev?.inLibrary };
      if (prev?.readChapters || s.readChapters) {
        merged.readChapters = [...new Set([...(prev?.readChapters ?? []), ...(s.readChapters ?? [])])].sort((a, b) => a - b);
      }
      const lastReadAt = Math.max(prev?.lastReadAt ?? 0, s.lastReadAt ?? 0);
      if (lastReadAt) merged.lastReadAt = lastReadAt;
      stories[s.key] = merged;
      persistStory(merged, s.key);
      n++;
    }
    const authors = { ...st.authors };
    for (const raw of Array.isArray(file.authors) ? (file.authors as unknown[]) : []) {
      const a = normalizeAuthor(raw);
      if (!a) continue;
      authors[a.key] = { ...a, ...authors[a.key] };
      persistAuthor(authors[a.key], a.key);
    }
    const collections = [...st.collections];
    for (const c of normalizeCollections(file.collections)) if (!collections.some((x) => x.id === c.id)) collections.push(c);
    const bookmarks = [...st.bookmarks];
    for (const b of normalizeBookmarks(file.bookmarks)) if (!bookmarks.some((x) => x.id === b.id)) bookmarks.push(b);
    const drafts = [...st.drafts];
    for (const d of Array.isArray(file.drafts) ? file.drafts : []) if (!drafts.some((x) => x.id === d.id)) drafts.push(d);
    return { ...st, stories, authors, collections, bookmarks, drafts };
  });
  persistCollections();
  persistDrafts();
  persistBookmarks();
  return n;
}
