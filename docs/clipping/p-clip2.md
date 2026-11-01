# P-CLIP2 spec: Clip & next, Clip the next N chapters, Clip polish (built; device check pending)

> The full spec of automatic clipping: scope, policies (hard lines), acceptance AC-A*, open questions.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 4a. P-CLIP2: "Clip & next" and "Clip the next N chapters" (auto-clip), then perfect Clip

```yaml
id: P-CLIP2
title: Clip & next, auto-clip the next N chapters, and Clip polish
status: done (device check pending); AC-11 polish and AC-12 wait for the user
order: 1
next_task: false   # P-UI1 comes first (2026-11-01)
depends_on: [P-CLIP (done; works on the phone)]
native_rebuild: no for the feature itself (expo-keep-awake is already installed); the user's NEXT install is T2 anyway because of ca4749f (Expo patch updates)
priority: >-
  The user's top priority. No Wattpad (P4, P7) or other phase until the user says clipping is
  "perfect". Ask the user before starting anything outside P-CLIP2.
approved_by_user:
  date: 2026-10-27
  context: >-
    After Clip worked on the phone ("perfect it works perfectly now"), the user asked whether
    clipping each page could be made "something that isn't manual". Three options were offered:
    1 "Clip & next" (one tap clips, saves and presses the site's Next), 2 auto-clip as you read
    (saves each chapter you open yourself), 3 "Clip the next N chapters" (FicShelf presses Next and
    saves by itself, paced, stoppable, stopping at paid chapters, logins and bot checks), with the
    cost that 3 is automated copying many sites' terms forbid and the logged-in account is at risk.
  quotes:
    - "Sure if #1 is the best option for starting the build but I still do want #3 as the main feature, so if you can do it, i want you to do it, regardless of TOS."
    - "keep this phase as the main priority, we're not doign anything wattpad until we perfect clipping feature."
  terms_decision: >-
    The user accepts the site-terms risk of automated clipping for their own reading. Do not ask
    again or block on terms. What stays non-negotiable is not about terms (see policies): never get
    around access control, never spend money, never solve bot checks, keep a human pace, foreground
    and visible only. These were stated to the user on 2026-10-27 before this was written down.
build_order: [AC-1, AC-2 (option 1, build first), AC-3..AC-6 (option 3, the main feature), AC-7..AC-10, AC-11 polish, AC-12 optional option 2]
```

