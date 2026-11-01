# Project overview, architecture and top-level layout

> Read for the big picture: goals, layers, top-level files, the feature-inventory legend.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## Stack and check snapshot (front matter of the old AGENT_ROOT.md + docs/)

```yaml
doc: MASTER_FEATURES
purpose: >-
  Full project context for FicShelf: the user, environments, architecture, data model, sources and
  their policies, every feature with its status, testing, process, lessons learned, history and
  glossary. Next work lives in docs/ROADMAP.md.
project: FicShelf
app_name: FicShelf (npm package name fanfic-reader)
repo: https://github.com/Carnyte/mhm
local_clone: /home/user/mhm
user_clone: ~/ficshelf (the user's Mac)
branch: claude/ficshelf-fanfiction-app
base_commit: a16fe35
commits_at_base: 204 (137 unrelated legacy commits + the FicShelf commits from 695e10d)
updated: 2026-11-01
next_work: docs/ROADMAP.md
next_task: the user tries the Kindle-style look on the phone (P-UI1 acceptance, `docs/ui_rules.md` §3a); then the clipping device checks and polish; no Wattpad until clipping is perfect
stack:
  expo: 57.0.31
  expo_modules_core: 57.0.24
  expo_modules_jsi: 57.1.3 (needed for Xcode 27 / Swift 6.4)
  react_native: 0.86.3 (Hermes)
  react: 19.2.3
  expo_router: 57.0.29
  expo_sqlite: 57.0.4
  react_native_webview: 13.16.1
  typescript: 6.0.3
  jest: 29.7.0 (preset jest-expo 57.0.6)
  ios_precompiled_expo_modules: off (app.json expo-build-properties ios.usePrecompiledModules false)
  node_required: ">=22.13"
platform_target: iPhone, sideloaded with a free Apple ID from Xcode on the user's Mac
size_at_base: "188 TS/TSX files in src/; 63 test files"
checks_at_base:
  tsc: clean
  jest: "74 suites, 1304 passed + 1 todo (P-UI1 + EPUB reading follow-up)"
  import_corpus: "303 passed + 1 todo"
  lint: "clean, check-keys: ok"
  expo_export_ios: "bundles; entry-*.hbc about 5.3 MB (P-UI1 adds the reader's embedded Literata)"
  expo_doctor: "21/21"
  clip_check: "npx tsx scripts/clip-check.ts: 39/39 (headless Chromium, synthetic pages and sites)"
  live_check_ao3: "5/5 (last run during P3; not re-run since, to keep load off AO3)"
  live_check_ffn: "17/17 (last recorded)"
```

---

## 1. Project overview and goals

FicShelf is an unofficial iPhone app for reading fanfiction, built with Expo SDK 57 / React Native
0.86 (Hermes), expo-router, expo-sqlite and react-native-webview. It is not in the App Store; the
single user sideloads it from source.

- **FanFiction.net (FFN)**: a full client (browse, search, story pages, reader, reviews, profiles,
  login, follows / favourites, PMs, communities, forums, betas, drafts). FFN sits behind Cloudflare,
  so every FFN request runs inside a hidden WebView ("the bridge").
- **Archive of Our Own (AO3)**: reading without login (browse, search, works, series, creators,
  reader, adult gate, official download, audiobook, batched update checks).
- **Imported files** as the `local` source: EPUB, HTML (known layouts, else Safari-Reader-style
  cleanup), TXT and Markdown, from the picker or "Open in FicShelf".
