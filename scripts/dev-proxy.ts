// Development helper: lets the *web* build of the app talk to the live fanfiction.net by running
// the app's BRIDGE_SCRIPT inside a real Chromium page (the same thing the iOS WebView does).
// Usage: npm run dev-proxy   (then `npx expo start --web`). On headless Linux: xvfb-run -a npm run dev-proxy

import { createServer } from 'http';
import { openBridgePage } from './browser';

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  console.log('Opening fanfiction.net in Chromium…');
  const b = await openBridgePage({ waitMs: Number(process.env.WAIT ?? 12000) });
  console.log('Bridge page status:', await b.status());

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
      if (req.url === '/status') return json(await b.status());
      if (req.url === '/reload' && req.method === 'POST') {
        await b.reload();
        return json(await b.status());
      }
      if (req.url === '/fetch' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { url, opts } = JSON.parse(body);
        const started = Date.now();
        const r = await b.request(url, opts ?? {});
        console.log(`${r.status} ${opts?.method ?? 'GET'} ${url.replace('https://www.fanfiction.net', '')} ${Date.now() - started}ms`);
        return json(r);
      }
      res.statusCode = 404;
      res.end('not found');
    } catch (e) {
      res.statusCode = 500;
      json({ status: 0, url: '', body: '', error: String((e as Error).message) });
    }
  });
  server.listen(PORT, () => console.log(`Dev proxy listening on http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
