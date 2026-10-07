// Audiobook text segmentation: spoken segments + data-tts tags for reader highlighting.

import { frontMatterBlocks, isSpeakable, MAX_SEGMENT_CHARS, segmentChapter, splitText } from '../src/audio/segments';

describe('segmentChapter', () => {
  it('tags paragraphs and skips decorative separators', () => {
    const r = segmentChapter('<p>Hello there. How are you?</p><p>* * *</p><p>Second &amp; last.</p>');
    expect(r.segments.map((s) => [s.block, s.text])).toEqual([
      [0, 'Hello there. How are you?'],
      [1, 'Second & last.'],
    ]);
    expect(r.html).toContain('<p data-tts="0">Hello there.');
    expect(r.html).toContain('<p>* * *</p>');
    expect(r.html).toContain('<p data-tts="1">Second &amp; last.</p>');
    expect(r.blocks).toBe(2);
    expect(r.words).toBe(8);
  });

  it('splits <br><br> text into highlightable spans, keeping single line breaks together', () => {
    const r = segmentChapter('Line one<br>still one<br><br>Para two<br/><br/>  <br>Para three');
    expect(r.segments.map((s) => s.text)).toEqual(['Line one still one', 'Para two', 'Para three']);
    expect(r.html).toBe('<span data-tts="0">Line one<br>still one</span><br><br><span data-tts="1">Para two</span><br><br>  <br><span data-tts="2">Para three</span>');
  });

  it('reads loose text between blocks and recurses into containers', () => {
    const r = segmentChapter('<div><p>A</p>loose text<p>B</p></div><hr><center><b>Bold</b> centre</center>');
    expect(r.segments.map((s) => `${s.block}:${s.text}`)).toEqual(['0:A', '1:loose text', '2:B', '3:Bold centre']);
    expect(r.html).toContain('<span data-tts="1">loose text</span>');
  });

  it('keeps tables whole and spaces their cells', () => {
    const r = segmentChapter('<table><tr><td>cell one</td><td>cell two</td></tr></table>');
    expect(r.segments[0].text).toBe('cell one cell two');
    expect(r.html).toMatch(/^<table data-tts="0">/);
  });

  it('splits long paragraphs into several segments of the same block', () => {
    const para = 'This is a fairly long sentence with quite a few words. '.repeat(30);
    const r = segmentChapter(`<p>${para}</p><p>Next.</p>`);
    const first = r.segments.filter((s) => s.block === 0);
    expect(first.length).toBeGreaterThan(2);
    expect(first.every((s) => s.text.length <= MAX_SEGMENT_CHARS)).toBe(true);
    expect(first.map((s) => s.text).join(' ')).toBe(para.trim());
    expect(r.segments[r.segments.length - 1]).toMatchObject({ block: 1, text: 'Next.' });
  });

  it('drops scripts and raw-text elements and handles empty input', () => {
    expect(segmentChapter('').segments).toEqual([]);
    const r = segmentChapter('<p>Hi</p><script>alert(1)</script>');
    expect(r.segments.map((s) => s.text)).toEqual(['Hi']);
    expect(r.html).not.toContain('script');
    const x = segmentChapter('<p>Ok <b><xmp>&lt;/xmp&gt;&lt;img src=x onerror=alert(1)&gt;</xmp></b></p>');
    expect(x.html).not.toMatch(/<img|onerror|xmp/);
  });
});

describe('pauses and speech cleanup', () => {
  it('marks paragraph and scene breaks', () => {
    const r = segmentChapter('<p>A.</p><p>B.</p><p>* * *</p><p>C.</p><hr><p>D.</p>');
    expect(r.segments.map((s) => `${s.text}:${s.breakBefore}`)).toEqual(['A.:none', 'B.:paragraph', 'C.:scene', 'D.:scene']);
  });
  it('cleans text for the voice without touching the reader HTML', () => {
    const r = segmentChapter('<p>*sigh* Well... I don\'t know!!! He said--wait.She left.</p>');
    expect(r.segments[0].text).toBe("sigh Well… I don't know! He said — wait. She left.");
    expect(r.html).toContain('*sigh* Well... I don');
  });
});

