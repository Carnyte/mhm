# Testing and verification: checks, test files, helpers, fixtures, budgets, lessons

> Read before writing tests or when a check fails. Import corpus: docs/import.md §8.5.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 8. Testing and verification

---

### 8.1 Checks (run before every commit)

| command | result at `5cc19e8` |
|---|---|
| `npx tsc --noEmit` (`npm run typecheck`) | clean, about 13 s |
| `npx jest` (`npm test`) | **51 suites, 1088 passed + 1 todo (1089)**; 16–32 s (cold slower). Slowest: `tests/import-corpus.test.ts` (299 passed + 1 todo, 11–31 s). Harmless `ExperimentalWarning: SQLite` from `node:sqlite` |
| `npm run lint` (`expo lint && tsx scripts/check-keys.ts`) | clean, prints `check-keys: ok`, about 6 s |
| `npx expo export --platform ios --output-dir <dir outside repo>` | bundles 1565 modules; one `entry-*.hbc` about 4.8 MB (Hermes bytecode) + `metadata.json`, about 22 s |
| `npx expo export --platform web` | builds |
| `npx expo prebuild -p ios --no-install` in a scratch copy (`git archive HEAD \| tar -x`, symlink `node_modules`, `git init` + commit) | OK: `IPHONEOS_DEPLOYMENT_TARGET = 16.4`, empty entitlements, Info.plist has `org.idpf.epub-container` |
| `npx expo-doctor` | **20/21** (11 patch mismatches; README still says 21/21) |
| `npm run live-check -- --source ao3` | 5/5 last recorded (5 requests, 3 s apart; no browser needed) |
| `npm run live-check` (FFN) | 17/17 last recorded (needs Chromium; `xvfb-run -a` headless) |
| `npx tsx scripts/clip-check.ts` | 39/39 at P-CLIP3 (headless Chromium, synthetic pages and sites, no network) |

README's Verification row says `1290 / 1290 pass` (P-UI1); keep it in step in the same commit as new tests (PLAN.md §4 / §5 carry the count too).
Nothing native can be verified in the container: say what still needs a device test.

---

