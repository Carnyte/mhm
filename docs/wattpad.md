# Wattpad: research, lessons, and the planned phases P4 (reading) and P7 (account)

> On hold until the user says clipping is perfect. Read before any Wattpad work.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 6.5 Wattpad (planned; research only)
Only `src/sources/wattpad/urls.ts` exists. Terms say "Don't scrape Wattpad" (crawl / spider / remove
content), no bypassing security, no reverse engineering, personal non-commercial use only; no public
API. Blocking is CloudFront + AWS WAF (no Cloudflare); an **empty User-Agent gets a CloudFront 403**.
Errors are HTTP 400 JSON (`1017 NotFound`, `1018 PermissionDenied`). Paid parts must be checked via
`/v5/story/{id}/paid-content/metadata` and **fail closed**. Anonymous search seems to leave out mature
stories. The full API reference and plan are in §5 (P4) and §7 (P7).

---

### 10.10 Wattpad (research)
- Terms forbid scraping; no public API; the user accepted the personal-use risk in principle (OQ-1
  still formally open). → User-triggered only, auto-download off, kill switch, no native password login.
- Paid parts: `text_url` is handed out even for blocked parts. → Check `paid-content/metadata`; **fail closed**; never fetch, cache, download or speak a locked part.
- An empty UA gets a CloudFront 403. → Always send a UA.
- Anonymous search seems to omit mature stories. → Don't work around it.

---

## 5. P4: Wattpad reading loop (no login)

```yaml
id: P4
title: Wattpad reading, no login
status: on hold (until the user says clipping is perfect; 2026-10-27)
order: 2
depends_on: [P1 keys/storage v2, P2 source layer, P3 AO3 patterns]   # all done
native_rebuild: no
approved_by_user:
  date: 2026-10-08
  quote: "it will also feature wattpad and ao3"
  order_decision: "2026-10-08: AO3 first, reading before login, import before Wattpad; 2026-10-21: Clip before Wattpad"
gate: Wattpad terms posture (OQ-1). Default accept, as designed
```

### why
The user asked for Wattpad on 2026-10-08. Wattpad links are recognised today but say "Wattpad
support is coming soon" (`src/sources/registry.ts`).

### scope

Already in the repo:
- `src/sources/wattpad/urls.ts`: `WP_ORIGIN`, `storyUrl`, `partUrl`, `parseWattpadUrl` (story / part
  with page / user / list / other), `parseWattpadLink` (story → `story` hit, part → `part` hit);
  tested in `tests/wattpad-urls.test.ts` (20 tests).
- Registry: `wp` is `comingSoon('wp', {short:'Wattpad', transport:'http', reader:{baseUrl:'https://www.wattpad.com/'}, …})`;
  `getStory` / `getChapter` throw `ComingSoonError`.
- Keys: `wp` remote id `/^\d{1,15}$/`; `SOURCE_NAMES.wp = 'Wattpad'`.
- Types (`src/sources/types.ts`): `ChapterInfo.locked?: {price?: number}` (unused yet),
  `StoryMeta.paywalled`, `StoryMeta.mature`, `StoryInfo.wp?: {lastPublishedPartId?, modifyDate?}`,
  `LinkHit` kind `'part'`, `Source.resolvePart?`, `StoryStats.reads / votes / comments`.
- HTTP `POLICIES`: `www.wattpad.com` and `api.wattpad.com` `{gapUserMs 1000, gapBackgroundMs 3000, timeoutMs 20000, cooldownMs 60000}`;
  `img.wattpad.com` `direct: true`.
- Blocks: `src/net/blocks.ts` `isWpBlock(r, {expectJson})` / `detectWpBlock` → `SourceBlockedError('wp')`
  on `x-amzn-waf-action`, a 403 with `server: CloudFront` or "could not be satisfied", or HTML where JSON was expected.
- Settings: `DEFAULT_SOURCES.wp = {enabled: false}`; `src/app/settings.tsx:160` Row "Wattpad — Coming soon".
- Theme `palette.source.wp` `#9A3412` (dark `#FF9A5C`); `src/sources/ui.ts` has `wp: basicUi`.
- Sanitizer supports `sanitizeHtml(html, {keepAttrs: ['data-p-id']})`.
- `src/net/http.ts` `httpText` sends the desktop Safari UA (Wattpad answered 200 to it; an empty UA got a CloudFront 403).
- `src/net/http.web.ts` fetches Wattpad directly with `credentials: 'omit'`; `scripts/dev-proxy.ts` forwards wattpad.com.

