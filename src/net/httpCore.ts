// Polite native HTTP for the sites that don't need FanFiction.net's WebView bridge (AO3, Wattpad,
// FicHub). Every request to a site goes through one queue per host, so the spacing each site asks
// for is enforced in one place:
//
//  - one request in flight per host, with a minimum gap between requests (wider for background
//    work such as update checks than for something the user just tapped);
//  - user requests go ahead of queued background ones;
//  - 429 (and 503 with Retry-After) puts the host on a cooldown: the request and everything queued
//    behind it fail with RateLimitedError until then, and repeated limits back off exponentially;
//  - a GET that fails at the network level is retried once; a POST is never retried;
//  - every request has a timeout and can be aborted.
//
// Platform-neutral: src/net/http.ts (native fetch) and src/net/http.web.ts (the web build, through
// the dev proxy) supply the transport.

import { SOURCE_NAMES } from '../sources/keys';

export type Priority = 'user' | 'background';

export interface HttpOptions {
  method?: 'GET' | 'HEAD' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  /** Send the site's cookies (the login made in a visible WebView). Default 'include'. */
  credentials?: 'omit' | 'include';
  priority?: Priority;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** The final URL, after redirects. */
  url: string;
  /** Lower-case header names. */
  headers: Record<string, string>;
  text: string;
}

export interface TransportRequest {
  url: string;
  method: 'GET' | 'HEAD' | 'POST';
  headers: Record<string, string>;
  body?: string;
  credentials: 'omit' | 'include';
  signal: AbortSignal;
}

/** Performs one request and reads the whole body. Rejects on network errors (and when aborted). */
export type Transport = (req: TransportRequest) => Promise<HttpResponse>;

export interface HostPolicy {
  /** The site's name in messages ("AO3 asked FicShelf to slow down"). */
  site?: string;
  /** Not queued at all (image CDNs: images load through the image component). */
  direct?: boolean;
  /** Minimum time between one request finishing and the next starting, per priority. */
  gapUserMs: number;
  gapBackgroundMs: number;
  timeoutMs: number;
  /** First cooldown after a 429 without Retry-After; doubles with each limit in a row. */
  cooldownMs: number;
  /** Replaces the default user agent (FicHub asks for one with contact details). */
  userAgent?: string;
}

const SECOND = 1000;
const MAX_COOLDOWN_MS = 30 * 60 * SECOND;

export const DEFAULT_POLICY: HostPolicy = { gapUserMs: 1000, gapBackgroundMs: 3000, timeoutMs: 30 * SECOND, cooldownMs: 30 * SECOND };

export const POLICIES: Record<string, HostPolicy> = {
  'archiveofourown.org': { site: SOURCE_NAMES.ao3, gapUserMs: 1500, gapBackgroundMs: 5000, timeoutMs: 45 * SECOND, cooldownMs: 60 * SECOND },
  'download.archiveofourown.org': { site: SOURCE_NAMES.ao3, gapUserMs: 1500, gapBackgroundMs: 1500, timeoutMs: 60 * SECOND, cooldownMs: 60 * SECOND },
  'www.wattpad.com': { site: SOURCE_NAMES.wp, gapUserMs: 1000, gapBackgroundMs: 3000, timeoutMs: 20 * SECOND, cooldownMs: 60 * SECOND },
  'api.wattpad.com': { site: SOURCE_NAMES.wp, gapUserMs: 1000, gapBackgroundMs: 3000, timeoutMs: 20 * SECOND, cooldownMs: 60 * SECOND },
  'img.wattpad.com': { site: SOURCE_NAMES.wp, direct: true, gapUserMs: 0, gapBackgroundMs: 0, timeoutMs: 20 * SECOND, cooldownMs: 0 },
  'fichub.net': {
    site: 'FicHub',
    gapUserMs: 1000,
    gapBackgroundMs: 3000,
    timeoutMs: 60 * SECOND,
    cooldownMs: 60 * SECOND,
    userAgent: 'FicShelf/1.0 (personal reader app; +https://github.com/Carnyte/mhm)',
  },
};

