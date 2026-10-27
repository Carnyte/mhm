---
doc: FEATURES
purpose: >-
  Next-work plan for FicShelf. A resuming Claude instance reads this file first, then the
  sections of MASTER_FEATURES.md named in the resume protocol. Everything needed is written here
  or in the repo; nothing outside the repo (scratch files, transcripts, research downloads) will
  exist in a fresh container.
project: FicShelf
repo: https://github.com/Carnyte/mhm
local_clone: /home/user/mhm
user_clone: ~/ficshelf (the user's Mac)
branch: claude/ficshelf-fanfiction-app
base_commit: 7546679
base_commit_date: 2026-10-27
commits_at_base: 164
updated: 2026-10-27
next_task: P4
companion: MASTER_FEATURES.md
status:
  summary: >-
    The FanFiction.net client, AO3 reading without login and file import (EPUB / HTML / TXT /
    Markdown, stored as the 'local' source) are built, reviewed, verified and pushed. No pending
    phase has been started. "Clip this page" for any website (approved 2026-10-21) was built and
    pushed on 2026-10-27 (tests and a headless-Chromium check only; not yet on the phone). Next:
    P4 Wattpad reading.
  done:
    - M1-M5 FanFiction.net client, reader, audiobook (TTS incl. Piper add-on voices), device fixes
    - P0-P1 source-qualified StoryKeys + storage v2 migration
    - P2 source layer (Source contract, registry, polite HTTP client, sanitizer, remap)
    - P3 AO3 reading loop (no login)
    - P5 file import as the local source + golden import corpus
    - P-CLIP "Clip this page" for any https site (device check pending)
  pending_in_order: [P4, P6, P7, P8, P-IMPORT-X, P-NOVELPIA]
  checks_at_base:
    tsc: clean
    jest: "57 suites, 1153 passed + 1 todo (1154 total)"
    import_corpus: "299 passed + 1 todo"
    lint: "clean, prints check-keys: ok"
    expo_export_ios: "bundles; one entry-*.hbc of about 4.9 MB"
    clip_check: "npx tsx scripts/clip-check.ts: 28/28 (headless Chromium, no network)"
    expo_doctor: "20/21: 11 patch-version mismatches (README still says 21/21)"
  device_confirmed: >-
    Builds through e2c8ac5 ("everything works", 2026-10-06) and the Piper Lessac voice (build
    about 31439d4, 2026-10-07). No device report since 2026-10-07.
  not_yet_confirmed_on_device:
    - c79d776 Piper speed mapping (user was asked to try Lessac at 0.5x, 0.9x and 2x)
    - 3321ff1 / 4b7f0ba blank-reader rebuild and "skip author's notes"
    - afafdf2 / 57ec6be storage v2 migration on the real library
    - bf3f9f5..a315dbe AO3
    - 44a9f71..5cc19e8 file import and "Open in FicShelf" (install message with prebuild sent 2026-10-21)
    - 1cca7be.. P-CLIP "Clip this page" (JS only, no prebuild; CLIP-A1..A9 to try)
---

# FicShelf: next work

This file is the queue of pending work. Each phase has a stable id, a fixed field layout and
`- [ ]` checklists with sub-ids (`CLIP-1`, `WP-3`, …). Tick a box as `- [x]` and append the commit
hash (`- [x] CLIP-4 … (a1b2c3d)`) when the item is committed. Change a phase's `status` to
`in_progress` when you start it and `done` when its acceptance list passes on the user's phone (or
`done (device check pending)` when only tests have run). Update `base_commit`, `updated` and
`next_task` in the front matter in the same commit.

Status values: `pending`, `in_progress`, `done`, `blocked (<reason>)`, `optional`, `only-if-asked`.

---

## 1. Resume protocol

1. **Read this file** top to bottom: the front matter, the rules in §2, the order in §3, then the
   phase named by `next_task`.
2. **Read MASTER_FEATURES.md**:
   - §2 "The user" (how they build, test and install; how to talk to them);
   - §9 "Process and conventions" (git, commits, workflows, harness constraints);
   - §10 "Lessons learned" (the rules in §10.0 apply to every change);
   - then §4 (architecture and codebase map) and §5 (data model and storage) for the files the phase touches.
