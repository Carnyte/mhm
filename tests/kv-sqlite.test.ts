/** @jest-environment node */
// kv.ts and chapterStore on real SQLite (node:sqlite standing in for expo-sqlite): keys, chapters
// by story key, the migration that runs when the database opens, and read-only mode after a
// failed one.

import { openNodeDb, kvDump, type NodeDb } from './helpers/sqliteNode';
import { seedV1Database } from './fixtures/v1-library';
import { SCHEMA_SQL } from '../src/db/migrations';

let mockDb: NodeDb;
const mockBackups: string[] = [];
const mockDisk = { free: 10 * 1024 ** 3 };

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: (name: string) => (name === 'ficshelf.db' ? mockDb : { closeSync: () => {}, name }),
  backupDatabaseSync: ({ destDatabase }: { destDatabase: { name: string } }) => void mockBackups.push(destDatabase.name),
  deleteDatabaseSync: () => {},
}));
jest.mock('expo-file-system', () => ({
  Paths: {
    get availableDiskSpace() {
      return mockDisk.free;
    },
    document: 'file:///docs',
  },
  File: class {
    exists = false;
  },
}));

type KvModule = typeof import('../src/db/kv');

/** Loads kv.ts fresh over a database (opening it runs the migrations). */
function loadKv(db: NodeDb = openNodeDb()): KvModule {
  mockDb = db;
  mockBackups.length = 0;
  let mod!: KvModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../src/db/kv');
  });
  return mod;
}

describe('kv on SQLite', () => {
  it('round-trips JSON values and finds them by prefix, treating % and _ literally', async () => {
    const { kv } = loadKv();
    await kv.set('story:ffn:1', { key: 'ffn:1', t: 'é' });
    await kv.set('story:ffn:2', { key: 'ffn:2' });
    await kv.set('storyX', 'no');
    await kv.set('a_b', 1);
    await kv.set('axb', 2);
    expect(kv.getSync('story:ffn:1')).toEqual({ key: 'ffn:1', t: 'é' });
    expect(kv.getSync('missing')).toBeUndefined();
    expect(kv.prefixSync('story:')).toEqual([{ key: 'ffn:1', t: 'é' }, { key: 'ffn:2' }]);
    expect(kv.entriesSync('story:')).toEqual([
      ['story:ffn:1', { key: 'ffn:1', t: 'é' }],
      ['story:ffn:2', { key: 'ffn:2' }],
    ]);
    expect(kv.prefixSync('a_')).toEqual([1]);
    await kv.delete('story:ffn:1');
    await kv.deletePrefix('a');
    expect(kv.prefixSync('story')).toEqual([{ key: 'ffn:2' }, 'no']);
  });

  it('a new database starts at the current schema', () => {
    const { kv, migrationStatus } = loadKv();
    expect(migrationStatus()).toMatchObject({ ok: true, version: 2, migrated: true });
    expect(kv.getSync('schemaVersion')).toBe(2);
    expect(kv.writable).toBe(true);
  });
});

describe('chapterStore on SQLite', () => {
  it('saves, lists, sizes and removes chapter HTML by story key', async () => {
    const { chapterStore } = loadKv();
    await chapterStore.put('ffn:7', 2, '<p>two</p>');
    await chapterStore.put('ffn:7', 1, '<p>één</p>');
    await chapterStore.put('ffn:71', 1, '<p>x</p>');
    await chapterStore.put('ao3:7', 1, '<p>other site</p>', '250836176');
    expect(await chapterStore.get('ffn:7', 1)).toBe('<p>één</p>');
    expect(await chapterStore.get('ffn:7', 3)).toBeUndefined();
    expect(await chapterStore.get('ao3:7', 1)).toBe('<p>other site</p>');
    expect(await chapterStore.list('ffn:7')).toEqual([1, 2]);
    expect(await chapterStore.sizeBytes('ffn:7')).toBe('<p>één</p>'.length + '<p>two</p>'.length);
    expect(mockDb.getFirstSync('SELECT remote_id FROM chapter_text WHERE story_key = ?', 'ao3:7')).toEqual({ remote_id: '250836176' });
    await chapterStore.remove('ffn:7');
    expect(await chapterStore.list('ffn:7')).toEqual([]);
    expect(await chapterStore.list('ffn:71')).toEqual([1]);
    await chapterStore.removeAll();
    expect(await chapterStore.sizeBytes()).toBe(0);
  });

  it('renumbers saved chapters (swaps and drops included)', async () => {
    const { chapterStore } = loadKv();
    for (const n of [1, 2, 3, 4]) await chapterStore.put('ao3:9', n, `<p>${n}</p>`);
    await chapterStore.renumber(
      'ao3:9',
      new Map([
        [1, 2],
        [2, 1],
        [3, null],
      ]),
    );
    expect(await chapterStore.list('ao3:9')).toEqual([1, 2, 4]);
    expect(await chapterStore.get('ao3:9', 1)).toBe('<p>2</p>');
    expect(await chapterStore.get('ao3:9', 2)).toBe('<p>1</p>');
    expect(await chapterStore.get('ao3:9', 4)).toBe('<p>4</p>');
  });
});

