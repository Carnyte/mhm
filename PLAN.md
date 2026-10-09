# FicShelf: plan for rebuilding the FanFiction.Net app

The official FanFiction.Net iOS app (FictionPress, App Store id 1192753879) has had
no meaningful update in about two years. This repo rebuilds it as a modern Expo /
React Native app (iOS first, Android also works) that talks to the **live**
www.fanfiction.net site and supports logging in with your real account. It now also
reads Archive of Our Own (AO3, section 2.12).

> FicShelf is an unofficial client. It is not affiliated with FanFiction.Net or
> FictionPress. Rename it in `app.json` if you like.

---

## 1. The hard part: how to talk to FanFiction.net

What I found while researching (October 2026):

* **No public API.** FanFiction.net has never published one. The official app
  uses private endpoints, and calling them would need credentials the app ships
  with, so this rebuild doesn't use them. Every third-party tool (FanFicFare and
  others) reads the website's HTML.
* **Cloudflare challenge.** Every plain HTTP request (curl, `fetch` from React
  Native, Node) gets `403` with `cf-mitigated: challenge` ("Just a moment…" /
  "Verify you are human").
* **A real browser engine gets through.** After the challenge page has run in a
  real browser, `fetch()` calls made *from inside a fanfiction.net page* return
  normal `200` HTML. Often it clears without any interaction. Sometimes a person
  has to tick "Verify you are human" once.

### Architecture: the WebView bridge

```
 React Native screens ──► api.ts (typed calls)
                              │  bridge.fetch(url, {method, body})
                              ▼
     <BridgeHost/> hidden WKWebView sitting on https://www.fanfiction.net/
       injected JS: same-origin fetch(url, {credentials:'include'})
                              │  HTML / JSON text via postMessage
                              ▼
                     parsers/*.ts (htmlparser2)  ──► typed models
```

* A hidden WebView stays on `www.fanfiction.net`. Requests run as same-origin
  `fetch()` inside it, so they carry the browser's Cloudflare clearance cookie
  (`cf_clearance`), user agent, TLS fingerprint and login cookies.
