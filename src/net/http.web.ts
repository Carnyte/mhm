// Polite HTTP for the web build (development only), see httpCore.ts. Browsers can't set a User-Agent
// and AO3 sends no CORS headers, so AO3 (and FicHub) requests go through the dev proxy's /http route
// (scripts/dev-proxy.ts). Wattpad allows any origin and is fetched directly.

import { fetchTransport, HttpClient, hostOf, type HttpOptions, type HttpResponse, type Transport } from './httpCore';

export * from './httpCore';

const PROXY = process.env.EXPO_PUBLIC_FFN_PROXY || 'http://localhost:8787';

/** Hosts without CORS headers: proxied. */
const PROXIED = /(^|\.)archiveofourown\.org$|(^|\.)fichub\.net$/i;

// Wattpad answers with "Access-Control-Allow-Origin: *", which browsers refuse for credentialed requests.
const direct = fetchTransport((url, init) => fetch(url, { ...init, credentials: 'omit' }));

const proxied: Transport = async (req) => {
  const res = await fetch(`${PROXY}/http`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: req.url, method: req.method, headers: req.headers, body: req.body }),
    signal: req.signal,
  });
  const r = (await res.json()) as HttpResponse & { error?: string };
  if (r.error) throw new Error(r.error);
  return r;
};

export const http = new HttpClient({ transport: (req) => (PROXIED.test(hostOf(req.url)) ? proxied(req) : direct(req)) });

export function httpText(url: string, opts?: HttpOptions): Promise<HttpResponse> {
  return http.text(url, opts);
}
