// Imported files in the library: a parsed book (src/import) stored as a local story, or as the
// offline copy of the AO3 / FanFiction.net story it came from ("linked"); spotting a file that's
// already in the library; and deleting an imported story with everything kept for it.
//
// A local story is 'local:<uid>', always "downloaded", never checked for updates. Its chapters are
// saved like downloaded chapters (chapter_text, in batches) and its files go to its folder under
// Documents/imports (see importFiles.ts). Nothing is stored until the whole book is: a failed or
// cancelled import leaves no story behind, and a failed replacement leaves the old one as it was.

import { File } from 'expo-file-system';
import * as player from '../audio/player';
import { playerStore } from '../audio/state';
import { chapterStore, kv } from '../db/kv';
import { invalidate } from '../hooks/useQuery';
import { detectOrigin } from '../import/detect';
import type { ImportedBook, ImportOrigin } from '../import/types';
import { SOURCE_NAMES, toKey, type StoryKey } from '../sources/keys';
import { getSource } from '../sources/registry';
import { remapStoryState, type ChapterRemap } from '../sources/remap';
import type { Tag } from '../sources/types';
import {
  libraryStore,
  patchStory,
  remapStoryBookmarks,
  removeBookmarksOf,
  removeStory,
  upsertStory,
  type LibraryAuthor,
  type LibraryStory,
  type LocalOrigin,
} from '../state/library';
import { settingsStore } from '../state/settings';
import { announceRemap } from './chapterIds';
import { fetchStory } from './chapters';
import { dropStaged, importDirPath, removeImportFiles, storyFileRef, swapInStaged, writeBookFiles, writing } from './importFiles';

/** The picked or opened file a book was read from. */
export interface ImportFile {
  name: string;
  size: number;
  /** See contentHash(). */
  contentHash: string;
  /** Where the file is now, to keep a copy of it (original.<kind>). */
  uri?: string;
}

// --- identity -----------------------------------------------------------------------------

