// Bytes to text. Expo's TextDecoder only knows UTF-8, and files people have lying around are
// sometimes UTF-16 (Windows Notepad) or Windows-1252 (old fic archives, Word's "Save as text"),
// so those two are decoded here by hand:
//
//   1. a byte-order mark says UTF-8, UTF-16 LE or UTF-16 BE;
//   2. an HTML file's <meta charset> is honoured when it names UTF-8, Windows-1252 or ISO-8859-1
//      (browsers read ISO-8859-1 as Windows-1252, and so does this);
//   3. text that is valid UTF-8 is UTF-8, and so is text that mostly is (a stray Windows-1252
//      byte pasted into it, a last character cut in half): the odd bytes are read as Windows-1252;
//   4. anything else is read as Windows-1252, which never fails.
//
// Other legacy encodings (Shift-JIS, GBK…) come out garbled; `replaced` tells the caller to warn.

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export interface DecodedText {
  text: string;
  encoding: TextEncodingName;
  /** The text holds U+FFFD replacement characters: some of it couldn't be read. */
  replaced: boolean;
}

/** Windows-1252's 0x80-0x9F (curly quotes, dashes, €, …); the rest of the range is Latin-1. */
const CP1252_HIGH = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd, 0xfffd,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
];

const CHUNK = 8192;
/** Bytes decoded between pauses (see decodeBytesAsync). */
const SLICE = 1 << 20;

/** UTF-16 code units to a string, in chunks (String.fromCharCode takes a bounded argument list). */
function fromCodeUnits(units: Uint16Array): string {
  const parts: string[] = [];
  for (let i = 0; i < units.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, units.subarray(i, i + CHUNK) as unknown as number[]));
  return parts.join('');
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const n = bytes.length >> 1;
  const units = new Uint16Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 2) units[i] = littleEndian ? bytes[j] | (bytes[j + 1] << 8) : (bytes[j] << 8) | bytes[j + 1];
  return fromCodeUnits(units);
}

function decodeCp1252(bytes: Uint8Array): string {
  const units = new Uint16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    units[i] = b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b;
  }
  return fromCodeUnits(units);
}

/**
 * The bytes in slices, each decoded by `one`, with a pause point (a yield) after each: the async
 * version waits there, so a 10 MB file doesn't hold the JS thread in one go. `one` gets slices on
 * even byte boundaries (UTF-16 code units never straddle two).
 */
function* sliced(bytes: Uint8Array, one: (b: Uint8Array) => string): Generator<void, string, void> {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += SLICE) {
    parts.push(one(bytes.subarray(i, i + SLICE)));
    yield;
  }
  return parts.join('');
}

/** UTF-8 in slices; `fatal` throws on invalid bytes (the caller falls back to Windows-1252). */
function* utf8(bytes: Uint8Array, fatal: boolean): Generator<void, string, void> {
  const decoder = new TextDecoder('utf-8', { fatal });
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += SLICE) {
    parts.push(decoder.decode(bytes.subarray(i, i + SLICE), { stream: i + SLICE < bytes.length }));
    yield;
  }
  return parts.join('');
}

/** Length of the valid UTF-8 sequence at `i` (2–4), or 0 when the bytes there aren't one. */
function utf8Sequence(b: Uint8Array, i: number): number {
  const c = b[i];
  const cont = (k: number) => i + k < b.length && (b[i + k] & 0xc0) === 0x80;
  if (c >= 0xc2 && c <= 0xdf) return cont(1) ? 2 : 0;
  if (c >= 0xe0 && c <= 0xef) {
    const d = b[i + 1];
    if (c === 0xe0 ? d < 0xa0 : c === 0xed ? d > 0x9f : false) return 0;
    return cont(1) && cont(2) ? 3 : 0;
  }
  if (c >= 0xf0 && c <= 0xf4) {
    const d = b[i + 1];
    if (c === 0xf0 ? d < 0x90 : c === 0xf4 ? d > 0x8f : false) return 0;
    return cont(1) && cont(2) && cont(3) ? 4 : 0;
  }
  return 0;
}

/**
 * Text that isn't all valid UTF-8 but mostly is: its valid sequences as UTF-8, each odd byte as
 * Windows-1252. Undefined when the odd bytes are too many for it to be UTF-8 at all (then the
 * whole file is Windows-1252).
 */
