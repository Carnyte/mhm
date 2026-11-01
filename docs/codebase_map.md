# Codebase map: src/, routes, scripts

> Read to find where something lives before editing.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 4.4 `src/` map

**`src/sources/`** (site layer; no React Native except `ui.ts` and `*/ui.ts`)
- `keys.ts`: `SOURCE_IDS`, `SourceId`, `StoryKey`, `SOURCE_NAMES`, private `REMOTE_ID`, key helpers (`docs/database_schema.md` §5.1).
- `types.ts`: site-neutral model and the `Source` contract (`docs/database_schema.md` §5.2, `docs/sources_common.md` §5.3).
- `registry.ts`: lazily built source table, `getSource`, `sourceOf`, `enabledSources`, `resolveLink`,
  `absoluteLink`, `isBareStoryNumber`, `ComingSoonError`, disabled / coming-soon messages; Wattpad is a `comingSoon()` stub.
- `ui.ts`: `SourceUi` slot interface, `basicUi`, `UIS`, `getUi`, `uiOf`.
- `meta.ts`: `isStoryMeta`, `libraryAuthor`, `libraryMetaFromMeta`, `withKnownTitles` (keeps full titles over AO3's shortened "…" ones), `infoFromLibrary` (library record as a story page offline).
- `remap.ts`: pure chapter remapping (`docs/database_schema.md` §5.8).
- `ffn/adapter.ts` (`ffnSource`, `parseFfnLink`, `FFN_BASE_URL`; no `checkUpdates`, so FFN uses per-story workers),
  `ffn/map.ts` (`ffnMeta`, `ffnInfo`, `ffnChapter`, `libraryMetaFromFfn`, `ffnKey`, `ffnId` (throws `UnsupportedSourceError` for other sites), `ffnStoryUrl`, `ffnAuthor`, `ffnUser`),
  `ffn/ui.ts` (`ffnUi`: stats, Follow / Favorite heart, Reviews, "Write a review" end action; `addSubscription`).
- `ao3/adapter.ts` (`ao3Source`: `stableText`, `getStory`, `getChapter` with stale-id recovery, `downloadAll`, `checkUpdates`, `resolvePart`, `search`; listing helpers `listTagWorks`, `listUserWorks`, `searchWorks`, `getSeries`; per-session memory `restrictedIds`, `chapterIds`, `fullTitles`, `resetAo3Session`),
  `ao3/api.ts` (every AO3 request: `ao3Fetch`, `ao3Url` host guard, `fetchWorkPage` (5-minute reuse of 6 pages), `fetchNavigate`, `fetchDownload`, `fetchSearch`, `fetchById`, `fetchWorksList`, `fetchSeries`, `fetchMedia` / `fetchMediumFandoms` (cached a week in `http_cache`), `fetchFandomSuggestions`; errors `Ao3RestrictedError`, `Ao3NotFoundError`, `Ao3ChapterGoneError` (carries `chapterIds`), `Ao3AdultNoticeError`, `Ao3UnavailableError`; `isAo3Trouble`),
  `ao3/constants.ts` (ratings, warning / category tag ids, sorts, media, languages, word ranges, `ADULT_RATINGS` / `isAdultRating`, `FANDOM_CACHE_MS` 7 days, `MAX_LISTING_PAGE` 5000, `UPDATE_BATCH` 20),
  `ao3/map.ts` (`ao3Chapter` with `notesBefore` / `notesAfter`, `ANONYMOUS`, `ao3Key`, `ao3Tags`),
  `ao3/urls.ts` (`AO3_ORIGIN`, tag escaping, URL builders, `Ao3Filters`, `Ao3Search`, `parseAo3Url`, `parseAo3Link`, `authorId` / `splitAuthorId` 'user/pseud'),
  `ao3/session.ts` (login state: `getAo3Session`, `subscribeAo3Session`, `noteAo3Page(url, html)` called by `ao3Fetch` on every AO3 page, `setAo3LoggedIn` / `setAo3LoggedOut`; kv `session:ao3`), `ao3/account.ts` (`fetchToken` (`/token_dispenser.json`), `ao3Post` (fresh token, form POST, never retried), `checkAo3Login`, `confirmAo3Login`, `logoutNative`), `ao3/parsers/account.ts` (`parseGreeting`: header before `#main` only),
  `ao3/ui.ts` (`ao3Ui`: kudos / hits / bookmarks / comments stats, `chapterCount` "n/?", tag groups, warning line, rating badge, series route, "Open on AO3"),
  `ao3/parsers/` (`common.ts` (blurb + work meta `Ao3WorkMeta`, bylines, stats, sanitized `userstuffHtml`, dates), `blurb.ts`, `listing.ts` (+ facets), `work.ts` (`parseWorkPage` → `Ao3Page` union work / adult / login / unknown; `stripChapterNumber`, `isAbbreviatedEntry`), `navigate.ts`, `download.ts`, `media.ts`, `series.ts`, `user.ts`).
- `local/adapter.ts` (`localSource`, `LOCAL_CSP`, `LocalMissingError`; reads only library + `chapterStore`), `local/ui.ts` (`localUi`, `fileKindLabel`, `siteName`, `confirmDeleteImported`, `GENERATORS` labels).
- `wattpad/urls.ts`: `WP_ORIGIN`, `storyUrl`, `partUrl`, `parseWattpadUrl`, `parseWattpadLink`. Link parsing only.

**`src/net/`**
- `httpCore.ts` (polite `HttpClient`, `POLICIES`, errors; `docs/sources_common.md` §6.1), `http.ts` (native client with `DESKTOP_USER_AGENT`, `httpText`), `http.web.ts` (web: AO3 / FicHub through dev proxy `/http`, `EXPO_PUBLIC_FFN_PROXY` default `http://localhost:8787`; Wattpad direct with `credentials:'omit'`).
- `blocks.ts`: `SourceBlockedError`, `isAo3Block` / `detectAo3Block` (`cf-mitigated: challenge`, Cloudflare's exact titles, `cf_chl_opt`), `isWpBlock` / `detectWpBlock` (`x-amzn-waf-action`, CloudFront 403, HTML where JSON was expected).
- `bridge.ts` (FFN queue; `docs/ffn.md` §6.2), `bridgeScript.ts` (`BRIDGE_SCRIPT` with `window.__ffnBridge.announce/fetch`, `loginPrefillScript`), `challenge.ts` (`RawResponse`, `isChallengeResponse`, `parseCookies`, `usernameFromCookies` via the `funn` cookie), `BridgeHost.tsx` (hidden WebView, full screen for "Verify you are human", remount on `onContentProcessDidTerminate`), `BridgeHost.web.tsx`.
- Background clipping: `ClipHost.tsx` (hidden WebView at the root, behind the app at opacity 0.02 / zIndex −1; nonce'd capture / Next scripts; open-mode navigation, anything but `allow` refused; slides up with Continue / Hide; `ANSWER_MS` 15 s, `LOAD_MS` 30 s; AppState → `clipEngine.setActive`).
- Auto-clip: `nextScript.ts` (`nextScript(nonce, 'find'|'press'|'report')`, `NEXT_MESSAGE`,
  `NEXT_WORDS`, `LOCK_PATTERN`, `LOCKED_TEXT_PATTERN`, `NEXT_SCORE_MIN` 30: Next candidates by
  rel=next / label / class / pager, never disabled, hidden or buy / unlock; lock and bot signals;
  main-text fingerprint; posts labels and counts only).
- Clip: `webPolicy.ts` (`decideNavigation(url, mode, ctx)` for the in-app browser's two modes; FFN
  mode = the old allowlist decisions exactly), `webHosts.ts` (`webMode`, `isNativeHost`,
  `acceptsCookieMessage`; no registry import, used by `+native-intent.tsx`), `clipScript.ts`
  (`clipScript(nonce, maxChars, timing)`, `CLIP_MESSAGE`, `MAX_CLIP_CHARS`).
- `ao3Signin.ts`: the AO3 sign-in screen's rules (`SESSION_SCRIPT` header check, `LOGOUT_SCRIPT` (the page's own logout form), `readSessionMessage` (AO3 host only), `decideSigninNavigation`, `signinStartUrl`).
- `webviewConfig.ts`: `FFN_HOST`, `DESKTOP_USER_AGENT` (desktop Safari, version from `Platform.Version`), `FFN_WEBVIEW_PROPS` (UA + `contentMode:'desktop'`), `isMobileSiteUrl`, `toDesktopUrl`.
- `images.ts`: `directImageUri` / `loadImage` / hook; FFN images through the bridge as base64 (LRU 400, 3 at a time); other https, `file:`, `data:`, `ficshelf-doc:` load directly.

**`src/ffn/`** (FFN only; may treat ids as numbers)
- `api.ts`: typed client over the bridge (`getStory(id, chapter, {quiet})`, lists, Just In, fandoms,
  crossovers, search, reviews, `subscribe`, `postReview`, profiles, betas, communities, forums,
  topics, `login` / `logout` / `loginState` / `findMyUserId`, `getAccountStories`, `getAccountAuthors`,
  `removeFromAccountList`, PMs); errors `NeedsWebError`, `LoginRequiredError`; re-exports `FfnPageError`.
- `constants.ts`, `forms.ts` (form parsing and "form replay" for pages behind a login), `types.ts`, `urls.ts` (`parseLink` → `LinkTarget`, `absolute`).
- `parsers/`: `dom.ts` (re-exports `src/html/dom.ts` + FFN helpers; its **own regex `sanitizeHtml`**), `story.ts` (`FfnPageError` code `not_found | login_required | site_error | parse`), `storyList.ts`, `meta.ts`, `fandoms.ts`, `groups.ts`, `profile.ts`, `reviews.ts`, `search.ts`, `account.ts` (adaptive).

**`src/html/`**: `dom.ts` (`El` wrapper over htmlparser2 + css-select + domutils + dom-serializer; `parseHtml`, `normalizeSelects`, `decodeEntities`, `text`, `ownText`, `attr`, `parseCount`); `sanitize.ts` (allowlist sanitizer; `docs/sources_common.md` §6.1).

**`src/db/`**: `kv.ts` (SQLite; `docs/database_schema.md` §5.6), `kv.web.ts` (localStorage stand-in, chapters under `ficshelf:ch:<StoryKey>:<n>`), `migrations/index.ts` (`SyncDb`, `MigrationEnv`, `MigrationResult`, `SCHEMA_SQL`, `SCHEMA_VERSION = 2`, `schemaVersion`, `runMigrations`), `migrations/v2.ts` (pure idempotent transforms: `normalizeStory`, `normalizeLocal`, `mergeStory`, `normalizeAuthor`, `mergeAuthor`, `bookmarksV2`, `collectionsV2`, `positionsV2`, `searchesV2`, `pinsV2`, `settingsV2`, `moveLegacy`, `migrateV2`, `drainLegacy`, `MigrationError`).

**`src/state/`**: `store.ts` (`createStore` get / set / subscribe; `useStore` with shallow-equal selectors), `library.ts` (`docs/database_schema.md` §5.4), `settings.ts` (`docs/database_schema.md` §5.5), `session.ts` (FFN login session from bridge cookies; user id cached in kv `myUser`).

**`src/features/`**: `chapters.ts` (`fetchStory`, `fetchChapter`, `loadChapter`, `usableSavedChapter`, `prefetchChapter`, `getSavedChapter`, `saveChapter`, re-export `renderChapter`), `downloads.ts` (`downloadStory`, `cancelDownload`, `removeDownload`, `removeAllDownloads`, `downloadedBytes`, `downloadsStore`), `updates.ts` (`docs/ao3.md` §6.3, `docs/ffn.md` §6.2), `chapterIds.ts` (`applyChapterIds`, `chapterIdsOf`, `onChapterRemap`, `announceRemap`), `actions.ts` (`openStory`, `openReader`, `openAuthor`, `openWeb`, `openLinkHit`, `openReaderLink`, `shareStory`, `copyLink`, `storyMenu`, `storyPageMenu`, `readerMenu`, `collectionActions`, `gatedStory`), `adultGate.ts` (`isAdultWork`, `needsAdultGate`, `agreeToAdult`, `alwaysShowAdult`, `resetAdultGate`, `afterAdultGate`), `imports.ts`, `importFiles.ts`, `importHandoff.ts`, `importPicker.ts` (`docs/import.md` §6.4), `clips.ts` (`commitClip`, `appendClip`, `undoLastClip`, `findClippedPage`, `clippedStories`, `defaultClipTarget`, `clipOddity`), `autoClip.ts` (pure runner `AutoClip` with `start/pause/resume/stop/setActive/reviewed`, `AutoClipStatus` running / paused (user, background, blocked + message, review) / finished, `MESSAGES`, `dwellMs`, `textPrint`, `summary`, `waitForNextChapter`; `MIN_DWELL_MS` 4000, `NEXT_WAIT_MS` 20000, `POLL_MS` 700, `MAX_ERRORS` 3), `clipPace.ts` (no imports: `ClipPace`, `CLIP_PACES` gentle 20–40 / normal 8–15 / quick 4–7 s, `CLIP_BATCHES` 5/10/25/50, `MAX_CLIP_RUN` 200, `runSizeOptions`), `clipReport.ts` (`clipReport`: "What Clip sees", no story text), `clipJobs.ts` (background jobs: `ClipJob {id, startUrl, site, key?, title, state queued|running|needs-user|paused|done|stopped, message?, saved, createdAt, updatedAt}`, kv `clipJobs` via `normalizeJobs` (running / needs-user → queued on load, ≤ 30 jobs), `clipJobsStore`, `clipRunStore {id, status, visible}`, `clipEngine` start / pause / resume / cancel / clearFinished / setActive / show / attach / detach, `activeJobFor`, `jobNeedingUser`; `MAX_BACKGROUND_RUN` 2000 in `clipPace.ts`). `src/components/clipNotice.ts` (`CLIP_NOTICE`, `withClipNotice`), `ClipBanner.tsx`.

**`src/import/`** (pure TS): `types.ts`, `index.ts`, `sniff.ts`, `decode.ts`, `zip.ts`, `epub.ts`, `html.ts` (exports `parseHtmlPage`), `readability.ts`, `text.ts`, `build.ts`, `dom.ts`, `meta.ts`, `detect.ts` (`docs/import.md` §6.4), `clip.ts` (`parseClip`, `cleanClipUrl`, `stripSiteName`, `splitTitle`, `asOneChapter`).

**`src/reader/`**: `template.ts` (`buildReaderHtml`, `readerCssVars`, `ReaderPayload`, in-page `READER_JS`), `notes.ts` (`renderChapter`: notes → `aside.fs-notes[data-pos]`), `images.ts` (`withBookImages`).

**`src/audio/`**: `player.ts` (engine; `docs/audiobook.md` §7.5), `state.ts` (`playerStore`, `PlayerState`, `PlayerStory`, `SleepTimer`, `IDLE`, `usePlayer`), `segments.ts` (`segmentChapter`, `frontMatterBlocks`, `isNoteLine`, `isSpeakable`, `splitText`, `MAX_SEGMENT_CHARS = 420`), `speechText.ts`, `rate.ts` (`speechRate`, `isPiperVoice`), `voices.ts` (tiers premium / enhanced / standard / novelty, `bestVoice`, `voiceFor`, `isAddOnVoice`, `languageCode`), `session.ts` (+ `session.web.ts` no-op), `pickers.ts` (`SPEEDS` 0.5–2, sleep timer, voice, pause sheets).

**`src/components/`**: `ui.tsx` (`T`, `Card`, `Button`, `IconButton`, `Chip`, `Badge`, `Row`, `Section`, `Input`, `Segmented`, `Divider`, `ProgressBar`, `haptic`, `IconName`), `Sheet.tsx` (`showActions`, `pickOption`, `toast`, `SheetHost`), `states.tsx` (`Loading`, `Empty`, `ErrorView` mapping every error class to a recovery action, `Notice`), `StoryCard.tsx`, `Cover.tsx`, `StatsGrid.tsx`, `TagGroups.tsx`, `SourceBadge.tsx`, `SourceChips.tsx` (`useSourcesWith(cap)`, `pickSource`, `LABELS`), `FilterSheet.tsx` (FFN), `HtmlText.tsx`, `ProfileView.tsx`, `ReaderSettingsPanel.tsx`, `ReaderWebView.tsx` / `.web.tsx` (iframe), `MiniPlayer.tsx`, `miniPlayerLayout.ts`, `BridgeBanner.tsx`, `MigrationFailed.tsx`, `WhatsNewSheet.tsx` (`WHATS_NEW_VERSION = 2`: Clip; AO3's part for anyone who never saw 1), `ClipSheet.tsx` (clip preview + target + save), `ao3/` (`AdultGateSheet.tsx`, `Ao3BrowseHome.tsx`, `Ao3FilterSheet.tsx`, `Ao3SearchForm.tsx`).

**Kindle-style look (P-UI1)**: `src/components/kindle/` (`Home.tsx` KindleHome, `Library.tsx` KindleLibrary, `StoryPage.tsx` KindleStoryPage + Contents sheet, `ReaderChrome.tsx` (KindleTopBar, KindleBottomPanel with the chapter-tick scrubber, KindleFooter, KindleTextSheet, `storyPosition` / `placeAt`), `Tiles.tsx` (Discover cards and rows)); `src/components/GeneratedCover.tsx` (+ `CoverFlag`); `src/theme/cover.ts` (pure `fnv1a`, `coverColour`, `coverBand`, `coverTitleSize`, `coverSiteLabel`); `src/features/libraryFilters.ts` (pure filters, sorts, `progressLine`); `src/reader/literata.ts` (generated by `scripts/reader-font.py`: WOFF2 subsets in base64); `assets/fonts/Literata-*.ttf` + `OFL.txt`. `src/theme/index.ts` adds `KINDLE_LIGHT` / `KINDLE_DARK`, `paletteFor`, `Palette.look`, `SERIF`; the shared controls in `ui.tsx` change shape when `c.look === 'kindle'` (`T serif`). Screens branch on `useLook()`: `(tabs)/index.tsx` (Home / Browse), `(tabs)/library.tsx`, `story/[id].tsx`, `read/[id].tsx`; new tab routes `(tabs)/discover.tsx`, `(tabs)/more.tsx`; pushed copies `find.tsx`, `new-chapters.tsx`, `fanfiction-account.tsx`. `readingSpot()` in `state/library.ts`.

**Other**: `src/hooks/useAo3Session.ts` (AO3 login state hook); `src/hooks/useQuery.ts` (`useQuery(key, fetcher, {staleMs = 5 min})`, `usePaged`, `invalidate(prefix)`, `peekCache`; key prefixes `story:<key>`, `profile:`, `fandoms:`, `ao3:fandoms:`, `topic:`, `pm:` …); `src/theme/index.ts` (`Palette` incl. `source: Record<SourceId,string>` (light ffn `#2B4C9B`, ao3 `#990000`, wp `#9A3412`, local `#556170`), `LIGHT`, `DARK`, `useTheme`, `READER_THEMES` light / sepia / paper / mint / dusk / dark / black, `READER_FONTS`, `fontCss`); `src/utils/format.ts` (`formatNumber`, `formatFull`, `relativeTime`, `formatDate`, `readingTime`, `formatBytes`, `pluralize`, `errorMessage`, `htmlToText`, `countWords`); `src/utils/docFiles.ts` (`DOC_PREFIX = 'ficshelf-doc:'`, `docRef`, `isImportPath`, `docUri`; files in Documents are stored by relative path because the absolute path changes between installs).

---

### 4.5 Routes (`src/app/**`)
- `_layout.tsx` (root Stack): SafeArea, ThemeProvider, `BridgeHost`, `SheetHost`, `MiniPlayer`,
  `BridgeBanner`, `WhatsNewSheet`; shows `MigrationFailed` when `migrationStatus().ok` is false;
  notification taps open the story (`{storyKey}` or legacy `{storyId}`); launch work `sweepImports`,
  `configureBackgroundChecks`, update checks on launch and foreground; modals `login`, `review/[id]`, `messages/compose`, `open`, `import`.
- `+native-intent.tsx` (`redirectSystemPath`: `file://` → `/import?open=<ticket>`; an outside `ficshelf://web?url=<non-FFN>` → `/open?url=…`, which names the site and asks; everything else unchanged), `+not-found.tsx`.
- `(tabs)/_layout.tsx`: `index` (Browse: Continue reading, `SourceChips`, `Ao3BrowseHome` or FFN home), `search` (box or pasted link, FFN search or `Ao3SearchForm`, recents per site), `library` (history, saved, follows / favorites, downloads, imported, collections, authors; + gives "Import a file" / "Open a link"), `updates` (badge = stories with new chapters), `account`.
- Shared (StoryKey params via `keyFromParam`): `clips` (background clipping jobs), `story/[id]`, `read/[id]` (`?ch=`), `listen`, `open`, `import`, `bookmarks`, `collections/index`, `collections/[id]`, `settings`, `web` (in-app browser: FFN mode for `path` / fanfiction.net, open mode + Clip for any other https `url`; `clipFor`), `help/share` (Shortcut / bookmarklet), `drafts/index`, `drafts/[id]`.
- AO3: `ao3/works` (`tag` + filters JSON, or `q` search JSON), `ao3/fandoms/[medium]`, `ao3/series/[id]`, `ao3/user/[name]` (`pseud`).
- Accounts (P6): `account/[source]` (AO3 account: username, Log in / Log out, the user's AO3 pages; `ffn` redirects to `fanfiction-account`), `signin/[source]` (`ao3`: visible WebView on AO3's own pages, `mode=login|logout|browse`, `path`, `title`; `ffn` redirects to `login`). Rows in More and the classic Account tab ("Other accounts").
- FFN only: `s/[...rest]` (`ficshelf://s/<id>/<ch>` → `ffn:` key), `user/[id]`, `beta`, `betas/[cat]`, `review/[id]`, `reviews/[id]`, `fandoms/[cat]`, `crossovers`, `list`, `justin`, `community`, `forum`, `topic`, `groups/dir`, `groups/[kind]/[cat]`, `login`, `account/stories`, `account/authors`, `messages/index`, `messages/read`, `messages/compose`.

---

### 4.6 `scripts/`
- `check-keys.ts` (part of `npm run lint`): flags `Number(params.id)`, `stories[Number(…)]` and `` `story:${…id}` `` outside `FFN_ONLY` (`src/ffn/`, `src/sources/ffn/`, `src/app/review/[id].tsx`, `src/app/reviews/[id].tsx`, `src/app/user/[id].tsx`, `src/app/s/`).
- `live-check.ts`: FFN via the real `BRIDGE_SCRIPT` in Chromium (playwright-core; `CHROMIUM_PATH`, `xvfb-run -a` headless, `WAIT` 12000 ms, uses `HTTPS_PROXY`; 17 checks, ~20+ requests, no explicit budget; desktop Linux UA, so it can't catch iPhone-only behaviour). `--source ao3`: plain fetch, desktop Safari UA (`Version/26.0 Safari/605.1.15`), `AO3_MAX_REQUESTS = 5`, `AO3_GAP_MS = 3000`; checks work page (view_adult), `/navigate`, id search (ids 3171550 and 19893115), HEAD of the official download (must land on `download.archiveofourown.org`), `/media`; `AO3_WORK=<id>` overrides; prints structure only. **Any other `--source` value silently runs FFN.**
- `dev-proxy.ts` (web harness, port 8787: `/status`, `/reload`, `/fetch` → live FFN via Chromium; `/http` forwards only archiveofourown.org, wattpad.com, fichub.net). `browser.ts` (shared Playwright helper).
- `synthesize-fixture.ts`: `npx tsx scripts/synthesize-fixture.ts in.html tests/fixtures/ao3/out.html [--blurbs N] [--chapters N] [--paragraphs N]` (`docs/testing.md` §8.4).
- `web-shots.cjs`: phone-sized screenshots of a web export (`node scripts/web-shots.cjs <export dir> <shots dir> [light|dark]`), seeding 3 invented clipped stories into the web build's localStorage; for checking UI changes by eye (P-UI1). Env: `LOOK=kindle|classic`, `ONLY=home,story,…` (routes: home, search, library, updates, account, story, reader, settings, discover, more), `EMPTY=1`, `SETTINGS_JSON='{…}'`, `SUFFIX=x`, `TAP='x,y|…'` (finger taps; the reader listens for touches), `CLICK='aria label|…'`, `SCROLL=px`, `AO3_USER=name` (seeds an AO3 login; route `ao3account`).
- `reader-font.py`: rebuilds `src/reader/literata.ts` from `assets/fonts` (`pip install fonttools brotli`; `python3 scripts/reader-font.py`).
- `clip-check.ts`: Clip's capture script in headless Chromium (playwright-core, `/opt/pw-browsers/chromium-1194`) on synthetic pages, then `parseClip`; then the real `AutoClip` runner with the capture and Next scripts on three synthetic sites served by `context.route` (an in-place SPA reader ending in a locked episode, a rel=next site, a bot-check page), virtual clock; no network; `CLIP_DUMP=<file>` writes the captured page; 34/34 at `e1b08ba`. Live-check rejects unknown `--source` values since `1cca7be`.
