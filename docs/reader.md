# Reader: features, pipeline, page mode and imported-book headings

> Read before touching src/app/read/[id].tsx, src/reader/*, ReaderWebView or reader settings. WebView lessons: docs/webview.md; Kindle reader controls: docs/ui_rules.md (UI-8).
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 7.4 Reader (all sources)
- ✅ Local WebView, works offline; themes light, sepia, paper, mint, dusk, dark, black (OLED) + match system;
  fonts System, Georgia, Palatino, Times, Verdana, Helvetica, Avenir, Charter, Courier; size, line /
  paragraph spacing, margins, width, alignment, hyphenation.
- ✅ Scroll or page-turn mode; tap zones; auto-scroll; brightness; keep awake (default on); immersive.
- ✅ Progress (chapter %, story %, time left), exact position per chapter, chapter drawer, jump.
- ✅ Bookmarks with notes and a list; find in chapter; iOS Look Up / Translate on selection.
- ✅ Review at the end of a chapter and follow / favourite from the reader (FFN); auto mark-read + manual.
- ✅ Blank-page recovery (`3321ff1`, `4b7f0ba`) 🧪: rebuild at the current position on
  `onContentProcessDidTerminate` / `onRenderProcessGone`, or when an "alive" probe gets no answer
  after returning (2.5 s loaded, 10 s loading), with a limit on endless re-terminations.
- Reader screen pipeline (`src/app/read/[id].tsx`): `usableSavedChapter` → saved copy → `fetchChapter`
  (saved with `remoteId`, next prefetched) → `segmentChapter(html).html` → `withBookImages(html, images, {webImages: !source.reader.csp})`
  → `buildReaderHtml(payload, settings, theme)`; WebView `source={{html, baseUrl: source.reader.baseUrl}}`,
  `originWhitelist={['*']}`; `onShouldStartLoadWithRequest` allows only `about:blank` or same-baseUrl
  non-click navigations; link taps → `openReaderLink(href, baseUrl)`.
- `ReaderPayload {html, title, chapterTitle, chapter, chapters, storyTitle, author?, hasNext, progress, endActions?, csp?}`;
  a `{nonce}` in `csp` gets a fresh nonce on the policy and both scripts; CSS vars `--bg --fg --muted --link --hl --font --size --lh --ps --margin --maxw --align --hyph`;
  page messages `progress, tap, next, action, bookmark, startBlock, ttsJump, find, link, ready, autoscrollEnd`;
  injected API `window.__init, __apply, __autoScroll, __find, __firstBlock, __listening, __page, __scrollTo, __ttsMark`.
- ⏳ Full-chapter AI translation (needs a third-party key); Android Auto.

---

### follow-up: EPUB reading (user, 2026-11-01)
User: "the title looks weird for chapter names, and when using page mode instead of scroll, why is
the swiping not immediate, instead its kind of like scrolling but horizontal, that's useless … I
want this to be seamless and user friendly kind of like the books app on apple and kindle".
- [x] EP-1 (663e36d) Page mode as page turns: `#wrap > #cols` columns moved by a transform (no native
      horizontal scrolling / scroll-snap); the page follows the finger, a flick (> 0.35 px/ms) or
      a drag past 20% turns one page with a 0.2 s slide, a short drag snaps back, edge taps turn at
      once; past the last page posts `next`, before the first posts `prev` (the app opens the
      previous chapter at its end: `openAtEnd`); resistance at the story's ends; restore waits for
      `document.fonts.ready`. tests/reader-paging.test.ts (jsdom, pretend 5-page layout; fails on
      the old template) + a Chromium touch run (CDP `Input.dispatchTouchEvent` on the web build;
      Chromium needs `--overscroll-history-navigation=0` or a right swipe navigates back).
- [x] EP-2 (663e36d) Imported chapters' headings: `numbered: false` for the local source (no invented
      "Chapter n" / "n."), `splitChapterTitle()` takes the title's own number ("Chapter One: The
      Deed" → CHAPTER ONE / The Deed), `ownHeading` (chapter HTML opens with h1–h4) prints no
      heading of the app's; "End of “Prologue”"; no "Loading chapter…" flash under 400 ms;
      the Kindle top bar drops the ⬇︎ marker.
- [x] EP-3 (663e36d) Import: contents entries / <title>s that are file names, or the book's own name in
      a book of several chapters, take the chapter's first heading, else "Chapter n"
      (`FILE_NAME_TITLE`, `total > 1`; corpus group `ui/titles` A–D, written failing first).
- [ ] EP-A On the phone: the user's EPUB in page mode (swipe, edge taps, chapter to chapter) and its
      chapter titles. Ask for a screenshot if a title still looks wrong.

### follow-up: the page left in page mode (user, 2026-11-02)
User: "When in page mode, the specific page i left on isnt what is saved … it has to do with
something how position was originally saved in scroll mode".
- [x] EP-4 (b4f5ce8) Page mode saves a place in the text, not a page number: `progress` is how far
      into the chapter's text the current page's first character is (`anchor()`: a binary search over
      the text nodes by their characters' rects, measured against `#cols` so a sliding page turn
      doesn't matter), and the last page is 1. Restoring finds the page that character is on now
      (`goFraction`, rounded to a whole character first), so a different page count (phone size,
      safe area, pictures, Aa, rotation) still opens on the same words. The place is kept exactly
      through layout changes (`held`, `settleTo`): resize, picture loads and checks at 0.3 / 1 / 2.5 s
      after opening (until the reader turns a page) go back to it; `__apply` measures before the new
      size or font applies. The stored number keeps its shape (`chapterProgress`): no migration;
      places saved by older builds read as text places, close to right once.
- [x] EP-5 (b4f5ce8) Page mode reopens the chapter it was opened on at its last page when that's
      where the reader was left (`resumeProgress(…, keepEnd)`); other chapters read to the end, and
      scroll mode, still open at the top.
- Lessons: a page number as a fraction of the page count (`page/(pages-1)`) is a scroll-mode idea
  and breaks whenever the count changes → save a text position. Measure the place **before**
  changing the layout. A rounded fraction can land a hair before a page's first character →
  round to a whole character before picking the text node (found in headless Chromium, pinned by
  tests/reader-paging.test.ts with page breaks at paragraph starts).
- Tests: tests/reader-paging.test.ts (fake text layout: characters flow over pages, --size changes
  the page count) 5 new, 3 failing on the old template; tests/kindle-reader.test.tsx 1 new (fails
  without the screen change). Headless Chromium run (scratch, not committed): page 10/85 left →
  same page at the same size; saved words on screen at 390×700, 430×932 font 22, 375×667 font 16,
  and after Aa 18 → 26; a place of 1 opens the last page.
