// Local library: saved / followed / favourite / downloaded stories, reading progress, history,
// bookmarks, collections, authors, drafts and recent searches.

import { kv } from '../db/kv';
import type { StoryDetail, StorySummary, UserRef } from '../ffn/types';
import { createStore, useStore } from './store';

export interface LibraryStory {
  id: number;
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
  reviews: number;
  favs: number;
  follows: number;
  updated?: number;
  published?: number;
  complete: boolean;
  coverUrl?: string;
  chapterTitles?: string[];
  storyTextId?: number;

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
  storyId: number;
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
  storyIds: number[];
  createdAt: number;
}

export interface SavedAuthor extends UserRef {
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
  keywords: string;
  type: string;
  at: number;
}

interface LibraryState {
  stories: Record<number, LibraryStory>;
  bookmarks: Bookmark[];
  collections: Collection[];
  authors: Record<number, SavedAuthor>;
  drafts: Draft[];
  searches: RecentSearch[];
  lastSync?: number;
}

function load(): LibraryState {
  const stories: Record<number, LibraryStory> = {};
  const authors: Record<number, SavedAuthor> = {};
  try {
    for (const s of kv.prefixSync<LibraryStory>('story:')) stories[s.id] = s;
    for (const a of kv.prefixSync<SavedAuthor>('author:')) authors[a.id] = a;
    return {
      stories,
      authors,
      bookmarks: kv.getSync<Bookmark[]>('bookmarks') ?? [],
      collections: kv.getSync<Collection[]>('collections') ?? [],
      drafts: kv.getSync<Draft[]>('drafts') ?? [],
      searches: kv.getSync<RecentSearch[]>('searches') ?? [],
      lastSync: kv.getSync<number>('lastSync'),
    };
  } catch {
    return { stories, authors, bookmarks: [], collections: [], drafts: [], searches: [] };
  }
}

export const libraryStore = createStore<LibraryState>(load());

export function useLibrary<S>(selector: (s: LibraryState) => S): S {
  return useStore(libraryStore, selector);
}

export function useLibraryStory(id: number): LibraryStory | undefined {
  return useStore(libraryStore, (s) => s.stories[id]);
}

function persistStory(s: LibraryStory | undefined, id: number) {
  if (!s) kv.delete(`story:${id}`).catch(() => {});
  else kv.set(`story:${id}`, s).catch(() => {});
}

/** Whether a story record is worth keeping (otherwise it is dropped to keep storage small). */
function keep(s: LibraryStory): boolean {
  return s.inLibrary || !!s.followed || !!s.favorited || !!s.downloaded || !!s.lastReadAt;
}

function metaFrom(src: StorySummary | StoryDetail): Partial<LibraryStory> {
  const d = src as StoryDetail;
  const out: Partial<LibraryStory> = {
    id: src.id,
    title: src.title,
    summary: src.summary,
    fandom: src.fandom,
    isCrossover: src.isCrossover,
    rating: src.rating,
    language: src.language,
    genres: src.genres,
    characters: src.characters,
    chapters: src.chapters,
    words: src.words,
    reviews: src.reviews,
    favs: src.favs,
    follows: src.follows,
    updated: src.updated,
    published: src.published,
    complete: src.complete,
  };
  if (src.author?.id) out.author = src.author;
  if (src.coverUrl) out.coverUrl = src.coverUrl;
  if (d.chapterList?.length) out.chapterTitles = d.chapterList.map((c) => c.title);
  if (d.storyTextId && d.currentChapter === 1) out.storyTextId = d.storyTextId;
  // Drop undefined so partial list data doesn't wipe richer saved data.
  for (const k of Object.keys(out) as (keyof LibraryStory)[]) if (out[k] === undefined) delete out[k];
  if (!src.summary) delete out.summary;
  return out;
}

export function upsertStory(
  src: StorySummary | StoryDetail,
  patch: Partial<LibraryStory> = {},
  opts: { create?: boolean } = { create: true },
): LibraryStory | undefined {
  let result: LibraryStory | undefined;
  libraryStore.set((st) => {
    const prev = st.stories[src.id];
    if (!prev && !opts.create) return st;
    const defaults = { genres: [] as string[], summary: '', inLibrary: false, addedAt: Date.now() };
    const next = { ...defaults, ...(prev ?? {}), ...metaFrom(src), ...patch } as LibraryStory;
    result = next;
    if (!keep(next)) {
      const { [src.id]: _drop, ...rest } = st.stories;
      persistStory(undefined, src.id);
      return { ...st, stories: rest };
    }
    persistStory(next, src.id);
    return { ...st, stories: { ...st.stories, [src.id]: next } };
  });
  return result;
}

