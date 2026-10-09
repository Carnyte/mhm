// Telling real pages from bot checks. Every AO3 page loads Cloudflare's passive "jsd" script from
// /cdn-cgi/challenge-platform/, which must never count as a challenge; Wattpad's blocks come from
// CloudFront / AWS WAF. (Synthetic pages shaped on what the sites send.)

import { detectAo3Block, detectWpBlock, isAo3Block, isWpBlock, SourceBlockedError } from '../src/net/blocks';
import type { HttpResponse } from '../src/net/httpCore';

const res = (status: number, text: string, headers: Record<string, string> = {}): HttpResponse => ({ status, url: 'https://archiveofourown.org/works/1', headers, text });

// AO3 puts this inline loader on every page, its error pages included.
const JSD = `<script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'8f00',t:'MTcw'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}})();</script>`;
const AO3_WORK = `<!DOCTYPE html><html><head><title>A Work - Chapter 1 - Someone - Fandom [Archive of Our Own]</title></head><body><div id="main"><h2 class="title heading">A Work</h2><div class="userstuff"><p>Invented text.</p></div></div>${JSD}</body></html>`;
const AO3_RETRY_LATER = `<!DOCTYPE html><html><head><title>Retry later | Archive of Our Own</title></head><body><h2>Retry later</h2><p>We're sorry! The Archive is very busy.</p>${JSD}</body></html>`;
const CF_CHALLENGE = `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title><meta http-equiv="refresh" content="390"></head><body><div class="main-wrapper"><noscript>Enable JavaScript and cookies to continue</noscript></div><script>(function(){window._cf_chl_opt={cvId: '3',cZone: "archiveofourown.org",cType: 'managed'};}());</script></body></html>`;
const CF_BLOCKED = `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Sorry, you have been blocked</h1></body></html>`;
const CLOUDFRONT_403 = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd"><HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1"><TITLE>ERROR: The request could not be satisfied</TITLE></HEAD><BODY><H1>403 ERROR</H1><H2>The request could not be satisfied.</H2><HR noshade size="1px">Request blocked.</BODY></HTML>`;

describe('AO3', () => {
  it('passes a normal page that loads the jsd challenge-platform script', () => {
    expect(isAo3Block(res(200, AO3_WORK, { server: 'cloudflare', 'cf-ray': '8f00-LHR' }))).toBe(false);
    expect(detectAo3Block(res(200, AO3_WORK)).text).toBe(AO3_WORK);
  });

  it('passes AO3’s own error pages, which load it too', () => {
    expect(isAo3Block(res(429, AO3_RETRY_LATER))).toBe(false);
    expect(isAo3Block(res(503, AO3_RETRY_LATER))).toBe(false);
    expect(isAo3Block(res(404, `<title>Error 404 | Archive of Our Own</title>${JSD}`))).toBe(false);
  });

  it('flags the cf-mitigated header', () => {
    expect(isAo3Block(res(403, '', { 'cf-mitigated': 'challenge' }))).toBe(true);
  });

  it('flags Cloudflare’s challenge and block pages', () => {
    expect(isAo3Block(res(403, CF_CHALLENGE))).toBe(true);
    expect(isAo3Block(res(503, CF_CHALLENGE.replace('<title>Just a moment...</title>', '')))).toBe(true);
    expect(isAo3Block(res(403, CF_BLOCKED))).toBe(true);
  });

  it('throws SourceBlockedError naming the site and the page', () => {
    let err: unknown;
    try {
      detectAo3Block(res(403, CF_CHALLENGE));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(err).toMatchObject({ source: 'ao3', url: 'https://archiveofourown.org/works/1' });
    expect((err as Error).message).toMatch(/^AO3 wants to confirm you're human/);
  });
});

describe('Wattpad', () => {
  const json = '{"id":"6315313","title":"A Story"}';

  it('passes JSON answers and its own errors', () => {
    expect(isWpBlock(res(200, json, { 'content-type': 'application/json' }), { expectJson: true })).toBe(false);
    expect(isWpBlock(res(400, '{"error_type":"NotFound","error_code":1017}'), { expectJson: true })).toBe(false);
    expect(isWpBlock(res(200, '<p data-p-id="ab12">Text</p>'))).toBe(false);
  });

  it('flags the CloudFront 403 page', () => {
    expect(isWpBlock(res(403, CLOUDFRONT_403, { server: 'CloudFront', 'x-cache': 'Error from cloudfront' }))).toBe(true);
    expect(isWpBlock(res(403, CLOUDFRONT_403))).toBe(true);
    expect(isWpBlock(res(403, 'Forbidden', { server: 'CloudFront' }))).toBe(true);
  });

  it('flags a WAF action and HTML where JSON was expected', () => {
    expect(isWpBlock(res(202, '', { 'x-amzn-waf-action': 'challenge' }))).toBe(true);
    expect(isWpBlock(res(200, '<!DOCTYPE html><html><head><script src="https://x.edge.sdk.awswaf.com/challenge.js"></script>'), { expectJson: true })).toBe(true);
  });

  it('throws SourceBlockedError for Wattpad', () => {
    expect(() => detectWpBlock(res(403, CLOUDFRONT_403))).toThrow(SourceBlockedError);
    expect(() => detectWpBlock(res(403, CLOUDFRONT_403))).toThrow(/^Wattpad wants/);
    expect(detectWpBlock(res(200, json), { expectJson: true }).text).toBe(json);
  });
});

describe('review fixes', () => {
  it('a work titled like a challenge page is not a challenge', () => {
    for (const title of ['Just a Moment - Chapter 1 - eleventy7 [Archive of Our Own]', 'Attention Required - Works | Archive of Our Own']) {
      expect(isAo3Block(res(200, `<html><head><title>${title}</title></head><body>…</body></html>`))).toBe(false);
    }
  });

  it('Cloudflare’s own titles still are', () => {
    expect(isAo3Block(res(403, '<html><head><title>Just a moment...</title></head></html>'))).toBe(true);
    expect(isAo3Block(res(403, '<html><head><title>Attention Required! | Cloudflare</title></head></html>'))).toBe(true);
  });
});
