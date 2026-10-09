# FicShelf: a modern FanFiction.net and AO3 app

A from-scratch rebuild of the FanFiction.Net iPhone app, which hasn't been updated in about
two years, that now also reads **Archive of Our Own (AO3)**. It's built with Expo (React Native,
TypeScript) and runs on iOS, iPadOS and Android. It reads the **live** www.fanfiction.net and
archiveofourown.org sites, and you can **log in with your real FanFiction.net account**.

- Feature plan and the full feature checklist: [`PLAN.md`](PLAN.md)
- Unofficial app, not affiliated with FanFiction.Net, FictionPress, AO3 or the Organization for
  Transformative Works. Rename it in `app.json`.

## How it talks to FanFiction.net

FanFiction.net has no public API, and plain HTTP requests are blocked by Cloudflare
(`403 cf-mitigated: challenge`). The app runs a hidden WebView on `www.fanfiction.net`. That's a
real browser engine, so Cloudflare's check passes like it does in Safari. Every request is a
same-origin `fetch()` from inside that page, and the HTML comes back to typed TypeScript parsers.
If Cloudflare ever wants a human, the same WebView slides up so you can tick
"Verify you are human" once.

Every WebView that loads the site identifies as desktop Safari, the same way an iPad does. With
the iPhone's default WebView identity, FanFiction.net redirects pages such as `/login.php` to
its mobile site, m.fanfiction.net. The mobile site has no login page (it's a 404), and the
redirect makes the app's requests fail with "Load failed".

Logging in uses the site's own steps (`/login.php` state token →
`/api/ajax_captcha_preverify.php` → form post). When a captcha is needed, or you want
Google / Facebook / X / Amazon / Microsoft / FictionPress sign-in, the real login page opens in an
in-app browser that shares the same cookie store. Follow / favourite and reviews use the site's
own AJAX endpoints (`/api/ajax_subs.php`, `/api/ajax_review.php`).

## AO3 (Archive of Our Own)

AO3 is on by default (a one-time "What's new" sheet explains it; switch it off under Settings →
Sources). Browse and Search get site chips (FanFiction.net · AO3); FanFiction.net's screens are
unchanged behind its chip.

- **Browse:** the 11 media → a medium's fandoms (A–Z, filter, counts; the list is cached for a
  week) → a tag's works with a filter sheet built from AO3's own filters (sort, rating, warnings,
  categories, complete, crossovers, length, language, and the page's top characters,
  relationships and tags to include or exclude). Pin fandoms to Browse.
- **Search:** AO3's work search (any field, title, creators, fandoms with AO3's suggestions,
  characters, relationships, additional tags, rating, warnings, categories, complete,
  crossovers, single chapter, length, language, sort). Pasted AO3 links (works, chapters, tags,
  series, creators, the ao3.org mirrors) open in the app; a typed number asks "FanFiction.net or
  AO3?".
- **Story page:** tags grouped by kind, a ⚠ warnings line, the series with previous / next work,
  co-creators, Anonymous and orphan_account, AO3's stats (words, chapters n/?, kudos, hits,
  bookmarks, comments, dates) and the chapter list with posting dates.
- **Reader:** one chapter per request (`/works/ID/chapters/CID?view_adult=true`), sanitized;
  the author's notes and end notes are boxes you can fold (tap their label, or fold them all in
  Settings → Sources). Work skins aren't applied. Links to other AO3 works, tags and creators open
  in the app.
- **Offline:** Download uses AO3's official HTML download, from exactly the link the work page
  gives (never a URL the app makes up): the whole work in one request, served from Cloudflare's
  cache, cut into chapters as they're saved. If that fails, the full-work page is used. A
  download is only fetched again when AO3's version stamp (`updated_at`) changes.
- **Audiobook:** works like FanFiction.net stories; "skip the author's notes" uses the notes
  boxes as the exact boundary.
- **Updates:** works in your library are checked with one AO3 search per 20 works (`id:(…)`),
  5 s apart in the background, then `/navigate` for any the search didn't return. You're only
  alerted when a work gains chapters; any other edit just refreshes its download quietly. When
  chapters are reordered or deleted, reading progress, downloads, bookmarks and the listening
  position move with their chapter.
- **Adult works:** every work request skips AO3's own notice (`view_adult=true`), and FicShelf
  asks before showing a Mature, Explicit or Not Rated work the first time ("Always show" turns
  that off in Settings → Sources).
- **Not yet:** logging in to AO3. Works only for logged-in users ("restricted", shown with a
  lock) say "Log in to AO3 to read this" and open on AO3's site; kudos, comments, subscriptions
  and AO3 bookmarks come with login.

