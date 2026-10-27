// Where URLs the system hands the app go, before the router sees them. "Open in FicShelf" (Files,
// Safari downloads, Mail) arrives as a file:// URL of a copy iOS put in Documents/Inbox: that opens
// the import screen with a ticket for the file (see importHandoff.ts), never the path itself. A
// link into the in-app browser for a site other than fanfiction.net (ficshelf://web?url=…) goes to
// the Open screen instead, which names the site and asks: a link from outside can't drop the user
// into an arbitrary page. Everything else (ficshelf://open?url=…, ficshelf://s/123, notifications)
// goes to the router unchanged.

import { fileNameOf, handOff } from '../features/importHandoff';
import { webMode } from '../net/webHosts';

/** The `url` of a link to the in-app browser (`ficshelf://web?url=…`, `/web?url=…`), if it is one. */
function browserUrl(path: string): string | undefined {
  const m = path.match(/^(?:ficshelf:)?\/*web\/?\?(.*)$/i);
  if (!m) return undefined;
  try {
    return new URLSearchParams(m[1]).get('url') ?? undefined;
  } catch {
    return undefined;
  }
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^file:\/\//i.test(path)) return `/import?open=${handOff([{ uri: path, name: fileNameOf(path) }])}`;
    const url = browserUrl(path);
    if (url !== undefined && webMode(url) !== 'ffn') return `/open?url=${encodeURIComponent(url)}`;
  } catch {
    // Fall through: the router handles it as before.
  }
  return path;
}