Checklist:
- [ ] WP-1 `src/sources/wattpad/api.ts`: `wpFetch(path, {expectJson, priority, signal})` via `httpText`;
      `detectWpBlock`; only `www.wattpad.com` (and `img.wattpad.com` for images); rewrite `nextUrl`
      hosts `api.wattpad.com` → `www.wattpad.com` (one queue); refuse foreign hosts. Errors:
      400 + `error_code 1017` → `WpNotFoundError`; 400 + `1018` → `WpLoginRequiredError` ("Log in to
      Wattpad to see this"; button in P7); 404 plain `404 page not found` → `WpApiChangedError`
      ("Wattpad changed something; FicShelf needs an update"); 429 → `RateLimitedError`; 5xx → `ServerBusyError`.
- [ ] WP-2 `src/sources/wattpad/constants.ts`: categories, `fields` strings, `LOCK_CHUNK = 25`,
      `WP_MIN_CHECK_MS = 24 h`.
- [ ] WP-3 `src/sources/wattpad/map.ts` (rules in data/API details).
- [ ] WP-4 `src/sources/wattpad/locks.ts`: `lockState(storyId, partIds)` and
      `assertReadable(storyId, partId)` failing closed; session cache, 10 min TTL.
- [ ] WP-5 `src/sources/wattpad/adapter.ts` `wattpadSource` replacing `comingSoon('wp')`:
      `transport:'http'`, reader `{baseUrl:'https://www.wattpad.com/'}`, caps
      `{browse:true, search:true, download:true, updates:true, login:false, follow:false, endorse:false, discuss:'none', accountSync:false}`,
      `enabled: () => settingsStore.get().sources.wp?.enabled === true`, `parseLink: parseWattpadLink`,
      `resolvePart` via `/api/v3/story_parts/{id}` `groupId`, `webUrl(id, ch)` → `partUrl(ch.remoteId)`
      or `storyUrl(id)`, `getStory`, `getChapter` (calls `assertReadable` first: the single choke
      point for reader, prefetch, downloads and player), `search`, `checkUpdates`; **no `downloadAll`**
      (generic per-chapter download, which skips locked parts). Put `wp` before `ffn` in `LINK_ORDER` (it already is).
- [ ] WP-6 Text: `GET /apiv2/?m=storytext&id=<partId>` → `sanitizeHtml(text, {keepAttrs:['data-p-id']})`;
      drop images when `hasBannedImages`; empty body → `WpEmptyPartError` ("Wattpad sent an empty
      part"); store `x-text-hash` in `LibraryStory.wp.textHash[partId]`.
- [ ] WP-7 `src/sources/wattpad/ui.ts` `wattpadUi` (register `wp: wattpadUi` in `src/sources/ui.ts`):
      `words.unit 'part'` ("Part 3 of 23"); stat cells Parts, Words, Reading time, Reads, Votes,
      Comments, Updated, Published, Mature; chapter rows show 🔒 and price for locked parts; ⋯ menu
      Open on Wattpad, **Unlock on Wattpad** (external `partUrl`); end action "Next part is locked" card.
- [ ] WP-8 Screens: `src/components/wattpad/WpBrowseHome.tsx` (22 genre tiles in AO3's 3-column
      grid, a `#tag` field, pinned tags); `src/app/wp/list.tsx` (params `category | tag | list |
      filter=hot|new`; StoryCard rows; infinite list via `nextUrl` only as the user scrolls);
      `src/components/wattpad/WpSearchForm.tsx` (query, free / paid toggles, the mature note);
      `src/app/wp/user/[name].tsx` (user-stories endpoint unverified: fall back to
      `https://www.wattpad.com/user/<name>` in Safari); `src/components/wattpad/LockedPartSheet.tsx`;
      Browse / Search branches in `src/app/(tabs)/index.tsx` and `search.tsx` (`useSourcesWith`);
      titles in `src/app/_layout.tsx`.
- [ ] WP-9 Reader: opening a locked part shows `LockedPartSheet` / Empty state, never a fetch:
      "This part is paid on Wattpad (5 coins). FicShelf never downloads paid parts. Unlock it in the
      Wattpad app and read it there." + **Open on Wattpad**.
- [ ] WP-10 Downloads (`src/features/downloads.ts`): only on tap, after a one-time notice
      (`sources.wp.downloadNoticeSeen`): "Wattpad's terms allow personal use only. FicShelf keeps
      this copy on this phone only, never shares it, and never downloads paid parts." Locked and
      unknown parts skipped; result says "N paid parts skipped".
- [ ] WP-11 Audiobook (`src/audio/player.ts`): advancing skips locked parts (via
      `LibraryStory.wp.lockedPartIds` + `chapterIds`); stops at the end if only locked parts remain.
- [ ] WP-12 Updates `checkUpdates` (rules in data/API details); `SourceSettings.autoDownload?: boolean`
      and `autoDownload()` in `src/features/updates.ts` respects it per source (wp default `false`;
      others keep the global `autoDownloadUpdates`).
- [ ] WP-13 Kill switch: Settings → Sources → Wattpad **Enabled** switch (replacing "Coming soon"),
      "Include in update checks", "Auto-download updates (off)", the terms notice text. When off:
      chips and entry points hidden; links say `disabledMessage('wp')` ("Wattpad is switched off.
      Turn it on in Settings → Sources."); update checks skip it; library items read offline
      (`infoFromLibrary`, `chapterStore`) with no network.
- [ ] WP-14 Library state: `LibraryStory.wp?: {lastPublishedPartId?, modifyDate?, paywalled?, lockedPartIds?: string[], checkedAt?: number, textHash?: Record<string,string>}`;
      **merge the `wp` bag in `upsertStory`** like `ffn` / `ao3`; map it in `src/sources/meta.ts`
      `libraryMetaFromMeta` / `infoFromLibrary`. No storage migration (`normalizeStory` keeps unknown bags).
- [ ] WP-15 Errors in `src/components/states.tsx` `ErrorView` (Wp* classes; the `SourceBlockedError` source check).
- [ ] WP-16 What's new: a Wattpad card with the switch and the terms notice (bump `WHATS_NEW_VERSION`
      again: 3 if P-CLIP used 2).
- [ ] WP-17 `scripts/live-check.ts --source wp`, 4 requests 3 s apart: v3 story `6315313` with
      fields; `/v4/search/stories?query=test&limit=1&fields=total`; storytext of free part
      `20362460` (check `<p data-p-id` only; never print text); paid-content metadata for
      `9887497?parts=30025046`. Flag schema drift.
- [ ] WP-18 Docs: README Wattpad section, PLAN.md, `app.json` `description` ("…FanFiction.net,
      Archive of Our Own and Wattpad…"; description only, no native change), `src/app/open.tsx` wording.
- [ ] WP-19 Import: Wattpad files keep importing as local stories; leave `linkChoice` off for `wp`
      unless the user asks (open question).

### files

| action | path |
|---|---|
| new | `src/sources/wattpad/{api,constants,map,locks,adapter,ui}.ts` |
| keep / extend | `src/sources/wattpad/urls.ts` (add `listUrl`, `userUrl`, `coverAt(url, width)`) |
| new | `src/app/wp/list.tsx`, `src/app/wp/user/[name].tsx` |
| new | `src/components/wattpad/WpBrowseHome.tsx`, `WpSearchForm.tsx`, `LockedPartSheet.tsx` |
| change | `src/sources/registry.ts`, `src/sources/ui.ts`, `src/sources/meta.ts`, `src/state/settings.ts`, `src/state/library.ts`, `src/features/downloads.ts`, `src/features/updates.ts`, `src/audio/player.ts`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/search.tsx`, `src/app/settings.tsx`, `src/app/_layout.tsx`, `src/components/states.tsx`, `src/components/WhatsNewSheet.tsx`, `src/app/open.tsx`, `scripts/live-check.ts`, `app.json` (description only), `README.md`, `PLAN.md` |
| tests | `tests/helpers/fakeWp.ts` (like `tests/helpers/fakeAo3.ts`: routes + request log with priority), `tests/fixtures/wp/*.json`, `tests/fixtures/wp/storytext.html` |

### data / API details
All on `https://www.wattpad.com` (`api.wattpad.com` is the same backend). JSON, weak ETag,
`cache-control: no-cache`, `access-control-allow-origin: *`; no cookies or key for public content.
`fields=` is a projection (comma-separated, nested with parentheses, e.g. `parts(id,title)`);
**unknown fields are silently ignored**. Lists return `{<items>, total, nextUrl}`; follow `nextUrl`
until absent, only on a `www|api.wattpad.com` host, only as the user scrolls.

| what | request | notes |
|---|---|---|
| search | `GET /v4/search/stories?query=<q>&mature=false&free=1&paid=1&limit=20&offset=N&fields=stories(id,title,user(name,avatar),cover,description,mature,completed,numParts,readCount,voteCount,tags,isPaywalled,paidModel,length,lastPublishedPart,url,language),total,nextUrl` | `{total, stories:[{id:"6315313" (string), title, description, user:{name}, completed, numParts, lastPublishedPart:{createDate:"YYYY-MM-DD HH:MM:SS"}, voteCount, readCount, cover, mature, url, tags[], isPaywalled, paidModel: null or "paid_story", length (chars), language:{id,name}}], nextUrl}`. No `user.avatar` or `firstPublishedPart`. Dates have **no time zone** and can disagree with v3: never use search data for update detection. Logged out, `mature=true/false` didn't change totals (mature stories seem left out): show "Mature stories may be missing until you log in"; no workarounds |
| story + all parts | `GET /api/v3/stories/{id}?fields=id,title,length,createDate,modifyDate,voteCount,readCount,commentCount,language,user(name,username,avatar,fullname),description,cover,completed,categories,tags,rating,mature,copyright,url,numParts,isPaywalled,paidModel,firstPublishedPart,lastPublishedPart,tagRankings,deleted,parts(id,title,url,length,wordCount,createDate,modifyDate,draft,deleted,rating,text_url,hasBannedImages,commentCount,voteCount,readCount)` | ISO dates with `Z`; story `id` string, part `id` integer; `categories: [6, 0]` (0 = none); `first/lastPublishedPart: {id:int, createDate}`; `isPaywalled` / `paidModel` appear **only when listed in fields**; all parts in one response (200 parts ≈ 95 KB raw / 18 KB gzip); `/api/v3/stories/{id}/parts` is a 404; part `text_url: {text:"https://www.wattpad.com/apiv2/?m=storytext&id=<id>&page=", refresh_token:""}`; v3 never returns lock state |
| part metadata | `GET /v4/parts/{partId}?fields=id,title,url,text_url,wordCount,length,createDate,modifyDate,pages,group(id,title,isPaywalled,paidModel,mature,user(username))` | `{…, pages:7, group:{id:"<storyId>", …}}` |
| part → story | `GET /api/v3/story_parts/{partId}?fields=id,title,groupId,wordCount` | `{…, groupId:"<storyId>"}`; use for `resolvePart` |
| text | `GET /apiv2/?m=storytext&id={partId}` (no `page`) | the whole part; `text/plain; charset=UTF-8` but the body is HTML: `<p data-p-id="<32 hex>">…</p>` runs (about 37.7 KB per 5.6k words); header `x-text-hash` (probable content hash; store per part); `&page=N` (1-based, ~20 paragraphs; past the end 200 + empty) is a fallback only; inline images on `img.wattpad.com`; robots.txt disallows `/apiv2/*` for crawlers: user-initiated only |
| paid parts (authoritative) | `GET /v5/story/{id}/paid-content/metadata?parts=<id1>,<id2>,…` | `{story:{id, price:[{id:"wp2",amount:1},{id:"wp1",amount:76}], has_full_access:false}, parts:[{id:"30025046", price:[], paywalled:false, has_access:true}, {id:"30420187", price:[{id:"wp2",amount:0},{id:"wp1",amount:5}], paywalled:true, has_access:false, paid_model:"paid_story"}]}`; site rule `isBlocked = paywalled && !has_access`; `isBonusPart = paid_model === 'paid_bonus'`; `wp1` presumably coins; **`text_url` is handed out for blocked parts too: never treat it as permission**; batch limit unverified: chunk at 25 |
| categories | `GET /api/v3/categories` | 22 items `{id, name, name_english, roles}`; cache 7 days in `http_cache`: 4 Romance, 5 Science Fiction, 3 Fantasy, 7 Humor, 12 Paranormal, 8 Mystery/Thriller, 9 Horror, 11 Adventure, 23 Historical Fiction, 1 Teen Fiction, 6 Fanfiction, 2 Poetry, 17 Short Story, 21 General Fiction, 24 ChickLit, 14 Action, 18 Vampire, 22 Werewolf, 13 Spiritual, 16 Non-Fiction, 10 Classics, 19 Random |
| hot / new | `GET /api/v3/stories?filter=hot\|new&category={id}&limit=20&offset=N&fields=stories(id,title,user(name),cover,description,mature,completed,numParts,readCount,voteCount,isPaywalled,paidModel,url),nextUrl,total` | total 1500 for hot/6 |
| tag hot list | `GET /v5/hotlist?tags=<tag>&language=1&offset=N&limit=20` | `{stories:[{user{name,avatar,fullname}, id, title, cover, description, mature, completed, voteCount, readCount, categories, url, numParts, firstPartId, tags, isPaywalled, paidModel}], total, nextUrl (api.wattpad.com)}` |
| reading lists | `GET /api/v3/users/{username}/lists?limit=&fields=lists(id,name,numStories,cover),nextUrl,total`; `GET /api/v3/lists/{listId}/stories?limit=&offset=&fields=stories(...),nextUrl,total` | public lists |
| untested (seen in site JS) | `/v5/discover/tags?tags=`, `/v5/browse/topics`, `/api/v3/autocomplete/tag?term=`, `/v4/autocomplete/query?term=` | verify before use |

Errors: story not found = HTTP 400 `{"error_code":1017,"error_type":"NotFound","message":"Story not found","fields":["story_id"]}`;
needs login = HTTP 400 `{"error_code":1018,"error_type":"PermissionDenied","message":"User not logged in"}`
(seen on `/api/v3/users/{u}/library`); unknown route = 404 plain text `404 page not found`;
CloudFront block = 403 with `server: CloudFront`, `x-cache: Error from cloudfront`, HTML "403 ERROR
The request could not be satisfied. Request blocked."; possible under load: HTTP 202/405 with
`x-amzn-waf-action: challenge` and an `aws-waf-token` cookie. About 50 requests 3–5 s apart produced no 429.

Images: covers `https://img.wattpad.com/cover/{storyId}-{width}-k{hash}.jpg` (width swappable:
128/256/512 all 200; rewrite `/-(\d+)-k/` → `-256-k` in lists, `-512-k` on detail); avatars
`https://img.wattpad.com/useravatar/{username}.{size}.{hash}.jpg`; list covers
`https://img.wattpad.com/ccover/{listId}-300-{n}.png?v=2`. Public, `max-age=31536000`, CORS `*`,
no referer check: load directly.

HTML fallbacks (only if JSON breaks): story page `/story/{id}-{slug}` is Remix:
`window.__remixContext.state.loaderData["routes/story.$storyid"].story`; pure JSON
`GET /story/{id}?_data=routes%2Fstory.%24storyid` (header `x-remix-response: yes`), whose parts carry
`isBlocked, paywalled, priceMetadata{id,amount}, isBonusPart, bonusTypeName, isNew`; `root.currentUser`
null when logged out. Reader page `/{partId}-{slug}` is legacy Backbone
(`window.prefetched["part.<id>.metadata"].data`, ~320 KB; avoid). If Remix single fetch is enabled,
`?_data=` becomes `.data` URLs.

Map rules (`map.ts`): key `wp:<storyId>`; author `{source:'wp', id: user.username ?? user.name, name: user.name, avatarUrl}`;
`summary` = `description` (plain text); `coverUrl` at -256, `coverLargeUrl` at -512; `genres` = category
names (non-zero ids, cached categories); `tags` → `Tag{kind:'freeform'}`; `language` = `language.name`;
`mature`; `stats {reads: readCount, votes: voteCount, comments: commentCount}`; `complete` = `completed`;
`paywalled` = `isPaywalled === true || paidModel === 'paid_story'`; `chapters` = parts not `draft` and
not `deleted`; `words` = **sum of `parts[].wordCount`** (`length` is characters; listings without parts
show "N parts" and no words); `published` = `firstPublishedPart.createDate ?? createDate`; `updated` =
`lastPublishedPart.createDate ?? modifyDate`; `wp: {lastPublishedPartId: String(lastPublishedPart.id), modifyDate}`;
`chapterList[i] = {number: i+1, title, remoteId: String(part.id), published, words: wordCount, locked?}`.
Parse search dates "YYYY-MM-DD HH:MM:SS" as UTC (assumption). Never trust number vs string id types.

Locks (`locks.ts`), failing closed: when the story isn't paywalled (`isPaywalled === false`
explicitly **and** `paidModel` empty), every part is free and no request is made. Otherwise fetch
paid-content metadata in chunks of 25; a part is `free` when `paywalled === false` or
`has_access === true`, `locked {price: wp1 amount}` when `paywalled && !has_access`; `unknown`
(missing part, failed request, `isPaywalled` absent) is **treated as locked**. `assertReadable`
re-checks (cached) and throws `WpLockedError(partId, price?)` **before any storytext URL is built**.

Updates (`checkUpdates`): one `GET /api/v3/stories/{id}?fields=id,numParts,modifyDate,lastPublishedPart,deleted,isPaywalled,paidModel,parts(id,title,wordCount,createDate,modifyDate,draft,deleted)`
per story, **in series**, background gap 3 s, **at most daily per story** (skip when `wp.checkedAt`
is under 24 h old); honour `deadline`, `signal`, `onResults`, stop on first trouble. `changed` =
non-draft part count grew (or `lastPublishedPart.id` is new); `chapterIds` = part ids (so
`remapChapters` moves progress, downloads, bookmarks, listen positions); `redownload` when a
downloaded part's `modifyDate` is newer; `deleted:true` or 1017 → `gone: true`. A story turning
paywalled re-checks locks and **deletes saved text of parts now locked**
(`chapterStore.renumber(key, new Map([[n, null]]))` per part, ordered so other rows keep their
numbers); tell the user once.

### policies
User-initiated requests only; 1 in flight, ≥1 s apart (≥3 s background); auto-download off;
story-level update checks at most daily; kill switch; offline copies private and deleted with the
story; no purchases or coins in the app; no age or mature workarounds; no native `/api/v3/sessions`
password login; paid or unknown-lock parts never fetched, cached, downloaded or spoken; always send
a UA (an empty UA gets a CloudFront 403); on a WAF challenge back off, and "Verify on Wattpad"
opens `storyUrl` in a visible WebView (cookies sync to native fetch); a hidden bridge is a fallback design only.

### tests
- [ ] WP-T1 `tests/wp-map.test.ts`: string vs integer ids; words summed from `parts[].wordCount`;
      draft and deleted parts excluded; dates with and without time zone; cover width rewrite; category names.
- [ ] WP-T2 `tests/wp-locks.test.ts` (spy on `src/net/http`): **no `apiv2/?m=storytext` URL is ever
      requested for a blocked or unknown part** in `getChapter`, `prefetchChapter`, `downloadStory`
      and the player advance; a free story makes no metadata request; a failed metadata request
      locks every part of a paywalled story; a free→paid transition deletes saved text of newly locked parts.
- [ ] WP-T3 `tests/wp-errors.test.ts`: 1017 → `WpNotFoundError` and update result `gone`; 1018 →
      `WpLoginRequiredError`; CloudFront 403 → `SourceBlockedError('wp')`; HTML when JSON expected →
      blocked; plain "404 page not found" → `WpApiChangedError`; foreign-host `nextUrl` refused.
- [ ] WP-T4 `tests/wp-text.test.ts`: sanitized storytext keeps `data-p-id`, drops script / `on*`; empty body → error.
- [ ] WP-T5 `tests/wp-adapter.test.ts`: search follows `nextUrl` only on request; `resolvePart` via `groupId`; `webUrl`.
- [ ] WP-T6 `tests/wp-updates.test.ts`: one request per story, spaced, in series; skipped when
      checked under 24 h ago; alert only when the part count grows; reordered parts → `chapterIds`
      remap; auto-download off by default.
- [ ] WP-T7 `tests/wp-killswitch.test.ts`: disabled → `resolveLink` gives `{kind:'disabled'}`,
      `dueSources` excludes wp, a downloaded part reads with no request.
- [ ] WP-T8 `tests/routes-keys.test.ts` (already covers `/read/wp:1?ch=3`): add `ffn:6315313` and
      `wp:6315313` coexisting; `tests/registry.test.ts` enabled / disabled cases.
- [ ] WP-T9 Synthetic fixtures (shapes only, lorem): `story_v3.json` (3 parts, one `draft:true`,
      `isPaywalled:false`, `paidModel:""`, string id, integer part ids); `paid_story_v3.json`
      (`isPaywalled:true`, `paidModel:"paid_story"`, 6 parts); `paid_content_metadata.json` (4 free,
      2 `{paywalled:true, has_access:false, price:[{id:"wp2",amount:0},{id:"wp1",amount:5}], paid_model:"paid_story"}`)
      plus a variant with one part missing; `search_stories.json` (`paidModel:null` item, a
      "YYYY-MM-DD HH:MM:SS" date); `categories.json`, `stories_hot.json`, `hotlist_tag.json` (nextUrl
      on api.wattpad.com); `part_v3_story_parts.json`; `story_not_found.json` (1017);
      `user_library_anon.json` (1018); `blocked_cloudfront.html`; `storytext.html` (20 ×
      `<p data-p-id="0123456789abcdef0123456789abcdef">Lorem…</p>` plus one hostile `<script>` / `onclick`).

### acceptance (on the phone)
- [ ] WP-A1 Turn on Wattpad (Settings → Sources, or What's new): the Wattpad chip appears.
- [ ] WP-A2 Find a free story via genres and via search; paste a part link; read 2 parts; Download
      (notice once); airplane mode: read and listen.
- [ ] WP-A3 A paid story shows 🔒 and the price on locked parts; opening one shows the sheet;
      downloads and audiobook skip it; nothing but metadata is fetched for locked parts.
- [ ] WP-A4 Update check: 1 request per Wattpad story, at most daily.
- [ ] WP-A5 Switch off: Wattpad hidden everywhere; downloaded Wattpad stories still read offline.

### install_notes
No prebuild (pure JS; `app.json` description text only). Template T1.

### risks
- Terms (policies.wattpad.com/terms, revised May 13, 2019): "Don't scrape Wattpad … 'crawl',
  'spider' or otherwise remove any content"; no bypassing security, no reverse engineering;
  "personal and non-commercial use only"; "may change, terminate, or restrict access … without
  notice". No public API (`/developer/docs` is a 404). Payment Policy (revised November 17, 2023):
  paid features only through the App Store / Google Play under a personal license. The user's own
  account is at stake once they log in (P7). Mitigations: see policies.
- Undocumented, mixed APIs (v3 / v4 / v5 / apiv2; the site is mid-migration to Remix): depend on the
  small verified set, keep fallbacks, run `live-check --source wp` before releases, treat missing
  fields defensively (unknown `fields` names are silently ignored).
- AWS WAF challenge: back off; visible "Verify on Wattpad" WebView.

### open_questions
| id | question | default |
|---|---|---|
| OQ-1 | Accept Wattpad's terms risk for your own use? | Yes, as designed (user-initiated, downloads on tap after a notice, auto-download off, paid parts never touched, kill switch). Alternative: online only, no downloads. **Unanswered** |
| OQ-7 | Story deleted / unpublished on Wattpad? | Mark "No longer on Wattpad"; ask once whether to delete the offline text, keeping progress |
| OQ-WP-3 | Wattpad on by default after the update? | **Off**; one tap in What's new, which carries the terms notice |
| OQ-WP-4 | Link imported Wattpad files to `wp:` stories? | No for now (they stay local, link kept) |

---

## 7. P7: Wattpad account and social

```yaml
id: P7
title: Wattpad login and social
status: pending
order: 4
depends_on: [P4]
native_rebuild: no
approved_by_user: none yet
gate: >-
  The user has a Wattpad account, logs in on the phone, and agrees to a check of at most 10
  requests against their own account. Until the logged-in endpoints are confirmed, ship nothing that writes.
```

### why
Purchased parts, the user's Wattpad library and reading lists, votes and comments.

### scope
- [ ] WPL-0 **Gate first**: Settings → Connection → **Check Wattpad account** (runs only after
      login): at most 10 requests; shows **only** HTTP status, `error_code` and top-level field
      names (no content, no cookies); the user copies the report back. Endpoints to confirm (seen in
      Wattpad's client JS, never called):
  1. `GET /api/v3/users/{u}/library?fields=stories(id,title,numParts)&limit=5`
  2. `GET /api/v3/users/{u}/lists?fields=lists(id,name,numStories),total` (private lists too)
  3. `GET /apiv2/syncreadingposition?story_id=<id>` → `{part, position}`
  4. `GET /v5/story/{paidId}/paid-content/metadata?parts=…` → `has_access` for a purchased part (if they own one)
  5. comments read: `GET /v4/parts/{partId}/paragraphs/{paragraphId}/comments` and `GET /v4/comments/{id}`
  6. login state: `window.__remixContext.state.loaderData.root.currentUser` or `window.wattpad.currentUser`
  Also confirm whether logged-in calls need the page's `Authorization: <wattpad.apiAuthKey>` header
  (anonymous calls didn't; never copy the key into code) and the session cookie name (believed
  `token`; unverified). Never test a POST in the gate.
- [ ] WPL-1 `src/sources/wattpad/session.ts` + `/signin/wp`: visible WebView at
      `https://www.wattpad.com/login`; recommend email / username + password (Google refuses embedded
      WebViews); detection script posts only `{type:'wp-login', username}`; native fetch uses the
      synced cookies; a hidden same-origin bridge is the fallback if cookies don't work natively.
- [ ] WPL-2 Library sync scoped to `wp`: Wattpad library → Follows; reading lists → list chips.
      Add / remove library entries only on tap: `POST /api/v3/users/{u}/library/{ids}` (response
      `results.success`) and the matching remove (unverified).
- [ ] WPL-3 Purchased parts unlocked through `has_access` with cookies; lock state refreshed after
      login and after logout (logout re-locks).
- [ ] WPL-4 Votes: `POST` / `DELETE /api/v3/stories/{storyId}/parts/{partId}/votes` → `{votes}`, in the
      reader ⋯ menu and at the end of a part; **never automatic**.
- [ ] WPL-5 Comments per part: read, post on tap; replies at `/v4/comments/{id}/replies`; optional
      inline paragraph markers (by `data-p-id`), **off by default**.
- [ ] WPL-6 Optional, default off: synced reading position (read on open; write
      `POST /apiv2/syncreadingposition` (`story_id`, `position`) only if the user turns it on).
- [ ] WPL-7 Logout like AO3: native call plus a WebView check (cookie deletions don't sync).

### files
New `src/sources/wattpad/session.ts`, `src/sources/wattpad/account.ts`, parsers as needed; reuse
`src/app/signin/[source].tsx`, `src/app/comments/[key].tsx`, `src/app/account/[source].tsx` from P6;
change `src/sources/wattpad/{adapter,locks,ui}.ts`, `src/app/settings.tsx` (diagnostics row).

### data / API details
See WPL-0 and P4's API table. Votes / comments / library endpoints are unverified until the gate passes.

### policies
As P4, plus: login only on Wattpad's own page; never store passwords or the API auth key; writes
only on explicit taps, never retried; diagnostics never include body text or cookie values.

### tests
- [ ] WPL-T1 Library mapping; sync scoped to `wp`.
- [ ] WPL-T2 Votes only on an explicit action, never retried.
- [ ] WPL-T3 Lock state refreshed after login and logout.
- [ ] WPL-T4 The diagnostics report contains no body text or cookie values.

### acceptance (on the phone)
- [ ] WPL-A1 Log in → username shows.
- [ ] WPL-A2 Library and lists show.
- [ ] WPL-A3 A purchased part reads.
- [ ] WPL-A4 A vote and a comment appear on Wattpad.
- [ ] WPL-A5 Logout re-locks paid parts.

### install_notes
No prebuild. Template T1.

### risks
Undocumented logged-in endpoints; the user's own account is at stake (terms); session cookie and
auth header unknown until the gate.

### open_questions
OQ-2 (account). Synced reading position default off.
