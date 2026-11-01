# P-CLIP spec: "Clip this page" for any website (built)

> The full spec of the first clipping phase, incl. Novelpia findings, policies, tests and open questions.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 4. P-CLIP: "Clip this page" for any website

```yaml
id: P-CLIP
title: Clip this page (any website)
status: done (works on the phone 2026-10-27)
order: 1
next_task: false
depends_on: [P5-import (done)]
native_rebuild: no   # https only; http:// pages would need an ATS change and a prebuild
approved_by_user:
  date: 2026-10-21
  context: >-
    User asked whether FicShelf could pull the text of a global.novelpia.com/viewer/<n> page.
    Two options were offered (a Novelpia source, or "Clip this page" for any site); the user asked
    whether option two already existed, was told only the cleanup exists, and was asked "Should I
    build Clip now, before Wattpad?"
  quote: "I want you to do this, and hopefully any future website"
```

### why
- The user reads on sites FicShelf has no adapter for (Novelpia first, "and hopefully any future website").
- FicShelf can't take those pages today:
  - iPhone Safari saves pages as PDF or `.webarchive`; `src/import/sniff.ts` rejects both on purpose;
  - JS-rendered readers (Novelpia) load the chapter after the page, so the raw HTML has no text.
- What exists: the in-app browser `src/app/web.tsx` and the Safari-Reader-style cleanup
  (`src/import/html.ts` → `src/import/readability.ts`).
- What's missing: the browser only opens fanfiction.net, Cloudflare and the OAuth hosts (everything
  else goes to Safari), and nothing hands a *rendered* page to the cleanup.

### scope

What exists today (verified at `5cc19e8`):
- `src/app/web.tsx` (129 lines): params `path` (FFN-relative or absolute, via `absolute()` from
  `src/ffn/urls.ts`), `title`, `email`, `login`. Spreads `FFN_WEBVIEW_PROPS` (desktop Safari UA +
  `contentMode:'desktop'`), `sharedCookiesEnabled`, `thirdPartyCookiesEnabled`,
  `setSupportMultipleWindows={false}`, `injectedJavaScript = loginPrefillScript(email)` when `email`.
  `onShouldStartLoadWithRequest`: non-top frames allowed; m.fanfiction.net → desktop once; FFN
  story / user links on click open natively; allowlist regex
  `^https://([a-z0-9-]+\.)*(fanfiction\.net|fictionpress\.com|cloudflare\.com|google\.com|gstatic\.com|facebook\.com|x\.com|twitter\.com|amazon\.com|microsoftonline\.com|live\.com|microsoft\.com|recaptcha\.net)/`
  or `about:blank`; everything else `Linking.openURL`. `onMessage` accepts `{type:'cookies'}` from
  **any page** and calls `bridge.updateCookies` (a hole CLIP-3 closes). `onContentProcessDidTerminate`
  remounts at `nav.url`.
- `src/import/readability.ts` `readArticle(body, head)`: `@mozilla/readability` 0.6.0 on its
  `JSDOMParser` (Hermes has no DOMParser), options `{charThreshold: 300, keepClasses: false}`, no
  page URL (relative links dropped); restores RN globals (`SCRIPT_GLOBALS`) the parser overwrites.
- `src/import/html.ts`: `parseHtmlFile(bytes, stepper)` decodes, then the private
  `parsePage(html, stepper, images: ImageTable): Promise<BookDraft>` detects AO3 download / AO3 work
  page / FFN page / FanFicFare / FicHub, else `webPage(...)` (reader mode with fallbacks, chapters cut
  at h1–h3 chapter headings, `READER_MODE_MAX = 1_000_000` chars). `stripActive` removes `SCRIPTISH`
  tags and elements with `hidden`, `aria-hidden="true"` or inline `display:none` / `visibility:hidden`.
  `parseImport` (`src/import/index.ts`) ends with `finishBook(draft, fileName)` → `ImportedBook`.
- `src/import/build.ts` `importSanitizeOptions`: allowlist, `relativeUrls:'drop'`, `classes:'none'`,
  images mapped to `ficshelf-img:<n>`. Web images are stripped at read time under the local CSP.
- Local stories: `src/sources/local/adapter.ts` `LOCAL_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'"`,
  reader base `about:blank`, never touches the network. `src/features/imports.ts`
  `commitImport(book, file: ImportFile {name,size,contentHash,uri?}, {mode:'local', replace?, title?, authors?, keepOriginal?, onProgress?, signal?})`
  → `local:<uid>` (`newLocalKey()`); `contentHash(bytes, uri?)`; `writing` set in
  `src/features/importFiles.ts`. `chapterStore` (`src/db/kv.ts`): `put`, `putMany`, `list`, `remove`,
  `renumber(key, Map<number, number|null>)` (null deletes).
