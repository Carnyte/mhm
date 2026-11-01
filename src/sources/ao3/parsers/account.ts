// What an AO3 page says about who is looking at it. Every AO3 page's header has either the
// greeting of a logged-in user (`#greeting`, with a link to `/users/NAME`) or the logged-out
// "Log In" dropdown (`#login`, `form#new_user_session_small`); `<body>` also carries `logged-in` /
// `logged-out`. Cheap string checks, run on every page the app fetches (src/sources/ao3/api.ts):
// only the part before `#main` is read (a page without one says nothing), so a work's own text
// can never pass for the header.
//
// Logged-in markup is known from AO3's source (otwarchive), not from live pages, so the checks
// stay loose: any one marker is enough, and a page with none (JSON, the download host, the
// autocomplete) says nothing.

export type Ao3PageSession = { state: 'in'; username?: string } | { state: 'out' };

/** The header part of a page (before the main content), or null for what isn't an AO3 page. */
function headerOf(html: string): string | null {
  const main = html.search(/<[a-z]+[^>]*\sid=["']main["']/i);
  return main >= 0 ? html.slice(0, main) : null;
}

/** AO3 usernames: letters, digits and underscores, at most 40 characters. */
const USER = /^[A-Za-z0-9_]{1,40}$/;

function usernameIn(header: string): string | undefined {
  const at = header.search(/\sid=["']greeting["']/i);
  if (at < 0) return undefined;
  const near = header.slice(at, at + 6000);
  const m = near.match(/href=["'](?:https:\/\/archiveofourown\.org)?\/users\/([^"'/?#]+)["'/?#]/i);
  if (!m) return undefined;
  let name = m[1];
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep as is
  }
  return USER.test(name) ? name : undefined;
}

/** Whether the page was rendered for a logged-in user, a visitor, or doesn't say (null). */
export function parseGreeting(html: string): Ao3PageSession | null {
  if (!html || html.length < 40) return null;
  const header = headerOf(html);
  if (header == null) return null;
  const username = usernameIn(header);
  if (username) return { state: 'in', username };
  if (/\sid=["'](?:login|login-dropdown)["']|new_user_session_small/i.test(header)) return { state: 'out' };
  const body = header.match(/<body\b[^>]*\bclass=["']([^"']*)["']/i)?.[1] ?? '';
  if (/(?:^|\s)logged-out(?:\s|$)/.test(body)) return { state: 'out' };
  if (/(?:^|\s)logged-in(?:\s|$)/.test(body) || /\sid=["']greeting["']/i.test(header)) return { state: 'in' };
  return null;
}
