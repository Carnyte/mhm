# AO3: reading without login, features, lessons, and the planned AO3 account phase (P6)

> Read before touching src/sources/ao3/ or AO3 screens, or starting P6.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 6.3 AO3 (reading without login)
- Always `view_adult=true` on work pages, plus the app's own adult gate (Mature, Explicit, Not Rated)
  on every way in. `/works/ID` redirects a multi-chapter work to its first chapter **without**
  `view_adult` (AO3 uses a cookie), so on an adult notice re-ask the final URL with `?view_adult=true` (`fetchWorkPage`).
- Only AO3 hosts (`ao3Url` guard); **never `/cdn-cgi/`** links (Cloudflare bot trap). No hit counting
  (AO3 refuses bot hits; the app never calls the hit endpoint).
- Official download URL **only copied from the work page** (`/downloads/ID/<name>.html?updated_at=N`),
  never built, never fetched for restricted works. Re-downloaded only when `updated_at` changes. Fallback to
  `?view_full_work=true` only when the download parsed badly, not after AO3 errors.
- Login redirect → `Ao3RestrictedError` (lock, "Log in to AO3 to read this", Open on AO3); 404 / 410 →
  `Ao3NotFoundError`; 5xx → `Ao3UnavailableError`. Works that became restricted after saving are
  remembered (`UpdateResult.restricted`). Don't probe `/navigate` for known-restricted works while logged out.
- History: `/works/ID` and `/works/ID/chapters/CID` write a logged-in user's AO3 history; `/navigate`
  doesn't. Background checks use the id search and `/navigate`, and never re-download in the
  background while a session is logged in.
- `checkUpdates`: one `id:(…)` search per `UPDATE_BATCH = 20` works (45 works = 3 searches, tested),
  then `/navigate` for works missing from results or that lost chapters; stops at the first
  `isAo3Trouble` (blocked, rate-limited, timed out, unavailable, network); starts no request that would
  land after the deadline; results applied per batch via `onResults`. Only a chapter-count increase is news.
- Caches: fandom lists and `/media` 7 days (`FANDOM_CACHE_MS`); 5-minute in-memory work-page reuse.
- Block detection AO3-specific (`src/net/blocks.ts`); never reuse FFN's challenge checks (every AO3 page loads Cloudflare's passive `jsd` script).
- Reader requests: one per chapter (`/works/ID/chapters/CID?view_adult=true`); notes → foldable
  boxes; work skins stripped; AO3 work / tag / creator links open in the app.

---