describe('opening a v1 database', () => {
  it('migrates it, with a pre-upgrade copy when there is room', () => {
    const db = openNodeDb();
    seedV1Database(db);
    const { kv, chapterStore, migrationStatus } = loadKv(db);
    expect(migrationStatus()).toMatchObject({ ok: true, migrated: true, snapshot: true });
    expect(mockBackups).toEqual(['ficshelf-pre-v2.db']);
    expect(kv.getSync('story:ffn:1001')).toMatchObject({ key: 'ffn:1001' });
    expect(kv.getSync('story:1001')).toBeUndefined();
    return expect(chapterStore.list('ffn:1001')).resolves.toEqual([1, 2, 3]);
  });

  it('skips the copy when there is room to convert but not for a copy too', () => {
    const db = openNodeDb();
    seedV1Database(db);
    mockDisk.free = 30 * 1024 * 1024;
    try {
      const { migrationStatus } = loadKv(db);
      expect(migrationStatus()).toMatchObject({ ok: true, snapshot: false });
      expect(mockBackups).toEqual([]);
    } finally {
      mockDisk.free = 10 * 1024 ** 3;
    }
  });

  it('after a failed migration (here: no room to convert), writes nothing and leaves v1 exactly as it was', async () => {
    const db = openNodeDb();
    seedV1Database(db);
    db.execSync(SCHEMA_SQL);
    const before = kvDump(db);
    mockDisk.free = 1024;
    let mod!: KvModule;
    try {
      mod = loadKv(db);
      expect(mod.migrationStatus()).toMatchObject({ ok: false, version: 1, lowSpace: true });
    } finally {
      mockDisk.free = 10 * 1024 ** 3;
    }
    const { kv, chapterStore, migrationStatus } = mod;
    expect(migrationStatus().error).toMatch(/Not enough free space/);
    expect(kv.writable).toBe(false);
    await kv.set('story:1001', { wiped: true });
    await kv.delete('bookmarks');
    await kv.deletePrefix('story:');
    await chapterStore.put('ffn:1001', 1, 'overwritten');
    await chapterStore.removeAll();
    expect(kvDump(db)).toEqual(before);
    expect(db.getFirstSync('SELECT COUNT(*) AS n FROM chapters')).toEqual({ n: 4 });
    expect(db.getFirstSync('SELECT COUNT(*) AS n FROM chapter_text')).toEqual({ n: 0 });
  });

  it('stays read-only when the database can’t even be prepared (review)', async () => {
    const db = openNodeDb();
    seedV1Database(db);
    const before = kvDump(db);
    const exec = db.execSync.bind(db);
    let fail = true;
    db.execSync = (sql: string) => {
      if (fail && sql.includes('CREATE TABLE')) {
        fail = false;
        throw new Error('disk I/O error');
      }
      exec(sql);
    };
    const { kv, migrationStatus, retryMigration } = loadKv(db);
    expect(migrationStatus()).toMatchObject({ ok: false });
    expect(migrationStatus().error).toMatch(/couldn’t be prepared: disk I\/O error/);
    expect(kv.writable).toBe(false);
    await kv.set('story:1001', { wiped: true });
    expect(kvDump(db)).toEqual(before);
    // Retry prepares it and converts.
    expect(retryMigration()).toMatchObject({ ok: true, migrated: true });
    expect(kv.writable).toBe(true);
  });
});