export function patchStory(id: number, patch: Partial<LibraryStory> | ((s: LibraryStory) => Partial<LibraryStory>)) {
  libraryStore.set((st) => {
    const prev = st.stories[id];
    if (!prev) return st;
    const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
    if (!keep(next)) {
      const { [id]: _drop, ...rest } = st.stories;
      persistStory(undefined, id);
      return { ...st, stories: rest };
    }
    persistStory(next, id);
    return { ...st, stories: { ...st.stories, [id]: next } };
  });
}

export function removeStory(id: number) {
  libraryStore.set((st) => {
    const { [id]: _drop, ...rest } = st.stories;
    persistStory(undefined, id);
    return {
      ...st,
      stories: rest,
      collections: st.collections.map((c) => ({ ...c, storyIds: c.storyIds.filter((x) => x !== id) })),
    };
  });
  persistCollections();
}

export function setInLibrary(src: StorySummary | StoryDetail, inLibrary: boolean) {
  upsertStory(src, { inLibrary, knownChapters: libraryStore.get().stories[src.id]?.knownChapters ?? src.chapters });
}

/** Called whenever a chapter is opened in the reader. */
export function recordReading(src: StoryDetail | LibraryStory, chapter: number, progress: number) {
  const prev = libraryStore.get().stories[src.id];
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
  upsertStory(src as StoryDetail, patch);
}

export function markChapterRead(id: number, chapter: number, read: boolean) {
  patchStory(id, (s) => {
    const set = new Set(s.readChapters ?? []);
    if (read) set.add(chapter);
    else set.delete(chapter);
    return { readChapters: [...set].sort((a, b) => a - b) };
  });
}

export function markAllRead(id: number, read: boolean) {
  patchStory(id, (s) => ({
    readChapters: read ? Array.from({ length: s.chapters }, (_, i) => i + 1) : [],
    knownChapters: s.chapters,
  }));
}

export function acknowledgeUpdates(id: number) {
  patchStory(id, (s) => ({ knownChapters: s.chapters }));
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
    const stories: Record<number, LibraryStory> = {};
    for (const s of Object.values(st.stories)) {
      const next = { ...s, lastReadAt: undefined };
      if (keep(next)) {
        stories[s.id] = next;
        persistStory(next, s.id);
      } else persistStory(undefined, s.id);
    }
    return { ...st, stories };
  });
}

// --- Account sync -------------------------------------------------------------------------

/** Replaces the followed/favourited flags with what the account currently has. */
export function syncAccountList(kind: 'followed' | 'favorited', stories: StorySummary[]) {
  const ids = new Set(stories.map((s) => s.id));
  for (const s of stories) {
    const prev = libraryStore.get().stories[s.id];
    upsertStory(s, { [kind]: true, knownChapters: prev?.knownChapters ?? s.chapters });
  }
  for (const s of Object.values(libraryStore.get().stories)) {
    if (s[kind] && !ids.has(s.id)) patchStory(s.id, { [kind]: false });
  }
}

export function syncAuthors(kind: 'followed' | 'favorited', users: UserRef[]) {
  libraryStore.set((st) => {
    const authors = { ...st.authors };
    const ids = new Set(users.map((u) => u.id));
    for (const u of users) authors[u.id] = { ...authors[u.id], ...u, [kind]: true };
    for (const a of Object.values(authors)) {
      if (a[kind] && !ids.has(a.id)) authors[a.id] = { ...a, [kind]: false };
    }
    for (const a of Object.values(authors)) {
      if (!a.followed && !a.favorited) {
        delete authors[a.id];
        kv.delete(`author:${a.id}`).catch(() => {});
      } else kv.set(`author:${a.id}`, a).catch(() => {});
    }
    return { ...st, authors };
  });
}

