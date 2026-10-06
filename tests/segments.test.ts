// Audiobook text segmentation: spoken segments + data-tts tags for reader highlighting.

import { isSpeakable, MAX_SEGMENT_CHARS, segmentChapter, splitText } from '../src/audio/segments';

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

  it('ignores scripts and handles empty input', () => {
    expect(segmentChapter('').segments).toEqual([]);
    const r = segmentChapter('<p>Hi</p><script>alert(1)</script>');
    expect(r.segments.map((s) => s.text)).toEqual(['Hi']);
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
    expect(isSpeakable('oOoOoOo')).toBe(true); // letters only: could be a word, so read it
    expect(isSpeakable('Hi.')).toBe(true);
    expect(isSpeakable('「こんにちは」')).toBe(true);
  });
});
