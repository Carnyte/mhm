# Active handoff

> Current state and the very next task only. Rules and the Context Map: `AGENT_ROOT.md`.
> Rewrite this file at every wrap-up (`AGENT_ROOT.md`, Session Wrap-Up Protocol).

**Updated**: 2026-11-05 · **Branch**: `claude/ficshelf-fanfiction-app` (repo root = the app)
**Last code commit**: EP-6 rotation in page mode ("Keep page mode to one page after rotating"; ticked in
`docs/reader.md`). Before it: `b4f5ce8` page-mode places, `c40019d` P6 AO3 login.

## State
- Pushed, ready to install (T1, JavaScript only, **no prebuild**: no app.json / plugin / native
  dependency change; react-native-webview was already installed). Nothing half-done.
- **P6 started** at the user's request ("Build ao3 login", 2026-11-01; recorded in
  `docs/history.md`, answers OQ-2 for AO3). Built, tests and headless Chromium only, **not yet on
  the phone**:
  - More → **AO3 account** (also in the classic Account tab under "Other accounts"):
    `src/app/account/[source].tsx`. Logged out: Log in, Request an invitation. Logged in:
    username, Log out, the user's AO3 pages (dashboard, subscriptions, bookmarks, history,
    Marked for Later, inbox) opened logged in; a tapped work there opens in FicShelf.
  - `src/app/signin/[source].tsx`: AO3's own login page in a visible WebView (shared cookies,
    desktop Safari UA, no desktop content mode). The app never fills in or reads the form; once
    the page header greets a user, `GET /` natively confirms (retried once after 2 s), then the
    screen closes. Logout: `POST /users/logout` (fresh token), then the WebView (its own logout
    form if it still greets the user), then one more native check.
  - Session: `src/sources/ao3/session.ts` (kv `session:ao3` = username + checkedAt only), fed by
    every AO3 page `ao3Fetch` sees (`noteAo3Page`; `/users/login` or `/lost_cookie` redirects and
    visitor headers mean logged out). Restricted works: "Log in to AO3" button, retries by itself
    after login; works seen locked in listings are fetched once logged in.
- **Rotation in page mode** (user, 2026-11-05: two pages at once after landscape → portrait, and a
  swipe then jumped to the chapter's start; `docs/reader.md` EP-6): one column per screen
  (`column-count:1`), no zoom (viewport + native scroll off in page mode), the kept place
  re-applied once a rotation settles and never re-measured mid-rotation. Tests + headless
  Chromium; **WebKit / phone not checked**.
- **Page mode reopens on the page left** (user, 2026-11-02: "the specific page i left on isnt what
  is saved"; `docs/reader.md` EP-4 / EP-5): the saved place is now a place in the chapter's text
  (the current page's first character), found again whatever the page count; kept through Aa,
  resize, pictures and the layout settling; the chapter left on its last page reopens there.
  Tests + a headless Chromium run; **not yet on the phone**. Same stored number, no migration.
- Still awaiting the user's phone reports on P-UI1 (Kindle look), EPUB reading EP-1..3,
  P-CLIP3 (BG-A1..A5) and P-CLIP2 (AC-A1..A6).
- Checks at the EP-6 commit: tsc clean · jest **75 suites, 1333 passed + 1 todo (1334)** · import corpus 303 + 1 todo · lint clean
  (`check-keys: ok`) · iOS export bundles (~5.3 MB hbc) · web screenshots of More and the AO3
  account screen (light / dark, logged in / out) looked right · expo-doctor 21/21 (last run
  2026-10-27) · clip-check 39/39 (last run at P-CLIP3, not affected).

## Next immediate task
0. Ask the user to check page mode on the phone with the same install: rotate to landscape and
   back a few times (one page, same words, a swipe turns one page); leave a chapter mid-way
   (and once on its last page), close the reader or the app, reopen → the same page. If it's still
   off, ask which story / chapter and whether they changed Aa or rotated; `docs/reader.md` EP-4.
1. Ask the user to install (T1) and try AO3 login: AO3L-A1 (log in → username shows in More),
   AO3L-A2 (a restricted work opens and downloads), AO3L-A5 (log out → More says Not signed in;
   then a restricted work asks to log in again). Risks to watch: the WebView's cookie reaching
   native requests (the screen then says "FicShelf's own requests don't carry the login yet"),
   Cloudflare checks on AO3's login page, AO3's logged-in markup differing from otwarchive's source
   (`parseGreeting`, `SESSION_SCRIPT`). If login fails, ask what the screen said.
2. Then the rest of P6 in `docs/ao3.md` §6, in order, one commit per green step: AO3L-4 parsers
   (subscriptions, readings, bookmarks, comments) with synthetic fixtures → AO3L-3 `account.ts`
   actions (`leaveKudos`, `postComment`, `subscribe` / `unsubscribe`, `bookmarkWork`,
   `markForLater`; `ao3Post` already does the fresh token + single POST) → AO3L-7 UI (heart =
   kudos, bell = Subscribe, ⋯ Bookmark on AO3… / Mark for later, reader ♥ Kudos + Comment,
   `comments/[key].tsx`, `CommentCompose.tsx`) → AO3L-5 library sync (scoped to `ao3`, AO3L-T3).
   The user can say "Build the rest of AO3" or report phone results first; ask once if unclear.
3. Phone reports on the Kindle look / EPUB / clipping come first whenever they arrive
   (`docs/ui_rules.md` §3a acceptance, `docs/reader.md` EP-A, `docs/clipping/*`).
4. Wattpad (P4 / P7) stays on hold until the user says clipping is perfect.

## If the user just says "continue" or "build the next phase"
- Phone results → fix those first.
- Otherwise continue P6 (step 2 above): it's in progress and its gate is open.
- Other phases still need the user's choice (AskUserQuestion, recommended first): P8 polish
  (`docs/polish_extras.md`), P4 Wattpad (only once clipping is "perfect"; OQ-1), P-IMPORT-X /
  P-NOVELPIA (only on request).

## Files to read for it
- `docs/ao3.md` §6 (P6 spec, data / API details, policies, checklist with ticks), §6.3 / §10.9 rules.
- Code: `src/sources/ao3/{session,account,api,adapter,ui}.ts`, `src/sources/ao3/parsers/account.ts`,
  `src/net/ao3Signin.ts`, `src/app/signin/[source].tsx`, `src/app/account/[source].tsx`,
  `src/components/states.tsx`; tests `tests/ao3-session.test.ts`, `tests/ao3-signin-screen.test.tsx`,
  `tests/helpers/fakeAo3.ts` (records POST bodies and headers).
- `docs/user_and_install.md` for the install message.

## Install message template the user expects (T1)
`cd ~/ficshelf` → `git pull --autostash` → `npm install` → `xed ios` → check Personal Team and
Release scheme → Cmd+R with the phone on a cable → "install over the app; don't delete it first".
One command per code block (`docs/user_and_install.md` §2.2, §2.4).