* **Desktop site:** every WebView that loads fanfiction.net identifies as desktop Safari
  (WebKit's desktop content mode, as iPads do). With the iPhone WebView's default user agent the
  site 302-redirects pages like `/login.php` to `m.fanfiction.net`. That turns the bridge's
  same-origin fetch into a cross-origin one that WebKit rejects ("Load failed"), and the mobile
  login page is a 404. If the bridge still lands on the mobile site, it reloads once and then
  reports it; Settings → Connection details shows the page, user agent and last error.
* **Challenge handling:** if a response comes back as a Cloudflare challenge, the
  bridge reloads (the challenged page itself for normal page loads, since a challenge can be
  page-specific) and waits for a passive clear. If that doesn't happen,
  the same WebView slides up full screen ("Quick check by FanFiction.net") so you
  can tick the box once. The waiting requests then retry automatically.
* **Images** (covers and avatars at `/image/...`) also go through the bridge as
  base64 data and are cached in memory.
* **Parsers** are pure TypeScript functions (HTML in, typed objects out). They're
  unit-tested against synthetic fixtures that copy the real markup structure,
  and `npm run live-check` runs them against the live site.

### Login

* **Email and password, in the app:** it fetches `/login.php` to get the `state`
  token and hidden fields, then calls `/api/ajax_captcha_preverify.php` (the
  site's own "is a captcha needed?" check). If no captcha is needed it posts the
  login form through the bridge. It checks success with the `funn` cookie, which
  the site's own JS uses to read the username.
* **When the site wants a reCAPTCHA, or for Google / Facebook / X / Amazon /
  Microsoft / FictionPress sign-in:** the real login page opens in an in-app
  browser with the email pre-filled. All WebViews share one cookie store, so the
  session carries over to the bridge.
* **Logout:** `/logout.php` through the bridge.

### Write actions confirmed in the site's own JavaScript

| Action | Endpoint | Body |
|---|---|---|
| Follow / favourite a story or author | `POST /api/ajax_subs.php` | `storyid, userid, storyalert, authoralert, favstory, favauthor` |
| Post a review (signed in or as a guest) | `POST /api/ajax_review.php` | `storyid, storytextid, chapter, name, review, + the 4 flags` |
| Captcha pre-check | `POST /api/ajax_captcha_preverify.php` | `email` |
| Login | `POST /login.php` | `email, password, remember, state, notop, refer` |

Pages that need an account (alerts, favourites, PMs, Doc Manager, settings)
couldn't be inspected without one. Those screens use **adaptive parsing**: rows
are found through story and user links, and forms are read from the live page
and resubmitted ("form replay") instead of hard-coding field names. Every one of
those screens also has an **Open on website** button that shows the real page in
the shared-session in-app browser, so nothing is ever a dead end.

---

## 2. Feature inventory

The list combines the official app's App Store listing and release notes (v60 to
v66), every user-facing feature of www.fanfiction.net, and what people expect
from a modern reader. Status: ✅ built · 🌐 built using the in-app browser with
your session · ⏳ not built (reason given).

### 2.1 Browse
- ✅ Home with the 9 categories: Anime/Manga, Books, Cartoons, Comics, Games, Misc, Movies, Plays/Musicals, TV Shows
- ✅ Crossover home for the same 9 categories
- ✅ Fandom list per category, with story counts
- ✅ Fandom list: A–Z / # letter filter
- ✅ Fandom list: sort by popularity or by name
- ✅ Fandom list: search box
- ✅ Pin favourite fandoms ("My Fandoms") on the Browse home
- ✅ Crossover fandom list per category
- ✅ Crossover partner list for a fandom ("Naruto + Harry Potter"), including "All crossovers for X"
- ✅ Story list for a fandom or crossover, with infinite scroll and total count
- ✅ Filter: sort (update date, publish date, reviews, favourites, follows)
- ✅ Filter: time range (updated or published within 24h / 1w / 1m / 6m / 1y)
- ✅ Filter: genre A, genre B, exclude genre
- ✅ Filter: rating (All, K→T, K→K+, K, K+, T, M)
- ✅ Filter: language (all 44 site languages)
- ✅ Filter: length (<1K, <5K, >1K … >100K words)
- ✅ Filter: status (in progress / complete)
- ✅ Filter: characters A–D, pairing toggle, exclude characters A/B and exclude pairing
- ✅ Filter: world / verse, exclude world
- ✅ Filter options come from the live page (character and world lists differ per fandom)
- ✅ Saved default filters (rating, language, sort) in Settings
- ✅ Just In: new stories and updates, filterable by type, category and language
- ✅ Communities directory per category, with sort and language
- ✅ Community page: info, founder, staff, and its story archive with filters
- 🌐 Follow a community (the site's follow page, in-app)
- ✅ Forums directory per category, with sort, language and type
- ✅ Forum topic list, pinned topics, latest post
- ✅ Topic thread (posts with author, avatar, date, post number), paginated
- 🌐 Post in a forum / start a topic / follow a forum or topic (site pop-up flows)
- ✅ Beta reader directory per category, plus beta profiles
- ✅ Story card: cover, title, author, summary, rating, language, genre, chapters, words, reviews, favs, follows, updated, published, characters, complete badge
- ✅ Long-press a story card: add to library, download, open author, share

### 2.2 Search
- ✅ Search types: story, writer, forum, community
- ✅ Match: any / title / summary
- ✅ Story type: any / crossovers only / no crossovers
- ✅ Sort: relevance / update date / publish date (stories), age (forums, communities)
- ✅ Refine with the site's live result facets (category, rating, words, language, genre, status …)
- ✅ Exclude fandoms from results (the official app's v66 "exclude category" filter, done in the app)
- ✅ Recent searches
- ✅ Open a story by pasting a fanfiction.net link or story id
- ✅ Pagination / infinite scroll

### 2.3 Story details
- ✅ Cover (tap to enlarge), title, author link, fandom breadcrumb link
- ✅ Summary
- ✅ Rating, language, genres, characters and pairings, chapters, words, reviews, favs, follows, updated, published, status, story id
- ✅ Estimated reading time
- ✅ Read / Continue reading (resume chapter and position)
- ✅ Chapter list with read ✓, downloaded ⬇ and current-chapter markers
- ✅ Follow story, favourite story, follow author, favourite author (`ajax_subs`)
- ✅ Download the whole story for offline reading, with progress, and remove it
- ✅ Add to a local collection
- ✅ Reviews link
- ✅ Share link / open in browser / copy link
- 🌐 Report abuse, add to community (site pop-ups)
- ✅ Story-not-found and removed-story handling

### 2.4 Reader
- ✅ Chapter text in a fast local WebView (works offline)
- ✅ Themes: Light, Sepia, Paper, Mint, Dusk, Dark, Black (OLED), plus "match system" (the official app's v66 dark-mode sync)
- ✅ Font family: System, Georgia, Palatino, Times, Verdana, Helvetica, Avenir, Charter, Courier
- ✅ Font size, line spacing, paragraph spacing, side margins, text width
- ✅ Left or justified text, optional hyphenation
- ✅ Scroll mode or page-turn mode (horizontal pages)
- ✅ Tap zones: centre shows / hides controls, edges turn the page
- ✅ Auto-scroll with adjustable speed
- ✅ Brightness slider in the reader
- ✅ Keep screen awake (on by default)
- ✅ Immersive mode (hides the status bar and controls)
- ✅ Progress: chapter %, story %, time left in chapter
- ✅ Remembers scroll position for every chapter, resumes exactly
- ✅ Previous / next chapter, chapter list drawer, jump to chapter
- ✅ Bookmarks (chapter + position + optional note), bookmark list
- ✅ Find in chapter
- ✅ Audiobook / text-to-speech (the official app's "Text to Speech – listen to stories like audio books"), built as one app-wide player (`src/audio/`):
  - ✅ Start from the reader (headphones button in the top and bottom bars, starts at the first paragraph on screen), from the story page (**Listen**) or from any story's ⋯ menu
  - ✅ While listening, tap a paragraph in the reader to read from there (as in the original); the paragraph being read is highlighted and followed, in scroll and page mode
  - ✅ Keeps playing with the screen locked and with the silent switch on; lock screen / Control Center card with title, chapter, author and cover; play / pause from the lock screen, Control Center and headphones (AirPods); the lock screen's ±10 s buttons skip a paragraph
  - ✅ Pauses for phone calls and when headphones are unplugged, and resumes after a call when iOS allows
  - ✅ Carries on into the next chapter without the reader open (works offline for downloaded stories; the next chapter is prefetched)
  - ✅ Mini player across the app, plus a full player screen: cover, current passage, position slider, previous / next paragraph and chapter, chapter picker, time left in chapter
  - ✅ Speed (0.5×–2×, mapped so each setting sounds like its label with Apple and Piper voices alike), pitch, voice per story language (Premium / Enhanced voices labelled and preferred automatically; a "no voice for this language" notice), voice preview
  - ✅ Voices other apps add to iOS (e.g. the free Piper – Neural TTS app) listed first and marked "Add-on", with a notice when one drops out (Piper voices can vanish after a restart until Piper is opened)
  - ✅ Sleep timer (5 min – 2 h, or end of chapter)
  - ✅ Announce chapter titles (toggle), skips decorative separators like "* * *"
  - ✅ Natural pauses: a beat between paragraphs, longer after chapter titles and at scene breaks (Natural / Long / Off), plus speech-only clean-up of ellipses, "?!?!", *emphasis* markers and dashes
  - ✅ Skips the author's notes at the top of a chapter (summary, disclaimer, A/N up to the first separator or chapter heading; toggle in the player). They stay in the chapter: tap one, or go back a paragraph, to hear it
  - ✅ Remembers the listening position per story, and updates reading progress as you listen
  - ✅ Optional "play over music and other audio" (lowers other apps instead of stopping them; no lock screen controls in that mode)
  - ⏳ The official app's server "HD" voices (Lauren / Larry) ran on FictionPress's GPUs; the closest equivalent is Apple's free Premium voices (Settings → Accessibility → Read & Speak → Voices)
- ✅ Dictionary and translation of selected text through the iOS system menu (Look Up / Translate), which replaces the official app's AI dictionary
- ✅ Write a review at the end of a chapter
- ✅ Follow / favourite from the reader
- ✅ Marks chapters read automatically, with manual mark read / unread
- ⏳ Full-chapter AI translation: the official app used FictionPress's own AI service. iOS Translate covers selected text. Full-chapter translation would need a third-party API key and is left out
- ⏳ Android Auto: the official app had it on Android only; it doesn't apply to iOS

### 2.5 Reviews
- ✅ Review list per story, with chapter filter and pagination
- ✅ Reviewer avatar, name (links to profile) or guest name, chapter, date
- ✅ Post a review signed in, or as a guest with a name (`ajax_review`), with optional follow / fav flags
- 🌐 Reply to a review by PM, report a review

### 2.6 Authors and profiles
- ✅ Profile: name, avatar, join date, id, profile updated, bio (rendered HTML)
- ✅ Tabs: Stories, Favourite stories, Favourite authors, Bio
- ✅ Sort or filter an author's stories (updated, published, title, words, reviews, status)
- ✅ Follow author / favourite author
- 🌐 Send a PM to the author (the site's PM form, in-app; native compose is tried first, see Messages)
- ✅ Share profile

### 2.7 Library (on the device, plus sync with your account)
- ✅ Reading history with progress bars and last-read time, filterable by fandom (official v64)
- ✅ Follows, synced from your account's Story Alerts
- ✅ Favourites, synced from your account's Favourite Stories
- ✅ Followed and favourite authors, synced
- ✅ Downloads (offline) with storage used and per-story delete
- ✅ Collections (custom shelves): create, rename, delete, add and remove stories
- ✅ Sort: last read, updated, title, unread chapters, progress
- ✅ Filter by fandom, complete / in progress, has unread chapters
- ✅ "New chapters" badges
- ✅ Unfollow / unfavourite from the synced lists (form replay on the account page, with a website fallback)
- ✅ Back up the library to a JSON file and restore it (share sheet and document picker)

### 2.8 Updates and notifications
- ✅ Updates tab: library stories with new chapters since you last read
- ✅ Check now, pull to refresh, last-checked time
- ✅ Automatic check when the app opens or comes back to the foreground
- ✅ Background check (iOS BackgroundTask, about every few hours, best effort)
- ✅ Local notifications for new chapters, which open the story
- ✅ Optionally auto-download new chapters of downloaded stories (Wi-Fi only option)
- ⏳ Server push like the official app: that needs FictionPress's push servers. Local and background checks replace it

### 2.9 Account
- ✅ Log in with email and password, with a captcha fallback in-app
- ✅ Social sign-in through the real site login page in the in-app browser
- ✅ Logged-in status, username and profile link
- ✅ Log out
- ✅ Story alerts, author alerts, favourite stories, favourite authors lists
- ✅ Private messages: inbox and sent lists, read messages (adaptive parsing), compose and reply (form replay), with a 🌐 fallback
- 🌐 Account settings, profile editing, blocked users, account deletion
- 🌐 Reviews received and review moderation (official v63)
- 🌐 Communities you follow, forums you follow, your communities and forums
- 🌐 Create a community or forum

### 2.10 Writing (official "write, edit and publish on the go")
- ✅ Local drafts editor: title, tags (official v65 "custom tags"), word count, autosave, export or share as .txt / .html (official v64 "Apple Pages support" came through sharing)
- 🌐 Doc Manager: upload or paste drafts, edit documents
- 🌐 Publish a story, add chapters, manage stories
- ⏳ AI grammar, AI transcriber and AI voices from the official app's private AI service: iOS dictation and spell check cover the basics

### 2.11 Settings and app
- ✅ App appearance: system / light / dark
- ✅ Reader defaults (all reader settings above)
- ✅ Content defaults: rating (hide M), language, sort
- ✅ Notifications: on/off, check frequency, auto-download, Wi-Fi only
- ✅ Storage: clear image cache, clear history, delete all downloads, storage usage
- ✅ Connection: bridge status, "Verify with FanFiction.net" (shows the challenge), reset session
- ✅ Open any fanfiction.net page in the in-app browser
- ✅ Deep links: `ficshelf://s/<id>` and pasted `https://www.fanfiction.net/s/...` links
- ✅ Haptics on key actions
- ✅ iPad support (adjustable reading column width, sheets and cards scale to tablet widths)
- ✅ Accessibility labels on controls, Dynamic Type for app text
- ✅ About / disclaimer / version
- ✅ Settings → Sources: AO3 on / off, "Ask before showing adult works", fold authors' notes
- ✅ One-time "What's new" sheet (AO3)

### 2.12 Archive of Our Own (AO3), without logging in
- ✅ AO3 on by default, also for existing installs (switch in Settings → Sources)
- ✅ Site chips on Browse and Search (FanFiction.net · AO3); FanFiction.net's screens unchanged
- ✅ Browse: 11 media → a medium's fandoms (A–Z, filter, sort, counts; cached 7 days) → a tag's works
- ✅ Tag works: sort, rating, complete chips; filter sheet with warnings, categories (include /
  exclude), crossovers, length, language, search within results, and the page's top fandoms,
  characters, relationships and additional tags (include / exclude); 20 a page, up to page 5000
- ✅ Pin AO3 fandoms to Browse; popular fandoms from /media
- ✅ Search: any field, title, creators, fandoms (AO3 suggestions, debounced, from 2 letters),
  characters, relationships, additional tags, rating, warnings, categories, complete, crossovers,
  single chapter, length, language, sort; recent AO3 searches
- ✅ Pasted links: works, chapters (/chapters/ID through AO3's redirect), tags, series, creators,
  mirrors (ao3.org, archiveofourown.com/.net, archive.transformativeworks.org); a typed number asks
  which site
- ✅ Story page: tag groups, warnings line, rating badge, series row (part N, previous / next work),
  co-creators, Anonymous, orphan_account, AO3 stats, chapter list with ids and dates (/navigate)
- ✅ Series and creator screens (works, filters; profile, series and bookmarks open on AO3)
- ✅ Reader: per-chapter requests with view_adult=true, sanitized text, notes and end notes as
  foldable boxes, work skins stripped, links resolved against AO3 and opened in the app
- ✅ In-app adult-content gate for Mature / Explicit / Not Rated works ("Always show" setting)
- ✅ Restricted works: lock in listings, login redirect detected, "Log in to AO3 to read this" +
  Open on AO3; the download host is never used for them
- ✅ Library, collections, bookmarks, Continue reading (keys 'ao3:<id>', no collision with FFN ids)
- ✅ Offline: AO3's official HTML download (link copied from the work page), one request, split
  into chapters with their notes, chapter ids stored; full-work page as fallback; re-downloaded only
  when `updated_at` changes
- ✅ Audiobook, with the notes boxes as the exact "skip notes" boundary
- ✅ Updates: one id search per 20 works (background, 5 s apart), /navigate for the rest; alerts only
  for new chapters; edits refresh downloads quietly; reordered chapters move progress, downloads,
  bookmarks and the listening position
- ⏳ Later: AO3 login (restricted works, kudos, comments, subscriptions, AO3 bookmarks, Marked for
  Later), creator's style toggle, offline images

---

## 3. Code map

```
src/app/               Expo Router screens (tabs + stacks); src/app/ao3/ for AO3
src/net/bridge*.tsx    WebView bridge (native) + dev proxy bridge (web)
src/net/challenge.ts   Cloudflare challenge detection
src/ffn/urls.ts        URL builders for every page type / filter
src/ffn/constants.ts   categories, genres, ratings, languages, lengths …
src/ffn/parsers/       HTML → typed models (story, lists, search, reviews, profile …)
src/ffn/forms.ts       generic form parsing + "form replay"
src/ffn/api.ts         typed client (calls bridge + parsers)
src/sources/           site layer: keys, Source contract, registry, slots; ffn/ and ao3/ adapters
src/sources/ao3/       AO3: api (polite native requests), adapter, parsers/, urls, constants, ui slots
src/net/http*.ts       polite HTTP client for AO3 (per-host queue, gaps, Retry-After); blocks.ts
src/db/                SQLite (library, chapters, history, bookmarks, collections, drafts)
src/state/             settings store, auth/session store
src/reader/            reader HTML template + in-reader JS
src/features/          updates checker, downloads, shared story actions
src/audio/             audiobook player: segmentation, TTS engine, background audio / lock screen, voices
src/components/        UI kit
tests/                 Jest tests + synthetic HTML fixtures (no real story text)
scripts/live-check.ts  runs the bridge JS + parsers against the live site (Playwright);
                       `--source ao3` checks the AO3 parsers with 5 plain requests
scripts/synthesize-fixture.ts  saved AO3 page → test fixture with the authors' words replaced
scripts/dev-proxy.ts   lets the web build use a real Chromium session (for screenshots)
```

## 4. Build and run

```bash
npm install
npm test               # unit tests (554)
npm run lint           # eslint + check-keys
npm run typecheck
npx expo run:ios       # local dev build (needs Xcode), or:
npx eas-cli@latest build -p ios --profile development
```

This uses native modules (WebView, SQLite, notifications, background task), so
use a **development build**, not Expo Go.

## 5. Verification done

See the **Verification** section of `README.md`: 554 unit tests, a 17-check live run of the
FanFiction.net parsers and a 5-check live run of the AO3 parsers, typecheck, lint, iOS bundle
export, expo-doctor, and live-data screenshots.
