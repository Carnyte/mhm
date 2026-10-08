/** @jest-environment node */
// Storage v2 migration on real SQLite (node:sqlite): the v1 fixture converted losslessly in one
// transaction, re-runs, rows an older build writes afterwards, a failed check rolling everything
// back, and the pre-upgrade copy.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations, SCHEMA_SQL, schemaVersion, type MigrationEnv } from '../src/db/migrations';
import {
  authorV1toV2,
  bookmarksV2,
  collectionsV2,
  drainLegacy,
  mergeStory,
  migrateV2,
  normalizeStory,
  pinsV2,
  positionsV2,
  searchesV2,
  settingsV2,
  storyV1toV2,
} from '../src/db/migrations/v2';
import type { LibraryStory } from '../src/state/library';
import {
  NOW,
  seedV1Database,
  v1Authors,
  v1Bookmarks,
  v1Chapters,
  v1Collections,
  v1Drafts,
  v1LastSync,
  v1ListenPositions,
  v1MyUser,
  v1Searches,
  v1Settings,
  v1Stories,
  type V1Story,
} from './fixtures/v1-library';
import { kvDump, openNodeDb, type NodeDb } from './helpers/sqliteNode';

/** A database exactly as the v1 app left it, opened the way kv.ts opens it (new tables added). */
function v1Db(path?: string): NodeDb {
  const db = openNodeDb(path);
  seedV1Database(db);
  db.execSync(SCHEMA_SQL);
  return db;
}

