// The reader page: the end-of-chapter buttons come from the story's site (FanFiction.net still
// shows "Write a review" where it always did), author's-note asides get their own styling, and a
// page for imported files can carry a Content-Security-Policy.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule());

import { buildReaderHtml, type ReaderPayload } from '../src/reader/template';
import { DEFAULT_READER } from '../src/state/settings';
import { READER_THEMES } from '../src/theme';

const payload: ReaderPayload = {
  html: '<p>Text</p>',
  title: 'Story',
  chapterTitle: '1. One',
  chapter: 1,
  chapters: 3,
  storyTitle: 'Story',
  hasNext: true,
  progress: 0,
};
const build = (p: Partial<ReaderPayload> = {}) => buildReaderHtml({ ...payload, ...p }, DEFAULT_READER, READER_THEMES[0]);
const endOf = (html: string) => html.slice(html.indexOf('<div class="end" id="end">'), html.indexOf('<script>'));

describe('reader page', () => {
  it('puts the site’s end-of-chapter buttons before Bookmark', () => {
    const html = build({ endActions: [{ id: 'review', label: 'Write a review' }] });
    expect(endOf(html)).toContain('<div><button class="alt" data-action="review">Write a review</button><button class="alt" id="mark">Bookmark</button></div>');
    expect(endOf(html)).toContain('<button id="next">Next chapter →</button>');
    // A tap on one posts {type:'action', id}.
    expect(html).toContain("closest('#end [data-action]')");
    expect(html).toContain("post({type:'action',id:act.getAttribute('data-action')})");
  });

  it('shows only Bookmark for a site without end buttons, and escapes labels', () => {
    expect(endOf(build())).toContain('<div><button class="alt" id="mark">Bookmark</button></div>');
    expect(endOf(build({ endActions: [{ id: 'a"b', label: '<b>Kudos</b>' }] }))).toContain('<button class="alt" data-action="a&quot;b">&lt;b&gt;Kudos&lt;/b&gt;</button>');
  });

  it('styles author’s-note asides', () => {
    expect(build()).toMatch(/#text aside\.fs-notes\{[^}]*border-left/);
    expect(build()).toContain('#text aside.fs-notes[data-pos=after]');
  });

  it('adds a CSP only when the site has one', () => {
    expect(build()).not.toContain('Content-Security-Policy');
    expect(build({ csp: "default-src 'none'" })).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'">`);
  });
});

describe('Literata on the reader page', () => {
  const withFont = (font: string) => buildReaderHtml(payload, { ...DEFAULT_READER, font }, READER_THEMES[0]);

  it('embeds the font only when Literata is the chosen font', () => {
    const html = withFont('Literata');
    expect(html.match(/@font-face\{font-family:'Literata';src:url\(data:font\/woff2;base64,/g)).toHaveLength(3);
    expect(html).toContain("--font:'Literata', Georgia, serif");
    expect(withFont('Georgia')).not.toContain('@font-face');
  });

  it('embeds real WOFF2 data for regular, italic and bold', () => {
    const faces = [...withFont('Literata').matchAll(/base64,([A-Za-z0-9+/=]+)\) format\('woff2'\);font-weight:(\d+);font-style:(\w+)/g)];
    expect(faces.map((m) => `${m[2]} ${m[3]}`)).toEqual(['400 normal', '400 italic', '700 normal']);
    for (const m of faces) {
      const bytes = Buffer.from(m[1], 'base64');
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
      expect(bytes.length).toBeGreaterThan(20_000);
      expect(bytes.length).toBeLessThan(90_000);
    }
  });
});
