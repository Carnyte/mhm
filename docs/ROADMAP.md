# FicShelf roadmap

> High-level phase outlines and planned features. Current task: `ACTIVE_HANDOFF.md`. Rules:
> `AGENT_ROOT.md`. Section numbers (§N) are the old FEATURES.md ones (see `docs/SECTION_INDEX.md`).

## Conventions
The queue of work, by phase. This file is the outline; each phase's full spec (scope, files, data,
policies, tests, acceptance, risks, open questions) lives in its component file under `docs/`. Each phase has a stable id, a fixed field layout and
`- [ ]` checklists with sub-ids (`CLIP-1`, `WP-3`, …). Tick a box as `- [x]` and append the commit
hash (`- [x] CLIP-4 … (a1b2c3d)`) when the item is committed. Change a phase's `status` to
`in_progress` when you start it and `done` when its acceptance list passes on the user's phone (or
`done (device check pending)` when only tests have run).

Status values: `pending`, `in_progress`, `done`, `blocked (<reason>)`, `optional`, `only-if-asked`.
Ticks (`- [x] ID … (commit)`) go in the phase's spec file; change the phase's status here and in
its spec in the same commit, and refresh `ACTIVE_HANDOFF.md`.

## 3. Order

| order | id | title | status | depends_on | prebuild for the user | gate |
|---|---|---|---|---|---|---|
| -1 (first) | P-UI1 | Kindle-style look behind a "Look" switch (`docs/ui_rules.md` §3a) | done (device check pending; built 2026-11-01, default since UI-10) | none | no | none: preview approved |
| 0 | P-CLIP | "Clip this page" for any website | done (works on the phone 2026-10-27; CLIP-A items not reported one by one) | P5 (done) | no (https only) | none |
| 1 | P-CLIP2 | "Clip & next", "Clip the next N chapters" (auto-clip), Clip polish | done (device check pending; AC-11 polish waits for the user's reports) | P-CLIP | no (but the next install is T2 because of ca4749f) | none: the user accepted the terms risk |
| 1b | P-CLIP3 | "Clip a whole story" in the background; Clip for more sites | done (device check pending) | P-CLIP2 | no | none (approved 2026-10-29) |
| 2 | P4 | Wattpad reading, no login | on hold (user, 2026-10-27: "we're not doign anything wattpad until we perfect clipping feature") | P1–P3 (done) | no | the user says clipping is perfect; then OQ-1 (default yes) |
| 3 | P6 | AO3 login and social | pending | P3 (done) | no | user has an AO3 account (invite-only) |
| 4 | P7 | Wattpad login and social | on hold (as P4) | P4 | no | Wattpad account + the ≤10-request endpoint check |
| 5 | P8 | Polish and optional extras | pending (per item, user interest first) | P4 for "All" search | no (share extension: yes) | per item |
| 6 | P-IMPORT-X | Import extras: EPUB export, `.ficshelf` backup, FicHub, share extension | only-if-asked | P5 | `.ficshelf` Open-in and share extension: yes | user request |
| 7 | P-NOVELPIA | Optional Novelpia source | optional | P-CLIP | no | Novelpia's terms read + user go-ahead + short live test with OK |

The design notes numbered phases differently (Phase 4 = Wattpad, Phase 5 = import, though import
was built first; old workflow scripts are named `phase5-*`). Use the ids above, not numbers.

## Done (milestones; details in `docs/history.md` §11)
M1–M5 FanFiction.net client, reader, audiobook (incl. Piper voices), device fixes · P0–P1
source-qualified StoryKeys + storage v2 migration · P2 source layer (Source contract, registry,
polite HTTP client, sanitizer, remap) · P3 AO3 reading (no login) · P5 file import + golden corpus ·
P-CLIP Clip this page · P-CLIP2 Clip & next / auto-clip · P-CLIP3 background clipping · Xcode 27 /
Swift 6.4 build fix · Preflight PRE-1..PRE-4 · P-UI1 Kindle-style look (default) · EPUB reading
follow-up (page turns, imported books' own chapter headings).

## Phases

### P-UI1: Kindle-style look (done; device check pending)
Kindle-like look from the approved preview (`design/kindle-preview/index.html`), built UI-1..UI-10
behind Settings → Look, now the default; Classic stays. Follow-up EP-1..EP-3 (2026-11-01): page mode
as real page turns, imported books keep their own chapter headings, file-name titles fixed.
Open: phone acceptance UI-A1..A6 and EP-A. Out of scope (P-UI2, ask first): skeletons, empty-state
illustrations, new icon / splash, onboarding, Settings text rewrite, page-curl.
Spec + build log: `docs/ui_rules.md` §3a; reader follow-up: `docs/reader.md`.

### P-CLIP: "Clip this page" for any website (done; works on the phone)
In-app browser "open mode" for any https site; Clip saves what the page shows as text, as a new
local story or its next chapter. Open: CLIP-A1..A9 one by one, OQ-CLIP-9 (site login after a
restart). Spec: `docs/clipping/p-clip.md`.

### P-CLIP2: Clip & next, Clip the next N chapters, Clip polish (done; device check pending)
One-tap clip-save-Next; FicShelf presses Next itself at a reader's pace with stop rules; "What Clip
sees"; Settings → Clipping. Open: AC-A1..A6 on the phone, AC-11 polish (scroll-loaded text first)
from the user's reports, AC-12. Spec: `docs/clipping/p-clip2.md`.

### P-CLIP3: "Clip a whole story" in the background (done; device check pending)
Paste a first chapter; a hidden in-app browser clips the story while the app is open, asking only
for logins / locks / checks. Open: BG-A1..A5 on the phone. Spec: `docs/clipping/README.md` §4b.

### P4: Wattpad reading, no login (on hold)
Gate: the user says clipping is perfect, then OQ-1 (terms risk, default yes). Story pages, reader,
download, updates through Wattpad's public endpoints; paid parts fail closed.
Spec: `docs/wattpad.md` §5.

### P6: AO3 account and social (pending)
Gate: the user has an AO3 account (invite-only). Login on AO3's page, restricted works, kudos,
comments, subscriptions, bookmarks, history. Spec: `docs/ao3.md` §6.

### P7: Wattpad account and social (on hold, after P4)
Purchased parts (never bought by the app), library and reading lists, votes, comments. Gate: a
Wattpad account + the ≤10-request endpoint check. Spec: `docs/wattpad.md` §7.

### P8: Polish and optional extras (pending; per item, user interest first)
POL-1 "All" federated search · POL-2 find on another site · POL-3 AO3 work skins · POL-4 offline
images · POL-5 clean-up migration (v3) · POL-6 updates by day · POL-7 explicit react-test-renderer ·
POL-8 `withKnownTitles` test. Spec: `docs/polish_extras.md`.

### P-IMPORT-X: import extras (only if asked)
EPUB export, `.ficshelf` backup with imported stories, FicHub, share extension (native; costs an
App ID). Spec: `docs/import.md` §9.

### P-NOVELPIA: optional Novelpia source (optional)
Gate: Novelpia's terms read + user go-ahead + a short live test. Today's route is Clip.
Spec: `docs/novelpia.md` §10.

## Planned / waiting on the user
- Phone checks, in this order: P-UI1 (UI-A1..A6) and EP-A; P-CLIP3 BG-A1..A5; P-CLIP2 AC-A1..A6;
  P-CLIP CLIP-A1..A9; older items in `docs/user_and_install.md` §2.5.
- Open questions with defaults (OQ-1 Wattpad terms, OQ-2 accounts, OQ-NP-1, OQ-TTS …):
  `docs/history.md` §12.
- Known minor issues (ISSUE-M1, D3, G5, NEST …): `docs/known_issues.md` §11.
