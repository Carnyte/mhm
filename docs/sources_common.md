# Sources: the Source contract, rules for every site, adding a site

> Read before touching src/sources/, src/net/ (HTTP client, policies), the sanitizer, or adding a site.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 5.3 The `Source` contract

```ts
interface Source {
  readonly id: SourceId; readonly name: string; readonly short: string;   // "FFN", "AO3", "File"
  readonly transport: 'bridge' | 'http' | 'local';
  readonly caps: SourceCaps; // {browse, search, download, updates, login, follow, endorse, discuss: 'none'|'read'|'write', accountSync, groups?}
  readonly reader: { baseUrl: string; csp?: string };
  readonly comingSoon?: boolean;
  readonly stableText?: boolean;   // AO3: saved chapter copies are reused (usableSavedChapter)
  enabled(): boolean;
  parseLink(input: string): LinkHit | null;
  resolvePart?(partId, o?): Promise<LinkHit>;
  webUrl(remoteId, ch?: ChapterInfo): string;
  getStory(remoteId, o?): Promise<StoryInfo>;
  getChapter(remoteId, ch: ChapterInfo, o?): Promise<ChapterContent>;
  downloadAll?(remoteId, onChapter, o?: DownloadOpts): Promise<StoryInfo>;
  checkUpdates?(stories: LibraryStory[], o?: UpdateCheckOpts): Promise<UpdateResult[]>;
  search?(q, page, o?): Promise<{ items: StoryMeta[]; lastPage: number; total?: string }>;
  session?: SourceSession;   // {get(), subscribe, signInRoute, logout, syncLibrary?}
}
```

| id | transport | caps | reader | notes |
|---|---|---|---|---|
| ffn | bridge | all true, `discuss:'write'`, `groups:true` | `https://www.fanfiction.net/` | no `checkUpdates` / `downloadAll` / `search` on the adapter (FFN screens call `src/ffn/api`) |
| ao3 | http | browse / search / download / updates true; login / follow / endorse false; `discuss:'none'` | `https://archiveofourown.org/` | `stableText`, `resolvePart`, `downloadAll`, `checkUpdates`, `search` |
| wp | http | `NO_CAPS` | `https://www.wattpad.com/` | `comingSoon`; `getStory` / `getChapter` throw `ComingSoonError` |
| local | local | all false | `about:blank` + `LOCAL_CSP` | `enabled()` always true; `webUrl` = file's `sourceUrl` or `''` |

