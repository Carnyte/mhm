// The reader page for imported stories: a CSP whose script nonce only the reader's own two
// scripts carry (fresh per page), the book's pictures swapped in as data: URIs read from the
// story's folder, web pictures taken out (the CSP would block them), and pages for the sites left
// as they were.

import { files, putFile, reset as resetFs } from './helpers/fakeFs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule());
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { chapterImages } from '../src/features/importFiles';
import { withBookImages } from '../src/reader/images';
import { buildReaderHtml, type ReaderPayload } from '../src/reader/template';
import type { StoryKey } from '../src/sources/keys';
import { getSource } from '../src/sources/registry';
import { libraryStore, upsertStory, type LibraryStory } from '../src/state/library';
import { DEFAULT_READER } from '../src/state/settings';
import { READER_THEMES } from '../src/theme';

const payload: ReaderPayload = { html: '<p>Text</p>', title: 'Story', chapterTitle: '1. One', chapter: 1, chapters: 3, storyTitle: 'Story', hasNext: true, progress: 0 };
const build = (p: Partial<ReaderPayload> = {}) => buildReaderHtml({ ...payload, ...p }, DEFAULT_READER, READER_THEMES[0]);

describe('the reader page’s policy', () => {
  it('lets only the reader’s own scripts run on an imported story’s page', () => {
    const html = build({ csp: getSource('local').reader.csp, html: '<p>Text</p><script>alert(1)</script>' });
    const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)![1];
    const nonce = policy.match(/script-src 'nonce-([0-9a-f]{32})'/)![1];
    expect(policy).toBe(`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`);
    expect(policy).not.toContain('{nonce}');
    const tags = html.match(/<script[^>]*>/g)!;
    // The chapter's own script (if one ever got past the sanitizer) has no nonce; the reader's two do.
    expect(tags).toEqual(['<script>', `<script nonce="${nonce}">`, `<script nonce="${nonce}">`]);
    expect(html).toContain(`<script nonce="${nonce}">window.__init(`);
    // A new page, a new nonce.
    expect(build({ csp: getSource('local').reader.csp })).not.toContain(nonce);
  });

  it('leaves the sites’ pages without a policy or nonces', () => {
    for (const id of ['ffn', 'ao3'] as const) {
      const html = build({ csp: getSource(id).reader.csp });
      expect(html).not.toContain('Content-Security-Policy');
      expect(html).not.toContain('nonce');
    }
  });

  it('jumps to footnotes on the page instead of handing # links to the app', () => {
    const html = build();
    expect(html).toContain("if(href.charAt(0)==='#')");
    expect(html).toContain('document.getElementById(id)||document.getElementsByName(id)[0]');
  });
});

describe('pictures in imported chapters', () => {
  it('points the book’s pictures at data: URIs and drops the ones it can’t show', () => {
    const html = '<p>a<img alt="boat" src="ficshelf-img:0"> b<img src="ficshelf-img:7" alt="gone"> c<img src="https://example.com/x.png" alt="web"></p>';
    expect(withBookImages(html, { 0: 'data:image/png;base64,AAA' }, { webImages: false })).toBe('<p>a<img alt="boat" src="data:image/png;base64,AAA"> b c</p>');
    // A site's page keeps its web pictures.
    expect(withBookImages(html, { 0: 'data:image/png;base64,AAA' }, { webImages: true })).toContain('src="https://example.com/x.png"');
    expect(withBookImages('<p>plain</p>', undefined, { webImages: false })).toBe('<p>plain</p>');
  });

  it('reads them from the story’s folder, only the ones the chapter shows', async () => {
    resetFs();
    const key = 'local:abc' as StoryKey;
    const rec = {
      key,
      source: 'local',
      remoteId: 'abc',
      title: 'T',
      summary: '',
      genres: [],
      chapters: 1,
      words: 1,
      stats: {},
      complete: true,
      inLibrary: true,
      addedAt: 1,
      local: { kind: 'epub', fileName: 'a.epub', importedAt: 1, size: 1, contentHash: 'x', dir: 'imports/local_abc', images: { 0: 'img/0.png', 1: 'img/1.jpg', 2: 'img/2.gif' } },
    } as LibraryStory;
    upsertStory(rec, rec);
    putFile('docs/imports/local_abc/img/0.png', new Uint8Array([1, 2, 3]));
    putFile('docs/imports/local_abc/img/1.jpg', new Uint8Array([4]));
    const images = await chapterImages(key, '<img src="ficshelf-img:0"><img src="ficshelf-img:2"><img src="ficshelf-img:9">');
    expect(images).toEqual({ 0: `data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}` });
    expect(files.size).toBe(2);
    libraryStore.set((s) => ({ ...s, stories: {} }));
    await expect(chapterImages(key, '<img src="ficshelf-img:0">')).resolves.toEqual({});
  });
});
