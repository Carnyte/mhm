// Text encodings the importer reads by hand (Expo's TextDecoder only knows UTF-8): byte-order
// marks, UTF-16 from Windows Notepad, Windows-1252 from old archives, HTML's <meta charset>.

import { decodeBytes, parseImport } from '../src/import';
import { detectOrigin } from '../src/import/detect';

const utf8 = (s: string) => new TextEncoder().encode(s);
const utf16 = (s: string, le: boolean, bom = true) => {
  const out = new Uint8Array((bom ? 2 : 0) + s.length * 2);
  let o = 0;
  if (bom) {
    out.set(le ? [0xff, 0xfe] : [0xfe, 0xff]);
    o = 2;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[o + i * 2] = le ? c & 0xff : c >> 8;
    out[o + i * 2 + 1] = le ? c >> 8 : c & 0xff;
  }
  return out;
};
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('decodeBytes', () => {
  it('drops a UTF-8 byte-order mark', () => {
    expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('café “x”')]))).toEqual({ text: 'café “x”', encoding: 'utf-8', replaced: false });
  });

  it('reads UTF-16 with either byte-order mark, and without one', () => {
    const s = 'Hello “world” – 女';
    expect(decodeBytes(utf16(s, true))).toMatchObject({ text: s, encoding: 'utf-16le' });
    expect(decodeBytes(utf16(s, false))).toMatchObject({ text: s, encoding: 'utf-16be' });
    expect(decodeBytes(utf16('Plain ASCII text, long enough to tell.', true, false))).toMatchObject({ text: 'Plain ASCII text, long enough to tell.', encoding: 'utf-16le' });
  });

  it('falls back to Windows-1252 for text that isn’t UTF-8 (curly quotes, dashes, the euro sign)', () => {
    const cp1252 = new Uint8Array([0x93, 0x48, 0x69, 0x94, 0x20, 0x96, 0x20, 0x63, 0x61, 0x66, 0xe9, 0x85, 0x20, 0x80, 0x35]);
    expect(decodeBytes(cp1252)).toEqual({ text: '“Hi” – café… €5', encoding: 'windows-1252', replaced: false });
  });

  it('honours an HTML page’s <meta charset>', () => {
    // "Ã©" in Windows-1252 happens to be valid UTF-8 for "é": the page says which it is.
    const body = [0xc3, 0xa9];
    const latin = new Uint8Array([...ascii('<html><head><meta charset="iso-8859-1"></head><body>'), ...body, ...ascii('</body></html>')]);
    expect(decodeBytes(latin, { html: true }).text).toContain('<body>Ã©</body>');
    expect(decodeBytes(latin).text).toContain('<body>é</body>');
    const http = new Uint8Array([...ascii('<meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><p>'), 0x93, ...ascii('q'), 0x94]);
    expect(decodeBytes(http, { html: true }).text).toContain('<p>“q”');
    // A page that says UTF-8 is read as UTF-8, broken bytes and all, and the damage is flagged.
    const broken = new Uint8Array([...ascii('<meta charset="utf-8"><p>'), 0x93, ...ascii('x</p>')]);
    expect(decodeBytes(broken, { html: true })).toMatchObject({ encoding: 'utf-8', replaced: true });
  });
});

describe('importing text in other encodings', () => {
  it('imports a UTF-16 text file from Notepad', async () => {
    const book = await parseImport(utf16('My Tale\r\n\r\nIt was “dark”.\r\n', true), 'tale.txt');
    expect(book.title).toBe('My Tale');
    expect(book.chapters[0].html).toBe('<p>It was “dark”.</p>');
    expect(book.warnings).toEqual([]);
  });

  it('imports a Windows-1252 HTML page', async () => {
    const page = new Uint8Array([...ascii('<html><head><meta charset="windows-1252"><title>Old Page</title></head><body><h1>Old Page</h1><p>'), 0x93, ...ascii('Caf'), 0xe9, 0x94, ...ascii('</p></body></html>')]);
    const book = await parseImport(page, 'old.html');
    expect(book.chapters[0].html).toBe('<p>“Café”</p>');
  });

  it('warns when characters couldn’t be read', async () => {
    const book = await parseImport(new Uint8Array([...ascii('<meta charset="utf-8"><p>bad '), 0xff, ...ascii(' byte</p>')]), 'bad.html');
    expect(book.warnings).toEqual(['Some characters couldn’t be read: the file may use a text encoding FicShelf doesn’t know.']);
  });
});

describe('detectOrigin', () => {
  it('knows AO3 works, FanFiction.net stories and Wattpad stories, nothing else', () => {
    expect(detectOrigin('https://archiveofourown.org/works/25253053/chapters/61218982')).toEqual({ source: 'ao3', remoteId: '25253053', key: 'ao3:25253053' });
    expect(detectOrigin('http://www.ao3.org/works/5')).toMatchObject({ source: 'ao3', remoteId: '5' });
    expect(detectOrigin('https://m.fanfiction.net/s/12345/3/Some-Title')).toEqual({ source: 'ffn', remoteId: '12345', key: 'ffn:12345' });
    expect(detectOrigin('https://www.wattpad.com/story/404053457-some-title')).toEqual({ source: 'wp', remoteId: '404053457', key: 'wp:404053457' });
    expect(detectOrigin('https://www.wattpad.com/1589023894-chapter-title')).toBeUndefined();
    expect(detectOrigin('https://archiveofourown.org/series/9')).toBeUndefined();
    expect(detectOrigin('https://evil.example/fanfiction.net/s/1')).toBeUndefined();
    expect(detectOrigin('http://test1.com?sid=4')).toBeUndefined();
    expect(detectOrigin(undefined)).toBeUndefined();
  });
});