/** A key for a new local story: 'local:<time><random>', base 36. */
export function newLocalKey(): StoryKey {
  return toKey('local', Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
}

/** FNV-1a over the bytes, two 32-bit lanes: the fallback where the system can't hash the file. */
function fnvHash(bytes: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193);
    b = Math.imul(b ^ bytes[i] ^ (i & 0xff), 0x01000193);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/**
 * A file's fingerprint, for spotting the same file imported twice: the system's MD5 of the file
 * (fast, outside JavaScript) when it can, else a hash of the bytes.
 */
export function contentHash(bytes: Uint8Array, uri?: string): string {
  if (uri) {
    try {
      const md5 = new File(uri).md5;
      if (md5) return `md5:${md5}`;
    } catch {
      // Hash the bytes instead.
    }
  }
  return `fnv:${fnvHash(bytes)}`;
}

/**
 * A story page's address in one spelling: the site's story key when it's a site the app knows
 * (any AO3 work link is that work), else the address without scheme, www., trailing slash or #.
 */
export function normalizeSourceUrl(url: string | undefined): string | undefined {
  const s = url?.trim();
  if (!s) return undefined;
  const origin = detectOrigin(s);
  if (origin) return origin.key;
  return s
    .replace(/#.*$/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^(www|m)\./i, '')
    .replace(/\/+(\?|$)/, '$1')
    .toLowerCase();
}

export interface DuplicateMatch {
  story: LibraryStory;
  /** How it was recognised: the same story page, the same book id, or the same file. */
  by: 'url' | 'identifier' | 'hash';
}

/**
 * A local story this file is already in the library as: the same story page first, then one of
 * the book's own ids (FanFicFare, FicHub, Calibre), then the very same file.
 */
export function findDuplicate(book: Pick<ImportedBook, 'sourceUrl' | 'identifiers'>, hash: string): DuplicateMatch | undefined {
  const local = Object.values(libraryStore.get().stories).filter((s) => s.source === 'local' && s.local);
  const url = normalizeSourceUrl(book.sourceUrl);
  const byUrl = url && local.find((s) => normalizeSourceUrl(s.local!.sourceUrl) === url);
  if (byUrl) return { story: byUrl, by: 'url' };
  const ids = new Set((book.identifiers ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));
  const byId = ids.size ? local.find((s) => s.local!.identifiers?.some((x) => ids.has(x.trim().toLowerCase()))) : undefined;
  if (byId) return { story: byId, by: 'identifier' };
  const byHash = hash ? local.find((s) => s.local!.contentHash === hash) : undefined;
  return byHash ? { story: byHash, by: 'hash' } : undefined;
}

// --- linking --------------------------------------------------------------------------------

/** "AO3 work 25253053", "FanFiction.net story 123", "Wattpad story 5". */
export function originLabel(o: ImportOrigin): string {
  return `${SOURCE_NAMES[o.source]} ${o.source === 'ao3' ? 'work' : 'story'} ${o.remoteId}`;
}

export interface LinkChoice {
  origin: ImportOrigin & { source: 'ao3' | 'ffn' };
  /** "AO3 work 25253053". */
  label: string;
  /** The site's name: "AO3". */
  site: string;
  /** The story, when it's in the library already (linking merges into it). */
  existing?: LibraryStory;
  /** Linking is the default: the library doesn't know the story, or knows the same chapter count. */
  suggested: boolean;
}

/**
 * Whether the file can be linked to its online story: one on AO3 or FanFiction.net (switched on).
 * Wattpad files stay local stories for now (their link is kept).
 */
export function linkChoice(book: Pick<ImportedBook, 'origin' | 'chapters'>): LinkChoice | undefined {
  const o = book.origin;
  if (!o || (o.source !== 'ao3' && o.source !== 'ffn') || !getSource(o.source).enabled()) return undefined;
  const existing = libraryStore.get().stories[o.key];
  return {
    origin: o as LinkChoice['origin'],
    label: originLabel(o),
    site: getSource(o.source).name,
    existing,
    suggested: !existing?.chapters || existing.chapters === book.chapters.length,
  };
}

// --- storing ----------------------------------------------------------------------------------

export interface CommitOptions {
  /** 'local': a story of its own; 'link': the offline copy of the AO3 / FanFiction.net story it came from. */
  mode: 'local' | 'link';
  /** Local: replace this local story's text and files, keeping its reading progress and bookmarks. */
  replace?: StoryKey;
  /** The title and authors as the user edited them (local stories). */
  title?: string;
  authors?: string[];
  /** Keep a copy of the file (default: Settings → Imported files). */
  keepOriginal?: boolean;
  /** Chapters saved so far, of all. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Settings → Imported files → Keep original files (on unless turned off). */
export function keepOriginals(): boolean {
  return settingsStore.get().sources.local?.keepOriginals !== false;
}

const sec = (ms: number | undefined) => (ms ? Math.round(ms / 1000) : undefined);
const tagLabels = (tags: Tag[] | undefined, kind: Tag['kind']) => (tags ?? []).filter((t) => t.kind === kind).map((t) => t.label);

function authorsOf(names: string[]): { author?: LibraryAuthor; coAuthors?: LibraryAuthor[] } {
  const [first, ...rest] = names.map((n) => n.trim()).filter(Boolean);
  return { author: first ? { id: '', name: first } : undefined, coAuthors: rest.length ? rest.map((name) => ({ id: '', name })) : undefined };
}

/** The story metadata a file gives (the fields a replacement resets, so they're all named). */
function metaFromBook(book: ImportedBook, o: Pick<CommitOptions, 'title' | 'authors'> = {}): Partial<LibraryStory> {
  const fandoms = tagLabels(book.tags, 'fandom');
  const characters = tagLabels(book.tags, 'character');
  return {
    title: o.title?.trim() || book.title,
    ...authorsOf(o.authors ?? book.authors),
    summary: book.summary ?? '',
    fandom: fandoms.length ? fandoms.join(', ') : undefined,
    fandoms: fandoms.length ? fandoms : undefined,
    isCrossover: fandoms.length > 1 ? true : undefined,
    rating: book.rating,
    language: book.language,
    genres: tagLabels(book.tags, 'genre'),
    characters: characters.length ? characters.join(', ') : undefined,
    tags: book.tags,
    chapters: book.chapters.length,
    chapterTitles: book.chapters.map((c) => c.title),
    words: book.words,
    published: sec(book.published),
    updated: sec(book.updated),
  };
}

function fileRecord(key: StoryKey, book: ImportedBook, file: ImportFile, files: Pick<LocalOrigin, 'original' | 'cover' | 'images'>): LocalOrigin {
  const out: LocalOrigin = {
    kind: book.kind,
    fileName: file.name,
    importedAt: Date.now(),
    size: file.size,
    contentHash: file.contentHash,
    dir: importDirPath(key),
    images: files.images ?? {},
  };
  if (book.generator) out.generator = book.generator;
  if (book.sourceUrl) out.sourceUrl = book.sourceUrl;
  if (book.origin) out.origin = book.origin;
  if (book.identifiers?.length) out.identifiers = book.identifiers;
  if (files.original) out.original = files.original;
  if (files.cover) out.cover = files.cover;
  return out;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const cancelled = () => Object.assign(new Error('The import was cancelled.'), { name: 'AbortError' });

/**
 * Where each chapter of the story being replaced is in the new file: the chapter with the same
 * title, else the one at the same position (reading progress and bookmarks follow it).
 */
export function mapChaptersByTitle(oldTitles: readonly string[], oldCount: number, newTitles: readonly string[]): ChapterRemap {
  const norm = (t: string | undefined) => (t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const byTitle = new Map<string, number[]>();
  newTitles.forEach((t, i) => {
    const k = norm(t);
    if (k) byTitle.set(k, [...(byTitle.get(k) ?? []), i + 1]);
  });
  const moves: Record<number, number> = {};
  const used = new Set<number>();
  for (let n = 1; n <= oldCount; n++) {
    const hit = byTitle.get(norm(oldTitles[n - 1]))?.find((m) => !used.has(m));
    if (hit != null) {
      moves[n] = hit;
      used.add(hit);
    }
  }
  const removed: number[] = [];
  for (let n = 1; n <= oldCount; n++) {
    if (moves[n] != null) continue;
    if (n <= newTitles.length && !used.has(n)) {
      moves[n] = n;
      used.add(n);
    } else removed.push(n);
  }
  const changed = removed.length > 0 || Object.entries(moves).some(([from, to]) => Number(from) !== to);
  return { moves, removed, changed };
}

/**
 * Stores a parsed book. Local: a new story (or the replacement of one, `replace`); linked: the
 * offline copy of its AO3 / FanFiction.net story, merged into that story when it's in the library
 * already (its progress, bookmarks and collections stay; chapters it has saved are kept). Returns
 * the story's key. Throws (and stores nothing) when it fails or is cancelled.
 */
export async function commitImport(book: ImportedBook, file: ImportFile, o: CommitOptions): Promise<StoryKey> {
  if (!kv.writable) throw new Error('Nothing can be saved right now: the storage upgrade didn’t finish.');
  const key = await (o.mode === 'link' ? commitLinked(book, file, o) : commitLocal(book, file, o));
  // The story page shows what's stored now (a linked story's page asks its site afresh).
  invalidate(`story:${key}`);
  return key;
}

async function commitLocal(book: ImportedBook, file: ImportFile, o: CommitOptions): Promise<StoryKey> {
  const old = o.replace ? libraryStore.get().stories[o.replace] : undefined;
  if (o.replace && (!old || old.source !== 'local')) throw new Error('The story to replace isn’t in your library any more.');
  const key = old?.key ?? newLocalKey();
  const keep = o.keepOriginal ?? keepOriginals();
  writing.add(key);
  let files;
  try {
    files = await writeBookFiles(key, book, { originalUri: keep ? file.uri : undefined, staging: !!old });
    if (o.signal?.aborted) throw cancelled();
    await chapterStore.putMany(
      key,
      book.chapters.map((c, i) => ({ number: i + 1, html: c.html })),
      { replace: !!old, onProgress: o.onProgress, signal: o.signal },
    );
    if (old) swapInStaged(key);
  } catch (e) {
    if (old) dropStaged(key);
    else {
      removeImportFiles(key);
      await chapterStore.remove(key).catch(() => {});
    }
    throw e;
  } finally {
    writing.delete(key);
  }

  const n = book.chapters.length;
  const record: Partial<LibraryStory> = {
    ...metaFromBook(book, o),
    key,
    source: 'local',
    remoteId: key.slice('local:'.length),
    stats: {},
    // Never checked for updates; "In progress" only when the file says so.
    complete: book.complete !== false,
    notify: false,
    inLibrary: true,
    downloaded: true,
    downloadedChapters: range(n),
    knownChapters: n,
    coverUrl: files.cover ? storyFileRef(key, files.cover) : undefined,
    local: fileRecord(key, book, file, files),
  };
  if (!old) {
    upsertStory(record as LibraryStory, record);
    return key;
  }
  // The replaced story keeps its place: progress and bookmarks follow their chapters.
  const r = mapChaptersByTitle(old.chapterTitles ?? [], old.chapters, record.chapterTitles ?? []);
  patchStory(key, (s) => ({ ...record, ...remapStoryState(s, r), downloadedChapters: range(n), knownChapters: n }));
  remapStoryBookmarks(key, r);
  announceRemap(key, r);
  return key;
}

async function commitLinked(book: ImportedBook, file: ImportFile, o: CommitOptions): Promise<StoryKey> {
  const choice = linkChoice(book);
  if (!choice) throw new Error('This file can’t be linked to a story FicShelf reads.');
  const { key, source, remoteId } = choice.origin;
  const prev = libraryStore.get().stories[key];
  const keep = o.keepOriginal ?? keepOriginals();
  // Pictures of an earlier import of this story stay (chapters saved from it may show them): this
  // file's are numbered after them.
  const known = Object.keys(prev?.local?.images ?? {}).map(Number);
  const offset = known.length ? Math.max(...known) + 1 : 0;
  const shift = (html: string) => (offset ? html.replace(/ficshelf-img:(\d{1,6})/g, (_m, n: string) => `ficshelf-img:${Number(n) + offset}`) : html);
  // Chapters the story has saved already are kept; the file fills in the rest.
  const have = new Set(await chapterStore.list(key));
  const rows = book.chapters.map((c, i) => ({ number: i + 1, html: shift(c.html) })).filter((r) => !have.has(r.number));
  writing.add(key);
  let files;
  try {
    files = await writeBookFiles(key, book, { originalUri: keep ? file.uri : undefined, offset, previous: prev?.local });
    if (o.signal?.aborted) throw cancelled();
    await chapterStore.putMany(key, rows, { onProgress: o.onProgress, signal: o.signal });
  } catch (e) {
    if (!prev) {
      removeImportFiles(key);
      await chapterStore.remove(key).catch(() => {});
    }
    throw e;
  } finally {
    writing.delete(key);
  }

  const n = book.chapters.length;
  const local = fileRecord(key, book, file, { ...files, images: { ...prev?.local?.images, ...files.images } });
  // An earlier import's original and cover stay when this file doesn't bring its own.
  if (!files.original && prev?.local?.original) local.original = prev.local.original;
  if (!files.cover && prev?.local?.cover) local.cover = prev.local.cover;
  const cover = files.cover ? storyFileRef(key, files.cover) : undefined;
  const downloadedChapters = await chapterStore.list(key);
  if (prev) {
    const titles = prev.chapterTitles ?? [];
    upsertStory(prev, {
      inLibrary: true,
      downloaded: true,
      downloadedChapters,
      chapters: Math.max(prev.chapters, n),
      chapterTitles: range(Math.max(prev.chapters, n)).map((i) => titles[i - 1] ?? book.chapters[i - 1]?.title ?? `Chapter ${i}`),
      ...(!prev.coverUrl && cover ? { coverUrl: cover } : {}),
      local,
    });
    return key;
  }
  // Not in the library yet: the file's details until the site is asked (refreshLinkedStory, or
  // opening the story page).
  const record: Partial<LibraryStory> = {
    ...metaFromBook(book),
    key,
    source,
    remoteId,
    stats: {},
    complete: !!book.complete,
    inLibrary: true,
    downloaded: true,
    downloadedChapters,
    knownChapters: n,
    coverUrl: cover,
    local,
  };
  upsertStory(record as LibraryStory, record);
  return key;
}

/**
 * Asks the story's site once for its current details (chapter ids, stats) after a linked import.
 * Something the user just did, so it goes through the site's client like opening the story page
 * would (AO3's spacing and rules apply). Offline, restricted or gone: the file's details stay.
 */
export async function refreshLinkedStory(key: StoryKey): Promise<boolean> {
  try {
    const info = await fetchStory(key, { priority: 'user' });
    upsertStory(info, {}, { create: false });
    return true;
  } catch {
    return false;
  }
}

// --- deleting ---------------------------------------------------------------------------------

/**
 * Deletes an imported story: the audiobook stops if it's reading it, then its listening position,
 * bookmarks, library record (and collection entries), saved chapters and folder go.
 */
export async function deleteImportedStory(key: StoryKey) {
  // Stopping records the listening progress, so the record goes after.
  if (playerStore.get().story?.key === key) player.stop();
  player.forgetListenPosition(key);
  removeBookmarksOf(key);
  removeStory(key);
  await chapterStore.remove(key);
  removeImportFiles(key);
  invalidate(`story:${key}`);
}
