// The polite HTTP client (src/net/httpCore.ts) with a fake transport and fake timers: one request
// in flight per host, minimum gaps (wider in the background), user requests ahead of background
// ones, Retry-After cooldowns, a single retry for GETs only, abort and timeouts.

import {
  fetchTransport,
  hostOf,
  HttpClient,
  HttpTimeoutError,
  isAbortError,
  NetworkError,
  parseRetryAfter,
  RateLimitedError,
  ServerBusyError,
  type HttpResponse,
  type Transport,
  type TransportRequest,
} from '../src/net/httpCore';

interface Call {
  req: TransportRequest;
  at: number;
  resolve: (r?: Partial<HttpResponse>) => void;
  reject: (e: unknown) => void;
}

function fakeTransport() {
  const calls: Call[] = [];
  const transport: Transport = (req) =>
    new Promise<HttpResponse>((res, rej) => {
      calls.push({ req, at: Date.now(), resolve: (r) => res({ status: 200, url: req.url, headers: {}, text: '', ...r }), reject: rej });
      req.signal.addEventListener('abort', () => {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        rej(e);
      });
    });
  return { calls, transport };
}

/** Records how a promise settles, without leaving rejections unhandled. */
function track<T>(p: Promise<T>) {
  const t: { done: boolean; value?: T; error?: Error } = { done: false };
  p.then(
    (value) => Object.assign(t, { done: true, value }),
    (error) => Object.assign(t, { done: true, error }),
  );
  return t;
}

const tick = (ms = 0) => jest.advanceTimersByTimeAsync(ms);
const AO3 = 'https://archiveofourown.org/works/';
const WP = 'https://www.wattpad.com/api/v3/stories/';