describe('splitText / isSpeakable', () => {
  it('never exceeds the limit, even without punctuation', () => {
    const parts = splitText('word '.repeat(400));
    expect(parts.every((p) => p.length <= MAX_SEGMENT_CHARS)).toBe(true);
    expect(parts.join(' ').split(/\s+/).length).toBe(400);
  });
  it('breaks at sentence ends', () => {
    const s = 'One. '.repeat(100);
    expect(splitText(s, 50).every((p) => /\.$/.test(p))).toBe(true);
  });
  it('detects separators', () => {
    expect(isSpeakable('* * *')).toBe(false);
    expect(isSpeakable('~~~~~~~')).toBe(false);
    expect(isSpeakable('-x-x-x-')).toBe(false);
    expect(isSpeakable('oOoOoOo')).toBe(false); // letters-only dividers alternate case…
    expect(isSpeakable('xXx')).toBe(false);
    expect(isSpeakable('~Line Break~')).toBe(false);
    expect(isSpeakable('Zzz')).toBe(true); // …words don't
    expect(isSpeakable('Ooo')).toBe(true);
    expect(isSpeakable('Hi.')).toBe(true);
    expect(isSpeakable('"I-I..."')).toBe(true);
    expect(isSpeakable('“I…”')).toBe(true);
    expect(isSpeakable('Mm.')).toBe(true);
    expect(isSpeakable('"Zzz..."')).toBe(true);
    expect(isSpeakable('~o~o~o~')).toBe(false);
    expect(isSpeakable('「こんにちは」')).toBe(true);
  });
});

describe('speechText', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { speechText } = require('../src/audio/speechText') as typeof import('../src/audio/speechText');
  it('leaves normal prose alone', () => {
    for (const s of ['Mr. Smith met Dr. Who in the U.S.A. at 5 p.m.', "It's 3.14, isn't it?", 'A well-known e-mail.']) {
      expect(speechText(s)).toBe(s);
    }
  });
  it('normalises fanfiction habits', () => {
    expect(speechText('No. . . please?!?!')).toBe('No… please?!');
    expect(speechText('**Really** _now_ ~softly~')).toBe('Really now softly');
    expect(speechText('wait - what')).toBe('wait — what');
  });
});

