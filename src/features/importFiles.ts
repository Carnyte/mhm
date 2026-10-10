// The files kept for imported stories, under Documents/imports/<key with ':' → '_'>/:
//
//   original.<kind>   the file as imported (unless Settings → Imported files says not to keep it)
//   cover.<ext>       the book's cover
//   img/<n>.<ext>     the pictures its chapters show, <n> being the `ficshelf-img:<n>` in the text
//
// Names are the app's own (indexes, the file's kind), never names or paths from inside the file.
// The library records them relative to Documents (the folder's absolute path changes between
// installs), and a story's folder is always found from its key, never from what a record says.
// Also: turning `ficshelf-img:` references into data: URIs for the reader, and clearing out files
// iOS and the picker leave behind.

import { Directory, File, Paths } from 'expo-file-system';
import { chapterStore } from '../db/kv';
import type { ImportedBook } from '../import/types';
import type { StoryKey } from '../sources/keys';
import { libraryStore, type LocalOrigin } from '../state/library';
import { docRef } from '../utils/docFiles';

export const IMPORTS_DIR = 'imports';

/** A story's folder name: 'local:lx3k9f2a8q' → 'local_lx3k9f2a8q', 'ao3:123' → 'ao3_123'. */
export function importDirName(key: StoryKey): string {
  return key.replace(':', '_');
}

/** The story's folder, relative to Documents. */
export function importDirPath(key: StoryKey): string {
  return `${IMPORTS_DIR}/${importDirName(key)}`;
}