3. **Verify the repo** (one command per line):
   ```
   cd /home/user/mhm
   git fetch origin
   git status -sb
   git log --oneline -5
   git config user.email
   ```
   Expect branch `claude/ficshelf-fanfiction-app`, a clean tree, up to date with
   `origin/claude/ficshelf-fanfiction-app`, HEAD at or after `5cc19e8` (plus the commit that added
   this file), and `noreply@anthropic.com`. Never change git config. If the tree is dirty, a
   previous session was cut off mid-step: read `git diff --stat`, decide whether the partial work
   is usable, and re-run the checks before trusting it.
4. **Verify the toolchain**:
   ```
   node -v
   npm ci
   ```
   Node must be 22.13 or later (`package.json` engines). Ignore npm's vulnerability notice; never
   run `npm audit fix` (it breaks the SDK 57 pins). If `npm ci` fails on the lockfile, use
   `npm install`.
5. **Run the checks** and compare with `checks_at_base` in the front matter:
   ```
   npx tsc --noEmit
   npx jest
   npm run lint
   npx expo export --platform ios --output-dir "$(mktemp -d)"
   ```
   - jest: the count in `checks_at_base`. The cold-cache timeout in `tests/import-screen.test.tsx`
     and the sanitizer timing check were given headroom in PRE-1 (1cca7be); if a timing test still
     fails once under load, rerun it alone before chasing it.
   - lint must end with `check-keys: ok`.
   - The export output dir must be outside the repo.
   - Optional, at most once per phase: `npm run live-check -- --source ao3` (5 AO3 requests, 3 s apart).
6. **Do the preflight items** (§1.1). They are small; commit them with the first phase commit or on their own.
7. **Pick the task**: the first phase in §3 whose status is `pending` (P4 at this writing). A new
   message from the user overrides this order. Tell the user in one or two plain lines what you are
   picking up.
8. **Work the phase**:
   - re-read the code the phase touches (the file lists below were checked at `5cc19e8`; re-check
     line-level claims);
   - plan the checklist items as tasks;
   - implement, then review with 2–4 lenses, fix, verify independently, then a bounded confirm
     (MASTER_FEATURES.md §9.5);
   - follow §2 (rules), the per-site policies, the fixture policy and, for import changes, the
     corpus rules;
   - commit a checkpoint as soon as a step's checks are green (usage limits cut sessions off).
9. **Ship**: re-run every check yourself; update README's Verification row (`| N / N pass |`), the
   README / PLAN / INSTALL text and this file (ticks, status, front matter); commit with the
   required trailers; push.
