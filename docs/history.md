# History: milestones, user decisions, open questions, change log, status snapshot

> Read when you need why something is the way it is, or what the user decided and when.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

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
| handoff | `6320411` | 10-21 | docs/ROADMAP.md + AGENT_ROOT.md + docs/ | 1088 | no |
| M12 | `1cca7be`..`abac63f` | 10-27 | Preflight (flaky tests, stale docs, live-check flag); "Clip this page": browser policy + cookie guard, capture script, parseClip, clipped stories (new / next / undo), browser open mode, ClipSheet, menus, entry points, What's new 2, Send links from Safari, Chromium check | 1088 → 1153 | no |
| M13 | `570b9ad`, `ca4749f` | 10-27 | Xcode 27 / Swift 6.4 build fix: precompiled Expo modules off; Expo SDK 57 patches (expo-modules-jsi 57.1.3); expo-doctor 21/21; the build works on the phone | 1153 | yes (T2) |
| handoff 2 | `324ae66` | 10-27 | P-CLIP2 (automatic clipping) written up as the top priority; Wattpad on hold | 1153 | no |
| M15 | `2d33d0f`, `488b9c5`, `5371b6d` | 10-27 → 10-29 | Story page reloads clipped chapters + pull to refresh (device report); P-CLIP3 background clipping (jobs, hidden browser, banner, Clipping screen, resume after relaunch), shadow-root / frame text, What's new 4 | 1213 → 1230 | no |
| M16 | `e7b3221`..`a16fe35` | 11-01 | P-UI1 Kindle-style look behind Settings → Look, built in 10 steps with screenshots after each: switch, palette + Literata, generated covers, four tabs + Home, Library, story page, reader, Discover / More, default + What's new 5 | 1230 → 1290 | no (T1) |
| M14 | `8271660`, `e1b08ba` | 10-27 | P-CLIP2: Next finder, auto-clip runner, Clip & next, Clip the next chapters, What Clip sees, Settings → Clipping, What's new 3; inline review (6 fixes, each mutation-checked) | 1153 → 1213 | no (but T2 because of `ca4749f`) |

User decisions in time order:
- 2026-10-06: delete the old repo content; build an FFN replacement app; first device install; "everything works".
- 2026-10-07: Lessac works; speed bug; blank page bug; skip the "summary"; Kokoro / cloud voices offered (not picked).
- 2026-10-08: "it will also feature wattpad and ao3"; order AO3 → reading before login → import before Wattpad; import scope EPUB + HTML / TXT (not "links from other sites", not "backup / export").
- 2026-10-12: "Pause"; resumed 2026-10-21.
- 2026-10-21: import declared ready to install (T2); asked about a Novelpia page; approved Clip ("I want you to do this, and hopefully any future website"); asked for these handoff files (docs/ROADMAP.md for next phases, AGENT_ROOT.md + docs/ for full context and lessons; "put these two files in my downloads folder").
- 2026-10-27 (after P-CLIP2 was installed): "after clipping passes, the chapters don't show up until i leave the book and reclick on it, please add a swipe up refresh" → `2d33d0f` (auto-reload + pull to refresh).
- 2026-10-29: "prioritize in production and afterwards work on making any website available for clipping … just you paste the link of the first chapter … everything is done in the background … if there is a problem where it requires the user to login to do a security check it will prompt that for the user, and when that is resolved, it will return back to its processes" → P-CLIP3.
- 2026-10-31: "I wish for something similar to amazoin's kindle. That's the best reference I want you to have for overall GUI design" → review of the current screens; Claude recommended a preview first, then building behind a switch; "Go ahead with the preview" → design/kindle-preview/index.html (claude.ai artifact); 2026-11-01: "I like this a lot better, can you create a handoff … Let this current task be the first phase to be dealt with before anything else" → P-UI1, first phase.
- 2026-11-01: "Start phase P-UI1 … match it, build it behind the Settings "Look" switch, one step at a time, and send me screenshots after each step" → built UI-1..UI-10 the same day, a commit and screenshots per step; Kindle-style became the default with Classic in Settings and in What's new 5.
- 2026-10-29 / 30: asked for "something google like"; Material You with the reader theme's colours was built (`72a9e95`), then reverted the next day ("Only undoing the change of the gui"). Keep the original look; ask before any restyle.
- 2026-10-27: Clip built; the 7-day profile had expired (reinstall over it); Xcode 27 / Swift 6.4 build errors fixed in two rounds; "perfect it works perfectly now"; asked for non-manual clipping; picked "Clip & next" to start and "Clip the next N chapters" as the main feature, "regardless of TOS"; "we're not doign anything wattpad until we perfect clipping feature"; asked for these files to be updated before clearing context.

