# FicShelf: agent root

> Read this file first, then `ACTIVE_HANDOFF.md`. Together they are enough to start: this file holds
> the rules that never change and a map of which `docs/` file to open for which task; the handoff
> holds the current state and the next task. Open only the docs the task needs.

## What FicShelf is
An unofficial iPhone app for reading fanfiction, sideloaded by one non-developer user from Xcode
with a free Apple ID (no App Store, no over-the-air updates). Expo SDK 57 / React Native 0.86
(Hermes), expo-router, expo-sqlite, react-native-webview, TypeScript (strict).
- **Sources**: FanFiction.net (full client through a hidden WebView "bridge", Cloudflare), AO3
  (reading without login, polite HTTP), imported files (EPUB / HTML / TXT / Markdown as the `local`
  source), **Clip** (any https page saved as text; automatic and background clipping). Wattpad is
  link parsing only (reading on hold).
- **Reader** (themes, Literata, paged / scroll), **audiobook** (on-device TTS incl. Piper voices,
  lock screen), **library** (shelves, collections, downloads, backups), **update checks**
  (foreground + background, local notifications).
- **Look**: Kindle-style by default (four tabs Home / Library / Discover / More, generated covers,
  hidden reader controls), Classic one tap away in Settings → Appearance → Look.

## Stack (installed)
expo 57.0.31 · react-native 0.86.3 · react 19.2.3 · expo-router 57.0.29 · expo-sqlite 57.0.4 ·
react-native-webview 13.16.1 · typescript 6.0.3 · jest 29.7.0 (jest-expo 57.0.6) · Node ≥ 22.13 ·
expo-modules-jsi 57.1.3 (needed for Xcode 27 / Swift 6.4) · `ios.usePrecompiledModules: false`.
Pure-TS parsing: htmlparser2 + css-select + domutils + dom-serializer, fflate (sync only),
@mozilla/readability (JSDOMParser). Details: `docs/ios_build.md`.

## Environments
| | Claude's container (cloud) | The user's Mac + iPhone |
|---|---|---|
| Repo | `/home/user/mhm`, branch `claude/ficshelf-fanfiction-app` (the app is the repo root) | `~/ficshelf` |
| Can | tsc, jest, lint, `expo export`, web build + headless-Chromium screenshots | Xcode Release builds to the phone (Personal Team, cable) |
| Cannot | build or sign iOS, reach the phone | — |
Every change reaches the phone only through a rebuild: T1 (JS only) or T2 (prebuild). Templates:
`docs/user_and_install.md` §2.4.

## Architecture (one screen)
```
Screens (src/app/**, expo-router)      shared screens render SourceUi slots; never branch on the site
  ▼                                     (except Browse home, Search form, Settings → Sources)
Features (src/features/*)              chapters, downloads, updates, chapterIds, imports, clips, actions, adult gate
  ▼
Source layer (src/sources/*)           keys (StoryKey) · types (site-neutral model, Source contract) · registry · ui slots
  ├── ffn/   → src/ffn/api.ts → src/net/bridge.ts → hidden WKWebView → www.fanfiction.net
  ├── ao3/   → src/net/http.ts (polite client, POLICIES) → archiveofourown.org
  ├── local/ → library + chapterStore only (never the network); files from src/import/* (pure TS)
  └── wattpad/ urls.ts only
  ▼
State (src/state/*) · Storage (src/db/*: expo-sqlite kv, chapter_text, http_cache; migrations)
Reader (src/reader/*: buildReaderHtml → WebView) · Audio (src/audio/*) · HTML (src/html/*: El, allowlist sanitizer)
Look: src/theme (palettes, SERIF), src/components/ui.tsx (shared controls), src/components/kindle/* (Kindle screens)
```
Pure core (adapters, parsers, `src/import`, remap, migrations, segments) never imports React
Native, so it runs in Node tests. Full map: `docs/codebase_map.md`; data: `docs/database_schema.md`.

## Unbreakable rules
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
- **R-4 Network politeness (all sites)**: requests only follow something the user did; the
  exceptions are update checks of followed stories and, in P-CLIP2 only, auto-clip runs the user
  starts (visible browser, human pace ≥ 4 s, ≤ 200 chapters a run, stop rules; `docs/clipping/p-clip2.md` §4a), and in P-CLIP3 background jobs the user starts (hidden in-app browser while the app is open, same pace and stop rules, ≤ 2000 chapters a job; `docs/clipping/README.md` §4b). No crawling, no prefetching listings or
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
  say "hold off installing" while reviews run; record user approvals (date + quote) in `docs/history.md` (and the phase spec).
- **R-12 Usage limits**: commit and push a checkpoint as soon as a step is green; split big
  agents; after any cut-off run `git status` / `git diff --stat` and the checks before continuing.
- **R-13 No secrets in docs or code**: no cookie values, tokens, passwords, API keys or the
  user's email address; diagnostics print status codes and field names only.

