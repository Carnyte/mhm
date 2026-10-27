// What the in-app browser (src/app/web.tsx) lets a page do. No WebView or React here, so the
// decisions are tested on their own.
//
// Two modes:
// - 'ffn': fanfiction.net and the pages its login needs (Cloudflare, the OAuth providers). The
//   page shares its cookies with the bridge, so it only ever shows that allowlist; anything else
//   goes to Safari. Story and profile links open the app's own screens.
// - 'open': any https page, for "Clip this page". The site's own pages load in place; plain http
//   is refused (iOS only allows secure pages without a rebuild); links to sites FicShelf reads
//   itself open its screens; other apps (mail, phone, app links) are asked about first. Nothing
//   from these pages reaches the bridge.

import { FFN_ORIGIN } from '../ffn/constants';
import { resolveLink, type ResolvedLink } from '../sources/registry';
import { hostOf } from './httpCore';
import { isMobileSiteUrl, toDesktopUrl } from './webviewConfig';

export type WebMode = 'ffn' | 'open';

/** fanfiction.net's own pages and the sign-in providers its login page uses. */
const FFN_ALLOWLIST =
  /^https:\/\/([a-z0-9-]+\.)*(fanfiction\.net|fictionpress\.com|cloudflare\.com|google\.com|gstatic\.com|facebook\.com|x\.com|twitter\.com|amazon\.com|microsoftonline\.com|live\.com|microsoft\.com|recaptcha\.net)\//i;

const hostIs = (host: string, ...domains: string[]) => domains.some((d) => host === d || host.endsWith('.' + d));

/** The browser mode for a page: fanfiction.net and fictionpress.com keep the FFN browser. */
export function webMode(url: string): WebMode {
  return hostIs(hostOf(url), 'fanfiction.net', 'fictionpress.com') ? 'ffn' : 'open';
}

/**
 * Sites FicShelf reads itself (FanFiction.net, FictionPress, AO3 and its mirrors, Wattpad): Clip is
 * refused there and the page offers "Open in FicShelf", whose adapter knows the site's rules.
 */
export function isNativeHost(url: string): boolean {
  const host = hostOf(url);
  return hostIs(
    host,
    'fanfiction.net',
    'fictionpress.com',
    'archiveofourown.org',
    'archiveofourown.com',
    'archiveofourown.net',
    'ao3.org',
    'archive.transformativeworks.org',
    'wattpad.com',
  );
}

/** Only fanfiction.net pages may hand their cookies to the bridge. */
export function acceptsCookieMessage(url: string | undefined): boolean {
  return !!url && /^https:\/\//i.test(url) && hostIs(hostOf(url), 'fanfiction.net');
}

export type NavigationAction = 'allow' | 'block' | 'external' | 'ask' | 'native' | 'redirect';

export interface NavigationDecision {
  /**
   * allow: load in place. block: don't load (show `message` when there is one). external: hand to
   * iOS (Safari or the app the link belongs to). ask: ask before handing it to another app.
   * native: open the app's own screen for `hit`. redirect: load `url` instead (the FFN mobile site).
   */
  action: NavigationAction;
  hit?: ResolvedLink;
  url?: string;
  message?: string;
}

export interface NavigationContext {
  /** False for frames inside the page (ads, embeds), which load as they are. */
  isTopFrame?: boolean;
  /** WebKit's reason for the load: 'click', 'formsubmit', 'backforward', 'reload', 'other'… */
  navigationType?: string;
}

export const HTTP_REFUSED = 'FicShelf’s browser only opens secure (https) pages.';
export const SCHEME_REFUSED = 'FicShelf’s browser can’t open this kind of link.';

/** Hits that have a screen in the app (a 'web' hit is just a page of the site: it stays in place). */
const hasScreen = (hit: ResolvedLink | null): hit is ResolvedLink =>
  !!hit && (hit.kind === 'story' || hit.kind === 'author' || hit.kind === 'route' || hit.kind === 'part');

/** Decides what happens to a page load the WebView is about to make. */
export function decideNavigation(url: string, mode: WebMode, ctx: NavigationContext = {}): NavigationDecision {
  if (ctx.isTopFrame === false) return { action: 'allow' };
  return mode === 'ffn' ? decideFfn(url, ctx) : decideOpen(url, ctx);
}

function decideFfn(url: string, ctx: NavigationContext): NavigationDecision {
  // The mobile site has no login page (it's a 404); web.tsx goes to the desktop page instead, once.
  if (isMobileSiteUrl(url)) return { action: 'redirect', url: toDesktopUrl(url) };
  // Stories and profiles open natively when tapped.
  if (url.startsWith(FFN_ORIGIN) && ctx.navigationType === 'click') {
    const hit = resolveLink(url);
    if (hit && hit.kind !== 'disabled' && hit.source === 'ffn' && (hit.kind === 'story' || hit.kind === 'author')) return { action: 'native', hit };
  }
  if (FFN_ALLOWLIST.test(url) || url === 'about:blank') return { action: 'allow' };
  return { action: 'external' };
}

function decideOpen(url: string, ctx: NavigationContext): NavigationDecision {
  const scheme = (url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1] ?? '').toLowerCase();
  if (url === 'about:blank' || url === 'about:srcdoc') return { action: 'allow' };
  if (scheme === 'https') {
    if (ctx.navigationType === 'click' && isNativeHost(url)) {
      const hit = resolveLink(url);
      if (hasScreen(hit)) return { action: 'native', hit };
    }
    return { action: 'allow' };
  }
  if (scheme === 'http') return { action: 'block', message: HTTP_REFUSED };
  // Script and local URLs never load as a page; a page can't drive the app through its own links.
  if (['javascript', 'data', 'blob', 'file', 'about', 'ficshelf'].includes(scheme) || !scheme) {
    return scheme === 'javascript' || scheme === 'ficshelf' ? { action: 'block' } : { action: 'block', message: SCHEME_REFUSED };
  }
  // mailto:, tel:, app links: ask first, and only when the user tapped (a page can't open apps by itself).
  return ctx.navigationType === 'click' ? { action: 'ask' } : { action: 'block' };
}
