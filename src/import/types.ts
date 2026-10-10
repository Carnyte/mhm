// What the importer makes of a file: a book the app can store as a local story (or attach to its
// online story), with every chapter's HTML already sanitized and ready for the reader.

import type { StoryKey } from '../sources/keys';
import type { Tag } from '../sources/types';

export type ImportKind = 'epub' | 'html' | 'txt' | 'md';

/** The tool that made the file, when it can be told. */
export type ImportGenerator = 'ao3' | 'fichub' | 'fanficfare' | 'calibre' | 'ffn' | 'readability';

export interface ImportedChapter {
  title: string;
  /**
   * Sanitized HTML, exactly what the reader shows and the device saves (src/reader/notes.ts:
   * author's notes are `aside.fs-notes` before / after the text). Images are `ficshelf-img:<n>`,
   * <n> being an index into `ImportedBook.images`.
   */
  html: string;
  /** Words of the chapter's text, notes left out. */
  words: number;
}

export interface ImportedImage {
  index: number;
  /** image/jpeg, image/png, image/gif or image/webp (checked against the bytes). */
  mime: string;
  bytes: Uint8Array;
}

/** The online story a file came from, on a site the app reads. */
export interface ImportOrigin {
  source: 'ao3' | 'ffn' | 'wp';
  remoteId: string;
  key: StoryKey;
}

export interface ImportedBook {
  kind: ImportKind;
  title: string;
  /** Creator names as the file gives them; may be empty. */
  authors: string[];
  /** Plain text, paragraphs separated by blank lines (like StoryMeta.summary). */
  summary?: string;
  /** Tags with their kind when the file says it (AO3 tag lists, FanFicFare fields), else 'freeform'. */
  tags?: Tag[];
  rating?: string;
  /** As the file states it, codes turned into names: 'en' → 'English'. */
  language?: string;
  /** Milliseconds since the epoch (LibraryStory keeps Unix seconds). */
  published?: number;
  updated?: number;
  /** Only when the file says so. */
  complete?: boolean;
  /** Sum of the chapters' words. */
  words: number;
  chapters: ImportedChapter[];
  images: ImportedImage[];
  /** Index into `images`. */
  cover?: number;
  /** The story's page on its site, when the file names it. */
  sourceUrl?: string;
  origin?: ImportOrigin;
  generator?: ImportGenerator;
  /** The file's own ids (EPUB dc:identifier: FanFicFare / FicHub / Calibre uids), for spotting re-imports. */
  identifiers?: string[];
  /** Things the user may want to know (skipped images, a page holding one chapter of many…). */
  warnings: string[];
}

export interface ImportOptions {
  /** Called as chapters are done (also with 0 before the first). */
  onProgress?: (done: number, total: number) => void;
  /** Stops the import between chapters with an ImportError 'aborted'. */
  signal?: AbortSignal;
}

export type ImportErrorCode = 'unsupported' | 'too-large' | 'invalid' | 'drm' | 'empty' | 'aborted';

/** A file the importer can't or won't read; `message` is written for the user. */
export class ImportError extends Error {
  constructor(
    public code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Limits on untrusted files (the phone parses on the JS thread and holds the book in memory). */
export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** The cover is kept up to this size. */
export const MAX_COVER_BYTES = 20 * 1024 * 1024;
