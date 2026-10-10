// Telling file kinds apart by their bytes, and turning away the ones the importer doesn't read
// with a reason the user can act on.

import { strToU8, zipSync } from 'fflate';
import { ImportError, MAX_INPUT_BYTES, parseImport, sniffFile } from '../src/import';
import { buildEpub, png, xhtml } from './helpers/epub';

const bytes = (s: string) => new TextEncoder().encode(s);
const kind = (b: Uint8Array, name: string) => sniffFile(b, name).kind;

const epub = (noMimetype = false) =>
  buildEpub({
    noMimetype,
    metadata: '<dc:title>T</dc:title>',
    manifest: { c: ['c.xhtml', 'application/xhtml+xml'] },
    spine: ['c'],
    files: { 'OEBPS/c.xhtml': xhtml('<p>Hi.</p>') },
  });

describe('sniffFile', () => {
  it('knows an EPUB by its mimetype entry, or by its container.xml when a tool left that out', () => {
    expect(kind(epub(), 'book.epub')).toBe('epub');
    expect(kind(epub(), 'renamed.zip')).toBe('epub');
    expect(kind(epub(true), 'book.epub')).toBe('epub');
  });

  it('turns away other zip files, Word documents, PDFs and Kindle books, pointing at EPUB', () => {
    const zip = zipSync({ 'notes.txt': strToU8('hello') });
    expect(sniffFile(zip, 'stuff.zip')).toMatchObject({ kind: 'unsupported', format: 'zip' });
    const docx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:document/>') });
    expect(sniffFile(docx, 'story.docx')).toMatchObject({ kind: 'unsupported', format: 'docx' });
    const pdf = sniffFile(bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj'), 'story.pdf');
    expect(pdf).toMatchObject({ kind: 'unsupported', format: 'pdf' });
    expect(pdf.kind === 'unsupported' && pdf.message).toMatch(/EPUB/);
    const mobi = new Uint8Array(100);
    mobi.set(bytes('BOOKMOBI'), 60);
    expect(sniffFile(mobi, 'story.mobi')).toMatchObject({ kind: 'unsupported', format: 'mobi' });
    expect(sniffFile(bytes('anything'), 'story.azw3')).toMatchObject({ kind: 'unsupported', format: 'mobi' });
    expect(sniffFile(bytes('{\\rtf1\\ansi hello}'), 'story.rtf')).toMatchObject({ kind: 'unsupported', format: 'rtf' });
    expect(sniffFile(bytes('bplist00\u00d4\u0001\u0002'), 'Page.webarchive')).toMatchObject({ kind: 'unsupported', format: 'webarchive' });
  });

  it('turns away binary files and empty ones', () => {
    expect(sniffFile(png(400), 'cover.png')).toMatchObject({ kind: 'unsupported', format: 'binary' });
    expect(sniffFile(new Uint8Array(0), 'empty.txt')).toMatchObject({ kind: 'unsupported', format: 'empty' });
  });

  it('knows HTML by its markup, whatever the file is called', () => {
    expect(kind(bytes('<!DOCTYPE html><html><body><p>x</p></body></html>'), 'page.txt')).toBe('html');
    expect(kind(bytes('﻿\n  <html><p>x</p></html>'), 'download')).toBe('html');
    expect(kind(bytes('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"/>'), 'c.xhtml')).toBe('html');
    expect(kind(bytes('<p>Chapter one</p>'), 'chapter.htm')).toBe('html');
  });

  it('reads anything else as text, Markdown by its name', () => {
    expect(kind(bytes('Chapter 1\n\nIt was dark.'), 'story.txt')).toBe('txt');
    expect(kind(bytes('<3 this story so much'), 'notes.txt')).toBe('txt');
    expect(kind(bytes('# Title\n\nText'), 'story.md')).toBe('md');
    expect(kind(bytes('# Title\n\nText'), 'story.markdown')).toBe('md');
    expect(kind(bytes('Plain words'), 'README')).toBe('txt');
  });

  it('reads UTF-16 text (Windows Notepad) as text', () => {
    const s = 'Chapter 1\r\n\r\nWords.';
    const le = new Uint8Array(2 + s.length * 2);
    le.set([0xff, 0xfe]);
    for (let i = 0; i < s.length; i++) le[2 + i * 2] = s.charCodeAt(i);
    expect(kind(le, 'notepad.txt')).toBe('txt');
  });
});

describe('parseImport turning files away', () => {
  it('rejects files over 100 MB before reading them', async () => {
    const huge = { length: MAX_INPUT_BYTES + 1 } as Uint8Array;
    await expect(parseImport(huge, 'big.epub')).rejects.toMatchObject({ name: 'ImportError', code: 'too-large' });
  });

  it('gives the reason for formats it doesn’t read', async () => {
    const err = await parseImport(bytes('%PDF-1.4 ...'), 'story.pdf').catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err).toMatchObject({ code: 'unsupported' });
    expect(err.message).toMatch(/PDF files can’t be imported.*EPUB/);
  });

  it('says so when a file has no story text', async () => {
    await expect(parseImport(bytes('   \n\n  \n'), 'blank.txt')).rejects.toMatchObject({ code: 'empty' });
    await expect(parseImport(new Uint8Array(0), 'zero.txt')).rejects.toMatchObject({ code: 'empty' });
  });
});
