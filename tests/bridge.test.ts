// Bridge queue behaviour with a fake transport: challenge → reload → retry, timeouts, cookies.

import type { RawResponse } from '../src/net/challenge';
import type { RequestOptions, Transport } from '../src/net/bridge';

const CHALLENGE: RawResponse = { status: 403, url: '', body: '<title>Just a moment...</title>', cf: 'challenge' };
const OK = (body: string, cookies?: string): RawResponse => ({ status: 200, url: '', body, cookies });

function setup() {
  jest.resetModules();
  jest.useFakeTimers();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bridge } = require('../src/net/bridge') as typeof import('../src/net/bridge');
  const sent: { id: string; url: string; opts: RequestOptions }[] = [];
  const t: Transport & { reloads: number; visible: boolean } = {
    reloads: 0,
    visible: false,
    send: (id, url, opts) => sent.push({ id, url, opts }),
    reload() {
      this.reloads++;
    },
    setVisible(v) {
      this.visible = v;
    },
  };
  bridge.attach(t);
  return { bridge, sent, t };
}

afterEach(() => jest.useRealTimers());

describe('bridge', () => {
  it('queues until the page is ready, then sends absolute URLs', async () => {
    const { bridge, sent } = setup();
    const p = bridge.text('/s/1/1/');
    expect(sent).toHaveLength(0);
    bridge.onPageReady({ challenge: false, cookies: 'funn=Quiet%20Owl' });
    expect(sent[0].url).toBe('https://www.fanfiction.net/s/1/1/');
    bridge.onResponse(sent[0].id, OK('<html>story</html>'));
    await expect(p).resolves.toBe('<html>story</html>');
    expect(bridge.username).toBe('Quiet Owl');
    expect(bridge.status).toBe('ready');
  });

  it('reloads on a challenge and retries after the page is ready again', async () => {
    const { bridge, sent, t } = setup();
    bridge.onPageReady({ challenge: false });
    const p = bridge.text('/u/5/');
    bridge.onResponse(sent[0].id, CHALLENGE);
    expect(t.reloads).toBe(1);
    expect(bridge.status).toBe('verifying');
    expect(sent).toHaveLength(1); // waits for the reload
    bridge.onPageReady({ challenge: false });
    expect(sent).toHaveLength(2);
    bridge.onResponse(sent[1].id, OK('profile'));
    await expect(p).resolves.toBe('profile');
    expect(bridge.status).toBe('ready');
  });

  it('does not stall when challenged while already verifying (regression)', async () => {
    const { bridge, sent, t } = setup();
    bridge.onPageReady({ challenge: true }); // landed on the challenge page
    expect(bridge.status).toBe('verifying');
    const p = bridge.text('/r/1/');
    jest.advanceTimersByTime(2600); // delayed flush + probe
    const first = sent.find((s) => s.url.endsWith('/r/1/'))!;
    bridge.onResponse(first.id, CHALLENGE);
    expect(t.reloads).toBe(1); // reloads even though status was already "verifying"
    bridge.onPageReady({ challenge: false });
    const retry = sent.filter((s) => s.url.endsWith('/r/1/')).pop()!;
    expect(retry.id).toBe(first.id);
    bridge.onResponse(retry.id, OK('reviews'));
    await expect(p).resolves.toBe('reviews');
  });

  it('asks the user to verify when the passive check does not clear', () => {
    const { bridge, sent, t } = setup();
    bridge.onPageReady({ challenge: false });
    bridge.text('/s/2/1/').catch(() => {});
    bridge.onResponse(sent[0].id, CHALLENGE);
    jest.advanceTimersByTime(9500);
    expect(bridge.status).toBe('needs-user');
    expect(t.visible).toBe(true);
    bridge.onPageReady({ challenge: false }); // user ticked the box
    expect(t.visible).toBe(false);
    expect(bridge.status).toBe('ready');
  });

  it('gives up with a challenge error after repeated challenges', async () => {
    const { bridge, sent } = setup();
    bridge.onPageReady({ challenge: false });
    const p = bridge.text('/s/3/1/', { quiet: true });
    for (let i = 0; i < 4; i++) {
      const last = sent[sent.length - 1];
      bridge.onResponse(last.id, CHALLENGE);
      jest.advanceTimersByTime(5000);
      bridge.onPageReady({ challenge: false });
    }
    await expect(p).rejects.toMatchObject({ code: 'challenge' });
  });

  it('times out', async () => {
    const { bridge } = setup();
    bridge.onPageReady({ challenge: false });
    const p = bridge.text('/s/4/1/', { timeout: 1000 });
    jest.advanceTimersByTime(1001);
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
  });

  it('does not treat image responses as challenges', async () => {
    const { bridge, sent, t } = setup();
    bridge.onPageReady({ challenge: false });
    const p = bridge.dataUri('/image/1/75/');
    bridge.onResponse(sent[0].id, { status: 200, url: '', body: 'AAAA', contentType: 'image/jpeg' });
    await expect(p).resolves.toBe('data:image/jpeg;base64,AAAA');
    expect(t.reloads).toBe(0);
  });
});