- `LocalOrigin` (`src/state/library.ts`) is rebuilt on every load by `normalizeLocal`, which keeps
  only known fields: a new `clip` field must be added there or it vanishes on the next launch.
- `ImportGenerator` (`src/import/types.ts`) = `'ao3' | 'fichub' | 'fanficfare' | 'calibre' | 'ffn' | 'readability'`;
  labels in `GENERATORS` (`src/sources/local/ui.ts`); `localUi.readerActions` returns `{menu: [], end: []}`.
- `WHATS_NEW_VERSION = 1` (`src/components/WhatsNewSheet.tsx`). `src/app/open.tsx` `NOT_A_LINK =
  'That doesn’t look like a FanFiction.net or AO3 link, or a story ID.'`; `resolveLink` returns
  `null` for an unknown host. Library + sheet (`addStories()` in `src/app/(tabs)/library.tsx`) has
  "Import a file" and "Open a link".
- `src/app/+native-intent.tsx` `redirectSystemPath`: only `file://` URLs are rewritten (to
  `/import?open=<ticket>`); everything else passes through.
- ATS: the prebuilt Info.plist has `NSAllowsArbitraryLoads = false`; WKWebView refuses `http://`.
  https-only needs no plist change.
- react-native-webview 13.16.1 injects `ReactNativeHistoryShim` (`apple/RNCWebViewImpl.m`), so SPA
  `pushState` updates `onNavigationStateChange`; the capture message still carries `location.href`.
- Backups: `exportBackup` drops `local` stories (`isImported`), so clipped stories are excluded too.

User flow:
1. Ways in: Library → **+** → **"Clip from a web page"** (opens `/open` with a hint); `/open` with an
   https link to a site FicShelf doesn't read shows **"Open in FicShelf's browser"** →
   `/web?url=<https url>`; a clipped story's page → **"Clip next chapter"** →
   `/web?url=<clip.lastUrl>&clipFor=<key>`; optional Shortcut / bookmarklet help (CLIP-16).
2. Browser: any `https://` page, with the site's own login and cookies. A bottom bar shows the host
   (e.g. `global.novelpia.com`) and a primary **Clip** button (**"Clip as chapter N+1"** with `clipFor`).
3. Clip: once the site's reader shows the chapter, the user taps **Clip**. The injected script waits
   until the page is quiet, marks hidden elements, strips scripts and forms, posts the rendered DOM.
   RN runs the import cleanup → sanitized chapter(s). **ClipSheet** preview: story title (editable
   for a new story), chapter title (editable), words, first lines, and the target.
4. Save: **"New story"** → a local story with `clip` info; or **"Add as chapter N+1 of <story>"**
   (default when `clipFor` is set, or when exactly one clipped story has `clip.site === host`).
5. Next chapter: the user taps the site's own **Next**, then Clip again. One tap per chapter; the app
   never follows next links, crawls, prefetches or clips in the background.
6. Afterwards it's an ordinary imported story: Imported shelf, offline CSP reader, audiobook,
   bookmarks, collections.

Checklist:
- [x] CLIP-1 `src/net/webPolicy.ts` (new, pure, no RN imports): `webMode(url) → 'ffn' | 'open'`
      (fanfiction.net / fictionpress.com → `ffn`); `decideNavigation(url, mode, {isTopFrame, navigationType})
      → {action: 'allow'|'block'|'external'|'ask'|'native', hit?, message?}`; `acceptsCookieMessage(url)`;
      the FFN allowlist regex moved here unchanged. (03e4a59)
- [x] CLIP-2 `src/app/web.tsx` two modes (0e93bdd):
  - `ffn` mode (param `path`, or `url` on fanfiction.net / fictionpress.com): today's behaviour unchanged
    (allowlist, `FFN_WEBVIEW_PROPS`, mobile redirect, cookie push, login prefill, native story/user links);
  - `open` mode (param `url`, any https host): default WebView UA (no `FFN_WEBVIEW_PROPS`); every
    top-frame `https:` navigation allowed in place; `about:blank` / `about:srcdoc` allowed; `http:`
    blocked with "FicShelf's browser only opens secure (https) pages" + Open in Safari;
    `javascript:`, `data:`, `blob:`, `file:` blocked; other schemes (`mailto:`, `tel:`, app schemes)
    ask "Open in another app?" before `Linking.openURL`; host always shown; FFN / AO3 / Wattpad links
    tapped inside go through `resolveLink` and open natively; no `loginPrefillScript`;
  - new params `url`, `clipFor`; bottom bar with host + Clip; Clip disabled while a capture is pending.
  - also: a non-https start page is refused with Safari offered; one link question (alert) at a time, so a
    redirecting page can't stack them (review fix, 7546679).
