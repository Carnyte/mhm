// Reading zip archives (EPUBs) without trusting them. fflate does the inflating, synchronously
// (its async API spawns Web Workers, which Hermes doesn't have); the central directory is read
// here so that:
//
//   - nothing is decompressed until it's needed, and only the entries asked for;
//   - the total size the archive declares is capped before anything is inflated;
//   - an entry is inflated as a stream and stopped as soon as it outgrows the size it declared,
//     so a crafted entry that lies about its size can't burn minutes of CPU (fflate's one-shot
//     inflate keeps decoding past the end of its output buffer).
//
// Entry names are only ever used as lookup keys, never as file paths (zip-slip).

import { Inflate } from 'fflate';
import { ImportError, MAX_UNCOMPRESSED_BYTES } from './types';

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflated. */
  method: number;
  /** Bit 0 set: encrypted. */
  flags: number;
  compressedSize: number;
  /** Uncompressed size, as the archive declares it. */
  size: number;
  /** Offset of the entry's local header. */
  offset: number;
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

const broken = () => new ImportError('invalid', 'This file is damaged: it isn’t a readable zip archive.');

function utf8OrLatin1(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      // fall through: read it byte by byte
    }
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Whether the bytes start like a zip archive. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 22 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) && (bytes[3] === 4 || bytes[3] === 6);
}

/** The entries of a zip archive, from its central directory. Directories are left out. */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  // End of central directory record: at the end, before a comment of at most 65535 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw broken();
  let count = u16(bytes, eocd + 10);
  let offset = u32(bytes, eocd + 16);
  // Zip64 (archives over 4 GB or 65535 entries): the real numbers are in the zip64 record.
  if ((count === 0xffff || offset === 0xffffffff) && eocd >= 20 && u32(bytes, eocd - 20) === 0x07064b50) {
    const z = Number(u32(bytes, eocd - 12)) + Number(u32(bytes, eocd - 8)) * 2 ** 32;
    if (z + 56 > bytes.length || u32(bytes, z) !== 0x06064b50) throw broken();
    count = u32(bytes, z + 32);
    offset = u32(bytes, z + 48);
  }
  const entries: ZipEntry[] = [];
  let p = offset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw broken();
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    let compressedSize = u32(bytes, p + 20);
    let size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    let local = u32(bytes, p + 42);
    const name = utf8OrLatin1(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    if (size === 0xffffffff || compressedSize === 0xffffffff || local === 0xffffffff) {
      // Zip64 extra field (id 1): the 64-bit values, in this order, for the fields that overflowed.
      for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen; ) {
        const id = u16(bytes, e);
        const len = u16(bytes, e + 2);
        if (id === 1) {
          let q = e + 4;
          const next = () => {
            const v = u32(bytes, q) + u32(bytes, q + 4) * 2 ** 32;
            q += 8;
            return v;
          };
          if (size === 0xffffffff) size = next();
          if (compressedSize === 0xffffffff) compressedSize = next();
          if (local === 0xffffffff) local = next();
          break;
        }
        e += 4 + len;
      }
    }
    if (!name.endsWith('/')) entries.push({ name, method, flags, compressedSize, size, offset: local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Rejects an archive that declares more than the importer will ever inflate. */
export function checkDeclaredSize(entries: ZipEntry[], max = MAX_UNCOMPRESSED_BYTES): void {
  let total = 0;
  for (const e of entries) total += e.size;
  if (total > max) throw new ImportError('too-large', 'This file is too large to import (it unpacks to more than 200 MB).');
}

const STEP = 16 * 1024;

/**
 * One entry's bytes. Throws when the entry is encrypted, uses a method other than store / deflate,
 * or inflates to more than it declared (a damaged entry or a zip bomb).
 */
export function readEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  if (entry.flags & 1) throw new ImportError('drm', 'This file is encrypted, so FicShelf can’t read it.');
  const h = entry.offset;
  if (h + 30 > bytes.length || u32(bytes, h) !== 0x04034b50) throw broken();
  const start = h + 30 + u16(bytes, h + 26) + u16(bytes, h + 28);
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw broken();
  const data = bytes.subarray(start, end);
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) throw broken();
    return data.slice();
  }
  if (entry.method !== 8) throw new ImportError('unsupported', 'This file uses a kind of zip compression FicShelf can’t read.');
  const out = new Uint8Array(entry.size);
  let written = 0;
  const inflater = new Inflate((chunk) => {
    if (written + chunk.length > out.length) throw new ImportError('invalid', 'This file is damaged: a part of it is larger than it says.');
    out.set(chunk, written);
    written += chunk.length;
  });
  try {
    for (let i = 0; i < data.length; i += STEP) inflater.push(data.subarray(i, i + STEP), i + STEP >= data.length);
    if (!data.length) inflater.push(new Uint8Array(0), true);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw broken();
  }
  return written === out.length ? out : out.subarray(0, written);
}