- **Reader** (themes, fonts, paged / scroll, bookmarks, find, progress), **audiobook** (on-device
  TTS incl. Piper add-on voices, lock screen, sleep timer, skip author's notes), **library**
  (history, shelves, collections, downloads, backups), **updates** (foreground and background checks, local notifications).
- **Clip this page** (built 2026-10-27, works on the phone): FicShelf's in-app browser opens any
  https site; Clip saves what the page shows as text, as a new local story or its next chapter.
  **Automatic clipping** (P-CLIP2, built 2026-10-27, tests only so far): "Clip & next" (save, then
  the site's Next) and "Clip the next chapters" (FicShelf presses Next by itself at a reader's pace,
  stopping at locks, logins, bot checks and anything odd); "What Clip sees" reports.
  **Background clipping** (P-CLIP3, built 2026-10-29, tests only so far): paste a first chapter →
  "Clip the whole story"; a hidden in-app browser clips it while the app is open, asking only for
  logins, locks and checks (banner → the page slides up → Continue).
- **Next: P-UI1, a Kindle-style look** (preview approved 2026-11-01: "I like this a lot better"):
  cover-first Home and Library, generated covers, calm story page, hidden reader controls, four tabs,
  behind a Settings switch. Spec and steps: `docs/ui_rules.md` §3a; the preview: design/kindle-preview/index.html.
- **Wattpad**: link parsing only; reading (P4) is **on hold** until the user says clipping is perfect.

Goals and principles (from the user's requests and the design):
- A modern replacement for the official FFN app, then one app for the user's other sites ("it will
  also feature wattpad and ao3", 2026-10-08; "hopefully any future website", 2026-10-21).
- Order chosen by the user (2026-10-08): AO3 first, reading before login, import before Wattpad;
  updated 2026-10-21: "Clip this page" next, before Wattpad; updated 2026-10-27: automatic clipping
  (P-CLIP2) is the top priority, "we're not doign anything wattpad until we perfect clipping feature".
- Be polite to every site; never get around access control; keep "Open on <site>" one tap away;
  no site logos; "unofficial, not affiliated" wording.
- Never lose story text silently. Never lose the user's library (safe migrations, backups, "don't delete the app").
- Works with a free Apple ID (no push, App Groups, Associated Domains or iCloud entitlements).

Disclaimer wording lives in Settings → About and `app.json` `description`: "Unofficial reader for
FanFiction.net and Archive of Our Own: browse, search, read, follow, favorite, review, read offline
and listen. Imports EPUB, HTML, text and Markdown story files."

---

## 3. Architecture overview

```
 Screens (src/app/**, expo-router)        shared screens render SourceUi slots; never branch on the site
   │                                       (except Browse home, Search form, Settings → Sources)
   ▼
 Features (src/features/*)                chapters, downloads, updates, chapterIds (remap), imports, actions, adult gate
   │
   ▼
 Source layer (src/sources/*)             keys.ts (StoryKey) · types.ts (site-neutral model, Source contract)
   │                                       registry.ts (sourceOf, resolveLink) · ui.ts (SourceUi slots) · remap.ts
   ├── ffn/  → src/ffn/api.ts → src/net/bridge.ts → hidden WKWebView (BridgeHost.tsx, BRIDGE_SCRIPT) → www.fanfiction.net
   ├── ao3/  → ao3/api.ts → src/net/http.ts (polite HttpClient, httpCore.ts POLICIES, blocks.ts) → archiveofourown.org
   ├── local/→ library + chapterStore only (never the network); files from src/import/* (pure TS)
   └── wattpad/ urls.ts only (registry stub "coming soon")
   │
   ▼
 State (src/state/*)                      createStore stores: library, settings, session; normalize-on-read
 Storage (src/db/*)                       expo-sqlite ficshelf.db: kv, chapter_text, http_cache, legacy chapters; migrations
 Reader (src/reader/*)                    buildReaderHtml → WebView (baseUrl per source; about:blank + CSP for local)
 Audio (src/audio/*)                      segments → expo-speech queue + expo-audio silent loop (lock screen)
 HTML (src/html/*)                        El wrapper on htmlparser2; allowlist sanitizer (AO3, import); FFN has its own regex sanitizer
```

Key design decisions:
- **Source-qualified keys** everywhere (`ffn:123`, `ao3:5`, `local:<uid>`) because FFN and AO3 share
  numeric ids (3171550 exists on both). A bare number, when it turns up (old routes, notifications,
  v1 backups), means FFN.
- **Site-neutral model + slots**: adapters map site data to `StoryMeta` / `StoryInfo` /
  `ChapterContent`; per-site UI differences go through `SourceUi` slots.
- **Pure core**: adapters, parsers, `src/import`, `remap.ts`, migrations and `segments.ts` don't
  import React Native, so they run in Node tests and Hermes. Platform splits use `.web.ts(x)` siblings.
- **One polite HTTP client** for every non-FFN request; FFN through the bridge (Cloudflare).
- **Offline first**: saved chapters (`chapter_text`) are used before the network where valid.
- **Safe storage**: one verified migration, normalize-on-read, backward compatibility with the previous build.

---

## 4. Codebase map

All paths relative to the repo root. Checked at `5cc19e8`.

---

### 4.1 Top level

| Path | What it is |
|---|---|
| `package.json` | name `fanfic-reader`, `main: expo-router/entry`. Scripts: `start`, `ios`, `android`, `web`, `typecheck` (`tsc --noEmit`), `test` (`jest`), `lint` (`expo lint && tsx scripts/check-keys.ts`), `live-check`, `dev-proxy`. Jest preset `jest-expo`, `testMatch: <rootDir>/tests/**/*.test.ts?(x)`. Engines `node >=22.13` |
| `app.json` | Expo config (`docs/ios_build.md` §4.2) |
| `eas.json` | profiles `development`, `simulator`, `preview` (APK, autoIncrement), `preview-simulator`, `production`; `promptToConfigurePushNotifications: false`. The user builds in Xcode, not EAS |
| `tsconfig.json` | extends `expo/tsconfig.base`, `strict`, types `jest` + `node`, alias `@/*` → `./src/*` (code uses relative imports anyway) |
| `eslint.config.js` | `eslint-config-expo/flat`; ignores `dist/*`, `node_modules/*`, `.expo/*` |
| `plugins/withoutPushEntitlement.js` | deletes `aps-environment` so a free Personal Team can sign. Must stay **first** in `plugins` (mods run in reverse order, so first runs after expo-notifications) |
| `assets/` | icons, splash, `assets/audio/silence.wav` (60 s silent loop holding the playback session) |
| `design/kindle-preview/index.html` | the approved Kindle-style preview (a self-contained page; the spec for P-UI1) |
| `README.md`, `PLAN.md`, `INSTALL.md` | features + verification table + known limitations; the original FFN feature plan; the step-by-step install guide |
| `AGENT_ROOT.md`, `ACTIVE_HANDOFF.md`, `docs/` | agent handoff: rules + Context Map; current state + next task; the component docs (replaced FEATURES.md and MASTER_FEATURES.md on 2026-11-01) |
| `.gitignore` | `/ios`, `/android` (made by prebuild; configure through `app.json`), `.expo/`, `dist/`, credentials, build outputs |

---

## 7. Feature inventory

Legend: ✅ built · 🌐 built through the in-app browser with the user's FFN session (or AO3 in Safari
via `Linking.openURL`) · ⏳ not built (reason given) · 🧪 tests only, not confirmed on the phone.
