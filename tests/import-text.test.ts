// Importing plain text and Markdown: chapter headings found, hard-wrapped lines joined back into
// paragraphs (FanFicFare's TXT), files without chapters kept whole, Markdown's own syntax.

import { parseImport } from '../src/import';
import { isChapterHeading } from '../src/import/dom';
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

  it('keeps stammers and interruptions after a spaced dash as text: "I - I don’t know."', async () => {
    const lines = (...l: string[]) => bytes(l.join('\n\n'));
    // No chapters: nothing is cut, nothing is lost (the opening paragraph included).
    const without = await parseImport(lines('The Harbour', p('She turned to me.'), "I - I don't know.", p('Silence.'), "I - I'm sorry.", p('She left.')), 'stutter3.txt');
    expect(without.chapters).toHaveLength(1);
    expect(paras(without.chapters[0].html)).toEqual([p('She turned to me.'), "I - I don't know.", p('Silence.'), "I - I'm sorry.", p('She left.')]);
    expect(without.words).toBe(61);
    // Real chapters: no extra ones from the same lines.
    const chaptered = await parseImport(
      lines('Chapter 1', p('She turned to me.'), "I - I don't know.", p('Silence.'), 'Chapter 2', p('Morning.'), "I — I'm sorry", 'Chapter 3', p('Night.'), 'C - can you hear me?', 'V – very well.'),
      'stutter4.txt',
    );
    expect(chaptered.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(text(chaptered.chapters[2].html)).toContain('C - can you hear me? V – very well.');
    for (const line of ["I - I don't know.", "I — I'm sorry.", 'V – very well.', 'C - can you hear me?', "I - I'm sorry", "I - It's fine", 'I — never mind.', 'I - no']) {
      expect([line, isChapterHeading(line)]).toEqual([line, false]);
      // In an h1–h6 it's a heading all the same ("I - it begins").
      expect([line, isChapterHeading(line, true)]).toEqual([line, true]);
    }
    // Numbered titles still are headings, a lone numeral's too when it reads as a title.
    for (const line of ['I - The Storm', 'I — The girl who lived', 'V - Vengeance', 'I. The Storm', 'I: Arrival', 'II - home', 'IV. The Storm', 'XII', 'I'])
      expect([line, isChapterHeading(line)]).toEqual([line, true]);
    const roman = await parseImport(lines('Storm', 'I - The Beginning', p('One.'), 'II - The Storm', p('Two.'), 'III - The Calm', p('Three.')), 'storm.txt');
    expect(roman.chapters.map((c) => c.title)).toEqual(['I - The Beginning', 'II - The Storm', 'III - The Calm']);
    // A stammer inside a book with Roman headings is text too, in chapter I or any other.
    const inRoman = await parseImport(
      lines('Storm', 'I - The Storm', p('One.'), "I - I don't know.", p('Still one.'), 'II - The Calm', p('Two.'), 'III - The End', p('Three.'), "I - I'm sorry.", p('Still three.'), 'IV - Four', p('Four.'), 'V - The Fifth', p('Five.'), 'V – very well.', p('Still five.'), 'VI - Six', p('Six.')),
      'storm2.txt',
    );
    expect(inRoman.chapters.map((c) => c.title)).toEqual(['I - The Storm', 'II - The Calm', 'III - The End', 'IV - Four', 'V - The Fifth', 'VI - Six']);
    expect(text(inRoman.chapters[0].html)).toContain("I - I don't know.");
    expect(text(inRoman.chapters[2].html)).toContain("I - I'm sorry.");
    expect(text(inRoman.chapters[4].html)).toContain('V – very well.');
    // "I. I see." between paragraphs is text, never two chapters with the opening dropped.
    const talk = await parseImport(lines('Talk', p('She turned to me.'), 'I. I see.', p('Silence.'), 'I: no.', p('She left.')), 'talk.txt');
    expect(talk.chapters).toHaveLength(1);
    expect(paras(talk.chapters[0].html)).toEqual([p('She turned to me.'), 'I. I see.', p('Silence.'), 'I: no.', p('She left.')]);
  });

  it('reads a lone I, V or X as a heading in its place among the others, whatever its title', async () => {
    const words = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ') + '.';
    const book = (title: string | null, heads: string[], n: number) =>
      bytes([...(title ? [title] : []), ...heads.flatMap((h, i) => [h, words(`C${i + 1}w`, n)])].join('\n\n'));
    const titles = (b: { chapters: { title: string }[] }) => b.chapters.map((c) => c.title);
    for (const line of ['I. It begins', 'I. In which Harry finds a dog', 'I. Into the woods', 'I. the storm', 'I. Who Are You?', 'I. Run!', 'V. The End.', 'I. I will survive', 'I) It ends', 'I. I see.', 'I: no.'])
      expect([line, isChapterHeading(line)]).toEqual([line, true]);
    // Short chapters: chapter I is neither dropped nor merged.
    const small = await parseImport(book('Small Things', ['I. It begins', 'II. Then it rains', 'III. It ends'], 100), 'small.txt');
    expect([small.words, titles(small)]).toEqual([300, ['I. It begins', 'II. Then it rains', 'III. It ends']]);
    const lower = await parseImport(book('lowercase', ['I. the storm', 'II. the calm', 'III. the end'], 100), 'lc.txt');
    expect([lower.words, titles(lower)]).toEqual([300, ['I. the storm', 'II. the calm', 'III. the end']]);
    const dash = await parseImport(book('Home', ['I - home', 'II - away', 'III - back'], 100), 'home.txt');
    expect([dash.words, titles(dash)]).toEqual([300, ['I - home', 'II - away', 'III - back']]);
    // Long chapters: chapter I isn't an "Introduction" with its heading for a paragraph.
    const dog = await parseImport(book('Dog Days', ['I. In which Harry finds a dog', 'II. In which the dog finds Harry', 'III. In which nobody is happy'], 200), 'dog.txt');
    expect([dog.words, titles(dog)]).toEqual([600, ['I. In which Harry finds a dog', 'II. In which the dog finds Harry', 'III. In which nobody is happy']]);
    // No title line: chapter I's heading isn't the book's title.
    const woods = await parseImport(book(null, ['I. Into the woods', 'II. Out of the woods', 'III. Home again'], 300), 'woods.txt');
    expect([woods.title, titles(woods)]).toEqual(['woods', ['I. Into the woods', 'II. Out of the woods', 'III. Home again']]);
    // V after IV, however it's written.
    const six = await parseImport(book('Six', ['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. visions of home', 'VI. Six'], 200), 'six.txt');
    expect(titles(six)).toEqual(['I. The Start', 'II. Two', 'III. Three', 'IV. Four', 'V. visions of home', 'VI. Six']);
    expect(six.chapters[3].words).toBe(200);
    // Numbering that starts again in each part.
    const parts = await parseImport(book('Parts', ['Part One', 'I. It begins', 'II. Then', 'Part Two', 'I. It returns', 'II. And again'], 40), 'parts.txt');
    expect(titles(parts)).toEqual(['Part One', 'I. It begins', 'II. Then', 'Part Two', 'I. It returns', 'II. And again']);
  });

  it('reads a number run into its title as a heading, but not "10-year-old" or "5..."', async () => {
    for (const [a, b, c] of [
      ['1-Storm', '2-Home', '3-After'],
      ['1.Storm', '2.Home', '3.After'],
      ['1:Storm', '2:Home', '3:After'],
    ]) {
      const book = await parseImport(bytes(['S', a, p('One.'), b, p('Two.'), c, p('Three.')].join('\n\n')), 'n.txt');
      expect(book.chapters.map((ch) => ch.title)).toEqual([a, b, c]);
    }
    const prose = await parseImport(bytes(['S', p('One.'), '10-year-old', p('Two.'), '5...', p('Three.'), '1.5', p('Four.')].join('\n\n')), 'prose.txt');
    expect(prose.chapters).toHaveLength(1);
    expect(paras(prose.chapters[0].html)).toHaveLength(7);
  });

  it('takes a title’s byline only when it names someone, never a wrapped line of the story', async () => {
    const rain = 'She walked home through the rain, past the shops and the station, followed\nby the dog that had found her that morning.\n\nAt the door she paused and looked\nback at the road, wondering where it had come from.\n';
    const book = await parseImport(bytes(rain), 'rain.txt');
    expect(book).toMatchObject({ title: 'rain', authors: [] });
    expect(book.words).toBe(39);
    expect(text(book.chapters[0].html)).toContain('followed by the dog that had found her that morning.');
    // "By …" opening the story after its title is text, not an author.
    const by = await parseImport(bytes('The Harbour\n\nBy the time she arrived, the lanterns were out.\n\nShe waited.\n'), 'harbour.txt');
    expect(by).toMatchObject({ title: 'The Harbour', authors: [] });
    expect(paras(by.chapters[0].html)).toEqual(['By the time she arrived, the lanterns were out.', 'She waited.']);
    const initials = await parseImport(bytes('The Harbour\nby J. R. Smith Jr.\n\nShe waited.\n\nThen she left.\n'), 'harbour.txt');
    expect(initials).toMatchObject({ title: 'The Harbour', authors: ['J. R. Smith Jr.'] });
    const md = await parseImport(bytes('# The Harbour\n\nBy the time she arrived, the lanterns were out.\n'), 'harbour.md');
    expect(md.authors).toEqual([]);
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

  it('reads lines full of "[", "![" or link starts just under the length limit in linear time', async () => {
    // Each line is just under the 20,000 characters past which inline Markdown is skipped.
    for (const unit of ['[', '![', '[a ', '[a](b c ', '[a](b' + ' '.repeat(300), '[' + 'x'.repeat(499)]) {
      const line = unit.repeat(Math.floor(19_990 / unit.length));
      const started = Date.now();
      for (let i = 0; i < 20; i++) inlineMarkdown(line);
      expect(Date.now() - started).toBeLessThan(400);
    }
    const file = `Title\n\n${Array.from({ length: 100 }, () => '['.repeat(19_990)).join('\n\n')}\n`;
    const started = Date.now();
    await parseImport(bytes(file), 'brackets.md');
    expect(Date.now() - started).toBeLessThan(1500);
    // Links still work, with a title, with parentheses in the address; a title in parentheses
    // isn't half read.
    expect(inlineMarkdown('[link](https://a.com "Title") and ![alt](https://a.com/x.png)')).toBe('<a href="https://a.com">link</a> and <img src="https://a.com/x.png" alt="alt">');
    expect(inlineMarkdown('[w](https://en.wikipedia.org/wiki/Foo_(bar)) [s]( https://a.com )')).toBe(
      '<a href="https://en.wikipedia.org/wiki/Foo_(bar)">w</a> <a href="https://a.com">s</a>',
    );
    expect(inlineMarkdown('[x](https://a.com (t))')).toBe('[x](https://a.com (t))');
  });
});
