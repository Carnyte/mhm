// Development helper for the *web* build of the app:
//  - /status, /reload, /fetch: talk to the live fanfiction.net by running the app's BRIDGE_SCRIPT
//    inside a real Chromium page (the same thing the iOS WebView does);
//  - /http: plain HTTP for the sites the app reaches with native fetch (src/net/http.web.ts), for
//    those that send no CORS headers (AO3). Only those sites' hosts are forwarded.
// Usage: npm run dev-proxy   (then `npx expo start --web`). On headless Linux: xvfb-run -a npm run dev-proxy

import { createServer } from 'http';
import { openBridgePage } from './browser';

const PORT = Number(process.env.PORT ?? 8787);

/** Hosts /http forwards to (it isn't an open proxy). */
const HTTP_HOSTS = /^(?:[a-z0-9-]+\.)*(?:archiveofourown\.org|wattpad\.com|fichub\.net)$/i;
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

async function readBody(req: AsyncIterable<Buffer | string>): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

async function main() {
  console.log('Opening fanfiction.net in Chromium…');
  // /http doesn't need the browser, so the server starts right away; FFN routes wait for it.
  const bridgePage = openBridgePage({ waitMs: Number(process.env.WAIT ?? 12000) });
  bridgePage.then(
    async (b) => console.log('Bridge page status:', await b.status()),
    (e) => console.error('FanFiction.net bridge unavailable:', (e as Error).message),
  );

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.end();
    const json = (data: unknown) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };
    try {
      if (req.url === '/http' && req.method === 'POST') {
        const { url, method = 'GET', headers = {}, body } = JSON.parse(await readBody(req));
        const host = new URL(url).hostname;
        if (!HTTP_HOSTS.test(host)) {
          res.statusCode = 403;
          return json({ status: 0, url, headers: {}, text: '', error: `The dev proxy doesn't forward to ${host}.` });
        }
        const started = Date.now();
        const r = await fetch(url, { method, headers: { 'User-Agent': DESKTOP_UA, ...headers }, body: method === 'POST' ? body : undefined, redirect: 'follow' });
        const text = method === 'HEAD' ? '' : await r.text();
        const out: Record<string, string> = {};
        r.headers.forEach((v, k) => (out[k] = v));
        console.log(`${r.status} ${method} ${url} ${Date.now() - started}ms`);
        return json({ status: r.status, url: r.url || url, headers: out, text });
      }
      const b = await bridgePage;
      if (req.url === '/status') return json(await b.status());
      if (req.url === '/reload' && req.method === 'POST') {
        await b.reload();
        return json(await b.status());
      }
      if (req.url === '/fetch' && req.method === 'POST') {
        const { url, opts } = JSON.parse(await readBody(req));
        const started = Date.now();
        const r = await b.request(url, opts ?? {});
        console.log(`${r.status} ${opts?.method ?? 'GET'} ${url.replace('https://www.fanfiction.net', '')} ${Date.now() - started}ms`);
        return json(r);
      }
      res.statusCode = 404;
      res.end('not found');
    } catch (e) {
      res.statusCode = 500;
      json({ status: 0, url: '', body: '', text: '', headers: {}, error: String((e as Error).message) });
    }
  });
  server.listen(PORT, () => console.log(`Dev proxy listening on http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
