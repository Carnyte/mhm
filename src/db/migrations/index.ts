// Storage migrations. Run synchronously when the database opens (kv.ts), before any store reads
// its state, so the rest of the app only ever sees the current format.

import { drainLegacy, migrateV2 } from './v2';

/** The part of expo-sqlite's synchronous API the migrations use (tests supply node:sqlite). */
export interface SyncDb {
  execSync(sql: string): void;
  getAllSync<T>(sql: string, ...params: (string | number | null)[]): T[];
  getFirstSync<T>(sql: string, ...params: (string | number | null)[]): T | null;
  runSync(sql: string, ...params: (string | number | null)[]): unknown;
  withTransactionSync(task: () => void): void;
}

export interface MigrationEnv {
  /** Free bytes on the device (the pre-upgrade copy needs room). */
  freeBytes?: () => number;
  /** Copies the whole database to the pre-upgrade file. */
  snapshot?: () => void;
  now?: () => number;
  /** Test hook: runs inside the transaction, just before the copy is checked. */
  beforeVerify?: (db: SyncDb) => void;
}

/** What a migration moved: legacy rows, and the entries in each list blob. */
export interface MigrationCounts {
  stories: number;
  authors: number;
  chapters: number;
  chapterBytes: number;
  bookmarks?: number;
  collections?: number;
  positions?: number;
}

export interface MigrationResult {
  ok: boolean;
  /** Schema version the database is at now. */
  version: number;
  /** The v1 → v2 conversion ran on this launch. */
  migrated?: boolean;
  /** A pre-upgrade copy was written. */
  snapshot?: boolean;
  counts?: MigrationCounts;
  /** Rows an older build wrote, merged on this launch. */
  drained?: MigrationCounts;
  error?: string;
}

export const SCHEMA_VERSION = 2;

/**
 * Tables. `chapters` is the v1 table: kept (and emptied on every launch) so an older build can
 * still write to it. `http_cache` holds site data with a lifetime set in code (fandom lists and
 * the like).
 */
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS chapters (
    story_id INTEGER NOT NULL, number INTEGER NOT NULL, html TEXT NOT NULL,
    saved_at INTEGER NOT NULL, PRIMARY KEY (story_id, number));
  CREATE TABLE IF NOT EXISTS chapter_text (
    story_key TEXT NOT NULL, number INTEGER NOT NULL, html TEXT NOT NULL,
    saved_at INTEGER NOT NULL, remote_id TEXT, PRIMARY KEY (story_key, number));
  CREATE TABLE IF NOT EXISTS http_cache (
    key TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL, etag TEXT, fetched_at INTEGER NOT NULL);
`;

/** The v2 record of the conversion (`migration:v2` in kv). */
export interface MigrationRecord {
  at: number;
  snapshot: boolean;
  counts: MigrationCounts;
}

export function schemaVersion(db: SyncDb): number {
  const row = db.getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = 'schemaVersion'");
  const v = row ? Number(JSON.parse(row.value)) : 1;
  return Number.isFinite(v) ? v : 1;
}

/**
 * Brings the database to the current schema. Never throws: a failed conversion is rolled back and
 * reported, and the caller must then stop writing (see kv.writable).
 */
export function runMigrations(db: SyncDb, env: MigrationEnv = {}): MigrationResult {
  let result: MigrationResult;
  try {
    const version = schemaVersion(db);
    result = version < 2 ? migrateV2(db, env) : { ok: true, version };
  } catch (e) {
    return { ok: false, version: 1, error: e instanceof Error ? e.message : String(e) };
  }
  if (!result.ok) return result;
  const drained = drainLegacy(db);
  if (drained.counts) result.drained = drained.counts;
  return result;
}