10. **Report to the user** in plain language: state ("pushed, ready to install" or "pushed, don't
    install yet"), commit hash, test count, what changed (short bullets, no file paths), what was
    only tested versus confirmed on a phone, the exact install steps (MASTER_FEATURES.md §2.4,
    T1 or T2, one command per code block), what to try on the phone, and "don't delete the app".

### 1.1 Preflight (do first in the next session)

- [x] PRE-1 Add `jest.setTimeout(30_000);` at the top of `tests/import-screen.test.tsx` (cold-cache
      timeout cascade). Optionally give `tests/sanitize.test.ts:163` more headroom (for example
      3000 ms). (1cca7be)
- [x] PRE-2 Fix stale docs (1cca7be):
  - `PLAN.md` §4 (`npm test # unit tests (712)`) and §5 ("712 unit tests") → the current count;
  - `INSTALL.md` intro line 7 ("Nobody has run a full iPhone build of this branch yet") → the user
    has built and run it since 2026-10-06;
  - `README.md` line ~197 "Not verified here" bullet about the desktop UA / redirect / background
    audio "haven't run on an iPhone yet" → confirmed "everything works" on 2026-10-06;
  - `README.md` Verification row `npx expo-doctor | 21 / 21` → 20/21 with the patch drift noted,
    or fix the drift (PRE-4);
  - INSTALL "The file-import update": add "check the scheme is still Release" after prebuild.
- [x] PRE-3 `scripts/live-check.ts`: any `--source` other than `ao3` silently runs the FFN check
      (`target = … : 'ffn'`, line ~288). Reject unknown values with a message (a `wp` branch comes
      in P4). (1cca7be)
- [ ] PRE-4 (skipped in P-CLIP, a JS-only phase; only bundled with the next native change, never on its own) `npx expo install --check`
      to clear the 11 patch mismatches (`expo` 57.0.27 → ~57.0.31, `expo-router` 57.0.25 → ~57.0.29,
      `jest-expo` 57.0.5 → ~57.0.6, …). These are native packages, so this makes the user's next
      update a prebuild (T2). Not needed for P-CLIP; do not do it in a JS-only phase.

---

## 2. Rules that always apply

- **R-1 Checks before every commit**: `npx tsc --noEmit`, `npx jest`, `npm run lint`,
  `npx expo export --platform ios --output-dir <dir outside repo>`. Keep README's test count in step.
- **R-2 Git**: branch `claude/ficshelf-fanfiction-app`; `git push -u origin claude/ficshelf-fanfiction-app`;
  no pull request unless the user asks. Subject: imperative, plain English, user-visible effect,
  no `feat:` prefix, no trailing period, about 50–75 characters. Body wrapped at about 72 columns:
  a short "why" paragraph, then `- ` bullets. End with exactly the two attribution lines from the
  **current** session's system reminder (a `Co-Authored-By:` line and a `Claude-Session:` URL line),
  copied verbatim; check the shape with `git log -1 --format=%B`. No model names or ids anywhere
  else (subjects, bodies, code, docs). Agents never commit; the main session does.
- **R-3 Fixtures are synthetic only**: never commit real fanfiction text, real site pages or the
  user's files. Shapes only, lorem text, invented names. AO3 pages: `npx tsx scripts/synthesize-fixture.ts in.html tests/fixtures/ao3/out.html`
  with the saved page in a scratch dir outside the repo. Never paste real story text into tests,
  docs, commits or messages.
- **R-4 Network politeness (all sites)**: requests only follow something the user did; the one
  exception is update checks of followed stories. No crawling, no prefetching listings or
  libraries, no background bulk downloads. Every request goes through `src/net/http.ts` /
  `src/net/httpCore.ts` `POLICIES` (one request in flight per host, minimum gaps, 429 / Retry-After
  honoured, rest after any 5xx, GET retried once, POST never). Live checks are budgeted (AO3: 5
  requests, 3 s apart).
- **R-5 Never get around access control**: paywalls, restricted works, a site's one-time tickets
  or signed URLs, mature gates, `/cdn-cgi/` links. If the auto-mode classifier denies an action,
  stop; do not route around it; explain and offer the approved alternative.
- **R-6 Never lose story text silently**: anything left out gets a "Left out … (about N words)"
  warning (import, clipping, reader mode, audiobook note skipping). Import heuristic changes must
  pass `tests/import-corpus.test.ts`; add a failing corpus case first.
- **R-7 Prove each regression test fails before its fix** (stash the fix or run against the base
  commit), then passes after.
- **R-8 Native changes**: free Apple ID, so no new entitlements (App Groups, Associated Domains,
  iCloud, Push). Any new native module or change to `app.json` `ios` / `infoPlist` / `plugins`, or
  to `plugins/`, needs `npx expo prebuild -p ios` on the user's Mac. Say in every update message
  whether prebuild is needed. Keep `plugins/withoutPushEntitlement.js` first in `plugins`. Add
  native deps with `npx expo install`.
- **R-9 Storage changes**: migrations never throw, run in one verified transaction, keep unknown
  fields, stay readable by the previous build; `normalizeStory` / `normalizeLocal` re-validate
  stored records on every load and **drop fields they don't know** (`normalizeLocal` in
  `src/db/migrations/v2.ts`), so every new stored field must be added there. Ask the user to back
  up first when stored data changes shape.
- **R-10 Keys**: every story is a source-qualified `StoryKey` (`ffn:123`, `ao3:5`, `wp:6`,
  `local:<uid>`); remote ids are opaque strings outside FFN-only code; `scripts/check-keys.ts`
  (part of `npm run lint`) enforces it.
- **R-11 Talk plainly**: short status lines; one command per code block; say what is test-only;
  say "hold off installing" while reviews run; record user approvals (date + quote) in this file.
- **R-12 Usage limits**: commit and push a checkpoint as soon as a step is green; split big
  agents; after any cut-off run `git status` / `git diff --stat` and the checks before continuing.
- **R-13 No secrets in docs or code**: no cookie values, tokens, passwords, API keys or the
  user's email address; diagnostics print status codes and field names only.

---

## 3. Order