describe('author’s front matter', () => {
  const story = (n: number) => Array.from({ length: n }, (_, i) => `<p>Harry walked on, step ${i + 1}, thinking about the lake and the long summer ahead.</p>`).join('');

  it('ends the notes at the separator after them', () => {
    const html = '<p><strong>Summary:</strong> Harry finds a door.</p><p>Disclaimer: I don’t own Harry Potter.</p><p>Thanks to my beta!</p><hr><p>Chapter text starts.</p>' + story(10);
    const seg = segmentChapter(html);
    expect(seg.frontMatter).toBe(3);
    expect(seg.segments[seg.frontMatter].text).toBe('Chapter text starts.');
  });

  it('also ends them at a chapter heading, and at "* * *" separators', () => {
    expect(segmentChapter('<p>A/N: Sorry for the wait!</p><p>Enjoy.</p><p>Chapter 3: The Lake</p>' + story(5)).frontMatter).toBe(2);
    expect(segmentChapter('<p>(A/N: short one today)</p><p>* * *</p>' + story(5)).frontMatter).toBe(1);
  });

  it('without a separator, skips only the labelled paragraphs at the top', () => {
    expect(segmentChapter('<p>Disclaimer: not mine.</p><p>A/N: thanks for reading.</p><p>This chapter was hard.</p>' + story(5)).frontMatter).toBe(2);
  });

  it('leaves stories alone that just start', () => {
    expect(segmentChapter(story(6)).frontMatter).toBe(0);
    // Story text that happens to look like a label further down isn't the author's.
    expect(segmentChapter(story(3) + '<p>Warning: the sign read, keep out.</p><hr>' + story(3)).frontMatter).toBe(0);
    // Dialogue with a dash isn't a label.
    expect(segmentChapter('<p>“Thanks—” she began.</p><hr>' + story(3)).frontMatter).toBe(0);
    expect(segmentChapter('<p>Notes were passed around the class.</p><hr>' + story(3)).frontMatter).toBe(0);
  });

  it('never skips a whole chapter of notes, or notes that run too long', () => {
    expect(segmentChapter('<p>A/N: This story is on hiatus.</p><p>Author’s note: sorry, everyone.</p>').frontMatter).toBe(0);
    // Too long to be sure where the notes end: only the labelled paragraph is skipped.
    const longNote = segmentChapter('<p>A/N: ' + 'word '.repeat(600) + '</p><p>' + 'more '.repeat(300) + '</p><hr>' + story(2));
    expect(longNote.segments[longNote.frontMatter].block).toBe(1);
    expect(segmentChapter('<p>Author note: hi.</p><p>Story.</p>').frontMatter).toBe(1);
  });

  it('counts blocks, not segments', () => {
    expect(frontMatterBlocks([{ text: 'Summary: a door.', scene: false, words: 3 }, { text: 'Story.', scene: true, words: 1 }])).toBe(1);
    const html = '<p>A/N: ' + 'This is a long note sentence. '.repeat(30) + '</p><hr>' + story(4);
    const seg = segmentChapter(html);
    expect(seg.frontMatter).toBeGreaterThan(1); // the long note is split into several segments
    expect(seg.segments[seg.frontMatter].block).toBe(1);
  });

  it('reads story that follows a one-line note without a separator (review)', () => {
    const fm = (html: string) => segmentChapter(html).frontMatter;
    const opening = '<p>“Get up!” Sakura yelled.</p><p>Naruto groaned.</p><p>“Five more minutes.”</p>';
    expect(fm('<p>A/N: Thanks for all the reviews! Enjoy.</p>' + opening + '<p>* * *</p><p>Later that day.</p>')).toBe(1);
    expect(fm('<p>A/N: hi</p>' + story(4) + '<p>Chapter after chapter, the book went on.</p>')).toBe(1);
    // A silent reply is dialogue, not a scene break.
    expect(fm('<p>A/N: Enjoy!</p><p>“Hermione, are you okay?”</p><p>“…”</p><p>She didn’t answer.</p>')).toBe(1);
    expect(fm('<p>A/N: Enjoy!</p><p>“I’m pregnant,” Ginny said.</p><p>“?!”</p><p>Silence.</p>')).toBe(1);
  });

  it('doesn’t mistake story text for a label (review)', () => {
    const fm = (html: string) => segmentChapter(html).frontMatter;
    expect(fm('<p>“Warning—hull breach on deck four!” the computer blared.</p>' + story(3))).toBe(0);
    expect(fm('<p>Warning-lights flashed red across the bridge.</p>' + story(3))).toBe(0);
    expect(fm('<p>Disclaimers were the first thing Percy signed at the Ministry.</p>' + story(3))).toBe(0);
    expect(fm('<p>Author’s notes crowded the margins of the old Potions textbook.</p>' + story(3))).toBe(0);
    expect(fm('<p>“Rating: ten out of ten,” Sirius declared.</p>' + story(8) + '<hr>' + story(2))).toBe(0);
    expect(fm('<p>The sign on the gate was old and rusted.</p><p>Warning: Dangerous Creatures Beyond This Point</p>' + story(8) + '<p>~*~*~</p>' + story(2))).toBe(0);
    // A sign the story opens with is at most one paragraph.
    expect(fm('<p>WARNING: KEEP OUT. TRESPASSERS WILL BE PROSECUTED.</p>' + story(7) + '<hr>' + story(2))).toBe(1);
  });

  it('keeps story lines that share a paragraph with a note (review)', () => {
    expect(segmentChapter('<p>A/N: hi!<br>Harry walked in.<br>He sat down.</p><p>More.</p>').frontMatter).toBe(0);
    expect(segmentChapter('<p>Disclaimer: not mine.<br>Rating: T<br>A/N: enjoy!</p><hr><p>Story.</p>').frontMatter).toBe(1);
    expect(segmentChapter('<p>A/N: thanks for\n reading</p><hr><p>Story.</p>').frontMatter).toBe(1);
  });

  it('knows more front-matter formats (review)', () => {
    const fm = (note: string) => segmentChapter(`<p>${note}</p><hr>` + story(3)).frontMatter;
    for (const note of ['A.N: Thanks!', 'AN - Thanks for the reviews!', '&lt;A/N&gt; thanks for reading &lt;/A/N&gt;', '{AN: thanks}', '==Disclaimer== I own nothing', 'Previously: Harry found the door.', 'Last time on DBZ: Goku powered up.', 'Summary - Harry finds a door.']) {
      expect([note, fm(note)]).toEqual([note, 1]);
    }
    expect(segmentChapter('<p>A/N: hi</p><p>Thanks to my beta, Foo!</p><p>xXx</p>' + story(3)).frontMatter).toBe(2);
  });
});
