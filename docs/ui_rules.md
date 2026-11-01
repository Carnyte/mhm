# UI rules: the Kindle-style look (P-UI1 spec, as built), settings screen, modals

> Read before any UI change. Match design/kindle-preview/index.html; ask before deviating. Classic look stays in Settings.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 3a. P-UI1: Kindle-style look (FIRST PHASE: do this before anything else)

```yaml
id: P-UI1
title: Kindle-style look and navigation, built from the approved preview, behind a "New look" switch
status: done (device check pending; UI-1..UI-10 built 2026-11-01, Kindle-style is the default)
order: 0
next_task: false (built; the phone check UI-A1..A6 is next)
depends_on: [nothing; every feature it restyles is built]
native_rebuild: no (JavaScript and font assets only; T1). Keep it that way: no new native modules.
reference:
  preview_file: design/kindle-preview/index.html   # open it in any browser; it IS the spec
  preview_link: https://claude.ai/artifact/SjAqJUtkKqewgbCM31Q3oH   # the same page, owned by the user
approved_by_user:
  - date: 2026-10-29
    quote: "I think the gui can be more user friendly, if not more refined. I want something google like"
    outcome: Material You was built (72a9e95) and REVERTED on 2026-10-30 ("Only undoing the change of the gui"). Do not bring Material You back.
  - date: 2026-10-31
    quote: "what are things that needs to be improved for user experience and professionalism as current app design. I wish for something similar to amazoin's kindle. That's the best reference I want you to have for overall GUI design"
  - date: 2026-11-01
    quote: "Go ahead with the preview"  # after Claude recommended: preview first, then build behind a switch
  - date: 2026-11-01
    quote: "I like this a lot better, can you create a handoff to seamlessly allow the next agent with no context continue building this. Let this current task be the first phase to be dealt with before anything else"
lessons_from_the_revert: >-
  The user rejected a restyle they first saw only once it was finished and all-at-once. So: build
  behind a Settings switch (classic look stays one tap away), ship in the small steps below, and
  after each step send screenshots (scripts/web-shots.cjs) and say what to look at on the phone.
  Match the preview; do not invent a different style. Ask before deviating from it.
```

### why
- Today's app reads like a settings screen: small grey labels, a border on every card, five or
  more accent colours, a book-icon placeholder instead of covers, a reader with nine always-visible
  controls. The user wants Kindle: cover-first, calm, white space, one accent, big type.

### the design (read off design/kindle-preview/index.html; its `<style>` holds every value)
- **Tokens** (light / dark): paper `#FFFFFF` / `#0F1113` (background); wash `#F4F4F2` / `#181B1E`
  (grouped lists, hero card, search field); ink `#15171A` / `#ECEDEF` (text, progress fill,
  selected chips); ink-2 `#5D636B` / `#9CA2AA` (secondary text); rule `#E4E5E7` / `#262A2E`
  (hairlines); accent = FicShelf navy `#1F3A5F` / `#9DB9E6` (primary buttons and text links only).
  No other accent. Site colours (FFN blue, AO3 red) only as tiny labels on covers, never fills.
- **Type**: Literata (Google Fonts, OFL) for anything the book says: book titles on Home, the
  story page and the list view, the reader's default page font, the wordmark "FicShelf". The
  phone's own font (SF) for every control. Sizes used: 28 bold (screen titles), 26 / 21 serif
  semibold (book titles), 19 bold (row heads), 15–16 (body), 13 (secondary), 11 (tab labels,
  progress %). No ALL-CAPS section labels except the tiny "CONTINUE READING" eyebrow.