| order | id | title | status | depends_on | prebuild for the user | gate |
|---|---|---|---|---|---|---|
| 1 | P-CLIP | "Clip this page" for any website | done (device check pending; built 2026-10-27) | P5 (done) | no (https only) | none |
| 2 | P4 | Wattpad reading, no login | pending (next) | P1–P3 (done) | no | Wattpad terms posture (OQ-1, default yes) |
| 3 | P6 | AO3 login and social | pending | P3 (done) | no | user has an AO3 account (invite-only) |
| 4 | P7 | Wattpad login and social | pending | P4 | no | Wattpad account + the ≤10-request endpoint check |
| 5 | P8 | Polish and optional extras | pending (per item, user interest first) | P4 for "All" search | no (share extension: yes) | per item |
| 6 | P-IMPORT-X | Import extras: EPUB export, `.ficshelf` backup, FicHub, share extension | only-if-asked | P5 | `.ficshelf` Open-in and share extension: yes | user request |
| 7 | P-NOVELPIA | Optional Novelpia source | optional | P-CLIP | no | Novelpia's terms read + user go-ahead + short live test with OK |

The design notes numbered phases differently (Phase 4 = Wattpad, Phase 5 = import, though import
was built first; old workflow scripts are named `phase5-*`). Use the ids above, not numbers.

---

## 4. P-CLIP: "Clip this page" for any website

```yaml
id: P-CLIP
title: Clip this page (any website)
status: done (device check pending)
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
  or scheduled clipping, no prefetch. **Zero** extra network requests per clip: FicShelf reads only
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
change. Send template T1 (MASTER_FEATURES.md §2.4): `cd ~/ficshelf`, `git pull --autostash`,
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

---

## 5. P4: Wattpad reading loop (no login)

```yaml
id: P4
title: Wattpad reading, no login
status: pending
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

---

## 8. P8: Polish and optional extras

```yaml
id: P8
title: Polish and optional extras
status: pending
order: 5
depends_on: [P4 for "All" search; other items independent]
native_rebuild: no (except the share extension, which lives in P-IMPORT-X)
approved_by_user: none; each item needs the user's interest before building
```

### why
Quality-of-life items from the design that the user hasn't asked for yet.

### scope
- [ ] POL-1 "All" federated search (`src/app/(tabs)/search.tsx`): one request per enabled source,
      **only on submit**, a section per source, no paging until asked.
- [ ] POL-2 "Find on another site": search other sources by title + author; on confirmation move
      reading progress, mapping chapters by title then number (reuse `mapChaptersByTitle` from
      `src/features/imports.ts` and `remapStoryState` from `src/sources/remap.ts`).
- [ ] POL-3 AO3 creator's style (work skins) toggle: fetch the skin `<style>` from
      `?view_full_work=true` when turned on for a work; sanitize the CSS (scope under `#workskin`;
      drop `url()`, `@import`, `position: fixed`, `expression()`); store it with the download.
- [ ] POL-4 Optional offline images: at download time save AO3 / Wattpad chapter images
      (img.wattpad.com is public; AO3 images are on arbitrary hosts) into a per-story folder as
      `img/<n>.<ext>`, swapped in as `data:` URIs like imports; cap 5 MB each.
- [ ] POL-5 Clean-up migration: stop writing legacy `Collection.storyIds` / `Bookmark.storyId`, drop
      the legacy `chapters` table; `SCHEMA_VERSION` 2 → 3 in `src/db/migrations/index.ts`, re-runnable,
      real-SQLite tests (`tests/helpers/sqliteNode.ts`). Downside: an older build installed afterwards
      sees empty collections; say so in INSTALL.md (template T3).
- [ ] POL-6 Updates tab grouped by day (optional).
- [ ] POL-7 Add `react-test-renderer` (19.2.3) to devDependencies explicitly (today it arrives only
      through jest-expo).
- [ ] POL-8 A test for the `withKnownTitles` safety net (removing it still passes all AO3 suites).

### files
Per item: `src/app/(tabs)/search.tsx`; `src/features/actions.ts`; `src/sources/ao3/{api,adapter}.ts`,
`src/reader/template.ts`; `src/features/downloads.ts`, `src/reader/images.ts`;
`src/db/migrations/{index,v3}.ts`; `src/app/(tabs)/updates.tsx`; `package.json`; `tests/ao3-*.test.ts`.

### data / API details
Work skins: AO3 renders the skin as a `<style>` in the full-work page; sanitize as above. Images: same
caps and file layout as imports (`Documents/imports/…` style per-story folders).

### policies
"All" search sends exactly one request per source on submit; no prefetching. Migration follows R-9.

### tests
Per item, following the existing patterns (request counts for POL-1; real SQLite for POL-5; CSS
sanitizer attack cases for POL-3).

### acceptance
Per item, agreed with the user before building.

### install_notes
No prebuild for any of these. POL-5 changes storage: template T3 (back up first).

### risks
POL-5 breaks reinstalling an older build; POL-3 CSS injection if the sanitizer is weak.

