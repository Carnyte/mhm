// Where URLs the system hands the app go, before the router sees them. "Open in FicShelf" (Files,
// Safari downloads, Mail) arrives as a file:// URL of a copy iOS put in Documents/Inbox: that opens
// the import screen with a ticket for the file (see importHandoff.ts), never the path itself.
// Everything else (ficshelf://open?url=…, ficshelf://s/123, notifications) goes to the router
// unchanged.

import { fileNameOf, handOff } from '../features/importHandoff';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^file:\/\//i.test(path)) return `/import?open=${handOff([{ uri: path, name: fileNameOf(path) }])}`;
  } catch {
    // Fall through: the router handles it as before.
  }
  return path;
}
