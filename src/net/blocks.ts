// Telling a real page from a bot check, per site, for responses from the native HTTP client.
//
// AO3 sits behind Cloudflare. Every AO3 page, its error pages included, loads Cloudflare's passive
// "jsd" script (/cdn-cgi/challenge-platform/scripts/jsd/main.js), so the bare "challenge-platform"
// string FanFiction.net's check uses would flag every page. A real challenge is the
// `cf-mitigated: challenge` header, Cloudflare's "Just a moment…" / "Attention Required" page, or
// its challenge options object (cf_chl_opt).
//
// Wattpad sits behind CloudFront and AWS WAF: a block is a CloudFront 403 ("The request could not
// be satisfied"), the `x-amzn-waf-action` header, or an HTML page where its API returns JSON.

import { SOURCE_NAMES, type SourceId } from '../sources/keys';
import type { HttpResponse } from './httpCore';

/** The site wants to check the connection is a person ("Verify on <site>" opens it in a WebView). */
export class SourceBlockedError extends Error {
  constructor(
    public source: SourceId,
    public url: string,
  ) {
    super(`${SOURCE_NAMES[source]} wants to confirm you're human before it sends more pages.`);
    this.name = 'SourceBlockedError';
  }
}

const head = (r: HttpResponse) => r.text.slice(0, 8000);
// Cloudflare's own challenge titles exactly, so a work called "Just a Moment" isn't one.
const CF_TITLE = /<title>\s*(?:Just a moment\.\.\.|Attention Required! \| Cloudflare)\s*<\/title>/i;

export function isAo3Block(r: HttpResponse): boolean {
  if (/challenge/i.test(r.headers['cf-mitigated'] ?? '')) return true;
  const h = head(r);
  return CF_TITLE.test(h) || /cf_chl_opt/.test(h);
}

/** Throws SourceBlockedError when an AO3 response is a Cloudflare challenge. */
export function detectAo3Block(r: HttpResponse): HttpResponse {
  if (isAo3Block(r)) throw new SourceBlockedError('ao3', r.url);
  return r;
}

export function isWpBlock(r: HttpResponse, opts: { expectJson?: boolean } = {}): boolean {
  if (r.headers['x-amzn-waf-action']) return true;
  if (r.status === 403 && (/cloudfront/i.test(r.headers.server ?? '') || /could not be satisfied/i.test(head(r)))) return true;
  if (opts.expectJson && r.status < 400 && /^\s*</.test(r.text)) return true;
  return false;
}

/** Throws SourceBlockedError when a Wattpad response is a CloudFront / WAF block. */
export function detectWpBlock(r: HttpResponse, opts: { expectJson?: boolean } = {}): HttpResponse {
  if (isWpBlock(r, opts)) throw new SourceBlockedError('wp', r.url);
  return r;
}
