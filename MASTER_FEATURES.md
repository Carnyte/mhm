---
doc: MASTER_FEATURES
purpose: >-
  Full project context for FicShelf: the user, environments, architecture, data model, sources and
  their policies, every feature with its status, testing, process, lessons learned, history and
  glossary. Next work lives in FEATURES.md.
project: FicShelf
app_name: FicShelf (npm package name fanfic-reader)
repo: https://github.com/Carnyte/mhm
local_clone: /home/user/mhm
user_clone: ~/ficshelf (the user's Mac)
branch: claude/ficshelf-fanfiction-app
base_commit: e1b08ba
commits_at_base: 178 (137 unrelated legacy commits + 41 FicShelf commits from 695e10d)
updated: 2026-10-27
next_work: FEATURES.md
next_task: P-CLIP2 device check (AC-A1..A6) and AC-11 polish from the user's reports; no Wattpad until clipping is perfect
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
size_at_base: "183 TS/TSX files in src/; 60 test files"
checks_at_base:
  tsc: clean
  jest: "61 suites, 1214 passed + 1 todo"
  import_corpus: "299 passed + 1 todo"
  lint: "clean, check-keys: ok"
  expo_export_ios: "bundles; entry-*.hbc about 4.9 MB"
  expo_doctor: "21/21"
  clip_check: "npx tsx scripts/clip-check.ts: 34/34 (headless Chromium, synthetic pages and sites)"
  live_check_ao3: "5/5 (last run during P3; not re-run since, to keep load off AO3)"
  live_check_ffn: "17/17 (last recorded)"
---

# FicShelf: master context

## Table of contents

1. [Project overview and goals](#1-project-overview-and-goals)
2. [The user](#2-the-user)
3. [Architecture overview](#3-architecture-overview)
4. [Codebase map](#4-codebase-map)
5. [Data model and storage](#5-data-model-and-storage)
6. [Sources and per-site policies](#6-sources-and-per-site-policies)
7. [Feature inventory](#7-feature-inventory)
8. [Testing and verification](#8-testing-and-verification)
9. [Process and conventions](#9-process-and-conventions)
10. [Lessons learned: mistakes, patterns, gotchas](#10-lessons-learned-mistakes-patterns-gotchas)
11. [Milestone history](#11-milestone-history)
12. [Glossary](#12-glossary)
13. [Next work](#13-next-work)

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

## 2. The user

### 2.1 Profile
- A single, non-developer user who reads fanfiction on an iPhone and drives the work with short
  messages: "Continue", "Try again", "I hit my usage limit… it has reset now", "Pause". They often
  hit usage limits; once paused for 9 days (2026-10-12 → 2026-10-21).
- Builds on a Mac (macOS Tahoe; upgraded from Sequoia 15.7.4 on 2026-10-06 for Xcode 27), project in
  `~/ficshelf`, with Xcode 27 and a **free Apple ID (Personal Team)**, Release scheme, phone on a cable.
- iPhone: README records the first install as iOS 26; the user never stated the version (the
  Piper add-on voice implies iOS 18+). Plan on a cable (wireless pairing with Xcode 27 needs iOS 27).
- Uses the **Piper "Lessac"** add-on voice (App Store "Piper – Neural TTS") for the audiobook.
- Tests on the device and reports symptoms ("load failed", "speed goes faster", "blank after a
  while", "skip the summary"); pastes Xcode output; sometimes quotes a step they're on.
- Given ranked options (AskUserQuestion, 2026-10-08), they pick the recommended ones.
- Never put the user's email, real name or username, bundle id, cookies or tokens in docs, code or commits.
- On sites' terms for clipping, the user decides for their own reading (2026-10-27: "i want you to
  do it, regardless of TOS"). Don't refuse or nag on terms grounds; keep the hard lines that aren't
  about terms (FEATURES.md §4a policies: no unlocking / buying / bot-check solving / ticket handling,
  human pace, foreground only) and say so once when it matters.
- The user's Xcode updated itself to Xcode 27 with **Swift 6.4** between 2026-10-21 and 2026-10-27.

### 2.2 How to communicate
- **Plain language, short status.** Lead with the state ("pushed, ready to install" or "pushed,
  don't install yet: verifier running"), give the commit hash and test count, list changes as short
  bullets in user terms (no file paths), say what is test-only versus confirmed on the phone, give
  exact install steps (T1 or T2 below) and what to try, end with what's next.
- **Commands: one per code block**, in order, no prose or comments inside a block, start with
  `cd ~/ficshelf`, no `&&` chains. The user asked for this after a multi-line paste confused them
  ("give me the commands that i have to send, since its formatted weird"). When they say "I'm on
  step N", restart from step N. Explain Homebrew's "Next steps" lines (they must be run).
- Treat "Continue" / "Try again" as "resume autonomously from the last checkpoint": check the tree
  and state, then carry on.
- **Say "hold off installing"** while reviews or verifiers run; never call a build safe before the
  independent verify / confirm is done.
- For network bugs ask for **Settings → Connection → Connection details** (a report without cookie
  values); for build bugs ask for the exact red Xcode error text. Yellow warnings are normal.
- Offer options ranked, with costs, for big or risky features (Kokoro size and battery, Wattpad's
  terms, a Novelpia source vs Clip). Don't build without a yes. Record approvals (date + quote) in FEATURES.md.
- "If it's too complicated don't fret" means: do the safe version behind an on / off switch.
- Be honest about limits: the container can't build iOS, reach the phone or write to the user's
  folders; for "put these files in my Downloads folder", send them with SendUserFile and commit them
  to the repo. Say when a request failed because of a usage limit and that it's being retried.
- Strip harness or meta notes (classifier messages, model names) from anything user-facing.

### 2.3 The two environments

| | Claude's container (Linux, cloud) | The user's machine |
|---|---|---|
| Repo | `/home/user/mhm`, `origin` = `https://github.com/Carnyte/mhm` | `~/ficshelf`, cloned with `git clone --branch claude/ficshelf-fanfiction-app https://github.com/Carnyte/mhm.git ficshelf` |
| Toolchain | Node 22.22.0, npm 10.9.4. Optional Chromium for the FFN live check (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `xvfb-run`) | macOS Tahoe, Xcode 27 ("Device Hub"), Homebrew at `/opt/homebrew`, Node (installed with `brew install node`; INSTALL.md says the nodejs.org `.pkg`, both work), CocoaPods via `brew install cocoapods` |
| Can do | `tsc`, `jest`, lint, `expo export`, `expo prebuild` in a scratch copy, polite live checks | Real iOS builds: Xcode Release build to a cable-connected iPhone, signed with the Personal Team |
| Cannot do | Build or sign iOS, reach the phone, write to the user's folders | — |

There is no over-the-air update: every code change reaches the phone only through a rebuild in Xcode.

### 2.4 How the user builds, installs and updates (INSTALL.md Path B: Mac + free Apple ID)

One-time setup (done 2026-10-06):
1. **B1–B2** `sw_vers -productVersion` (26.6+ for Xcode 27; an iOS 16.4–16.x phone needs Xcode 26.6);
   install Xcode; `sudo xcode-select -s /Applications/Xcode.app`; `sudo xcodebuild -license accept`; `xcodebuild -runFirstLaunch`.
2. **B3** Xcode → Settings → Apple Accounts → sign in (shows "Name (Personal Team)").
3. **B4** Homebrew (run **every** "Next steps" line: two `echo … >> ~/.zprofile` and one
   `eval "$(/opt/homebrew/bin/brew shellenv zsh)"`), Node ≥ 22.13, `brew install cocoapods`.
4. **B5** clone, `cd ficshelf`, `npm install`. **Never `npm audit fix`.**
5. **B6** change `"bundleIdentifier": "com.ficshelf.reader"` in `app.json` to a personal id (a
   permanent local edit in the user's clone; repo edits must stay away from that line).
6. **B7** `npx expo prebuild -p ios` (creates the gitignored `ios/`).
7. **B8** `echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local` (else "PhaseScriptExecution failed / node: command not found").
8. **B9** cable + Trust; pair in Xcode (Device Hub, or Window → Devices and Simulators on Xcode 26);
   iPhone Settings → Privacy & Security → Developer Mode (the switch appears only after connecting to Xcode), restart, Turn On.
9. **B10** `xed ios` (always; never open the `.xcodeproj`) → FicShelf target → Signing & Capabilities →
   Automatically manage signing → Team = Personal Team → choose the iPhone.
10. **B11** Product → Scheme → Edit Scheme → Run → Build Configuration **Release**, untick **Debug
    executable** (Debug needs Metro), Cmd+R; at the codesign keychain prompt enter the Mac password, Always Allow.
11. **B12** "Untrusted Developer": Settings → General → VPN & Device Management → Trust.
12. **B13–B14** works unplugged; **stops opening 7 days after install** (free profile): reinstall over it (T4).

Free Apple ID limits (design constraints): 3 sideloaded apps per phone, 10 new App IDs per 7 days;
no App Groups, Associated Domains, iCloud or Push. Background modes in use: `fetch`, `processing`, `audio`.

**When prebuild is needed**: a package with native code added or updated (`expo-*`,
`react-native-*`), `app.json` changes under `ios` / `infoPlist` / `plugins`, or `plugins/` changes.
Pure-JS deps (`fflate`, `@mozilla/readability`) need only `npm install` + rebuild. Decide with
`git diff <last-installed>..HEAD --stat -- app.json package.json plugins/`. Prebuild is always safe to
re-run, but recreates `ios/` (redo B8, re-check Team and Release).

| Update | Prebuild? |
|---|---|
| Initial build (`456dc51`: scene support, push-entitlement plugin) | yes |
| `fde0496` audiobook (expo-audio, expo-asset) | yes; without it listening stops when the phone locks |
| `44a9f71` file import (`CFBundleDocumentTypes`, `UTImportedTypeDeclarations`, `LSSupportsOpeningDocumentsInPlace: false`) | yes; without it FicShelf isn't offered in "Open in" (in-app import still works) |
| TTS / speed / reader fixes, multi-source foundation, source layer, AO3, import fixes | no |
| P-CLIP (`1cca7be`..`7546679`) | no |
| `570b9ad` precompiled Expo modules off (`app.json` `usePrecompiledModules: false`) | yes; without it Xcode 27 (Swift 6.4) fails "Failed to build module 'ExpoModulesCore'; this SDK is not supported by the compiler" |
| `ca4749f` Expo SDK 57 patch updates (expo-modules-jsi 57.1.3 etc.) | yes; without 57.1.3 Xcode 27 fails "Cannot find type '__ObjC::expo' in scope" in ExpoModulesJSI. The user's phone build used 57.1.3 installed by hand; the lockfile update isn't installed yet, so **the next install is T2** |
| P-CLIP2 (planned) | no (expo-keep-awake is already in) |

Update templates to send the user:
- **T1, JavaScript-only update (no prebuild)**: (backup advisable) → `cd ~/ficshelf` → `git pull --autostash`
  → `npm install` → `xed ios` → in Xcode check Signing still shows the Personal Team and the scheme
  is still Release → Cmd+R with the phone connected → "You don't need to delete the app first."
- **T2, native update (prebuild)**: Settings → Back up library → `cd ~/ficshelf` → `git pull --autostash`
  → `npm install` → `npx expo prebuild -p ios` (answer **Y** to "Continue with uncommitted changes?")
  → `echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local` → `xed ios` → Team still
  "(Personal Team)", scheme Release, Debug executable unticked → phone on a cable, Cmd+R → **install
  over the app; never delete it first** → what to try (e.g. "Files → press and hold an .epub → Share → FicShelf").
- **T3, storage-format change**: T1 or T2 plus "back up first"; explain that an older build installed
  afterwards shows an empty library, nothing is lost, and the newer build merges it back; the pre-v2 copy is `ficshelf-pre-v2.db`.
- **T4, every 7 days**: plug in, unlock, `cd ~/ficshelf`, `npx expo run:ios --device --configuration Release --no-bundler`
  (or `xed ios` + Cmd+R); on "No profiles … were found", build once from Xcode and retry.
- **Merge conflict in `app.json`**: keep your own `bundleIdentifier` (and `projectId` if using EAS)
  lines; delete the `<<<<<<<`, `=======`, `>>>>>>>` lines.
- **Don't delete the app**: it erases the library, downloads, progress and imported stories.
- Other paths (reference): A = EAS cloud build ($99/yr, `eas device:create`, `eas build --platform ios --profile preview`;
  always `preview`); C = TestFlight (`--profile production --auto-submit`, 90-day expiry); D = Android
  APK (`--platform android --profile preview`; never tested on a device); `preview-simulator` profile
  (Appetize.io, offered 2026-10-06 while the Mac was on Sequoia). Expo Go can't run the app.

### 2.5 What is confirmed on the device

| What | Result on device | When (UTC) |
|---|---|---|
| First Xcode build of `ac60af4` | builds, installs, opens ("it said build succeeded, and i could open the app") | 2026-10-06 20:01 |
| Login and search on that build | failed: "load failed", FFN "404 oops", "can't reach fanfiction.net" → mobile-site redirect; fixed in `fde0496` | same |
| Xcode warnings pasted | reviewed, none critical (nullability, deprecations, umbrella header, Sendable, "Direct call to eval()", "Update to recommended settings") | 21:25 |
| Desktop-UA fix, login, search, first audiobook (prebuilt after `e2c8ac5`) | "everything works" | 21:41 |
| Piper Lessac | "im using leesac right now, it works great" (build about `31439d4`) | 2026-10-07 07:57 |
| Speed with Piper (0.9x / 0.5x too fast) | reported; fixed in `c79d776`; **test-only**: asked to try 0.5x, 0.9x, 2x; no answer | 07:57 → 15:36 |
| Blank story after a while; audiobook reading the "summary" | reported / requested; fixed in `3321ff1`, `4b7f0ba`; **test-only** | same |
| Natural pauses and cleanup (`07f2553`) | probably in the Lessac build; no specific comment | — |
| Storage v2 migration | **test-only** (real SQLite via `node:sqlite`); user told to back up first | — |
| AO3 | live-checked from the container (5/5 + 9 requests); **never reported on device** | — |
| File import, "Open in FicShelf" | unit tests, corpus, the user's real sample files (in the old container only), headless-Chromium CSP check; **never on device**; user told "ready to install" (T2) | 2026-10-21 07:22 |
| FFN account lists, PMs, background checks, notifications, lock-screen ±10 s | no specific report | — |

| 7-day free profile expired; reinstall over it from Xcode | renewed by the 2026-10-27 install; nothing extra needed (T4) | 2026-10-27 |
| Build of `570b9ad` + expo-modules-jsi 57.1.3 (hand-installed) incl. Clip | "perfect it works perfectly now" (CLIP-A items not reported one by one) | 2026-10-27 |
| P-CLIP2 automatic clipping | runs work; reported that new chapters showed on the story page only after reopening it; fixed with auto-reload for local stories + pull-to-refresh | 2026-10-27 |

Ask about the speed fix, AO3, import and the individual Clip checks (CLIP-A1..A9, a site login
surviving an app restart) when the user is next back.

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

### 4.1 Top level

| Path | What it is |
|---|---|
| `package.json` | name `fanfic-reader`, `main: expo-router/entry`. Scripts: `start`, `ios`, `android`, `web`, `typecheck` (`tsc --noEmit`), `test` (`jest`), `lint` (`expo lint && tsx scripts/check-keys.ts`), `live-check`, `dev-proxy`. Jest preset `jest-expo`, `testMatch: <rootDir>/tests/**/*.test.ts?(x)`. Engines `node >=22.13` |
| `app.json` | Expo config (§4.2) |
| `eas.json` | profiles `development`, `simulator`, `preview` (APK, autoIncrement), `preview-simulator`, `production`; `promptToConfigurePushNotifications: false`. The user builds in Xcode, not EAS |
| `tsconfig.json` | extends `expo/tsconfig.base`, `strict`, types `jest` + `node`, alias `@/*` → `./src/*` (code uses relative imports anyway) |
| `eslint.config.js` | `eslint-config-expo/flat`; ignores `dist/*`, `node_modules/*`, `.expo/*` |
| `plugins/withoutPushEntitlement.js` | deletes `aps-environment` so a free Personal Team can sign. Must stay **first** in `plugins` (mods run in reverse order, so first runs after expo-notifications) |
| `assets/` | icons, splash, `assets/audio/silence.wav` (60 s silent loop holding the playback session) |
| `README.md`, `PLAN.md`, `INSTALL.md` | features + verification table + known limitations; the original FFN feature plan; the step-by-step install guide |
| `FEATURES.md`, `MASTER_FEATURES.md` | handoff: next work; this file |
| `.gitignore` | `/ios`, `/android` (made by prebuild; configure through `app.json`), `.expo/`, `dist/`, credentials, build outputs |

### 4.2 `app.json` essentials
- `name: FicShelf`, `slug: ficshelf`, **`scheme: ficshelf`** (`ficshelf://open?url=…`, `ficshelf://s/<id>/<ch>`), `orientation: default`, `userInterfaceStyle: automatic`.
- iOS: `bundleIdentifier: com.ficshelf.reader` (each user picks their own), `supportsTablet: true`;
  `UIBackgroundModes: [fetch, processing, audio]`; `ITSAppUsesNonExemptEncryption: false`;
  `CFBundleDocumentTypes` "EPUB Book" (`org.idpf.epub-container`) and "Story File" (`public.html`,
  `public.plain-text`, `net.daringfireball.markdown`), role Viewer, rank Alternate;
  `UTImportedTypeDeclarations` for `net.daringfireball.markdown` (conforms to `public.plain-text`,
  extensions `md` / `markdown`, MIME `text/markdown`); `LSSupportsOpeningDocumentsInPlace: false`
  (iOS copies files to `Documents/Inbox`). No `NSAppTransportSecurity` entry (prebuilt Info.plist has `NSAllowsArbitraryLoads=false`).
- Android: package `com.ficshelf.reader`, adaptive icon, `predictiveBackGestureEnabled: false` (not a target).
- Web: `bundler: metro`, `output: single` (dev harness only).
- `plugins` in order: `./plugins/withoutPushEntitlement`, `expo-router`, `expo-sqlite`,
  `expo-background-task`, `expo-notifications` (color `#1F3A5F`), `expo-sharing`, `expo-font`,
  `expo-audio` (`microphonePermission: false`, `recordAudioAndroid: false`, `enableBackgroundPlayback: true`),
  `expo-splash-screen`, `expo-build-properties` (`ios.enableSceneSupport: true`, `ios.usePrecompiledModules: false`), `expo-asset`.
  `usePrecompiledModules: false` (2026-10-27): Expo's npm-shipped ready-made module frameworks were
  built with an older Swift than the user's Xcode; the Podfile then sets
  `EXPO_USE_PRECOMPILED_MODULES=0` and CocoaPods builds Expo's modules from source (slower first build).
- Prebuild result: deployment target iOS 16.4, scene life cycle on, empty entitlements (no push), background audio, no microphone permission.

### 4.3 Dependencies (installed versions)
Runtime (updated 2026-10-27 by `npx expo install --fix`: expo 57.0.31, expo-router 57.0.29, expo-modules-core 57.0.24, expo-modules-jsi 57.1.3, jest-expo 57.0.6; the list below is otherwise as at 5cc19e8): expo 57.0.27; react-native 0.86.3; react / react-dom 19.2.3; expo-router 57.0.25; expo-sqlite
57.0.4; expo-file-system 57.0.7 (new `File` / `Directory` / `Paths` API); expo-speech 57.0.3;
expo-audio 57.0.5; expo-background-task 57.0.21; expo-task-manager ~57.0.21; expo-notifications
57.0.22; expo-document-picker ~57.0.3; expo-sharing, -clipboard, -network, -haptics, -keep-awake,
-brightness, -linking, -constants, -font, -splash-screen, -status-bar, -system-ui, -asset, -dev-client,
-build-properties (all ~57.0.x); react-native-webview 13.16.1; react-native-gesture-handler ~2.32.0;
react-native-reanimated 4.5.1; react-native-worklets 0.10.1; react-native-screens ~4.26.0;
react-native-safe-area-context ~5.7.0; @react-native-community/slider 5.2.0; react-native-web ^0.21.2;
@expo/vector-icons ^15.0.2 (Ionicons); htmlparser2 9.1.0; css-select 5.2.2; domhandler 5.0.3;
domutils 3.2.2; dom-serializer 2.0.0; fflate 0.8.3 (sync only: Hermes has no Workers);
@mozilla/readability 0.6.0 (its `JSDOMParser.js`: Hermes has no DOMParser).

Dev: typescript 6.0.3, jest 29.7.0, jest-expo 57.0.5, @types/jest 29.5.14, @types/react ~19.2.2,
eslint 9.39.5, eslint-config-expo ~57.0.2, tsx 4.23.15, playwright-core 1.56.1 (live-check and
dev-proxy only). `react-test-renderer` 19.2.3 (screen tests) arrives only through jest-expo.
jsdom 20.0.3 and `jest-environment-jsdom` are present in node_modules (transitive).

`npx expo-doctor`: 21/21 since `ca4749f` (the 11 patch mismatches at `5cc19e8` were fixed with
`npx expo install --fix` together with the Xcode 27 native fix). Patch updates are native changes:
the user's next install is a prebuild.

### 4.4 `src/` map

**`src/sources/`** (site layer; no React Native except `ui.ts` and `*/ui.ts`)
- `keys.ts`: `SOURCE_IDS`, `SourceId`, `StoryKey`, `SOURCE_NAMES`, private `REMOTE_ID`, key helpers (§5.1).
- `types.ts`: site-neutral model and the `Source` contract (§5.2, §5.3).
- `registry.ts`: lazily built source table, `getSource`, `sourceOf`, `enabledSources`, `resolveLink`,
  `absoluteLink`, `isBareStoryNumber`, `ComingSoonError`, disabled / coming-soon messages; Wattpad is a `comingSoon()` stub.
- `ui.ts`: `SourceUi` slot interface, `basicUi`, `UIS`, `getUi`, `uiOf`.
- `meta.ts`: `isStoryMeta`, `libraryAuthor`, `libraryMetaFromMeta`, `withKnownTitles` (keeps full titles over AO3's shortened "…" ones), `infoFromLibrary` (library record as a story page offline).
- `remap.ts`: pure chapter remapping (§5.8).
- `ffn/adapter.ts` (`ffnSource`, `parseFfnLink`, `FFN_BASE_URL`; no `checkUpdates`, so FFN uses per-story workers),
  `ffn/map.ts` (`ffnMeta`, `ffnInfo`, `ffnChapter`, `libraryMetaFromFfn`, `ffnKey`, `ffnId` (throws `UnsupportedSourceError` for other sites), `ffnStoryUrl`, `ffnAuthor`, `ffnUser`),
  `ffn/ui.ts` (`ffnUi`: stats, Follow / Favorite heart, Reviews, "Write a review" end action; `addSubscription`).
- `ao3/adapter.ts` (`ao3Source`: `stableText`, `getStory`, `getChapter` with stale-id recovery, `downloadAll`, `checkUpdates`, `resolvePart`, `search`; listing helpers `listTagWorks`, `listUserWorks`, `searchWorks`, `getSeries`; per-session memory `restrictedIds`, `chapterIds`, `fullTitles`, `resetAo3Session`),
  `ao3/api.ts` (every AO3 request: `ao3Fetch`, `ao3Url` host guard, `fetchWorkPage` (5-minute reuse of 6 pages), `fetchNavigate`, `fetchDownload`, `fetchSearch`, `fetchById`, `fetchWorksList`, `fetchSeries`, `fetchMedia` / `fetchMediumFandoms` (cached a week in `http_cache`), `fetchFandomSuggestions`; errors `Ao3RestrictedError`, `Ao3NotFoundError`, `Ao3ChapterGoneError` (carries `chapterIds`), `Ao3AdultNoticeError`, `Ao3UnavailableError`; `isAo3Trouble`),
  `ao3/constants.ts` (ratings, warning / category tag ids, sorts, media, languages, word ranges, `ADULT_RATINGS` / `isAdultRating`, `FANDOM_CACHE_MS` 7 days, `MAX_LISTING_PAGE` 5000, `UPDATE_BATCH` 20),
  `ao3/map.ts` (`ao3Chapter` with `notesBefore` / `notesAfter`, `ANONYMOUS`, `ao3Key`, `ao3Tags`),
  `ao3/urls.ts` (`AO3_ORIGIN`, tag escaping, URL builders, `Ao3Filters`, `Ao3Search`, `parseAo3Url`, `parseAo3Link`, `authorId` / `splitAuthorId` 'user/pseud'),
  `ao3/ui.ts` (`ao3Ui`: kudos / hits / bookmarks / comments stats, `chapterCount` "n/?", tag groups, warning line, rating badge, series route, "Open on AO3"),
  `ao3/parsers/` (`common.ts` (blurb + work meta `Ao3WorkMeta`, bylines, stats, sanitized `userstuffHtml`, dates), `blurb.ts`, `listing.ts` (+ facets), `work.ts` (`parseWorkPage` → `Ao3Page` union work / adult / login / unknown; `stripChapterNumber`, `isAbbreviatedEntry`), `navigate.ts`, `download.ts`, `media.ts`, `series.ts`, `user.ts`).
- `local/adapter.ts` (`localSource`, `LOCAL_CSP`, `LocalMissingError`; reads only library + `chapterStore`), `local/ui.ts` (`localUi`, `fileKindLabel`, `siteName`, `confirmDeleteImported`, `GENERATORS` labels).
- `wattpad/urls.ts`: `WP_ORIGIN`, `storyUrl`, `partUrl`, `parseWattpadUrl`, `parseWattpadLink`. Link parsing only.

**`src/net/`**
- `httpCore.ts` (polite `HttpClient`, `POLICIES`, errors; §6.1), `http.ts` (native client with `DESKTOP_USER_AGENT`, `httpText`), `http.web.ts` (web: AO3 / FicHub through dev proxy `/http`, `EXPO_PUBLIC_FFN_PROXY` default `http://localhost:8787`; Wattpad direct with `credentials:'omit'`).
- `blocks.ts`: `SourceBlockedError`, `isAo3Block` / `detectAo3Block` (`cf-mitigated: challenge`, Cloudflare's exact titles, `cf_chl_opt`), `isWpBlock` / `detectWpBlock` (`x-amzn-waf-action`, CloudFront 403, HTML where JSON was expected).
- `bridge.ts` (FFN queue; §6.2), `bridgeScript.ts` (`BRIDGE_SCRIPT` with `window.__ffnBridge.announce/fetch`, `loginPrefillScript`), `challenge.ts` (`RawResponse`, `isChallengeResponse`, `parseCookies`, `usernameFromCookies` via the `funn` cookie), `BridgeHost.tsx` (hidden WebView, full screen for "Verify you are human", remount on `onContentProcessDidTerminate`), `BridgeHost.web.tsx`.
- Auto-clip: `nextScript.ts` (`nextScript(nonce, 'find'|'press'|'report')`, `NEXT_MESSAGE`,
  `NEXT_WORDS`, `LOCK_PATTERN`, `LOCKED_TEXT_PATTERN`, `NEXT_SCORE_MIN` 30: Next candidates by
  rel=next / label / class / pager, never disabled, hidden or buy / unlock; lock and bot signals;
  main-text fingerprint; posts labels and counts only).
- Clip: `webPolicy.ts` (`decideNavigation(url, mode, ctx)` for the in-app browser's two modes; FFN
  mode = the old allowlist decisions exactly), `webHosts.ts` (`webMode`, `isNativeHost`,
  `acceptsCookieMessage`; no registry import, used by `+native-intent.tsx`), `clipScript.ts`
  (`clipScript(nonce, maxChars, timing)`, `CLIP_MESSAGE`, `MAX_CLIP_CHARS`).
- `webviewConfig.ts`: `FFN_HOST`, `DESKTOP_USER_AGENT` (desktop Safari, version from `Platform.Version`), `FFN_WEBVIEW_PROPS` (UA + `contentMode:'desktop'`), `isMobileSiteUrl`, `toDesktopUrl`.
- `images.ts`: `directImageUri` / `loadImage` / hook; FFN images through the bridge as base64 (LRU 400, 3 at a time); other https, `file:`, `data:`, `ficshelf-doc:` load directly.

**`src/ffn/`** (FFN only; may treat ids as numbers)
- `api.ts`: typed client over the bridge (`getStory(id, chapter, {quiet})`, lists, Just In, fandoms,
  crossovers, search, reviews, `subscribe`, `postReview`, profiles, betas, communities, forums,
  topics, `login` / `logout` / `loginState` / `findMyUserId`, `getAccountStories`, `getAccountAuthors`,
  `removeFromAccountList`, PMs); errors `NeedsWebError`, `LoginRequiredError`; re-exports `FfnPageError`.
- `constants.ts`, `forms.ts` (form parsing and "form replay" for pages behind a login), `types.ts`, `urls.ts` (`parseLink` → `LinkTarget`, `absolute`).
- `parsers/`: `dom.ts` (re-exports `src/html/dom.ts` + FFN helpers; its **own regex `sanitizeHtml`**), `story.ts` (`FfnPageError` code `not_found | login_required | site_error | parse`), `storyList.ts`, `meta.ts`, `fandoms.ts`, `groups.ts`, `profile.ts`, `reviews.ts`, `search.ts`, `account.ts` (adaptive).

**`src/html/`**: `dom.ts` (`El` wrapper over htmlparser2 + css-select + domutils + dom-serializer; `parseHtml`, `normalizeSelects`, `decodeEntities`, `text`, `ownText`, `attr`, `parseCount`); `sanitize.ts` (allowlist sanitizer; §6.1).

**`src/db/`**: `kv.ts` (SQLite; §5.6), `kv.web.ts` (localStorage stand-in, chapters under `ficshelf:ch:<StoryKey>:<n>`), `migrations/index.ts` (`SyncDb`, `MigrationEnv`, `MigrationResult`, `SCHEMA_SQL`, `SCHEMA_VERSION = 2`, `schemaVersion`, `runMigrations`), `migrations/v2.ts` (pure idempotent transforms: `normalizeStory`, `normalizeLocal`, `mergeStory`, `normalizeAuthor`, `mergeAuthor`, `bookmarksV2`, `collectionsV2`, `positionsV2`, `searchesV2`, `pinsV2`, `settingsV2`, `moveLegacy`, `migrateV2`, `drainLegacy`, `MigrationError`).

**`src/state/`**: `store.ts` (`createStore` get / set / subscribe; `useStore` with shallow-equal selectors), `library.ts` (§5.4), `settings.ts` (§5.5), `session.ts` (FFN login session from bridge cookies; user id cached in kv `myUser`).

**`src/features/`**: `chapters.ts` (`fetchStory`, `fetchChapter`, `loadChapter`, `usableSavedChapter`, `prefetchChapter`, `getSavedChapter`, `saveChapter`, re-export `renderChapter`), `downloads.ts` (`downloadStory`, `cancelDownload`, `removeDownload`, `removeAllDownloads`, `downloadedBytes`, `downloadsStore`), `updates.ts` (§6.3, §6.2), `chapterIds.ts` (`applyChapterIds`, `chapterIdsOf`, `onChapterRemap`, `announceRemap`), `actions.ts` (`openStory`, `openReader`, `openAuthor`, `openWeb`, `openLinkHit`, `openReaderLink`, `shareStory`, `copyLink`, `storyMenu`, `storyPageMenu`, `readerMenu`, `collectionActions`, `gatedStory`), `adultGate.ts` (`isAdultWork`, `needsAdultGate`, `agreeToAdult`, `alwaysShowAdult`, `resetAdultGate`, `afterAdultGate`), `imports.ts`, `importFiles.ts`, `importHandoff.ts`, `importPicker.ts` (§6.4), `clips.ts` (`commitClip`, `appendClip`, `undoLastClip`, `findClippedPage`, `clippedStories`, `defaultClipTarget`, `clipOddity`), `autoClip.ts` (pure runner `AutoClip` with `start/pause/resume/stop/setActive/reviewed`, `AutoClipStatus` running / paused (user, background, blocked + message, review) / finished, `MESSAGES`, `dwellMs`, `textPrint`, `summary`, `waitForNextChapter`; `MIN_DWELL_MS` 4000, `NEXT_WAIT_MS` 20000, `POLL_MS` 700, `MAX_ERRORS` 3), `clipPace.ts` (no imports: `ClipPace`, `CLIP_PACES` gentle 20–40 / normal 8–15 / quick 4–7 s, `CLIP_BATCHES` 5/10/25/50, `MAX_CLIP_RUN` 200, `runSizeOptions`), `clipReport.ts` (`clipReport`: "What Clip sees", no story text).

**`src/import/`** (pure TS): `types.ts`, `index.ts`, `sniff.ts`, `decode.ts`, `zip.ts`, `epub.ts`, `html.ts` (exports `parseHtmlPage`), `readability.ts`, `text.ts`, `build.ts`, `dom.ts`, `meta.ts`, `detect.ts` (§6.4), `clip.ts` (`parseClip`, `cleanClipUrl`, `stripSiteName`, `splitTitle`, `asOneChapter`).

**`src/reader/`**: `template.ts` (`buildReaderHtml`, `readerCssVars`, `ReaderPayload`, in-page `READER_JS`), `notes.ts` (`renderChapter`: notes → `aside.fs-notes[data-pos]`), `images.ts` (`withBookImages`).

**`src/audio/`**: `player.ts` (engine; §7.5), `state.ts` (`playerStore`, `PlayerState`, `PlayerStory`, `SleepTimer`, `IDLE`, `usePlayer`), `segments.ts` (`segmentChapter`, `frontMatterBlocks`, `isNoteLine`, `isSpeakable`, `splitText`, `MAX_SEGMENT_CHARS = 420`), `speechText.ts`, `rate.ts` (`speechRate`, `isPiperVoice`), `voices.ts` (tiers premium / enhanced / standard / novelty, `bestVoice`, `voiceFor`, `isAddOnVoice`, `languageCode`), `session.ts` (+ `session.web.ts` no-op), `pickers.ts` (`SPEEDS` 0.5–2, sleep timer, voice, pause sheets).

**`src/components/`**: `ui.tsx` (`T`, `Card`, `Button`, `IconButton`, `Chip`, `Badge`, `Row`, `Section`, `Input`, `Segmented`, `Divider`, `ProgressBar`, `haptic`, `IconName`), `Sheet.tsx` (`showActions`, `pickOption`, `toast`, `SheetHost`), `states.tsx` (`Loading`, `Empty`, `ErrorView` mapping every error class to a recovery action, `Notice`), `StoryCard.tsx`, `Cover.tsx`, `StatsGrid.tsx`, `TagGroups.tsx`, `SourceBadge.tsx`, `SourceChips.tsx` (`useSourcesWith(cap)`, `pickSource`, `LABELS`), `FilterSheet.tsx` (FFN), `HtmlText.tsx`, `ProfileView.tsx`, `ReaderSettingsPanel.tsx`, `ReaderWebView.tsx` / `.web.tsx` (iframe), `MiniPlayer.tsx`, `miniPlayerLayout.ts`, `BridgeBanner.tsx`, `MigrationFailed.tsx`, `WhatsNewSheet.tsx` (`WHATS_NEW_VERSION = 2`: Clip; AO3's part for anyone who never saw 1), `ClipSheet.tsx` (clip preview + target + save), `ao3/` (`AdultGateSheet.tsx`, `Ao3BrowseHome.tsx`, `Ao3FilterSheet.tsx`, `Ao3SearchForm.tsx`).

**Other**: `src/hooks/useQuery.ts` (`useQuery(key, fetcher, {staleMs = 5 min})`, `usePaged`, `invalidate(prefix)`, `peekCache`; key prefixes `story:<key>`, `profile:`, `fandoms:`, `ao3:fandoms:`, `topic:`, `pm:` …); `src/theme/index.ts` (`Palette` incl. `source: Record<SourceId,string>` (light ffn `#2B4C9B`, ao3 `#990000`, wp `#9A3412`, local `#556170`), `LIGHT`, `DARK`, `useTheme`, `READER_THEMES` light / sepia / paper / mint / dusk / dark / black, `READER_FONTS`, `fontCss`); `src/utils/format.ts` (`formatNumber`, `formatFull`, `relativeTime`, `formatDate`, `readingTime`, `formatBytes`, `pluralize`, `errorMessage`, `htmlToText`, `countWords`); `src/utils/docFiles.ts` (`DOC_PREFIX = 'ficshelf-doc:'`, `docRef`, `isImportPath`, `docUri`; files in Documents are stored by relative path because the absolute path changes between installs).

### 4.5 Routes (`src/app/**`)
- `_layout.tsx` (root Stack): SafeArea, ThemeProvider, `BridgeHost`, `SheetHost`, `MiniPlayer`,
  `BridgeBanner`, `WhatsNewSheet`; shows `MigrationFailed` when `migrationStatus().ok` is false;
  notification taps open the story (`{storyKey}` or legacy `{storyId}`); launch work `sweepImports`,
  `configureBackgroundChecks`, update checks on launch and foreground; modals `login`, `review/[id]`, `messages/compose`, `open`, `import`.
- `+native-intent.tsx` (`redirectSystemPath`: `file://` → `/import?open=<ticket>`; an outside `ficshelf://web?url=<non-FFN>` → `/open?url=…`, which names the site and asks; everything else unchanged), `+not-found.tsx`.
- `(tabs)/_layout.tsx`: `index` (Browse: Continue reading, `SourceChips`, `Ao3BrowseHome` or FFN home), `search` (box or pasted link, FFN search or `Ao3SearchForm`, recents per site), `library` (history, saved, follows / favorites, downloads, imported, collections, authors; + gives "Import a file" / "Open a link"), `updates` (badge = stories with new chapters), `account`.
- Shared (StoryKey params via `keyFromParam`): `story/[id]`, `read/[id]` (`?ch=`), `listen`, `open`, `import`, `bookmarks`, `collections/index`, `collections/[id]`, `settings`, `web` (in-app browser: FFN mode for `path` / fanfiction.net, open mode + Clip for any other https `url`; `clipFor`), `help/share` (Shortcut / bookmarklet), `drafts/index`, `drafts/[id]`.
- AO3: `ao3/works` (`tag` + filters JSON, or `q` search JSON), `ao3/fandoms/[medium]`, `ao3/series/[id]`, `ao3/user/[name]` (`pseud`).
- FFN only: `s/[...rest]` (`ficshelf://s/<id>/<ch>` → `ffn:` key), `user/[id]`, `beta`, `betas/[cat]`, `review/[id]`, `reviews/[id]`, `fandoms/[cat]`, `crossovers`, `list`, `justin`, `community`, `forum`, `topic`, `groups/dir`, `groups/[kind]/[cat]`, `login`, `account/stories`, `account/authors`, `messages/index`, `messages/read`, `messages/compose`.

### 4.6 `scripts/`
- `check-keys.ts` (part of `npm run lint`): flags `Number(params.id)`, `stories[Number(…)]` and `` `story:${…id}` `` outside `FFN_ONLY` (`src/ffn/`, `src/sources/ffn/`, `src/app/review/[id].tsx`, `src/app/reviews/[id].tsx`, `src/app/user/[id].tsx`, `src/app/s/`).
- `live-check.ts`: FFN via the real `BRIDGE_SCRIPT` in Chromium (playwright-core; `CHROMIUM_PATH`, `xvfb-run -a` headless, `WAIT` 12000 ms, uses `HTTPS_PROXY`; 17 checks, ~20+ requests, no explicit budget; desktop Linux UA, so it can't catch iPhone-only behaviour). `--source ao3`: plain fetch, desktop Safari UA (`Version/26.0 Safari/605.1.15`), `AO3_MAX_REQUESTS = 5`, `AO3_GAP_MS = 3000`; checks work page (view_adult), `/navigate`, id search (ids 3171550 and 19893115), HEAD of the official download (must land on `download.archiveofourown.org`), `/media`; `AO3_WORK=<id>` overrides; prints structure only. **Any other `--source` value silently runs FFN.**
- `dev-proxy.ts` (web harness, port 8787: `/status`, `/reload`, `/fetch` → live FFN via Chromium; `/http` forwards only archiveofourown.org, wattpad.com, fichub.net). `browser.ts` (shared Playwright helper).
- `synthesize-fixture.ts`: `npx tsx scripts/synthesize-fixture.ts in.html tests/fixtures/ao3/out.html [--blurbs N] [--chapters N] [--paragraphs N]` (§8.4).
- `clip-check.ts`: Clip's capture script in headless Chromium (playwright-core, `/opt/pw-browsers/chromium-1194`) on synthetic pages, then `parseClip`; then the real `AutoClip` runner with the capture and Next scripts on three synthetic sites served by `context.route` (an in-place SPA reader ending in a locked episode, a rel=next site, a bot-check page), virtual clock; no network; `CLIP_DUMP=<file>` writes the captured page; 34/34 at `e1b08ba`. Live-check rejects unknown `--source` values since `1cca7be`.

---

## 5. Data model and storage

### 5.1 Story keys (`src/sources/keys.ts`)
- `SOURCE_IDS = ['ffn','ao3','wp','local'] as const`; `type StoryKey = \`${SourceId}:${string}\``.
  Examples `'ffn:123'`, `'ao3:94201446'`, `'wp:404053457'`, `'local:lx3k9f2a8q'`.
- `SOURCE_NAMES`: `{ffn:'FanFiction.net', ao3:'AO3', wp:'Wattpad', local:'Imported file'}`.
- `REMOTE_ID` (private): ffn, ao3, wp `/^\d{1,15}$/`; local `/^[a-z0-9_-]{1,64}$/i`.
- Helpers: `isSourceId`, `toKey(source, id)`, `splitKey(key)` → `{source, remoteId}`, `sourceOfKey`,
  `normalizeKey(x)` (`123 | '123' | 'ffn:0123' | 'AO3:5'` → canonical or `null`; trims leading
  zeros, lower-cases the prefix), `isStoryKey`, `keyFromParam(p)` (URL-decodes; bare number = FFN),
  `authorKey({source,id})`, `compareKeys` (source, then numeric id).
- Remote ids are opaque strings; only a site's own code turns them into numbers (`check-keys.ts`).

### 5.2 Site-neutral model (`src/sources/types.ts`)
- `RouteHref {pathname, params?}`; `AuthorRef {source, id, name, avatarUrl?}` (FFN '123', AO3 'user/pseud', Wattpad username).
- `Tag {kind: fandom|rating|warning|category|relationship|character|freeform|genre, label, id?}`;
  `StoryStats {reviews,favs,follows,kudos,hits,bookmarks,comments,reads,votes}` (all optional).
- `ChapterInfo {number, title, remoteId?, published?, words?, locked?: {price?}, abbreviated?}`.
- `StoryMeta {key, source, remoteId, url, title, author?, coAuthors?, summary, coverUrl?, fandom?, fandoms?, isCrossover?, rating?, language?, genres, characters?, tags?, chapters, plannedChapters?, words, stats, updated?, published?, complete, restricted?, mature?, paywalled?, version?, ao3?: {downloadHtmlHref?, guestComments?}}`.
  Times are Unix seconds. `version` is AO3's `updated_at`: a saved copy is stale; never "new chapter".
- `StoryInfo extends StoryMeta {chapterList, coverLargeUrl?, series?: SeriesRef[], ffn?: {storyTextId?, breadcrumbs?, slug?}, wp?: {lastPublishedPartId?, modifyDate?}}`; `SeriesRef = {id,title,part,prevId?,nextId?}`.
- `ChapterContent {number, title?, html (sanitized), notesBefore?, notesAfter?, remoteId?, story?: StoryInfo, ffn?: {storyTextId?}}`.
- `UpdateResult {key, info?, meta?, chapterIds?, chapterTitles?, chapters?, changed, redownload?, gone?, restricted?, error?}`.
- `FetchOpts {quiet?, signal?, priority?: 'user'|'background'}`; `UpdateCheckOpts {deadline?, onResults?}`; `DownloadOpts {knownVersion?, onInfo?}`.
- `LinkHit`: `story {id, chapter?, chapterRemoteId?, url?}` | `part {partId, url?}` | `author {id, url?}` | `route {href, url?}` | `web {url}`, each with `source`. `SearchQuery {text, [field]: unknown}`.

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

### 5.4 Library (`src/state/library.ts`)
- `LibraryStory` metadata: `{key, source, remoteId, title, author?: LibraryAuthor {id: number|string, name, avatarUrl?}, summary, fandom?, isCrossover?, rating?, language?, genres, characters?, chapters, words, stats, updated?, published?, complete, coverUrl?, chapterTitles?, chapterIds?, coAuthors?, fandoms?, tags?, plannedChapters?, series?, restricted?, mature?, version?, downloadedVersion?}`.
  **`chapterIds` is written only through `applyChapterIds`.**
- Per-source bags: `ffn?: {storyTextId?}`, `ao3?: {adultOk?}`, `local?: LocalOrigin`; `id?: number` = FFN legacy numeric id (read `key`, never `id`).
- State: `inLibrary, followed?, favorited?, downloaded?, downloadedChapters?, lastReadAt?, lastChapter?, lastProgress?, readChapters?, chapterProgress?: Record<string,number>, knownChapters?, lastCheckedAt?, gone?, addedAt, notify?`.
  `newChapterCount(s) = max(0, chapters - (knownChapters ?? chapters))`.
- `LocalOrigin {kind: 'epub'|'html'|'txt'|'md', fileName, generator?, importedAt (ms), size, contentHash ('md5:…'|'fnv:…'), sourceUrl?, origin?: ImportOrigin, identifiers?, chapters?, updated?, dir ('imports/local_<id>'), original?, cover?, images?: Record<index,'img/<n>.<ext>'>}`;
  rebuilt by `normalizeLocal` on load: only the app's own path shapes survive, never `..`, and **unknown fields are dropped**.
- `Bookmark {id, storyKey, storyId? (legacy), storyTitle, chapter, progress, note?, excerpt?, createdAt}`;
  `Collection {id, name, storyKeys, storyIds? (legacy), createdAt}`; `SavedAuthor {key (authorKey), source, id, name, avatarUrl?, followed?, favorited?, storyCount?}`;
  `Draft`; `RecentSearch {source, keywords, type, at}` (`RECENT_SEARCHES_PER_SITE = 20`).
- `AnyStory = StorySummary | StoryDetail | StoryMeta | LibraryStory`; `isLibraryStory` = key and no url; `isStoryMeta` = key and url; `keyOf`, `statsOf`.
- Store `{stories: Record<StoryKey,…>, bookmarks, collections, authors, drafts, searches, lastSync?}`; hooks `useLibrary`, `useLibraryStory`, `reloadLibrary`.
- Mutations: `upsertStory(src, patch, {create})`, `patchStory(key, patch | fn)`, `removeStory`, `setInLibrary`,
  `recordReading`, `markChapterRead`, `markAllRead`, `acknowledgeUpdates`; derived `linkedFileVersion`,
  `newChapterCount`, `unreadCount`, `storyProgress`; `clearHistory`, `syncAccountList`, `syncAuthors`,
  `setAuthorFlag`, `setLastSync`; bookmarks `addBookmark`, `removeBookmark`, `removeBookmarksOf`,
  `remapStoryBookmarks`, `updateBookmarkNote`; collections `createCollection`, `renameCollection`,
  `deleteCollection`, `toggleInCollection`; `saveDraft`, `deleteDraft`, `addRecentSearch`, `clearRecentSearches`;
  `exportBackup`, `importBackup`, `BACKUP_VERSION = 2`.
- `upsertStory` rules: undefined metadata fields are dropped (partial list data never wipes richer
  data); shortened AO3 titles never replace full ones (`withKnownTitles`); metadata `chapterIds`
  ignored when the record has ids; **`ffn` and `ao3` bags are merged, not replaced (add new site bags
  there)**; a record failing `keep()` (`inLibrary || followed || favorited || downloaded || lastReadAt`)
  is deleted; `persistStory` writes `story:<key>` (FFN also a numeric `id`).
- Backups: `exportBackup` leaves out local stories, their bookmarks and collection entries (`isImported`),
  and passes records through `portable()` (drops `local`, `downloaded:false`, strips `ficshelf-doc:` covers);
  `importBackup` accepts v1 files and refuses newer versions.
- kv keys: `story:<StoryKey>`, `author:<authorKey>`, `bookmarks`, `collections`, `drafts`, `searches`,
  `lastSync`, `settings`, `listenPositions`, `myUser`, `schemaVersion`, `migration:v2`, `unreadable:<oldKey>`.

### 5.5 Settings (`src/state/settings.ts`)
- `AppSettings`: `appearance, defaultRating, defaultLanguage, defaultSort, notifications, checkIntervalHours (6), autoDownloadUpdates, wifiOnly, checkOnLaunch, haptics`; `excludedFandoms` (FFN), `pinnedFandoms: {source,name,path}[]`; `sources: Record<SourceId, SourceSettings>`; `reader: ReaderSettings`; `lastUpdateCheck?`, `lastUpdateCheckBySource?`; `onboarded?`, `browseSource?`, `searchScope?`, `whatsNewSeen?`, `settingsVersion?`.
- `SourceSettings {enabled, askAdult? (AO3), hiddenFandoms? (non-FFN), keepOriginals? (local)}`.
  `DEFAULT_SOURCES`: ffn on, ao3 `{enabled:true, askAdult:true}`, wp off, local on. `SETTINGS_VERSION = 2`; `migrateSettings` turns AO3 on once for settings older than 2.
- `ReaderSettings` includes TTS options `ttsRate`, `ttsPitch`, `ttsContinue`, `ttsMixWithOthers`, `ttsReadTitles`, `ttsPauses: off|natural|long`, `ttsSkipNotes` (default true), `collapseNotes`.
- `settingsStore` saved to kv `settings` on every change; `updateSettings`, `updateReader`, `updateSource`, per-site hidden fandoms, `togglePinnedFandom`.

### 5.6 SQLite storage (`src/db/kv.ts`)
- `ficshelf.db` (expo-sqlite, `Documents/SQLite/`), opened lazily with `PRAGMA busy_timeout = 5000`, `PRAGMA journal_mode = WAL`, `SCHEMA_SQL`, then `runMigrations`.
- Tables: `kv(key TEXT PK, value TEXT)` (JSON); `chapters(story_id INTEGER, number, html, saved_at)` (v1, **kept and emptied every launch** so an older build can still write); `chapter_text(story_key TEXT, number INTEGER, html TEXT, saved_at INTEGER, remote_id TEXT, PK(story_key, number))`; `http_cache(key PK, body, etag, fetched_at)`.
- `kv`: `writable` (false after a failed migration: every write is a no-op), `getSync`, `prefixSync`, `entriesSync(prefix)`, async `set`, `delete`, `deletePrefix`.
- `chapterStore`: `get(key,n)`, `getRow(key,n) → {html, savedAt?, remoteId?}`, `put(key,n,html,remoteId?)`;
  `putMany(key, rows, {replace?, merge?, batch=20, onProgress, signal})` (multi-row `INSERT OR REPLACE`,
  `setTimeout(0)` yield between batches; with `replace` / `merge`, rows staged under `${key}#staging` and
  swapped in one `withExclusiveTransactionAsync`; staging deleted on failure); `storyKeys(prefix)`,
  `removeStaging()`, `list(key)`, `remove(key)`, `removeAll(keep?)` (`'local:'` kept), `sizeBytes(key?)`;
  `renumber(key, Map<old, new|null>)` (one exclusive transaction; parks rows on negative numbers first; null deletes).
- `httpCache`: `get`, `put`, `clear` (lifetime decided by the caller; AO3 7 days).
- Migration state: `migrationStatus()`, `retryMigration()`, `copyDatabaseForSharing()`, `snapshotInfo()`, `deleteSnapshot()`, `SNAPSHOT_NAME = 'ficshelf-pre-v2.db'`.

### 5.7 Migration v2 (`src/db/migrations/v2.ts`, `migrateV2`)
1. Precheck: needs `2 × dbBytes + 20 MB` free; if short → `{ok:false, lowSpace:true}`, nothing changed.
2. Snapshot `ficshelf-pre-v2.db` via `backupDatabaseSync`, only if `free > need + db + 50 MB` and the db has rows; deleted 30 days later (`expireSnapshot`).
3. One `withTransactionSync` around `moveLegacy({blobs:true})`: `story:<n>` → `story:ffn:<n>` (merged with any v2 row), `author:<n>` → `author:ffn:<n>`, chapters copied into `chapter_text`; blobs `bookmarks`, `collections`, `listenPositions`, `searches`, `settings` converted; read-back checks (title, read chapters subset, downloaded chapters, lastReadAt, chapter progress, flags, chapter rows and bytes byte for byte); any failure throws `MigrationError` and rolls back; rows naming no story kept as `unreadable:<key>`; writes `migration:v2 {at, snapshot, counts}` and `schemaVersion: 2`.
4. After success: `wal_checkpoint(TRUNCATE)`, then `VACUUM` 5 s later (unref'd timer).
5. Every later launch runs `drainLegacy` (merges v1-shaped rows an older build wrote).

Safety rules (keep them): migrations never throw (return `MigrationResult`); when not ok nothing is
written and the root shows `MigrationFailed` (Retry, share a database copy); transforms pure,
idempotent and re-run on read; unknown fields kept (`normalizeStory`; but `normalizeLocal` is an
allowlist); old builds keep working (FFN rows keep numeric `id`, bookmarks `storyId`, collections
`storyIds`, notifications accept `{storyId}`, v1 `chapters` table stays); tests run migrations on real SQLite (`tests/helpers/sqliteNode.ts`).

### 5.8 Chapter-id remapping (`src/sources/remap.ts`, `src/features/chapterIds.ts`)
- `ChapterRemap {moves: Record<old,new>, removed: number[], changed}`; `remapChapters(oldIds, newIds)`
  (matched by id; an unknown old id keeps its number while it still exists); `remapNumber`,
  `nearestSurviving` (nearest earlier surviving chapter, else 1), `remapNumbers`, `remapRecord`;
  `remapStoryState` (moves `readChapters`, `downloadedChapters`, `chapterProgress`, `lastChapter`; a gone
  chapter resumes at the start of the nearest earlier one); `remapBookmarks`; `remapPosition` (drops an
  audio position whose chapter is gone).
- `applyChapterIds(key, ids)` is the **only writer** of `LibraryStory.chapterIds`: no-op when not in
  library or equal; first sight stores; otherwise `chapterStore.renumber`, patch state, remap titles
  ("Chapter N" for unknown), `remapStoryBookmarks`, `announceRemap` (listeners via `onChapterRemap`).
  Called from `fetchStory` / `fetchChapter`, download `onInfo`, update results. FFN has no chapter ids.
- Imports: `mapChaptersByTitle(oldTitles, oldCount, newTitles)` in `features/imports.ts` (title, else position) when replacing a local story.

---

## 6. Sources and per-site policies

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

### 6.4 Local source and the import pipeline
- **Parse** (`src/import/`): `parseImport(bytes, fileName, {onProgress, signal}) → ImportedBook`.
  Limits `MAX_INPUT_BYTES` 100 MB, `MAX_UNCOMPRESSED_BYTES` 200 MB, `MAX_IMAGE_BYTES` 5 MB,
  `MAX_COVER_BYTES` 20 MB. `ImportError(code: unsupported|too-large|invalid|drm|empty|aborted, user message)`.
  - `sniff.ts sniffFile`: bytes first, name second → epub / html / txt / md; PDF, MOBI / AZW3, Word, web archives turned away with "get the EPUB" style messages.
  - `decode.ts decodeBytes[Async]`: BOM → HTML `<meta charset>` (utf-8, windows-1252, iso-8859-1) → valid or mostly-valid UTF-8 (stray bytes as cp1252) → cp1252; `replaced` flags garbled text.
  - `zip.ts`: own central-directory reader; declared total capped before inflating; entries streamed through fflate and stopped when they outgrow their declared size (zip bomb); names are lookup keys only (zip-slip).
  - `epub.ts parseEpub`: `container.xml` → OPF → manifest / spine → TOC (EPUB 3 nav, else NCX, else spine); a chapter runs from its TOC entry to the next (`cutAt` / `splitBefore` move nodes); AO3 / Calibre preface and afterword → metadata and notes asides; FicHub / FanFicFare front matter read for metadata; images → `ImageTable` (`ficshelf-zip:` keys) → `ficshelf-img:<n>`; `runsOn` one-shot rule (§10.12).
  - `html.ts parseHtmlFile` → private `parsePage(html, stepper, images): Promise<BookDraft>`: AO3 download (`ao3/parsers/download.ts`), saved AO3 work page (`ao3/parsers/work.ts`), saved FFN page (`ffn/parsers/story.ts`), FanFicFare, FicHub; else `webPage` = reader mode (`readability.ts readArticle`: Readability on JSDOMParser fed re-serialized well-formed markup, `{charThreshold: 300, keepClasses: false}`, restoring RN globals `SCRIPT_GLOBALS`; only up to `READER_MODE_MAX = 1_000_000` chars) with a whole-body fallback when reader mode drops chapters or prose (`keepsTheStory`, `partsOf`, furniture detection, `commentSections`); chapters cut at clear h1–h3 headings; `stripActive` removes script-ish tags and hidden-by-attribute / inline-style elements.
  - `text.ts`: `parseTextFile` (heading lines incl. Roman numerals guarded by `doubtfulNumeral` / `LONE_DASH`, FanFicFare's two-blank-line titles, re-joining hard-wrapped lines, `*emphasis*`, "Title / by Author" headers); `parseMarkdownFile` (`#` / `##` chapters; raw HTML shown as text).
  - `build.ts`: `ImageTable`, `importSanitizeOptions`, `sanitizeFragment`, `finishChapter`, `chapterFromHtml`, `splitParts` (`LONG_TEXT_WORDS` 30 000), warnings (`openingWarning`, `partsWarning`, `LEFT_OUT_MIN` 40), `Stepper` (progress, abort, pauses between chapters), `finishBook(draft, fileName)` (word count, title fallback, origin).
  - `dom.ts` (XML / DOM helpers, `CHAPTER_HEADING`, `ROMAN_HEADING`, `SCENE_BREAK`, `isChapterHeading`), `meta.ts` (dates, completion, languages, tags, summaries), `detect.ts` (`detectOrigin(url)` → `ImportOrigin {source: 'ao3'|'ffn'|'wp', remoteId, key}`, `originUrl`, `findStoryUrl`).
  - `ImportGenerator = 'ao3' | 'fichub' | 'fanficfare' | 'calibre' | 'ffn' | 'readability'`. `IMPORT_MIME_TYPES` (picker; MIME only).
- **Store** (`features/imports.ts`): `commitImport(book, file: ImportFile {name,size,contentHash,uri?}, CommitOptions {mode:'local'|'link', replace?, title?, authors?, keepOriginal?, onProgress?, signal?}) → StoryKey`.
  Local: `newLocalKey()` (`'local:' + base36 time + random`), `writeBookFiles`, `putMany` (replace stages and swaps), cleanup on failure; record `notify:false`, `downloaded:true`, `downloadedChapters`, `knownChapters`, `local: fileRecord(...)`; replace keeps progress / bookmarks via `mapChaptersByTitle` + `remapStoryState` + `remapStoryBookmarks` + `announceRemap`.
  Link: merges into the AO3 / FFN story (`putMany({merge:true})`), keeps progress / bookmarks / collections, then `refreshLinkedStory`. Every commit ends with `invalidate('story:'+key)`.
  Identity: `contentHash` (`md5:` from `File.md5`, else `fnv:` over bytes); `findDuplicate` by URL, identifier, hash; `normalizeSourceUrl`. `linkChoice` only for AO3 / FFN origins on an enabled site (Wattpad files stay local). `deleteImportedStory`. `keepOriginals()` (Settings → Imported files).
- **Files** (`features/importFiles.ts`): `Documents/imports/<key with ':'→'_'>/` with `original.<kind>`,
  `cover.<ext>`, `img/<n>.<ext>` (app's own names); replacement staged in `<dir>.new` (`swapInStaged` /
  `dropStaged`); `writing` set guards stories being written; `chapterImages`, `storyFileRef`
  (`ficshelf-doc:`), `writePreviewCover` / `removePreviewCover`, `importFilesBytes`, `isImportCopy`;
  `sweepImports()` at launch clears Inbox / DocumentPicker / preview copies older than 10 min not on a
  ticket, orphan import folders, `#staging` rows, and saved `local:` chapters with no library record.
- **Entry points**: `+native-intent.tsx` (Open-in `file://` → `/import?open=<ticket>`);
  `features/importHandoff.ts` in-memory tickets (`handOff`, `filesFor`, `release`, `inUse`; **the
  screen never takes a path from the route**); `features/importPicker.ts pickStoryFiles()`
  (expo-document-picker with MIME types only); `src/app/import.tsx` modal (per-file status, progress,
  preview, Link or Local, Replace or Keep both, skip one of several; files opened while it's up join the list; copies deleted after).
- **Reader for local stories**: `LOCAL_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'"`
  on `about:blank`; images stored as `<img src="ficshelf-img:<n>">`, `chapterImages` reads them into
  `data:` URIs, `withBookImages` swaps them in; web `<img>` removed under the CSP.
- Local stories never reach network code (tested), are never checked for updates, are not in backups.

### 6.5 Wattpad (planned; research only)
Only `src/sources/wattpad/urls.ts` exists. Terms say "Don't scrape Wattpad" (crawl / spider / remove
content), no bypassing security, no reverse engineering, personal non-commercial use only; no public
API. Blocking is CloudFront + AWS WAF (no Cloudflare); an **empty User-Agent gets a CloudFront 403**.
Errors are HTTP 400 JSON (`1017 NotFound`, `1018 PermissionDenied`). Paid parts must be checked via
`/v5/story/{id}/paid-content/metadata` and **fail closed**. Anonymous search seems to leave out mature
stories. The full API reference and plan are in FEATURES.md §5 (P4) and §7 (P7).

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

### 6.7 Novelpia (2026-10-21 research) and other sites
global.novelpia.com is a Nuxt app without Cloudflare; robots.txt allows `/viewer`; metadata is in
`__NUXT_DATA__`; chapter text comes from `api-global.novelpia.com` with a one-time `_t` ticket after
a server-side entitlement check, then CloudFront-signed content. Extracting the ticket was **denied by
the auto-mode classifier ("Third-Party Attack")**; no chapter text was pulled. The approved route is
"Clip this page" (FEATURES.md §4); a full Novelpia source is optional (FEATURES.md §10). Details
(fields, endpoints, error codes, sample ids) are in FEATURES.md §4 "Novelpia findings".

### 6.8 Clip this page (any https site) and automatic clipping
- Built (P-CLIP, `1cca7be`..`7546679`): the in-app browser's open mode (default WebView UA, its own
  cookie store, no login prefill; http refused with Safari offered; script / local URLs blocked;
  other apps asked about on a tap only; FFN / AO3 links open natively; FanFiction.net, AO3 and
  Wattpad pages offer "Open in FicShelf" instead of Clip); one capture per tap with a nonce and a
  host check; text only (no pictures, link addresses dropped); cleaned URLs; never the original page;
  not in backups; one-time notice; outside `ficshelf://web?url=` links go through `/open`.
- Cookie messages reach the FFN bridge only from https fanfiction.net pages in FFN mode (`03e4a59`
  closed an any-page hole).
- Novelpia: the text is only on the rendered page (its API needs a one-time `_t` ticket after an
  entitlement check). Clip reads only what the viewer rendered; never `__NUXT_DATA__`, the API, `_t`,
  `signed_key` or cookies (§6.7, §10.11).
- **Built (P-CLIP2, FEATURES.md §4a, `8271660`, `e1b08ba`)**: "Clip & next" (one tap:
  clip, save, press the site's Next; "save without asking" unless `clipOddity`), "Clip the next N
  chapters" (`AutoClip`; bar ⋯, story ⋯, `/web?auto=N`), "What Clip sees", Settings → Clipping
  (`clipPace`, `clipBatch`, `clipQuick` under `sources.local`), `ClipInfo.storyTitle`. Approved
  2026-10-27 with the user taking the sites'-terms risk. Hard lines (kept in code): never click buy /
  unlock / subscribe or spend coins (Next candidates with lock words are never pressed), never get
  past a paywall, login or age gate, never solve or bypass a bot check, never handle the site's
  tickets / tokens / API; visible browser in the foreground only (AppState and screen blur pause);
  human pace (≥ 4 s between presses, default 8–15 s); ≤ 200 chapters a run; every stop rule pauses
  with Continue / Stop. Not yet on the phone; AC-11 polish (scroll-loaded text, frames, shadow DOM)
  waits for the user's reports.

---

## 7. Feature inventory

Legend: ✅ built · 🌐 built through the in-app browser with the user's FFN session (or AO3 in Safari
via `Linking.openURL`) · ⏳ not built (reason given) · 🧪 tests only, not confirmed on the phone.

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
- ✅ Politeness per §6.1 / §6.3. 🧪 AO3 has never been reported on the device.
- ⏳ AO3 login and everything behind it (restricted works, kudos, comments, subscriptions, AO3 bookmarks, Marked for Later): P6. ⏳ Work-skin toggle, offline images: P8.

### 7.3 Imported files (local source)
- ✅ Ways in: Library → + → Import a file (several at once), Settings → Imported files → Import a file,
  "Open in FicShelf" from Files / Safari / Mail (needs the `44a9f71` prebuild); tickets; Inbox copies deleted; leftovers swept at launch.
- ✅ Formats: EPUB (AO3, FicHub, FanFicFare, Calibre split files, Sigil, generic; nav / NCX; notes, tags,
  cover, pictures); HTML (AO3 downloads and saved pages, saved FFN pages, FanFicFare, FicHub; other
  pages get reader-mode cleanup up to 1 MB); TXT (chapter detection, unwrapping, "Title / by Author",
  stammer-vs-heading rules); Markdown. PDF, MOBI / AZW3, Word, web archives get a clear "use X instead".
- ✅ Import screen: progress (chapter N of M), preview (cover, title, author, chapters, words, tags,
  origin, warnings), editable title / author, multi-file status; every "Left out …" warning names roughly how many words.
- ✅ Linking a file from AO3 / FFN as that story (chapters as downloads, merged; site asked once;
  suggested when chapter counts agree; a linked AO3 file counts as current only when as new as AO3's text), or keep local.
- ✅ Duplicates (same story page, book id or file): Replace (keeps progress / bookmarks / collections; title then position) or Keep both.
- ✅ Local stories: Imported shelf, collections, bookmarks, Continue reading, library filter, offline
  reader and audiobook, file stats and original-site link on the story page; Delete removes text,
  pictures, file, bookmarks, collection entries and listening position; never checked for updates, never touch the network.
- ✅ Safety: allowlist sanitizer, `about:blank` + CSP reader, zip-slip and zip-bomb guards, size caps, no slow regexes, inline images stored as files.
- ✅ Storage: chapters like downloads; original file (Keep original files, on by default), cover and
  pictures in `Documents/imports/<story>/` by relative path; Settings shows space used and "only on this device, not in backups".
- ✅ Pinned by the golden corpus (299 cases + 1 todo). 🧪 Import has never been run on the device.
- Known open minor cases: FEATURES.md §11 (ISSUE-M1, D3, G5, NEST).
- ⏳ Not picked by the user: EPUB export, full backup with imported stories, FicHub / link import,
  Wattpad linking (Wattpad files import as local stories, link kept), share extension, web pictures inside an imported page (P-IMPORT-X).
- ✅ 🧪 **"Clip this page"** for any https website (FEATURES.md §4, approved 2026-10-21, built 2026-10-27):
  open mode of the in-app browser (`src/app/web.tsx`, rules in `src/net/webPolicy.ts` / `webHosts.ts`),
  capture script `src/net/clipScript.ts` (hidden elements found on the live page, dropped from an inert copy;
  scripts, inline data, form fields and token-carrying attributes left behind), `src/import/clip.ts`
  `parseClip` (reader mode, text only, site name off the title), `src/features/clips.ts` (new story, next
  chapter, undo), `LocalOrigin.clip`, ClipSheet preview, menus, What's new v2, "Send links from Safari".
  Works on the phone (2026-10-27, "perfect it works perfectly now"); CLIP-A1..A9 not reported one by one.
- ✅ 🧪 **P-CLIP2** "Clip & next", "Clip the next N chapters", "What Clip sees", Settings → Clipping
  (FEATURES.md §4a; built 2026-10-27; tests + headless Chromium only). ⏳ Clip polish
  (scroll-loaded text, same-origin frames, shadow DOM) after the user's reports (AC-11).

### 7.4 Reader (all sources)
- ✅ Local WebView, works offline; themes light, sepia, paper, mint, dusk, dark, black (OLED) + match system;
  fonts System, Georgia, Palatino, Times, Verdana, Helvetica, Avenir, Charter, Courier; size, line /
  paragraph spacing, margins, width, alignment, hyphenation.
- ✅ Scroll or page-turn mode; tap zones; auto-scroll; brightness; keep awake (default on); immersive.
- ✅ Progress (chapter %, story %, time left), exact position per chapter, chapter drawer, jump.
- ✅ Bookmarks with notes and a list; find in chapter; iOS Look Up / Translate on selection.
- ✅ Review at the end of a chapter and follow / favourite from the reader (FFN); auto mark-read + manual.
- ✅ Blank-page recovery (`3321ff1`, `4b7f0ba`) 🧪: rebuild at the current position on
  `onContentProcessDidTerminate` / `onRenderProcessGone`, or when an "alive" probe gets no answer
  after returning (2.5 s loaded, 10 s loading), with a limit on endless re-terminations.
- Reader screen pipeline (`src/app/read/[id].tsx`): `usableSavedChapter` → saved copy → `fetchChapter`
  (saved with `remoteId`, next prefetched) → `segmentChapter(html).html` → `withBookImages(html, images, {webImages: !source.reader.csp})`
  → `buildReaderHtml(payload, settings, theme)`; WebView `source={{html, baseUrl: source.reader.baseUrl}}`,
  `originWhitelist={['*']}`; `onShouldStartLoadWithRequest` allows only `about:blank` or same-baseUrl
  non-click navigations; link taps → `openReaderLink(href, baseUrl)`.
- `ReaderPayload {html, title, chapterTitle, chapter, chapters, storyTitle, author?, hasNext, progress, endActions?, csp?}`;
  a `{nonce}` in `csp` gets a fresh nonce on the policy and both scripts; CSS vars `--bg --fg --muted --link --hl --font --size --lh --ps --margin --maxw --align --hyph`;
  page messages `progress, tap, next, action, bookmark, startBlock, ttsJump, find, link, ready, autoscrollEnd`;
  injected API `window.__init, __apply, __autoScroll, __find, __firstBlock, __listening, __page, __scrollTo, __ttsMark`.
- ⏳ Full-chapter AI translation (needs a third-party key); Android Auto.

### 7.5 Audiobook (all sources)
- ✅ Start from the reader's headphones button (first paragraph on screen), Listen on the story page, or any ⋯ menu; tap a paragraph to read from there; highlight follows in scroll and page mode.
- ✅ Background via an expo-audio silent loop (screen locked, silent switch); lock screen / Control
  Center metadata and artwork (written to a cache file since iOS can't fetch FFN images past
  Cloudflare); play / pause from lock screen and headphones; **±10 s buttons = previous / next paragraph**
  (loop position kept between 15 and 40 s); pauses for calls and unplugged headphones.
- ✅ Continues into the next chapter without the reader (offline for downloads; next chapter prefetched); mini player across the app; full player.
- ✅ Speed 0.5x–2x mapped per voice (`src/audio/rate.ts`): above 1x rate `1+(speed−1)/3`; Apple voices
  below 1x use `speed`; Piper below 1x follows Piper's speedCurve between AVSpeechUtterance rates 0.205
  and 0.5; Piper = id starts with `dev.ihor-shevchuk.piper` or contains `>0<`; based on piper-objc 0.2.36–0.2.44 🧪.
- ✅ Pitch; a voice per story language (Premium / Enhanced labelled and preferred); "no voice for this
  language" notice; voice preview; FFN native language names matched; Norwegian `no` / `nn` → `nb`.
- ✅ Add-on voices (Piper): labelled "Add-on · low / medium / high", listed first, never auto-chosen, up
  to 40 per language with smaller models before numbered speakers (Lessac stays visible), 15 s start
  watchdog then default voice, notice when a chosen add-on drops out (open Piper once).
- ✅ Sleep timer 5 min – 2 h or end of chapter; announce chapter titles; separators not spoken; natural
  pauses (Natural 300 / 1100 / 800 ms between paragraphs / scene breaks / after title; Long 650 / 1800 / 1200; Off);
  speech-only cleanup; "Skip author's notes at the start" (default on; errs towards reading) 🧪;
  listening position per story (body-segment index; follows AO3 remaps); "Play over music and other audio" (ducks; no lock-screen controls).
- Engine details: segments ≤ 420 chars at sentence / clause breaks with `breakBefore: none|paragraph|scene`;
  blocks tagged `data-tts`; title segment `block: -1` when `ttsReadTitles` and more than one chapter;
  front-matter boundary exact at `aside.fs-notes[data-pos=before]`, else `frontMatterBlocks` heuristic
  (A/N, Summary, Disclaimer near the top, up to a scene break or heading, at most 2 unlabelled tail blocks,
  word cap max(400, 40%), never the whole chapter); `expo-speech` with `LOOKAHEAD = 1`; watchdogs 5 s /
  15 s; `BASE_WPM = 175`; positions in kv `listenPositions` (200 most recent, saved 1.5 s after a
  change); `resumePoint` prefers reader progress when newer by > 90 s; `forgetListenPosition` on delete;
  `onChapterRemap(remapListenPosition)` at module level plus a temporary listener during a load (follows once). `AUDIOBOOK_SUPPORTED` iOS and Android only.
- ⏳ Server "HD" voices (FictionPress GPUs). ⏳ Kokoro on-device neural TTS / BYO-key cloud voices (offered 2026-10-07; not picked).

### 7.6 Library and updates
- ✅ Reading history with progress, filter by fandom; Follows, Favourites and authors synced from the FFN
  account; Downloads with storage used and per-story delete; Imported shelf; collections; sorts (last
  read, updated, added, title, unread, progress); filters (fandom, status, unread, site); "New chapters" badges.
- ✅ Backup to JSON via the share sheet and restore via the picker (v1 backups import; imported stories left out).
- ✅ Updates tab: Check now, pull to refresh, last-checked time; checks on launch and foreground (at
  most once a minute; waits up to 30 s for the bridge when FFN is due); background task
  `ficshelf-update-check` with `minimumInterval = max(15, hours × 60)` minutes when notifications are on;
  local notifications (individual for ≤ 3 stories, else one summary) open the story; optional
  auto-download (Wi-Fi only option; at most `MAX_QUIET_REDOWNLOADS = 3` version-only refreshes; never
  from the background for a logged-in source).
- Update logic (`src/features/updates.ts`): `storiesToCheck()` = `notify !== false`, not complete, not
  gone, and followed / in library / downloaded / favourited-and-read, oldest `lastCheckedAt` first;
  `checkable(id)` = `caps.updates && enabled() && !comingSoon`; per-site stamps
  `lastUpdateCheckBySource` (`stampChecked`); `dueSources(now, share)` (interval ≥ 30 min);
  `runBackgroundCheck()` covers `dueSources(now, 0.5)` minus FFN unless `bridge.pageReady`,
  `BACKGROUND_BUDGET_MS = 25_000`, `addExpirationListener → abort`; only a new chapter is news; `redownload` only marks a download stale.
- ✅ Storage v2 (§5.7), pre-upgrade copy shown under Settings → Library & storage 🧪 (never reported run on the phone).
- ⏳ Server push (needs FictionPress's servers).

### 7.7 App and settings (`src/app/settings.tsx`, in order)
Appearance (theme, haptics) · Sources (FanFiction.net "Always on"; AO3 switch; Ask before showing adult
works; Hidden AO3 fandoms; Fold authors' notes; Wattpad "Coming soon" at line 160) · Reader (same panel
as Aa) · Browsing defaults (rating, language, sort, hidden fandoms) · New chapters (notifications,
check on launch, "Check at most every", auto-download, Wi-Fi only) · Imported files (Import a file,
count, space used, Keep original files) · Library & storage (count, downloads size, pre-upgrade copy,
Back up, Restore, Clear image cache, Clear page cache incl. AO3 fandom lists, Clear reading history,
Delete all downloads) · Connection (status, account, Run security check now, Reconnect, Connection
details) · About (version, disclaimer).

Also: ✅ in-app browser: fanfiction.net pages in FFN mode (`web.tsx`; shares cookies with the bridge;
opens story / profile links natively; other hosts go to Safari) and any other https page in open
mode with Clip (§6.8); deep links
`ficshelf://s/<id>/<chapter>`, `ficshelf://open?url=…`, pasted FFN URLs; iPad layout; accessibility
labels, Dynamic Type, VoiceOver-reachable mini player; Android APK builds via EAS (never tested on a device).

### 7.8 Other sites
⏳ Wattpad reading (P4), ⏳ Wattpad login (P7), ⏳ AO3 login (P6), ⏳ Novelpia source (optional,
P-NOVELPIA; Clip covers it). A pasted Wattpad link shows "Wattpad support is coming soon".

### 7.9 Known limitations (README plus review)
- AI translation / writing tools used FictionPress's private service (iOS menu Look Up / Translate instead).
- No server "HD" voices; lock-screen next / previous paragraph via ±10 s (expo-audio has no next / previous track); "play over other audio" has no lock-screen controls.
- New-chapter checks only at launch, foreground and iOS background windows (no push).
- Forum posting, publishing and account settings use FFN's own pages in the in-app browser.
- AO3 has no in-app login; reading doesn't add hits; work skins not applied.
- Imported stories exist only on the phone (not in backups; deleting the app erases them); no EPUB
  export, no link import from other sites; Wattpad files import as local; web pictures in imported pages not shown.
- The in-app browser's open mode (Clip) takes https pages only; Clip keeps text only, one page per tap, and
  can't see canvas, cross-origin frames, shadow DOM or scroll-loaded text.
- Piper voices can vanish after a phone restart until the Piper app is opened; the Piper speed mapping depends on current Piper behaviour.
- FFN logged-in pages use adaptive parsing never inspected with an account.
- Cloudflare challenged the container's headless browser after many automated requests (on a phone, the "Quick security check" sheet appears).

---

## 8. Testing and verification

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
| `npx tsx scripts/clip-check.ts` | 34/34 at `e1b08ba` (headless Chromium, synthetic pages and sites, no network) |

README's Verification row says `1214 / 1214 pass` (P-CLIP2 + story-page refresh); keep it in step in the same commit as new tests (PLAN.md §4 / §5 carry the count too).
Nothing native can be verified in the container: say what still needs a device test.

### 8.2 Test files (51) and counts at `5cc19e8`
Added in P-CLIP2 (60 files, 1213 tests): next-script 22 (jsdom), auto-clip 27 (fake site, virtual clock), clip-report 2; clip-screen +6 (Save & next, quick save, run banner / background / Stop, blur pause, auto=N, What Clip sees), clip-commit +2 (`storyTitle`), clip-parse +1 (same-story / chapter numbers). The screen test mocks `expo-keep-awake`, `expo-clipboard`, `useFocusEffect` and `AppState.addEventListener` (RN's jest preset returns no subscription).
Added in P-CLIP (57 files, 1153 tests at `ca4749f`): web-policy 11, clip-script 10, clip-parse 10 (incl. titles), clip-url 3, clip-commit 14, clip-screen.tsx 8; open-link and native-intent gained cases (example.com now gets the browser offer). jsdom tests use `/** @jest-environment jsdom */`; the screen test mocks `react-native-webview` with a forwardRef that records props and injected scripts.

- AO3: ao3-adapter 14, ao3-download 8, ao3-library 14, ao3-parsers 21, ao3-resume 2, ao3-review 13, ao3-screens.tsx 4, ao3-stale-chapters 13, ao3-updates 25, ao3-urls 49.
- Core: backup 5, blocks 11, bridge 16, chapters 6, ffn-adapter 10, ffn-slots 19, http 20, images 12, keys 34, kv-sqlite 12, library 21, migration-v2 25.
- Import: import-commit 22, import-corpus 300 (299 + 1 todo), import-decode 11, import-epub 42, import-html 28, import-screen.tsx 7, import-sniff 9, import-text 21, local-delete 1, local-source 7, native-intent 13.
- Other: open-link 15, parsers 23, pickers 3, player-local 3, player 33, rate 5, reader-local 5, reader-template 4, registry 43, remap 10, routes-keys 10, sanitize 53, segments 23, session 5, urls-forms 9, voices 7, wattpad-urls 20, webview-config 3.
- Screen tests are `.tsx` with `react-test-renderer` (`act`, `create`).

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

### 8.5 The golden import corpus (`tests/import-corpus.test.ts` + `tests/helpers/corpus.ts`)
- Why: three verify → fix rounds on import heuristics oscillated (each fixed one shape and broke another). The corpus pins the right result for every scenario found.
- 266 cases at creation, 269 at `49442b7`, **299** at `5cc19e8`, in 21 `describe` groups named after
  repro scripts (`vp/`, `rv/`, `r1/`–`r4/`, `speed:`), plus `it.todo('r1/nest: …')` at line 2555.
- **The four rules** (file header; apply to every heuristic change):
  1. Never lose story text silently: anything left out (front matter, comments, furniture) is named in
     a warning with about how many words; under `LEFT_OUT_MIN = 40` (title, byline) no warning needed.
  2. When genuinely ambiguous, keep the older trees' behaviour plus a warning rather than a new heuristic.
  3. Prefer removing or narrowing a rule over adding one; every rule is justified by a corpus case.
  4. No synchronous stretch over about 1 s for inputs under the limits; no O(n²) over TOC entries or lines; push, don't spread, in loops.
- Case fields: `name` (cites where it came from), `file` (extension picks the parser), `input: () => Uint8Array | string`,
  `why` (required wherever trees or opinions disagree), `title`, `authors`, `origin`, `sourceUrl`,
  `generator`, `summary`, `chapters` (titles; RegExp when several are right), `count`, `words` (per
  chapter ±max(5, 3%); `null` skips), `total`, `has`, `inChapter: {index: [...]}`, `lacks`, `html`,
  `warn` (`'none'` or RegExp), `leftOut: {words, of}` (±max(5, 5%)), `keptOrWarned: {has, words, of}`,
  `ms` / `stall` (usual bounds `ms: 3000, stall: 1500`; 5000 for the 585k-word TXT; measured with a 2 ms interval),
  `extra` (`inOrder(...)`, `allParts`), `timeout` (default 20_000; 60_000 for crafted perf cases).
  `runCase` throws if `leftOut` / `keptOrWarned` asks for under 40 words; compares all in one `toEqual` diff.
- Adding a case: reproduce → add → **show it fails on HEAD** → fix. Change an existing expectation only
  when it contradicts the rules, and say why in `why` and the commit. Keep the corpus under about 25 s.

### 8.6 Live-request budgets
Implementer ≤ 15 AO3 requests ≥ 3 s apart (desktop Safari UA, all reported); reviewers ≤ 6; research
"a few polite requests"; `live-check -- --source ao3` at most once per phase / before a release. Stop
hitting a site as soon as challenges start. Never print story text.

---

## 9. Process and conventions

### 9.1 Git
- Branch `claude/ficshelf-fanfiction-app` (upstream `origin/claude/ficshelf-fanfiction-app`); `master`
  holds the old unrelated Python project (a "Microsoft Rewards Farmer" bot; `695e10d` replaced it after
  the user said "you're free to delete everything").
- Commits by `Claude <noreply@anthropic.com>`, SSH-signed by the environment (`commit.gpgsign=true`,
  `gpg.format=ssh`); `%G?` shows `N` only because `allowedSignersFile` isn't set. Don't change git config.
- Push with `git push -u origin claude/ficshelf-fanfiction-app`. **No pull request has ever been opened**; don't open one unless asked.
- Commit:
  ```
  git add -A && git commit -q -F - <<'EOF'
  <Subject>

  <body>

  <the two attribution lines from the current session's system reminder, verbatim>
  EOF
  git push -u origin claude/ficshelf-fanfiction-app
  ```
  Stage explicit paths instead of `-A` when the tree holds unrelated work (as in `3212230`). Scratch
  files never go in the repo (`ios/`, `android/`, `dist/` are gitignored).
- Commit and push at the end of every green step; checkpoint commits of reviewed-but-unfinished work
  are fine (tell the user "pushed, but don't install yet"; add "Known open items (being fixed next): …" to the body).

### 9.2 Commit message style
- Subject: imperative, plain English, user-visible effect, no prefix (no `feat:`), no trailing period,
  about 50–75 characters (e.g. "Fix iPhone login/search and add the audiobook player", "Pin file
  import with a golden corpus and fix the open findings").
- Body wrapped at about 72 columns: a short "why" paragraph, then `- ` bullets, sometimes under plain headings ("Connection", "Audiobook (src/audio)").
- Trailers: exactly the two lines (`Co-Authored-By: …` and `Claude-Session: https://claude.ai/code/session_…`)
  after a blank line, copied from **your own** session's attribution reminder (the session URL changes
  per session; the last one used at `5cc19e8` was `session_01JHSZecYy27N5viB3DRjR5V`). **No model
  names or ids anywhere else** (subjects, bodies, code, docs); the repo was checked clean.
- Every commit with new tests updates README's Verification row `| N / N pass |` (done with `sed`) plus README / PLAN / INSTALL text for new features.

### 9.3 Code conventions
- Every module opens with a `//` header saying what it's for and why (161 of 172 `src` files); exported
  fields and functions carry `/** … */` with intent, units ("Unix seconds", "ms since epoch") and edge
  cases; about 10.6% of non-blank lines are comments; plain, British-leaning English ("favourite",
  "colour"); no `TODO`, `FIXME` or `console.log` in `src/`.
- User-facing text: plain sentences saying what happened and what to do ("AO3 asked FicShelf to slow
  down. Try again after 14:05."), in the words of the site involved, curly apostrophes (`’`).
- Naming: `StoryKey` everywhere outside FFN-only code; `remoteId` opaque string; `<site>Source`,
  `<site>Ui`, `parse<Site>Link`, `<site>Meta` / `<site>Info` / `<site>Chapter`; stores `xStore` + `useX`;
  constants `UPPER_SNAKE` with named policy numbers (`BACKGROUND_BUDGET_MS`, `UPDATE_BATCH`, `MAX_QUIET_REDOWNLOADS`).
- Errors: typed classes with `this.name` and recovery fields (`BridgeError.code`, `RateLimitedError.retryAt`,
  `ServerBusyError.status`, `HttpTimeoutError`, `NetworkError.site`, `SourceBlockedError.source`,
  `FfnPageError.code`, `NeedsWebError.path`, `LoginRequiredError`, `ComingSoonError`,
  `UnsupportedSourceError`, `LocalMissingError`, `Ao3*Error` (`Ao3ChapterGoneError.chapterIds`),
  `ImportError.code`, `MigrationError`); cancellation = `Error` with `name = 'AbortError'`;
  `components/states.tsx ErrorView` maps classes to screens; background code swallows errors with
  `.catch(() => {})` only where harmless and retried later.
- Purity: adapters, parsers, `src/import`, `remap.ts`, migrations, `segments.ts` don't import RN; platform splits via `.web.ts(x)`.
- State: tiny `createStore` stores, immutable updates, kv writes that don't wait, normalize-on-read for anything stored.
- Tests: shared state replaced with `jest.mock` (captured variables must start with `mock`); module
  state reset with `jest.resetModules()` (`ao3-resume`, `bridge`) or `jest.isolateModules()`
  (`backup`, `library`, `kv-sqlite`, `import-commit`); assert behaviour plus request counts and
  priorities; each review or verifier finding becomes a regression test or corpus case.

### 9.4 Checks before commit
`npx tsc --noEmit`; `npx jest`; `npm run lint`; `npx expo export --platform ios --output-dir <tmp>`; update the README count.

### 9.5 How implementation, review and verification workflows were run
The session used the Workflow tool for substantive tasks. The pattern that worked:
1. **Implement**: one agent (or core then integration). Its prompt carries a CTX block: repo, branch,
   HEAD, what's done, the design, the policies, the checks with the expected test count, "Do NOT
   commit or push", "no new npm dependencies unless essential", "make every check green", and a JSON
   summary schema (`done`, `deviations`, `checks`, `live_check`, `manual_checklist`, `known_gaps`).
2. **Multi-lens review**: 2–4 reviewers in parallel, each in a copy of the repo outside
   `/home/user/mhm` (without `node_modules`, then symlinked), never modifying the repo, reproducing
   each finding, reporting only real defects (`file`, `line`, `severity` critical / high / medium /
   low, `failure_scenario`, `suggested_fix`). Lenses used: device fixes (connection / engine / ui /
   session); P0–1 (migration data safety / key coverage / FFN parity / code); P2 (parity / modules
   incl. sanitizer attacks); AO3 (parsers vs real pages / flows incl. FFN regressions / policy);
   import (parsing / security / flows / perf). Order lenses by risk (data safety first).
3. **Refute** (early phases): two refuters per finding defaulting to `real=false` (doubled agent
   count; later replaced by one verifier per finding or for all).
4. **Fix**: one fixer over all findings by id; root cause plus a regression test that fails before
   the fix; per-id outcome `fixed` / `not_a_bug` / `deferred`.
5. **Independent verify**: re-creates every original scenario against the fixed tree, checks a
   regression test exists, hunts for **new** problems (marked realistic or not), runs all checks read-only.
6. **Bounded confirm**: a closing check scoped to the last fixes, the corpus, the checks and sample
   files; **not an open-ended hunt**.
7. **Ship**: the main session re-runs every check, commits and pushes. Agents never commit.

Results: every phase's reviewers found real bugs (migration data safety → `57ec6be`; a sanitizer
`javascript:` bypass via an invisible space; 20 AO3 findings → `6c1015f` + 5 verifier follow-ups →
`a315dbe`; 28 import findings → `16eaf18`). Refuters removed false positives; verifiers caught partial fixes.
What didn't work: open-ended verify → fix loops on heuristics (import r1 10/10 fixed, 6 new; r2 6/7,
8 new; r3 7/9, 6 new). What converged (`phase5-import-converge-2`): corpus first (no src changes) →
fix until it passes → verify (10/10, 4 new) → final fix (critical / high / realistic-medium only) →
confirm (4/4 + one medium fixed by the main session) → `5cc19e8`.
Other helpers: schemas on every agent; per-tree output comparison of repro scripts (`git archive <sha>`
snapshots + a compare script); split big agents; pass real data in `args` and validate it at the top
of the script; resume with `{scriptPath, resumeFromRunId}` (agents with unchanged prompts replay from
cache; editing a later agent's prompt re-runs only that one). Workflow scripts and journals lived in
the old session's directories; they do not exist in a fresh container.

### 9.6 Harness constraints
- **Stop hook** (`~/.claude/stop-hook-git-check.sh`) blocks ending a turn with uncommitted changes,
  untracked files, unsigned or wrongly-committed commits, or unpushed commits (fired 5 times). Keep
  scratch out of the repo; end every turn committed and pushed. When reviewers run on uncommitted
  work, commit anyway and point them at `git diff <base commit>` (prompts: "the change may be
  uncommitted or already committed; use `git diff <base>`"); tell the user not to install yet.
- **Auto-mode classifier** may deny actions (2026-10-21: extracting Novelpia's `_t` ticket,
  "[Third-Party Attack]"). Don't work around it: stop, explain, offer the approved alternative. Once
  its note leaked into a subagent's output: verify such outputs and strip the note.
- **Usage limits** killed workflow agents in every multi-agent phase (phase 0–1: 22 of 36 runs; source
  layer 16 of 24; AO3 reviews 3 of 7; import 6 of 14; converge-1 its only agent; first handoff run 5 of
  9). On resume: `git status`, `git log`, inspect partial edits, run checks, resume or finish yourself.
- **Worker restarts** ("This session's worker process was restarted"): re-check state and continue.
- Foreground `sleep` is blocked (use Monitor or `run_in_background`); background work notifies on
  completion (don't poll, don't end a turn waiting); `pkill -f "scripts/dev-proxy.ts"` killed the
  agent's own shell (exit 144): use a `[d]ev-proxy` pattern.
- Network: outbound HTTPS goes through the agent proxy; on a proxy 403 / 407 report the blocked host.
- Context was compacted three times: after a compaction re-derive state from `git log`, `git status` and FEATURES.md, not memory.

### 9.7 Reporting to the user
See §2.2. Status → commit + test count → changes in user terms → test-only vs device → install
template (T1 / T2) → what to try → what's next. On a limit or failure: what was kept, what restarted, the last safe commit.

---

## 10. Lessons learned: mistakes, patterns, gotchas

Each lesson: **what happened** (commit / file) → **rule**.

### 10.0 The rules that matter most
1. **Never lose story text silently.** Anything left out gets a "Left out … (about N words)" warning (import, clipping, audiobook note skipping, reader mode).
2. **One rule per behaviour, pinned by a test.** Import heuristics must pass the 299-case corpus; prefer narrowing or reverting a rule over adding one.
3. **Be polite to every site** (§6.1): user-triggered requests through the one HTTP client; background work spaced wider and budgeted.
4. **Never get around access control** (paywalls, restricted works, one-time tickets, mature gates, `/cdn-cgi/`). A classifier refusal is final for that approach.
5. **Synthetic fixtures only.**
6. **Prove each regression test fails before the fix** (stash or revert the fix, run, restore).
7. **Tell the user whether a prebuild is needed**, and say "don't delete the app" and "back up first" when stored data changes shape.
8. **Assume a usage limit can cut any step**: commit checkpoints, split big agents, check `git status` before trusting anything.
9. **Every new stored field must pass the normalizers** (`normalizeLocal` is an allowlist and drops unknown fields on every launch).

### 10.1 iOS, Expo, Hermes, free Apple ID

| What happened | Rule |
|---|---|
| The first install set had `react-native-worklets` 0.13, outside expo-modules-core's range; it would have broken the iOS build (fixed in `456dc51`) | Add native deps with `npx expo install <pkg>`; run `npx expo install --fix` after version changes; never `npm audit fix` |
| A free Personal Team can't sign the `aps-environment` (push) entitlement | Keep `plugins/withoutPushEntitlement.js` **first** in `plugins`; local notifications only; no App Groups / Associated Domains / iCloud / Push |
| Xcode 27 / iOS 27 SDK can open to a black screen without the UIKit scene life cycle | Keep `["expo-build-properties", {"ios": {"enableSceneSupport": true}}]` |
| The Mac was on Sequoia 15.7.4; SDK 57 needs Xcode 26.4+ (macOS Tahoe 26.2+); Xcode 27 needs 26.6+ and an iOS 17+ phone | Check `sw_vers -productVersion` before giving Xcode steps; Node ≥ 22.13 |
| Free ID: apps stop opening after 7 days; 3 apps per device; 10 new App IDs per 7 days | Weekly reinstall (T4) without deleting; a share extension costs an App ID and a second signing target after every prebuild, so it stays optional |
| Debug builds need the Mac and Metro | Scheme **Release**, "Debug executable" unticked; re-check after a prebuild |
| Hundreds of yellow Xcode warnings pasted | They come from RN / Expo code; say so briefly; only red errors matter |
| Expo Go can't run the app; the container has no Mac or device | Checks stop at `npx expo export --platform ios`; tell the user what needs a device test |
| The audiobook (`fde0496`, expo-audio) and import (`44a9f71`, `CFBundleDocumentTypes` etc.) only worked after `npx expo prebuild -p ios`, which recreates `ios/` and wipes `ios/.xcode.env.local` | Every update message says whether prebuild is needed; after prebuild redo the NODE_BINARY line and check Signing / Release |
| `git pull` could conflict with the user's own `bundleIdentifier` | Always `git pull --autostash`; repo edits stay away from that line; on conflict keep the user's line |
| With `LSSupportsOpeningDocumentsInPlace: false`, Open-in files arrive as copies in `Documents/Inbox` as `file://` URLs to `+native-intent.tsx` | Route them through tickets; sweep leftovers |

Hermes / JS runtime:

| Gotcha | Rule |
|---|---|
| Xcode updated itself to Xcode 27 / Swift 6.4 (2026-10): the build failed twice. First "Failed to build module 'ExpoModulesCore'; this SDK is not supported by the compiler (the SDK is built with 'Apple Swift version 6.3.1' …)": Expo's npm-shipped precompiled modules (`usePrecompiledModules` defaults to true) were built with an older Swift. Then "Cannot find type '__ObjC::expo' in scope" in ExpoModulesJSI's interface: Expo's own bug, fixed in expo-modules-jsi 57.1.3 | `app.json` `ios.usePrecompiledModules: false` (`570b9ad`) + keep Expo on the latest SDK patches (`npx expo install --fix`, `ca4749f`); both are native changes (T2). When a red Xcode error names an Expo module after an Xcode update, read the package CHANGELOGs on unpkg (`https://unpkg.com/<pkg>@<version>/CHANGELOG.md`) for a fix first. A by-hand `npm install <pkg>@<ver> --no-save` unblocks the user without touching tracked files |
| The user's newer npm prints "install scripts not yet covered by allowScripts" (esbuild, fsevents, unrs-resolver) | Harmless dev tools; tell the user to ignore it |
| Hermes has **no Web Workers**; fflate's async APIs spawn them | Only fflate's sync APIs or streaming `Inflate` (`src/import/zip.ts`); one-shot inflate keeps decoding past its output, so stream and stop when an entry outgrows its declared size; zip names are lookup keys only |
| Hermes has **no DOMParser** | Readability runs on its bundled `JSDOMParser`; feed it htmlparser2-parsed, dom-serializer-rewritten HTML (it knows only the five XML entities and wants quoted attributes) |
| Metro runs `JSDOMParser.js` without a receiver and not strict, so it **overwrites RN's global `Node`, `Element`, `Document`, `Text`** (RN defines them lazily via getters) | `readability.ts` saves `SCRIPT_GLOBALS` (read *before* the require) and restores them; keep it |
| Research said Hermes rejects `\p{…}` regexes; RN 0.86's own `hermesc` accepts `\p{Lu}` (and `src/import/dom.ts` uses `\p{L}` / `\p{Lu}`) | Check runtime claims with the project toolchain (`npx expo export --platform ios`), not an older CLI |
| node-html-parser dropped `<SELECT>` with unclosed `<option>`s and collapsed a forum table on an unclosed `<span>` | htmlparser2 + css-select + domutils + dom-serializer behind `El`; `normalizeSelects()` closes options; use `tr` selectors, not `tbody tr` |
| RN 0.86 removed `StyleSheet.absoluteFillObject`; a TS 6 `never` narrowing bit a type guard; eslint `react-hooks` purity flagged `Date.now()` in a callback | `StyleSheet.absoluteFill` / explicit styles; impure calls in module-level helpers (`freshHome()` in `BridgeHost.tsx`) |
| A non-`async` fetcher threw synchronously for a non-FFN key; `useQuery` calls it outside its try, so the screen sat on "Loading story…" forever | Every fetcher passed to `useQuery` / `usePaged` must be `async` |
| Integer-like object keys enumerate in numeric order; `stories[123]` → `stories['ffn:123']` silently changed library tie-break order | Sort explicitly (`compareKeys`) when re-keying maps |
| `push(...arr)` with huge arrays overflowed the stack in the sanitizer; a recursive walk over 12,000 nested tags still overflows (`it.todo`) | No spread into calls or array copies in loops; walk iteratively |

### 10.2 WebView
- **What happened**: on the iPhone, login said "Load failed", the login page showed FFN's "404 Oops",
  search said "Can't reach FanFiction.net" (fine on the Mac). FFN 302-redirects the default WKWebView
  UA's `/login.php` to `m.fanfiction.net`; the bridge's same-origin `fetch` became cross-origin
  ("Load failed"); `m.fanfiction.net/login.php` is a 404. → Every FFN WebView spreads
  `FFN_WEBVIEW_PROPS` (desktop Safari UA with `Platform.Version` + `contentMode: 'desktop'`); the reader
  sets `userAgent={DESKTOP_USER_AGENT}`. Test scripts used desktop Linux Chromium and could never have
  caught it: use an iPhone UA for such checks. (Fixed in `fde0496`; "everything works".)
- **What happened**: blank reader after the app sat in the background (iOS kills the web process). →
  Rebuild at the current position on `onContentProcessDidTerminate` / `onRenderProcessGone`, plus an
  "alive" probe on `active` (2.5 s loaded / 10 s loading). Review fixes (`4b7f0ba`): the rebuild position
  mustn't carry over to later visits; a still-loading page isn't dead; limit endless re-terminations.
- **What happened**: after the web process dies WebKit clears `WKWebView.URL` and react-native-webview
  13.16.1's `reload()` reloads the *original* `source`. → `web.tsx` remounts with `uri: nav.url || p.uri`;
  `BridgeHost.tsx` remounts and calls `bridge.onPageGone()`.
- **What happened**: `web.tsx` accepts `{type:'cookies'}` from any page and is locked to FFN / Cloudflare / OAuth hosts. → P-CLIP opens it deliberately with a cookie-origin guard and nonce-checked messages.
- Any page's JS can call `window.ReactNativeWebView.postMessage`: never trust a message without a nonce and an origin check.

### 10.3 Audio / TTS

| What happened (commit) | Rule |
|---|---|
| Background play and lock screen needed an active audio session (`fde0496`, `0698ebb`) | Silent 60 s 8 kHz WAV loop through expo-audio with `keepAudioSessionActive: true` (`src/audio/session.ts`); start it as soon as playback is requested, or locking during the first chapter download suspends the app |
| expo-audio stacks remote-command handlers | `setActiveForLockScreen` **once per launch**, then only `updateLockScreenMetadata` |
| Lock-screen / headphone play never reached the player: 500 ms status updates kept restarting the external-change check (`0698ebb`) | Never restart that timer on every status tick |
| Seeking before the silent track was `readyToPlay` could throw in AVFoundation | Guard seeks with `isLoaded`; re-base in `finally` |
| expo-audio has no next / previous track | ±10 s = next / previous paragraph; duck / mix mode has no lock-screen controls (README) |
| expo-speech **fails silently** on a missing / invalid voice ("playing", no sound) | Start watchdog (`WATCHDOG_MS` 5000, `ADDON_WATCHDOG_MS` 15000) retries once with the default voice; voice list refreshed on foreground |
| FFN gives native language names ("Español", "日本語"), so non-English stories got an English voice (`956add0`) | `languageCode()` maps native and English names; `no` / `nn` → `nb` (`31439d4`) |
| Piper add-on voices report **Enhanced** quality; a multi-speaker model adds hundreds of numbered speakers that filled the 40 cap and hid Lessac (`e3c72f0`, `31439d4`) | Label add-ons by identifier, never auto-pick one, smaller named models before numbered speakers, show low / medium / high; on drop-out tell the user to reopen Piper |
| **Speed**: iOS hands extension voices `<prosody rate="P%">` with P = 100×rate below normal and 100 + 300×(rate−1) above, so Apple voices at 2x played about 4x; Piper (piper-objc 0.2.36–0.2.44) reads 20–99 % as an AVSpeechUtterance rate where 50 % is normal, so 0.9x played about 2.2x and 0.5x at 1x (user report 2026-10-07) | `speechRate(speed, voice)` per voice (`PIPER_SLOW` curve, floor about 0.5057; `c79d776`). A research workflow measured what iOS actually sends before the mapping changed; do the same next time. Ask for a re-test if Piper updates |
| "Skip the summary": FicShelf never reads the summary; the user heard the author's notes. The first heuristic ate real story (unlabelled paragraphs after a note, "…" / "?!" dialogue as separators, hyphenated words matching labels) (`3321ff1` → `4b7f0ba`) | `frontMatterBlocks()` errs towards reading; switchable; skipped notes stay tappable; `skip(+1)` from the title respects it |
| Short dialogue ("I-I...", "Mm.") dropped as a separator (`956add0`) | A line with quotes or sentence punctuation is speakable; only repeated-letter dividers (`-x-x-x-`, `xXx`, `oOoOo`) are scene breaks |
| The saved position was a raw segment index; toggling chapter titles shifted resume by one | Positions are body indexes; resume uses the newer of listen position and reading progress (`resumePoint()`) |
| Two player tests broke when pauses were added (they assumed queue-ahead across paragraphs) (`07f2553`) | New behaviour defaults get disabled in older tests' `beforeEach` (`ttsPauses: 'off'`), with dedicated tests |
| Kokoro / sherpa-onnx researched: 215–400 MB, ~800 MB RAM, iOS kills > 80 % CPU over 60 s in background, Core ML crashes on some iOS 26.x / 27.0 | Don't build without an explicit go-ahead; native code that can't be compiled here means Xcode fix rounds with the user |

### 10.4 Background work
- **What happened**: the AO3 background check had no budget, wasn't oldest-first and saved results only
  at the end; a short iOS window threw everything away and later works were never checked (fixed in
  `6c1015f`). → `BACKGROUND_BUDGET_MS = 25_000`, oldest `lastCheckedAt` first, results per batch,
  `addExpirationListener` aborts. FFN follows the same budget.
- **What happened**: an AO3-only run (bridge down in background) stamped the global `lastUpdateCheck`,
  starving FFN for 6 h. → Per-site stamps (`lastUpdateCheckBySource`, `dueSources()`); any global stamp is a cross-source regression risk.

### 10.5 Modals and sheets
- iOS refuses to present a sheet while another modal is up and every later menu stayed stuck. →
  `SheetHost` clears a sheet that hasn't appeared after 1.5 s (`e2c8ac5`); voice / pause pickers close
  the reading-settings panel first and open 450 ms later; the import picker waits 300 ms for the sheet to close.
- The mini player covered content and toasts. → `useMiniPlayerInset()` / `miniPlayerLayout.ts`; toast zIndex 1100.

### 10.6 Storage, keys and migration
- FFN and AO3 share ids (3171550). → `StoryKey` everywhere; `keyFromParam()`; `check-keys.ts` in lint.
- v2 migration review findings (`afafdf2` → `57ec6be`): one damaged `story:0` row failed the upgrade
  every launch; the space check counted 2× while the real cost is about 3× (snapshot + WAL + checkpoint);
  `INSERT…SELECT` + `DELETE` left the file doubled (no VACUUM, WAL never truncated); `open()` cached a
  half-opened db (a hole in "writes blocked until migrated"); dropping the numeric `id` broke an older
  build reading `stories[s.id]`. → One transaction with count and byte verification; `unreadable:<key>`
  instead of throwing; free-space check first (`bytesNeededToConvert`); snapshot only with room;
  `wal_checkpoint(TRUNCATE)` + deferred VACUUM (unref'd timer); `kv.writable` false until success
  (`MigrationFailed`); stay readable by the previous build; drain legacy rows each launch; user backs up first.
- `withExclusiveTransactionAsync` opens a **second SQLite connection**; neither had a busy timeout, so
  writes failed "database is locked" during import batches. → `PRAGMA busy_timeout = 5000`.
- The web store (`kv.web.ts`) silently fell back to memory on quota and then removed the original rows. → Never remove source rows unless the copy is stored for good.

### 10.7 Across sites (source layer review, `2ae4a2a`)

| What happened | Rule |
|---|---|
| `safeUrl` checked the scheme on `visible(value)` but returned `value.trim()`; `trim()` strips U+FEFF / U+00A0 / U+2028 / U+3000, so `﻿javascript:` got through (high) | Validate exactly the string you return |
| `ALLOWED[el.name]` on a plain object accepted `<constructor>` | Lookups on untrusted names use `Object.create(null)` maps or `hasOwn` |
| FFN's "challenge-platform" check flags *every* AO3 page (passive `jsd` script); `CF_TITLE` matched an AO3 work titled "Just a moment" | Per-site block detectors; Cloudflare's exact titles (`Just a moment...`, `Attention Required! \| Cloudflare`), `cf-mitigated: challenge`, `cf_chl_opt`; Wattpad: CloudFront 403, `x-amzn-waf-action`, HTML where JSON expected |
| Relative chapter links resolved as FFN links; `//host/…` lost its host; FFN's `parseLink` claimed anything starting with `/` | Resolve against the story's own base (`resolveLink(input, base)`, `absoluteLink`), base only when http(s) (`absoluteLink('#n1','about:blank')` returned `about:blank#n1`) |
| On web, `credentials:'include'` against Wattpad's `Access-Control-Allow-Origin: *` fails | `http.web.ts` fetches Wattpad without credentials |
| The client cooled down only on 429 / 503 + Retry-After | Rest a host after **any** 5xx (`ServerBusyError`); GET retried once, POST never |

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

### 10.10 Wattpad (research)
- Terms forbid scraping; no public API; the user accepted the personal-use risk in principle (OQ-1
  still formally open). → User-triggered only, auto-download off, kill switch, no native password login.
- Paid parts: `text_url` is handed out even for blocked parts. → Check `paid-content/metadata`; **fail closed**; never fetch, cache, download or speak a locked part.
- An empty UA gets a CloudFront 403. → Always send a UA.
- Anonymous search seems to omit mature stories. → Don't work around it.

### 10.11 Novelpia and the classifier denial (2026-10-21)
- The chapter text needs a one-time `_t` ticket from an entitlement-checked API; extracting it was
  denied ("Third-Party Attack"); the page showed "Free" while `flag_free` was `0`. → Never handle a
  site's tickets or tokens outside its own page; don't trust one flag over what the site shows; the
  approved route is Clip (rendered DOM, one tap per chapter).
- iPhone Safari saves `.webarchive` or PDF (both rejected); raw HTML of JS readers has no text. → Clip takes the *rendered* DOM.

### 10.12 Import heuristics
The verifier rounds after `16eaf18` oscillated:

| Round (commit) | Fixed | Broke or found next |
|---|---|---|
| verify of `16eaf18` | 27/28 | Stammer fix half-done ("I - I don't know." still a heading); reader-mode coverage kept only the longest section; WordPress body classes ("right-sidebar") marked the page as furniture; "1-Storm" no longer a heading; wrapped first paragraph taken as "Title / by Author"; Markdown `[` lines froze import (48 ms per line) |
| r1 (`99f38f9`) | 10/10 | `loneNumeralTitle` too strict; Tumblr reblog notes imported; `partsOf` O(words × depth) froze nested pages |
| r2 (`99f38f9`) | 6 | `frontPaths` took whole files, so a Calibre-split one-shot **lost 1,000–2,000 words**; author's-note links became the origin; comment-posted story parts dropped silently; quadratic loops |
| r3 (`3212230`) | 8 | `runsOn` merged books with non-h1–h3 chapter files; a long reader comment rejected reader mode; `storyOf` cut a rescued prologue's opening; a new rule demoted a real "V. …" heading |

Why: each fixer added a rule for the reported shape with nothing guarding earlier shapes. Fix: the
golden corpus (§8.5) built from every repro, with disputed expectations settled by running against
snapshots of every tree (`44a9f71`, `16eaf18`, round 1, `99f38f9`, `3212230`; failures fell 136 → 90 → 69 → 49 → 39).

| What happened | Rule |
|---|---|
| A one-shot was decided by **the first line of later files** (`runsOn`); a Calibre split file opening "No." was cut into 'x' chapters; a "Start"-only TOC with bold-line titles merged into one chapter | **Decide one-shots by metadata**: run on only when the single TOC entry equals the book title or fields say `Chapters: 1/1` (`5cc19e8`); else one chapter per file + "The table of contents didn't match the text" |
| Corpus EPUBs all had the placeholder title "T", so the title signal never fired in tests | Synthetic fixtures need realistic metadata (`dc:title`, AO3-style fields); `epub()` takes `meta` |
| Front matter decided by title (Preface / Afterword one-shots couldn't import), then by whole file (lost story), then by part | Decide by content (copyright, link and fields pages); a file is front matter only when *every* TOC entry in it is; short text sharing chapter 1's file is kept; title / cover / Information pages in their own file stay front matter **with a counted warning**; `titleLines` drops only heading, title, byline, ©, "Disclaimer…" and `Key: value` lines; a whole `<br>` block isn't a title line |
| Stammers ("I... I don't know.", "I - I…", "V – very well.") became headings, then fixes rejected real Roman headings | `isChapterHeading` / `doubtfulNumeral` (`src/import/dom.ts`) + `text.ts`: a surer heading ("V. Vows are made.") beats a nearby doubtful stammer; "1-Storm", "1.Storm" are headings; "10-year-old", "5...", "1.5" are prose |
| Reader mode dropped sections, rejected pages for a long comment, or kept chrome | `keepsTheStory()` compares article and body; comments never count against reader mode; a dropped comments section with 300+ running words gets "Left out the page's comments … about N words"; theme body classes are never furniture; ignore `<select>` / `<option>` / `<button>` / `<textarea>` text; reader mode only up to 1,000,000 chars |
| Text before the first heading in TXT / MD / HTML dropped silently | Keep it or name it in a counted warning |
| A linked AO3 file older than AO3's text blocked downloading newer text | `linkedFileVersion()` records AO3's version only when counts match and the file isn't older |

### 10.13 Import performance (all fixed; keep them fixed)
- `partsOf` counted words at every nesting level (O(words × depth)) → count once (`wordCounts()`).
- 17–64 s freezes: `starts.indexOf` / `splice` per removal in TXT; `findOne` per TOC entry; spread
  copies in `entriesIn`; `splitBefore` re-linking every later sibling → mark-and-filter once, per-file
  id indexes, push only, splice once.
- Markdown regexes (`\*\*(?=\S)(.*?\S)\*\*`, link patterns) were quadratic on long `[` / `*` lines.
- `parseEpub` rendered and counted every chapter in one synchronous pass; a heading-less file became one
  unbounded chapter → yield between chapters (`Stepper`), split heading-less books into parts, write each chapter as parsed.
- `data:` images skipped the 5 MB cap and cost ~1 s per MB in the sanitizer; the preview cover was
  base64-encoded in JS during render → store images as files; cap `data:` URIs.
- jest runs about 3× slower than `tsx` → corpus bounds under jest: < 3000 ms total (5000 for `vp/stall`), stall < 1500 ms (2000 for p7 / p7b).

### 10.14 Import flow and security (`16eaf18`)
- A `ficshelf://import?file=…` link could point the screen at any file and delete it on failure; a regex
  guard was bypassable with `Documents/Inbox/../SQLite/<db>`. → One-time tickets only; **never take a file path from a route param**.
- The launch sweep deleted an Inbox copy being imported (iOS copies keep the original mtime). → Never decide "leftover" by mtime alone; ticketed files are in use.
- `file://` URLs were percent-decoded twice (router query parsing, then `useLocalSearchParams`), breaking names with `#`, `?`, `%`. → Tickets; test odd file names.
- Deleting an imported story while its reader was still mounted let the reader's next progress message (`upsertStory` with `create: true`) re-create a ghost. → Deletes must stop or ignore late writers.
- A second "Open in" while the import screen was focused arrived as a params update and was dropped. → Queue it.
- A linked import stored `downloaded: true` without `downloadedVersion`, so the first update check re-downloaded the whole AO3 work. → Linking must not cause automatic site traffic.
- expo-document-picker silently drops UTI strings (`UTType(mimeType:)` + `compactMap`) and always opens `asCopy: true`. → **MIME types only** (`IMPORT_MIME_TYPES`); delete cached copies; same for the backup picker in `settings.tsx` (still uses `'public.json'`: fix in P-IMPORT-X).

### 10.15 Testing

| What happened | Rule |
|---|---|
| `ao3-resume` insertion case "failed" because the first test left a listening position in the player's module state | Reset module state per test (`jest.resetModules()` + re-require, or `jest.isolateModules()`); `memoryKv` maps on `globalThis`; if a test passes alone but fails in the suite, suspect leaked state first |
| Jest "did not exit": the player's 1.5 s save timer and the VACUUM timer held the process | `unref?.()` module-level timers (`src/audio/player.ts:56`, `src/db/kv.ts:70`) |
| An FFN ordering test was flaky with equal timestamps | Distinct timestamps or an explicitly unchecked story (`'ffn:9'` in `tests/ao3-updates.test.ts`) |
| `sanitize.test.ts:163` (< 1500 ms) failed once in a full run; `import-screen.test.tsx` hit the 5 s timeout on a cold cache (7 cascade failures) | Rerun alone before chasing; give timing headroom; longer timeouts for cold-cache suites (FEATURES.md PRE-1) |
| `jest.mock` factories can't reference outer variables | Prefix captured variables with `mock` |
| `player.test.ts` stubbed `src/features/chapters`, so the real offline-first loader went untested | Keep a test that runs the real code a stub replaces (`tests/chapters.test.ts`) |
| A helper bug (empty cookies overwriting the session cookie) hid a bridge bug | Review helpers like code |
| A Python-scripted insert corrupted `Sheet.tsx`'s toast style | Scripted edits assert a unique match and are followed by tsc and lint |
| `scripts/clip-check.ts` first saw no message at all (P-CLIP): Playwright's `setContent` writes into the current document, so `addInitScript` never ran, and tsx adds a `__name` helper to functions passed to `page.evaluate` | In Playwright checks, install page stubs with `page.evaluate('<string>')` after `setContent`; pass strings, not functions |
| jsdom has no `checkVisibility` and only part of CSS, so the capture script's real behaviour needed a browser engine | Run DOM scripts that will run in WebKit through `scripts/clip-check.ts` (headless Chromium) as well as jsdom |
| Real AO3 / FicHub / FanFicFare files were used to check import | Never committed; synthetic fixtures; the corpus is the guard in a fresh container |

### 10.16 Process and orchestration

| What happened | Rule |
|---|---|
| Usage limits killed agents again and again (§9.6) | Commit + push checkpoints when green (`86ec2f4`, `bf3f9f5`, `3212230`); split big agents (converge-1's single "corpus + fix" agent died at step 79 and lost everything; converge-2 split corpus → fix → verify → final-fix → confirm); resume the same script (unchanged prompts replay); after a cut-off run `git status` / `git diff --stat` and the checks |
| Two refuting verifiers per finding doubled agent count; the runner ran about two agents at a time | One verifier per finding or one for all; lenses ordered by risk; when verifiers die, read reviewer findings and fix directly |
| Placeholder args (`phase5-import-fix-round`): the script read `args.not_fixed` but was launched with placeholder input (`"note": "SEE FILE"`) | Validate `args` at the top (throw on wrong shape) or inline data from a file just written; check the first `log()` line |
| The stop hook demanded a commit while reviewers read uncommitted changes | Point reviewers at `git diff <base>`; commit early |
| Prompt drift: a verifier was told work was uncommitted after `49442b7` was pushed | Keep later prompts in sync with the real tree (edit only the tail of a script) |
| Adversarial verifiers always find another edge case | Bound it: ≤ 3 rounds, drop low-severity new findings in the last, then a corpus and a **closing check that is not an open-ended hunt**; fix the last medium item directly with a narrow rule |
| Reviewers worked in copies and `git archive` snapshots | Keep that; snapshots settle "which behaviour was right" quickly |
| Research claims were wrong (Speechify free tier said 500K chars/month, actually 50K; "avoid `\p{}`") | Fact-check vendor claims and runtime limits; mark measured vs quoted vs inferred |
| Several "done" moments were followed by verifier findings | Read actual results, run checks yourself, say test-only vs device |
| Design phase numbers didn't match build order | Use stable ids (FEATURES.md) |
| Context compacted three times | Re-derive state from git and FEATURES.md |
| 2026-10-27: Bash calls sometimes failed with "auto mode classifier gave no verdict" several times in a row (ten in a row ends the turn) | Retry once; meanwhile use Read / Grep / Glob / WebFetch (read-only tools don't need the classifier); don't loop |
| 2026-10-27: no review agents were spawned (the harness says not to unless the user asks) | Do the multi-lens review inline: re-read the diff per lens, mutation-check each new test (break the code, see it fail, restore) |

### 10.17 Communicating with this user
- Plain language, short status; "Continue" = resume from the last checkpoint.
- One command per code block; restart from the step they name.
- Translate symptoms into root causes before fixing ("load failed" was a mobile redirect; "speed goes faster" was iOS's prosody mapping for extension voices; "skip the summary" meant author's notes).
- Ask for Connection details / exact Xcode errors; afterwards say exactly what to try.
- "Hold off installing" while reviews run; every update message ends with the right install template; say explicitly when prebuild is *not* needed.
- Offer ranked options with costs; record approvals; "don't fret" = safe version with a switch.
- Be honest about container limits; deliver files with SendUserFile and commit them.
- 2026-10-27: when the user hit an Xcode error, they pasted the red errors; the fix needed two
  rounds. Give one command per block, say why each step is there, and offer a by-hand unblock
  (`--no-save`) when the proper fix needs a push that's delayed.
- The user clears context between phases and wants the handoff files complete before that.

---

## 11. Milestone history

Legacy: 137 commits `81a92af` (2021-03-24) … `aecd6c0` (2023-12-03), an unrelated Python bot that came
with the repo; `695e10d` replaced it. Ignore them.

FicShelf (27 commits, 2026-10-06 → 2026-10-21). "README count" = the Verification row at that commit.

| # | Commits | Date | Summary | README count | Prebuild |
|---|---|---|---|---|---|
| M1 | `695e10d` | 10-06 | Full FFN client from scratch (bridge, parsers, login, reader, library, updates, drafts, PMs, basic TTS); live check 17/17 | 39 | first build |
| M2 | `456dc51`, `ac60af4` | 10-06 | iOS build hardening: SDK 57 pins (reanimated / worklets / gesture-handler), scene life cycle for Xcode 27, `withoutPushEntitlement`, eas.json, Node ≥ 22.13, INSTALL.md; `preview-simulator` EAS profile | 39 | yes (first build) |
| M3 | `fde0496`, `956add0`, `0698ebb`, `e2c8ac5` | 10-06 | First device feedback: desktop-UA and mobile-redirect fix, Connection details; app-wide audiobook (expo-audio); review fixes (language voices, bridge re-send, lock-screen play, VoiceOver, stuck action sheet); confirmed "everything works" | 67 → 86 | yes (`fde0496`) |
| M4 | `07f2553`, `86a9596`, `e3c72f0`, `31439d4` | 10-06/07 | Natural pauses and speech cleanup; add-on (Piper) voices labelled, listed first, 40 cap, quality, Norwegian fix; Lessac confirmed | 86 → 104 | no |
| M5 | `3321ff1`, `c79d776`, `4b7f0ba` | 10-07 | Second device feedback: blank-reader rebuild, skip author's notes, per-voice speed mapping, review fixes; not yet confirmed on device | 115 → 127 | no |
| M6 | `afafdf2`, `57ec6be` | 10-08/09 | Multi-source foundation: source-qualified keys, storage v2 migration, `check-keys.ts`; review fixes (unreadable rows, space check, VACUUM, numeric FFN id kept) | 224 | no (backup first) |
| M7 | `2ae4a2a` | 10-09 | Source layer: Source contract and registry, FFN adapter + slots, polite HTTP client, block detection, allowlist sanitizer, chapter remap, AO3 / Wattpad link parsing | 484 | no |
| M8 | `bf3f9f5`, `6c1015f`, `a315dbe` | 10-09/10 | AO3 reading loop (browse, search, work, reader, adult gate, official download, audiobook, batched updates); 20 review findings + 5 verifier follow-ups fixed (stale chapter ids, polite checks, gates, per-site check times, resume-follow) | 554 → 600 | no |
| M9 | `86ec2f4`, `44a9f71` | 10-10 | File import: pure-TS core (EPUB / HTML / TXT / MD), then the `local` source (import screen, Open in, Imported shelf, CSP reader, linking, Replace / Keep both) | 600 → 712 | yes (`44a9f71`) |
| M10 | `16eaf18`, `99f38f9`, `3212230` | 10-10/11 | Import review fixes (parsing, ticketed Open-in, launch sweep, perf), verifier rounds 2–3 | 712 → 789 | no |
| M11 | `49442b7`, `5cc19e8` | 10-12, 10-21 | Golden import corpus (269 → 299 cases) and the last fixes (one-shots, "Start"-only contents, front pages with prose, Roman stammers, `<br>` title blocks) | 1058 → 1088 (+1 todo) | no |
| handoff | `6320411` | 10-21 | FEATURES.md + MASTER_FEATURES.md | 1088 | no |
| M12 | `1cca7be`..`abac63f` | 10-27 | Preflight (flaky tests, stale docs, live-check flag); "Clip this page": browser policy + cookie guard, capture script, parseClip, clipped stories (new / next / undo), browser open mode, ClipSheet, menus, entry points, What's new 2, Send links from Safari, Chromium check | 1088 → 1153 | no |
| M13 | `570b9ad`, `ca4749f` | 10-27 | Xcode 27 / Swift 6.4 build fix: precompiled Expo modules off; Expo SDK 57 patches (expo-modules-jsi 57.1.3); expo-doctor 21/21; the build works on the phone | 1153 | yes (T2) |
| handoff 2 | `324ae66` | 10-27 | P-CLIP2 (automatic clipping) written up as the top priority; Wattpad on hold | 1153 | no |
| M14 | `8271660`, `e1b08ba` | 10-27 | P-CLIP2: Next finder, auto-clip runner, Clip & next, Clip the next chapters, What Clip sees, Settings → Clipping, What's new 3; inline review (6 fixes, each mutation-checked) | 1153 → 1213 | no (but T2 because of `ca4749f`) |

User decisions in time order:
- 2026-10-06: delete the old repo content; build an FFN replacement app; first device install; "everything works".
- 2026-10-07: Lessac works; speed bug; blank page bug; skip the "summary"; Kokoro / cloud voices offered (not picked).
- 2026-10-08: "it will also feature wattpad and ao3"; order AO3 → reading before login → import before Wattpad; import scope EPUB + HTML / TXT (not "links from other sites", not "backup / export").
- 2026-10-12: "Pause"; resumed 2026-10-21.
- 2026-10-21: import declared ready to install (T2); asked about a Novelpia page; approved Clip ("I want you to do this, and hopefully any future website"); asked for these handoff files (FEATURES.md for next phases, MASTER_FEATURES.md for full context and lessons; "put these two files in my downloads folder").
- 2026-10-27: Clip built; the 7-day profile had expired (reinstall over it); Xcode 27 / Swift 6.4 build errors fixed in two rounds; "perfect it works perfectly now"; asked for non-manual clipping; picked "Clip & next" to start and "Clip the next N chapters" as the main feature, "regardless of TOS"; "we're not doign anything wattpad until we perfect clipping feature"; asked for these files to be updated before clearing context.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **StoryKey** | `'<source>:<remoteId>'` (`ffn:123`, `ao3:5`, `wp:6`, `local:lx3k…`); the one id for a story outside FFN-only code. A bare number means FFN |
| **remoteId** | the site's own id as an opaque string |
| **SourceId / source** | `ffn`, `ao3`, `wp`, `local`; one `Source` adapter each (`src/sources/registry.ts`) |
| **Source contract** | the `Source` interface (§5.3): caps, reader base, `getStory`, `getChapter`, `downloadAll?`, `checkUpdates?`, `search?`, `session?` |
| **caps** | what a source can do (`browse`, `search`, `download`, `updates`, `login`, `follow`, `endorse`, `discuss`, `accountSync`, `groups`) |
| **slots / SourceUi** | per-site UI pieces (stat cells, actions, routes, tag groups, reader end actions) that shared screens render without branching on the site |
| **bag** | a per-site sub-object on a record (`ffn`, `ao3`, `wp`, `local`), merged in `upsertStory` |
| **bridge** | the hidden WKWebView on www.fanfiction.net that runs FFN requests same-origin (`src/net/bridge.ts`, `BridgeHost.tsx`, `BRIDGE_SCRIPT`) |
| **challenge / verification** | Cloudflare's bot check; passive reload first, then the visible "Verify you are human" sheet |
| **quiet / priority** | background requests that never escalate to a visible check; `user` vs `background` priority in the HTTP queue |
| **POLICIES** | per-host spacing, timeout and cooldown table in `src/net/httpCore.ts` |
| **cooldown / rest** | a host paused after 429 (cooldown, `RateLimitedError`) or another 5xx (rest, `ServerBusyError`) |
| **block detector** | per-site `isXBlock` / `detectXBlock` in `src/net/blocks.ts` → `SourceBlockedError` |
| **stableText** | AO3 flag: a saved chapter copy can be reused if its chapter id and version match |
| **version / updated_at** | AO3's edit stamp on `StoryMeta.version`; marks a download stale, never a new chapter |
| **chapter ids / remap** | site chapter ids per number (`LibraryStory.chapterIds`, only via `applyChapterIds`); a `ChapterRemap` moves progress, downloads, bookmarks and listen positions when chapters are inserted, deleted or reordered |
| **restricted** | an AO3 work for logged-in users only |
| **adult gate** | FicShelf's own "show this Mature / Explicit / Not Rated work?" prompt |
| **official download** | AO3's HTML download whose link is copied from the work page |
| **local source** | imported (and, soon, clipped) stories under `local:` keys; never touches the network |
| **LocalOrigin** | `LibraryStory.local`: the imported file's record (kind, generator, hashes, dir, images, origin, soon `clip`) |
| **linking** | storing an imported AO3 / FFN file as that site's story (chapters as downloads) instead of a local story |
| **ticket** | a one-time in-memory handle (`importHandoff.ts`) that hands an Open-in file to the import screen; routes never carry paths |
| **Inbox** | `Documents/Inbox`, where iOS copies "Open in" files |
| **sweep** | `sweepImports()` at launch: removes stale copies, orphan folders, staging rows, orphan local chapters |
| **staging** | `${key}#staging` chapter rows or `<dir>.new` folders used for atomic replace |
| **ImageTable / ficshelf-img: / ficshelf-zip: / ficshelf-doc:** | import image registry; in-text image refs; zip-entry keys during parsing; relative Documents file refs |
| **reader mode** | the Safari-Reader-style cleanup (Mozilla Readability on JSDOMParser) for unknown HTML pages |
| **furniture** | site chrome (menus, sidebars, footers, comments) that reader mode drops |
| **front matter** | (import) title / copyright / fields pages before the story, kept as metadata with a counted warning; (audiobook) author's notes at a chapter's start that "Skip author's notes" passes over |
| **notes asides** | `aside.fs-notes[data-pos=before|after]` the reader folds and the audiobook uses as an exact boundary |
| **one-shot / runsOn** | a single-chapter work; `runsOn` decides by metadata whether split files run on as one chapter |
| **stammer / doubtfulNumeral** | dialogue like "I... I" or "V – very well." that must not become a chapter heading |
| **Left out warning / leftOut / keptOrWarned** | the counted warning for dropped text; corpus expectations for it (`keptOrWarned`: either kept or warned) |
| **LEFT_OUT_MIN** | 40 words; below it no warning is needed |
| **corpus** | `tests/import-corpus.test.ts`: 299 synthetic cases pinning every import scenario found |
| **Stepper** | import progress / abort / pause helper so parsing yields between chapters |
| **migration v2 / snapshot / drainLegacy / unreadable:** | the v1 → v2 storage upgrade; its `ficshelf-pre-v2.db` copy; the per-launch merge of rows an older build wrote; kept rows naming no story |
| **writable** | `kv.writable`; false after a failed migration (writes become no-ops, `MigrationFailed` shows) |
| **normalize-on-read** | stored records re-validated on every load (`normalizeStory`, `normalizeLocal`, …) |
| **check-keys** | `scripts/check-keys.ts`, part of lint, rejecting numeric-id misuse outside FFN-only files |
| **FFN-only files** | `src/ffn/`, `src/sources/ffn/`, `app/review/[id]`, `app/reviews/[id]`, `app/user/[id]`, `app/s/` |
| **segments / listen position** | TTS chunks ≤ 420 chars with `data-tts` block ids; per-story `{chapter, index, at}` in kv `listenPositions` |
| **add-on voice / Piper / Lessac** | third-party iOS speech voices (Piper – Neural TTS); Lessac is the user's voice |
| **silent loop** | `assets/audio/silence.wav` played through expo-audio to keep the audio session and lock-screen controls |
| **What's new** | `WhatsNewSheet` shown once per `WHATS_NEW_VERSION` |
| **prebuild** | `npx expo prebuild -p ios`: regenerates `ios/` from `app.json`; needed after native changes |
| **Personal Team** | the free Apple ID signing team; 7-day profiles |
| **T1 / T2 / T3 / T4** | update templates: JS-only, prebuild, storage change, weekly re-sign (§2.4) |
| **live check** | `scripts/live-check.ts` against the real sites, strictly budgeted |
| **synthetic fixture** | test input with real markup shapes and lorem text (`scripts/synthesize-fixture.ts`) |
| **CTX block / lenses / refuter / verifier / confirm** | workflow terms: shared context in agent prompts; review angles; agents that try to disprove a finding; independent re-check of fixes; bounded closing check |
| **journal** | a workflow's per-agent result log (old session only; not in a fresh container) |
| **Clip / open mode / ffn mode** | the planned "Clip this page" feature; the in-app browser's any-https mode vs today's FFN mode (FEATURES.md §4) |
| **kill switch** | a per-site Enabled switch that hides the site and stops all its requests (planned for Wattpad) |
| **lock / fail closed** | Wattpad paid parts; unknown lock state is treated as locked |

---

## 13. Next work

P-CLIP2 is built and pushed (not yet on the phone). When the user is back: send T2 (prebuild,
because of `ca4749f`), ask them to try AC-A1..A6 (Clip & next, a 10-chapter run, a Novelpia run to
its first locked episode, leaving the app mid-run, "What Clip sees", reading / listening offline)
and to paste a "What Clip sees" report from any site where Next isn't found; fix from those
(AC-11). Read **FEATURES.md**. Its front matter names `next_task: P-CLIP2` (§4a: "Clip & next" first, then
"Clip the next N chapters" as the main feature, then Clip polish; approved 2026-10-27, the user takes
the sites'-terms risk; the hard lines in §4a policies stay). P4 / P7 Wattpad are on hold until the
user says clipping is perfect; then P6 AO3 login, P8 polish, P-IMPORT-X (only if asked) and
P-NOVELPIA (optional). FEATURES.md also holds the resume protocol, the known open minor issues and
every open question with its default. The user's next install is T2 (prebuild) because of `ca4749f`.
