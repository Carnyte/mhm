// Key-value persistence on SQLite (iOS/Android). Small docs (library, settings) are loaded at
// startup; chapter HTML for offline reading is read on demand.
//
// Opening the database runs the storage migrations first (src/db/migrations). If a migration
// fails nothing is written any more (`kv.writable` is false) and the app shows MigrationFailed,
// so the old data can't be overwritten.

import { File, Paths } from 'expo-file-system';
import { backupDatabaseSync, deleteDatabaseSync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { StoryKey } from '../sources/keys';
import { runMigrations, SCHEMA_SQL, type MigrationRecord, type MigrationResult } from './migrations';

const DB_NAME = 'ficshelf.db';
/** Copy of the database taken just before the v2 conversion. */
export const SNAPSHOT_NAME = 'ficshelf-pre-v2.db';
const SNAPSHOT_KEEP_MS = 30 * 86_400_000;

let db: SQLiteDatabase | null = null;
// Read-only until the database has been prepared and the migrations have reported success.
let migration: MigrationResult = { ok: false, version: 0, error: 'The storage upgrade didn’t finish.' };

function snapshotFile(): File {
  return new File(Paths.document, 'SQLite', SNAPSHOT_NAME);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function migrate(d: SQLiteDatabase) {
  // Read-only until the migrations have reported back.
  migration = { ok: false, version: 0, error: 'The storage upgrade didn’t finish.' };
  try {
    d.execSync('PRAGMA journal_mode = WAL;' + SCHEMA_SQL);
  } catch (e) {
    migration = { ok: false, version: 0, error: `The database couldn’t be prepared: ${message(e)}` };
    return;
  }
  migration = runMigrations(d, {
    freeBytes: () => Paths.availableDiskSpace,
    snapshot: () => {
      const dest = openDatabaseSync(SNAPSHOT_NAME);
      try {
        backupDatabaseSync({ sourceDatabase: d, destDatabase: dest });
      } finally {
        dest.closeSync();
      }
    },
  });
  if (migration.ok) expireSnapshot(d);
  if (migration.migrated) reclaimSpace(d);
}

/**
 * After the conversion the old chapter pages sit unused in the file and the log holds a copy of
 * the new ones. Write the log back and shrink it now, then compact the file shortly after launch
 * (that takes a while on a big library, so it isn't done while the app is starting).
 */
function reclaimSpace(d: SQLiteDatabase) {
  try {
    d.execSync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // The log is written back eventually anyway.
  }
  const t = setTimeout(() => {
    Promise.resolve()
      .then(() => d.execAsync('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);'))
      .catch(() => {
        // Not enough room to compact: the space is reused as new chapters are saved.
      });
  }, 5000);
  (t as { unref?: () => void }).unref?.(); // don't keep a test process alive for it
}

function expireSnapshot(d: SQLiteDatabase) {
  try {
    const row = d.getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = 'migration:v2'");
    const rec = row ? (JSON.parse(row.value) as MigrationRecord) : undefined;
    if (rec?.snapshot && Date.now() - rec.at > SNAPSHOT_KEEP_MS && snapshotFile().exists) deleteDatabaseSync(SNAPSHOT_NAME);
  } catch {
    // Settings → Storage can still delete it.
  }
}

/**
 * How long a statement waits for another connection's write (an exclusive transaction runs on a
 * connection of its own) before it gives up with "database is locked".
 */
const BUSY_TIMEOUT = 'PRAGMA busy_timeout = 5000';

function open(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync(DB_NAME);
    try {
      db.execSync(`${BUSY_TIMEOUT};`);
    } catch {
      // Writes then fail at once while another connection writes, as before.
    }
    migrate(db);
  }
  return db;
}

const like = (prefix: string) => prefix.replace(/[%_\\]/g, '\\$&') + '%';

export const kv = {
  /** False after a failed migration: every write is skipped so the old data stays as it was. */
  get writable(): boolean {
    open();
    return migration.ok;
  },
  getSync<T>(key: string): T | undefined {
    const row = open().getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  },
  prefixSync<T>(prefix: string): T[] {
    return kv.entriesSync<T>(prefix).map(([, v]) => v);
  },
  /** [key, value] pairs whose key starts with `prefix`, in key order. */
  entriesSync<T>(prefix: string): [string, T][] {
    return open()
      .getAllSync<{ key: string; value: string }>('SELECT key, value FROM kv WHERE key LIKE ? ESCAPE ? ORDER BY key', like(prefix), '\\')
      .map((r) => [r.key, JSON.parse(r.value) as T]);
  },
  async set(key: string, value: unknown): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
  },
  async delete(key: string): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync('DELETE FROM kv WHERE key = ?', key);
  },
  async deletePrefix(prefix: string): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync('DELETE FROM kv WHERE key LIKE ? ESCAPE ?', like(prefix), '\\');
  },
};