How it talks to AO3: plain native requests (AO3 allows non-commercial bots and apps that don't
host or paywall its works), one at a time, at least 1.5 s apart (5 s for background checks),
pausing when AO3 answers 429 / Retry-After, with AO3-specific Cloudflare challenge detection
(every AO3 page loads Cloudflare's passive script, so FanFiction.net's check would misfire). It
never follows Cloudflare's hidden `/cdn-cgi/` links, never asks the download host for a restricted
work, and doesn't send hit counts. The code is in `src/sources/ao3/` and `src/app/ao3/`.

## Audiobook

Any story can be read aloud with the phone's own voices: tap **Listen** on a story, or the
headphones button in the reader. It keeps going with the screen locked, carries on into the
next chapter, has a sleep timer, and shows on the lock screen and in Control Center. Apple's free
**Premium** and **Enhanced** voices sound much more natural than the default ones. Download one
under iOS Settings → Accessibility → Read & Speak → Voices, and the app picks it automatically.
Voices that other apps add to iOS (for example the free, offline **Piper – Neural TTS** app) show
up at the top of the player's voice list, marked **Add-on**. It pauses between paragraphs, and
longer after chapter titles and at scene breaks, and starts each chapter after the author's notes
(summary, disclaimer, A/N) unless you turn that off. The code is in `src/audio/`.

## Install it on your phone

**Step-by-step guide for non-developers: [`INSTALL.md`](INSTALL.md).** In short:

- **iPhone, no Mac** (paid Apple Developer membership): `eas device:create` to register the phone,
  then `eas build --platform ios --profile preview` and install from the link.
- **iPhone + Mac, free Apple ID**: `npx expo prebuild -p ios`, sign with your Personal Team in
  Xcode and run a Release build (reinstall every 7 days).
- **Android**: `eas build --platform android --profile preview` gives an APK.

**Updating an installed copy:** before installing a build that changes how the library is stored
(the multi-source update is the first), use Settings → Back up library and keep the file. The
update converts the library in one step, keeps a copy of the old database
(`ficshelf-pre-v2.db`, shown under Settings → Library & storage) and can still restore older
backup files. An older build installed afterwards can't show the converted library; nothing is
lost, and what you do in the older build is merged back when the newer build starts.

Use the `preview` profile for a normal standalone app. `development` builds need a dev server
(`npx expo start --dev-client`) and are only for working on the code. Expo Go can't run this app
because it uses native modules (WebView, SQLite, notifications, background tasks).

## Project layout

```
src/app/            screens (Expo Router): tabs, story, reader, search, library, account…
src/net/            WebView bridge (BridgeHost.tsx), challenge handling, image loading, the polite HTTP
                    client for other sites (http.ts: per-host queue, gaps, Retry-After) and bot-check detection
src/ffn/            URL builders, constants, HTML parsers, form replay, typed API client
src/state/          library / progress / settings / session stores (persisted to SQLite)
src/sources/        the site layer: story keys ('ffn:123', 'ao3:5'…), the Source contract and registry
                    (resolveLink), each site's adapter and UI slots: ffn/, ao3/ (api, adapter, parsers,
                    URLs, constants), Wattpad link parsing; chapter remapping (remap.ts)
src/app/ao3/        AO3 screens: a medium's fandoms, works (tag listings and search results), series, creators
src/html/           shared HTML helpers (dom.ts) and the allowlist sanitizer for other sites' HTML
src/db/             SQLite key-value + chapter store, and the storage migrations (db/migrations)
src/features/       chapter loading, downloads, update checks + notifications, chapter ids (remapping),
                    shared story actions
src/reader/         reader HTML/CSS/JS template (themes, paging, read-aloud highlight, find)
src/audio/          audiobook player: text segments, speech engine, background audio, voices
src/components/     UI kit, story card, filter sheets, site chips, tag groups, What's new, AO3 browse / search /
                    adult-content gate (components/ao3), profile view, reader settings
tests/              Jest tests, synthetic HTML fixtures (fixtures/ao3: AO3 page markup with lorem ipsum text)
                    and a synthetic v1 library (fixtures/v1-library.ts)
scripts/            live-check.ts (parsers vs the live sites; `-- --source ao3` for AO3), synthesize-fixture.ts
                    (a saved AO3 page → a fixture with the authors' words replaced), dev-proxy.ts (web dev
                    harness: FFN bridge + /http), check-keys.ts (part of `npm run lint`: no bare numeric story
                    ids in shared code)
```

## Verification

Checks run while building this (October 2026):

