// Polite native HTTP (iOS / Android), see httpCore.ts. React Native's fetch shares the cookie
// store the WebViews use (sharedCookiesEnabled), so a login made on a site's own page in a visible
// WebView applies here too. It identifies as the same desktop Safari the WebViews do, so Cloudflare
// sees one consistent browser.

import { fetchTransport, HttpClient, type HttpOptions, type HttpResponse } from './httpCore';
import { DESKTOP_USER_AGENT } from './webviewConfig';

export * from './httpCore';

export const http = new HttpClient({ transport: fetchTransport((...args) => fetch(...args)), userAgent: DESKTOP_USER_AGENT });

/** GET (or POST) a URL as text, through the per-host queue. */
export function httpText(url: string, opts?: HttpOptions): Promise<HttpResponse> {
  return http.text(url, opts);
}
