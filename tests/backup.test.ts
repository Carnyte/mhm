// Backup files: a v1 file (numeric FanFiction.net ids) restores as ffn: keys, and a v2 export
// restores to the same library.

import { storyV1toV2 } from '../src/db/migrations/v2';
import { v1Backup, v1Bookmarks, v1Collections, v1Stories } from './fixtures/v1-library';
import { mem, seed } from './helpers/memoryKv';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

type Library = typeof import('../src/state/library');

function loadLibrary(rows: [string, unknown][] = []): Library {
  seed(rows);
  let lib!: Library;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib = require('../src/state/library');
  });
  return lib;
}

/** The library state that matters for a round trip, without the export's dropped downloads. */
function snapshot(lib: Library) {
  const st = lib.libraryStore.get();
  return {
    stories: Object.fromEntries(Object.entries(st.stories).map(([k, s]) => [k, { ...s, downloaded: false, downloadedChapters: [] }])),
    authors: st.authors,
    bookmarks: st.bookmarks,
    collections: st.collections,
    drafts: st.drafts,
  };
}

describe('restoring a v1 backup file', () => {
  it('files every story under its ffn: key, with nothing lost', () => {
    const lib = loadLibrary();
    // Through JSON, as it comes from the file.
    const n = lib.importBackup(JSON.parse(JSON.stringify(v1Backup())));
    expect(n).toBe(v1Stories.length);
    const st = lib.libraryStore.get();
    for (const s of v1Stories) {
      expect(st.stories[`ffn:${s.id}`]).toEqual(storyV1toV2({ ...s, downloaded: false, downloadedChapters: [] } as never));
      expect(mem.get(`story:ffn:${s.id}`)).toEqual(st.stories[`ffn:${s.id}`]);
      expect(mem.has(`story:${s.id}`)).toBe(false);
    }
    expect(st.bookmarks.map((b) => [b.storyKey, b.storyId])).toEqual(v1Bookmarks.map((b) => [`ffn:${b.storyId}`, b.storyId]));
    expect(st.collections.map((c) => c.storyKeys)).toEqual(v1Collections.map((c) => c.storyIds.map((id) => `ffn:${id}`)));
    expect(Object.keys(st.authors).sort()).toEqual(['ffn:501', 'ffn:502']);
    expect(mem.get('author:ffn:501')).toMatchObject({ key: 'ffn:501', id: '501' });
    expect(st.drafts).toHaveLength(1);
  });

  it('a v1 file without a version field is read as v1', () => {
    const lib = loadLibrary();
    const { version: _v, ...noVersion } = v1Backup();
    expect(lib.importBackup(noVersion)).toBe(v1Stories.length);
    expect(lib.libraryStore.get().stories['ffn:3171550']).toMatchObject({ key: 'ffn:3171550', stats: { reviews: 300 } });
  });
});

describe('v2 backups', () => {
  it('round-trip: export, then restore into an empty library, gives the same library', () => {
    const source = loadLibrary();
    source.importBackup(v1Backup());
    source.upsertStory({ key: 'ao3:3171550', source: 'ao3', remoteId: '3171550', title: 'Same number, other site', summary: '', genres: [], chapters: 2, words: 10, stats: { kudos: 3 }, complete: true, inLibrary: false, addedAt: 1 }, { inLibrary: true });
    source.toggleInCollection('col-later', source.libraryStore.get().stories['ao3:3171550']);
    source.addBookmark({ storyKey: 'ao3:3171550', storyTitle: 'Same number, other site', chapter: 2, progress: 0.5 });
    const file = JSON.parse(JSON.stringify(source.exportBackup()));
    expect(file).toMatchObject({ app: 'ficshelf', version: 2 });
    const before = snapshot(source);

    const target = loadLibrary();
    expect(target.importBackup(file)).toBe(v1Stories.length + 1);
    expect(snapshot(target)).toEqual(before);
    expect(target.libraryStore.get().stories['ao3:3171550']).toMatchObject({ source: 'ao3', stats: { kudos: 3 } });
    expect(target.libraryStore.get().stories['ffn:3171550']).toMatchObject({ source: 'ffn', title: 'Crossroads' });

    // Restoring the same file again changes nothing.
    target.importBackup(file);
    expect(snapshot(target)).toEqual(before);
  });
});