let calls: Call[];
let client: HttpClient;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  const f = fakeTransport();
  calls = f.calls;
  client = new HttpClient({ transport: f.transport, userAgent: 'Desktop Safari' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('per-host queue', () => {
  it('sends one request at a time per host, spaced by the user gap', async () => {
    const a = track(client.text(AO3 + 1));
    const b = track(client.text(AO3 + 2));
    await tick();
    expect(calls.map((c) => c.req.url)).toEqual([AO3 + 1]);
    expect(calls[0].req).toMatchObject({ method: 'GET', credentials: 'include', headers: { 'User-Agent': 'Desktop Safari' } });
    calls[0].resolve({ text: 'one' });
    await tick();
    expect(a.value).toMatchObject({ status: 200, text: 'one' });
    await tick(1499);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls.map((c) => c.req.url)).toEqual([AO3 + 1, AO3 + 2]);
    calls[1].resolve();
    await tick();
    expect(b.done).toBe(true);
  });

  it('doesn’t hold one site up for another', async () => {
    client.text(AO3 + 1);
    client.text(WP + 1);
    await tick();
    expect(calls.map((c) => c.req.url)).toEqual([AO3 + 1, WP + 1]);
  });

  it('spaces background requests more widely', async () => {
    client.text(AO3 + 1);
    await tick();
    calls[0].resolve();
    client.text(AO3 + 2, { priority: 'background' });
    await tick(4999);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
  });

  it('lets user requests go ahead of queued background ones', async () => {
    client.text(AO3 + 'first');
    client.text(AO3 + 'bg1', { priority: 'background' });
    client.text(AO3 + 'bg2', { priority: 'background' });
    client.text(AO3 + 'user1');
    client.text(AO3 + 'user2');
    // Answer each request as soon as it goes out.
    for (let i = 0; i < 5; i++) {
      while (calls.length <= i) await tick(100);
      calls[i].resolve();
      await tick();
    }
    expect(calls.map((c) => c.req.url.slice(AO3.length))).toEqual(['first', 'user1', 'user2', 'bg1', 'bg2']);
    // User requests wait the user gap; background ones the background gap.
    expect(calls.slice(1).map((c, i) => c.at - calls[i].at)).toEqual([1500, 1500, 5000, 5000]);
  });

  it('doesn’t queue image hosts', async () => {
    client.text('https://img.wattpad.com/cover/1-256.jpg');
    client.text('https://img.wattpad.com/cover/2-256.jpg');
    await tick();
    expect(calls).toHaveLength(2);
  });

  it('uses a policy’s own user agent, and never overrides the request’s', async () => {
    client.text('https://fichub.net/api/v0/meta?q=x');
    client.text(WP + 1, { headers: { 'user-agent': 'Mine' } });
    await tick();
    expect(calls[0].req.headers['User-Agent']).toMatch(/^FicShelf\/.*github\.com/);
    expect(calls[1].req.headers).toEqual({ 'user-agent': 'Mine' });
  });
});

describe('rate limits', () => {
  it('honours Retry-After: the host cools down and queued requests fail fast', async () => {
    const a = track(client.text(AO3 + 1));
    const b = track(client.text(AO3 + 2));
    await tick();
    calls[0].resolve({ status: 429, headers: { 'retry-after': '120' } });
    await tick();
    const retryAt = Date.now() + 120_000;
    expect(a.error).toBeInstanceOf(RateLimitedError);
    expect(a.error).toMatchObject({ host: 'archiveofourown.org', retryAt, site: 'AO3' });
    expect(a.error?.message).toMatch(/^AO3 asked FicShelf to slow down/);
    expect(b.error).toBeInstanceOf(RateLimitedError);
    const c = track(client.text(AO3 + 3));
    await tick();
    expect(c.error).toBeInstanceOf(RateLimitedError);
    expect(calls).toHaveLength(1);
    expect(client.cooldownUntil('archiveofourown.org')).toBe(retryAt);

    await tick(120_000);
    const d = track(client.text(AO3 + 4));
    await tick();
    expect(calls).toHaveLength(2);
    calls[1].resolve({ text: 'ok' });
    await tick();
    expect(d.value?.text).toBe('ok');
    expect(client.cooldownUntil('archiveofourown.org')).toBe(0);
  });

  it('backs off exponentially from the site’s minimum when there is no Retry-After', async () => {
    const a = track(client.text(AO3 + 1));
    await tick();
    calls[0].resolve({ status: 429 });
    await tick();
    expect((a.error as RateLimitedError).retryAt - Date.now()).toBe(60_000);

    await tick(60_000);
    const b = track(client.text(AO3 + 2));
    await tick();
    calls[1].resolve({ status: 429 });
    await tick();
    expect((b.error as RateLimitedError).retryAt - Date.now()).toBe(120_000);

    // A good answer resets the back-off.
    await tick(120_000);
    client.text(AO3 + 3);
    await tick();
    calls[2].resolve();
    await tick(2000);
    const c = track(client.text(AO3 + 4));
    await tick();
    calls[3].resolve({ status: 429 });
    await tick();
    expect((c.error as RateLimitedError).retryAt - Date.now()).toBe(60_000);
  });

  it('treats a 503 with Retry-After as a limit, and a plain 503 as an answer', async () => {
    const a = track(client.text(WP + 1));
    await tick();
    calls[0].resolve({ status: 503 });
    await tick();
    expect(a.value?.status).toBe(503);
    // A plain 5xx is answered, and the host rests a little before the next request.
    await tick(10_000);
    const b = track(client.text(WP + 2));
    await tick();
    calls[1].resolve({ status: 503, headers: { 'retry-after': '90' } });
    await tick();
    expect(b.error).toBeInstanceOf(RateLimitedError);
    expect((b.error as RateLimitedError).retryAt - Date.now()).toBe(90_000);
  });
});

describe('server errors (policy.1)', () => {
  it('rests the host after a 5xx: the next requests fail fast for a while, longer after each failure', async () => {
    const a = track(client.text(AO3 + 1));
    const queued = track(client.text(AO3 + 2, { priority: 'background' }));
    await tick();
    calls[0].resolve({ status: 502 });
    await tick();
    // The answer itself is handed back (the caller reports "AO3 is busy").
    expect(a.value?.status).toBe(502);
    expect(queued.error).toBeInstanceOf(ServerBusyError);
    expect(queued.error).toBeInstanceOf(RateLimitedError);
    expect(queued.error?.message).toMatch(/^AO3 is having trouble right now \(error 502\)/);
    const b = track(client.text(AO3 + 3));
    await tick();
    expect(b.error).toBeInstanceOf(ServerBusyError);
    expect(calls).toHaveLength(1);
    expect(client.cooldownUntil('archiveofourown.org') - Date.now()).toBe(10_000);

    await tick(10_000);
    client.text(AO3 + 4);
    await tick();
    expect(calls).toHaveLength(2);
    calls[1].resolve({ status: 503 });
    await tick();
    expect(client.cooldownUntil('archiveofourown.org') - Date.now()).toBe(20_000);

    // A good answer ends the run of failures.
    await tick(20_000);
    client.text(AO3 + 5);
    await tick();
    calls[2].resolve({ text: 'ok' });
    await tick(2000);
    client.text(AO3 + 6);
    await tick();
    calls[3].resolve({ status: 500 });
    await tick();
    expect(client.cooldownUntil('archiveofourown.org') - Date.now()).toBe(10_000);
    // Other sites aren't held up.
    track(client.text(WP + 1));
    await tick();
    expect(calls).toHaveLength(5);
  });
});

describe('retries, aborts and timeouts', () => {
  it('retries a GET once after a network error, after the gap', async () => {
    const a = track(client.text(AO3 + 1));
    await tick();
    calls[0].reject(new TypeError('Network request failed'));
    await tick(1499);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    calls[1].resolve({ text: 'second time' });
    await tick();
    expect(a.value?.text).toBe('second time');
  });

  it('gives up after the retry', async () => {
    const a = track(client.text(AO3 + 1));
    await tick();
    calls[0].reject(new TypeError('Network request failed'));
    await tick(1500);
    calls[1].reject(new TypeError('Network request failed'));
    await tick(5000);
    expect(calls).toHaveLength(2);
    expect(a.error).toBeInstanceOf(NetworkError);
    expect(a.error?.message).toMatch(/Couldn’t reach AO3/);
  });

  it('never retries a POST', async () => {
    const a = track(client.text(AO3 + '1/kudos', { method: 'POST', body: 'x=1' }));
    await tick();
    expect(calls[0].req).toMatchObject({ method: 'POST', body: 'x=1' });
    calls[0].reject(new TypeError('Network request failed'));
    await tick(10_000);
    expect(calls).toHaveLength(1);
    expect(a.error).toBeInstanceOf(NetworkError);
  });

  it('drops a queued request when it is aborted', async () => {
    const ctrl = new AbortController();
    client.text(AO3 + 1);
    const b = track(client.text(AO3 + 2, { signal: ctrl.signal }));
    await tick();
    ctrl.abort();
    await tick();
    expect(isAbortError(b.error)).toBe(true);
    calls[0].resolve();
    await tick(10_000);
    expect(calls).toHaveLength(1);
  });

  it('cancels a request in flight when it is aborted, without retrying', async () => {
    const ctrl = new AbortController();
    const a = track(client.text(AO3 + 1, { signal: ctrl.signal }));
    await tick();
    ctrl.abort();
    await tick(10_000);
    expect(isAbortError(a.error)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].req.signal.aborted).toBe(true);
  });

  it('rejects at once when already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const a = track(client.text(AO3 + 1, { signal: ctrl.signal }));
    await tick();
    expect(isAbortError(a.error)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('times out after the site’s limit (or the request’s own), without retrying', async () => {
    const a = track(client.text(AO3 + 1));
    await tick(44_999);
    expect(a.done).toBe(false);
    await tick(1);
    expect(a.error).toBeInstanceOf(HttpTimeoutError);
    expect(a.error?.message).toBe('AO3 took too long to answer. Try again.');
    await tick(10_000);
    expect(calls).toHaveLength(1);

    const b = track(client.text(WP + 1, { timeoutMs: 5000 }));
    await tick(5000);
    expect(b.error).toBeInstanceOf(HttpTimeoutError);
  });
});

describe('the app’s client', () => {
  it('fetches through the queue as desktop Safari, the same identity as the WebViews', async () => {
    jest.useRealTimers();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { httpText } = require('../src/net/http') as typeof import('../src/net/http');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DESKTOP_USER_AGENT } = require('../src/net/webviewConfig') as typeof import('../src/net/webviewConfig');
    const original = global.fetch;
    const fake = jest.fn(async (url: string) => ({ status: 200, url, headers: { forEach: () => {} }, text: async () => 'page' }));
    global.fetch = fake as unknown as typeof fetch;
    try {
      await expect(httpText(AO3 + 1)).resolves.toMatchObject({ status: 200, text: 'page' });
      expect(DESKTOP_USER_AGENT).toMatch(/Safari/);
      expect(fake).toHaveBeenCalledWith(AO3 + 1, expect.objectContaining({ headers: { 'User-Agent': DESKTOP_USER_AGENT }, credentials: 'include' }));
    } finally {
      global.fetch = original;
    }
  });
});

describe('helpers', () => {
  it('reads hosts and Retry-After values', () => {
    expect(hostOf('https://Archiveofourown.org:443/works/1')).toBe('archiveofourown.org');
    expect(hostOf('not a url')).toBe('');
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30_000);
    expect(parseRetryAfter('Thu, 01 Oct 2026 12:02:00 GMT', now)).toBe(120_000);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(undefined, now)).toBeUndefined();
  });

  it('adapts fetch responses', async () => {
    const fake = jest.fn(async () => ({
      status: 201,
      url: 'https://www.wattpad.com/final',
      headers: { forEach: (fn: (v: string, k: string) => void) => fn('application/json', 'Content-Type') },
      text: async () => '{"ok":true}',
    }));
    const t = fetchTransport(fake as unknown as typeof fetch);
    const signal = new AbortController().signal;
    const r = await t({ url: WP + 1, method: 'GET', headers: { A: 'b' }, credentials: 'omit', signal });
    expect(r).toEqual({ status: 201, url: 'https://www.wattpad.com/final', headers: { 'content-type': 'application/json' }, text: '{"ok":true}' });
    expect(fake).toHaveBeenCalledWith(WP + 1, { method: 'GET', headers: { A: 'b' }, body: undefined, credentials: 'omit', signal });
  });
});