### 8.2 Test files (51) and counts at `5cc19e8`
Added for rotation in page mode EP-6 (75 files, 1333 tests + 1 todo): reader-paging +3 (one column, no zoom; a half-done rotation claiming one page; landscape and back), kindle-reader (native scroll off in page mode).
Added for page-mode places EP-4/EP-5 (75 files, 1330 tests + 1 todo): reader-paging +5 (a fake text layout in jsdom: `Range.getClientRects` says which page a character is on; `--size` and `setPages` / `setBreaks` change the layout), kindle-reader +1 (the last page left reopens in page mode).
Added in P6 login (75 files, 1324 tests + 1 todo): ao3-session 14 (greeting parser on synthetic `greeting_logged_in.html` / `greeting_logged_out.html`, session store and kv, /lost_cookie, download host ignored, sign-in message and navigation rules, scripts never touch the form, token before the logout POST, locked works fetched when logged in, no work or chapter page in a logged-in background check), ao3-signin-screen.tsx 4 (mocked WebView: login confirmed natively, foreign reports ignored, logout of native requests then the WebView), ao3-screens.tsx +2 (Log in to AO3, retry once logged in); `tests/helpers/fakeAo3.ts` records POST bodies and headers.
Added in P-UI1 (73 files, 1290 tests): look 5, kindle-theme 10 (contrast, classic colours untouched), covers 9, kindle-home 8 (tabs per look, Home rows, readingSpot, hidden-tab redirect), kindle-library 10, kindle-story 2, kindle-reader 7 (mocked ReaderWebView: chrome toggle, tap zones, footer, heading, Aa, scrubber; classic unchanged), kindle-discover 4, whats-new 2; reader-template +2 (embedded Literata); story-refresh runs in both looks. Screen tests that need a look set it with `updateSettings({ look })`; the default is now 'kindle'.
Added in P-CLIP3 (63 files, 1230 tests): clip-jobs 9 (engine on real story storage, fake hidden browser, virtual clock; `jest.isolateModules` for a fresh singleton), clip-host 1 (ClipHost + ClipBanner on a mocked WebView), auto-clip +4, next-script +1, clip-script +1; story-refresh 1 (story page reloads clipped chapters; pull to refresh).
Added in P-CLIP2 (60 files, 1213 tests): next-script 22 (jsdom), auto-clip 27 (fake site, virtual clock), clip-report 2; clip-screen +6 (Save & next, quick save, run banner / background / Stop, blur pause, auto=N, What Clip sees), clip-commit +2 (`storyTitle`), clip-parse +1 (same-story / chapter numbers). The screen test mocks `expo-keep-awake`, `expo-clipboard`, `useFocusEffect` and `AppState.addEventListener` (RN's jest preset returns no subscription).
Added in P-CLIP (57 files, 1153 tests at `ca4749f`): web-policy 11, clip-script 10, clip-parse 10 (incl. titles), clip-url 3, clip-commit 14, clip-screen.tsx 8; open-link and native-intent gained cases (example.com now gets the browser offer). jsdom tests use `/** @jest-environment jsdom */`; the screen test mocks `react-native-webview` with a forwardRef that records props and injected scripts.

- AO3: ao3-adapter 14, ao3-download 8, ao3-library 14, ao3-parsers 21, ao3-resume 2, ao3-review 13, ao3-screens.tsx 4, ao3-stale-chapters 13, ao3-updates 25, ao3-urls 49.
- Core: backup 5, blocks 11, bridge 16, chapters 6, ffn-adapter 10, ffn-slots 19, http 20, images 12, keys 34, kv-sqlite 12, library 21, migration-v2 25.
- Import: import-commit 22, import-corpus 300 (299 + 1 todo), import-decode 11, import-epub 42, import-html 28, import-screen.tsx 7, import-sniff 9, import-text 21, local-delete 1, local-source 7, native-intent 13.
- Other: open-link 15, parsers 23, pickers 3, player-local 3, player 33, rate 5, reader-local 5, reader-template 4, registry 43, remap 10, routes-keys 10, sanitize 53, segments 23, session 5, urls-forms 9, voices 7, wattpad-urls 20, webview-config 3.
- Screen tests are `.tsx` with `react-test-renderer` (`act`, `create`).

---

### 8.3 Helpers (`tests/helpers/`)

| helper | use |
|---|---|
| `memoryKv.ts` | `jest.mock('../src/db/kv', () => require('./helpers/memoryKv').kvModule())`; exposes `mem`, `httpRows`, `chapterRows` (`"<key>#<n>"`), `seed(rows)`; JSON-cloned values; maps on `globalThis` so `jest.isolateModules` copies share rows |
| `fakeAo3.ts` | `jest.mock('../src/net/http', () => require('./helpers/fakeAo3').httpModule())`; `on(regex, answer)`, `route(fn)`, `requests` (URL + priority, for counting), `resetFake`, `fixture(name)`, `chapterPage` / `navigatePage` / `serveWork` |
| `fakeFs.ts` | `jest.mock('expo-file-system', () => require('./helpers/fakeFs').fsModule())`; in-memory `File`, `Directory`, `Paths`; `files`, `times`, `putFile`, `reset` |
| `epub.ts` | `buildEpub(spec)` (fflate `zipSync`, `mimetype` first and stored), `xhtml`, `ncx`, `nav`, `png(size)`, `setDeclaredSize` (zip-bomb tests) |
| `corpus.ts` | marker-word text (`words`, `para`, `paras`, `lines`), `epub(toc, files, opts)`, `Case`, `runCase(c)`, `leftOutWarning`, `inOrder`, `allParts`, `LEFT_OUT_MIN = 40` |
| `sqliteNode.ts` | `openNodeDb(path=':memory:')`: `node:sqlite` `DatabaseSync` as the expo-sqlite subset (sync + async), `kvDump`; needs `/** @jest-environment node */` |

Most-mocked modules: `../src/db/kv` (25×), `../src/components/Sheet` (14×), `../src/audio/player` (9×),
`expo-file-system` (7×), `../src/net/http` (7×), `expo-speech` (6×), `expo-router` (6×), `../src/ffn/api` (6×).

---

### 8.4 Fixture policy
- **Synthetic only. Never commit real fanfiction text, real pages or the user's files.**
- `tests/fixtures/*.html` (20): hand-written FFN lookalikes with invented stories.
- `tests/fixtures/ao3/*.html` (15): made by `scripts/synthesize-fixture.ts`, which **keeps** every class,
  id and structure the parsers read, canonical fandom / character / relationship tags, ratings,
  warnings, numbers, ids, dates; **replaces** with seeded lorem `.userstuff` and blockquote text,
  titles, freeform tags, collection names; **renames** creators to `author1…`; **removes** scripts,
  styles, header / footer, kudos / comments, gift recipients; outputs start with
  `<!-- SYNTHETIC FIXTURE made by scripts/synthesize-fixture.ts … -->`. Save the page (one polite
  request) into a scratch dir **outside the repo**, synthesize, check no real title or author remains, commit only the output.
- `tests/fixtures/v1-library.ts`: synthetic v1 library for migration tests.
- Import tests build EPUBs in memory (`tests/helpers/epub.ts`) from marker words.
- The real AO3 / FicHub / FanFicFare sample files used for import smoke tests are gone with the old
  container; in a fresh one the corpus is the guard. Re-download one or two (politely, scratch dir, never committed) only for a manual check.

---

### 8.6 Live-request budgets
Implementer ≤ 15 AO3 requests ≥ 3 s apart (desktop Safari UA, all reported); reviewers ≤ 6; research
"a few polite requests"; `live-check -- --source ao3` at most once per phase / before a release. Stop
hitting a site as soon as challenges start. Never print story text.

---

### 10.15 Testing

| What happened | Rule |
|---|---|
| `ao3-resume` insertion case "failed" because the first test left a listening position in the player's module state | Reset module state per test (`jest.resetModules()` + re-require, or `jest.isolateModules()`); `memoryKv` maps on `globalThis`; if a test passes alone but fails in the suite, suspect leaked state first |
| Jest "did not exit": the player's 1.5 s save timer and the VACUUM timer held the process | `unref?.()` module-level timers (`src/audio/player.ts:56`, `src/db/kv.ts:70`) |
| An FFN ordering test was flaky with equal timestamps | Distinct timestamps or an explicitly unchecked story (`'ffn:9'` in `tests/ao3-updates.test.ts`) |
| `sanitize.test.ts:163` (< 1500 ms) failed once in a full run; `import-screen.test.tsx` hit the 5 s timeout on a cold cache (7 cascade failures) | Rerun alone before chasing; give timing headroom; longer timeouts for cold-cache suites (docs/ROADMAP.md PRE-1) |
| `jest.mock` factories can't reference outer variables | Prefix captured variables with `mock` |
| P-UI1: the container has no iPhone, and the user rejected a restyle seen only when finished (Material You, reverted) | Build behind a switch in small steps; after each, `npx expo export --platform web` + `scripts/web-shots.cjs` (light and dark, next to the preview's own shots) and SendUserFile. The reader page listens for touches, so drive it with `TAP=` (a touch-enabled context), not clicks; RN-web scroll views need the mouse over them before a wheel event |
| 2026-11-01: page mode used the browser's own horizontal scrolling with scroll-snap; the user: "kind of like scrolling but horizontal, that's useless" | Pages are columns moved by a transform with JS swipe handling (`docs/ui_rules.md` §3a EP-1); keep the page script's paging under tests/reader-paging.test.ts (jsdom with defined clientWidth / scrollWidth) and check real touches in Chromium via CDP |
| 2026-11-01: an EPUB with a prologue read "CHAPTER 2 / Chapter 1 …", and a chapter opening with its own heading showed two | For imported books use only the numbers their titles carry and let a chapter's own heading stand (`numbered`, `ownHeading`); file-name titles fall back to the chapter's heading (corpus `ui/titles`) |
| P-UI1: changing the default look made a classic screen test fail (chapter titles moved into the Kindle-style Contents sheet) | Run look-dependent screen tests in both looks (`it.each(['classic','kindle'])` + `updateSettings({ look })`) |
| P-UI1: eslint's react-hooks rules rejected `useRef(...).current` during render and setState inside an effect | `useState(() => new Animated.Value(1))[0]`; adjust state during render from a "seen request" (`?filter=…&at=<ms>`) instead of an effect |
| `player.test.ts` stubbed `src/features/chapters`, so the real offline-first loader went untested | Keep a test that runs the real code a stub replaces (`tests/chapters.test.ts`) |
| A helper bug (empty cookies overwriting the session cookie) hid a bridge bug | Review helpers like code |
| A Python-scripted insert corrupted `Sheet.tsx`'s toast style | Scripted edits assert a unique match and are followed by tsc and lint |
| `scripts/clip-check.ts` first saw no message at all (P-CLIP): Playwright's `setContent` writes into the current document, so `addInitScript` never ran, and tsx adds a `__name` helper to functions passed to `page.evaluate` | In Playwright checks, install page stubs with `page.evaluate('<string>')` after `setContent`; pass strings, not functions |
| jsdom has no `checkVisibility` and only part of CSS, so the capture script's real behaviour needed a browser engine | Run DOM scripts that will run in WebKit through `scripts/clip-check.ts` (headless Chromium) as well as jsdom |
| Real AO3 / FicHub / FanFicFare files were used to check import | Never committed; synthetic fixtures; the corpus is the guard in a fresh container |