### open_questions
Which items the user wants (none chosen yet).

---

## 9. P-IMPORT-X: import extras the user did not pick

```yaml
id: P-IMPORT-X
title: Import extras (EPUB export, .ficshelf backup, FicHub, share extension)
status: only-if-asked
order: 6
depends_on: [P5 (done)]
approved_by_user: >-
  No. On 2026-10-08 the user picked EPUB + HTML/TXT import and did NOT pick "Links from other
  sites" or "Backup / export".
native_rebuild: EPUB export and FicHub no; .ficshelf Open-in yes; share extension yes (+ an App ID)
```

### why
Imported (and clipped) stories exist only on the phone and are not in backups; no export.

### scope
- [ ] IMPX-1 EPUB export (no prebuild): `src/import/exportEpub.ts` `writeEpub(story, chapters, images): Uint8Array`,
      EPUB 3 via fflate `zipSync`: `mimetype` stored first and **uncompressed** (`level: 0`,
      `application/epub+zip`); `META-INF/container.xml` → `OEBPS/content.opf` with `dc:identifier`
      (`urn:uuid:`), `dc:title`, `dc:creator`, `dc:language`, `dcterms:modified`, `dc:source` (story URL
      when known), manifest, spine, `properties="cover-image"`; `OEBPS/nav.xhtml` (`epub:type="toc"`);
      one XHTML per chapter, notes as `aside`; a title page with "Original source: <a>". A research
      prototype passed EPUBCheck 5.3.0 with 0 errors / 0 warnings; it isn't in the repo: rebuild to
      that structure and re-validate. Share with `Sharing.shareAsync(uri, {mimeType: 'application/epub+zip', UTI: 'org.idpf.epub-container'})`.
      Scope: local stories by default; for AO3 works offer **"Download EPUB from AO3"** instead; FFN and
      Wattpad export is OQ-6 (default no).
- [ ] IMPX-2 `.ficshelf` full backup: a zip (fflate) with `backup.json` (`BackupFile`, new version),
      `chapters/<key>/<n>.html` and `imports/<dir>/*` for local stories (**clipped stories included**),
      optionally site-story downloads (off by default). Restore through "Open in FicShelf" (`sniff.ts`
      sees a zip containing `backup.json`). `app.json`: `CFBundleDocumentTypes` adds
      `com.ficshelf.backup` (Editor / Owner) and `UTExportedTypeDeclarations` declares it with
      extension `ficshelf` → **prebuild**. The old `.json` backup stays importable. Fix the backup
      picker in `src/app/settings.tsx` to use MIME types, not `'public.json'` (expo-document-picker
      drops UTI strings). Keep "Imported stories exist only on this device" until this ships.
- [ ] IMPX-3 FicHub opt-in (no prebuild): `GET https://fichub.net/api/v0/epub?q=<url-encoded story URL>` →
      `{err:0, urlId, info, meta:{title, author, authorUrl, chapters, words, status, created, updated, description, source, rawExtendedMeta}, hashes:{epub:<md5>}, urls:{epub, html, mobi, pdf}}`;
      download `'https://fichub.net' + urls.epub` → `parseImport`; also `/api/v0/meta?q=`. FicHub's
      "Unstable API" rules: custom UA with contact (`POLICIES['fichub.net'].userAgent` is already
      `FicShelf/1.0 (personal reader app; +https://github.com/Carnyte/mhm)`), no concurrent requests,
      honour 429 / Retry-After, no exporting a large fraction of a site; v0 may change; content may be
      stale. Store `fichubId` (`urlId`) and `fichubHash` (`hashes.epub`) in `LocalOrigin` (+ `normalizeLocal`);
      re-check only on request. Sites: SpaceBattles, SufficientVelocity, QuestionableQuesting (XenForo),
      FFN, FictionPress, AO3, HPFanficArchive, SIYE, AdultFanfiction.org, Worm/Ward and others; **not**
      Wattpad or Royal Road. Opt-in toggle, off by default.
- [ ] IMPX-4 Share extension (prebuild, App ID, Xcode signing): `expo-share-intent` 8.0.1 (SDK 57 →
      8.0+; peers `expo ^57`, expo-linking ≥57.0.1, expo-constants ≥57.0.3); native Swift, writes to App
      Group `group.<bundleId>`, opens `<scheme>://dataUrl=<scheme>ShareKey?nonce=…#<type>`; adds
      `com.apple.security.application-groups` and target `<bundleId>.share-extension`;
      `iosActivationRules` WebURL, WebPage, Text, File. Free-ID cost: one more App ID (10 per 7 days),
      setting the Team on the ShareExtension target after **every** prebuild, App Group under the
      Personal Team; scene-lifecycle compatibility unverified. **Recommended instead**: the Shortcut +
      bookmarklet help page (CLIP-16).

