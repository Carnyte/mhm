// Files on their way to the import screen. "Open in FicShelf" (src/app/+native-intent.tsx) and the
// picker hand the screen a ticket, never a path: the router's parameters can come from any
// ficshelf:// link, and the screen reads, then deletes, the files it's given. So it only ever
// reads files the system gave the app. While a ticket is out its files are in use, and the launch
// sweep (importFiles.ts) leaves them alone even when iOS kept an old modification date on its copy.
//
// No imports beyond types: +native-intent loads this before anything else.

/** A file handed to the import screen. */
export interface PickedFile {
  uri: string;
  name: string;
  size?: number;
}

const tickets = new Map<string, PickedFile[]>();
let issued = 0;

/** The name a file:// URL ends in, decoded ("Fic%20%233.epub" → "Fic #3.epub"). */
export function fileNameOf(uri: string): string {
  const last = uri.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const raw = last.slice(last.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(raw) || 'Story';
  } catch {
    return raw || 'Story';
  }
}

/** Hands files to the import screen: the ticket goes in its route (`/import?open=<ticket>`). */
export function handOff(files: PickedFile[]): string {
  const ticket = `${(++issued).toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  tickets.set(ticket, files.map((f) => ({ ...f })));
  return ticket;
}

/** The files a ticket stands for (none for an unknown ticket: a link made up outside the app). */
export function filesFor(ticket: string | undefined): PickedFile[] {
  return (ticket && tickets.get(ticket)?.map((f) => ({ ...f }))) || [];
}

/** The screen is done with a ticket's files. */
export function release(ticket: string | undefined) {
  if (ticket) tickets.delete(ticket);
}

/** Whether a file of this name (as listed, or still URL-encoded) is out on a ticket: the import screen is reading or showing it. */
export function inUse(name: string): boolean {
  const names = new Set([name, fileNameOf(name)]);
  for (const files of tickets.values()) if (files.some((f) => names.has(fileNameOf(f.uri)))) return true;
  return false;
}
