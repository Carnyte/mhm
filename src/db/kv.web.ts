// Web (development harness only): localStorage-backed version of kv.ts, with the same v2 keys.
// Chapters live under `ficshelf:ch:<StoryKey>:<n>`.

import { normalizeKey, type StoryKey } from '../sources/keys';
import type { MigrationResult } from './migrations';
import {
  authorKeyFromKv,
  bookmarksV2,
  collectionsV2,
  mergeAuthor,
  mergeStory,
  normalizeAuthor,
  normalizeStory,
  positionsV2,
  searchesV2,
  settingsV2,
} from './migrations/v2';

const mem = new Map<string, string>();

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  return ls()?.getItem(key) ?? mem.get(key) ?? null;
}

/** False when the value only made it into memory (storage full or unavailable). */
function write(key: string, value: string): boolean {
  try {
    const s = ls();
    if (s) {
      s.setItem(key, value);
      return true;
    }
  } catch {
    // fall through to memory
  }
  mem.set(key, value);
  return false;
}

function remove(key: string) {
  ls()?.removeItem(key);
  mem.delete(key);
}

function keys(): string[] {
  const s = ls();
  const out = new Set<string>(mem.keys());
  if (s) for (let i = 0; i < s.length; i++) out.add(s.key(i)!);
  return [...out].sort();
}

const NS = 'ficshelf:';
const CH = NS + 'ch:';

const readJson = (k: string): unknown => {
  const v = read(NS + k);
  return v ? JSON.parse(v) : undefined;
};
const writeJson = (k: string, v: unknown): boolean => write(NS + k, JSON.stringify(v));

let migration: MigrationResult | null = null;

/** The same conversion as the SQLite one, without the transaction (this store is for development). */
function migrate(): MigrationResult {
  if (migration) return migration;
  // The old entry goes only once its copy is stored for good (not just held in memory).
  let failed = 0;
  const kept = (ok: boolean, oldKey: string) => {
    if (ok) remove(oldKey);
    else failed++;
  };
  try {
    const first = readJson('schemaVersion') == null;
    for (const k of keys()) {
      let m = k.match(/^ficshelf:story:(\d+)$/);
      if (m) {
        const legacy = normalizeStory(JSON.parse(read(k)!), normalizeKey(m[1]) ?? undefined);
        if (legacy) {
          const cur = normalizeStory(readJson(`story:${legacy.key}`), legacy.key);
          kept(writeJson(`story:${legacy.key}`, cur ? mergeStory(cur, legacy) : legacy), k);
        }
        continue;
      }
      m = k.match(/^ficshelf:author:(\d+)$/);
      if (m) {
        const legacy = normalizeAuthor(JSON.parse(read(k)!), authorKeyFromKv(m[1]) ?? undefined);
        if (legacy) {
          const cur = normalizeAuthor(readJson(`author:${legacy.key}`), legacy.key);
          kept(writeJson(`author:${legacy.key}`, cur ? mergeAuthor(cur, legacy) : legacy), k);
        }
        continue;
      }
      m = k.match(/^ficshelf:ch:(\d+):(\d+)$/);
      if (m) kept(write(`${CH}ffn:${m[1]}:${m[2]}`, read(k)!), k);
    }
    if (first) {
      const blobs: [string, (x: unknown) => unknown][] = [
        ['bookmarks', bookmarksV2],
        ['collections', collectionsV2],
        ['listenPositions', positionsV2],
        ['searches', searchesV2],
        ['settings', settingsV2],
      ];
      for (const [k, convert] of blobs) {
        const raw = readJson(k);
        if (raw !== undefined && !writeJson(k, convert(raw))) failed++;
      }
      if (!failed) writeJson('schemaVersion', 2);
    }
    migration = failed
      ? { ok: false, version: 1, error: `Browser storage is full: ${failed} item(s) couldn’t be upgraded. Nothing was removed.` }
      : { ok: true, version: 2, migrated: first };
  } catch (e) {
    migration = { ok: false, version: 1, error: (e as Error).message };
  }
  return migration;
}

