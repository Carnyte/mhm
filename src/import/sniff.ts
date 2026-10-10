// What kind of file this is, from its bytes first and its name second: an EPUB, an HTML page,
// plain text or Markdown, or something the importer turns away with a reason the user can act on
// (PDF, MOBI / AZW3 and Word files: "get the EPUB instead").

import { decodeBytes } from './decode';
import { isZip, listZip } from './zip';
import type { ImportKind } from './types';

export type SniffResult = { kind: ImportKind } | { kind: 'unsupported'; format: string; message: string };

const GET_EPUB = 'AO3, FanFicFare and FicHub all offer EPUB downloads.';

const unsupported = (format: string, message: string): SniffResult => ({ kind: 'unsupported', format, message });

const ascii = (bytes: Uint8Array, from: number, to: number) => {
  let s = '';
  for (let i = from; i < Math.min(to, bytes.length); i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const extOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

const HTML_EXT = new Set(['html', 'htm', 'xhtml', 'xht', 'shtml']);
const MD_EXT = new Set(['md', 'markdown', 'mdown', 'mkd', 'mkdn']);
const KINDLE_EXT = new Set(['mobi', 'azw', 'azw3', 'azw4', 'kfx', 'prc']);

/** Sorts a file into the importer's kinds. Never throws. */
export function sniffFile(bytes: Uint8Array, fileName: string): SniffResult {
  const ext = extOf(fileName);
  if (!bytes.length) return unsupported('empty', 'This file is empty.');
  if (ascii(bytes, 0, 5) === '%PDF-') return unsupported('pdf', `PDF files can’t be imported: they don’t keep a story’s text and chapters. Download the EPUB instead. ${GET_EPUB}`);
  // Mobipocket / Kindle (a Palm database "BOOKMOBI"), and the other Kindle formats by name.
  const palm = ascii(bytes, 60, 68);
  if (palm === 'BOOKMOBI' || palm === 'TEXtREAd' || KINDLE_EXT.has(ext)) {
    return unsupported('mobi', `Kindle books (MOBI, AZW3, KFX) can’t be imported. Download the EPUB instead. ${GET_EPUB}`);
  }
  if (ascii(bytes, 0, 8) === 'bplist00' || ext === 'webarchive') {
    return unsupported('webarchive', 'Safari web archives can’t be imported. Save the page as HTML instead (on a Mac: File › Save As › Format: Page Source), or import the story’s EPUB.');
  }
  if (ascii(bytes, 0, 5) === '{\\rtf') return unsupported('rtf', 'RTF documents can’t be imported. Save the document as HTML or plain text and import that.');
  if (isZip(bytes)) {
    // An EPUB starts with an uncompressed "mimetype" entry; when a tool got that wrong, its
    // META-INF/container.xml still gives it away.
    if (ascii(bytes, 30, 58) === 'mimetypeapplication/epub+zip') return { kind: 'epub' };
    let names: string[] = [];
    try {
      names = listZip(bytes).map((e) => e.name);
    } catch {
      return unsupported('zip', 'This file is damaged: it isn’t a readable zip archive.');
    }
    if (names.includes('META-INF/container.xml')) return { kind: 'epub' };
    if (names.includes('word/document.xml')) return unsupported('docx', 'Word documents can’t be imported. Save the document as HTML (Web Page) or plain text, or as an EPUB, and import that.');
    if (names.includes('content.xml') && names.includes('mimetype')) return unsupported('odt', 'OpenDocument files can’t be imported. Save the document as HTML or plain text and import that.');
    return unsupported('zip', 'This zip archive isn’t an EPUB. Unzip it and import the story file inside, or import the EPUB itself.');
  }
  // Text of some kind. Binary files (images, audio…) have control bytes text never has.
  const head = decodeBytes(bytes.subarray(0, 4096)).text;
  let control = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) control++;
  }
  if (control > head.length * 0.05) return unsupported('binary', 'This isn’t a story file FicShelf can read. It imports EPUB, HTML, plain text and Markdown files.');
  const start = head.replace(/^[\s﻿]+/, '');
  if (/^<(?:!doctype\s+html|html|head|body|\?xml|!--|meta|title|div|p|h[1-6]|article|section|table|center|span|b|i|font|link|style|script)\b/i.test(start)) return { kind: 'html' };
  if (HTML_EXT.has(ext) && start.startsWith('<')) return { kind: 'html' };
  if (MD_EXT.has(ext)) return { kind: 'md' };
  if (HTML_EXT.has(ext)) return { kind: 'html' };
  return { kind: 'txt' };
}
