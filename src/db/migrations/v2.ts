// Storage v2: every story keyed by source ('story:ffn:123' instead of 'story:123'), chapters in
// `chapter_text` keyed by story key, and every list that names a story carrying the key.
//
// The transforms are pure and idempotent, so the same functions migrate v1 data, merge rows an
// older build writes after the upgrade, import v1 backups, and normalise blobs when they're read.

import type { Bookmark, Collection, LibraryStory, RecentSearch, SavedAuthor } from '../../state/library';
import type { PinnedFandom } from '../../state/settings';
import { authorKey, isSourceId, isStoryKey, normalizeKey, splitKey, type SourceId, type StoryKey } from '../../sources/keys';
import type { MigrationCounts, MigrationEnv, MigrationResult, SyncDb } from './index';

// --- v1 shapes --------------------------------------------------------------------------------

/** A v1 library story: numeric FanFiction.net id, FFN stats and review id at the top level. */
export type V1Story = Omit<LibraryStory, 'key' | 'source' | 'remoteId' | 'stats' | 'ffn'> & {
  id: number;
  reviews?: number;
  favs?: number;
  follows?: number;
  storyTextId?: number;
};

export interface V1Author {
  id: number;
  name: string;
  avatarUrl?: string;
  followed?: boolean;
  favorited?: boolean;
  storyCount?: number;
}

export type Position = { chapter: number; index: number; at: number };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

/** Drops undefined values (JSON would anyway), so records compare and merge cleanly. */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

const numbers = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number') : []);
const union = (a: unknown, b: unknown) => [...new Set([...numbers(a), ...numbers(b)])].sort((x, y) => x - y);
const maxOf = (a?: number, b?: number) => (a == null ? b : b == null ? a : Math.max(a, b));
const minOf = (a?: number, b?: number) => (a == null ? b : b == null ? a : Math.min(a, b));

// --- stories ----------------------------------------------------------------------------------

/**
 * Any stored story record (v1, v2, or a v2 row an older build rewrote) as a v2 record. `key` is
 * where the record lives; without it the record's own key or v1 id decides. Unknown fields are
 * kept, so nothing is lost.
 */
export function normalizeStory(raw: unknown, key?: StoryKey): LibraryStory | null {
  if (!isObj(raw)) return null;
  const { id, reviews, favs, follows, storyTextId, ...rest } = raw;
  const k = key ?? (isStoryKey(rest.key) ? rest.key : normalizeKey(id));
  if (!k) return null;
  const { source, remoteId } = splitKey(k);
  // Top-level FFN fields next to v2 ones can only come from an older build rewriting the record
  // after the upgrade, so they're the newer values.
  const stats = { ...(isObj(rest.stats) ? rest.stats : {}), ...numbersOnly({ reviews, favs, follows }) };
  const ffn = source === 'ffn' && typeof storyTextId === 'number' && storyTextId > 0 ? { ...(isObj(rest.ffn) ? rest.ffn : {}), storyTextId } : rest.ffn;
  return compact({
    ...rest,
    genres: Array.isArray(rest.genres) ? rest.genres : [],
    summary: typeof rest.summary === 'string' ? rest.summary : '',
    key: k,
    source,
    remoteId,
    stats,
    ffn,
    // An older build installed again keys stories by this, so FanFiction.net records keep it.
    id: source === 'ffn' ? Number(remoteId) : undefined,
  }) as unknown as LibraryStory;
}

function numbersOnly(o: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'number') out[k] = v;
  return out;
}

export function storyV1toV2(s: V1Story): LibraryStory {
  const out = normalizeStory(s);
  if (!out) throw new Error(`Story record without a valid id (${JSON.stringify((s as { id?: unknown }).id)})`);
  return out;
}

/**
 * Two records of the same story (the v2 one and one an older build wrote, or a backup's):
 * nothing either knows is dropped. Read chapters and downloads are united; counts and times take
 * the larger value; position comes from whichever was read last; metadata from whichever was
 * checked last; flags are OR'ed (a snoozed story stays snoozed).
 */