function* lenientUtf8(bytes: Uint8Array): Generator<void, string | undefined, void> {
  const bad: number[] = [];
  let good = 0;
  for (let i = 0, next = SLICE; i < bytes.length; ) {
    if (i >= next) {
      next += SLICE;
      yield;
    }
    if (bytes[i] < 0x80) i++;
    else {
      const n = utf8Sequence(bytes, i);
      if (n) {
        good++;
        i += n;
      } else bad.push(i++);
    }
  }
  // A last character cut in half is left out, not shown as Windows-1252 letters.
  let end = bytes.length;
  for (let k = end - 1; k >= 0 && k >= end - 3; k--) {
    const c = bytes[k];
    if ((c & 0xc0) === 0x80) continue;
    const need = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc2 ? 2 : 0;
    if (need > end - k) end = k;
    break;
  }
  while (bad.length && bad[bad.length - 1] >= end) bad.pop();
  if (good <= bad.length * 2) return undefined;
  const decoder = new TextDecoder('utf-8');
  const parts: string[] = [];
  let from = 0;
  for (const at of bad) {
    if (at > from) parts.push(decoder.decode(bytes.subarray(from, at)));
    parts.push(decodeCp1252(bytes.subarray(at, at + 1)));
    from = at + 1;
    if (parts.length % 4096 === 0) yield;
  }
  parts.push(decoder.decode(bytes.subarray(from, end)));
  return parts.join('');
}

/**
 * UTF-16 without a byte-order mark: mostly-ASCII text has a zero in every other byte. Returns
 * the byte order, or undefined when the sample doesn't look like that.
 */
function bomlessUtf16(bytes: Uint8Array): 'le' | 'be' | undefined {
  const n = Math.min(bytes.length, 4096) & ~1;
  if (n < 8) return undefined;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) evenZero++;
    if (bytes[i + 1] === 0) oddZero++;
  }
  const pairs = n / 2;
  if (oddZero > pairs * 0.4 && evenZero < pairs * 0.05) return 'le';
  if (evenZero > pairs * 0.4 && oddZero < pairs * 0.05) return 'be';
  return undefined;
}

/** The charset an HTML file declares in its first bytes (<meta charset> or http-equiv), lower case. */
export function declaredCharset(bytes: Uint8Array): string | undefined {
  const n = Math.min(bytes.length, 4096);
  let head = '';
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i]);
  const m =
    head.match(/<meta\s[^>]*?charset\s*=\s*["']?\s*([\w.:-]+)/i) ??
    head.match(/<\?xml\s[^>]*?encoding\s*=\s*["']\s*([\w.:-]+)/i);
  return m?.[1].toLowerCase();
}

const LATIN1_NAMES = new Set(['windows-1252', 'cp1252', 'iso-8859-1', 'iso8859-1', 'latin1', 'latin-1', 'l1', 'us-ascii', 'ascii', 'x-cp1252']);
const UTF8_NAMES = new Set(['utf-8', 'utf8', 'unicode-1-1-utf-8']);

function* decodeSteps(bytes: Uint8Array, opts: { html?: boolean }): Generator<void, DecodedText, void> {
  const done = (text: string, encoding: TextEncodingName): DecodedText => ({ text, encoding, replaced: text.includes('�') });
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return done(yield* utf8(bytes.subarray(3), false), 'utf-8');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return done(yield* sliced(bytes.subarray(2), (b) => decodeUtf16(b, true)), 'utf-16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return done(yield* sliced(bytes.subarray(2), (b) => decodeUtf16(b, false)), 'utf-16be');
  const bomless = bomlessUtf16(bytes);
  if (bomless) return done(yield* sliced(bytes, (b) => decodeUtf16(b, bomless === 'le')), bomless === 'le' ? 'utf-16le' : 'utf-16be');
  if (opts.html) {
    const charset = declaredCharset(bytes);
    if (charset && LATIN1_NAMES.has(charset)) return done(yield* sliced(bytes, decodeCp1252), 'windows-1252');
    if (charset && UTF8_NAMES.has(charset)) return done(yield* utf8(bytes, false), 'utf-8');
  }
  let text: string;
  try {
    text = yield* utf8(bytes, true);
  } catch {
    const mostly = yield* lenientUtf8(bytes);
    if (mostly !== undefined) return { text: mostly, encoding: 'utf-8', replaced: true };
    return done(yield* sliced(bytes, decodeCp1252), 'windows-1252');
  }
  return done(text, 'utf-8');
}

/**
 * Decodes a text file. `html` turns on the <meta charset> check (step 2 above); a declared
 * charset never overrides a byte-order mark.
 */
export function decodeBytes(bytes: Uint8Array, opts: { html?: boolean } = {}): DecodedText {
  const steps = decodeSteps(bytes, opts);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** decodeBytes for a whole file: awaits `pause` between 1 MB slices. */
export async function decodeBytesAsync(bytes: Uint8Array, opts: { html?: boolean }, pause: () => Promise<void>): Promise<DecodedText> {
  const steps = decodeSteps(bytes, opts);
  let r = steps.next();
  while (!r.done) {
    await pause();
    r = steps.next();
  }
  return r.value;
}