- [x] CLIP-3 Accept `{type:'cookies'}` messages only when `acceptsCookieMessage(e.nativeEvent.url)`
      (fanfiction.net). Closes today's any-page hole. (03e4a59)
- [x] CLIP-4 `src/net/clipScript.ts` (new): `clipScript(nonce: string, maxChars: number): string`,
      `CLIP_MESSAGE = 'ficshelf-clip'`, `MAX_CLIP_CHARS = 10_000_000` (see data/API details). (4a653e7) Built a little differently: hidden elements are found on the live page but
      dropped from an inert copy walked side by side (the page is never changed); forms are unwrapped, not removed (some sites
      wrap the whole page in one); every attribute that could carry a token is dropped (link addresses become
      `https://link.invalid/`, in-page `#` links kept); `hidden` / `aria-hidden` are dropped too (a consent dialog can leave
      `aria-hidden` on the whole page).
- [x] CLIP-5 `src/import/html.ts`: export `parseHtmlPage(html, stepper, images)` (today's `parsePage`);
      `stripActive` also removes `[data-fs-hidden]` (harmless for files). (4a653e7)
- [x] CLIP-6 `src/import/clip.ts` (new) `parseClip(html, pageUrl, opts?): Promise<ImportedBook>`;
      export from `src/import/index.ts`; `ImportGenerator` gains `'clip'`. (4a653e7) Also `asOneChapter` (OQ-CLIP-3), `stripSiteName`, `splitTitle`, `cleanClipUrl` live here (pure).
- [x] CLIP-7 Storage: `ClipInfo` + `LocalOrigin.clip?` in `src/state/library.ts`; `normalizeLocal`
      keeps a valid `clip`; `CommitOptions.clip?: ClipInfo` written by `fileRecord`; `commitLocal`
      with `replace` keeps `old.local.clip`; clips commit with `keepOriginal: false`. (4484f56)
- [x] CLIP-8 `src/features/clips.ts` (new): `commitClip`, `appendClip`, `undoLastClip`,
      `clippedStories(host?)`, `cleanClipUrl`, `isNativeHost`; reuse `hostOf` from `src/net/httpCore.ts`. (4484f56) Plus
      `findClippedPage` and `defaultClipTarget`.
- [x] CLIP-9 `src/components/ClipSheet.tsx` (new): preview, editable titles, target picker,
      duplicate warning, progress and errors; one-time notice (`sources.local.clipNoticeSeen`). (0e93bdd) The notice is an
      Alert in web.tsx before the first capture; "Keep as one chapter" (OQ-CLIP-3) is a switch in the sheet.
- [x] CLIP-10 `src/sources/local/ui.ts`: `GENERATORS.clip = 'Clipped web page'`; clipped stories get
      **Clip next chapter**, **Remove last chapter** and **Open on <site>** in the story ⋯ menu, and
      reader end action **Clip next chapter** on the last chapter (`readerActions` returns `end`). (0e93bdd)
      Open on <site> opens chapter 1's page in FicShelf's browser (the site's login lives there); the stats show
      "Clipped web page: <site>"; Remove last chapter only from 2 chapters up.
- [x] CLIP-11 Entry points: Library **+** sheet "Clip from a web page" (and "Send links from Safari"
      if CLIP-16 is built); `src/app/open.tsx` unknown https link → "Open in FicShelf's browser" +
      "Open in Safari", and `NOT_A_LINK` wording updated. (0e93bdd) `/open?clip=1` shows the clipping hint;
      a bare "site.com/page" gets https://; http links offer Safari only.
- [x] CLIP-12 Refuse Clip on hosts FicShelf reads natively (`fanfiction.net`, `fictionpress.com`,
      `archiveofourown.org` and mirrors `ao3.org`, `archiveofourown.com`, `archiveofourown.net`,
      `archive.transformativeworks.org`, `wattpad.com`): "FicShelf reads this site directly" +
      **Open in FicShelf**. The native adapters carry those sites' rules (e.g. Wattpad paid parts). (0e93bdd)
- [x] CLIP-13 `src/app/+native-intent.tsx`: an external `ficshelf://web?...` with a non-FFN URL is
      redirected to `/open?url=...`, so outside links can't drop the user into an arbitrary site. (0e93bdd)
      The host helpers moved to `src/net/webHosts.ts` (no registry import) so this stays light.
- [x] CLIP-14 `src/state/settings.ts`: `SourceSettings.clipNoticeSeen?: boolean` (under `sources.local`). (4484f56)
- [x] CLIP-15 `src/components/WhatsNewSheet.tsx`: `WHATS_NEW_VERSION` 1 → 2 with a Clip card. (0e93bdd) Someone who never saw version 1 also gets the AO3 part.
- [x] CLIP-16 (optional, cheap, no rebuild) `src/app/help/share.tsx`: an iOS Shortcut ("Receive URLs
      from Share Sheet → URL Encode → Open URL `ficshelf://open?url=…`") and a Safari bookmarklet
      (`javascript:location.href='ficshelf://open?url='+encodeURIComponent(location.href)`); linked
      from the Library + sheet. Planned in P5 and never built. (0e93bdd)
- [x] CLIP-17 Docs: README "Imported files" (Clip and its limits: text only, one tap per chapter,
      https only, stays on the phone, not in backups) and Known limitations; PLAN.md §2.13;
      INSTALL.md "no prebuild for this update". (7546679)
- [x] CLIP-18 All checks green, README count, tick this file, commit, push, report (T1, no prebuild).

### files

| action | path | what |
|---|---|---|
| new | `src/net/webPolicy.ts` | CLIP-1 |
| change | `src/app/web.tsx` | two modes, `url` / `clipFor` params, bottom bar, capture + nonce handling, ClipSheet, navigation via `webPolicy`, cookie guard |
| new | `src/net/clipScript.ts` | injected capture JS |
| change | `src/import/html.ts` | export `parseHtmlPage`; `stripActive` drops `[data-fs-hidden]` |
| new | `src/import/clip.ts` | `parseClip` |
| change | `src/import/index.ts`, `src/import/types.ts` | export `parseClip`; `ImportGenerator` adds `'clip'` |
| new | `src/features/clips.ts` | commit / append / undo / list / URL helpers |
| change | `src/features/imports.ts` | `CommitOptions.clip`; `fileRecord` writes it; replace keeps it |
| change | `src/state/library.ts` | `ClipInfo`; `LocalOrigin.clip?` |
| change | `src/db/migrations/v2.ts` | `normalizeLocal` keeps a valid `clip` |
| new | `src/components/ClipSheet.tsx` | preview + target + save |
| change | `src/sources/local/ui.ts` | generator label, menu items, reader end action |
| change | `src/app/open.tsx` | unknown https link → in-app browser / Safari |
| change | `src/app/(tabs)/library.tsx` | `addStories()` sheet entry |
| change | `src/app/+native-intent.tsx` | `/web?url=` non-FFN → `/open?url=` |
| change | `src/state/settings.ts` | `SourceSettings.clipNoticeSeen?` |
| change | `src/components/WhatsNewSheet.tsx` | version 2, Clip card |
| optional new | `src/app/help/share.tsx` | Shortcut / bookmarklet help |
| change | `src/app/_layout.tsx` | register titles for new routes (`help/share`) if added |
| docs | `README.md`, `PLAN.md`, `INSTALL.md` | CLIP-17 |
| tests | `tests/clip-parse.test.ts`, `tests/clip-url.test.ts`, `tests/web-policy.test.ts`, `tests/clip-script.test.ts`, `tests/clip-commit.test.ts`, `tests/clip-screen.test.tsx` | see tests |

### data / API details

```ts
// src/state/library.ts
export interface ClipInfo {
  site: string;     // hostname, lower-case, e.g. 'global.novelpia.com'
  lastUrl: string;  // cleaned https URL of the last clipped page ("Clip next chapter" opens it)
  urls: string[];   // cleaned URL per chapter; index = chapter number - 1 (duplicate check, "Open on site")
}
// LocalOrigin gains `clip?: ClipInfo`. A clipped story's LocalOrigin: kind 'html', generator 'clip',
// fileName = host, size = bytes of the cleaned chapter HTML, contentHash = contentHash(those bytes),
// sourceUrl = cleaned URL of chapter 1, never an `original` file.
```

- `normalizeLocal` (`src/db/migrations/v2.ts`) keeps `clip` only when: `site` matches a hostname
  regex (e.g. `/^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i`); `lastUrl` and every `urls[i]` start with
  `https://` and are ≤ 2048 chars; at most 5000 urls. Anything else is dropped (the story stays).
- `cleanClipUrl(url)`: drop `#fragment`; drop query params whose name matches
  `/^(?:_t|t|token|access_token|auth|key|sig|signature|signed_key|policy|key-pair-id|expires|session|sid|code|ticket)$/i`
  or contains `token|sig|auth|session`; keep others (`?chapter=3`); lower-case the host.
- `isNativeHost(url)`: true for `fanfiction.net`, `fictionpress.com` (any subdomain incl. `m.`,
  `www.`), `archiveofourown.org` + mirrors, `wattpad.com` (`www.`, `m.`).
- `parseClip(html, pageUrl, opts?)`:
  1. refuse over `MAX_CLIP_CHARS` (`ImportError('too-large', …)`); `MAX_INPUT_BYTES` (100 MB) still applies;
  2. `const images = new ImageTable(() => undefined)`; `draft = await parseHtmlPage(html, stepper, images)`;
  3. **after** parsing, per chapter: remove every `<img>` / `<picture>` / `<source>` and unwrap every
     `<a>` whose href isn't a `#fragment` (text kept). Do this after reader mode, not before:
     Readability uses link density to recognise menus, so unwrapping links first would make nav
     look like prose;
  4. `book = finishBook(draft, host)`, then set `generator: 'clip'`, `kind: 'html'`,
     `sourceUrl: cleanClipUrl(pageUrl)`, `images: []`; trim the site name from the title
     (`og:site_name`, or a ` | Site` / ` - Site` suffix/prefix equal to the host's name);
  5. empty or very short result → `ImportError('empty', 'The page doesn’t show any story text yet. Wait until the chapter appears, then tap Clip again.')`.
  `parsePage` returns `BookDraft`, not `ImportedBook`: go through `finishBook` like `parseImport`.
- `commitClip(book, {title, authors, url})`: `commitImport(book, {name: host, size, contentHash, uri: undefined}, {mode: 'local', title, authors, keepOriginal: false, clip: {site, lastUrl: url, urls: book.chapters.map(() => url)}})`.
- `appendClip(key, book, url)`:
  - throws unless `story.source === 'local' && story.local?.clip` and `kv.writable`; adds `key` to
    `writing` (from `importFiles.ts`) for the duration;
  - `n = story.chapters`; `chapterStore.putMany(key, book.chapters.map((c, i) => ({number: n + 1 + i, html: c.html})))`;
  - `patchStory(key, …)`: `chapters`, `chapterTitles` (appended), `words` (summed), `updated`
    (Unix seconds now), **`downloadedChapters` (add the new numbers) and `knownChapters` (new count)**
    so no "new chapter" badge appears (`newChapterCount = chapters - knownChapters`),
    `local: {...local, chapters, size: size + bytes, clip: {...clip, lastUrl: url, urls: [...urls, ...book.chapters.map(() => url)]}}`;
  - `invalidate('story:' + key)`; toast "Added as chapter N".
- `undoLastClip(key)`: refuse when the story has 1 chapter (offer Delete). Otherwise build a
  `ChapterRemap` `{moves: {1:1 … n-1:n-1}, removed: [n], changed: true}` and reuse the replace path's
  machinery: `chapterStore.renumber(key, new Map([[n, null]]))`, `patchStory(key, s => ({...counts, titles, words, ...remapStoryState(s, r)}))`,
  `remapStoryBookmarks(key, r)`, `announceRemap(key, r)` (the player's `onChapterRemap` listener
  then drops a listening position in chapter n; reading progress in n resumes at n-1). Pop
  `clip.urls`; `lastUrl` becomes the previous URL. Stop the player if it is playing chapter n.
- Duplicate: if `cleanClipUrl(url)` is in any clipped story's `clip.urls`, the sheet says "You
  clipped this page already (chapter K of <title>)" with **Add again** / **Cancel**.

Capture script `clipScript(nonce, maxChars)` (runs in the main frame via `ref.current.injectJavaScript(...)`
only after a tap on Clip; it runs in WebKit, not Hermes, so modern DOM APIs are fine):
1. Wait until quiet: a `MutationObserver` on `document.documentElement` (subtree, childList,
   characterData); finish 700 ms after the last mutation or 4 s at most; if
   `document.readyState !== 'complete'`, wait for `load` first, within the same 4 s.
2. Mark hidden elements in the live DOM under `document.body` (walk with a `TreeWalker` and skip
   the subtree of an element already marked):
   - skip `getComputedStyle(el).display === 'contents'` (no box; `checkVisibility()` reports it
     invisible though its children show);
   - mark `data-fs-hidden` when `display === 'none'`, `visibility` is `hidden` / `collapse`,
     `opacity === '0'`, or `el.checkVisibility && !el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})`.
   This catches class-hidden anti-copy decoy paragraphs (as on Royal Road) the file importer can't see.
3. Clone and clean: `root = document.documentElement.cloneNode(true)`, then remove the marks from
   the live DOM at once. In the clone remove `script, noscript, template, style, link, iframe,
   frame, object, embed, svg, canvas, video, audio, input, textarea, select, button, form,
   [data-fs-hidden]`; every `<meta>` except `name|property` in `description, author, og:title,
   og:description, og:site_name, article:published_time`; every `on*` attribute. So the site's
   inline data (e.g. Novelpia's `__NUXT_DATA__` with `_t` / `signed_key`), its tokens and form
   values never leave the page.
4. Send: `html = '<!DOCTYPE html>' + root.outerHTML`; over `maxChars` → post `{type, nonce, error:'too-large'}`;
   else `window.ReactNativeWebView.postMessage(JSON.stringify({type:'ficshelf-clip', nonce, url: location.href, title: document.title, lang: document.documentElement.lang, html}))`.
   Wrap all in `try/catch` → `{type, nonce, error:'failed'}`. End with `true;`.

RN side (`web.tsx`):
- `pending = useRef<{nonce, timer}>()`; nonce = `Math.random().toString(36).slice(2) + Date.now().toString(36)`.
- Accept a message only when `m.type === 'ficshelf-clip'`, `m.nonce === pending.nonce` and
  `hostOf(e.nativeEvent.url) === hostOf(m.url)`; then clear `pending`. Ignore everything else (any
  page JS can call `ReactNativeWebView.postMessage`).
- 10 s timeout → "The page didn't answer. Try again once it has finished loading."
- Never log or persist `m.html`; only sanitized chapters are stored.

Novelpia findings (2026-10-21; Clip's first target and test site; structure only):
- `https://global.novelpia.com` is a Nuxt app (`x-powered-by: Nuxt`, `server: nginx`), **no
  Cloudflare** challenge. Sets cookies `i18n_redirected`, `USERKEY` (on `.novelpia.com`, about 1
  year) and `colorMode` (never record values). Consent scripts from `cmp.gatekeeperconsent.com`.
- robots.txt: `User-agent: * Allow: /`, disallows `/mypage /mybook /writer_room /editor_room
  /payment /charge /auth /sign /alarm /dev`. `/viewer/<episode_no>` is allowed.
- Metadata is in `<script id="__NUXT_DATA__">`, a flat JSON array whose objects reference other
  entries by index. Novel object fields: `novel_no, novel_name, novel_story, count_epi, count_word,
  count_view, count_good, count_like, count_comment, flag_complete, flag_adult, novel_img
  (gn.novelpia.com/upload/novel/...), new_epi_num, new_epi_open_dt, update_dt, reg_dt, flag_del,
  free_max_epi_num, not_login_epi_cnt, writer_name, tags`. Episode object: `episode_no, novel_no,
  epi_num, epi_title, count_word, flag_free, open_dt, flag_open, flag_adult, sort_no,
  episode_count_view/good/comment`. The sample episode showed "Free" on the page while
  `flag_free` was `0`: `flag_free` alone does not mean paid. Sample: viewer `833813` = novel_no
  `6589`, episode 1 of 111.
- The text is not in the HTML. The viewer JS calls `https://api-global.novelpia.com`:
  `GET /v1/novel/episode?episode_no=N` → `result.data`, `result.novel`, `result._t` (a one-time
  ticket) and `result.signed_key`, after a server-side entitlement check; then
  `GET /v1/novel/episode/content?_t=<ticket>` → `result.data.epi_content` (+ `epi_content2..4`),
  passed through `set_signed_url` (CloudFront signed cookies). Error codes in the viewer JS:
  `"0003"` / `NOVEL_ERROR` (silent) and `"0008"` / `NOVEL_ERROR` (notice; likely login or adult required).
- Consequence for Clip: open `https://global.novelpia.com/viewer/<episode_no>` in the in-app browser
  (log in there if needed), wait for the text, Clip. The ticket never leaves Novelpia's page.
  Pulling the ticket out of the page was denied by the auto-mode classifier on 2026-10-21; that line stands.

### policies
- One tap, one capture: no auto-follow of `rel=next` or "Next" links, no "clip all", no background
  or scheduled clipping, no prefetch. **Superseded on 2026-10-27 for P-CLIP2's explicit modes**
  ("Clip & next", "Clip the next N chapters"; `docs/clipping/p-clip2.md` §4a policies); still true for plain Clip. **Zero** extra network requests per clip: FicShelf reads only
  what the page already rendered.
- Never handle a site's access tickets or tokens outside its own page: don't read `__NUXT_DATA__`,
  cookies, `localStorage` or network responses; don't call the site's APIs; don't replay URLs found
  in the page.
- Store text only: all images dropped, links unwrapped (no signed CloudFront URLs or tokenised links
  stored); stored URLs pass `cleanClipUrl`; never keep the original page (`keepOriginal: false`).
- Same rules as imports: `importSanitizeOptions`, reader `about:blank` + `LOCAL_CSP`, size caps,
  `Stepper` pauses between chapters.
- One-time notice before the first clip (`sources.local.clipNoticeSeen`): "Clip saves a private copy
  of what this page shows you, on this phone only. Some sites' terms don't allow copying; it's your
  call. FicShelf never shares it and never clips by itself."
- No Clip on FFN, AO3 or Wattpad hosts; use the native source.
- Cookie messages only from fanfiction.net; `loginPrefillScript` only in `ffn` mode.
- External deep links to `/web` with a non-FFN host go through `/open`, which shows the host and asks.

### tests
- [x] CLIP-T1 `tests/clip-parse.test.ts` (4a653e7) (synthetic rendered pages): nav / sidebar / comments /
      footer around a chapter → one chapter, chrome gone; `data-fs-hidden` decoys removed; a fake
      `<script id="__NUXT_DATA__">` with a fake `_t` token plus a form with a value → none of those
      strings in any chapter html, the title or summary; `<img src="https://cdn.example/x.jpg?Signature=...">`
      and `<a href="...?token=...">` → no `<img>`, no `href` with a query; title "Site - Story -
      Chapter 3" cleaned; empty / loading page → `ImportError` code `empty` with the message; 3
      chapter headings → 3 chapters; a 2 MB page parses with stalls under 1 s (calibrate for jest,
      about 3x slower than tsx: < 1500 ms stall).
- [x] CLIP-T2 `tests/clip-url.test.ts` (4a653e7): `cleanClipUrl` strips `_t`, `token`, `Signature`,
      `Key-Pair-Id`, `Policy`, `Expires` and fragments, keeps `?chapter=3`, lower-cases the host;
      `isNativeHost` covers `www.fanfiction.net`, `m.fanfiction.net`, `fictionpress.com`,
      `archiveofourown.org`, `ao3.org`, `www.wattpad.com`, `m.wattpad.com`.
- [x] CLIP-T3 `tests/web-policy.test.ts` (03e4a59): `ffn` mode equals today's allowlist decisions; `open` mode
      allows https, blocks http with a message, blocks `javascript:` / `data:` / `blob:` / `file:`,
      `mailto:` → `ask`; FFN / AO3 links → `native`; non-top frames allowed; `acceptsCookieMessage`
      true only for fanfiction.net.
- [x] CLIP-T4 `tests/clip-script.test.ts` (4a653e7) (`/** @jest-environment jsdom */`; `jest-environment-jsdom`
      and jsdom 20.0.3 are in node_modules): `eval(clipScript(nonce, max))` on a jsdom document with a
      stub `ReactNativeWebView` posts one message with the nonce, `location.href` and html; no
      script / style / form; drops `display:none`, `visibility:hidden`, `opacity:0`; keeps children
      of `display:contents`; no `data-fs-hidden` left in the live DOM; `too-large` over max. jsdom
      has no `checkVisibility`, so the script must fall back to `getComputedStyle`. Use fake timers
      or a short quiet period for the 700 ms / 4 s waits.
- [x] CLIP-T5 `tests/clip-commit.test.ts` (4484f56) (`memoryKv` + `fakeFs`): `commitClip` makes a `local:`
      story (`kind:'html'`, `generator:'clip'`, `clip.site`, `lastUrl`, `urls`, no original file);
      `appendClip` adds chapter n+1 (text, title, words, `chapterTitles`, `downloadedChapters`,
      `knownChapters`, `lastUrl`) and leaves progress and bookmarks alone; duplicate URL detected;
      `undoLastClip` removes the row, moves a bookmark in chapter n to n-1, pops the URL;
      `normalizeLocal` keeps a valid `clip` and drops `http:` URLs, more than 5000 urls and bad
      hosts; Replace (file import) keeps `clip`; clipped stories stay out of `exportBackup()`.
- [x] CLIP-T6 `tests/clip-screen.test.tsx` (0e93bdd) (mock `react-native-webview` as the existing screen tests
      do): Clip injects once; wrong nonce or host ignored; preview saves; `clipFor` target is the default.
- [x] CLIP-T7 Regression: existing `tests/webview-config.test.ts`, `tests/import-*.test.ts`,
      `tests/local-*.test.ts`, `tests/backup.test.ts` and the corpus still pass unchanged. Only `tests/open-link.test.ts`
      changed on purpose: `https://example.com/whatever` now gets the browser offer instead of "not a link".
- [x] CLIP-T8 (optional) `scripts/clip-check.ts`: run the capture script in headless Chromium
      (`scripts/browser.ts`, playwright-core) on a local synthetic page, as the reader CSP check was done. 28/28 (7546679). It found no app bug; the
      harness itself needed care: Playwright's `setContent` doesn't run `addInitScript`, and tsx adds a `__name`
      helper to functions passed to `page.evaluate` (pass strings).

### acceptance (on the phone)
- [ ] CLIP-A1 Library → **+** → **Clip from a web page**, paste `https://global.novelpia.com/viewer/833813`:
      the page opens in FicShelf's browser and the host shows.
- [ ] CLIP-A2 With the chapter text visible, tap **Clip**: the notice shows once; the preview shows
      title, chapter title and words; Save → the story is under **Imported**.
- [ ] CLIP-A3 Airplane mode: the chapter reads, and the audiobook plays it with Piper Lessac.
- [ ] CLIP-A4 Online: tap the site's **Next**, then **Clip**: the sheet defaults to "Add as chapter 2
      of <story>"; saved; the story page shows 2 chapters.
- [ ] CLIP-A5 Story page → **Clip next chapter** opens at the last URL; **Remove last chapter** undoes a wrong clip.
- [ ] CLIP-A6 Clipping the same page again warns.
- [ ] CLIP-A7 A fanfiction.net or archiveofourown.org page in open mode offers **Open in FicShelf**, not Clip.
- [ ] CLIP-A8 An `http://` link explains and offers Safari.
- [ ] CLIP-A9 Regression: FFN login in the in-app browser, Doc Manager and forum reply pages behave as before.

### install_notes
No prebuild: the WebView and Readability are already in the app and https needs no Info.plist
change. Send template T1 (`docs/user_and_install.md` §2.4): `cd ~/ficshelf`, `git pull --autostash`,
`npm install`, `xed ios`, check Personal Team and Release, Cmd+R, don't delete the app. No
storage-shape change for existing data (a new optional field), so a backup is advisable but not
required. If OQ-CLIP-1 (http pages) is ever turned on, it becomes T2 (prebuild).

### risks
- Text the DOM capture can't see (shadow DOM, canvas, images, cross-origin iframes): result is the
  empty-page error; the message should say this site can't be clipped.
- Partial chapters on lazy / paged readers that load text on scroll: tell the user to scroll to the
  end first.
- Decoys off-screen or at `font-size:0` aren't caught (stray sentences); `checkVisibility`
  mis-marking could drop real text (the `display:contents` exception and tests cover the known case).
- `getComputedStyle` on every element of a huge page is slow: skip marked subtrees; consider a cap
  (e.g. 50,000 elements) with a fallback of no marking plus a warning.
- Site login in the embedded browser: Google and other OAuth providers often refuse embedded
  WebViews ("disallowed_useragent"); use email and password. The default UA may get a mobile layout
  (fine for reader mode).
- Message size: a 10M-char page becomes a ~10–20 MB JSON string across the bridge and in Hermes;
  if slow on device, lower `MAX_CLIP_CHARS` (e.g. 5M).
- Site terms: some forbid copying. Mitigation: one-time notice, private on-device copies, one tap per chapter.
- Not in backups (like imports): lost if the app is deleted; P-IMPORT-X `.ficshelf` backup would fix it.

### open_questions (recommended defaults)
| id | question | default |
|---|---|---|
| OQ-CLIP-1 | Allow `http://` pages? | **No** (no rebuild). Allowing needs `NSAppTransportSecurity.NSAllowsArbitraryLoadsInWebContent: true` in `app.json` + prebuild |
| OQ-CLIP-2 | Keep pictures? | **No**, text only (no signed URLs stored). Later: same-origin images the page already loaded, as `data:` URIs |
| OQ-CLIP-3 | A page with several chapter headings? | Keep the chapters the cleanup finds and show the count, with a "Keep as one chapter" switch |
| OQ-CLIP-4 | User agent for other sites? | The WebView's own mobile UA; "Request desktop site" later |
| OQ-CLIP-5 | Clip on FFN / AO3 / Wattpad pages? | **Refuse** and open natively |
| OQ-CLIP-6 | Clip notice? | Once, globally |
| OQ-CLIP-7 | Keep the original page? | **Never** |
| OQ-CLIP-8 | Build the Shortcut / bookmarklet help? | Yes if time allows (no rebuild, no App ID) |
| OQ-CLIP-9 | `sharedCookiesEnabled` in open mode? | Omit it (nothing native fetches those sites); verify on the phone that a site login survives an app restart (WKWebView's default data store should keep it) |

Built on 2026-10-27 with every default above (no question needed asking). Still to confirm on the phone: OQ-CLIP-9
(a site login surviving an app restart) and CLIP-A1..A9.
