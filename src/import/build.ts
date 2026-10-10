// Turning parsed pieces into the book: chapters sanitized and rendered the way the reader saves
// them, images numbered in the order they're first used, progress and pauses between chapters,
// and the final touches every format shares (origin, word count, a title when the file has none).

import { render } from 'dom-serializer';
import { isTag, isText, type Element, type ParentNode } from 'domhandler';
import { findAll } from 'domutils';
import { IMAGE_REF, sanitizeChildren, type SanitizeOptions } from '../html/sanitize';
import { renderChapter } from '../reader/notes';
import { countWords, htmlToText } from '../utils/format';
import { detectOrigin, originUrl } from './detect';
import { hasContent, parseMarkup, pruneEmptyWrappers } from './dom';
import { ImportError, MAX_COVER_BYTES, MAX_IMAGE_BYTES, type ImportedBook, type ImportedChapter, type ImportedImage, type ImportOptions } from './types';

/** `<img src>` of an image inside the book. */
export function imageRef(index: number): string {
  return `ficshelf-img:${index}`;
}

/** The image index an `imageRef` names, or undefined. */
export function parseImageRef(src: string): number | undefined {
  return IMAGE_REF.test(src) ? Number(src.slice('ficshelf-img:'.length)) : undefined;
}

/**
 * Points a saved chapter's images somewhere the reader can load them (data: URIs, file URLs):
 * `url(index)` for each `<img src="ficshelf-img:<n>">`; an image it has no URL for is removed.
 * Only <img> sources are touched, never the text.
 */
export function replaceImageRefs(html: string, url: (index: number) => string | undefined): string {
  return html.replace(/<img\b([^>]*?)\ssrc="ficshelf-img:(\d{1,6})"([^>]*)>/g, (_m, before: string, n: string, after: string) => {
    const u = url(Number(n));
    return u ? `<img${before} src="${u.replace(/"/g, '&quot;')}"${after}>` : '';
  });
}

/** The image type the bytes really are (never trusting a file name or a manifest). */
export function imageMime(b: Uint8Array): string | undefined {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return undefined;
}

/**
 * The book's images, numbered as they're first used. `load` gives an image's bytes and size by
 * its key (a path inside the EPUB), or undefined when there's none; too large or unknown types
 * are skipped and counted for the warnings.
 */
export class ImageTable {
  private byKey = new Map<string, number | null>();
  readonly list: ImportedImage[] = [];
  skippedLarge = 0;
  skippedOther = 0;

  constructor(private load: (key: string) => { size: number; read: () => Uint8Array } | undefined) {}

  /** The image's index, or null when it can't be used. */
  add(key: string, opts: { cover?: boolean } = {}): number | null {
    const known = this.byKey.get(key);
    if (known !== undefined) return known;
    let index: number | null = null;
    const src = this.load(key);
    if (src) {
      if (src.size > (opts.cover ? MAX_COVER_BYTES : MAX_IMAGE_BYTES)) this.skippedLarge++;
      else {
        let bytes: Uint8Array | undefined;
        try {
          bytes = src.read();
        } catch {
          bytes = undefined; // a damaged image is skipped, not the whole book
        }
        const mime = bytes && imageMime(bytes);
        if (bytes && mime) {
          index = this.list.length;
          this.list.push({ index, mime, bytes });
        } else this.skippedOther++;
      }
    }
    this.byKey.set(key, index);
    return index;
  }

  warnings(): string[] {
    const out: string[] = [];
    if (this.skippedLarge) out.push(`Skipped ${this.skippedLarge} image${this.skippedLarge === 1 ? '' : 's'} larger than 5 MB.`);
    if (this.skippedOther) out.push(`Skipped ${this.skippedOther} image${this.skippedOther === 1 ? '' : 's'} in a format FicShelf can’t show.`);
    return out;
  }
}

/** Prefix of an EPUB image path the parser resolved (see epub.ts); never shown. */
export const ZIP_SRC = 'ficshelf-zip:';

/** Sanitizer settings for imported text: own images only (or web images), no relative links, no classes. */
export function importSanitizeOptions(images?: ImageTable): SanitizeOptions {
  return {
    relativeUrls: 'drop',
    classes: 'none',
    image: (src) => {
      const s = src.trim();
      if (/^(https?:|data:image\/)/i.test(s)) return s;
      if (images && s.startsWith(ZIP_SRC)) {
        const i = images.add(s.slice(ZIP_SRC.length));
        return i == null ? null : imageRef(i);
      }
      return null;
    },
  };
}

