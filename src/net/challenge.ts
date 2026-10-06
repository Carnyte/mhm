// Cloudflare challenge detection for bridge responses.

export interface RawResponse {
  status: number;
  url: string;
  body: string;
  cf?: string;
  contentType?: string;
  cookies?: string;
  error?: string;
}

export function isChallengeResponse(r: Pick<RawResponse, 'status' | 'body' | 'cf'>): boolean {
  if (r.cf && /challenge/i.test(r.cf)) return true;
  if (r.status === 403 || r.status === 503 || r.status === 429) {
    const head = r.body.slice(0, 6000);
    return /<title>\s*(Just a moment|Attention Required)/i.test(head) || /challenge-platform|cf-chl-|cf_chl_opt/i.test(head);
  }
  return false;
}

/** Parses `document.cookie` into a map. */
export function parseCookies(cookie: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookie) return out;
  for (const part of cookie.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** FFN's own JS reads the logged-in username from the `funn` cookie (combo5.js: XUNAME). */
export function usernameFromCookies(cookie: string | undefined): string | undefined {
  const v = parseCookies(cookie).funn;
  if (!v) return undefined;
  try {
    return decodeURIComponent(v.replace(/\+/g, ' ')) || undefined;
  } catch {
    return v;
  }
}