### why
- One tap per chapter (Clip, check the preview, Save, then the site's Next) is slow for long stories
  (Novelpia sample: 111 episodes). The user wants FicShelf to page through and save by itself.

### scope

What exists (P-CLIP, verified at `ca4749f`; re-check line numbers):
- `src/app/web.tsx` (~325 lines): open mode; bottom bar (host + Clip / "Clip as chapter N" / Open in
  FicShelf); `capture()` injects `clipScript(nonce)` and keeps `pending = {nonce, timer}`;
  `onClipMessage` checks nonce + `hostOf(e.nativeEvent.url) === hostOf(m.url)`, then `parseClip` →
  `setResult` → `<ClipSheet>`; `CLIP_TIMEOUT_MS = 10_000`; one-time notice (`CLIP_NOTICE`,
  `sources.local.clipNoticeSeen`); `askOnce` (one link alert at a time); `clipFor` state follows the
  last saved story.
- `src/net/clipScript.ts`: waits for quiet (700 ms after the last mutation, 4 s cap, waits for
  `load`), finds hidden elements on the live page and drops them from an inert copy, strips scripts /
  inline data / form fields / token-carrying attributes, posts `{type:'ficshelf-clip', nonce, url,
  title, lang, html, capped?}` or `{error:'too-large'|'failed'}`. `CLIP_MESSAGE`, `MAX_CLIP_CHARS`.
- `src/import/clip.ts`: `parseClip(html, pageUrl, {title, capped})` → text-only `ImportedBook`
  (generator 'clip'); `cleanClipUrl`, `stripSiteName`, `splitTitle`, `asOneChapter`, `CLIP_EMPTY`,
  `MIN_CLIP_WORDS = 25`.
- `src/features/clips.ts`: `commitClip`, `appendClip(key, book, url) → first new chapter number`,
  `undoLastClip`, `findClippedPage(url)`, `clippedStories(host?)`, `defaultClipTarget(url, clipFor?)`.
- `src/components/ClipSheet.tsx`: preview, targets, "Keep as one chapter", duplicate notice, Save.
- `src/sources/local/ui.ts`: clipped-story menu (Clip next chapter → `/web?url=<lastUrl>&clipFor=<key>`,
  Remove last chapter, Open on <site>), reader end action `clip-next`.
- `expo-keep-awake` is a dependency (used in `src/app/read/[id].tsx`).

Checklist (in build order):
- [x] AC-1 `src/net/nextScript.ts` (new) (8271660; review fixes e1b08ba): in-page scripts (WebKit, injected like clipScript, nonce'd):
  - `findNextScript(nonce)` posts `{type:'ficshelf-next', nonce, url, found, label?, kind?:'link'|'button', disabled?, score?, candidates?: number}`
    (labels and counts only: no text of the chapter, no hrefs with tokens);
  - `pressNextScript(nonce)` finds the same best candidate and activates it with `el.click()` (works
    for SPA buttons and plain links), posting `{pressed: true|false}`;
  - candidate scoring (see data/API details); never a control whose label, class or nearby text
    looks like buying / unlocking / subscribing (see LOCK_WORDS), never a hidden or disabled one.
- [x] AC-2 **Option 1, "Clip & next"** (build first): (8271660)
  - ClipSheet: when the target is an existing clipped story, a primary **Save & next chapter**
    button (Save stays): saves, closes the sheet, presses the site's Next (AC-1), waits for the new
    chapter (AC-4 "wait for the next chapter"), then shows the bar again ready for the next Clip;
  - a switch in the sheet **"Next time, save without asking"** (`sources.local.clipQuick`): later
    Clips on the same target save straight away (toast "Added chapter N") unless something is odd
    (duplicate, warnings, several chapters, a different story title, under `MIN_CLIP_WORDS`), in
    which case the preview shows;
  - bar: when a target story is known, the button reads **Clip & next**; a small ⋯ next to it
    offers "Clip only", "Clip the next chapters…" (AC-3) and "What Clip sees" (AC-9);
  - no Next found → toast "FicShelf couldn’t find this site’s Next button. Tap it yourself, then Clip."
- [x] AC-3 **Option 3, "Clip the next N chapters"** (the main feature) (8271660; pauses on screen blur too, e1b08ba): `src/features/autoClip.ts`
  (new, pure state machine, no React Native imports; timers and page actions injected so tests drive
  it) plus its UI in web.tsx:
  - start: bar ⋯ → "Clip the next chapters…", or story ⋯ menu → **Clip the next chapters…** (opens
    `/web?url=<lastUrl>&clipFor=<key>&auto=<N>`); a small sheet picks how many (5, 10, 25, 50, or
    "until the end", capped at 200 per run) and shows the pace (Settings); it also shows the stop
    rules in one line;
  - the loop, per chapter: capture (clipScript) → parseClip → stop checks (AC-5) → appendClip (or
    commitClip for the very first chapter of a new story, preview shown once for its titles) → dwell
    a random time within the pace → press Next (AC-1) → wait for the next chapter (AC-4) → repeat;
  - if the run starts on the page that is already the target's last clipped chapter, it presses
    Next first instead of stopping on the duplicate;
  - progress banner over the bar: "Clipping chapter 7 of 20 · <story>" with **Pause** and **Stop**;
    finishing shows "Saved 20 chapters (21–40) of <story>" with **Open story**; a haptic at the end;
  - keeps the screen awake while running (`activateKeepAwakeAsync('autoclip')`, deactivated on
    stop / unmount); pauses when the app leaves the foreground (AppState) and asks "Continue
    clipping?" on return; never runs with the screen closed, in the background or headless;
  - everything saved stays saved when a run stops; Remove last chapter undoes one at a time.
- [x] AC-4 "Wait for the next chapter" (8271660): after pressing Next, success = the URL changed, or the page's
  text fingerprint (first ~300 chars of the captured main text, hashed in RN) differs from the last
  chapter's, within 20 s (SPA readers often change content without a URL change; react-native-webview
  13.16 injects a history shim so `pushState` updates `onNavigationStateChange`). Then the normal
  capture waits for quiet. Same URL and same fingerprint after 20 s → stop ("The next chapter didn’t
  load"). Track `onLoadEnd` / `onNavigationStateChange` in web.tsx and pass events to the runner.
- [x] AC-5 Stop rules (8271660) (each stops the run with a plain message and **Continue** / **Stop**; nothing
  is clicked, bought or solved on the user's behalf):
  - no Next control (or only disabled ones) → "Reached the last chapter FicShelf can find.";
  - lock / paywall / login signals on the page (LOCK_WORDS in visible short text, a price or coin
    count near a button, the captured text under `MIN_CLIP_WORDS` while such a control shows) →
    "This chapter looks locked or needs you to log in. Unlock or log in yourself, then tap Continue.";
  - bot check (Cloudflare "Just a moment…", "Verify you are human", hCaptcha / reCAPTCHA / Turnstile
    frames, Cloudflare `/cdn-cgi/challenge-platform`) → "The site wants to check you’re human. Do
    it on the page, then tap Continue." (never solve or bypass it);
  - the page moved to another host (login page, ad, redirect) → stop;
  - empty capture twice in a row (`CLIP_EMPTY`) → stop;
  - the page is already clipped (anywhere) other than the run's starting page → stop and say which
    chapter it is;
  - a different story: the cleaned page title's story part (`splitTitle(stripSiteName(...)).story`)
    differs from the run's first page's (case- and space-insensitive) and the chapter number in the
    title didn't go up by one → stop ("This looks like a different story.");
  - the parsed page has several chapter headings (the site shows a whole volume) → stop and show
    the preview (the user decides "Keep as one chapter");
  - 3 errors in a row (timeouts, parse errors, storage) → stop;
  - the cap N is reached, or the user taps Stop / Pause; the app goes to the background.
- [x] AC-6 Pace (8271660) (`sources.local.clipPace`): **Gentle** 20–40 s between chapters, **Normal** 8–15 s
  (default), **Quick** 4–7 s; uniformly random within the range; the hard floor is 4 s whatever the
  setting. Time spent loading counts toward the dwell (the wait starts when the chapter is saved).
- [x] AC-7 Same-story memory (8271660): `ClipInfo.storyTitle?: string` (the story part of the first clipped
  page's cleaned title, ≤ 300 chars) set by commitClip and kept by appendClip; `normalizeClip` in
  `src/db/migrations/v2.ts` must keep it (string, trimmed, ≤ 300) or it vanishes on reload (R-9).
  Used by AC-5's different-story rule across runs.
- [x] AC-8 Settings → Imported files (8271660; a section of its own, Settings → Clipping): **Auto-clip pace** (Gentle / Normal / Quick), **Save next
  chapters without asking** (`clipQuick`), default run size (`clipBatch`, 10). Add the three fields
  to `SourceSettings` (`src/state/settings.ts`).
- [x] AC-9 **What Clip sees** (8271660) (bar ⋯): copies a structure-only report to the clipboard for the user to
  paste back: host, page title length, captured text length and words, chapter headings found, Next
  candidates (label text up to 40 chars, tag, kind, score, disabled), lock / bot-check signals that
  fired, hidden elements dropped, `capped`. Never chapter text, hrefs, cookies or tokens (R-13).
  This is how per-site problems (Novelpia's Next button, its paywall notice) get fixed without
  live requests from the container.
- [x] AC-10 Tests: (8271660, e1b08ba: next-script 22, auto-clip 27, clip-screen +6, clip-commit +2, clip-parse +1, clip-report 2 (60 new, 1213 in all); clip-check 34/34)
  - `tests/next-script.test.ts` (jsdom): `rel=next` link wins; "Next chapter" / "다음화" / "次へ" /
    "下一章" / "Siguiente" / "›" buttons found; a disabled or hidden Next ignored; "Buy next
    chapter" / "Unlock (5 coins)" never chosen; comment-pagination "Next page" loses to the reader's
    Next; `pressNextScript` clicks once; posts carry the nonce and no hrefs.
  - `tests/auto-clip.test.ts` (fake timers, fake page): a 3-chapter run saves 3 and stops at the cap;
    each AC-5 rule stops with its message and saves nothing more; pace stays within its range and
    never under 4 s; starting on the last clipped page presses Next first; Pause / Continue; app
    background pauses; keep-awake on and off.
  - `tests/clip-screen.test.tsx` additions: Save & next presses Next once after saving; quick mode
    skips the preview only when nothing is odd; the progress banner and Stop.
  - `tests/clip-commit.test.ts`: `storyTitle` kept by normalizeLocal, dropped when not a string.
  - `scripts/clip-check.ts` additions (headless Chromium, synthetic pages): an SPA reader that swaps
    chapters 1→2→3 on a "Next" button click without a URL change, then chapter 4 shows "Unlock this
    episode (5 coins)" → the run saves 3 and stops on the lock; a static multi-page site with
    `rel=next`; a Cloudflare-like interstitial stops the run.
- [ ] AC-11 Perfect Clip (from device use; ask the user what they've hit, then fix in this order):
  - CLIP-A1..A9 on the phone (never individually reported; the user said "it works perfectly now"
    on 2026-10-27 after the Xcode fix) and OQ-CLIP-9 (does a site login survive an app restart?);
  - scroll-loaded / lazy text: before capturing, scroll the page to the bottom in steps (waiting for
    mutations), then restore the position; stop when the height stops growing or after 10 s;
  - text in same-origin iframes and open shadow roots: include them in the copy (cloneNode doesn't);
  - chapters split over several in-chapter pages ("1 / 3") — only with the user's report of a site;
  - OQ-CLIP-2 pictures (same-origin images the page already loaded, as data: URIs) only if asked.
- [ ] AC-12 (optional, after AC-3) **Option 2, "Save chapters as I go"**: a bar ⋯ switch; when on and
  a target is set, every new chapter page the user opens on that site is captured once it's quiet
  and saved if nothing is odd (same rules as quick mode); FicShelf never navigates in this mode.
- [x] AC-13 Docs and ship (e1b08ba): README Clip section (Clip & next, Clip the next chapters, the stop
  rules, pace, "you decide about sites’ terms; FicShelf never unlocks, buys or solves checks"),
  Known limitations, PLAN §2.13, INSTALL ("no prebuild for this feature; the next install is T2
  because of ca4749f"), What's new (`WHATS_NEW_VERSION` 3), this file, `docs/import.md` §7.3.

Built as planned, with these differences (2026-10-27):
- One script `nextScript(nonce, 'find' | 'press' | 'report')` (wrappers `findNextScript`, `pressNextScript`, `reportNextScript`); the page fingerprint is an in-page FNV hash of the main text (the element whose paragraphs hold the most text) plus its length, so no chapter text crosses the bridge.
- Comment sections score −60, not −40 (a comment pager's rel=next scored 40 and tied the reader's Next). `aside`, chapter lists (more than 8 links) and site chrome never count as lock signals; text blocks count only with a lock-ish class or a plain "unlock this chapter / log in to read" sentence, so story prose about coins is no paywall. "Next: Chapter 5" labels count.
- Every stop rule pauses the run with **Continue** / **Stop** (as AC-5 says); Continue lets that page through for the lock, duplicate, different-story and bot rules. Bot-check widgets (Turnstile, hCaptcha, a visible reCAPTCHA) stop a run only when the page has no story text (comment forms carry them).
- Pace waits count from the previous press (page loading counts towards it); constants in `src/features/clipPace.ts` (no imports) so settings and the runner share them; `MIN_DWELL_MS` 4000.
- The run also pauses when another screen covers the browser (a tapped AO3 / FFN link), not only when the app leaves the screen.
- The run's "Check it" preview (a new story's first chapter, several chapters) is the same ClipSheet in a `run` mode ("Save and keep clipping"); a preview saved into another story moves the run there.
- Settings rows are in their own **Clipping** section (pace, chapters per run, save without asking).
- Device report 2026-10-27: after a run, new chapters showed on the story page only after leaving and reopening it (the page's cached copy wasn't reloaded when a clip invalidated it). Fixed: the story page reloads a local story when its library chapter count changes, and every story page has pull-to-refresh; `tests/story-refresh.test.tsx`.
- AC-11 and AC-12 not started: AC-11 waits for the user's reports from the phone (FEATURES order), AC-12 is optional.

### files
| action | path | what |
|---|---|---|
| new | `src/net/nextScript.ts` | AC-1 |
| new | `src/features/autoClip.ts` | AC-3..AC-6 runner (pure); `waitForNextChapter` for Clip & next |
| new | `src/features/clipPace.ts`, `src/features/clipReport.ts` | paces / run sizes; the "What Clip sees" report |
| change | `src/app/web.tsx` | Clip & next, run start / banner / stop, page events to the runner, keep-awake, AppState pause, What Clip sees |
| change | `src/components/ClipSheet.tsx` | Save & next, quick switch, run-size sheet (or a new `AutoClipSheet.tsx`) |
| change | `src/features/clips.ts` | `storyTitle`; helpers the runner needs (same-story check) |
| change | `src/state/library.ts`, `src/db/migrations/v2.ts` | `ClipInfo.storyTitle?`, `normalizeClip` |
| change | `src/state/settings.ts`, `src/app/settings.tsx` | `clipPace`, `clipQuick`, `clipBatch` |
| change | `src/sources/local/ui.ts` | story ⋯ "Clip the next chapters…" |
| change | `src/components/WhatsNewSheet.tsx` | version 3 |
| tests | `tests/next-script.test.ts`, `tests/auto-clip.test.ts`, `tests/clip-screen.test.tsx`, `tests/clip-commit.test.ts`, `scripts/clip-check.ts` | AC-10 |

### data / API details
- Next candidates (in-page): `link[rel=next]` / `a[rel~=next]` (+50); visible `a`, `button`,
  `[role=button]`, `[onclick]` whose text, `aria-label` or `title` matches NEXT_WORDS (+30; +10 if
  it also says chapter / episode / 화 / 章); class or id containing `next` (+15); inside
  `nav`, `footer` of the reader, or near the end of the main text (+10); inside a comments section
  (`comment|disqus|reply` tokens) (−40); disabled (`disabled`, `aria-disabled=true`, class
  `disabled`) or hidden → excluded; label or nearby text matching LOCK_WORDS → excluded. Highest
  score ≥ 30 wins; ties → the one lowest on the page.
- NEXT_WORDS (case-insensitive, whole label): `next`, `next chapter`, `next episode`, `next part`,
  `next page`, `continue reading`, `›`, `»`, `→`, `>`, `>>`, `다음`, `다음화`, `다음 화`, `次`, `次へ`,
  `次の話`, `下一章`, `下一页`, `下一頁`, `siguiente`, `capítulo siguiente`, `suivant`, `chapitre suivant`,
  `próximo`, `weiter`, `nächstes kapitel`, `далее`, `следующая`, `sonraki`, `tiếp`, `selanjutnya`.
- LOCK_WORDS: `buy`, `purchase`, `unlock`, `coin(s)`, `subscribe to read`, `premium`, `log in to (read|continue)`,
  `sign in to`, `구매`, `결제`, `코인`, `이용권`, `로그인`, `購入`, `解锁`, `购买`, `金币`, `comprar`, `acheter`, `kaufen`.
- Novelpia (`docs/clipping/p-clip.md` §4 "Novelpia findings"): a Nuxt SPA; episodes load through its API after an
  entitlement check; error codes `0003` / `0008` mean not available / login or adult required. The
  runner only sees what the viewer renders: a locked episode should show a notice or buy button →
  stop rule. Never read `__NUXT_DATA__`, never call its API, never touch `_t` / `signed_key`.
- Runner states: `idle → capturing → saving → dwelling → pressing → waiting → capturing …`,
  `paused`, `stopped(reason)`; inputs: `capture() → {book, url} | error`, `pressNext() → found`,
  page events `{url, loading}`, `now()`, `sleep(ms)`, `appActive`. Output: progress for the banner.

### policies
- The user decides about sites' terms for their own use (2026-10-27, quote above). Don't refuse or
  nag on terms grounds; the What's new card and the one-time notice say plainly that some sites
  forbid copying and that it's the user's call.
- (2026-10-29) For background jobs, "foreground and visible only" below is replaced by P-CLIP3's policy (a hidden in-app browser while the app is open); every other line stays.
- Hard lines that stay (R-5 and politeness, not terms): never click buy / unlock / subscribe /
  spend coins; never get past a paywall, login or age gate (the user does it on the page, then
  Continue); never solve or bypass a bot check; never read or replay the site's tickets, tokens,
  cookies, inline data or API; only what the visible page renders; one page at a time, human pace
  (≥ 4 s, default 8–15 s), at most 200 chapters per run; foreground and visible only (no background,
  no hidden WebView, no headless or server-side crawling); stop on anything unexpected.
- R-4 is amended for this phase only: auto-clip runs are an approved exception to "no crawling /
  no bulk downloads" under exactly the limits above, started by the user each time.
- Same storage rules as P-CLIP: text only, cleaned URLs, never the original page.

### tests
See AC-10. Keep every existing suite and `scripts/clip-check.ts` passing; prove each new test fails
before its code (R-7).

### acceptance (on the phone)
- [ ] AC-A1 On a clipped story's site, the bar reads **Clip & next**; one tap saves the chapter and
      the next chapter appears; again for a third.
- [ ] AC-A2 Story ⋯ → **Clip the next chapters…** → 10: the banner counts up, the screen stays on,
      10 chapters are added in order, Stop works mid-run.
- [ ] AC-A3 On Novelpia, a run stops at the first locked or login-only episode with the message, and
      nothing is bought.
- [ ] AC-A4 Leaving the app pauses the run; coming back asks to continue.
- [ ] AC-A5 "What Clip sees" copies a report with no story text.
- [ ] AC-A6 The added chapters read offline and play as an audiobook.

### install_notes
P-CLIP2 itself is JS only. The user's phone runs a build of `570b9ad` with expo-modules-jsi 57.1.3
installed by hand (`npm install expo-modules-jsi@57.1.3 --no-save`); `ca4749f` updated the Expo
packages in the lockfile, so the **next install is T2 (prebuild)**: `git pull --autostash`,
`npm install`, `npx expo prebuild -p ios`, the NODE_BINARY line, `xed ios`, Clean Build Folder,
Team + Release, Cmd+R. Ignore npm's "install-scripts … not yet covered by allowScripts" warning
(esbuild, fsevents, unrs-resolver are dev tools).

### risks
- The user's account on a site can be warned or banned for automated reading (accepted by the user).
- A wrong Next guess clips the wrong pages: mitigated by the same-story and duplicate rules, the
  banner, and Remove last chapter; AC-9 reports make per-site fixes possible.
- Sites that change chapters without changing much text (or with heavy ads) may confuse the
  fingerprint; tune with reports.
- Long runs use battery and keep the screen on.
- Some readers need scrolling to load the whole chapter (AC-11 auto-scroll).

### open_questions (recommended defaults)
| id | question | default |
|---|---|---|
| OQ-AC-1 | Pace default? | Normal 8–15 s; floor 4 s |
| OQ-AC-2 | Run size? | 10 by default; "until the end" capped at 200 per run |
| OQ-AC-3 | Skip the preview during runs? | Yes after the run's first chapter; the first chapter of a new story always shows the preview (titles) |
| OQ-AC-4 | A duplicate page mid-run? | Stop (except the run's starting page, which presses Next first) |
| OQ-AC-5 | Build option 2 too? | After AC-3, if the user still wants it |
| OQ-AC-6 | How to learn Novelpia's Next / lock markup? | Ask the user for a "What Clip sees" report from the phone; no live requests from the container for this |