/** Gives the book's images their numbers in reading order (the sanitizer visits them last to first). */
function numberImages(root: ParentNode, images?: ImageTable) {
  if (!images) return;
  for (const img of findAll((e) => e.name === 'img', root.children)) {
    const src = img.attribs.src?.trim() ?? '';
    if (src.startsWith(ZIP_SRC)) images.add(src.slice(ZIP_SRC.length));
  }
}

/** Sanitized HTML of a fragment (notes, summaries). */
export function sanitizeFragment(html: string | undefined, images?: ImageTable): string | undefined {
  if (!html?.trim()) return undefined;
  const doc = parseMarkup(html);
  numberImages(doc, images);
  const out = render(sanitizeChildren(doc, importSanitizeOptions(images)), { encodeEntities: 'utf8' }).trim();
  return out || undefined;
}

/** Whitespace-only text between blocks (source indentation) shrinks to one line break; <pre> keeps its own. */
function collapseBlankText(root: ParentNode) {
  for (const n of root.children) {
    if (isText(n)) {
      if (/\n/.test(n.data) && !n.data.trim()) n.data = '\n';
    } else if (isTag(n) && n.name !== 'pre') collapseBlankText(n);
  }
}

/** A chapter's body (raw nodes in a box) sanitized and rendered, or null when it has no text or picture. */
export function cleanBody(box: Element, images?: ImageTable): string | null {
  numberImages(box, images);
  sanitizeChildren(box, importSanitizeOptions(images));
  pruneEmptyWrappers(box);
  collapseBlankText(box);
  if (!hasContent(box)) return null;
  return render(box.children, { encodeEntities: 'utf8' }).trim();
}

/** A finished chapter from its body (raw nodes in a box) and notes (sanitized HTML), or null when it's empty. */
export function finishChapter(title: string, box: Element, images?: ImageTable, notes: { before?: string; after?: string } = {}): ImportedChapter | null {
  const html = cleanBody(box, images);
  return html == null ? null : chapterFromHtml(title, html, notes);
}

/** A chapter from body HTML that is sanitized already. */
export function chapterFromHtml(title: string, html: string, notes: { before?: string; after?: string } = {}): ImportedChapter {
  return {
    title: title.replace(/\s+/g, ' ').trim() || 'Untitled',
    html: renderChapter({ html, notesBefore: notes.before, notesAfter: notes.after }),
    words: countWords(htmlToText(html)),
  };
}

/**
 * Pauses between chapters (and between slices of a big file's decoding and parsing) so a long book
 * never holds the JS thread for long; reports progress; honours abort.
 */
export class Stepper {
  private last = Date.now();
  constructor(private opts: ImportOptions) {}

  check() {
    if (this.opts.signal?.aborted) throw new ImportError('aborted', 'The import was cancelled.');
  }

  /** Lets the event loop run when this slice of work has gone on a while (a timer is a frame on React Native). */
  readonly pause = async () => {
    this.check();
    if (Date.now() - this.last >= 24) {
      await new Promise((r) => setTimeout(r, 0));
      this.last = Date.now();
      this.check();
    }
  };

  async step(done: number, total: number) {
    this.check();
    this.opts.onProgress?.(done, total);
    await this.pause();
  }
}

/** What every parser hands back, before the shared finishing touches. */
export type BookDraft = Omit<ImportedBook, 'words' | 'origin'>;

/** Origin, total words, a title and a check that there's something to read. */
export function finishBook(d: BookDraft, fileName: string): ImportedBook {
  const chapters = d.chapters.filter((c) => c.html.trim());
  if (!chapters.length) throw new ImportError('empty', 'No story text was found in this file.');
  const baseName = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
  const book: ImportedBook = {
    ...d,
    title: d.title.replace(/\s+/g, ' ').trim() || baseName || 'Untitled',
    authors: [...new Set(d.authors.map((a) => a.replace(/\s+/g, ' ').trim()).filter(Boolean))],
    chapters,
    words: chapters.reduce((n, c) => n + c.words, 0),
    warnings: [...new Set(d.warnings)],
  };
  // Only a web page counts as a source; a detected story gets its canonical address.
  const url = d.sourceUrl?.trim();
  book.sourceUrl = url && /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : undefined;
  const origin = detectOrigin(book.sourceUrl);
  if (origin) {
    book.origin = origin;
    book.sourceUrl = originUrl(origin);
  }
  if (!book.tags?.length) delete book.tags;
  if (!book.identifiers?.length) delete book.identifiers;
  for (const k of Object.keys(book) as (keyof ImportedBook)[]) if (book[k] === undefined) delete book[k];
  return book;
}
