// What a logged-in AO3 session does through native requests: confirm the login, and log out.
// (Kudos, comments, subscriptions and bookmarks are the next step of P6, docs/ao3.md §6.)
//
// Rules (docs/ao3.md §6 "policies"):
//  - every POST follows an explicit tap, goes through the polite client (which never retries a
//    POST) and asks AO3 for a fresh CSRF token first (`GET /token_dispenser.json`): logged-out
//    pages are cached whole, so a token read from a page can be stale;
//  - the token is never stored or logged.

import { detectAo3Block } from '../../net/blocks';
import { httpText, type HttpResponse } from '../../net/http';
import type { FetchOpts } from '../types';
import { ao3Fetch, ao3Url, Ao3UnavailableError } from './api';
import { getAo3Session, noteAo3Page, setAo3LoggedIn, setAo3LoggedOut } from './session';
import { AO3_ORIGIN } from './urls';

/** A fresh CSRF token for one POST. */
export async function fetchToken(o: FetchOpts = {}): Promise<string> {
  const r = await ao3Fetch('/token_dispenser.json', { ...o, priority: o.priority ?? 'user' });
  let token: unknown;
  try {
    token = (JSON.parse(r.text) as { token?: unknown })?.token;
  } catch {
    token = undefined;
  }
  if (typeof token !== 'string' || !token) throw new Error('AO3 didn’t hand out a form token. Try again in a moment.');
  return token;
}

/**
 * POSTs a form to AO3 with a fresh token. Only ever on a tap; never retried (the client doesn't
 * retry POSTs, and nothing here does). Resolves with AO3's answer whatever its status, except
 * server errors (Ao3UnavailableError) and blocks (SourceBlockedError).
 */
export async function ao3Post(path: string, fields: Record<string, string>, o: FetchOpts & { headers?: Record<string, string> } = {}): Promise<HttpResponse> {
  const url = ao3Url(path);
  const token = await fetchToken(o);
  const body = Object.entries({ authenticity_token: token, ...fields })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const r = detectAo3Block(
    await httpText(url, {
      method: 'POST',
      body,
      priority: 'user',
      signal: o.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        Origin: AO3_ORIGIN,
        Referer: AO3_ORIGIN + '/',
        ...o.headers,
      },
    }),
  );
  if (/^https:\/\/archiveofourown\.org(?:[/?#]|$)/i.test(r.url) && r.status < 500) noteAo3Page(r.url, r.text);
  if (r.status >= 500) throw new Ao3UnavailableError(r.status);
  return r;
}

export type Ao3Check = { loggedIn: true; username: string } | { loggedIn: false };

/**
 * Asks AO3 (one native request, its front page) whether FicShelf's own requests carry the login.
 * Updates the stored session either way.
 */
export async function checkAo3Login(o: FetchOpts = {}): Promise<Ao3Check> {
  const r = await ao3Fetch('/', { ...o, priority: 'user' });
  const seen = noteAo3Page(r.url, r.text);
  const username = getAo3Session().username;
  if (seen === 'in' && username) return { loggedIn: true, username };
  if (seen === 'out') return { loggedIn: false };
  // A page that says nothing either way (AO3 changed its header): not logged in as far as the app can tell.
  setAo3LoggedOut();
  return { loggedIn: false };
}

/** The sign-in screen saw AO3's greeting for `username`: confirmed by a native request before it counts. */
export async function confirmAo3Login(username: string, o: FetchOpts = {}): Promise<Ao3Check> {
  const r = await ao3Fetch('/', { ...o, priority: 'user' });
  const seen = noteAo3Page(r.url, r.text);
  if (seen === 'in') {
    // The header's name, or the one the sign-in page showed when the header had none.
    const name = getAo3Session().username ?? username;
    setAo3LoggedIn(name);
    return { loggedIn: true, username: name };
  }
  return { loggedIn: false };
}

/**
 * Logs out of AO3 for native requests: `POST /users/logout` (`_method=delete`, fresh token), then
 * one GET to make sure. The WebView's own cookies are checked by the sign-in screen afterwards
 * (cookie deletions don't sync from native requests to WebViews).
 */
export async function logoutNative(o: FetchOpts = {}): Promise<Ao3Check> {
  await ao3Post('/users/logout', { _method: 'delete' }, o);
  const after = await checkAo3Login(o);
  return after;
}
