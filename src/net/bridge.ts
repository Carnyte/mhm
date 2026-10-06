// Platform-agnostic request queue for the fanfiction.net bridge.
// A transport (BridgeHost.tsx on iOS/Android, BridgeHost.web.tsx for the dev web build)
// registers itself and performs the actual in-page fetches.

import { absolute } from '../ffn/urls';
import { isChallengeResponse, usernameFromCookies, type RawResponse } from './challenge';
import { isMobileSiteUrl } from './webviewConfig';

export type BridgeStatus = 'starting' | 'ready' | 'verifying' | 'needs-user' | 'offline' | 'error';

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  base64?: boolean;
  /** Milliseconds before the request fails. */
  timeout?: number;
  /** Don't escalate to the visible challenge (background work). */
  quiet?: boolean;
  signal?: AbortSignal;
}

export interface Transport {
  send(id: string, url: string, opts: RequestOptions): void;
  /**
   * Reload the bridge page (to let Cloudflare re-run its challenge). `bust` skips any cached
   * redirect; `url` loads that page instead of the home page (a challenge can be page-specific).
   */
  reload(bust?: boolean, url?: string): void;
  /** Show / hide the bridge page full screen so the user can solve a challenge. */
  setVisible(visible: boolean): void;
}

export class BridgeError extends Error {
  constructor(
    message: string,
    public code: 'timeout' | 'challenge' | 'network' | 'http' | 'cancelled' | 'unavailable',
    public status?: number,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

interface Pending {
  id: string;
  url: string;
  opts: RequestOptions;
  resolve: (r: RawResponse) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  attempts: number;
  sent: boolean;
}

type Listener = () => void;

const MAX_IN_FLIGHT = 4;
const PASSIVE_WAIT_MS = 9000;
const MOBILE_SITE_ERROR =
  'FanFiction.net sent the app to its mobile site (m.fanfiction.net), which the app can’t use. Tap Reconnect in Settings → Connection; if it keeps happening, send the details shown there.';

/** Turns WebKit / Chromium fetch errors into something a reader can act on. */
export function describeFetchError(raw: string): string {
  if (/bridge page is on|redirected away/i.test(raw)) return MOBILE_SITE_ERROR;
  if (/load failed|failed to fetch|network/i.test(raw)) {
    return `Couldn’t load the page from FanFiction.net. Check your internet connection and try again. (${raw})`;
  }
  return raw;
}

class Bridge {
  private transport: Transport | null = null;
  private pending = new Map<string, Pending>();
  private queue: string[] = [];
  private inFlight = 0;
  private seq = 0;
  private listeners = new Set<Listener>();
  private passiveTimer?: ReturnType<typeof setTimeout>;
  private probing = false;
  private reloading = false;
  private lastReload = 0;

  status: BridgeStatus = 'starting';
  cookies = '';
  lastError?: string;
  pageReady = false;
  /** Diagnostics: where the bridge page is and how it identifies itself. */
  pageUrl?: string;
  userAgent?: string;
  private mobileRedirects: number[] = [];

  // --- wiring --------------------------------------------------------------

  attach(t: Transport) {
    this.transport = t;
  }

  detach(t: Transport) {
    if (this.transport === t) this.transport = null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setStatus(s: BridgeStatus) {
    if (this.status !== s) {
      this.status = s;
      this.emit();
    }
  }

  get username(): string | undefined {
    return usernameFromCookies(this.cookies);
  }

  // --- transport callbacks ------------------------------------------------------

  /** The bridge page finished loading (challenge page or the real site). */
  onPageReady(info: { challenge: boolean; cookies?: string; href?: string; ua?: string }) {
    if (info.ua) this.userAgent = info.ua;
    if (info.href) {
      this.pageUrl = info.href;
      if (isMobileSiteUrl(info.href)) {
        this.onMobileRedirect(info.href);
        return;
      }
      // Ignore stray pages (about:blank, provider pages) — only www.fanfiction.net can run requests.
      if (!/^https:\/\/www\.fanfiction\.net\//i.test(info.href)) return;
    }
    this.pageReady = true;
    this.reloading = false;
    if (info.cookies != null) this.updateCookies(info.cookies);
    if (!info.challenge) {
      if (this.status === 'needs-user') this.transport?.setVisible(false);
      clearTimeout(this.passiveTimer);
      this.setStatus('ready');
      this.flush();
      return;
    }
    // On the challenge page itself, in-page fetches frequently already succeed once the
    // challenge script has run for a moment. Try after a short delay; escalate on failure.
    if (this.status !== 'needs-user') this.setStatus('verifying');
    setTimeout(() => {
      this.flush();
      if (!this.probing) {
        this.probing = true;
        this.request('/', { quiet: true, timeout: 30000 })
          .catch(() => {})
          .finally(() => (this.probing = false));
      }
    }, 2500);
    this.armPassiveTimer();
  }

  onPageError(message: string, status: BridgeStatus = 'offline') {
    this.pageReady = false;
    this.reloading = false;
    this.lastError = message;
    this.setStatus(status);
    // Fail queued requests so screens can show an error + retry.
    for (const id of [...this.queue]) this.fail(id, new BridgeError(message, 'network'));
  }

  /**
   * The bridge page was sent to m.fanfiction.net. Requests from there to www are cross-origin and
   * fail, so reload the desktop site once (skipping cached redirects) and report it if it repeats.
   */
  onMobileRedirect(url: string) {
    this.pageUrl = url;
    const now = Date.now();
    this.mobileRedirects = this.mobileRedirects.filter((t) => now - t < 60_000);
    this.mobileRedirects.push(now);
    if (this.mobileRedirects.length <= 1) {
      this.pageReady = false;
      this.reloading = true;
      this.lastReload = now;
      this.reloadPage(true);
      return;
    }
    this.onPageError(MOBILE_SITE_ERROR, 'error');
  }

  updateCookies(c: string) {
    if (c !== this.cookies) {
      this.cookies = c;
      this.emit();
    }
  }

  onResponse(id: string, r: RawResponse) {
    const p = this.pending.get(id);
    if (r.cookies != null) this.updateCookies(r.cookies);
    if (!p) return;
    // A request re-queued by a reload can still answer from the old page; count it only once.
    if (p.sent) this.inFlight = Math.max(0, this.inFlight - 1);
    p.sent = false;
    if (r.error) {
      this.lastError = r.error;
      if (p.attempts < 2) {
        this.requeue(p);
      } else {
        this.fail(id, new BridgeError(describeFetchError(r.error), 'network'));
      }
      this.flush();
      return;
    }
    if (!p.opts.base64 && isChallengeResponse(r)) {
      if (p.attempts >= 4) {
        this.fail(id, new BridgeError('FanFiction.net is asking for a security check.', 'challenge', r.status));
      } else {
        this.requeue(p);
        // Cloudflare can challenge a single page (e.g. /login.php) while the home page is clear,
        // so solve it on the page that was challenged when that's a normal page load.
        this.startChallenge(p.opts.quiet, p.opts.method !== 'POST' && !p.opts.base64 ? p.url : undefined);
      }
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (this.status === 'verifying' || this.status === 'offline') this.setStatus('ready');
    p.resolve(r);
    this.flush();
  }

  // --- challenge handling --------------------------------------------------------

  private startChallenge(quiet?: boolean, url?: string) {
    if (this.status === 'needs-user') return; // waiting for the user; onPageReady will flush
    this.setStatus('verifying');
    if (!this.reloading && Date.now() - this.lastReload > 4000) {
      // Reload the bridge page so Cloudflare can re-run its (usually invisible) check.
      this.reloading = true;
      this.lastReload = Date.now();
      this.pageReady = false;
      this.reloadPage(false, url);
    } else if (!this.reloading) {
      // Reloaded very recently: retry shortly instead of reloading again.
      setTimeout(() => this.flush(), 3000);
    }
    if (!quiet) this.armPassiveTimer();
  }

  private armPassiveTimer() {
    clearTimeout(this.passiveTimer);
    this.passiveTimer = setTimeout(() => {
      if (this.status === 'verifying' && this.pending.size > 0) {
        const anyLoud = [...this.pending.values()].some((p) => !p.opts.quiet);
        if (anyLoud) this.showVerification();
      }
    }, PASSIVE_WAIT_MS);
  }

  /** Bring the bridge page up so the user can tick "Verify you are human". */
  showVerification() {
    this.setStatus('needs-user');
    this.transport?.setVisible(true);
  }

  /** User closed the verification sheet without finishing. */
  cancelVerification() {
    this.transport?.setVisible(false);
    clearTimeout(this.passiveTimer);
    this.setStatus(this.pageReady ? 'ready' : 'error');
    for (const id of [...this.pending.keys()]) {
      this.fail(id, new BridgeError('Security check was cancelled.', 'challenge'));
    }
  }

  reload() {
    this.pageReady = false;
    this.reloading = true;
    this.lastReload = Date.now();
    this.mobileRedirects = [];
    this.lastError = undefined;
    this.setStatus('starting');
    this.reloadPage(true);
  }

  /**
   * Navigates the bridge page. Requests in flight die with the old page: page loads are queued
   * again; posts fail instead, since they may already have gone through (a review twice).
   */
  private reloadPage(bust: boolean, url?: string) {
    for (const p of [...this.pending.values()]) {
      if (!p.sent) continue;
      if (p.opts.method === 'POST') {
        this.fail(p.id, new BridgeError('The connection to FanFiction.net was reset while sending. Check whether it went through before trying again.', 'network'));
        continue;
      }
      p.sent = false;
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.requeue(p);
    }
    this.transport?.reload(bust, url);
  }

  /** Plain-text connection report for Settings → Connection (no cookie values). */
  diagnostics(): string {
    const names = this.cookies
      .split(';')
      .map((c) => c.split('=')[0]?.trim())
      .filter(Boolean);
    return [
      `Status: ${this.status}${this.pageReady ? '' : ' (page not ready)'}`,
      `Page: ${this.pageUrl ?? 'not loaded yet'}`,
      `User agent: ${this.userAgent ?? 'unknown'}`,
      `Last error: ${this.lastError ?? 'none'}`,
      `Cookies: ${names.length ? names.join(', ') : 'none'}`,
      `Queued requests: ${this.pending.size}`,
    ].join('\n');
  }

  // --- requests ------------------------------------------------------------------

  request(pathOrUrl: string, opts: RequestOptions = {}): Promise<RawResponse> {
    const id = `r${++this.seq}`;
    const url = absolute(pathOrUrl);
    return new Promise<RawResponse>((resolve, reject) => {
      const p: Pending = { id, url, opts, resolve, reject, attempts: 0, sent: false };
      p.timer = setTimeout(
        () => this.fail(id, new BridgeError('FanFiction.net took too long to respond.', 'timeout')),
        opts.timeout ?? 45000,
      );
      opts.signal?.addEventListener('abort', () => this.fail(id, new BridgeError('Cancelled', 'cancelled')));
      this.pending.set(id, p);
      this.queue.push(id);
      this.flush();
    });
  }

  private requeue(p: Pending) {
    if (!this.queue.includes(p.id)) this.queue.unshift(p.id);
  }

  private fail(id: string, e: Error) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    if (p.sent) this.inFlight = Math.max(0, this.inFlight - 1);
    this.pending.delete(id);
    this.queue = this.queue.filter((q) => q !== id);
    p.reject(e);
  }

  private flush() {
    if (!this.transport || !this.pageReady) return;
    if (this.status === 'needs-user') return;
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const id = this.queue.shift()!;
      const p = this.pending.get(id);
      if (!p) continue;
      p.attempts++;
      p.sent = true;
      this.inFlight++;
      this.transport.send(id, p.url, p.opts);
    }
  }

  // --- convenience -----------------------------------------------------------------

  async text(path: string, opts: RequestOptions = {}): Promise<string> {
    const r = await this.request(path, opts);
    if (r.status >= 400 && r.status !== 404) {
      throw new BridgeError(`FanFiction.net returned HTTP ${r.status}.`, 'http', r.status);
    }
    return r.body;
  }

  async json<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const body = await this.text(path, opts);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new BridgeError('Unexpected response from FanFiction.net.', 'http');
    }
  }

  async postForm(path: string, body: string, opts: RequestOptions = {}): Promise<RawResponse> {
    return this.request(path, {
      ...opts,
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        ...(opts.headers ?? {}),
      },
    });
  }

  async dataUri(path: string): Promise<string | null> {
    try {
      const r = await this.request(path, { base64: true, quiet: true, timeout: 30000 });
      if (r.status >= 400 || !r.body) return null;
      const type = (r.contentType || 'image/jpeg').split(';')[0];
      if (!/^image\//.test(type)) return null;
      return `data:${type};base64,${r.body}`;
    } catch {
      return null;
    }
  }

  /** Waits until the bridge page is up (or times out). */
  waitReady(timeout = 20000): Promise<boolean> {
    if (this.pageReady && this.status === 'ready') return Promise.resolve(true);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        unsub();
        resolve(false);
      }, timeout);
      const unsub = this.subscribe(() => {
        if (this.pageReady && this.status === 'ready') {
          clearTimeout(t);
          unsub();
          resolve(true);
        }
      });
    });
  }
}

export const bridge = new Bridge();
