# Clipping: overview, hard lines, and background clipping (P-CLIP3)

> Read before any clipping work. Full specs: docs/clipping/p-clip.md (Clip this page), docs/clipping/p-clip2.md (Clip & next, auto-clip).
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

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
  `signed_key` or cookies (`docs/novelpia.md` §6.7, `docs/novelpia.md` §10.11).
- **Built (P-CLIP2, `docs/clipping/p-clip2.md` §4a, `8271660`, `e1b08ba`)**: "Clip & next" (one tap:
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
- **Built (P-CLIP3, §4b, `488b9c5`, `5371b6d`, 2026-10-29)**: "Clip a whole
  story" in the background (jobs, ClipHost, banner, Clipping screen); the user asked for clipping
  that needs nothing manual and prompts only for logins / checks. Policy change: background jobs use
  a hidden in-app browser while the app is open (replacing "visible, foreground only" for them);
  every other hard line stays (no buying / unlocking / solving checks, no tickets / tokens / API,
  only what renders, ≥ 4 s pace, ≤ 2000 chapters a job). The capture now includes open shadow roots
  and same-origin frames; the Next finder and fingerprint look into open shadow roots.

---

## 4b. P-CLIP3: "Clip a whole story" in the background, and Clip for more sites

```yaml
id: P-CLIP3
title: Background clipping from a pasted first chapter; Clip for more sites (shadow roots, frames)
status: done (device check pending)
order: 1
next_task: false   # P-UI1 comes first (2026-11-01)
depends_on: [P-CLIP2 (done, device check pending)]
native_rebuild: no (JavaScript only; T1)
approved_by_user:
  date: 2026-10-29
  quote: >-
    "I want you now to prioritize in production and afterwards work on making any website available
    for clipping and instead of doing it manually it is also able to be just you paste the link of
    the first chapter and then the algorithm and the app will figure out how to essentially display
    the same concept as the story as it was clipped, but everything is done in the background and
    the user has no need to do anything manual in regards to clipping essentially clipping is a
    background feature that always works, and if there is a problem where it requires the user to
    login to do a security check it will prompt that for the user, and when that is resolved, it
    will return back to its processes"
  reading: >-
    Top priority: make clipping need nothing from the user. Paste a first chapter → FicShelf clips
    the story by itself; it prompts only for logins / checks and resumes after. Then widen what Clip
    can read. iOS limit said to the user: it runs while FicShelf is open (any screen), pauses off
    screen and resumes by itself.
policy_change: >-
    P-CLIP2's "visible browser in the foreground only" is replaced for background jobs by: a hidden
    in-app browser while the app is open (never with the app suspended, never server-side), one job
    at a time. What stays: never buy / unlock / subscribe, never solve or bypass a bot check (the
    user does it on the page), never touch the site's tickets / tokens / API, only what the page
    renders, human pace (≥ 4 s between presses, Settings pace), at most 2000 chapters a job.
```

Built (2026-10-29):
- [x] BG-1 Runner background mode (`AutoClipOptions.background`, `deps.create`): a new story's first page saved without a preview, several chapters on a page kept, the end of the story (no Next, a page clipped before, another story) finishes the run, coming back to the app resumes by itself; locks, logins, bot checks, other sites, empty pages and 3 errors still wait for the user. Cap `MAX_BACKGROUND_RUN` 2000.
- [x] BG-2 Jobs (`src/features/clipJobs.ts`): `clipEngine.start(url, key?)` / `pause` / `resume` / `cancel` / `clearFinished` / `setActive` / `show`; one job at a time in order; kv `clipJobs` (normalized on read; a job cut off running goes back to the queue and resumes from the story's last clipped page, pressing Next first); a page clipped before goes on with its story; `clipRunStore` for the live status.
- [x] BG-3 Hidden browser `src/net/ClipHost.tsx` at the root (like BridgeHost): the job's page behind the app (opacity 0.02, zIndex −1, no touches, hidden from VoiceOver), the same nonce'd capture / Next scripts and open-mode navigation rules (nothing opens apps or FicShelf screens); slides up full screen with Continue / Hide when the user opens a waiting job; AppState → `setActive`.
- [x] BG-4 `ClipBanner` ("… needs you to continue clipping · Open"), the Clipping screen `/clips` (state, saved count, Pause / Continue / Stop / Show the page / Open story, Clear finished), a line on the story page, ways in: Library + "Clip a whole story" (paste → **Clip the whole story**) and "Clipping in the background", browser ⋯ "Clip the rest in the background", clipped story ⋯ "Clip new chapters in the background", Settings → Clipping row. Shared one-time notice (`src/components/clipNotice.ts`). What's new 4.
- [x] BG-5 Clip for more sites: the capture adds open shadow roots' text (inside their element) and same-origin frames' pages (where the frame was), each checked for hidden decoys; the Next finder and the page fingerprint look inside open shadow roots too.
- [x] BG-6 Tests: clip-jobs 9 (engine), clip-host 1 (hidden browser + banner), auto-clip +4 (background runs), next-script +1, clip-script +1; clip-check 39/39 (background runs on the synthetic SPA and rel=next sites; a web component + frame page in Chromium).

### acceptance (on the phone)
- [ ] BG-A1 Library → + → Clip a whole story → paste a first chapter → Clip the whole story: the story appears under Imported and gains chapters while you read something else.
- [ ] BG-A2 A site that needs a login or shows a check: the banner appears; Open shows the page; after logging in / the check, Continue goes on.
- [ ] BG-A3 Leaving the app and coming back (and closing FicShelf and opening it again) goes on from the last chapter.
- [ ] BG-A4 Clipping screen: Pause, Continue, Stop behave; Stop keeps the saved chapters.
- [ ] BG-A5 The hidden page doesn't show or catch taps; reading and the audiobook work as usual while it runs.

### risks / open
- WebKit may slow a page it thinks is off screen: the hidden browser is nearly transparent but on screen behind the app for that reason; confirm on the phone that a background job keeps pace (BG-A1).
- A job waiting for the user holds up the queue until they deal with it or pause it.
- Scroll-loaded text (pages that load more as you scroll) is still not clipped (next for "any website", with a report of a site that does it).