### 7.2 AO3 (no login)
- ✅ On by default, also for existing installs (switched on once with a What's new sheet); switch in Settings → Sources.
- ✅ Site chips (FanFiction.net · AO3) on Browse and Search.
- ✅ Browse: 11 media → fandoms (A–Z, filter, sort, counts; cached 7 days) → a tag's works; pin AO3 fandoms; popular fandoms.
- ✅ Tag works: sort, rating, complete chips; filter sheet (warnings, categories include / exclude,
  crossovers, length, language, search within results, top fandoms / characters / relationships /
  tags include / exclude); 20 per page, cap page 5000.
- ✅ Work search (all fields incl. fandom suggestions from 2 letters, debounced); recent AO3 searches.
- ✅ Pasted links: works, chapters (via AO3's redirect), tags, series, creators, mirrors (ao3.org, archiveofourown.com / .net, archive.transformativeworks.org).
- ✅ Story page: tag groups, ⚠ warnings line, rating badge, series row, co-creators, Anonymous,
  orphan_account, stats (words, chapters n/?, kudos, hits, bookmarks, comments, dates), chapter list with ids and dates.
- ✅ Series and creator screens; creator's profile / series / bookmarks open in Safari.
- ✅ Reader: one request per chapter, sanitized, foldable notes ("Fold authors' notes"), work skins stripped, in-app links.
- ✅ Adult gate on every way in (incl. Listen from a card); "Ask before showing adult works"; "Always show".
- ✅ Restricted works: lock, login-redirect detection, "Log in to AO3 to read this" + Open on AO3.
- ✅ Library, collections, bookmarks, Continue reading under `ao3:<id>`; FFN / AO3 3171550 collision tested.
- ✅ Offline via AO3's official HTML download (copied link, one request, split into chapters with notes, ids stored); re-downloaded only on `updated_at` change.
- ✅ Audiobook with notes boxes as the exact skip boundary.
- ✅ Updates (batched id searches, `/navigate`, 25 s background budget, oldest first, alerts only for new chapters, quiet refresh on edits, remap of reordered / deleted chapters, stop on 429 / challenge / timeout, per-site last-check time, no background re-downloads while logged in).
- ✅ Politeness per `docs/sources_common.md` §6.1 / §6.3. 🧪 AO3 has never been reported on the device.
- ⏳ AO3 login and everything behind it (restricted works, kudos, comments, subscriptions, AO3 bookmarks, Marked for Later): P6. ⏳ Work-skin toggle, offline images: P8.

---

### 10.9 AO3
Bugs found by review (`bf3f9f5` → `6c1015f` → `a315dbe`):

| What happened | Rule |
|---|---|
| A stale stored chapter id returned a *different* chapter whose text was saved (and progress recorded) under the requested number; a deleted chapter's id 404'd forever | Fetch by the *current* id (chapter menu or `/navigate`) **after** `applyChapterIds`; remap progress, downloads, bookmarks, listen positions; a gone chapter throws `Ao3ChapterGoneError` |
| **Resume-follow bug**: the player picked chapter N and the start point *before* loading; the fixed loader then served the current chapter N, so resume played a different chapter from the old position | `loadChapter` listens with `onChapterRemap` **during** the load and follows once (`followed: true`), recomputing via `resumePoint()`. Fixing one side of a renumbering (reader) can break the other (audiobook): test both |
| The chapter menu (`select#selected_id`) shortens long titles ("...", 50+ chars), overwriting full titles | `abbreviated` entries never replace a known title (`withKnownTitles`); this safety net is untested (removing it still passes) |
| Totals vanished on "found" headings; Open Doors bylines "X [archived by Y]" showed the archivist; tags with `+` broke (`unescapeTag`); works in collections classified as the collection | Cover each URL and markup variant with a synthetic fixture |
| Long-press "Listen" bypassed the adult gate | Gate *every* entry point (`grep player.start`); one shared helper |
| An AO3-only check postponed FFN; recent searches and hidden fandoms were shared across sites; hiding an AO3 crossover fandom matched `fandoms.join(', ')` | Per-site state keyed per site; match fandoms exactly |
| Chapters fetched twice (prefetch, then reader) | `usableSavedChapter()` reuses a saved AO3 copy when chapter id and version match |
| `updated_at` changes on any edit | Alert only when the chapter count grows; compare `updated_at * 1000` (seconds) |

---

## 6. P6: AO3 account and social

```yaml
id: P6
title: AO3 login and social
status: pending
order: 3
depends_on: [P3 (done)]
native_rebuild: no
approved_by_user: "2026-10-08: reading first, login later (no date set for login)"
gate: the user has an AO3 account (AO3 needs an invitation); ask first (OQ-2). Without one, skip all but guest kudos.
```

### why
Restricted works show "Log in to AO3 to read this" with only **Open on AO3**
(`src/components/states.tsx`, `Ao3RestrictedError`); no kudos, comments, subscriptions or AO3 bookmarks.

### scope
- [ ] AO3L-1 `src/app/signin/[source].tsx`: a visible WebView on `https://archiveofourown.org/users/login`,
      `sharedCookiesEnabled` (AO3 is responsive; either UA). **No prefill, no reading of inputs.**
      The injected script only checks for `nav#greeting ul.user.navigation` and posts
      `{type:'ao3-login', username}` (accepted only from the AO3 host). Copy: "You're signing in on
      AO3's own page. FicShelf keeps the site's session cookie and never sees your password." plus
      "Request an invitation" instead of sign-up; ask the user to tick "Remember me"; confirm via
      native fetch afterwards (any AO3 page contains `#greeting`).
- [ ] AO3L-2 `src/sources/ao3/session.ts` (`SourceSession`): `get()`, `subscribe()`, `signInRoute`,
      `logout()`, `syncLibrary()`; session parsed from **every** page `ao3Fetch` sees (cheap regex for
      `id="greeting"` and `href="/users/NAME"`); stored as kv `session:ao3` `{username, checkedAt}`; a
      redirect to `/users/login` or `/lost_cookie`, or no greeting, means logged out → prompt again.
- [ ] AO3L-3 `src/sources/ao3/account.ts`: `token()` (always fresh), `leaveKudos`, `postComment`,
      `subscribe`, `unsubscribe`, `bookmarkWork`, `markForLater`. Every POST: explicit tap only, fresh
      token, never retried, AO3's own message shown.
- [ ] AO3L-4 `src/sources/ao3/parsers/account.ts`: greeting / username, subscriptions, bookmarks list
      (reuse the blurb parser), readings (update-available and to-read flags), comment threads, the
      subscription id from the work page's subscribe form.
- [ ] AO3L-5 Library sync, scoped to source `ao3` only (never touches FFN flags): subscriptions →
      Follows; AO3 bookmarks → Favorites; Marked for Later → a list chip; history "(Update
      available.)" → an extra update signal.
- [ ] AO3L-6 Logged-in update checks: the id search includes restricted works; **background work
      never GETs `/works/ID` or `/works/ID/chapters/CID` while logged in** (including the work-page
      fetch `downloadAll` uses to copy the download href): use the stored `ao3.downloadHtmlHref`, or
      mark the copy stale for the next user-visible open.
- [ ] AO3L-7 UI: restricted Empty state gets **Log in to AO3**; story page heart = kudos (works as a
      guest), bell = Subscribe; ⋯ **Bookmark on AO3…** (form sheet), **Mark for later**; reader end
      actions ♥ Kudos + Comment; `src/app/comments/[key].tsx` (generic) + `src/components/CommentCompose.tsx`;
      `src/app/account/[source].tsx` (FFN account sections move there, inline while FFN is the only
      account); `(tabs)/account.tsx` gets an "Accounts" list (monogram tiles FF / A3 / W).
- [ ] AO3L-8 Logout: POST `/users/logout` with `_method=delete` + fresh token via native fetch; confirm
      logged out in native fetch **and** in a WebView load of `/`; if the WebView still shows
      `#greeting`, submit AO3's logout form inside the WebView (cookie deletions don't sync).
