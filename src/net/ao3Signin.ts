// The AO3 sign-in screen's rules (src/app/signin/[source].tsx), kept apart from the WebView so
// they're tested on their own.
//
// The screen shows AO3's own pages in a visible WebView that shares cookies with native requests.
// FicShelf never fills in, reads or sends the login form: the injected script only looks at the
// page header and reports whether it was rendered for a logged-in user (`#greeting` and the
// `/users/NAME` link) or a visitor. Messages count only when they come from AO3's own host.
// Pages of other sites open in Safari.

import { hostOf } from './httpCore';
import type { NavigationContext, NavigationDecision } from './webPolicy';
import { resolveLink } from '../sources/registry';

export const AO3_SESSION_MESSAGE = 'ao3-session';

export type SigninMode = 'login' | 'logout' | 'browse';

const AO3_HOST = 'archiveofourown.org';

export const AO3_LOGIN_URL = `https://${AO3_HOST}/users/login`;
export const AO3_HOME_URL = `https://${AO3_HOST}/`;
export const AO3_INVITE_URL = `https://${AO3_HOST}/invite_requests`;

export const isAo3Page = (url: string | undefined): boolean => !!url && /^https:\/\//i.test(url) && hostOf(url) === AO3_HOST;

/** An AO3 page the screen may start on (`path` from a route): only AO3's own https pages. */
export function signinStartUrl(mode: SigninMode, path?: string): string {
  if (mode === 'login') return AO3_LOGIN_URL;
  if (mode === 'logout') return AO3_HOME_URL;
  if (path && /^\/(?!\/)/.test(path) && !/\/cdn-cgi\//i.test(path)) return `https://${AO3_HOST}${path}`;
  return AO3_HOME_URL;
}

/** Reports the page header's login state once the page has loaded. Reads no form field. */
export const SESSION_SCRIPT = `(function(){try{
var g=document.querySelector('#greeting');var state='unknown';var user=null;
if(g){state='in';var a=g.querySelector('a[href^="/users/"],a[href^="https://archiveofourown.org/users/"]');
if(a){var m=(a.getAttribute('href')||'').match(/\\/users\\/([A-Za-z0-9_]{1,40})(?:[\\/?#]|$)/);if(m)user=m[1];}}
else if(document.querySelector('#login,#login-dropdown,form#new_user_session_small')||(document.body&&document.body.classList.contains('logged-out')))state='out';
else if(document.body&&document.body.classList.contains('logged-in'))state='in';
window.ReactNativeWebView.postMessage(JSON.stringify({type:'${AO3_SESSION_MESSAGE}',state:state,username:user,url:location.href}));
}catch(e){}})();true;`;

/**
 * Logs the page out the way AO3's own header does: its logout form when the page has one, else
 * its "Log Out" link (which leads to that form). Sent only in logout mode, at most a few times.
 */
export const LOGOUT_SCRIPT = `(function(){try{
var f=document.querySelector('form[action$="/users/logout"]');if(f){f.submit();return;}
var a=document.querySelector('#greeting a[href$="/users/logout"],a[href$="/users/logout"]');if(a){a.click();return;}
location.href='/users/logout';
}catch(e){}})();true;`;

export interface SessionMessage {
  state: 'in' | 'out' | 'unknown';
  username?: string;
  url: string;
}

/** A page's report, or null when it isn't one or didn't come from AO3. */
export function readSessionMessage(data: string, from: string | undefined): SessionMessage | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || m.type !== AO3_SESSION_MESSAGE) return null;
  const url = typeof m.url === 'string' ? m.url : '';
  if (!isAo3Page(from) || !isAo3Page(url)) return null;
  const state = m.state === 'in' || m.state === 'out' ? m.state : 'unknown';
  const username = typeof m.username === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(m.username) ? m.username : undefined;
  return { state, username, url };
}

/**
 * What a page load in the sign-in WebView does: AO3's pages load in place (in browse mode a tapped
 * work, series or creator opens FicShelf's own screen); other https pages open in Safari; frames
 * inside the page (Cloudflare's check) load as they are; nothing else loads.
 */
export function decideSigninNavigation(url: string, mode: SigninMode, ctx: NavigationContext = {}): NavigationDecision {
  if (ctx.isTopFrame === false) return { action: 'allow' };
  if (url === 'about:blank') return { action: 'allow' };
  if (isAo3Page(url)) {
    if (mode === 'browse' && ctx.navigationType === 'click') {
      const hit = resolveLink(url);
      if (hit && hit.kind !== 'disabled' && hit.source === 'ao3' && (hit.kind === 'story' || hit.kind === 'author' || hit.kind === 'route' || hit.kind === 'part')) {
        return { action: 'native', hit };
      }
    }
    return { action: 'allow' };
  }
  if (/^https:\/\//i.test(url)) return { action: 'external' };
  return { action: 'block' };
}
