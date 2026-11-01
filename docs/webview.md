# WebView lessons (bridge, reader, in-app browser)

> Read before changing any WebView: BridgeHost, the reader WebView, web.tsx, ClipHost.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 10.2 WebView
- **What happened**: on the iPhone, login said "Load failed", the login page showed FFN's "404 Oops",
  search said "Can't reach FanFiction.net" (fine on the Mac). FFN 302-redirects the default WKWebView
  UA's `/login.php` to `m.fanfiction.net`; the bridge's same-origin `fetch` became cross-origin
  ("Load failed"); `m.fanfiction.net/login.php` is a 404. → Every FFN WebView spreads
  `FFN_WEBVIEW_PROPS` (desktop Safari UA with `Platform.Version` + `contentMode: 'desktop'`); the reader
  sets `userAgent={DESKTOP_USER_AGENT}`. Test scripts used desktop Linux Chromium and could never have
  caught it: use an iPhone UA for such checks. (Fixed in `fde0496`; "everything works".)
- **What happened**: blank reader after the app sat in the background (iOS kills the web process). →
  Rebuild at the current position on `onContentProcessDidTerminate` / `onRenderProcessGone`, plus an
  "alive" probe on `active` (2.5 s loaded / 10 s loading). Review fixes (`4b7f0ba`): the rebuild position
  mustn't carry over to later visits; a still-loading page isn't dead; limit endless re-terminations.
- **What happened**: after the web process dies WebKit clears `WKWebView.URL` and react-native-webview
  13.16.1's `reload()` reloads the *original* `source`. → `web.tsx` remounts with `uri: nav.url || p.uri`;
  `BridgeHost.tsx` remounts and calls `bridge.onPageGone()`.
- **What happened**: `web.tsx` accepts `{type:'cookies'}` from any page and is locked to FFN / Cloudflare / OAuth hosts. → P-CLIP opens it deliberately with a cookie-origin guard and nonce-checked messages.
- Any page's JS can call `window.ReactNativeWebView.postMessage`: never trust a message without a nonce and an origin check.