function storyDir(key: StoryKey, suffix = ''): Directory {
  return new Directory(Paths.document, IMPORTS_DIR, importDirName(key) + suffix);
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

/** The image numbers (`ficshelf-img:<n>`) a piece of chapter HTML uses. */
export function imageRefsIn(html: string): number[] {
  const out = new Set<number>();
  const re = /ficshelf-img:(\d{1,6})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.add(Number(m[1]));
  return [...out];
}

/** Stories being written right now: the launch sweep leaves their folders alone. */
export const writing = new Set<StoryKey>();

function writeFile(dir: Directory, name: string, bytes: Uint8Array) {
  const f = new File(dir, name);
  f.create({ intermediates: true, overwrite: true });
  f.write(bytes);
}

function removeFile(dir: Directory, name: string | undefined) {
  if (!name) return;
  try {
    const f = new File(dir, ...name.split('/'));
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

export interface WrittenFiles {
  original?: string;
  cover?: string;
  images: Record<string, string>;
}

export interface WriteFilesOptions {
  /** A copy of the file to keep as original.<kind> (the picked or opened file). */
  originalUri?: string;
  /** Number the pictures from here (a linked import adding to an earlier one's pictures). */
  offset?: number;
  /** Files of an earlier import in the same folder that this one replaces (cover, original). */
  previous?: Pick<LocalOrigin, 'cover' | 'original'>;
  /** Write into '<folder>.new' instead: a replacement, swapped in once it's complete. */
  staging?: boolean;
}

/**
 * Writes a book's pictures (only those its chapters show), its cover and, when asked, the original
 * file into the story's folder. Returns the names, relative to the folder.
 */
export async function writeBookFiles(key: StoryKey, book: ImportedBook, o: WriteFilesOptions = {}): Promise<WrittenFiles> {
  const dir = storyDir(key, o.staging ? '.new' : '');
  if (o.staging && dir.exists) dir.delete();
  dir.create({ intermediates: true, idempotent: true });
  const offset = o.offset ?? 0;
  const used = new Set(book.chapters.flatMap((c) => imageRefsIn(c.html)));
  const images: Record<string, string> = {};
  const imgDir = new Directory(dir, 'img');
  for (const img of book.images) {
    const ext = EXT[img.mime];
    if (!ext || !used.has(img.index)) continue;
    const name = `${img.index + offset}.${ext}`;
    writeFile(imgDir, name, img.bytes);
    images[String(img.index + offset)] = `img/${name}`;
  }
  const out: WrittenFiles = { images };
  const cover = book.cover != null ? book.images[book.cover] : undefined;
  if (cover && EXT[cover.mime]) {
    if (!o.staging) removeFile(dir, o.previous?.cover);
    out.cover = `cover.${EXT[cover.mime]}`;
    writeFile(dir, out.cover, cover.bytes);
  }
  if (o.originalUri) {
    // A copy that can't be made (the file went away meanwhile) costs the copy, not the import.
    try {
      const name = `original.${book.kind}`;
      const dest = new File(dir, name);
      if (dest.exists) dest.delete();
      await new File(o.originalUri).copy(dest);
      if (!o.staging && o.previous?.original !== name) removeFile(dir, o.previous?.original);
      out.original = name;
    } catch {
      // Imported without its original.
    }
  }
  return out;
}

/** Puts a replacement written with `staging` in place of the story's folder. */
export function swapInStaged(key: StoryKey) {
  const staged = storyDir(key, '.new');
  const dir = storyDir(key);
  if (dir.exists) dir.delete();
  staged.rename(importDirName(key));
}

/** Throws away a replacement written with `staging` (the import failed). */
export function dropStaged(key: StoryKey) {
  try {
    const staged = storyDir(key, '.new');
    if (staged.exists) staged.delete();
  } catch {
    // Nothing to drop.
  }
}

/** Deletes a story's folder and everything in it. */
export function removeImportFiles(key: StoryKey) {
  try {
    const dir = storyDir(key);
    if (dir.exists) dir.delete();
  } catch {
    // Already gone.
  }
}

/** `ficshelf-doc:` reference of a file in the story's folder (a cover URL the library can store). */
export function storyFileRef(key: StoryKey, name: string): string {
  return docRef(`${importDirPath(key)}/${name}`);
}

/**
 * The pictures a chapter shows, as data: URIs by image number, read from the story's folder (the
 * reader page has no other way to them: it's an HTML string on a blank origin). Pictures that
 * aren't there are left out (the reader drops their <img>).
 */
export async function chapterImages(key: StoryKey, html: string): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const images = libraryStore.get().stories[key]?.local?.images;
  if (!images) return out;
  const dir = storyDir(key);
  for (const n of imageRefsIn(html)) {
    const name = images[String(n)];
    const mime = name && MIME[name.slice(name.lastIndexOf('.') + 1).toLowerCase()];
    if (!name || !mime) continue;
    try {
      const f = new File(dir, ...name.split('/'));
      if (f.exists) out[n] = `data:${mime};base64,${await f.base64()}`;
    } catch {
      // A picture that can't be read is left out.
    }
  }
  return out;
}

/** Bytes used by imported stories' files (originals, covers, pictures). */
export function importFilesBytes(): number {
  try {
    const dir = new Directory(Paths.document, IMPORTS_DIR);
    return dir.exists ? (dir.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** Files older than this are left-overs (the one being opened right now is newer). */
const LEFTOVER_MS = 10 * 60_000;

function sweepDir(dir: Directory, now: number) {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    try {
      const time = entry instanceof File ? (entry.modificationTime ?? entry.creationTime ?? 0) : (entry.info().modificationTime ?? 0);
      if (now - time > LEFTOVER_MS) entry.delete();
    } catch {
      // Try again next launch.
    }
  }
}

/**
 * Clears out what imports leave behind, once at launch: copies iOS put in Documents/Inbox for
 * "Open in FicShelf" and the picker's copies (older than a few minutes, so a file being opened
 * right now stays), half-written replacements, and folders or saved chapters of imports that never
 * finished (no library record).
 */
export async function sweepImports(now = Date.now()) {
  sweepDir(new Directory(Paths.document, 'Inbox'), now);
  sweepDir(new Directory(Paths.cache, 'DocumentPicker'), now);
  const stories = libraryStore.get().stories;
  const owned = (key: StoryKey) => writing.has(key) || !!stories[key]?.local || (key.startsWith('local:') && !!stories[key]);
  try {
    const root = new Directory(Paths.document, IMPORTS_DIR);
    if (root.exists) {
      for (const entry of root.list()) {
        if (!(entry instanceof Directory)) continue;
        const name = entry.name;
        const key = name.replace('_', ':').replace(/\.new$/, '') as StoryKey;
        if (name.endsWith('.new') ? !writing.has(key) : !owned(key)) entry.delete();
      }
    }
  } catch {
    // Try again next launch.
  }
  await chapterStore.removeStaging().catch(() => {});
  const keys = await chapterStore.storyKeys('local:').catch(() => [] as StoryKey[]);
  for (const key of keys) if (!owned(key)) await chapterStore.remove(key).catch(() => {});
}
