// Key-value persistence on SQLite (iOS/Android). Small docs (library, settings) are loaded at
// startup; chapter HTML for offline reading is read on demand.

import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

let db: SQLiteDatabase | null = null;

function open(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('ficshelf.db');
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chapters (
        story_id INTEGER NOT NULL, number INTEGER NOT NULL, html TEXT NOT NULL,
        saved_at INTEGER NOT NULL, PRIMARY KEY (story_id, number));
    `);
  }
  return db;
}

export const kv = {
  getSync<T>(key: string): T | undefined {
    const row = open().getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  },
  prefixSync<T>(prefix: string): T[] {
    return open()
      .getAllSync<{ value: string }>('SELECT value FROM kv WHERE key LIKE ? ESCAPE ?', prefix.replace(/[%_\\]/g, '\\$&') + '%', '\\')
      .map((r) => JSON.parse(r.value) as T);
  },
  async set(key: string, value: unknown): Promise<void> {
    await open().runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
  },
  async delete(key: string): Promise<void> {
    await open().runAsync('DELETE FROM kv WHERE key = ?', key);
  },
  async deletePrefix(prefix: string): Promise<void> {
    await open().runAsync('DELETE FROM kv WHERE key LIKE ? ESCAPE ?', prefix.replace(/[%_\\]/g, '\\$&') + '%', '\\');
  },
};

export const chapterStore = {
  async get(storyId: number, n: number): Promise<string | undefined> {
    const row = await open().getFirstAsync<{ html: string }>(
      'SELECT html FROM chapters WHERE story_id = ? AND number = ?',
      storyId,
      n,
    );
    return row?.html;
  },
  async put(storyId: number, n: number, html: string): Promise<void> {
    await open().runAsync(
      'INSERT OR REPLACE INTO chapters (story_id, number, html, saved_at) VALUES (?, ?, ?, ?)',
      storyId,
      n,
      html,
      Date.now(),
    );
  },
  async list(storyId: number): Promise<number[]> {
    const rows = await open().getAllAsync<{ number: number }>(
      'SELECT number FROM chapters WHERE story_id = ? ORDER BY number',
      storyId,
    );
    return rows.map((r) => r.number);
  },
  async remove(storyId: number): Promise<void> {
    await open().runAsync('DELETE FROM chapters WHERE story_id = ?', storyId);
  },
  async removeAll(): Promise<void> {
    await open().runAsync('DELETE FROM chapters');
  },
  async sizeBytes(storyId?: number): Promise<number> {
    const row = storyId
      ? await open().getFirstAsync<{ n: number }>('SELECT COALESCE(SUM(LENGTH(html)),0) AS n FROM chapters WHERE story_id = ?', storyId)
      : await open().getFirstAsync<{ n: number }>('SELECT COALESCE(SUM(LENGTH(html)),0) AS n FROM chapters');
    return row?.n ?? 0;
  },
};