export function mergeStory(cur: LibraryStory, other: LibraryStory): LibraryStory {
  const metaNewer = (other.lastCheckedAt ?? 0) > (cur.lastCheckedAt ?? 0);
  const [metaWin, metaLose] = metaNewer ? [other, cur] : [cur, other];
  const readNewer = (other.lastReadAt ?? 0) > (cur.lastReadAt ?? 0);
  const [readWin, readLose] = readNewer ? [other, cur] : [cur, other];
  const out: LibraryStory = {
    ...metaLose,
    ...metaWin,
    key: cur.key,
    source: cur.source,
    remoteId: cur.remoteId,
    stats: { ...metaLose.stats, ...metaWin.stats },
    ffn: metaLose.ffn || metaWin.ffn ? { ...metaLose.ffn, ...metaWin.ffn } : undefined,
    chapters: Math.max(cur.chapters ?? 0, other.chapters ?? 0),
    knownChapters: maxOf(cur.knownChapters, other.knownChapters),
    lastCheckedAt: maxOf(cur.lastCheckedAt, other.lastCheckedAt),
    addedAt: minOf(cur.addedAt, other.addedAt) ?? Date.now(),
    lastReadAt: maxOf(cur.lastReadAt, other.lastReadAt),
    lastChapter: readWin.lastChapter ?? readLose.lastChapter,
    lastProgress: readWin.lastProgress ?? readLose.lastProgress,
    chapterProgress:
      cur.chapterProgress || other.chapterProgress ? { ...readLose.chapterProgress, ...readWin.chapterProgress } : undefined,
    readChapters: cur.readChapters || other.readChapters ? union(cur.readChapters, other.readChapters) : undefined,
    downloadedChapters: cur.downloadedChapters || other.downloadedChapters ? union(cur.downloadedChapters, other.downloadedChapters) : undefined,
    inLibrary: !!(cur.inLibrary || other.inLibrary),
    followed: cur.followed || other.followed || undefined,
    favorited: cur.favorited || other.favorited || undefined,
    downloaded: cur.downloaded || other.downloaded || undefined,
    notify: cur.notify === false || other.notify === false ? false : (metaWin.notify ?? metaLose.notify),
  };
  return compact(out);
}

// --- authors ----------------------------------------------------------------------------------

/** 'author:501' (v1) and 'author:ffn:501' (v2) both name the FFN author 501. */
export function authorKeyFromKv(rest: string): string | null {
  if (/^\d{1,15}$/.test(rest)) return authorKey({ source: 'ffn', id: rest });
  const i = rest.indexOf(':');
  return i > 0 && isSourceId(rest.slice(0, i)) && rest.length > i + 1 ? rest : null;
}

export function normalizeAuthor(raw: unknown, key?: string): SavedAuthor | null {
  if (!isObj(raw)) return null;
  const k = key ?? (typeof raw.key === 'string' ? raw.key : raw.id != null ? authorKey({ source: isSourceId(raw.source) ? raw.source : 'ffn', id: String(raw.id) }) : null);
  if (!k) return null;
  const i = k.indexOf(':');
  const source = k.slice(0, i) as SourceId;
  return compact({ ...raw, name: typeof raw.name === 'string' ? raw.name : '', key: k, source, id: k.slice(i + 1) }) as unknown as SavedAuthor;
}

export function authorV1toV2(a: V1Author): SavedAuthor {
  const out = normalizeAuthor(a);
  if (!out) throw new Error('Author record without an id');
  return out;
}

export function mergeAuthor(cur: SavedAuthor, other: SavedAuthor): SavedAuthor {
  return compact({
    ...other,
    ...cur,
    followed: cur.followed || other.followed || undefined,
    favorited: cur.favorited || other.favorited || undefined,
    storyCount: maxOf(cur.storyCount, other.storyCount),
  });
}

// --- lists ------------------------------------------------------------------------------------

