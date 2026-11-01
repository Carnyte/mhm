# Active handoff

> Current state and the very next task only. Rules and the Context Map: `AGENT_ROOT.md`.
> Rewrite this file at every wrap-up (`AGENT_ROOT.md`, Session Wrap-Up Protocol).

**Updated**: 2026-11-01 · **Branch**: `claude/ficshelf-fanfiction-app` (repo root = the app)
**Last code commit**: `663e36d` (EPUB page turns + imported chapter titles), recorded in `1e507c6`.
**Since then, docs only**: `3bfb85f` split FEATURES.md / MASTER_FEATURES.md into `AGENT_ROOT.md`,
this file and `docs/` (old files deleted; old § numbers → `docs/SECTION_INDEX.md`); `c98816b` added
`CLAUDE.md` (auto-loaded; points here) and the "continue" rule below.

## State
- Pushed, ready to install (T1, JavaScript only, no prebuild). Nothing half-done; tree clean.
- The user was told what to say to a fresh session per phase ("I tested the build: …", "Clipping is
  perfect now. Start P4 …", "Build the polish items: …", "I have an AO3 account. Start P6.").
- Built and pushed on 2026-11-01, **tests and headless Chromium only, not yet tried on the phone**:
  - P-UI1 Kindle-style look (UI-1..UI-10), now the default; Classic in Settings → Appearance → Look
    and in What's new 5.
  - EPUB reading follow-up EP-1..EP-3 (user: swiping in page mode felt "like scrolling but
    horizontal"; chapter titles "looked weird"): page mode turns one page per flick with the page
    following the finger, next / previous chapter at the ends; imported books keep their own
    chapter headings; file-name / book-name chapter titles take the chapter's heading.
- The user's phone has a recent build (they imported an EPUB on it on 2026-11-01). Still awaiting
  their reports on P-CLIP3 (BG-A1..A5) and P-CLIP2 (AC-A1..A6) as well.
- Checks at the last code commit: tsc clean · jest 74 suites, 1304 passed + 1 todo (1305) · import
  corpus 303 + 1 todo · lint clean (`check-keys: ok`) · iOS export bundles (~5.3 MB hbc) ·
  expo-doctor 21/21 (last run 2026-10-27) · clip-check 39/39 (last run at P-CLIP3).

## Next immediate task
Wait for the user's phone check of the Kindle-style look and EPUB reading, then fix what they
report (match `design/kindle-preview/index.html`; ask before deviating):
1. P-UI1 acceptance UI-A1..A6 (`docs/ui_rules.md` §3a "acceptance") and EP-A (`docs/reader.md`):
   Look switch, Home → Continue, covers / Library filters, story page slot actions (FFN follow,
   reviews, AO3 tags), reader taps / Aa / footer, page mode swipes, chapter headings, light + dark.
   If an EPUB title still looks wrong, ask for a screenshot (re-importing refreshes stored titles).
2. Then P-CLIP3 BG-A1..A5 and P-CLIP2 AC-A1..A6 reports → AC-11 polish (scroll-loaded text first).
3. Wattpad (P4 / P7) stays on hold until the user says clipping is perfect.

## If the user just says "continue" or "build the next phase"
Every remaining phase needs a decision only the user can make, so don't start one on your own:
- They report phone results → fix those first (the next immediate task above).
- No reports → ask once whether they've tried the latest build; if they want to keep building
  anyway, offer the phases whose gate they can open now (AskUserQuestion, recommended first):
  - **P8 polish** (`docs/polish_extras.md`): pick items, e.g. POL-1 "All" search (needs P4 for
    Wattpad results; FFN + AO3 work without it), POL-3 AO3 work skins, POL-4 offline images.
  - **P4 Wattpad reading** (`docs/wattpad.md` §5): only once they say clipping is perfect, and
    answer OQ-1 (Wattpad's terms risk; default yes).
  - **P6 AO3 account** (`docs/ao3.md` §6): only if they have an AO3 account (invite-only).
  - **P-IMPORT-X** (`docs/import.md` §9) or **P-NOVELPIA** (`docs/novelpia.md` §10): only on request.
- Once they choose: mark the phase `in_progress` in `docs/ROADMAP.md`, work its spec's checklist in
  order (one commit per green step, ticks with hashes), and wrap up per `AGENT_ROOT.md`.

## Files to read for it
- `docs/ui_rules.md` (Kindle look spec, build log, acceptance), `docs/reader.md` (page mode,
  headings, EP items), `docs/user_and_install.md` (how to report and give install steps).
- Code: `src/components/kindle/*`, `src/app/read/[id].tsx`, `src/reader/template.ts`,
  `src/theme/*`, `src/components/ui.tsx`; screenshots with `scripts/web-shots.cjs`.
- For clipping reports: `docs/clipping/README.md`, `docs/clipping/p-clip2.md`.

## Install message template the user expects (T1)
`cd ~/ficshelf` → `git pull --autostash` → `npm install` → `xed ios` → check Personal Team and
Release scheme → Cmd+R with the phone on a cable → "install over the app; don't delete it first".
One command per code block (`docs/user_and_install.md` §2.2, §2.4).
