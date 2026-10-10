// Importing story files: EPUB, HTML, plain text and Markdown, into a book the app can store as a
// local story or attach to the online story it came from. Pure TypeScript (no React Native), so
// it runs the same on the phone (Hermes) and in tests.
//
//   const book = await parseImport(bytes, 'work.epub', { onProgress, signal });
//
// Untrusted input throughout: sizes are capped (100 MB in, 200 MB unpacked, 5 MB per image), zip
// paths are never file paths, and every chapter goes through the allowlist sanitizer. Parsing
// pauses between chapters, so a long book doesn't hold the JS thread for long.

import { finishBook, Stepper } from './build';
import { parseEpub } from './epub';
import { parseHtmlFile } from './html';
import { sniffFile } from './sniff';
import { parseMarkdownFile, parseTextFile } from './text';
import { ImportError, MAX_INPUT_BYTES, type ImportedBook, type ImportOptions } from './types';

export { imageMime, imageRef, parseImageRef, replaceImageRefs } from './build';
export { decodeBytes, type DecodedText } from './decode';
export { detectOrigin, originUrl } from './detect';
export { sniffFile, type SniffResult } from './sniff';
export * from './types';

/** MIME types for the document picker (MIME types only: iOS drops UTI strings there). */
export const IMPORT_MIME_TYPES = ['application/epub+zip', 'text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown'];

/** Reads a story file. Throws an ImportError (with a message for the user) when it can't. */
export async function parseImport(bytes: Uint8Array, fileName: string, opts: ImportOptions = {}): Promise<ImportedBook> {
  if (bytes.length > MAX_INPUT_BYTES) throw new ImportError('too-large', 'This file is too large to import (over 100 MB).');
  const stepper = new Stepper(opts);
  stepper.check();
  const kind = sniffFile(bytes, fileName);
  if (kind.kind === 'unsupported') throw new ImportError(kind.format === 'empty' ? 'empty' : 'unsupported', kind.message);
  const draft =
    kind.kind === 'epub'
      ? await parseEpub(bytes, stepper)
      : kind.kind === 'html'
        ? await parseHtmlFile(bytes, stepper)
        : kind.kind === 'md'
          ? await parseMarkdownFile(bytes, fileName, stepper)
          : await parseTextFile(bytes, fileName, stepper);
  return finishBook(draft, fileName);
}
