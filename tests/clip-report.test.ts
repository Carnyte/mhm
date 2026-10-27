// "What Clip sees" (src/features/clipReport.ts): sizes, counts and control labels only; never the
// chapter's text, its title, or link addresses.

import { clipReport } from '../src/features/clipReport';
import type { ImportedBook } from '../src/import/types';

const book: ImportedBook = {
  kind: 'html',
  generator: 'clip',
  title: 'SECRET-STORY-TITLE',
  authors: ['SECRET-AUTHOR'],
  words: 1234,
  chapters: [{ title: 'SECRET-CHAPTER-TITLE', html: '<p>SECRET-TEXT lorem ipsum</p>', words: 1234 }],
  images: [],
  warnings: ['Left out about 50 words'],
};

it('reports how the page reads, without its text', () => {
  const r = clipReport({
    host: 'reads.example.com',
    titleLength: 31,
    htmlLength: 54321,
    dropped: 7,
    capped: false,
    book,
    next: {
      type: 'ficshelf-next',
      nonce: 'n',
      action: 'report',
      url: 'https://reads.example.com/c/1?token=SECRET-URL',
      found: true,
      label: 'Next chapter',
      kind: 'button',
      score: 40,
      candidates: 1,
      fp: 'abc:10',
      lock: ['Unlock (5 coins)'],
      botWidget: true,
      report: [
        { label: 'Next chapter', tag: 'button', kind: 'button', score: 40 },
        { label: 'Buy next', tag: 'a', kind: 'link', score: 30, locked: true },
      ],
    },
  });
  expect(r).toContain('Site: reads.example.com');
  expect(r).toContain('Page title: 31 characters');
  expect(r).toContain('Captured page: 54,321 characters · hidden parts left out: 7 · checked all of it for hidden text: yes');
  expect(r).toContain('Text found: 1,234 words');
  expect(r).toContain('Next: “Next chapter” (button, score 40) · usable: 1');
  expect(r).toContain('2. “Buy next” <a> link, score 30 (looks like buying / unlocking)');
  expect(r).toContain('Lock signals: “Unlock (5 coins)”');
  expect(r).toContain('Bot check: a captcha widget shows');
  expect(r).not.toMatch(/SECRET/);
});

it('says what failed', () => {
  const r = clipReport({ host: 'x.example', titleLength: 0, error: 'The page doesn’t show any story text yet.', nextError: 'The page didn’t answer.' });
  expect(r).toContain('Clip says: The page doesn’t show any story text yet.');
  expect(r).toContain('Next finder: The page didn’t answer.');
});
