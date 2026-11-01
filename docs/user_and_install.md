# The user, how they build and install, and how to talk to them

> Read before writing to the user, giving install steps, or touching anything that needs a phone test.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

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
  about terms (`docs/clipping/p-clip2.md` §4a policies: no unlocking / buying / bot-check solving / ticket handling,
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
  terms, a Novelpia source vs Clip). Don't build without a yes. Record approvals (date + quote) in docs/ROADMAP.md.
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

### 9.7 Reporting to the user
See §2.2. Status → commit + test count → changes in user terms → test-only vs device → install
template (T1 / T2) → what to try → what's next. On a limit or failure: what was kept, what restarted, the last safe commit.

---

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