/** FanFiction.net keys also keep their numeric id in the legacy field, so older builds still work. */
const legacyId = (key: StoryKey) => (key.startsWith('ffn:') ? Number(splitKey(key).remoteId) : undefined);

/** The legacy `storyIds` of a collection: its FanFiction.net members, in order. */
export function legacyStoryIds(keys: StoryKey[]): number[] {
  return keys.map(legacyId).filter((n): n is number => n != null);
}

/** Bookmarks get `storyKey`; FFN ones keep `storyId`. Entries naming no story are dropped. */
export function bookmarksV2(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return [];
  const out: Bookmark[] = [];
  for (const b of raw) {
    if (!isObj(b)) continue;
    // An older build only knows `storyId`, so for FanFiction.net it decides.
    const fromId = normalizeKey(b.storyId);
    const fromKey = isStoryKey(b.storyKey) ? b.storyKey : null;
    const storyKey = fromKey && (!fromKey.startsWith('ffn:') || !fromId) ? fromKey : fromId;
    if (!storyKey) continue;
    out.push(compact({ ...b, storyKey, storyId: legacyId(storyKey) }) as unknown as Bookmark);
  }
  return out;
}

/**
 * Collections get `storyKeys` in their saved order. For FanFiction.net entries `storyIds` (what
 * an older build edits) decides membership; for other sources `storyKeys` does. Stories an older
 * build added go to the end.
 */
export function collectionsV2(raw: unknown): Collection[] {
  if (!Array.isArray(raw)) return [];
  const out: Collection[] = [];
  for (const c of raw) {
    if (!isObj(c)) continue;
    const keys = (Array.isArray(c.storyKeys) ? c.storyKeys : []).map(normalizeKey).filter((k): k is StoryKey => !!k);
    let storyKeys: StoryKey[];
    if (Array.isArray(c.storyIds)) {
      const ffn = c.storyIds.map(normalizeKey).filter((k): k is StoryKey => !!k && k.startsWith('ffn:'));
      const inIds = new Set(ffn);
      storyKeys = keys.filter((k) => !k.startsWith('ffn:') || inIds.has(k));
      for (const k of ffn) storyKeys.push(k);
    } else storyKeys = keys;
    storyKeys = [...new Set(storyKeys)];
    out.push({ ...c, storyKeys, storyIds: legacyStoryIds(storyKeys) } as unknown as Collection);
  }
  return out;
}

const isPosition = (v: unknown): v is Position => isObj(v) && typeof v.chapter === 'number' && typeof v.index === 'number';

/** Listening positions keyed by story key. When two entries name the same story the newer wins. */
export function positionsV2(raw: unknown): Record<StoryKey, Position> {
  const out: Record<StoryKey, Position> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = normalizeKey(k);
    if (!key || !isPosition(v)) continue;
    const p = v;
    if (!out[key] || (p.at ?? 0) > (out[key].at ?? 0)) out[key] = p;
  }
  return out;
}

/** Recent searches and pinned fandoms are FanFiction.net ones unless they say otherwise. */
export function searchesV2(raw: unknown): RecentSearch[] {
  return withSource(raw) as unknown as RecentSearch[];
}

export function pinsV2(raw: unknown): PinnedFandom[] {
  return withSource(raw) as unknown as PinnedFandom[];
}

function withSource(raw: unknown): Obj[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((x) => ({ ...x, source: isSourceId(x.source) ? x.source : 'ffn' }));
}

export function settingsV2(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  return 'pinnedFandoms' in raw ? { ...raw, pinnedFandoms: pinsV2(raw.pinnedFandoms) } : raw;
}

// Reading a blob that may be in either shape (an older build may have rewritten it).
export const normalizeBookmarks = bookmarksV2;
export const normalizeCollections = collectionsV2;
export const normalizePositions = positionsV2;
export const normalizeSearches = searchesV2;
export const normalizePins = pinsV2;

// --- the migration ----------------------------------------------------------------------------