### files
`src/import/exportEpub.ts`, `src/state/library.ts` (BackupFile), `src/import/sniff.ts`,
`src/app/import.tsx`, `src/app/settings.tsx`, `app.json`, `src/features/fichub.ts` (new),
`src/db/migrations/v2.ts` (`normalizeLocal` fields).

### data / API details
In scope above.

### policies
FicHub opt-in, one request at a time, contact UA; backups never include cookies or session data.

### tests
- [ ] IMPX-T1 `tests/export-epub.test.ts`: export → `parseImport` round trip (titles, words, images equal).
- [ ] IMPX-T2 `tests/backup-zip.test.ts`: round trip; hostile zip (zip-slip, zip bomb) refused; v1 / v2 JSON still accepted.
- [ ] IMPX-T3 FicHub fake transport: one request at a time, 429 honoured, opt-in respected.

### acceptance
Per item with the user.

### install_notes
IMPX-1 / IMPX-3: T1. IMPX-2 / IMPX-4: T2 (prebuild); IMPX-4 also needs the extension target's signing in Xcode.

### risks
App ID budget on a free account; FicHub API instability; backup size.

### open_questions
| id | question | default |
|---|---|---|
| OQ-6 | EPUB export of downloaded site stories? | Only imported files; for AO3 link to AO3's own EPUB |
| OQ-8 | Import defaults | Built: keep originals on, ask to link AO3 / FFN files. Full backup: imported text always, site downloads off (not built) |
| OQ-9 | Links from Safari | Shortcut + bookmarklet (CLIP-16); share extension only on request |
| OQ-10 | FicHub and clipping for other sites | Clip approved (P-CLIP); FicHub opt-in, only if asked |

---

## 10. P-NOVELPIA: optional Novelpia source

```yaml
id: P-NOVELPIA
title: Optional Novelpia source
status: optional
order: 7
depends_on: [P-CLIP]
native_rebuild: no
approved_by_user: >-
  No. Offered on 2026-10-21 as option 1 (a full source); the user chose Clip ("option two") and
  asked for any future website.
gate: (1) read Novelpia Global's terms of service; (2) the user's explicit go-ahead; (3) a short live test with the user's OK
```

### why
For heavy Novelpia reading: browsing, story pages, new-chapter alerts. Clip is one tap per chapter
(a 111-chapter story means 111 clips).

### scope
- [ ] NP-1 Read Novelpia Global's terms; summarise for the user; get a go-ahead.
- [ ] NP-2 Add a source id (`'np'` or `'novelpia'`) to `SOURCE_IDS` in `src/sources/keys.ts` with
      key tests; fill every `Record<SourceId, …>` table (`SOURCE_NAMES`, `REMOTE_ID`, palette in
      `src/theme/index.ts`, `SourceChips.LABELS`, `DEFAULT_SOURCES` (off), `UIS`, registry, `LINK_ORDER`
      before `ffn`); follow the "add a new Source" checklist in MASTER_FEATURES.md §6.6.
- [ ] NP-3 `src/sources/novelpia/{urls,api,map,adapter,ui}.ts`; metadata from `__NUXT_DATA__`
      (synthetic decoder) or public `/v1/novel`, `/v1/novel/episode/list` (params unverified) on
      `api-global.novelpia.com`.
- [ ] NP-4 A viewer WebView host (new, modelled on `src/net/BridgeHost.tsx`): text comes only from
      Novelpia's own viewer rendered in a WebView and captured with P-CLIP's capture script; one
      chapter per user action ("Read" / "Save chapter").
- [ ] NP-5 Locks: lock state from what the viewer showed (text, or a paywall / login notice), not
      `flag_free`; locked → **Open on Novelpia**; codes `0003` / `0008` (`NOVEL_ERROR`) → "Not available here".
- [ ] NP-6 Downloads, if offered at all: user-started, sequential, spaced, stoppable; default:
      chapters saved only as read.

### files
`src/sources/novelpia/*`, a new viewer host component, `src/sources/keys.ts` and the
`Record<SourceId,…>` tables, `src/net/httpCore.ts` `POLICIES` for `api-global.novelpia.com` /
`global.novelpia.com`.