describe('imported stories and backups', () => {
  const file = { kind: 'epub' as const, fileName: 'a.epub', importedAt: 1, size: 1, contentHash: 'md5:a', dir: 'imports/local_abc', cover: 'cover.jpg' };
  const local = {
    key: 'local:abc' as const,
    source: 'local' as const,
    remoteId: 'abc',
    title: 'Imported',
    summary: '',
    genres: [],
    chapters: 2,
    words: 10,
    stats: {},
    complete: true,
    inLibrary: true,
    downloaded: true,
    addedAt: 1,
    coverUrl: 'ficshelf-doc:imports/local_abc/cover.jpg',
    local: file,
  };
  const linked = {
    ...local,
    key: 'ao3:77' as const,
    source: 'ao3' as const,
    remoteId: '77',
    title: 'Linked',
    local: { ...file, dir: 'imports/ao3_77', origin: { source: 'ao3' as const, remoteId: '77', key: 'ao3:77' as const } },
  };

  it('are left out of the export with their bookmarks and collection entries; linked files are dropped', () => {
    const lib = loadLibrary();
    lib.upsertStory(local, local);
    lib.upsertStory(linked, linked);
    const col = lib.createCollection('Both');
    lib.toggleInCollection(col.id, lib.libraryStore.get().stories['local:abc']);
    lib.toggleInCollection(col.id, lib.libraryStore.get().stories['ao3:77']);
    lib.addBookmark({ storyKey: 'local:abc', storyTitle: 'Imported', chapter: 1, progress: 0.5, excerpt: 'Text from the file' });
    lib.addBookmark({ storyKey: 'ao3:77', storyTitle: 'Linked', chapter: 1, progress: 0.5 });

    const out = JSON.parse(JSON.stringify(lib.exportBackup()));
    expect(JSON.stringify(out)).not.toContain('local:abc');
    expect(out.stories.map((s: { key: string }) => s.key)).toEqual(['ao3:77']);
    expect(out.stories[0].local).toBeUndefined();
    expect(out.stories[0].coverUrl).toBeUndefined();
    expect(out.stories[0].downloaded).toBe(false);
    expect(out.bookmarks.map((b: { storyKey: string }) => b.storyKey)).toEqual(['ao3:77']);
    expect(out.collections[0].storyKeys).toEqual(['ao3:77']);
    // The library itself is untouched.
    expect(lib.libraryStore.get().stories['local:abc'].local).toEqual(file);
  });

  it('restore: an imported story counts only when it’s on this device (its progress merges)', () => {
    const backup = {
      app: 'ficshelf',
      version: 2,
      exportedAt: 1,
      stories: [
        { ...local, readChapters: [1], lastReadAt: 50 },
        { ...local, key: 'local:elsewhere', remoteId: 'elsewhere', local: { ...file, dir: 'imports/local_elsewhere' } },
        { ...linked, key: 'ao3:88', remoteId: '88', local: { ...linked.local, dir: '../../escape' } },
      ],
      bookmarks: [
        { id: 'b1', storyKey: 'local:elsewhere', storyTitle: 'x', chapter: 1, progress: 0, createdAt: 1 },
        { id: 'b2', storyKey: 'local:abc', storyTitle: 'x', chapter: 2, progress: 0, createdAt: 1 },
      ],
      collections: [{ id: 'c1', name: 'C', storyKeys: ['local:elsewhere', 'ao3:88', 'local:abc'], createdAt: 1 }],
      authors: [],
      drafts: [],
    };
    const lib = loadLibrary();
    lib.upsertStory(local, { ...local, readChapters: [2], lastReadAt: 10 });

    expect(lib.importBackup(JSON.parse(JSON.stringify(backup)))).toBe(2);
    const st = lib.libraryStore.get();
    expect(Object.keys(st.stories).sort()).toEqual(['ao3:88', 'local:abc']);
    expect(st.stories['local:abc']).toMatchObject({ readChapters: [1, 2], lastReadAt: 50, local: file, coverUrl: local.coverUrl });
    // A site story's linked file is on the device that made the backup.
    expect(st.stories['ao3:88'].local).toBeUndefined();
    expect(st.stories['ao3:88'].coverUrl).toBeUndefined();
    expect(st.bookmarks.map((b) => b.id)).toEqual(['b2']);
    expect(st.collections[0].storyKeys).toEqual(['ao3:88', 'local:abc']);
  });
});