---

## Superseded: the old MASTER_FEATURES "Next work" note (before P-UI1 was built; current state: ACTIVE_HANDOFF.md)

**First: P-UI1 (`docs/ui_rules.md` §3a)**, the Kindle-style look the user approved as a preview
(design/kindle-preview/index.html; open it in a browser, its `<style>` holds every value). Build
it behind Settings → Look (Kindle-style / Classic), in the small steps listed there, one commit
each, sending phone-sized screenshots after each step (`npx expo export --platform web` +
`node scripts/web-shots.cjs`). JS only (T1). The user reverted a restyle once (Material You,
2026-10-30) because they saw it only when finished: match the preview, keep classic one tap away,
show progress step by step.

Then:

P-CLIP3 (background clipping) is built and pushed (not yet on the phone; T1, no prebuild, if the
user already installed the P-CLIP2 build with its prebuild). Ask them to try BG-A1..A5 (FEATURES
`docs/clipping/README.md` §4b) first, especially whether a background job keeps pace while they read (WebKit and hidden
pages), then AC-A1..A6 (Clip & next, a 10-chapter run, a Novelpia run to
its first locked episode, leaving the app mid-run, "What Clip sees", reading / listening offline)
and to paste a "What Clip sees" report from any site where Next isn't found; fix from those
(AC-11). Read **docs/ROADMAP.md**. Its front matter names `next_task: P-CLIP2` (`docs/clipping/p-clip2.md` §4a: "Clip & next" first, then
"Clip the next N chapters" as the main feature, then Clip polish; approved 2026-10-27, the user takes
the sites'-terms risk; the hard lines in `docs/clipping/p-clip2.md` §4a policies stay). P4 / P7 Wattpad are on hold until the
user says clipping is perfect; then P6 AO3 login, P8 polish, P-IMPORT-X (only if asked) and
P-NOVELPIA (optional). docs/ROADMAP.md also holds the resume protocol, the known open minor issues and
every open question with its default. The user's next install is T2 (prebuild) because of `ca4749f`.

---

## 12. Open questions and defaults (all phases)

| id | question | recommended default | status |
|---|---|---|---|
| OQ-1 | Accept Wattpad's terms risk (personal use only, "don't scrape") for your own account? | Yes, as designed (P4 policies). Alternative: online only | **Unanswered.** Notice in What's new and Wattpad settings; Wattpad off until turned on |
| OQ-2 | AO3 account (invite-only) and Wattpad account? | Build read-only phases regardless; P6 only with an AO3 account; P7 only with a Wattpad account + the ≤10-request check | **AO3: answered 2026-11-01** by the request "Build ao3 login" (P6 started). Wattpad: unanswered, ask before P7 |
| OQ-3 | Order of work | — | **Answered 2026-10-08**: AO3 first, reading before login, import before Wattpad. **Updated 2026-10-21**: P-CLIP next, before Wattpad. **Updated 2026-10-27**: P-CLIP2 (automatic clipping) is the top priority; nothing Wattpad until the user says clipping is perfect |
| OQ-4 | Tab bar order | Keep Browse / Search / Library / Updates / Account; cross-source Continue reading on Browse | Default in effect |
| OQ-5 | AO3 adult content | Ask before Mature / Explicit / Not Rated, "Always show" in Settings | Built (`src/features/adultGate.ts`) |
| OQ-6 | EPUB export of downloaded site stories? | Only imported files; AO3 → AO3's own EPUB | Open; only if P-IMPORT-X is requested |
| OQ-7 | Wattpad story deleted / unpublished | Mark "No longer on Wattpad"; ask once about deleting offline text; keep progress | For P4 |
| OQ-8 | Import defaults | Keep originals on; ask to link AO3 / FFN files; full backup: imported text always, site downloads off | Built except the full backup; clips never keep the original page |
| OQ-9 | Getting links from Safari | Shortcut + bookmarklet; share extension only on request | Help page not built (CLIP-16) |
| OQ-10 | FicHub and page clipping | Opt-in | Clip approved (P-CLIP); FicHub only if asked |
| OQ-11 | Pre-upgrade DB copy `ficshelf-pre-v2.db` | Keep 30 days, deletable earlier in Settings | Built |
| OQ-12 | AO3 hit counts | Don't send | Default in effect; revisit in P6 only if asked |
| OQ-CLIP-1..9 | Clip details | See `docs/clipping/p-clip.md` §4 open_questions | Built with the defaults; OQ-CLIP-9 still to check on the phone |
| OQ-AC-1..6 | Auto-clip details (pace, run size, previews, duplicates, option 2, Novelpia markup) | See `docs/clipping/p-clip2.md` §4a open_questions | For P-CLIP2 |
| OQ-TOS-CLIP | Automated clipping against sites' terms? | — | **Answered 2026-10-27**: "i want you to do it, regardless of TOS". The user takes that risk; hard lines (no unlocking, buying, bot-check solving or ticket handling; human pace; foreground only) stay |
| OQ-WP-3, OQ-WP-4 | Wattpad default and file linking | See `docs/wattpad.md` §5 | For P4 |
| OQ-NP-1 | Full Novelpia source? | Only after terms + go-ahead | **Unanswered** |
| OQ-TTS | Kokoro on-device neural TTS (~215–400 MB, ~800 MB RAM, native code) or BYO-key cloud voices (Azure, Speechify, Google)? | Not built; offered 2026-10-07, user didn't pick one and uses Piper Lessac | Only on explicit request |

---

## 13. Change log of this file

| date | commit | change |
|---|---|---|
| 2026-11-01 | (this commit) | P6 started at the user's request ("Build ao3 login", 2026-11-01): login on AO3's page, session, restricted works, logout, AO3 account screen; social items next |
| 2026-10-21 | 6320411 | Created from the session state at `5cc19e8`: P-CLIP next (approved 2026-10-21), then P4, P6, P7, P8, P-IMPORT-X, P-NOVELPIA |
| 2026-10-27 | 570b9ad, ca4749f | Xcode 27 / Swift 6.4 build fix (precompiled Expo modules off; Expo patches incl. expo-modules-jsi 57.1.3); PRE-4 done; the build works on the phone |
| 2026-10-27 | 324ae66 | P-CLIP2 added as the top priority (Clip & next, Clip the next N chapters, Clip polish; user approval and terms decision recorded); P4 / P7 on hold |
| 2026-11-01 | ef9038e | P-UI1 Kindle-style look added as the FIRST phase: preview approved ("I like this a lot better"), spec + build steps in `docs/ui_rules.md` §3a, preview committed at design/kindle-preview/index.html, scripts/web-shots.cjs for visual checks |
| 2026-10-30 | 72a9e95 → reverted | UI-1 Material You look built, then reverted at the user's request ("Actually revert changes … Only undoing the change of the gui"): the app keeps its original look; don't redo a restyle without asking |
| 2026-10-29 | 488b9c5, 5371b6d | P-CLIP3 added and built (background clipping, shadow-root / frame text; approval quote recorded; device check pending) |
| 2026-10-27 | 8271660, e1b08ba | P-CLIP2 built (AC-1..AC-10, AC-13; review fixes; device check pending); AC-11 / AC-12 wait for the user |
| 2026-10-27 | 1cca7be..7546679 | Preflight PRE-1..3 done (PRE-4 waits for a native change); P-CLIP built (CLIP-1..18, T1..T8), device check pending; next P4 |

---

## Status snapshot (front matter of the old docs/ROADMAP.md, 2026-11-01)

```yaml
doc: FEATURES
purpose: >-
  Next-work plan for FicShelf. A resuming Claude instance reads this file first, then the
  sections of AGENT_ROOT.md + docs/ named in the resume protocol. Everything needed is written here
  or in the repo; nothing outside the repo (scratch files, transcripts, research downloads) will
  exist in a fresh container.
project: FicShelf
repo: https://github.com/Carnyte/mhm
local_clone: /home/user/mhm
user_clone: ~/ficshelf (the user's Mac)
branch: claude/ficshelf-fanfiction-app
base_commit: a16fe35
base_commit_date: 2026-11-01
commits_at_base: 204
updated: 2026-11-01
next_task: the user tries the Kindle-style look on the phone (P-UI1 acceptance UI-A1..A6, `docs/ui_rules.md` §3a); then the P-CLIP3 / P-CLIP2 device checks and AC-11 polish
companion: AGENT_ROOT.md + docs/
status:
  summary: >-
    P-UI1 (`docs/ui_rules.md` §3a), the Kindle-style look from the approved preview (design/kindle-preview/index.html),
    was built on 2026-11-01 in ten steps (UI-1..UI-10), a commit and screenshots per step, and is now
    the default; Classic stays in Settings → Appearance → Look and in What's new 5. Tests and
    headless-Chromium screenshots only: the user hasn't tried it on the phone yet (UI-A1..A6).
    The FanFiction.net client, AO3 reading without login and file import (EPUB / HTML / TXT /
    Markdown, stored as the 'local' source) are built, reviewed, verified and pushed. No pending
    phase has been started. "Clip this page" for any website (approved 2026-10-21) was built on
    2026-10-27 and works on the phone ("perfect it works perfectly now", after an Xcode 27 /
    Swift 6.4 build fix). P-CLIP3 (2026-10-29, the user's top priority): "Clip a whole story" in the
    background from a pasted first chapter, prompting only for logins / checks, plus text in web
    components and frames; pushed, tests and headless Chromium only. P-CLIP2 automatic clipping ("Clip & next", "Clip the next N chapters",
    "What Clip sees", Settings → Clipping) was built on 2026-10-27 and is pushed: tests and
    headless-Chromium runs only, not yet on the phone. Next: the user tries it on the phone
    (AC-A1..A6), then AC-11 polish from what they hit. No Wattpad until the user says clipping is
    perfect.
  done:
    - M1-M5 FanFiction.net client, reader, audiobook (TTS incl. Piper add-on voices), device fixes
    - P0-P1 source-qualified StoryKeys + storage v2 migration
    - P2 source layer (Source contract, registry, polite HTTP client, sanitizer, remap)
    - P3 AO3 reading loop (no login)
    - P5 file import as the local source + golden import corpus
    - P-CLIP "Clip this page" for any https site (works on the phone)
    - P-CLIP2 Clip & next, Clip the next chapters, What Clip sees (device check pending)
    - P-CLIP3 background clipping ("Clip a whole story"), shadow-root / frame text (device check pending)
    - Xcode 27 / Swift 6.4 build fix (570b9ad usePrecompiledModules false; ca4749f Expo patches)
    - P-UI1 Kindle-style look, default since UI-10, Classic in Settings (device check pending)
  pending_in_order: [P-UI1 device check (UI-A1..A6), P-CLIP3 + P-CLIP2 device checks, AC-11 polish (scroll-loaded text first), P4 (on hold), P6, P7 (on hold), P8, P-IMPORT-X, P-NOVELPIA]
  checks_at_base:
    tsc: clean
    jest: "74 suites, 1304 passed + 1 todo (1305 total)"
    import_corpus: "303 passed + 1 todo (ui/titles A-D added 2026-11-01)"
    lint: "clean, prints check-keys: ok"
    expo_export_ios: "bundles; one entry-*.hbc of about 5.3 MB (the reader's embedded Literata adds about 0.2 MB)"
    clip_check: "npx tsx scripts/clip-check.ts: 39/39 (headless Chromium, synthetic pages and sites, no network)"
    expo_doctor: "21/21 (after npx expo install --fix, 2026-10-27)"
  device_confirmed: >-
    Builds through e2c8ac5 ("everything works", 2026-10-06), the Piper Lessac voice (build about
    31439d4, 2026-10-07), and a build of 570b9ad with expo-modules-jsi 57.1.3 installed by hand
    ("perfect it works perfectly now", 2026-10-27; includes P-CLIP).
  phone_build: >-
    570b9ad + expo-modules-jsi 57.1.3 (npm install --no-save), prebuilt and installed 2026-10-27
    (7-day profile renewed then). The next install is T2 (prebuild) because ca4749f changed the
    Expo package versions.
  not_yet_confirmed_on_device:
    - c79d776 Piper speed mapping (user was asked to try Lessac at 0.5x, 0.9x and 2x)
    - 3321ff1 / 4b7f0ba blank-reader rebuild and "skip author's notes"
    - afafdf2 / 57ec6be storage v2 migration on the real library
    - bf3f9f5..a315dbe AO3
    - 44a9f71..5cc19e8 file import and "Open in FicShelf" (install message with prebuild sent 2026-10-21)
    - P-CLIP acceptance items CLIP-A1..A9 one by one, and OQ-CLIP-9 (site login after an app restart):
      the user only said the app "works perfectly now"
    - ca4749f Expo patch updates (not installed yet)
    - P-CLIP2 (8271660, e1b08ba): Clip & next, Clip the next chapters, What Clip sees,
      Settings → Clipping, What's new 3
    - P-UI1 (e7b3221..a16fe35): the Kindle-style look, What's new 5 (JavaScript and fonts only, T1)
```
