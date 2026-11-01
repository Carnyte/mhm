// Whether FicShelf is logged in to AO3, and as whom. The login itself happens on AO3's own page
// in a visible WebView (src/app/signin/[source].tsx); the session cookie it leaves is shared with
// native requests, so every page the app fetches says whether the session still holds:
// src/sources/ao3/api.ts hands each one to `noteAo3Page`, and a redirect to the login page or
// /lost_cookie, or a page rendered for a visitor, means logged out.
//
// Stored as kv `session:ao3` = { username, checkedAt } (no cookie, token or password, ever).
// Plain TypeScript: no React Native here (the hook is src/hooks/useAo3Session.ts).

import { kv } from '../../db/kv';
import { parseGreeting } from './parsers/account';

export interface Ao3SessionState {
  loggedIn: boolean;
  username?: string;
  /** When a page last showed the session (ms since epoch). */
  checkedAt?: number;
}

export const AO3_SESSION_KEY = 'session:ao3';

/** How often a page that only confirms the session is written down again. */
const RESAVE_MS = 60 * 60_000;

interface Stored {
  username?: string;
  checkedAt?: number;
}

function load(): Ao3SessionState {
  try {
    const s = kv.getSync<Stored>(AO3_SESSION_KEY);
    if (s && typeof s === 'object' && typeof s.username === 'string' && s.username) {
      return { loggedIn: true, username: s.username, checkedAt: typeof s.checkedAt === 'number' ? s.checkedAt : undefined };
    }
  } catch {
    // storage not ready (tests, a failed migration): logged out
  }
  return { loggedIn: false };
}

let snapshot: Ao3SessionState = load();
const listeners = new Set<() => void>();

export function getAo3Session(): Ao3SessionState {
  return snapshot;
}

export function subscribeAo3Session(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function save(next: Ao3SessionState) {
  const changed = next.loggedIn !== snapshot.loggedIn || next.username !== snapshot.username;
  const stale = next.loggedIn && (next.checkedAt ?? 0) - (snapshot.checkedAt ?? 0) >= RESAVE_MS;
  snapshot = next;
  if (changed || stale) {
    const write = next.loggedIn ? kv.set(AO3_SESSION_KEY, { username: next.username, checkedAt: next.checkedAt }) : kv.delete(AO3_SESSION_KEY);
    write.catch(() => {});
  }
  if (changed) listeners.forEach((l) => l());
}

/** Logged in as `username` (the sign-in screen, after a native request confirmed it). */
export function setAo3LoggedIn(username: string, now = Date.now()) {
  save({ loggedIn: true, username, checkedAt: now });
}

export function setAo3LoggedOut() {
  save({ loggedIn: false });
}

const LOGGED_OUT_URL = /^https:\/\/archiveofourown\.org\/(?:users\/login|lost_cookie)\b/i;

/**
 * What a fetched page says about the session ('in', 'out', or null when it doesn't say).
 * `url` is the final URL, after redirects.
 */
export function noteAo3Page(url: string, html: string, now = Date.now()): 'in' | 'out' | null {
  if (LOGGED_OUT_URL.test(url)) {
    setAo3LoggedOut();
    return 'out';
  }
  const seen = parseGreeting(html);
  if (!seen) return null;
  if (seen.state === 'out') {
    setAo3LoggedOut();
    return 'out';
  }
  // A page for a logged-in user whose name the markup didn't give keeps the name already known.
  const username = seen.username ?? snapshot.username;
  if (username) save({ loggedIn: true, username, checkedAt: now });
  return 'in';
}

/** Forgets the session in memory (tests). */
export function resetAo3SessionState(state: Ao3SessionState = { loggedIn: false }) {
  snapshot = state;
}