export function setAuthorFlag(user: UserRef, kind: 'followed' | 'favorited', value: boolean) {
  libraryStore.set((st) => {
    const a: SavedAuthor = { ...st.authors[user.id], ...user, [kind]: value };
    const authors = { ...st.authors };
    if (!a.followed && !a.favorited) {
      delete authors[user.id];
      kv.delete(`author:${user.id}`).catch(() => {});
    } else {
      authors[user.id] = a;
      kv.set(`author:${user.id}`, a).catch(() => {});
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

export function addBookmark(b: Omit<Bookmark, 'id' | 'createdAt'>) {
  libraryStore.set((st) => ({ ...st, bookmarks: [{ ...b, id: uid(), createdAt: Date.now() }, ...st.bookmarks] }));
  kv.set('bookmarks', libraryStore.get().bookmarks).catch(() => {});
}

export function removeBookmark(id: string) {
  libraryStore.set((st) => ({ ...st, bookmarks: st.bookmarks.filter((b) => b.id !== id) }));
  kv.set('bookmarks', libraryStore.get().bookmarks).catch(() => {});
}

export function updateBookmarkNote(id: string, note: string) {
  libraryStore.set((st) => ({ ...st, bookmarks: st.bookmarks.map((b) => (b.id === id ? { ...b, note } : b)) }));
  kv.set('bookmarks', libraryStore.get().bookmarks).catch(() => {});
}

// --- Collections -----------------------------------------------------------------------------

function persistCollections() {
  kv.set('collections', libraryStore.get().collections).catch(() => {});
}

export function createCollection(name: string): Collection {
  const c: Collection = { id: uid(), name: name.trim() || 'Untitled', storyIds: [], createdAt: Date.now() };
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

export function toggleInCollection(collectionId: string, story: StorySummary | StoryDetail | LibraryStory) {
  const inLib = libraryStore.get().stories[story.id];
  if (!inLib) upsertStory(story as StorySummary, { inLibrary: true, knownChapters: story.chapters });
  else if (!inLib.inLibrary) patchStory(story.id, { inLibrary: true });
  libraryStore.set((st) => ({
    ...st,
    collections: st.collections.map((c) =>
      c.id !== collectionId
        ? c
        : { ...c, storyIds: c.storyIds.includes(story.id) ? c.storyIds.filter((x) => x !== story.id) : [...c.storyIds, story.id] },
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

export function addRecentSearch(keywords: string, type: string) {
  const k = keywords.trim();
  if (!k) return;
  libraryStore.set((st) => ({
    ...st,
    searches: [{ keywords: k, type, at: Date.now() }, ...st.searches.filter((s) => !(s.keywords === k && s.type === type))].slice(0, 20),
  }));
  kv.set('searches', libraryStore.get().searches).catch(() => {});
}

export function clearRecentSearches() {
  libraryStore.set((st) => ({ ...st, searches: [] }));
  kv.set('searches', []).catch(() => {});
}

// --- Backup ------------------------------------------------------------------------------------

export interface BackupFile {
  app: 'ficshelf';
  version: 1;
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
    version: 1,
    exportedAt: Date.now(),
    stories: Object.values(st.stories).map((s) => ({ ...s, downloaded: false, downloadedChapters: [] })),
    bookmarks: st.bookmarks,
    collections: st.collections,
    authors: Object.values(st.authors),
    drafts: st.drafts,
  };
}

/** Merges a backup into the current library; returns the number of stories imported. */
export function importBackup(data: BackupFile): number {
  if (data?.app !== 'ficshelf' || !Array.isArray(data.stories)) throw new Error('This is not a FicShelf backup file.');
  let n = 0;
  libraryStore.set((st) => {
    const stories = { ...st.stories };
    for (const s of data.stories) {
      const prev = stories[s.id];
      const merged: LibraryStory = {
        ...s,
        ...prev,
        inLibrary: s.inLibrary || !!prev?.inLibrary,
        readChapters: [...new Set([...(prev?.readChapters ?? []), ...(s.readChapters ?? [])])].sort((a, b) => a - b),
        lastReadAt: Math.max(prev?.lastReadAt ?? 0, s.lastReadAt ?? 0) || undefined,
      };
      stories[s.id] = merged;
      persistStory(merged, s.id);
      n++;
    }
    const authors = { ...st.authors };
    for (const a of data.authors ?? []) {
      authors[a.id] = { ...a, ...authors[a.id] };
      kv.set(`author:${a.id}`, authors[a.id]).catch(() => {});
    }
    const collections = [...st.collections];
    for (const c of data.collections ?? []) if (!collections.some((x) => x.id === c.id)) collections.push(c);
    const bookmarks = [...st.bookmarks];
    for (const b of data.bookmarks ?? []) if (!bookmarks.some((x) => x.id === b.id)) bookmarks.push(b);
    const drafts = [...st.drafts];
    for (const d of data.drafts ?? []) if (!drafts.some((x) => x.id === d.id)) drafts.push(d);
    return { ...st, stories, authors, collections, bookmarks, drafts };
  });
  persistCollections();
  persistDrafts();
  kv.set('bookmarks', libraryStore.get().bookmarks).catch(() => {});
  return n;
}
