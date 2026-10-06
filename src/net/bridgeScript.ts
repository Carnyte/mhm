// JavaScript injected into the hidden fanfiction.net WebView (and used verbatim by
// scripts/live-check.ts and scripts/dev-proxy.ts inside Chromium). It performs same-origin
// fetches so requests carry the browser's Cloudflare clearance and login cookies.

export const BRIDGE_SCRIPT = String.raw`
(function () {
  if (window.__ffnBridge) return true;
  function post(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(s);
    else if (window.__ffnPost) window.__ffnPost(s);
  }
  function isChallengeDoc() {
    var t = document.title || '';
    return /just a moment|attention required|security verification/i.test(t) ||
      !!document.querySelector('#challenge-form, #challenge-running, script[src*="challenge-platform"]');
  }
  function toBase64(buf) {
    var bytes = new Uint8Array(buf), chunk = 0x8000, parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(''));
  }
  window.__ffnBridge = {
    announce: function () {
      post({ type: 'ready', href: location.href, title: document.title, challenge: isChallengeDoc(), cookies: document.cookie, ua: navigator.userAgent });
    },
    fetch: function (id, url, opts) {
      opts = opts || {};
      // no-store: never reuse a cached redirect (e.g. one to the mobile site from before the app
      // asked for the desktop site); the app keeps its own cache.
      var init = { method: opts.method || 'GET', credentials: 'include', redirect: 'follow', headers: opts.headers || {}, cache: opts.base64 ? 'default' : 'no-store' };
      if (opts.body != null) init.body = opts.body;
      var started = Date.now();
      fetch(url, init).then(function (res) {
        var meta = { status: res.status, url: res.url, cf: res.headers.get('cf-mitigated') || '', contentType: res.headers.get('content-type') || '' };
        if (opts.base64) return res.arrayBuffer().then(function (b) { meta.body = toBase64(b); return meta; });
        return res.text().then(function (t) { meta.body = t; return meta; });
      }).then(function (r) {
        r.type = 'response'; r.id = id; r.ms = Date.now() - started; r.cookies = document.cookie;
        post(r);
      }).catch(function (e) {
        var msg = String((e && e.message) || e);
        var done = function (m) { post({ type: 'response', id: id, error: m, href: location.href, cookies: document.cookie }); };
        if (location.hostname !== 'www.fanfiction.net') return done(msg + ' (bridge page is on ' + location.hostname + ')');
        if (init.method !== 'GET') return done(msg);
        // A redirect to another host (e.g. the mobile site) fails like a network error; check for it.
        fetch(url, { method: 'GET', credentials: 'include', redirect: 'manual', cache: 'no-store' }).then(function (r) {
          done(r.type === 'opaqueredirect' ? msg + ' (redirected away from www.fanfiction.net)' : msg);
        }, function () { done(msg); });
      });
    },
    cookies: function (id) { post({ type: 'cookies', id: id, cookies: document.cookie }); }
  };
  window.__ffnBridge.announce();
  return true;
})();
`;

/** Script for the visible login WebView: pre-fills the email field when present. */
export function loginPrefillScript(email: string): string {
  return `(function(){try{var e=document.getElementById('email');if(e&&!e.value){e.value=${JSON.stringify(email)};}
  var r=document.getElementById('remember');if(r){r.checked=true;}}catch(_){}
  true;})();`;
}
