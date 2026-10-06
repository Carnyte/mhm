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

Logging in uses the site's own steps (`/login.php` state token →
`/api/ajax_captcha_preverify.php` → form post). When a captcha is needed, or you want
Google / Facebook / X / Amazon / Microsoft / FictionPress sign-in, the real login page opens in an
in-app browser that shares the same cookie store. Follow / favourite and reviews use the site's
own AJAX endpoints (`/api/ajax_subs.php`, `/api/ajax_review.php`).

## Install it on your phone

**Step-by-step guide for non-developers: [`INSTALL.md`](INSTALL.md).** In short:

- **iPhone, no Mac** (paid Apple Developer membership): `eas device:create` to register the phone,
  then `eas build --platform ios --profile preview` and install from the link.
- **iPhone + Mac, free Apple ID**: `npx expo prebuild -p ios`, sign with your Personal Team in
  Xcode and run a Release build (reinstall every 7 days).
- **Android**: `eas build --platform android --profile preview` gives an APK.

Use the `preview` profile for a normal standalone app. `development` builds need a dev server
(`npx expo start --dev-client`) and are only for working on the code. Expo Go can't run this app
because it uses native modules (WebView, SQLite, notifications, background tasks).

## Project layout

```
src/app/            screens (Expo Router): tabs, story, reader, search, library, account…
src/net/            WebView bridge (BridgeHost.tsx), challenge handling, image loading
src/ffn/            URL builders, constants, HTML parsers, form replay, typed API client
src/state/          library / progress / settings / session stores (persisted to SQLite)
src/features/       downloads, update checks + notifications, shared story actions
src/reader/         reader HTML/CSS/JS template (themes, paging, TTS highlight, find)
src/components/     UI kit, story card, filter sheet, profile view, reader settings
tests/              Jest tests and synthetic HTML fixtures that mirror the real markup
scripts/            live-check.ts (parsers vs the live site) and dev-proxy.ts (web dev harness)
```

## Verification

Checks run while building this (October 2026):

| Check | Result |
|---|---|
| `npm test`: parsers, URL builders, form replay, challenge detection, bridge retry logic | 39 / 39 pass |
| `npm run live-check`: the app's own bridge script in Chromium against **live** fanfiction.net | 17 / 17 pass: fandom lists, story list + 17 filters, chapter page, reviews, author profile, all 4 search types, crossovers, Just In, communities, forums + threads, beta readers, login form, captcha pre-check endpoint, cover images |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npx expo export --platform ios` | bundles (3.8 MB Hermes bytecode) |
| `npx expo-doctor` | 21 / 21 checks pass (dependencies pinned to SDK 57 versions) |
| `npx expo prebuild -p ios` / `-p android` | native projects generate cleanly (deployment target iOS 16.4, scene life cycle on, no push entitlement) |
| Web harness screenshots with live data | Browse, fandom directory, story list, story details and reader render correctly |

Not verified here, because this was built on Linux with no iPhone and no account:

- **Running on a real device or simulator.** The JavaScript bundle compiles for iOS, but the
  native build has to happen on EAS or a Mac.
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
- New-chapter checks run when the app opens and in iOS background windows while the app is
  suspended. There's no server push, because that needs FictionPress's push servers.
- Posting in forums, publishing stories and account settings use FanFiction.net's own pages in
  the in-app browser.
