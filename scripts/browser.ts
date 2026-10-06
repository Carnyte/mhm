// Shared Playwright helper: opens www.fanfiction.net in a real Chromium, installs the app's
// BRIDGE_SCRIPT and exposes the same request API the WebView bridge uses.
// Used by live-check.ts and dev-proxy.ts (development tools only, not part of the app).

import { existsSync } from 'fs';
import type { Browser, Page } from 'playwright-core';
import { BRIDGE_SCRIPT } from '../src/net/bridgeScript';
import type { RawResponse } from '../src/net/challenge';

export interface BridgePage {
  page: Page;
  browser: Browser;
  status(): Promise<{ challenge: boolean; cookies: string; title: string }>;
  request(url: string, opts?: { method?: string; body?: string; headers?: Record<string, string>; base64?: boolean }): Promise<RawResponse>;
  reload(): Promise<void>;
  close(): Promise<void>;
}

export async function openBridgePage(opts: { headless?: boolean; waitMs?: number } = {}): Promise<BridgePage> {
  const { chromium } = await import('playwright-core');
  const executablePath =
    process.env.CHROMIUM_PATH ||
    ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({
    headless: opts.headless ?? false,
    executablePath,
    proxy,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();

  let seq = 0;
  const waiters = new Map<string, (r: RawResponse) => void>();
  await page.exposeFunction('__ffnPost', (s: string) => {
    const msg = JSON.parse(s);
    if (msg.type === 'response') waiters.get(msg.id)?.(msg);
  });

  const load = async () => {
    await page.goto('https://www.fanfiction.net/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(opts.waitMs ?? 12000);
  };
  await load();

  const install = () => page.evaluate(BRIDGE_SCRIPT).catch(() => null);

  return {
    page,
    browser,
    async status() {
      await install();
      return page.evaluate(() => ({
        challenge: /just a moment|security verification/i.test(document.title),
        cookies: document.cookie,
        title: document.title,
      }));
    },
    async request(url, o = {}) {
      await install();
      const id = `n${++seq}`;
      const done = new Promise<RawResponse>((resolve) => waiters.set(id, resolve));
      await page.evaluate(
        ([i, u, op]) => (window as any).__ffnBridge.fetch(i, u, op),
        [id, url.startsWith('http') ? url : 'https://www.fanfiction.net' + url, o] as const,
      );
      const r = await Promise.race([
        done,
        new Promise<RawResponse>((resolve) => setTimeout(() => resolve({ status: 0, url, body: '', error: 'timeout' }), 60000)),
      ]);
      waiters.delete(id);
      return r;
    },
    async reload() {
      await load();
    },
    async close() {
      await browser.close();
    },
  };
}