/** A chapter saved on the device. */
export interface SavedChapter {
  html: string;
  /** When it was saved (ms since epoch). */
  savedAt?: number;
  /** The site's id of the chapter (AO3 chapter id), when it has one. */
  remoteId?: string;
}

/** One chapter to save with putMany. */
export interface ChapterRow {
  number: number;
  html: string;
  remoteId?: string;
}

export interface PutManyOptions {
  /** Swap the story's saved chapters for these, all at once at the end. */
  replace?: boolean;
  /**
   * Add these to the story's saved chapters, all at once at the end, keeping any it has saved
   * meanwhile: a failed or cancelled (or killed) import leaves none of them behind.
   */
  merge?: boolean;
  /** Chapters per transaction (default 20). */
  batch?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Where putMany parks a replacement until it's complete (never a story key). */
const staging = (key: StoryKey) => `${key}#staging`;

const aborted = () => Object.assign(new Error('The import was cancelled.'), { name: 'AbortError' });

export const chapterStore = {
  async get(key: StoryKey, n: number): Promise<string | undefined> {
    const row = await open().getFirstAsync<{ html: string }>('SELECT html FROM chapter_text WHERE story_key = ? AND number = ?', key, n);
    return row?.html;
  },
  /** The saved copy with when it was saved (ms) and the site's id of the chapter it is. */
  async getRow(key: StoryKey, n: number): Promise<SavedChapter | undefined> {
    const row = await open().getFirstAsync<{ html: string; saved_at: number | null; remote_id: string | null }>(
      'SELECT html, saved_at, remote_id FROM chapter_text WHERE story_key = ? AND number = ?',
      key,
      n,
    );
    return row ? { html: row.html, savedAt: row.saved_at ?? undefined, remoteId: row.remote_id ?? undefined } : undefined;
  },
  /** `remoteId` is the site's own id for the chapter (AO3 chapter, Wattpad part), when it has one. */
  async put(key: StoryKey, n: number, html: string, remoteId?: string): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync(
      'INSERT OR REPLACE INTO chapter_text (story_key, number, html, saved_at, remote_id) VALUES (?, ?, ?, ?, ?)',
      key,
      n,
      html,
      Date.now(),
      remoteId ?? null,
    );
  },
  /**
   * Saves many chapters (an imported book) in batches, one statement each on the app's own
   * connection (so it never locks out the app's other writes), reporting progress and letting the
   * screen draw between batches. With `replace` or `merge` the chapters are written aside first and
   * put in place in one step at the end, so a failure or a cancel leaves the story as it was.
   */
  async putMany(key: StoryKey, rows: ChapterRow[], opts: PutManyOptions = {}): Promise<void> {
    if (!kv.writable) return;
    const d = open();
    const aside = opts.replace || opts.merge;
    const target = aside ? staging(key) : key;
    const size = Math.max(1, opts.batch ?? 20);
    const now = Date.now();
    try {
      if (aside) await d.runAsync('DELETE FROM chapter_text WHERE story_key = ?', target);
      for (let i = 0; i < rows.length; i += size) {
        if (opts.signal?.aborted) throw aborted();
        const part = rows.slice(i, i + size);
        await d.runAsync(
          `INSERT OR REPLACE INTO chapter_text (story_key, number, html, saved_at, remote_id) VALUES ${part.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
          part.flatMap((r) => [target, r.number, r.html, now, r.remoteId ?? null]),
        );
        opts.onProgress?.(Math.min(rows.length, i + size), rows.length);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (opts.signal?.aborted) throw aborted();
      if (aside) {
        await d.withExclusiveTransactionAsync(async (tx) => {
          await tx.runAsync(BUSY_TIMEOUT);
          if (opts.replace) {
            await tx.runAsync('DELETE FROM chapter_text WHERE story_key = ?', key);
            await tx.runAsync('UPDATE chapter_text SET story_key = ? WHERE story_key = ?', key, target);
          } else {
            await tx.runAsync('INSERT OR IGNORE INTO chapter_text SELECT ?, number, html, saved_at, remote_id FROM chapter_text WHERE story_key = ?', key, target);
            await tx.runAsync('DELETE FROM chapter_text WHERE story_key = ?', target);
          }
        });
      }
    } catch (e) {
      if (aside) await d.runAsync('DELETE FROM chapter_text WHERE story_key = ?', target).catch(() => {});
      throw e;
    }
  },
  /** Story keys with saved chapters, among those starting with `prefix` ('local:'). */
  async storyKeys(prefix: string): Promise<StoryKey[]> {
    const rows = await open().getAllAsync<{ story_key: string }>('SELECT DISTINCT story_key FROM chapter_text WHERE story_key LIKE ? ESCAPE ?', like(prefix), '\\');
    return rows.map((r) => r.story_key as StoryKey);
  },
  /** Drops replacements that never finished (the app was closed mid-import). */
  async removeStaging(): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync("DELETE FROM chapter_text WHERE story_key LIKE '%#staging'");
  },
  async list(key: StoryKey): Promise<number[]> {
    const rows = await open().getAllAsync<{ number: number }>('SELECT number FROM chapter_text WHERE story_key = ? ORDER BY number', key);
    return rows.map((r) => r.number);
  },
  async remove(key: StoryKey): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync('DELETE FROM chapter_text WHERE story_key = ?', key);
  },
  /** Every saved chapter, except those of stories whose key starts with `keep` ('local:'). */
  async removeAll(keep?: string): Promise<void> {
    if (!kv.writable) return;
    if (keep) await open().runAsync('DELETE FROM chapter_text WHERE story_key NOT LIKE ? ESCAPE ?', like(keep), '\\');
    else await open().runAsync('DELETE FROM chapter_text');
  },
  async sizeBytes(key?: StoryKey): Promise<number> {
    const row = key
      ? await open().getFirstAsync<{ n: number }>('SELECT COALESCE(SUM(LENGTH(html)),0) AS n FROM chapter_text WHERE story_key = ?', key)
      : await open().getFirstAsync<{ n: number }>('SELECT COALESCE(SUM(LENGTH(html)),0) AS n FROM chapter_text');
    return row?.n ?? 0;
  },
  /**
   * Moves saved chapters to new numbers when a site reorders or deletes chapters: `map` is
   * old number → new number, or null to drop it. Chapters not in the map stay where they are.
   */
  async renumber(key: StoryKey, map: Map<number, number | null>): Promise<void> {
    if (!kv.writable || !map.size) return;
    await open().withExclusiveTransactionAsync(async (tx) => {
      await tx.runAsync(BUSY_TIMEOUT);
      // Park the moving rows on negative numbers first, so swaps can't collide.
      for (const from of map.keys()) {
        await tx.runAsync('UPDATE chapter_text SET number = ? WHERE story_key = ? AND number = ?', -from - 1, key, from);
      }
      for (const [from, to] of map) {
        if (to == null) await tx.runAsync('DELETE FROM chapter_text WHERE story_key = ? AND number = ?', key, -from - 1);
        else await tx.runAsync('INSERT OR REPLACE INTO chapter_text SELECT story_key, ?, html, saved_at, remote_id FROM chapter_text WHERE story_key = ? AND number = ?', to, key, -from - 1);
      }
      await tx.runAsync('DELETE FROM chapter_text WHERE story_key = ? AND number < 0', key);
    });
  },
};

/**
 * Site data kept between launches with a lifetime decided by the caller (AO3's fandom lists and
 * media page: big, rarely changing, and AO3 asks apps to cache them).
 */
export const httpCache = {
  async get(key: string): Promise<{ body: string; fetchedAt: number } | undefined> {
    const row = await open().getFirstAsync<{ body: string; fetched_at: number }>('SELECT body, fetched_at FROM http_cache WHERE key = ?', key);
    return row ? { body: row.body, fetchedAt: row.fetched_at } : undefined;
  },
  async put(key: string, body: string): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync('INSERT OR REPLACE INTO http_cache (key, body, etag, fetched_at) VALUES (?, ?, NULL, ?)', key, body, Date.now());
  },
  async clear(): Promise<void> {
    if (!kv.writable) return;
    await open().runAsync('DELETE FROM http_cache');
  },
};

// --- migration state (MigrationFailed screen, Settings → Storage) -------------------------------

export function migrationStatus(): MigrationResult {
  open();
  return migration;
}

/** Tries the conversion again (MigrationFailed → Retry). */
export function retryMigration(): MigrationResult {
  migrate(open());
  return migration;
}

/** A consistent copy of the whole database to hand to the share sheet; returns its file URI. */
export function copyDatabaseForSharing(): string {
  const name = 'ficshelf-copy.db';
  try {
    deleteDatabaseSync(name);
  } catch {
    // not there yet
  }
  const dest = openDatabaseSync(name);
  try {
    backupDatabaseSync({ sourceDatabase: open(), destDatabase: dest });
  } finally {
    dest.closeSync();
  }
  return new File(Paths.document, 'SQLite', name).uri;
}

/** The pre-upgrade copy, if it's still on the device. */
export function snapshotInfo(): { bytes: number; at?: number } | null {
  try {
    const f = snapshotFile();
    if (!f.exists) return null;
    return { bytes: f.size ?? 0, at: kv.getSync<MigrationRecord>('migration:v2')?.at };
  } catch {
    return null;
  }
}

export function deleteSnapshot() {
  deleteDatabaseSync(SNAPSHOT_NAME);
}
