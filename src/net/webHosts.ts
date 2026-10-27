// Which sites the in-app browser treats how, by host name alone. Kept apart from webPolicy.ts (which
// needs the source registry) so the deep-link redirect in src/app/+native-intent.tsx stays light.

import { hostOf } from './httpCore';

export type WebMode = 'ffn' | 'open';

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
