# FicShelf: a modern FanFiction.net app

A from-scratch rebuild of the FanFiction.Net iPhone app, which hasn't been updated in about
two years. It's built with Expo (React Native, TypeScript) and runs on iOS, iPadOS and Android.
It reads the **live** www.fanfiction.net site, and you can **log in with your real account**.

- Feature plan and the full feature checklist: [`PLAN.md`](PLAN.md)
- Unofficial app, not affiliated with FanFiction.Net or FictionPress. Rename it in `app.json`.

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
src/net/            WebView bridge (BridgeHost.tsx), challenge handling, image loading
src/ffn/            URL builders, constants, HTML parsers, form replay, typed API client
src/state/          library / progress / settings / session stores (persisted to SQLite)
src/sources/        story keys ('ffn:123', 'ao3:5'…) and FanFiction.net ↔ library mapping
src/db/             SQLite key-value + chapter store, and the storage migrations (db/migrations)
src/features/       chapter loading, downloads, update checks + notifications, shared story actions
src/reader/         reader HTML/CSS/JS template (themes, paging, read-aloud highlight, find)
src/audio/          audiobook player: text segments, speech engine, background audio, voices
src/components/     UI kit, story card, filter sheet, profile view, reader settings
tests/              Jest tests, synthetic HTML fixtures and a synthetic v1 library (fixtures/v1-library.ts)
scripts/            live-check.ts (parsers vs the live site), dev-proxy.ts (web dev harness),
                    check-keys.ts (part of `npm run lint`: no bare numeric story ids in shared code)
```

## Verification

Checks run while building this (October 2026):

| Check | Result |
|---|---|
| `npm test`: parsers, URL builders, form replay, challenge detection, bridge retry and mobile-redirect handling, audiobook segmentation, player engine, voices and background-audio session, story keys and routes, library state, backups, and the storage v2 migration on real SQLite (`node:sqlite`) | 224 / 224 pass |
| `npm run live-check`: the app's own bridge script in Chromium against **live** fanfiction.net | 17 / 17 pass: fandom lists, story list + 17 filters, chapter page, reviews, author profile, all 4 search types, crossovers, Just In, communities, forums + threads, beta readers, login form, captcha pre-check endpoint, cover images |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx expo export --platform ios` | bundles (3.8 MB Hermes bytecode) |
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
```

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