### data / API details
See P-CLIP "Novelpia findings" (fields, endpoints, error codes, sample ids). Other endpoints seen in
the public JS (not called): `/v1/novel`, `/v1/novel/count`, `/v1/novel/list`, `/v1/novel/episode/list`,
`/v1/novel/episode/cursor-list`, `/v1/novel/episode/total-count`, `/v1/novel/episode/all-count`,
`/v1/novel/episode/first?novel_no=`, `/v1/novel/episode/next?novel_no=&episode_no=&sort_no=`,
`/v1/novel/episode/prev?…`, `/v1/novel/episode/metadata?novel_no=&episode_no=`,
`/v1/novel/episode/image?_t=`, `/v1/novel/episode/good` (POST), `/v1/login/me`, `/v1/member/login`,
`/v1/novel-rank`, `/v1/curation`.

### policies
Free and unlocked chapters only. **Never extract, store or replay the `_t` ticket, `signed_key` or
CloudFront signed cookies / URLs; never call `/v1/novel/episode/content` from app code.**

### tests
- [ ] NP-T1 Synthetic `__NUXT_DATA__` decoder.
- [ ] NP-T2 **No request URL contains `_t=` or `/episode/content`, and no stored value contains `signed_key`.**
- [ ] NP-T3 Lock UI.

### acceptance
With the user, after the gate.

### install_notes
No prebuild. Template T1.

### risks
Terms unknown; paywall sensitivity (the classifier already refused ticket handling once); Nuxt
data shape may change.

### open_questions
| id | question | default |
|---|---|---|
| OQ-NP-1 | Build a full Novelpia source? | Only after reading the terms and with the user's go-ahead; Clip covers it until then. **Unanswered** |

---

## 11. Known open minor issues (left at 5cc19e8; none loses text silently)

| id | where | what | recommendation |
|---|---|---|---|
| ISSUE-M1 (low, crafted) | `src/import/text.ts` ~l.205, the `surer` clause of the Roman-numeral stammer rule | Two doubtful lines with the same numeral adjacent: the dotted form always wins. A TXT with `V – Vows are made.` (100 words) then `V. Very well.` puts chapter V's first ~100 words at the end of IV, and V is titled by the stammer. `49442b7` and `16eaf18` kept the real heading. | Not pinned in the corpus. Leave unless a real file shows it. If fixing: add the corpus case first, then check `r3/p8` A–C and `r4/a2` A–C still pass |
| ISSUE-D3 (accepted) | `src/import/epub.ts` front-matter rules; corpus `r4/a5 D3` | A shared "Title Page" whose prologue's first paragraph mentions "copyright" is read as a notice and left out, with a counted warning ("Left out “Title Page” … about 212 words") | Pinned as `keptOrWarned` (either result passes). A fix needs a new rule; don't add one without a real file |
| ISSUE-G5 (cosmetic) | EPUB; corpus `r4/a6 G5` | Field lines ("Fandom: … Rating: …") in an unnamed file after the Title Page show as text in the Introduction chapter | Not pinned (`words: [null, …]`) |
| ISSUE-NEST (todo) | `tests/import-corpus.test.ts:2555` `it.todo('r1/nest: 12,000 unclosed tags overflow the stack in every tree …')` | 12,000 nested unclosed tags overflow the stack in a recursive DOM walk (domutils / dom-serializer style) | Measure depth iteratively right after parsing; above about 2,000 levels flatten or refuse with `ImportError('invalid', 'This page is nested too deeply to import.')`; then turn the todo into a case. Also relevant to Clip (CLIP input is a page) |
| ISSUE-FLAKE-1 | `tests/import-screen.test.tsx` | Cold transform cache: first test hits jest's 5 s timeout; 7 cascade failures; rerun passes | PRE-1 |
| ISSUE-FLAKE-2 | `tests/sanitize.test.ts:163` | `< 1500 ms` timing assertion failed once in a full parallel run (1087/1088) | More headroom (PRE-1) |
| ISSUE-WEB-COOKIE | `src/app/web.tsx` `onMessage` | Any page in the in-app browser could post `{type:'cookies'}` into `bridge.updateCookies` | CLIP-3 |
| ISSUE-LIVECHECK | `scripts/live-check.ts` ~l.288 | Unknown `--source` silently runs the FFN check | PRE-3; `wp` branch in WP-17 |
| ISSUE-DOCTOR | deps | `npx expo-doctor` 20/21: 11 patch mismatches | PRE-4, only with the next native change |
| ISSUE-XCODE-SWIFT (fixed 2026-10-27) | `app.json` expo-build-properties | After an Xcode update (Swift 6.4) the user's build failed: Expo's npm-shipped precompiled ExpoModulesCore (built with Swift 6.3.1) can't be read ("this SDK is not supported by the compiler", "Cannot find type '__ObjC::expo'") | `ios.usePrecompiledModules: false` (the Podfile then forces `EXPO_USE_PRECOMPILED_MODULES=0`): Expo modules build from source on the Mac. Native change: T2 (prebuild). Keep it unless Expo's prebuilts follow Xcode |
| ISSUE-DOCS | `PLAN.md`, `INSTALL.md`, `README.md` | Stale counts and device statements | PRE-2 |
| ISSUE-TITLES | `src/sources/meta.ts` `withKnownTitles` | Removing this safety net still passes all AO3 suites (untested) | POL-8 |
| ISSUE-RTR | `package.json` | `react-test-renderer` only arrives through jest-expo | POL-7 |