export const kv = {
  get writable(): boolean {
    return migrate().ok;
  },
  getSync<T>(key: string): T | undefined {
    migrate();
    const v = read(NS + key);
    return v ? (JSON.parse(v) as T) : undefined;
  },
  prefixSync<T>(prefix: string): T[] {
    return kv.entriesSync<T>(prefix).map(([, v]) => v);
  },
  entriesSync<T>(prefix: string): [string, T][] {
    migrate();
    return keys()
      .filter((k) => k.startsWith(NS + prefix))
      .map((k) => [k.slice(NS.length), JSON.parse(read(k)!) as T]);
  },
  async set(key: string, value: unknown) {
    if (kv.writable) write(NS + key, JSON.stringify(value));
  },
  async delete(key: string) {
    if (kv.writable) remove(NS + key);
  },
  async deletePrefix(prefix: string) {
    if (!kv.writable) return;
    for (const k of keys()) if (k.startsWith(NS + prefix)) remove(k);
  },
};

const chKey = (key: StoryKey, n: number) => `${CH}${key}:${n}`;

export const chapterStore = {
  async get(key: StoryKey, n: number) {
    migrate();
    return read(chKey(key, n)) ?? undefined;
  },
  /** The web build keeps only the text (no chapter id or date), so the reader asks the site again. */
  async getRow(key: StoryKey, n: number): Promise<{ html: string; savedAt?: number; remoteId?: string } | undefined> {
    migrate();
    const html = read(chKey(key, n));
    return html == null ? undefined : { html };
  },
  async put(key: StoryKey, n: number, html: string, _remoteId?: string) {
    if (kv.writable) write(chKey(key, n), html);
  },
  async list(key: StoryKey) {
    migrate();
    return keys()
      .filter((k) => k.startsWith(`${CH}${key}:`))
      .map((k) => Number(k.split(':').pop()))
      .sort((a, b) => a - b);
  },
  async remove(key: StoryKey) {
    if (!kv.writable) return;
    for (const k of keys()) if (k.startsWith(`${CH}${key}:`)) remove(k);
  },
  async removeAll() {
    if (!kv.writable) return;
    for (const k of keys()) if (k.startsWith(CH)) remove(k);
  },
  async sizeBytes(key?: StoryKey) {
    migrate();
    const pre = key ? `${CH}${key}:` : CH;
    return keys()
      .filter((k) => k.startsWith(pre))
      .reduce((n, k) => n + (read(k)?.length ?? 0), 0);
  },
  async renumber(key: StoryKey, map: Map<number, number | null>) {
    if (!kv.writable) return;
    const moving = [...map.keys()].map((n) => [n, read(chKey(key, n))] as const);
    for (const [n] of moving) remove(chKey(key, n));
    for (const [n, html] of moving) {
      const to = map.get(n);
      if (to != null && html != null) write(chKey(key, to), html);
    }
  },
};

const HC = NS + 'http:';

export const httpCache = {
  async get(key: string): Promise<{ body: string; fetchedAt: number } | undefined> {
    const v = read(HC + key);
    return v ? (JSON.parse(v) as { body: string; fetchedAt: number }) : undefined;
  },
  async put(key: string, body: string) {
    write(HC + key, JSON.stringify({ body, fetchedAt: Date.now() }));
  },
  async clear() {
    for (const k of keys()) if (k.startsWith(HC)) remove(k);
  },
};

export function migrationStatus(): MigrationResult {
  return migrate();
}

export function retryMigration(): MigrationResult {
  migration = null;
  return migrate();
}

export function copyDatabaseForSharing(): string {
  throw new Error('Not available on the web');
}

export function snapshotInfo(): { bytes: number; at?: number } | null {
  return null;
}

export function deleteSnapshot() {}

export const SNAPSHOT_NAME = 'ficshelf-pre-v2.db';