/** The site asked us to slow down; nothing is sent to it before `retryAt` (ms since epoch). */
export class RateLimitedError extends Error {
  constructor(
    public host: string,
    public retryAt: number,
    public site = host,
  ) {
    super(`${site} asked FicShelf to slow down. Try again after ${new Date(retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
    this.name = 'RateLimitedError';
  }
}

export class HttpTimeoutError extends Error {
  constructor(
    public url: string,
    public site: string,
  ) {
    super(`${site} took too long to answer. Try again.`);
    this.name = 'HttpTimeoutError';
  }
}

/** The request never got an answer (offline, DNS, TLS, connection reset). */
export class NetworkError extends Error {
  constructor(
    public url: string,
    public site: string,
    public reason: string,
  ) {
    super(`Couldn’t reach ${site}. Check your internet connection and try again. (${reason})`);
    this.name = 'NetworkError';
  }
}

export function isAbortError(e: unknown): boolean {
  return (e as Error)?.name === 'AbortError';
}

function abortError(): Error {
  const e = new Error('The request was cancelled.');
  e.name = 'AbortError';
  return e;
}

export function hostOf(url: string): string {
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i);
  return (m?.[1] ?? '').toLowerCase();
}

/** Retry-After: seconds, or an HTTP date. Milliseconds from `now`, or undefined. */
export function parseRetryAfter(value: string | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * SECOND;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - now) : undefined;
}

interface Job {
  url: string;
  host: string;
  opts: HttpOptions;
  priority: Priority;
  attempts: number;
  resolve: (r: HttpResponse) => void;
  reject: (e: Error) => void;
  /** Detaches the caller's abort listener while queued. */
  unlisten?: () => void;
}

interface HostState {
  policy: HostPolicy;
  queue: Job[];
  inFlight: boolean;
  /** When the last request to the host finished (0 = none yet). */
  lastEnd: number;
  cooldownUntil: number;
  /** Rate limits in a row, for the exponential cooldown. */
  strikes: number;
  timer?: ReturnType<typeof setTimeout>;
}

export interface HttpClientConfig {
  transport: Transport;
  /** Sent as User-Agent unless a policy or the request sets one (native: the desktop Safari UA). */
  userAgent?: string;
  policies?: Record<string, HostPolicy>;
  now?: () => number;
}

export class HttpClient {
  private hosts = new Map<string, HostState>();
  private transport: Transport;
  private userAgent?: string;
  private policies: Record<string, HostPolicy>;
  private now: () => number;

  constructor(cfg: HttpClientConfig) {
    this.transport = cfg.transport;
    this.userAgent = cfg.userAgent;
    this.policies = cfg.policies ?? POLICIES;
    this.now = cfg.now ?? (() => Date.now());
  }

  policyFor(host: string): HostPolicy {
    return this.policies[host] ?? DEFAULT_POLICY;
  }

  /** When the host may be asked again (0 when it isn't cooling down). */
  cooldownUntil(host: string): number {
    const st = this.hosts.get(host);
    return st && st.cooldownUntil > this.now() ? st.cooldownUntil : 0;
  }

  /** Fetches a URL as text. HTTP errors resolve (look at `status`); see the class notes for what rejects. */
  text(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
    const host = hostOf(url);
    const policy = this.policyFor(host);
    if (opts.signal?.aborted) return Promise.reject(abortError());
    if (policy.direct) return this.send(url, host, policy, opts);
    const st = this.state(host, policy);
    if (st.cooldownUntil > this.now()) return Promise.reject(new RateLimitedError(host, st.cooldownUntil, policy.site ?? host));
    return new Promise<HttpResponse>((resolve, reject) => {
      const job: Job = { url, host, opts, priority: opts.priority ?? 'user', attempts: 0, resolve, reject };
      if (opts.signal) {
        const onAbort = () => {
          const i = st.queue.indexOf(job);
          if (i >= 0) {
            st.queue.splice(i, 1);
            reject(abortError());
          }
        };
        opts.signal.addEventListener('abort', onAbort);
        job.unlisten = () => opts.signal?.removeEventListener('abort', onAbort);
      }
      this.enqueue(st, job);
    });
  }

  private state(host: string, policy: HostPolicy): HostState {
    let st = this.hosts.get(host);
    if (!st) {
      st = { policy, queue: [], inFlight: false, lastEnd: 0, cooldownUntil: 0, strikes: 0 };
      this.hosts.set(host, st);
    }
    return st;
  }

  /** User jobs go after the queued user jobs but before every background one. */
  private enqueue(st: HostState, job: Job, front = false) {
    if (front) st.queue.unshift(job);
    else if (job.priority === 'background') st.queue.push(job);
    else {
      const i = st.queue.findIndex((j) => j.priority === 'background');
      st.queue.splice(i < 0 ? st.queue.length : i, 0, job);
    }
    this.pump(st);
  }

  private pump(st: HostState) {
    clearTimeout(st.timer);
    st.timer = undefined;
    if (st.inFlight || !st.queue.length) return;
    const now = this.now();
    if (st.cooldownUntil > now) {
      // Everything queued behind a rate limit fails now rather than piling up.
      for (const job of st.queue.splice(0)) {
        job.unlisten?.();
        job.reject(new RateLimitedError(job.host, st.cooldownUntil, st.policy.site ?? job.host));
      }
      return;
    }
    const job = st.queue[0];
    const gap = job.priority === 'background' ? st.policy.gapBackgroundMs : st.policy.gapUserMs;
    const wait = st.lastEnd ? st.lastEnd + gap - now : 0;
    if (wait > 0) {
      st.timer = setTimeout(() => this.pump(st), wait);
      return;
    }
    st.queue.shift();
    job.unlisten?.();
    if (job.opts.signal?.aborted) {
      // Cancelled while waiting for a retry.
      job.reject(abortError());
      this.pump(st);
      return;
    }
    st.inFlight = true;
    this.run(st, job);
  }

  private async run(st: HostState, job: Job) {
    const method = job.opts.method ?? 'GET';
    try {
      job.attempts++;
      const r = await this.send(job.url, job.host, st.policy, job.opts);
      if (r.status === 429 || (r.status === 503 && r.headers['retry-after'])) {
        const now = this.now();
        st.strikes++;
        const backoff = Math.min(MAX_COOLDOWN_MS, st.policy.cooldownMs * 2 ** (st.strikes - 1));
        st.cooldownUntil = now + Math.max(parseRetryAfter(r.headers['retry-after'], now) ?? 0, backoff);
        job.reject(new RateLimitedError(job.host, st.cooldownUntil, st.policy.site ?? job.host));
      } else {
        st.strikes = 0;
        job.resolve(r);
      }
    } catch (e) {
      // A GET that never got an answer is retried once (after the host's gap); POSTs never are.
      if (e instanceof NetworkError && method !== 'POST' && job.attempts < 2 && !job.opts.signal?.aborted) this.enqueue(st, job, true);
      else job.reject(e as Error);
    } finally {
      st.inFlight = false;
      st.lastEnd = this.now();
      this.pump(st);
    }
  }

  /** One request with the timeout and the caller's abort signal. */
  private async send(url: string, host: string, policy: HostPolicy, opts: HttpOptions): Promise<HttpResponse> {
    if (opts.signal?.aborted) throw abortError();
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, opts.timeoutMs ?? policy.timeoutMs);
    const headers: Record<string, string> = { ...opts.headers };
    const ua = policy.userAgent ?? this.userAgent;
    if (ua && !Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')) headers['User-Agent'] = ua;
    try {
      return await this.transport({
        url,
        method: opts.method ?? 'GET',
        headers,
        body: opts.body,
        credentials: opts.credentials ?? 'include',
        signal: ctrl.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted) throw abortError();
      if (timedOut) throw new HttpTimeoutError(url, policy.site ?? host);
      throw new NetworkError(url, policy.site ?? host, String((e as Error)?.message ?? e));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }
}

/** A Transport over a WHATWG fetch (React Native's, or the browser's). */
export function fetchTransport(fetchImpl: typeof fetch): Transport {
  return async (req) => {
    const res = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body, credentials: req.credentials, signal: req.signal });
    const text = req.method === 'HEAD' ? '' : await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    return { status: res.status, url: res.url || req.url, headers, text };
  };
}
