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

function write(key: string, value: string) {
  try {
    ls()?.setItem(key, value);
  } catch {
    mem.set(key, value);
  }
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
const writeJson = (k: string, v: unknown) => write(NS + k, JSON.stringify(v));

let migration: MigrationResult | null = null;

/** The same conversion as the SQLite one, without the transaction (this store is for development). */
function migrate(): MigrationResult {
  if (migration) return migration;
  try {
    const first = readJson('schemaVersion') == null;
    for (const k of keys()) {
      let m = k.match(/^ficshelf:story:(\d+)$/);
      if (m) {
        const legacy = normalizeStory(JSON.parse(read(k)!), normalizeKey(m[1]) ?? undefined);
        if (legacy) {
          const cur = normalizeStory(readJson(`story:${legacy.key}`), legacy.key);
          writeJson(`story:${legacy.key}`, cur ? mergeStory(cur, legacy) : legacy);
        }
        remove(k);
        continue;
      }
      m = k.match(/^ficshelf:author:(\d+)$/);
      if (m) {
        const legacy = normalizeAuthor(JSON.parse(read(k)!), authorKeyFromKv(m[1]) ?? undefined);
        if (legacy) {
          const cur = normalizeAuthor(readJson(`author:${legacy.key}`), legacy.key);
          writeJson(`author:${legacy.key}`, cur ? mergeAuthor(cur, legacy) : legacy);
        }
        remove(k);
        continue;
      }
      m = k.match(/^ficshelf:ch:(\d+):(\d+)$/);
      if (m) {
        write(`${CH}ffn:${m[1]}:${m[2]}`, read(k)!);
        remove(k);
      }
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
        if (raw !== undefined) writeJson(k, convert(raw));
      }
      writeJson('schemaVersion', 2);
    }
    migration = { ok: true, version: 2, migrated: first };
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