### The lessons that matter most (old §10.0)
Lessons everywhere in `docs/` are written as **what happened** (commit / file) → **rule**.
1. **Never lose story text silently.** Anything left out gets a "Left out … (about N words)" warning (import, clipping, audiobook note skipping, reader mode).
2. **One rule per behaviour, pinned by a test.** Import heuristics must pass the 299-case corpus; prefer narrowing or reverting a rule over adding one.
3. **Be polite to every site** (`docs/sources_common.md` §6.1): user-triggered requests through the one HTTP client; background work spaced wider and budgeted.
4. **Never get around access control** (paywalls, restricted works, one-time tickets, mature gates, `/cdn-cgi/`). A classifier refusal is final for that approach.
5. **Synthetic fixtures only.**
6. **Prove each regression test fails before the fix** (stash or revert the fix, run, restore).
7. **Tell the user whether a prebuild is needed**, and say "don't delete the app" and "back up first" when stored data changes shape.
8. **Assume a usage limit can cut any step**: commit checkpoints, split big agents, check `git status` before trusting anything.
9. **Every new stored field must pass the normalizers** (`normalizeLocal` is an allowlist and drops unknown fields on every launch).

All other lessons live with their component (see the Context Map); `docs/SECTION_INDEX.md` maps
old section numbers (§10.12 …) to files.

## Checks (run before every commit; R-1)
```
npx tsc --noEmit
npx jest
npm run lint
npx expo export --platform ios --output-dir "$(mktemp -d)"
```
lint must end with `check-keys: ok`; the export dir must be outside the repo. Expected counts are
in `ACTIVE_HANDOFF.md`. UI work also: `npx expo export --platform web --output-dir <tmp>` +
`node scripts/web-shots.cjs <tmp> <shots> light|dark`, screenshots sent to the user. Clip work also:
`npx tsx scripts/clip-check.ts`. Never `npm audit fix`.

## Context Map: what to read for the task
Read the row(s) that match; each file starts with what it holds. Don't load the rest.

| If working on… | Read |
|---|---|
| Anything (first) | `ACTIVE_HANDOFF.md` |
| Talking to the user, install steps, what's confirmed on the phone | `cat docs/user_and_install.md` |
| Phases, priorities, what's next after the current task | `cat docs/ROADMAP.md` |
| Big picture, goals, top-level files, feature-inventory legend | `cat docs/architecture.md` |
| Where code lives (src/ map, routes, scripts) | `cat docs/codebase_map.md` |
| Database, stored data, settings fields, keys, migrations, backups, chapter renumbering | `cat docs/database_schema.md` |
| Source contract, HTTP client / politeness, sanitizer, adding a site | `cat docs/sources_common.md` |
| FanFiction.net (bridge, login, FFN screens) | `cat docs/ffn.md` + `docs/webview.md` |
| AO3 (reading; P6 login phase) | `cat docs/ao3.md` |
| Wattpad (on hold: P4, P7) | `cat docs/wattpad.md` |
| Novelpia | `cat docs/novelpia.md` |
| File import (EPUB / HTML / TXT / MD), import corpus, import extras | `cat docs/import.md` (+ `docs/testing.md` for the corpus helpers) |
| Clipping (Clip this page, Clip & next, auto-clip, background jobs) | `cat docs/clipping/README.md`; specs `docs/clipping/p-clip.md`, `docs/clipping/p-clip2.md` |
| Reader (pages, headings, reader settings) | `cat docs/reader.md` + `docs/webview.md`; Kindle reader controls in `docs/ui_rules.md` |
| Audiobook / TTS | `cat docs/audiobook.md` |
| Library behaviour, update checks, background tasks, notifications | `cat docs/library_updates.md` |
| Any UI change (Kindle look, settings screen, sheets / modals) | `cat docs/ui_rules.md` + `design/kindle-preview/index.html` |
| app.json, plugins, dependencies, Xcode errors, Expo / Hermes limits | `cat docs/ios_build.md` |
| Writing tests, fixtures, a failing check | `cat docs/testing.md` |
| Git, commit style, review workflow, harness limits, resuming after a cut-off | `cat docs/process.md` |
| Something looks like a bug: is it known? | `cat docs/known_issues.md` |
| Why something is so; user decisions; open questions | `cat docs/history.md` |
| A term you don't know | `cat docs/glossary.md` |
| An old reference like "MASTER_FEATURES §10.12" or "FEATURES §4a" | `cat docs/SECTION_INDEX.md` |

## Keeping the docs in step
- `ACTIVE_HANDOFF.md`: current state and the next task only; rewrite it, don't append history.
- Phase checklists live in their spec file (`docs/ui_rules.md`, `docs/clipping/*.md`, …): tick
  `- [x] ID … (commit)` when committed; phase status changes go in `docs/ROADMAP.md` too.
- User approvals and decisions (date + quote): `docs/history.md`. New lessons: the component's file.
- Test counts: README's Verification row, PLAN.md §4 / §5, `docs/testing.md` §8.2, `ACTIVE_HANDOFF.md`.
- New code / files: `docs/codebase_map.md`; new stored fields: `docs/database_schema.md`.

## Session Wrap-Up Protocol
Before any context clear or session end, the agent must update ACTIVE_HANDOFF.md with the current
state, next immediate task, and required file pointers, then stage, commit, and push changes to the
`claude` branch.

In this repository "the `claude` branch" is `claude/ficshelf-fanfiction-app`. Steps:
1. Run the checks (or say in the handoff which ones weren't run and why).
2. Rewrite `ACTIVE_HANDOFF.md`: state (pushed / not, last commit, check counts, what's on the phone),
   the next immediate task, the files to read for it, anything left half-done.
3. Update the docs the work touched (see "Keeping the docs in step").
4. `git add -A` (scratch files never go in the repo), commit with the R-2 message shape and the
   current session's attribution lines, `git push -u origin claude/ficshelf-fanfiction-app`
   (retry network failures up to 4 times: 2 s, 4 s, 8 s, 16 s).
5. Check `git status -sb` shows nothing left and the branch up to date with origin.
