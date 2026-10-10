// Imported files as a Source: stories that exist only on this device (src/features/imports.ts
// stores them). Everything is read from the library and the saved chapters, never from a network:
// there's nothing to search, check for updates or download, and a chapter that isn't saved is an
// error, not a fetch.
//
// The reader shows imported pages (untrusted HTML) on a blank origin with a Content-Security-
// Policy: images only from data: URIs (the book's own, swapped in at load time), inline styles,
// and the reader's own scripts by a nonce the template fills in per page ({nonce}).

import { chapterStore } from '../../db/kv';
import { libraryStore } from '../../state/library';
import { toKey } from '../keys';
import { infoFromLibrary } from '../meta';
import type { Source } from '../types';

export const LOCAL_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'";

/** An imported story or chapter that isn't on this device (deleted, or never fully saved). */
export class LocalMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalMissingError';
  }
}

export const localSource: Source = {
  id: 'local',
  name: 'Imported file',
  short: 'File',
  transport: 'local',
  caps: {
    browse: false,
    search: false,
    download: false,
    updates: false,
    login: false,
    follow: false,
    endorse: false,
    discuss: 'none',
    accountSync: false,
  },
  reader: { baseUrl: 'about:blank', csp: LOCAL_CSP },
  // Always on: imported stories are the user's own files.
  enabled: () => true,
  parseLink: () => null,
  // The site the file came from, when it names one ("Share" and "Copy link" need a page to point to).
  webUrl: (remoteId) => libraryStore.get().stories[toKey('local', remoteId)]?.local?.sourceUrl ?? '',
  getStory: async (remoteId) => {
    const lib = libraryStore.get().stories[toKey('local', remoteId)];
    if (!lib) throw new LocalMissingError('This imported story isn’t on this device any more. Import its file again to read it.');
    return infoFromLibrary(lib);
  },
  getChapter: async (remoteId, ch) => {
    const key = toKey('local', remoteId);
    const html = await chapterStore.get(key, ch.number);
    if (!html) {
      throw new LocalMissingError(
        `Chapter ${ch.number} of this imported story isn’t on this device. Import the file again (Replace keeps your place) to restore it.`,
      );
    }
    const title = libraryStore.get().stories[key]?.chapterTitles?.[ch.number - 1];
    return { number: ch.number, html, ...(title ? { title } : {}) };
  },
};