export class MigrationError extends Error {}

const LEGACY_STORY = "key GLOB 'story:[0-9]*'";
const LEGACY_AUTHOR = "key GLOB 'author:[0-9]*'";
// Chapter text compared byte for byte (LENGTH of TEXT counts characters).
const BYTES = 'COALESCE(SUM(LENGTH(CAST(html AS BLOB))), 0)';
const COPY_JOIN = "chapter_text c JOIN chapters l ON c.story_key = 'ffn:' || CAST(l.story_id AS INTEGER) AND c.number = l.number";

function readJson(db: SyncDb, key: string): unknown {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? JSON.parse(row.value) : undefined;
}

function writeJson(db: SyncDb, key: string, value: unknown) {
  db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

function check(ok: boolean, what: string) {
  if (!ok) throw new MigrationError(`Check failed: ${what}`);
}

const subset = (a: unknown, b: unknown) => numbers(a).every((n) => numbers(b).includes(n));

/**
 * Moves everything still in v1 form to v2, checks the copy, then deletes the v1 rows. Runs inside
 * the caller's transaction. `blobs` also converts the list blobs (the first migration only: later
 * an older build's blobs are normalised when read).
 */
export function moveLegacy(db: SyncDb, opts: { blobs: boolean; beforeVerify?: (db: SyncDb) => void }): MigrationCounts {
  const checks: (() => void)[] = [];
  // A row that names no story or author (`story:0`, a damaged record) can't be converted. It is
  // kept under `unreadable:<key>` rather than lost, and doesn't stop the rest.
  let setAside = 0;
  const putAside = (row: { key: string; value: string }) => {
    db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', `unreadable:${row.key}`, row.value);
    setAside++;
    checks.push(() => check(db.getFirstSync('SELECT 1 AS x FROM kv WHERE key = ?', `unreadable:${row.key}`) != null, `${row.key} set aside`));
  };
  const parse = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };

  // Stories: merged into the v2 row when there is one.
  const storyRows = db.getAllSync<{ key: string; value: string }>(`SELECT key, value FROM kv WHERE ${LEGACY_STORY}`);
  const stories = new Map<string, { story: LibraryStory; from: LibraryStory[] }>();
  for (const row of storyRows) {
    // The row key names the story; the record's own id is the fallback.
    const legacy = normalizeStory(parse(row.value), normalizeKey(row.key.slice(6)) ?? undefined);
    if (!legacy) {
      putAside(row);
      continue;
    }
    const target = `story:${legacy.key}`;
    const prev = stories.get(target);
    if (prev) {
      prev.story = mergeStory(prev.story, legacy);
      prev.from.push(legacy);
    } else {
      const existing = normalizeStory(readJson(db, target), legacy.key);
      stories.set(target, { story: existing ? mergeStory(existing, legacy) : legacy, from: [legacy] });
    }
  }
  for (const [target, { story, from }] of stories) {
    writeJson(db, target, story);
    checks.push(() => {
      const saved = normalizeStory(readJson(db, target), story.key);
      check(!!saved, `${target} written`);
      for (const l of from) {
        check(saved!.title === story.title, `${target} title`);
        check(subset(l.readChapters, saved!.readChapters), `${target} read chapters`);
        check(subset(l.downloadedChapters, saved!.downloadedChapters), `${target} downloaded chapters`);
        check((saved!.lastReadAt ?? 0) >= (l.lastReadAt ?? 0), `${target} last read`);
        check(Object.keys(l.chapterProgress ?? {}).every((c) => saved!.chapterProgress?.[c] != null), `${target} chapter progress`);
        for (const f of ['inLibrary', 'followed', 'favorited', 'downloaded'] as const) check(!l[f] || !!saved![f], `${target} ${f}`);
      }
    });
  }

  // Authors.
  const authorRows = db.getAllSync<{ key: string; value: string }>(`SELECT key, value FROM kv WHERE ${LEGACY_AUTHOR}`);
  const authors = new Map<string, SavedAuthor>();
  for (const row of authorRows) {
    const legacy = normalizeAuthor(parse(row.value), authorKeyFromKv(row.key.slice(7)) ?? undefined);
    if (!legacy) {
      putAside(row);
      continue;
    }
    const target = `author:${legacy.key}`;
    const prev = authors.get(target) ?? normalizeAuthor(readJson(db, target), legacy.key);
    authors.set(target, prev ? mergeAuthor(prev, legacy) : legacy);
  }
  for (const [target, a] of authors) writeJson(db, target, a);
  checks.push(() => {
    for (const target of authors.keys()) check(readJson(db, target) !== undefined, `${target} written`);
  });

  // Chapter text: every legacy row must have an identical copy.
  const before = db.getFirstSync<{ n: number; b: number }>(`SELECT COUNT(*) AS n, ${BYTES} AS b FROM chapters`)!;
  if (before.n) {
    db.runSync(
      "INSERT OR REPLACE INTO chapter_text (story_key, number, html, saved_at, remote_id) SELECT 'ffn:' || CAST(story_id AS INTEGER), number, html, saved_at, NULL FROM chapters",
    );
    checks.push(() => {
      const after = db.getFirstSync<{ n: number; b: number }>(`SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(CAST(c.html AS BLOB))), 0) AS b FROM ${COPY_JOIN} WHERE c.html = l.html`)!;
      check(after.n === before.n, `chapter rows (${after.n} of ${before.n})`);
      check(after.b === before.b, `chapter bytes (${after.b} of ${before.b})`);
    });
  }

  const counts: MigrationCounts = { stories: storyRows.length, authors: authorRows.length, chapters: before.n, chapterBytes: before.b };
  if (setAside) counts.setAside = setAside;

  if (opts.blobs) {
    // Each blob is rewritten, read back, and checked for entries the conversion lost.
    const blob = <T>(key: string, convert: (raw: unknown) => T, lost: (raw: unknown, next: T) => string | null) => {
      const raw = readJson(db, key);
      if (raw === undefined) return undefined;
      const next = convert(raw);
      writeJson(db, key, next);
      checks.push(() => {
        check(JSON.stringify(readJson(db, key)) === JSON.stringify(next), `${key} written`);
        const why = lost(raw, next);
        check(!why, `${key}: ${why}`);
      });
      return next;
    };
    const storyRefs = (x: unknown) => (Array.isArray(x) ? x : []).map(normalizeKey).filter((k): k is StoryKey => !!k);
    counts.bookmarks = blob('bookmarks', bookmarksV2, (raw, next) => {
      const named = (Array.isArray(raw) ? raw : []).filter((b) => isObj(b) && (normalizeKey(b.storyId) || isStoryKey(b.storyKey))).length;
      return next.length === named ? null : `${next.length} of ${named}`;
    })?.length;
    counts.collections = blob('collections', collectionsV2, (raw, next) => {
      const list = Array.isArray(raw) ? raw.filter(isObj) : [];
      if (next.length !== list.length) return `${next.length} of ${list.length}`;
      // In v1 the order is the order of `storyIds`; it must survive exactly.
      const bad = list.findIndex((c, i) => !c.storyKeys && next[i].storyKeys.join() !== [...new Set(storyRefs(c.storyIds))].join());
      return bad < 0 ? null : `entries or order of "${String(list[bad].name)}"`;
    })?.length;
    const positions = blob('listenPositions', positionsV2, (raw, next) => {
      const named = new Set(Object.entries(isObj(raw) ? raw : {}).filter(([k, v]) => isPosition(v) && normalizeKey(k)).map(([k]) => normalizeKey(k))).size;
      return Object.keys(next).length === named ? null : `${Object.keys(next).length} of ${named}`;
    });
    counts.positions = positions && Object.keys(positions).length;
    blob('searches', searchesV2, (raw, next) => (Array.isArray(raw) && next.length !== raw.filter(isObj).length ? 'entries' : null));
    blob('settings', settingsV2, () => null);
  }

  opts.beforeVerify?.(db);
  for (const c of checks) c();

  db.runSync(`DELETE FROM kv WHERE ${LEGACY_STORY} OR ${LEGACY_AUTHOR}`);
  if (before.n) db.runSync('DELETE FROM chapters');
  return counts;
}

