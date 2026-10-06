// Shared settings for every WebView that loads fanfiction.net.
//
// FanFiction.net sends phones to its mobile site, m.fanfiction.net. That site has no login page
// (it's a 404), and once the bridge page lands there every fetch to www.fanfiction.net is
// cross-origin, so WebKit rejects it with "Load failed". iPads avoid this by asking for the
// desktop site, and the app does the same: a desktop Safari user agent plus WebKit's desktop
// content mode (which also reports a Mac platform to page scripts, so the fingerprint stays
// consistent for Cloudflare).

import { Platform } from 'react-native';

export const FFN_HOST = 'www.fanfiction.net';

function safariVersion(): string {
  // Platform.Version is the iOS version string, e.g. "26.0" or "18.6.2". Safari's version
  // tracks it, so the user agent matches the WebKit build that's actually running.
  const v = String(Platform.Version ?? '');
  const m = v.match(/^(\d+)(?:\.(\d+))?/);
  return m ? `${m[1]}.${m[2] ?? '0'}` : '26.0';
}

function desktopUserAgent(): string | undefined {
  if (Platform.OS === 'ios') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVersion()} Safari/605.1.15`;
  }
  if (Platform.OS === 'android') {
    // Android WebView is Chromium; claim desktop Chrome on Linux rather than Safari.
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  }
  return undefined;
}

export const DESKTOP_USER_AGENT = desktopUserAgent();

/** Spread onto every <WebView> that shows or fetches fanfiction.net pages. */
export const FFN_WEBVIEW_PROPS = {
  userAgent: DESKTOP_USER_AGENT,
  ...(Platform.OS === 'ios' ? { contentMode: 'desktop' as const } : {}),
};

/** True for the mobile site's hosts (m.fanfiction.net). */
export function isMobileSiteUrl(url: string): boolean {
  return /^https?:\/\/m\.fanfiction\.net(?:[/?#]|$)/i.test(url);
}

/** Maps an m.fanfiction.net URL to the same page on www.fanfiction.net. */
export function toDesktopUrl(url: string): string {
  return url.replace(/^https?:\/\/m\.fanfiction\.net/i, 'https://' + FFN_HOST);
}
