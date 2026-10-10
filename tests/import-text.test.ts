// Importing plain text and Markdown: chapter headings found, hard-wrapped lines joined back into
// paragraphs (FanFicFare's TXT), files without chapters kept whole, Markdown's own syntax.

import { parseImport } from '../src/import';
import { inlineMarkdown } from '../src/import/text';

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const paras = (html: string) => [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);

/** Words wrapped at `width` columns, the way FanFicFare writes its TXT. */
function wrap(s: string, width = 78): string {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && line.length + 1 + w.length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}

const long = (label: string) =>
  `${label} begins here and keeps going with plenty of ordinary words so that the line has to wrap more than once at the column limit, like real prose would, before it finally reaches its end.`;

const fffTxt = () =>
  [
    '',
    '',
    '',
    'Lantern Weather',
    '',
    'by Quiet Owl',
    '',
    '',
    '',
    'Category: Sample Saga, Another Fandom With A Long Name, Yet Another Fandom',
    'Name, Last One',
    'Genre: Drama, Mystery',
    'Status: In-Progress',
    'Published: 2019-05-06',
    'Updated: 2019-08-09',
    'Packaged: 2026-10-08 06:34:04',
    'Story URL: https://archiveofourown.org/works/4242',
    wrap('Summary: A keeper and a storm, told slowly over several wrapped lines of summary text that go on.'),
    '',
    '',
    '',
    '',
    '',
    'TABLE OF CONTENTS',
    '',
    '',
    'Prologue',
    '',
    'Chapter 1, Arrival',
    '',
    '',
    '',
    '',
    '        Prologue',
    '',
    '',
    '### Before',
    '',
    wrap(long('The prologue paragraph')),
    '',
    wrap(`${long('Second prologue paragraph with _italics_ and **bold**')}`),
    '',
    '* * *',
    '',
    wrap(long('After the break')),
    '',
    '',
    '',
    '',
    '        Chapter 1, Arrival: a title long enough that FanFicFare wraps it onto',
    'a second line',
    '',
    '',
    // FanFicFare marks a line break inside a paragraph with two trailing spaces.
    wrap(long('The first chapter paragraph')) + '  ',
    'A short line.',
    '',
    'Yes.',
    wrap(long('The answer')),
    '',
    wrap(long('Another first chapter paragraph')),
    '',
    '',
    '',
    '',
    'End file.',
  ].join('\n');

describe('FanFicFare TXT', () => {
  it('finds its chapters, joins wrapped lines back into paragraphs and reads its header', async () => {
    const book = await parseImport(bytes(fffTxt()), 'Lantern Weather-ffnet_4242.txt');
    expect(book).toMatchObject({
      kind: 'txt',
      generator: 'fanficfare',
      title: 'Lantern Weather',
      authors: ['Quiet Owl'],
      complete: false,
      published: Date.UTC(2019, 4, 6, 12),
      updated: Date.UTC(2019, 7, 9, 12),
      origin: { source: 'ao3', remoteId: '4242' },
      summary: 'A keeper and a storm, told slowly over several wrapped lines of summary text that go on.',
    });
    expect(book.tags).toEqual(expect.arrayContaining([{ kind: 'fandom', label: 'Yet Another Fandom Name' }, { kind: 'genre', label: 'Mystery' }]));
    expect(book.chapters.map((c) => c.title)).toEqual(['Prologue', 'Chapter 1, Arrival: a title long enough that FanFicFare wraps it onto a second line']);
    const [pro, ch1] = book.chapters.map((c) => c.html);
    expect(pro).toMatch(/^<h3>Before<\/h3>/);
    expect(paras(pro)[0]).toBe(long('The prologue paragraph'));
    expect(paras(pro)[1]).toBe(long('Second prologue paragraph with <em>italics</em> and <strong>bold</strong>'));
    expect(pro).toContain('<hr>');
    // A short line inside a wrapped paragraph is a real line break.
    expect(paras(ch1)[0]).toBe(`${long('The first chapter paragraph')}<br>A short line.`);
    expect(paras(ch1)[1]).toBe(`Yes.<br>${long('The answer')}`);
    expect(ch1).not.toContain('End file');
    expect(text(pro + ch1)).not.toMatch(/TABLE OF CONTENTS|Packaged/);
  });
});