| Check | Result |
|---|---|
| `npm test`: parsers, URL builders, form replay, challenge detection, bridge retry and mobile-redirect handling, audiobook segmentation, player engine, voices and background-audio session, story keys and routes, library state, backups, the storage v2 migration on real SQLite (`node:sqlite`), the source registry and link parsing (FanFiction.net, AO3, Wattpad), the FanFiction.net adapter and its menus (labels unchanged), the polite HTTP client, bot-check detection, the HTML sanitizer, image loading and chapter remapping; AO3: parsers on synthetic fixtures, request URLs, the adapter (view_adult, refusals, listings, the fandom cache), the official download (link copied, never built; not for restricted works), batched update checks (45 works = 3 searches), chapter-id remapping, the FFN 3171550 / AO3 3171550 key collision, AO3's slots and the settings change that turns AO3 on; stale chapter ids (a chapter inserted, deleted or moved: the right chapter fetched, saved and recorded), shortened chapter titles, per-site check times, background budgets and back-off, the adult gate on every way into a work, per-site hidden fandoms and recent searches | 600 / 600 pass |
| `npm run live-check -- --source ao3`: the AO3 parsers against **live** archiveofourown.org (5 requests, 3 s apart) | 5 / 5 pass: work page with chapter index and download link, /navigate, id search, official download (HEAD, served from Cloudflare's cache), /media. A further 9 requests checked a filtered tag listing, search results, the HTML download split into 17 chapters, a series, a creator's works, a chapter page and fandom suggestions (two of them first answered AO3's transient 525 error, shown as "AO3 is busy") |
| `npm run live-check`: the app's own bridge script in Chromium against **live** fanfiction.net | 17 / 17 pass: fandom lists, story list + 17 filters, chapter page, reviews, author profile, all 4 search types, crossovers, Just In, communities, forums + threads, beta readers, login form, captcha pre-check endpoint, cover images |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx expo export --platform ios` | bundles (4.3 MB Hermes bytecode) |
| `npx expo-doctor` | 21 / 21 checks pass (dependencies pinned to SDK 57 versions) |
| `npx expo prebuild -p ios` / `-p android` | native projects generate cleanly (deployment target iOS 16.4, scene life cycle on, no push entitlement, background audio on, no microphone permission) |
| First install on a real iPhone (iOS 26, Xcode, free Apple ID) | builds and opens; login and search failed until the desktop user agent fix (October 2026) |
| Web harness screenshots with live data | Browse, fandom directory, story list, story details and reader render correctly |

Not verified here, because this was built on Linux with no iPhone and no account:

- **The fixes since the first device install.** The desktop user agent, the mobile-site redirect
  handling and the audiobook's background audio and lock screen have unit tests but haven't run
  on an iPhone yet. If something still fails, Settings → Connection → **Connection details**
  copies a report to share.
- **Logging in with a real account.** The login form, the captcha pre-check endpoint and the
  login fields were checked against the live site, but a full login wasn't possible without
  credentials.
- **Pages behind a login** (Story/Author Alerts, Favorites, private messages). Their markup
  couldn't be inspected, so those parsers are adaptive and every one of those screens has an
  "Open on FanFiction.net" fallback that shows the real page with your session.
- After many automated requests, Cloudflare began challenging the headless test browser in the
  build sandbox. On a phone this is where the "Quick security check" sheet appears.

### Re-run the live check yourself

```bash
CHROMIUM_PATH=/path/to/chrome npm run live-check    # on headless Linux: xvfb-run -a npm run live-check
npm run live-check -- --source ao3                  # AO3: plain fetch, 5 requests, no browser needed
```

New AO3 test fixtures are made from saved pages with `npx tsx scripts/synthesize-fixture.ts
page.html tests/fixtures/ao3/name.html` (it keeps the markup and replaces the authors' words);
never commit a real page.

## Known limitations

- Full-chapter AI translation and the official app's AI writing tools used FictionPress's private
  service. Selected text can be translated and looked up through the iOS system menu.
- Audiobook: the official app's server "HD" voices ran on FictionPress's own servers. FicShelf
  uses the voices on your phone instead. On the lock screen, next and previous paragraph use
  the ±10 s buttons, because Expo's audio module doesn't expose next/previous track. In
  "play over other audio" mode iOS shows no lock screen controls.
- New-chapter checks run when the app opens and in iOS background windows while the app is
  suspended. There's no server push, because that needs FictionPress's push servers.
- Posting in forums, publishing stories and account settings use FanFiction.net's own pages in
  the in-app browser.
- AO3 has no login in the app yet: restricted works open on AO3's site, and kudos, comments,
  subscriptions and AO3 bookmarks aren't available. Reading in the app doesn't add to a work's
  hit count. Creators' work skins (custom styling) aren't applied.