Already fixed in `5cc19e8`, do not reopen: "Start"-only EPUBs whose files open with bold named
titles stay one chapter per file with the mismatch warning; files run on as one chapter only when
the book says it's a one-shot (its TOC entry equals the book title, or its fields say `Chapters: 1/1`).

---

## 12. Open questions and defaults (all phases)

| id | question | recommended default | status |
|---|---|---|---|
| OQ-1 | Accept Wattpad's terms risk (personal use only, "don't scrape") for your own account? | Yes, as designed (P4 policies). Alternative: online only | **Unanswered.** Notice in What's new and Wattpad settings; Wattpad off until turned on |
| OQ-2 | AO3 account (invite-only) and Wattpad account? | Build read-only phases regardless; P6 only with an AO3 account; P7 only with a Wattpad account + the ≤10-request check | **Unanswered.** Ask before P6 / P7 |
| OQ-3 | Order of work | — | **Answered 2026-10-08**: AO3 first, reading before login, import before Wattpad. **Updated 2026-10-21**: P-CLIP next, before Wattpad |
| OQ-4 | Tab bar order | Keep Browse / Search / Library / Updates / Account; cross-source Continue reading on Browse | Default in effect |
| OQ-5 | AO3 adult content | Ask before Mature / Explicit / Not Rated, "Always show" in Settings | Built (`src/features/adultGate.ts`) |
| OQ-6 | EPUB export of downloaded site stories? | Only imported files; AO3 → AO3's own EPUB | Open; only if P-IMPORT-X is requested |
| OQ-7 | Wattpad story deleted / unpublished | Mark "No longer on Wattpad"; ask once about deleting offline text; keep progress | For P4 |
| OQ-8 | Import defaults | Keep originals on; ask to link AO3 / FFN files; full backup: imported text always, site downloads off | Built except the full backup; clips never keep the original page |
| OQ-9 | Getting links from Safari | Shortcut + bookmarklet; share extension only on request | Help page not built (CLIP-16) |
| OQ-10 | FicHub and page clipping | Opt-in | Clip approved (P-CLIP); FicHub only if asked |
| OQ-11 | Pre-upgrade DB copy `ficshelf-pre-v2.db` | Keep 30 days, deletable earlier in Settings | Built |
| OQ-12 | AO3 hit counts | Don't send | Default in effect; revisit in P6 only if asked |
| OQ-CLIP-1..9 | Clip details | See §4 open_questions | For P-CLIP |
| OQ-WP-3, OQ-WP-4 | Wattpad default and file linking | See §5 | For P4 |
| OQ-NP-1 | Full Novelpia source? | Only after terms + go-ahead | **Unanswered** |
| OQ-TTS | Kokoro on-device neural TTS (~215–400 MB, ~800 MB RAM, native code) or BYO-key cloud voices (Azure, Speechify, Google)? | Not built; offered 2026-10-07, user didn't pick one and uses Piper Lessac | Only on explicit request |

---

## 13. Change log of this file

| date | commit | change |
|---|---|---|
| 2026-10-21 | 6320411 | Created from the session state at `5cc19e8`: P-CLIP next (approved 2026-10-21), then P4, P6, P7, P8, P-IMPORT-X, P-NOVELPIA |
| 2026-10-27 | 1cca7be..7546679 | Preflight PRE-1..3 done (PRE-4 waits for a native change); P-CLIP built (CLIP-1..18, T1..T8), device check pending; next P4 |