describe('plain text', () => {
  it('keeps a file without chapters whole, with its title and author from the top', async () => {
    const src = 'The Quiet Night\n\nby Someone Else\n\nIt was quiet.\n\nThen it was not.\nShe looked up.\n';
    const book = await parseImport(bytes(src), 'quiet.txt');
    expect(book).toMatchObject({ title: 'The Quiet Night', authors: ['Someone Else'] });
    expect(book).not.toHaveProperty('generator');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].title).toBe('The Quiet Night');
    expect(book.chapters[0].html).toBe('<p>It was quiet.</p>\n<p>Then it was not.<br>She looked up.</p>');
    expect(book.words).toBe(10);
  });

  it('names a file with no title line after the file', async () => {
    const book = await parseImport(bytes('just one line of story text that ends with a period.'), 'notes/My Story.txt');
    expect(book.title).toBe('My Story');
    expect(book.chapters[0].title).toBe('My Story');
  });

  it('finds "Chapter N", "CHAPTER TWO", "Prologue" headings, skipping a contents list', async () => {
    const src = [
      'Storm Book',
      '',
      'Contents:',
      '',
      'Prologue',
      '',
      'Chapter 1',
      '',
      'CHAPTER TWO',
      '',
      '',
      'Prologue',
      '',
      'The sky was dark.',
      '',
      'Chapter 1',
      'The Beginning',
      '',
      'Rain fell.',
      '',
      '* * *',
      '',
      'It kept falling.',
      '',
      'CHAPTER TWO',
      '',
      'The sun came out.',
    ].join('\n');
    const book = await parseImport(bytes(src), 'storm.txt');
    expect(book.title).toBe('Storm Book');
    expect(book.chapters.map((c) => [c.title, c.html])).toEqual([
      ['Prologue', '<p>The sky was dark.</p>'],
      ['Chapter 1: The Beginning', '<p>Rain fell.</p>\n<hr>\n<p>It kept falling.</p>'],
      ['CHAPTER TWO', '<p>The sun came out.</p>'],
    ]);
  });

  it('doesn’t take numbered paragraphs or sentences for chapter headings', async () => {
    const src = [
      'Rules',
      '',
      '1. The first rule is that nobody talks about the lighthouse after dark, ever.',
      '',
      '2. The second rule is that the lamp is never, ever allowed to go out at night.',
      '',
      'Extra care was taken with the lamp after that.',
      '',
      'The end.',
    ].join('\n');
    const book = await parseImport(bytes(src), 'rules.txt');
    expect(book.chapters).toHaveLength(1);
    expect(paras(book.chapters[0].html)).toHaveLength(4);
  });

  it('reads one paragraph per line when there are no blank lines, and *asterisks* as emphasis', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} is its own paragraph, and it says so *clearly*.`);
    const book = await parseImport(bytes(lines.join('\r\n')), 'lines.txt');
    expect(paras(book.chapters[0].html)).toHaveLength(12);
    expect(paras(book.chapters[0].html)[0]).toBe('Line 1 is its own paragraph, and it says so <em>clearly</em>.');
  });

  it('shows markup in a text file as text', async () => {
    const book = await parseImport(bytes('Notes\n\nUse <script>alert(1)</script> & <b>tags</b> here.'), 'x.txt');
    expect(book.chapters[0].html).toBe('<p>Use &lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;tags&lt;/b&gt; here.</p>');
  });
});

describe('Markdown', () => {
  it('makes ## headings chapters under a single # title, with the common syntax', async () => {
    const md = [
      '---',
      'title: "Front Matter Title"',
      'author: Quiet Owl',
      'tags: [fluff, angst]',
      '---',
      '# Lantern Weather',
      '',
      '## Chapter 1',
      '',
      'Some *emphasis*, some **strong** and ~~struck~~ text,',
      'joined into one paragraph.  ',
      'After a hard break.',
      '',
      '***',
      '',
      '> A quoted line',
      '> and its second line.',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '## Chapter 2',
      '',
      'A [link](https://example.com/x) and a [bad one](javascript:alert(1)), `code <b>`, <script>alert(2)</script> and \\*not emphasis\\*.',
      '',
      '### Small Heading',
      '',
      'End.',
    ].join('\n');
    const book = await parseImport(bytes(md), 'lantern.md');
    expect(book).toMatchObject({ kind: 'md', title: 'Front Matter Title', authors: ['Quiet Owl'], tags: [{ kind: 'freeform', label: 'fluff' }, { kind: 'freeform', label: 'angst' }] });
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(book.chapters[0].html).toBe(
      [
        '<p>Some <em>emphasis</em>, some <strong>strong</strong> and <del>struck</del> text, joined into one paragraph.<br>After a hard break.</p>',
        '<hr>',
        '<blockquote><p>A quoted line and its second line.</p></blockquote>',
        '<ul><li>one</li><li>two</li></ul>',
        '<ol><li>first</li><li>second</li></ol>',
      ].join('\n'),
    );
    expect(book.chapters[1].html).toBe(
      '<p>A <a href="https://example.com/x">link</a> and a bad one, <code>code &lt;b&gt;</code>, &lt;script&gt;alert(2)&lt;/script&gt; and *not emphasis*.</p>\n<h3>Small Heading</h3>\n<p>End.</p>',
    );
  });

  it('makes # headings chapters when there are several, and keeps a file without headings whole', async () => {
    const book = await parseImport(bytes('# One\n\nFirst.\n\n# Two\n\nSecond.'), 'two.markdown');
    expect(book.chapters.map((c) => [c.title, c.html])).toEqual([
      ['One', '<p>First.</p>'],
      ['Two', '<p>Second.</p>'],
    ]);
    const whole = await parseImport(bytes('Just _a_ note.'), 'note.md');
    expect(whole).toMatchObject({ title: 'note', chapters: [{ title: 'note', html: '<p>Just <em>a</em> note.</p>' }] });
    const titled = await parseImport(bytes('A Title\n=======\n\nBody text.'), 'note.md');
    expect(titled).toMatchObject({ title: 'A Title', chapters: [{ title: 'A Title', html: '<p>Body text.</p>' }] });
  });

  it('handles emphasis the way writers use it', () => {
    expect(inlineMarkdown('snake_case_name stays, _this_ goes')).toBe('snake_case_name stays, <em>this</em> goes');
    expect(inlineMarkdown('2 * 3 * 4 is math')).toBe('2 * 3 * 4 is math');
    expect(inlineMarkdown('**bold _and italic_**')).toBe('<strong>bold <em>and italic</em></strong>');
  });
});

describe('what a text file can hold without fooling the importer', () => {
  const p = (s: string) => `${s} The harbour was quiet and the lanterns burned low over the water all night long.`;

  it('keeps stammered lines of dialogue as text, never as chapter headings', async () => {
    const lines = (...l: string[]) => bytes(l.join('\n\n'));
    const withChapters = await parseImport(
      lines('Chapter 1', p('She turned to me.'), "I... I don't know.", p('Silence.'), 'Chapter 2', p('Morning came.'), "I-I'm sorry.", 'V-very well.', p('She left.')),
      'stammer.txt',
    );
    expect(withChapters.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(text(withChapters.chapters[0].html)).toContain("I... I don't know.");
    expect(text(withChapters.chapters[1].html)).toContain("I-I'm sorry. V-very well.");
    const without = await parseImport(lines('The Harbour', p('She turned to me.'), "I... I don't know.", p('Silence.'), 'V-very well.', p('She left.')), 'harbour.txt');
    expect(without.chapters).toHaveLength(1);
    expect(paras(without.chapters[0].html)).toHaveLength(5);
  });

  it('takes Roman numerals for headings only where there are several of them', async () => {
    const book = await parseImport(bytes(['Storm', 'I', p('One.'), 'II', p('Two.'), 'III. The Calm', p('Three.')].join('\n\n')), 'storm.txt');
    expect(book.chapters.map((c) => c.title)).toEqual(['I', 'II', 'III. The Calm']);
    const lone = await parseImport(bytes(['Storm', 'Chapter 1', p('One.'), 'I.', p('A lone I.'), 'Chapter 2', p('Two.')].join('\n\n')), 'lone.txt');
    expect(lone.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(text(lone.chapters[0].html)).toContain('I. A lone I.');
  });

  it('reads a title with its byline right under it', async () => {
    const book = await parseImport(bytes('The Quiet Night\nby Someone Else\n\nChapter 1\n\nIt was quiet.\n\nChapter 2\n\nThen it was not.\n'), 'quiet2.txt');
    expect(book).toMatchObject({ title: 'The Quiet Night', authors: ['Someone Else'] });
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2']);
    const whole = await parseImport(bytes('The Quiet Night\nAuthor: Someone Else\n\nIt was quiet.\n\nThen it was not.'), 'quiet.txt');
    expect(whole).toMatchObject({ title: 'The Quiet Night', authors: ['Someone Else'] });
    expect(whole.chapters[0].html).toBe('<p>It was quiet.</p>\n<p>Then it was not.</p>');
  });

  it('cuts a long text without headings into parts at its scene breaks', async () => {
    const scene = (n: number) => Array.from({ length: 30 }, (_, i) => `Scene ${n} paragraph ${i} ${'word '.repeat(95)}`).join('\n\n');
    const src = ['Long Night', ...Array.from({ length: 16 }, (_, n) => scene(n + 1)).flatMap((s) => [s, '* * *'])].join('\n\n');
    const steps: number[] = [];
    const book = await parseImport(bytes(src), 'long.txt', { onProgress: (done) => steps.push(done) });
    expect(book.chapters.length).toBeGreaterThan(1);
    expect(book.chapters.map((c) => c.title)).toEqual(book.chapters.map((_, i) => `Part ${i + 1}`));
    for (const c of book.chapters) expect(c.words).toBeLessThanOrEqual(21_000);
    // Each part starts where a scene does, and nothing is lost.
    for (const c of book.chapters.slice(1)) expect(text(c.html)).toMatch(/^Scene \d+ paragraph 0 /);
    expect(book.words).toBe(16 * 30 * 99);
    expect(book.warnings).toEqual([`FicShelf found no chapter headings in this file, so its 47,520 words were split into ${book.chapters.length} parts.`]);
    expect(steps.at(-1)).toBe(book.chapters.length);
    // Markdown too.
    const md = await parseImport(bytes(src.replace(/\* \* \*/g, '---')), 'long.md');
    expect(md.chapters.length).toBe(book.chapters.length);
  });

  it('reads a long line of unclosed Markdown marks in linear time', async () => {
    for (const unit of ['**a ', '__a ', '~~a ', '[a](b c ', '[a ', '![a ']) {
      const line = unit.repeat(Math.ceil(200_000 / unit.length));
      const started = Date.now();
      const book = await parseImport(bytes(`Marks\n\n${line}\n`), 'marks.md');
      expect(Date.now() - started).toBeLessThan(1500);
      expect(book.chapters).toHaveLength(1);
    }
    const started = Date.now();
    for (let i = 0; i < 20; i++) inlineMarkdown('**a '.repeat(4_000));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(inlineMarkdown('**bold** and **more** but **open')).toBe('<strong>bold</strong> and <strong>more</strong> but **open');
    expect(inlineMarkdown('~~gone~~ and snake__case__name and __strong__')).toBe('<del>gone</del> and snake__case__name and <strong>strong</strong>');
    expect(inlineMarkdown('***both***')).toBe('<em><strong>both</strong></em>');
  });
});