/** Bytes the database takes on disk. */
export function databaseBytes(db: SyncDb): number {
  const count = db.getFirstSync<{ page_count: number }>('PRAGMA page_count')?.page_count ?? 0;
  const size = db.getFirstSync<{ page_size: number }>('PRAGMA page_size')?.page_size ?? 4096;
  return count * size;
}

const MB = 1024 * 1024;
const SNAPSHOT_HEADROOM = 50 * MB;
const CONVERT_HEADROOM = 20 * MB;

/**
 * Free bytes the conversion needs: the chapters are copied inside one transaction, so the log
 * holds a copy of them, and the file grows by as much when the log is written back.
 */
export function bytesNeededToConvert(db: SyncDb): number {
  return 2 * databaseBytes(db) + CONVERT_HEADROOM;
}

function freeBytes(env: MigrationEnv): number | undefined {
  try {
    const n = env.freeBytes?.();
    return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/** Copies the database before converting it, when there's room for the copy and the conversion. */
function takeSnapshot(db: SyncDb, env: MigrationEnv, free: number | undefined): boolean {
  if (!env.snapshot || free == null) return false;
  // A new install has nothing to keep a copy of.
  const rows = db.getFirstSync<{ n: number }>('SELECT (SELECT COUNT(*) FROM kv) + (SELECT COUNT(*) FROM chapters) AS n');
  if (!rows?.n) return false;
  if (!(free > bytesNeededToConvert(db) + databaseBytes(db) + SNAPSHOT_HEADROOM)) return false;
  try {
    env.snapshot();
    return true;
  } catch {
    // The conversion is still one transaction; it just has no extra copy.
    return false;
  }
}

/** The one-time v1 → v2 conversion. On any error nothing has changed. */
export function migrateV2(db: SyncDb, env: MigrationEnv = {}): MigrationResult {
  const free = freeBytes(env);
  const need = bytesNeededToConvert(db);
  if (free != null && free < need) {
    // Running out of space halfway would roll back anyway; say so up front instead.
    return {
      ok: false,
      version: 1,
      lowSpace: true,
      error: `Not enough free space to upgrade your library safely: it needs about ${Math.ceil(need / MB)} MB and ${Math.floor(free / MB)} MB are free. Free up some space, then tap Retry. Nothing has been changed.`,
    };
  }
  const snapshot = takeSnapshot(db, env, free);
  try {
    let counts!: MigrationCounts;
    db.withTransactionSync(() => {
      counts = moveLegacy(db, { blobs: true, beforeVerify: env.beforeVerify });
      writeJson(db, 'migration:v2', { at: (env.now ?? Date.now)(), snapshot, counts });
      writeJson(db, 'schemaVersion', 2);
    });
    return { ok: true, version: 2, migrated: true, snapshot, counts };
  } catch (e) {
    return { ok: false, version: 1, snapshot, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Runs on every launch after the conversion: merges what an older build (installed again from
 * Xcode) wrote in the v1 format. Cheap when there's nothing to do.
 */
export function drainLegacy(db: SyncDb): { counts?: MigrationCounts; error?: string } {
  const pending = db.getFirstSync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM kv WHERE ${LEGACY_STORY} OR ${LEGACY_AUTHOR}) + (SELECT COUNT(*) FROM chapters) AS n`,
  );
  if (!pending?.n) return {};
  try {
    let counts!: MigrationCounts;
    db.withTransactionSync(() => {
      counts = moveLegacy(db, { blobs: false });
    });
    return { counts };
  } catch (e) {
    // Left as it is; the rows are also merged when the library loads.
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