- **Generated covers** (`cover()` in the preview): every story without a real cover image gets
  one. Colour = `CLOTH[fnv1a(title) % 9]` from `#6B2E2E #2F4A3A #22344F #7A5B2A #4A3358 #3D4A55
  #7B3F2B #2E5257 #5A4636`; aspect 2:3; corners 4/6px (spine side 4); a spine shade (dark→clear
  gradient over the left 7–14%); a 1px frame inset 7% in cream at 38%; an optional cream band at
  62% height when fnv1a(author) is odd; top: site label (FFN / AO3 / CLIPPED / EPUB) in small caps;
  middle: title in Literata 600, cream `#F3EBDD`, size by length (w×0.16 up to 16 chars, ×0.135 up
  to 26, else ×0.115); bottom: author in small caps. A "NEW" flag hangs from the top right when the
  story has new chapters. A story WITH a real cover keeps it (FFN / AO3 / EPUB covers).
- **Tabs (4)**: Home, Library, Discover, More. Updates stops being a tab (it becomes Home's "New
  chapters" row, the Library's "New" filter and a More row); Search merges into Discover.
- **Home**: wordmark "FicShelf" + search icon (→ Discover). Hero card (wash, radius 18): cover 116
  wide, "CONTINUE READING", title (serif 21), author, progress bar (3px, ink fill), "Chapter 4 of 12
  · 34%", "12 min left in chapter", buttons Continue (navy) and Listen (outlined icon). Then rows,
  each with a "See all"-style link: **New chapters** (covers with NEW flags, "2 new · Ch. 30"),
  **Clipping now** (background jobs, pulsing dot + "Chapter 37 · clipping", Details → the jobs
  screen), **Recently added**. Rows with nothing in them are left out. An empty library shows a
  short welcome with "Clip a whole story", "Import a file" and "Browse FanFiction.net / AO3".
- **Library**: title + search + "+" (one sheet: Clip a whole story, Import a file, Open a link).
  Filter chips (one row, scrolls): All, New · n, Downloaded, Unread, In progress, Finished,
  Collections; selected chip = ink fill. Sort button ("Recent") + grid/list toggle. Grid: 3 across,
  covers ~104 wide, under each a progress bar with % (or "Unread" / "Finished"), a cloud icon when
  not downloaded. List: cover 52, serif title, author, "34% · Chapter 4 of 12 · 2 new".
  Today's other shelves (Follows, Favorites, Authors, Imported, Saved) must stay reachable: put them
  in the sort/filter menu or as extra chips after Collections; FFN account sync stays in "+"/menu.
- **Story page**: back + ⋯. Centred cover 168 wide, title serif 26, author (tappable when the site
  has author pages), small grey tags (fandom, site, rating), one line "12 chapters · 48K words ·
  In progress · Updated 2 days ago". Full-width navy button "Continue · Chapter 4" / "Start
  reading" / "Read again", progress line under it. Four labelled icons: Listen, Download(ed),
  Collection, Share. Description in serif, clamped to 4 lines with "Read more". "Contents ›" opens
  a sheet with every chapter (read ✓, current "Reading"). "Details" as a two-column list. Keep
  everything the site slots give today (src/sources/*/ui.ts storyActions: FFN follow / favourite,
  reviews, AO3 tag groups, warnings, series row, kudos/stats where they matter) below Details or
  in ⋯, the adult gate, download progress, the background-clipping line.
- **Reader**: page fills the screen; controls hidden. A faint footer: "12 min left in chapter" left,
  story % right. Tap left / right 30% = previous / next page (paged mode); tap the middle = show /
  hide controls. Top bar: back, story title (centred), Aa, search, bookmark. Bottom panel: a
  scrubber with a tick per chapter, "Chapter 4 of 12 · 12 min left" and "Page 1 of 4 · 25%", then
  Contents, Previous, Listen, Next. Aa sheet: four page colours White / Sepia / Green / Black (map to
  READER_THEMES light / sepia / mint / black), text size − / +, font Literata / Georgia / System,
  Turn pages: Pages / Scroll, and "More settings" opening today's ReaderSettingsPanel (spacing,
  margins, width, brightness, read aloud). Chapter heading once: small "CHAPTER 4" over the
  chapter's own title (today it prints "4. Chapter 4"; src/app/read/[id].tsx ~l.285 builds
  `${chapter}. ${title}`).
- **Discover**: search field ("Search stories, authors or paste a link"; today's search screen
  behind it), FanFiction.net / AO3 segmented switch, a 2-column grid of categories (FFN's 9, AO3's
  media), today's browse screens behind them, and a callout "Clip a whole story" (→ /open?clip=1).
- **More**: grouped rows on wash: FanFiction.net account (sign in / status); Clipping in the
  background (count), Bookmarks, Collections, Drafts, Import a file; New chapter alerts (the old
  Updates screen with Check now), Settings, Help and about. Connection details stay in Settings.

### build steps (one commit each; screenshots to the user after each, "hold off" not needed)
- [x] UI-0 Read this section, open design/kindle-preview/index.html in Chromium (playwright) at
      390×844 and look at every screen; read src/theme/index.ts, src/components/ui.tsx,
      src/components/Cover.tsx, StoryCard.tsx, src/app/(tabs)/*, src/app/story/[id].tsx,
      src/app/read/[id].tsx, src/reader/template.ts, src/components/ReaderSettingsPanel.tsx.
- [x] UI-1 (e7b3221) The switch: `AppSettings.look?: 'kindle' | 'classic'` (default 'kindle' for everyone
      once UI-2..UI-4 exist; until then default 'classic' so nothing half-built shows), Settings →
      Appearance row "Look: Kindle-style / Classic", `useLook()` hook. Classic must stay exactly
      today's app (existing screen tests run against it).
- [x] UI-2 (9a80d40) Tokens and fonts. As built: `KINDLE_LIGHT` / `KINDLE_DARK` with a `look` field on
      `Palette`; `primary` = `accent` = navy (the preview's primary buttons are navy), and the shared
      controls in src/components/ui.tsx use ink where the preview does (selected chips, progress
      bars, current tab, header tint) when `c.look === 'kindle'`; Card / Button / Chip / Row /
      Section / Input / ProgressBar take the preview's shapes; `T serif` + `SERIF` names
      (Literata-Regular / -Italic / -SemiBold / -Bold, static TTFs from Google Fonts in
      assets/fonts with OFL.txt); the reader embeds WOFF2 subsets made by scripts/reader-font.py
      (src/reader/literata.ts, about 200 KB, only when the font is Literata); 'Literata' added at
      the end of READER_FONTS. Original text: a `KINDLE_LIGHT` / `KINDLE_DARK` Palette in src/theme (same field
      names as today so screens keep working; ink as `primary`/`text`, navy as `accent`), chosen by
      `useTheme()` when look = kindle. Literata: add the TTF files to assets/fonts (OFL licence
      file next to them) and load with expo-font's `useFonts` in the root layout (expo-font is
      already installed: JS only, no prebuild). Reader page font: embed Literata as an `@font-face`
      data: URI in the reader HTML (src/reader/template.ts) and add `font-src data:` to LOCAL_CSP
      (src/sources/local/adapter.ts) or the local reader will block it.
- [x] UI-3 (6556e4f) Generated covers. As built: src/theme/cover.ts (pure: `fnv1a`, `coverColour`,
      `coverBand`, `coverTitleSize`, `coverSiteLabel`), src/components/GeneratedCover.tsx (+
      `CoverFlag`), `Cover` takes `storyKey` / `author` / `flag` and draws a generated cover in the
      Kindle-style look when a story has no image (callers updated: StoryCard, Browse's Continue
      row, mini player, Now listening, story page). Original text: a `GeneratedCover` component (pure layout from title / author / site;
      the spine shade can be two or three Views with opacity, no gradient library needed) used by
      Cover.tsx whenever there's no image (and for local stories without a cover). A pure
      `coverColour(title)` with a test (stable, spread across all 9 colours).
- [x] UI-4 (e5f9303) Tabs. As built: `TABS` in src/app/(tabs)/_layout.tsx; order index, search,
      library, discover, updates, account, more; hidden ones get `href: null`; Home badge = stories
      with new chapters (ink). New tab routes `discover.tsx` (search field → `/find`,
      `BrowseCatalogue` from index.tsx, Clip callout; UI-9 restyles the catalogue) and `more.tsx`.
      Pushed copies of hidden tabs: `/find` (search), `/new-chapters` (updates; notifications use
      it in the Kindle-style look), `/fanfiction-account` (account). Original text: Home, Library, Discover, More when look = kindle (Tabs.Screen `href: null` hides
      a tab; keep the `updates`, `search`, `account` routes alive: notifications push `/updates`,
      src/components/miniPlayerLayout.ts lists tab routes). Classic keeps today's five.
- [x] UI-5 (e5f9303) Home: src/components/kindle/Home.tsx, shown by index.tsx when look = kindle;
      `readingSpot()` in src/state/library.ts (chapter, story % incl. place in chapter, words left).
      Original text: Home (new screen file, e.g. src/app/(tabs)/home.tsx or a branch in index.tsx).
- [x] UI-6 (8ae5e1d) Library. As built: src/components/kindle/Library.tsx (shown by library.tsx when
      look = kindle) + pure src/features/libraryFilters.ts. Chips: All (saved, read, downloaded or
      imported), New · n, Downloaded, Unread, In progress, Finished, Collections, then Follows,
      Favorites, Imported, Authors (sync bar on Follows / Favorites / Authors; Sync also in +).
      Grid / list choice stored as `AppSettings.libraryView`. Home's "See all" passes
      `?filter=new&at=<ms>`. Original text: Library: grid / list, filter chips, sort, "+" sheet; every current shelf still reachable.
- [x] UI-7 (2099901) Story page. As built: src/components/kindle/StoryPage.tsx, rendered by
      story/[id].tsx under the same header (save + ⋯) when look = kindle. The site slots
      (endorse / follow / discuss) are labelled icons after Listen / Download / Collection / Share;
      Details = `statCells` + Status, Rating, Language, Genres, Characters; Contents is a
      pageSheet Modal (reverse order, long-press menu kept). Original text: Story page (keep every slot action; Contents sheet; Details).
- [x] UI-8 (4b8641d) Reader controls. As built: src/components/kindle/ReaderChrome.tsx (`KindleTopBar`
      with back / title / Aa / find / bookmark / ⋯ (readerMenu kept), `KindleBottomPanel` with a
      custom chapter-tick scrubber (story position; another chapter opens at the place let go via
      `chapterProgress`), Contents / Previous / Listen / Auto-scroll (scroll mode) / Next,
      `KindleFooter`, `KindleTextSheet` (White / Sepia / Green / Black set `theme` and turn
      `matchSystem` off; More settings opens ReaderSettingsPanel 450 ms later). Template:
      `ReaderPayload.kindle` → `body.kindle`, `kindleHeading()`, `edge: 0.3` tap zones. Original
      text: Reader controls (hidden chrome, tap zones, footer line, top / bottom bars, scrubber
      with chapter ticks, Aa sheet, chapter heading fix). Keep blank-page recovery, bookmarks,
      find, auto-scroll, audiobook start, review end actions, clip-next end action.
- [x] UI-9 (2b91234) Discover and More. As built: src/components/kindle/Tiles.tsx (`CategoryTile`,
      `TileGrid`, `SectionHead`, `WashRow`) used by FfnBrowseHome (index.tsx; the five browse modes
      as chips, Misc last, Just In, "Your fandoms") and Ao3BrowseHome in the Kindle-style look;
      `SourceChips` becomes one Segmented switch there (Discover and Search). More was built in
      UI-5.
- [x] UI-10 (a16fe35) Done as written: `DEFAULT_LOOK = 'kindle'`; What's new 5 ("A calmer FicShelf",
      with a Kindle-style / Classic switch right there; the clipping news only for those who
      missed version 4); switching to a look that hides the current tab lands on the first tab
      (`hiddenTabRoute`). The user's saved reader font stays as it was (Georgia unless changed):
      Literata is one tap away in Aa. Original text: Make 'kindle' the default (classic stays in Settings), What's new card (bump
      WHATS_NEW_VERSION), README / FEATURES / MASTER_FEATURES, install message (T1).
- [x] UI-T (each step's commit) Tests per step: palette contrast (text 7:1, secondary 4.5:1, navy button text 4.5:1, both
      themes), coverColour, the look switch, tab set per look, Home rows (only non-empty), Library
      filters, reader tap zones / chrome toggle (react-test-renderer like tests/clip-screen.test.tsx).
      Keep all tests green (1290 after UI-10). Visual check after each step: `npx expo export --platform web
      --output-dir <dir outside repo>` then `node scripts/web-shots.cjs <dir> <shots dir> light`
      (and `dark`), compare with the preview, send the shots to the user (SendUserFile).


### acceptance (on the phone)
- [ ] UI-A1 Settings → Look switches between Kindle-style and Classic instantly; nothing is lost.
- [ ] UI-A2 Home opens on the story being read; Continue opens the reader at the right place.
- [ ] UI-A3 Every story shows a cover (real or generated); the Library grid / list / filters work.
- [ ] UI-A4 The story page shows everything it did before (FFN follow / review, AO3 tags, download).
- [ ] UI-A5 Reader: controls hidden until a middle tap; edge taps turn pages; Aa changes colour /
      size / font; the footer shows time left and %.
- [ ] UI-A6 Light and dark both look right; text is readable everywhere.

### out of scope for P-UI1 (P-UI2 later, ask first)
Loading skeletons, empty-state illustrations, a new app icon and splash, first-run onboarding,
rewriting long Settings texts, page-curl animation.

---

### 7.7 App and settings (`src/app/settings.tsx`, in order)
Appearance (theme, Look: Kindle-style / Classic, haptics) · Sources (FanFiction.net "Always on"; AO3 switch; Ask before showing adult
works; Hidden AO3 fandoms; Fold authors' notes; Wattpad "Coming soon" at line 160) · Reader (same panel
as Aa) · Browsing defaults (rating, language, sort, hidden fandoms) · New chapters (notifications,
check on launch, "Check at most every", auto-download, Wi-Fi only) · Imported files (Import a file,
count, space used, Keep original files) · Library & storage (count, downloads size, pre-upgrade copy,
Back up, Restore, Clear image cache, Clear page cache incl. AO3 fandom lists, Clear reading history,
Delete all downloads) · Connection (status, account, Run security check now, Reconnect, Connection
details) · About (version, disclaimer).

Also: ✅ in-app browser: fanfiction.net pages in FFN mode (`web.tsx`; shares cookies with the bridge;
opens story / profile links natively; other hosts go to Safari) and any other https page in open
mode with Clip (`docs/clipping/README.md` §6.8); deep links
`ficshelf://s/<id>/<chapter>`, `ficshelf://open?url=…`, pasted FFN URLs; iPad layout; accessibility
labels, Dynamic Type, VoiceOver-reachable mini player; Android APK builds via EAS (never tested on a device).

---

### 7.8 Other sites
⏳ Wattpad reading (P4), ⏳ Wattpad login (P7), ⏳ AO3 login (P6), ⏳ Novelpia source (optional,
P-NOVELPIA; Clip covers it). A pasted Wattpad link shows "Wattpad support is coming soon".

---

### 10.5 Modals and sheets
- iOS refuses to present a sheet while another modal is up and every later menu stayed stuck. →
  `SheetHost` clears a sheet that hasn't appeared after 1.5 s (`e2c8ac5`); voice / pause pickers close
  the reading-settings panel first and open 450 ms later; the import picker waits 300 ms for the sheet to close.
- The mini player covered content and toasts. → `useMiniPlayerInset()` / `miniPlayerLayout.ts`; toast zIndex 1100.