const get = (db: NodeDb, key: string) => {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? JSON.parse(row.value) : undefined;
};
const legacyRows = (db: NodeDb) => db.getAllSync<{ key: string }>("SELECT key FROM kv WHERE key GLOB 'story:[0-9]*' OR key GLOB 'author:[0-9]*'");
const chapterText = (db: NodeDb) => db.getAllSync('SELECT story_key, number, html, saved_at, remote_id FROM chapter_text ORDER BY story_key, number');
const totals = (db: NodeDb, table: 'chapters' | 'chapter_text') =>
  db.getFirstSync<{ n: number; bytes: number; chars: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(CAST(html AS BLOB))), 0) AS bytes, COALESCE(SUM(LENGTH(html)), 0) AS chars FROM ${table}`,
  )!;
const v2Of = (s: V1Story) => storyV1toV2(s as never);

/** What v1 → v2 must produce for a story: every field kept, only the renamed ones moved. */
function expectedV2(s: V1Story) {
  const { id, reviews, favs, follows, storyTextId, ...rest } = s;
  return { ...rest, key: `ffn:${id}`, source: 'ffn', remoteId: String(id), stats: { reviews, favs, follows }, ...(storyTextId ? { ffn: { storyTextId } } : {}) };
}

describe('pure transforms', () => {
  it('storyV1toV2 keeps every field and moves only id, stats and the review id', () => {
    for (const s of v1Stories) {
      const v2 = v2Of(s);
      expect(v2).toEqual(expectedV2(s));
      expect(v2).not.toHaveProperty('id');
      expect(normalizeStory(v2)).toEqual(v2); // idempotent
    }
  });

  it('a v2 record an older build rewrote takes its newer top-level FFN values', () => {
    const v2 = v2Of(v1Stories[0]);
    const rewritten = { ...v2, id: 1001, reviews: 90, favs: 121, follows: 141, storyTextId: 88 };
    expect(normalizeStory(rewritten)).toEqual({ ...v2, stats: { reviews: 90, favs: 121, follows: 141 }, ffn: { storyTextId: 88 } });
    expect(normalizeStory({ title: 'no id' })).toBeNull();
    expect(normalizeStory({ id: 5, title: 'x' }, 'ffn:6')?.key).toBe('ffn:6'); // where it's stored decides
  });

  it('mergeStory loses nothing either side knows', () => {
    const cur: LibraryStory = { ...v2Of(v1Stories[0]), lastCheckedAt: NOW - 1000, chapters: 3 };
    const other: LibraryStory = {
      ...cur,
      title: 'Old title',
      readChapters: [3],
      downloadedChapters: [4],
      chapterProgress: { '3': 1, '4': 0.2 },
      lastReadAt: NOW,
      lastChapter: 4,
      lastProgress: 0.2,
      knownChapters: 4,
      chapters: 4,
      inLibrary: false,
      favorited: true,
      notify: false,
      lastCheckedAt: NOW - 5000,
      addedAt: NOW - 99 * 86_400_000,
    };
    const m = mergeStory(cur, other);
    expect(m).toMatchObject({
      key: 'ffn:1001',
      title: 'The Long Way Home', // metadata from the more recently checked record
      readChapters: [1, 2, 3],
      downloadedChapters: [1, 2, 3, 4],
      chapterProgress: { '1': 1, '2': 1, '3': 1, '4': 0.2 },
      lastReadAt: NOW,
      lastChapter: 4, // position from the more recently read record
      lastProgress: 0.2,
      knownChapters: 4,
      chapters: 4,
      inLibrary: true,
      followed: true,
      favorited: true,
      downloaded: true,
      notify: false,
      addedAt: NOW - 99 * 86_400_000,
      lastCheckedAt: NOW - 1000,
    });
  });

  it('authors get a source-qualified key', () => {
    expect(authorV1toV2(v1Authors[0])).toEqual({ key: 'ffn:501', source: 'ffn', id: '501', name: 'Quill Feather', followed: true });
  });

  it('bookmarks get storyKey and keep storyId for FFN; the result is stable', () => {
    const v2 = bookmarksV2(v1Bookmarks);
    expect(v2).toEqual(v1Bookmarks.map((b) => ({ ...b, storyKey: `ffn:${b.storyId}` })));
    expect(bookmarksV2(v2)).toEqual(v2);
    // An older build only knows storyId, so it decides for FFN; other sites keep their key.
    expect(bookmarksV2([{ id: 'x', storyKey: 'ffn:1', storyId: 2, chapter: 1, progress: 0 }])[0]).toMatchObject({ storyKey: 'ffn:2', storyId: 2 });
    expect(bookmarksV2([{ id: 'y', storyKey: 'ao3:5', chapter: 1, progress: 0 }])[0]).not.toHaveProperty('storyId');
    expect(bookmarksV2([{ id: 'z', chapter: 1 }, null, 'junk'])).toEqual([]);
  });

  it('collections keep their order; FFN membership follows storyIds, other sites follow storyKeys', () => {
    const v2 = collectionsV2(v1Collections);
    expect(v2.map((c) => c.storyKeys)).toEqual([
      ['ffn:1004', 'ffn:3171550', 'ffn:1001'],
      ['ffn:1002', 'ffn:3171550'],
    ]);
    expect(v2.map((c) => c.storyIds)).toEqual(v1Collections.map((c) => c.storyIds));
    expect(collectionsV2(v2)).toEqual(v2);
    // An older build removed 1004 and added 7; an AO3 work sits in the middle.
    const edited = { ...v2[0], storyKeys: ['ffn:1004', 'ao3:3171550', 'ffn:3171550', 'ffn:1001'], storyIds: [3171550, 1001, 7] };
    expect(collectionsV2([edited])[0]).toMatchObject({ storyKeys: ['ao3:3171550', 'ffn:3171550', 'ffn:1001', 'ffn:7'], storyIds: [3171550, 1001, 7] });
  });

  it('listening positions are re-keyed; the newer of two entries for a story wins', () => {
    expect(positionsV2(v1ListenPositions)).toEqual({ 'ffn:1001': v1ListenPositions['1001'], 'ffn:1003': v1ListenPositions['1003'] });
    const mixed = { '7': { chapter: 2, index: 1, at: 5 }, 'ffn:7': { chapter: 1, index: 0, at: 3 }, bad: { chapter: 1, index: 0, at: 9 } };
    expect(positionsV2(mixed)).toEqual({ 'ffn:7': { chapter: 2, index: 1, at: 5 } });
    expect(positionsV2(positionsV2(mixed))).toEqual(positionsV2(mixed));
  });

  it('searches and pins are FanFiction.net ones; the rest of the settings is untouched', () => {
    expect(searchesV2(v1Searches)).toEqual(v1Searches.map((s) => ({ ...s, source: 'ffn' })));
    expect(pinsV2([{ name: 'A', path: '/a/', source: 'ao3' }])).toEqual([{ name: 'A', path: '/a/', source: 'ao3' }]);
    expect(settingsV2(v1Settings)).toEqual({ ...v1Settings, pinnedFandoms: v1Settings.pinnedFandoms.map((p) => ({ ...p, source: 'ffn' })) });
  });
});

describe('migrating the v1 fixture on SQLite', () => {
  it('moves every story to story:ffn:<id> with key, source, remoteId and stats', () => {
    const db = v1Db();
    const r = runMigrations(db);
    expect(r).toMatchObject({ ok: true, version: 2, migrated: true, counts: { stories: 6, authors: 2, chapters: 4, bookmarks: 3, collections: 2, positions: 2 } });
    expect(schemaVersion(db)).toBe(2);
    for (const s of v1Stories) expect(get(db, `story:ffn:${s.id}`)).toEqual(expectedV2(s));
    for (const a of v1Authors) expect(get(db, `author:ffn:${a.id}`)).toEqual(authorV1toV2(a));
    expect(legacyRows(db)).toEqual([]);
    expect(get(db, 'migration:v2')).toMatchObject({ snapshot: false, counts: { stories: 6 } });
  });

  it('keeps bookmarks, collection order, listening positions and the other blobs', () => {
    const db = v1Db();
    const before = kvDump(db);
    runMigrations(db);
    const after = kvDump(db);
    expect(get(db, 'bookmarks')).toEqual(v1Bookmarks.map((b) => ({ ...b, storyKey: `ffn:${b.storyId}` })));
    expect(get(db, 'collections')).toEqual(v1Collections.map((c) => ({ ...c, storyKeys: c.storyIds.map((id) => `ffn:${id}`) })));
    expect(get(db, 'listenPositions')).toEqual({ 'ffn:1001': v1ListenPositions['1001'], 'ffn:1003': v1ListenPositions['1003'] });
    expect(get(db, 'searches')).toEqual(v1Searches.map((s) => ({ ...s, source: 'ffn' })));
    expect(get(db, 'settings')).toEqual({ ...v1Settings, pinnedFandoms: v1Settings.pinnedFandoms.map((p) => ({ ...p, source: 'ffn' })) });
    // Blobs v2 doesn't change stay byte for byte the same.
    for (const k of ['drafts', 'lastSync', 'myUser']) expect(after[k]).toBe(before[k]);
    expect(JSON.parse(after.drafts)).toEqual(v1Drafts);
    expect(JSON.parse(after.lastSync)).toBe(v1LastSync);
    expect(JSON.parse(after.myUser)).toEqual(v1MyUser);
  });

  it('copies every chapter row exactly: same count, same bytes, legacy table emptied', () => {
    const db = v1Db();
    const before = totals(db, 'chapters');
    runMigrations(db);
    expect(totals(db, 'chapter_text')).toEqual(before);
    expect(before.bytes).toBeGreaterThan(before.chars); // the fixture has multi-byte text
    expect(chapterText(db)).toEqual(
      v1Chapters
        .map((c) => ({ story_key: `ffn:${c.storyId}`, number: c.number, html: c.html, saved_at: c.savedAt, remote_id: null }))
        .sort((a, b) => (a.story_key < b.story_key ? -1 : a.story_key > b.story_key ? 1 : a.number - b.number)),
    );
    expect(totals(db, 'chapters').n).toBe(0);
  });

  it('does nothing the second time', () => {
    const db = v1Db();
    runMigrations(db);
    const dump = kvDump(db);
    const chapters = chapterText(db);
    const again = runMigrations(db);
    expect(again).toEqual({ ok: true, version: 2 });
    expect(kvDump(db)).toEqual(dump);
    expect(chapterText(db)).toEqual(chapters);
    expect(drainLegacy(db)).toEqual({});
  });

  it('drains and merges what an older build writes after the upgrade', () => {
    const db = v1Db();
    runMigrations(db);
    // The older build: reads chapter 3 of 1001, saves a new story, follows an author, caches
    // chapters, adds a bookmark and edits a collection — all in the v1 format.
    const old = { ...v1Stories[0], readChapters: [1, 2, 3], lastReadAt: NOW + 1000, lastChapter: 3, lastProgress: 1, chapterProgress: { '3': 1 } };
    const fresh: V1Story = { ...v1Stories[4], id: 2002, title: 'New in the old build', lastReadAt: NOW + 500 };
    db.runSync('INSERT INTO kv (key, value) VALUES (?, ?)', 'story:1001', JSON.stringify(old));
    db.runSync('INSERT INTO kv (key, value) VALUES (?, ?)', 'story:2002', JSON.stringify(fresh));
    db.runSync('INSERT INTO kv (key, value) VALUES (?, ?)', 'author:777', JSON.stringify({ id: 777, name: 'Late', favorited: true }));
    db.runSync('INSERT INTO chapters VALUES (?, ?, ?, ?)', 1001, 4, '<p>four</p>', NOW);
    db.runSync('INSERT INTO chapters VALUES (?, ?, ?, ?)', 2002, 1, '<p>new</p>', NOW);
    const bookmarks = get(db, 'bookmarks');
    db.runSync("UPDATE kv SET value = ? WHERE key = 'bookmarks'", JSON.stringify([{ id: 'bm-old', storyId: 2002, storyTitle: 'x', chapter: 1, progress: 0.5, createdAt: NOW }, ...bookmarks]));
    const cols = get(db, 'collections');
    cols[0].storyIds = [3171550, 1001, 2002]; // removed 1004, added 2002 (storyKeys untouched)
    db.runSync("UPDATE kv SET value = ? WHERE key = 'collections'", JSON.stringify(cols));

    const r = runMigrations(db);
    expect(r).toMatchObject({ ok: true, version: 2, drained: { stories: 2, authors: 1, chapters: 2 } });
    expect(legacyRows(db)).toEqual([]);
    expect(totals(db, 'chapters').n).toBe(0);
    expect(get(db, 'story:ffn:1001')).toMatchObject({
      readChapters: [1, 2, 3],
      lastReadAt: NOW + 1000,
      lastProgress: 1,
      chapterProgress: { '1': 1, '2': 1, '3': 1 },
      downloaded: true,
      downloadedChapters: [1, 2, 3],
      followed: true,
      ffn: { storyTextId: 77_001 },
    });
    expect(get(db, 'story:ffn:2002')).toMatchObject({ key: 'ffn:2002', title: 'New in the old build' });
    expect(get(db, 'author:ffn:777')).toMatchObject({ key: 'ffn:777', favorited: true });
    expect(db.getFirstSync("SELECT html FROM chapter_text WHERE story_key = 'ffn:1001' AND number = 4")).toEqual({ html: '<p>four</p>' });
    expect(db.getFirstSync("SELECT html FROM chapter_text WHERE story_key = 'ffn:2002' AND number = 1")).toEqual({ html: '<p>new</p>' });
    // Blobs are normalised when read.
    expect(bookmarksV2(get(db, 'bookmarks'))[0]).toMatchObject({ id: 'bm-old', storyKey: 'ffn:2002', storyId: 2002 });
    expect(collectionsV2(get(db, 'collections'))[0].storyKeys).toEqual(['ffn:3171550', 'ffn:1001', 'ffn:2002']);
  });
});

describe('when a check fails', () => {
  const failing = (corrupt: (db: NodeDb) => void): MigrationEnv => ({ beforeVerify: (db) => corrupt(db as NodeDb) });

  it.each([
    ['a chapter copy differs', (db: NodeDb) => db.runSync("UPDATE chapter_text SET html = 'x' WHERE story_key = 'ffn:1001' AND number = 2")],
    ['a chapter copy is missing', (db: NodeDb) => db.runSync("DELETE FROM chapter_text WHERE story_key = 'ffn:1005'")],
    ['a story row is missing', (db: NodeDb) => db.runSync("DELETE FROM kv WHERE key = 'story:ffn:1003'")],
    ['a story lost read chapters', (db: NodeDb) => db.runSync("UPDATE kv SET value = json_set(value, '$.readChapters', json('[]')) WHERE key = 'story:ffn:1001'")],
    ['a bookmark went missing', (db: NodeDb) => db.runSync("UPDATE kv SET value = '[]' WHERE key = 'bookmarks'")],
  ])('rolls back when %s, leaving v1 byte-identical, and reports failure', (_what, corrupt) => {
    const db = v1Db();
    const kvBefore = kvDump(db);
    const chaptersBefore = db.getAllSync('SELECT * FROM chapters ORDER BY story_id, number');
    const r = runMigrations(db, failing(corrupt));
    expect(r.ok).toBe(false);
    expect(r.version).toBe(1);
    expect(r.error).toMatch(/Check failed/);
    expect(kvDump(db)).toEqual(kvBefore);
    expect(db.getAllSync('SELECT * FROM chapters ORDER BY story_id, number')).toEqual(chaptersBefore);
    expect(chapterText(db)).toEqual([]);
    expect(schemaVersion(db)).toBe(1);
    // Nothing is stuck: the next attempt converts it.
    expect(runMigrations(db)).toMatchObject({ ok: true, migrated: true });
  });

  it('an unreadable row fails the migration instead of being dropped', () => {
    const db = v1Db();
    db.runSync("INSERT INTO kv (key, value) VALUES ('story:99', '{broken')");
    const before = kvDump(db);
    expect(migrateV2(db)).toMatchObject({ ok: false });
    expect(kvDump(db)).toEqual(before);
  });
});

describe('pre-upgrade copy', () => {
  const GB = 1024 ** 3;

  it('is taken before anything changes when there is room', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ficshelf-'));
    const db = v1Db(join(dir, 'ficshelf.db'));
    const snap = join(dir, 'ficshelf-pre-v2.db');
    const r = runMigrations(db, { freeBytes: () => 10 * GB, snapshot: () => db.execSync(`VACUUM INTO '${snap}'`) });
    expect(r).toMatchObject({ ok: true, snapshot: true });
    expect(get(db, 'migration:v2')).toMatchObject({ snapshot: true });
    const copy = openNodeDb(snap);
    try {
      expect(get(copy, 'story:1001')).toEqual(v1Stories[0]);
      expect(totals(copy, 'chapters')).toEqual(totals(db, 'chapter_text'));
    } finally {
      copy.closeSync();
      db.closeSync();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is skipped when the phone is short of space, and the upgrade still runs', () => {
    const db = v1Db();
    const snapshot = jest.fn();
    // Needs 2 × the database + 50 MB free.
    const r = runMigrations(db, { freeBytes: () => 50 * 1024 * 1024, snapshot });
    expect(snapshot).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, migrated: true, snapshot: false });
  });

  it('a failing copy or disk query does not block the upgrade', () => {
    const r1 = runMigrations(v1Db(), {
      freeBytes: () => 10 * GB,
      snapshot: () => {
        throw new Error('disk full');
      },
    });
    expect(r1).toMatchObject({ ok: true, snapshot: false });
    const r2 = runMigrations(v1Db(), {
      freeBytes: () => {
        throw new Error('unavailable');
      },
      snapshot: jest.fn(),
    });
    expect(r2).toMatchObject({ ok: true, snapshot: false });
  });

  it('is not taken for a new install', () => {
    const db = openNodeDb();
    db.execSync(SCHEMA_SQL);
    const snapshot = jest.fn();
    expect(runMigrations(db, { freeBytes: () => 10 * GB, snapshot })).toMatchObject({ ok: true, snapshot: false });
    expect(snapshot).not.toHaveBeenCalled();
  });
});