- [ ] AO3L-9 No hit counting (OQ-12 default).
- [ ] AO3L-10 README: remove the "AO3 has no login" limitation; docs.

### files
New: `src/sources/ao3/session.ts`, `src/sources/ao3/account.ts`, `src/sources/ao3/parsers/account.ts`,
`src/app/signin/[source].tsx`, `src/app/comments/[key].tsx`, `src/app/account/[source].tsx`,
`src/components/CommentCompose.tsx`. Change: `src/sources/ao3/{adapter,api,ui}.ts`,
`src/components/states.tsx`, `src/app/(tabs)/account.tsx`, `src/app/story/[id].tsx` (only through
slots), `src/features/updates.ts`, `README.md`. Fixtures (synthetic):
`tests/fixtures/ao3/{greeting_logged_in,subscriptions,readings,bookmarks_user,comments}.html`.

### data / API details
- Login page `GET /users/login` sets `_otwarchive_session` (2 weeks; "Remember me" 3 months);
  `form#new_user` POSTs `/users/login` with `authenticity_token`, `user[login]`, `user[password]`,
  `user[remember_me]`, `commit=Log in`; throttled at 5 POSTs per 20 s per IP and login. After login
  AO3 sets `user_credentials=1` (1 year); if it's missing while logged in, AO3 forces logout via `/lost_cookie`.
- Markers: logged in `nav#greeting ul.user.navigation` (first link `/users/NAME`); logged out
  `#login #login-dropdown` and `form#new_user_session_small`. Restricted work logged out → redirect
  `/users/login?restricted=true&return_to=/works/ID`; in listings `img[title="Restricted"]`.
- CSRF: logged-out pages are cached whole, so their `authenticity_token` can be stale. Before
  **every** POST, `GET /token_dispenser.json` → `{"token":"..."}`; never store or log it.
- Kudos: `POST /kudos` with `authenticity_token`, `kudo[commentable_id]=WORK_ID`,
  `kudo[commentable_type]=Work`, `commit=Kudos ♥`; headers `Accept: application/json, text/javascript`,
  `X-Requested-With: XMLHttpRequest` → 201, or 422 `{error_message}`: "You have already left kudos
  here. :)", "You can't leave guest kudos on a restricted work.", "You can't leave kudos on your own
  work.", "Sorry, you have been blocked by one or more of this work's creators." Guests can leave
  kudos (by IP), not on restricted works.
