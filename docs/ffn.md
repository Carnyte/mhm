# FanFiction.net: the bridge, login, features, lessons

> Read before touching src/ffn/, src/sources/ffn/, src/net/bridge*.ts or FFN screens.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 6.2 FanFiction.net
- **Bridge**: a hidden WKWebView on `https://www.fanfiction.net/` with desktop Safari UA +
  `contentMode:'desktop'` (m.fanfiction.net has no login and makes www fetches cross-origin, "Load
  failed"). `BRIDGE_SCRIPT`'s same-origin `fetch` with `credentials:'include'` (`cache:'no-store'`
  except base64 images) carries Cloudflare clearance and login cookies; RN `fetch` shares the cookie store (`sharedCookiesEnabled`).
- `bridge` singleton: status `starting | ready | verifying | needs-user | offline | error`; `MAX_IN_FLIGHT = 4`;
  tags `<id>#<attempt>` (stale answers ignored); network error retried once; a challenge requeues up to
  4 attempts and reloads the page (at most once per 4 s, on the challenged URL for GETs); after
  `PASSIVE_WAIT_MS = 9 s` with non-quiet requests waiting, `showVerification()` slides the WebView up
  ("Verify you are human"); `quiet` requests never escalate; landing on m.fanfiction.net reloads once
  with a cache-buster (twice within 60 s = error); `onPageGone()` remounts and requeues GETs, **POSTs in
  flight fail** ("check whether it went through") so a review is never posted twice.
- `BridgeError.code`: `timeout | challenge | network | http | cancelled | unavailable`. Methods `text`
  (status ≥ 400 except 404 throws), `json`, `postForm` (urlencoded + `X-Requested-With`), `dataUri`,
  `waitReady(timeout)`, `diagnostics()` (no cookie values; Settings → Connection).
- Works only while the app process is alive: background checks include FFN only when `bridge.pageReady`.
- Login: GET `/login.php` (state token + hidden fields) → POST `/api/ajax_captcha_preverify.php` →
  POST the form; success = the `funn` cookie. Captcha or social sign-in → the real login page in the
  in-app WebView with the email pre-filled (all WebViews share one cookie store; Google may refuse
  sign-in inside apps: set a password and use email). Logout `/logout.php`.
- Follow / favourite: `POST /api/ajax_subs.php`; reviews: `POST /api/ajax_review.php`.
- Logged-in pages (alerts, favourites, PMs) use adaptive parsing and form replay (`src/ffn/forms.ts`)
  never inspected with a real account; each has an "Open on FanFiction.net" fallback.
- Updates: no `checkUpdates`; 2 per-story workers calling `fetchStory`. `syncAccount()` pulls Follows /
  Favorites and author lists, up to 50 pages each (each sync touches only its own source's stories).

---

### 7.1 FanFiction.net
- **Connection**: ✅ hidden WKWebView bridge (same-origin fetch, attempt tags, stale answers ignored,
  GETs re-sent after a web-process kill, POSTs fail); ✅ desktop Safari identity for every FFN WebView;
  ✅ mobile-site detection (one cache-busting reload, then an error); ✅ Cloudflare challenge detection
  (passive reload first, then the full-screen "Quick check by FanFiction.net"); ✅ covers and avatars
  as base64 through the bridge; ✅ Settings → Connection (status, Run security check now, Reconnect,
  Connection details without cookie values).
- **Browse**: ✅ 9 categories + crossover home; fandom lists (counts, A–Z / #, sort, search),
  crossover lists, partners and "All crossovers for X"; ✅ pinned "My Fandoms"; ✅ cross-site "Continue
  reading"; ✅ story list with infinite scroll and every filter from the live page (sort, time range,
  genres incl. exclude, rating ranges, 44 languages, length, status, characters A–D, pairing, exclusions,
  world); ✅ saved default filters and hidden fandoms; ✅ Just In; ✅ communities (+ archive with filters;
  🌐 follow), forums (directory, topics, threads; 🌐 post, start topic, follow), beta readers and profiles;
  ✅ story cards with long-press actions.
- **Search**: ✅ story / writer / forum / community; match any / title / summary; crossover filter;
  sorts; live facets; in-app fandom exclusion; recent searches per site; pagination; ✅ one box to
  search or paste a link / id (a bare number asks "FanFiction.net or AO3?").
- **Story page**: ✅ cover, metadata, breadcrumb, reading time; Read / Continue; chapter list with read /
  downloaded / current markers; follow / favourite story and author; download offline + remove;
  collections; reviews; share / browser / copy; not-found handling; Listen; 🌐 report abuse, add to community.
- **Reviews**: ✅ list with chapter filter and pagination; post signed in or as guest (with follow / fav flags); 🌐 reply by PM, report.
- **Authors**: ✅ profile tabs (stories, favourite stories, favourite authors, bio), sort / filter, follow /
  favourite, share; 🌐 PM via the site's form (native compose tried first).
- **Account**: ✅ login (state token → captcha pre-check → POST; `funn` cookie), captcha / social
  fallback in the in-app browser with email prefilled, status, logout; ✅ alerts and favourites lists
  synced into the library (adaptive parsing; unfollow via form replay, web fallback); ✅ PMs (inbox,
  sent, read, compose, reply; 🌐 fallback); 🌐 account settings, profile editing, blocked users,
  deletion, reviews received, moderation, followed / own communities and forums.
- **Writing**: ✅ local drafts (title, tags, word count, autosave, copy, export / share .txt / .html);
  🌐 Doc Manager, publishing; ⏳ official AI grammar / transcriber / voices (FictionPress's private service).

---

### 10.8 FanFiction.net
- Cloudflare blocks plain HTTP (403, `cf-mitigated: challenge`). → The bridge (§6.2).
- Bridge edge cases fixed (`fde0496`, `956add0`): `id#attempt` tags with stale answers ignored; in-flight
  GETs re-queued on reload, POSTs fail with "Check whether it went through before trying again"; a
  page-specific challenge solved on that page; mobile redirect = one cache-busting reload then a clear
  error; `cache: 'no-store'`; a challenge arriving while verifying used to stall the bridge (reloading /
  lastReload flags). → Any bridge change needs `tests/bridge.test.ts` reload-race scenarios.
- Logged-in pages were never seen. → Adaptive parsing, form replay, "Open on FanFiction.net" fallback; ask the user what they see.
- Cloudflare started challenging the container's headless Chromium after many requests. → Budget live checks; stop when challenges start; cover retry logic in tests.
- An FFN story that's gone (`not_found`) blocked update ordering. → Stamp `lastCheckedAt` for it (`a315dbe`).
