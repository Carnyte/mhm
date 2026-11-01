# Active handoff

> Current state and the very next task only. Rules and the Context Map: `AGENT_ROOT.md`.
> Rewrite this file at every wrap-up (`AGENT_ROOT.md`, Session Wrap-Up Protocol).

**Updated**: 2026-11-01 · **Branch**: `claude/ficshelf-fanfiction-app` (repo root = the app)
**Last code commit**: `663e36d` (EPUB page turns + imported chapter titles), recorded in `1e507c6`;
then the documentation restructure (this file, `AGENT_ROOT.md`, `docs/`).

## State
- Pushed, ready to install (T1, JavaScript only, no prebuild). Nothing half-done; tree clean.
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