Registry: the table is built lazily in `sources()` (adapters import modules that import the
registry back); `enabledSources()` excludes `transport === 'local'`; `LINK_ORDER = ['ao3','wp','local','ffn']`
(FFN last: it takes bare numbers and relative paths); `resolveLink(input, base?)` → `LinkHit`,
`{kind:'disabled', source}`, or `null` (unknown host); `absoluteLink(href, base)` (`//host` → https;
relative links resolve against the page's site, base used only when http(s)); `isBareStoryNumber`
true only when AO3 is on (screens then ask "FanFiction.net or AO3?").

Slots (`ui.ts`): `SourceUi {words {unit, follow, endorse?, discuss?}, statCells, statLine, storyActions → {endorse?, follow?, discuss?, menu}, chapterActions, readerActions → {menu, end: EndAction[]}, cardActions, authorRoute, webRoute, fandomRoute, tagGroups?, tagRoute?, warningLine?, ratingBadge?, seriesRoute?}`;
`basicUi` fallback (wp). Shared screens never branch on the site, except Browse home, Search form and Settings → Sources rows.

---

## 6. Sources and per-site policies

---

### 6.1 Across sites

**Polite HTTP client** (`src/net/httpCore.ts`): `HttpClient({transport, userAgent?, policies?, now?})`;
`text(url, opts)` → `HttpResponse {status, url (final), headers (lower-case), text}` (HTTP errors
resolve; look at `status`). One queue per host, **one request in flight per host**, a gap after each
request by priority; `user` jobs go ahead of queued `background` jobs. **429, or 503 with
Retry-After** → cooldown `max(Retry-After, cooldownMs × 2^(strikes-1))`, capped at 30 min; that request
and everything queued reject with `RateLimitedError(host, retryAt, site)`. **Other 5xx** resolve but
the host rests `errorCooldownMs` (10 s doubling, cap 5 min; `ServerBusyError`). GET retried once on
network failure (front of queue); **POST never**. Timeouts `HttpTimeoutError`; aborts `AbortError` /
`isAbortError`; connection failure `NetworkError(url, site, reason)`. `direct: true` hosts skip the queue. `hostOf`, `parseRetryAfter`, `fetchTransport(fetch)`.

| host | user gap | background gap | timeout | cooldown | notes |
|---|---|---|---|---|---|
| archiveofourown.org | 1.5 s | 5 s | 45 s | 60 s | |
| download.archiveofourown.org | 1.5 s | 1.5 s | 60 s | 60 s | |
| www.wattpad.com, api.wattpad.com | 1 s | 3 s | 20 s | 60 s | |
| img.wattpad.com | | | | | direct |
| fichub.net | 1 s | 3 s | 60 s | 60 s | UA `FicShelf/1.0 (personal reader app; +https://github.com/Carnyte/mhm)` |
| default | 1 s | 3 s | 30 s | 30 s | |

**Rules for all sites**: requests only follow a user action (except update checks of followed
stories); no crawling, no prefetching listings, no background bulk downloads; "Open on <site>" one tap
away; no site logos; never handle a site's access tickets or tokens outside its own page.

**Sanitizer** (`src/html/sanitize.ts` `sanitizeHtml(html, opts)` / `sanitizeChildren`): allowlist tree
walk. `DROP` removes elements with content (script, style, iframe, object, embed, svg, math, form
controls, media, base, link, meta, head, template, dialog …); unknown tags unwrapped (text kept);
`ALLOWED` tags + attributes; global attrs title, lang, dir, id, class, style; style properties from
`STYLE_PROPS` (`styles:'safe'|'none'`); link schemes http, https, mailto; `cite` http, https; `data:`
only for png / gif / jpeg / webp images; `MAX_DEPTH = 120`. **Reserved ids** `wrap, text, end, next,
mark, review` and **reserved classes** `hd, story, end, alt, tts, find, cur, paged, fs-notes` stripped.
Options `keepAttrs`, `image(src) → src|null` (`ficshelf-img:<n>` kept, `IMAGE_REF`), `relativeUrls:'keep'|'drop'`,
`classes:'keep'|'none'`. Used by AO3 (`userstuffHtml`) and imports (`importSanitizeOptions`). **FFN still uses its regex `sanitizeHtml`** (`src/ffn/parsers/dom.ts`). `audio/segments.ts` also drops raw-text tags before re-serializing.

---

### 6.6 How to add a new Source (checklist; Wattpad `wp` is the next one)
`wp` already exists in `SOURCE_IDS`, `SOURCE_NAMES`, `REMOTE_ID`, the theme, `SourceChips.LABELS`,
`DEFAULT_SOURCES`, `POLICIES`, `blocks.ts`, `http.web.ts` and `dev-proxy.ts`: for Wattpad skip steps
1–3 and replace the `comingSoon()` stub. `Record<SourceId, …>` tables make `tsc` flag most places you miss.
1. `src/sources/keys.ts`: id in `SOURCE_IDS`, name in `SOURCE_NAMES`, id regex in `REMOTE_ID`; cases in `tests/keys.test.ts`.
2. Required tables: `src/theme/index.ts` `source` colours in `LIGHT` and `DARK` (4.5:1 contrast);
   `src/components/SourceChips.tsx` `LABELS`; `src/state/settings.ts` `DEFAULT_SOURCES` (off until ready);
   `src/sources/ui.ts` `UIS`; the `sources()` table in `src/sources/registry.ts`.
3. Network: `POLICIES` per host (`direct:true` for image CDNs); an `isXBlock` / `detectXBlock` pair in
   `src/net/blocks.ts` (`SourceBlockedError(source, url)`); `src/net/http.web.ts` `PROXIED` and
   `scripts/dev-proxy.ts` `HTTP_HOSTS` if no CORS; `src/net/images.ts` only if images need special loading.
4. Site folder `src/sources/<id>/`: `urls.ts` (builders, `parse<X>Link → LinkHit | null`, `kind:'part'`
   when a chapter link names no story); `api.ts` (every request via `httpText(url, {priority, signal, …})`
   with block detection; typed errors with user messages; `httpCache` for big rarely-changing pages);
   `parsers/*.ts` on `src/html/dom.ts` (shown text through `src/html/sanitize.ts`, never FFN's regex
   sanitizer); `map.ts` (`chapterList[].remoteId`, `version` stamp, per-site bag, `notesBefore` /
   `notesAfter`); `adapter.ts` (`Source` object; `enabled: () => settingsStore.get().sources?.<id>?.enabled …`;
   prefer a batched `checkUpdates` honouring `deadline`, `signal`, `onResults`, stopping early on
   trouble, returning `gone`, `restricted`, `chapterIds`, `redownload`; carry `chapterIds` on a "chapter
   gone" error; mark locked parts `ChapterInfo.locked`: never fetched, saved or spoken); `ui.ts` (`SourceUi`).
   Without `checkUpdates`, `features/updates.ts` falls back to 2 per-story workers.
5. Registry: swap in the adapter; id in `LINK_ORDER` **before `'ffn'`**; decide whether bare numbers
   (`isBareStoryNumber`, `src/app/open.tsx`, `search.tsx`) should offer it.
6. Model bags: add to `StoryMeta` / `StoryInfo` (`types.ts`) and `LibraryStory`; **merge in `upsertStory`**;
   map in `src/sources/meta.ts` (`libraryMetaFromMeta` / `infoFromLibrary`). No migration needed
   (`normalizeStory` keeps unknown fields); bump `SETTINGS_VERSION` only if a default must change.
7. Settings and screens: a Row + `Switch` + `updateSource('<id>', …)` in `src/app/settings.tsx`; extra
   `SourceSettings`; Browse home branch `src/app/(tabs)/index.tsx`, Search branch `search.tsx`
   (`useSourcesWith`); site screens `src/app/<id>/…` with titles in `_layout.tsx`; `ErrorView` mapping
   in `src/components/states.tsx`; adult gate if needed; a `WhatsNewSheet` card (bump `WHATS_NEW_VERSION`).
8. Imports: `src/import/detect.ts` `detectOrigin` / `originUrl`; keep `ImportOrigin.source`
   (`import/types.ts`) and `normalizeLocal`'s origin check in step; `linkChoice` if files should link.
9. Login (optional): `session: SourceSession`; login on the site's own page in a visible WebView with
   `sharedCookiesEnabled`; the app never stores a password; `autoDownload` already avoids background
   downloads while logged in.
10. `check-keys`: site code uses string ids; no exception should be needed.
11. Tests: `tests/<id>-urls.test.ts`; parser tests on **synthetic** fixtures in `tests/fixtures/<id>/`;
    a fake transport like `tests/helpers/fakeAo3.ts`; adapter, download, update tests (request counts,
    priorities, budgets); `tests/registry.test.ts`, library, remap, player, adult-gate cases.
12. Live check and docs: `scripts/live-check.ts --source <id>` (few requests, spaced, structure only),
    README (layout, verification, count), INSTALL if native changes, `app.json` `description`.

---

### 10.7 Across sites (source layer review, `2ae4a2a`)

| What happened | Rule |
|---|---|
| `safeUrl` checked the scheme on `visible(value)` but returned `value.trim()`; `trim()` strips U+FEFF / U+00A0 / U+2028 / U+3000, so `﻿javascript:` got through (high) | Validate exactly the string you return |
| `ALLOWED[el.name]` on a plain object accepted `<constructor>` | Lookups on untrusted names use `Object.create(null)` maps or `hasOwn` |
| FFN's "challenge-platform" check flags *every* AO3 page (passive `jsd` script); `CF_TITLE` matched an AO3 work titled "Just a moment" | Per-site block detectors; Cloudflare's exact titles (`Just a moment...`, `Attention Required! \| Cloudflare`), `cf-mitigated: challenge`, `cf_chl_opt`; Wattpad: CloudFront 403, `x-amzn-waf-action`, HTML where JSON expected |
| Relative chapter links resolved as FFN links; `//host/…` lost its host; FFN's `parseLink` claimed anything starting with `/` | Resolve against the story's own base (`resolveLink(input, base)`, `absoluteLink`), base only when http(s) (`absoluteLink('#n1','about:blank')` returned `about:blank#n1`) |
| On web, `credentials:'include'` against Wattpad's `Access-Control-Allow-Origin: *` fails | `http.web.ts` fetches Wattpad without credentials |
| The client cooled down only on 429 / 503 + Retry-After | Rest a host after **any** 5xx (`ServerBusyError`); GET retried once, POST never |