- Comments read: `/works/ID/chapters/CID?show_comments=true&page=N`, or
  `/works/ID?show_comments=true&view_full_work=true` for one-chapter works; selectors
  `#comments_placeholder ol.thread > li.comment#comment_ID`, `h4.heading.byline`,
  `span.posted.datetime`, `blockquote.userstuff`; paginated; avoid `/comments/show_comments?chapter_id=` (returns JS).
- Comments post: `POST /chapters/CID/comments` (multi-chapter) or `/works/ID/comments` (single) with
  `authenticity_token`, `comment[comment_content]` (≤ 10000 chars), `comment[name]` / `comment[email]`
  (guests) or `comment[pseud_id]`, `controller_name=chapters|works`, `commit=Comment`. Notice "Sorry,
  this work doesn't allow non-Archive users to comment." Guest and new-account comments are spam-filtered.
- Subscribe: `POST /users/NAME/subscriptions` with `subscription[subscribable_id]`,
  `subscription[subscribable_type]=Work|Series|User`; unsubscribe `POST /users/NAME/subscriptions/SUB_ID` with `_method=delete`.
- Bookmark: `POST /works/ID/bookmarks` with `bookmark[pseud_id]`, `bookmark[bookmarker_notes]`,
  `bookmark[tag_string]`, `bookmark[collection_names]`, `bookmark[private]`, `bookmark[rec]`.
- Mark for later: `POST /works/ID/mark_for_later` (or `/mark_as_read`) with `_method=patch`.
- Lists: `/users/NAME/subscriptions?type=works` (`dl.subscription.index.group`, `dt` = link + name,
  `dd` = unsubscribe form; paginated; **no chapter counts**); `/users/NAME/bookmarks` (blurbs);
  `/users/NAME/readings` (history; entries may show "(Update available.)", "(Marked for Later.)",
  visit count); `/users/NAME/readings?show=to-read`; `/users/NAME/inbox` (open on the web).
- History: logged-in GETs of `/works/ID` and `/works/ID/chapters/CID` write the user's AO3 history; `/navigate` does not.
- Cookies: WKWebView → native cookie sync works (`sharedCookiesEnabled`, observer in
  `RNCWebViewImpl.m`); **deletions don't sync** (matters for logout).
- Hit counts (OQ-12, only if the user wants authors to see reads): one `POST /works/ID/hit_count.json` per work per day.

### policies
Login only on AO3's own page (AO3's FAQ asks users not to give passwords to third-party apps);
never store or log the password or token; every POST on an explicit tap, fresh token, never
retried; sync scoped to `ao3`; no background work-page fetches while logged in; never reuse FFN's
`isChallengeDoc` / `isChallengeResponse` for AO3 (every AO3 page loads Cloudflare's passive script).

### tests
- [ ] AO3L-T1 Parsers for subscriptions, readings (flags), bookmarks, comments; greeting gives the username.
- [ ] AO3L-T2 Token fetched before every POST (spy order); a 422 kudos message shown verbatim; a POST never retried.
- [ ] AO3L-T3 Syncing AO3 doesn't change FFN `followed` / `favorited`, and the reverse.
- [ ] AO3L-T4 Logged in, a background update run requests no `/works/\d+(/chapters/\d+)?` URL.
- [ ] AO3L-T5 Logout checks both stores.

### acceptance (on the phone)
- [ ] AO3L-A1 Log in → username shows.
- [ ] AO3L-A2 A restricted work opens and downloads.
- [ ] AO3L-A3 Kudos and a comment appear on AO3; Subscribe shows under AO3 → Subscriptions.
- [ ] AO3L-A4 Sync fills Follows and Favorites without touching FFN.
- [ ] AO3L-A5 After logout, both native fetch and the WebView are logged out.

### install_notes
No prebuild. Template T1.

### risks
Session expiry (2 weeks / 3 months) and `/lost_cookie`; logged-in markup known from otwarchive
source, not live pages, so parsers must be adaptive with "Open on AO3" fallbacks; Cloudflare may
challenge native requests: show "Verify on AO3" in a visible WebView.

### open_questions
| id | question | default |
|---|---|---|
| OQ-2 | Do you have an AO3 account (and a Wattpad one)? | Ask before P6 / P7. **Unanswered** |
| OQ-12 | Send AO3 hit counts? | No |
