# File import (local source): pipeline, features, corpus, lessons, extras

> Read before touching src/import/, src/features/import*.ts, the import screen, or import heuristics (the corpus rules apply).
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 6.4 Local source and the import pipeline
- **Parse** (`src/import/`): `parseImport(bytes, fileName, {onProgress, signal}) → ImportedBook`.
  Limits `MAX_INPUT_BYTES` 100 MB, `MAX_UNCOMPRESSED_BYTES` 200 MB, `MAX_IMAGE_BYTES` 5 MB,
  `MAX_COVER_BYTES` 20 MB. `ImportError(code: unsupported|too-large|invalid|drm|empty|aborted, user message)`.
  - `sniff.ts sniffFile`: bytes first, name second → epub / html / txt / md; PDF, MOBI / AZW3, Word, web archives turned away with "get the EPUB" style messages.
  - `decode.ts decodeBytes[Async]`: BOM → HTML `<meta charset>` (utf-8, windows-1252, iso-8859-1) → valid or mostly-valid UTF-8 (stray bytes as cp1252) → cp1252; `replaced` flags garbled text.
  - `zip.ts`: own central-directory reader; declared total capped before inflating; entries streamed through fflate and stopped when they outgrow their declared size (zip bomb); names are lookup keys only (zip-slip).
  - `epub.ts parseEpub`: `container.xml` → OPF → manifest / spine → TOC (EPUB 3 nav, else NCX, else spine); a chapter runs from its TOC entry to the next (`cutAt` / `splitBefore` move nodes); AO3 / Calibre preface and afterword → metadata and notes asides; FicHub / FanFicFare front matter read for metadata; images → `ImageTable` (`ficshelf-zip:` keys) → `ficshelf-img:<n>`; `runsOn` one-shot rule (§10.12).
  - `html.ts parseHtmlFile` → private `parsePage(html, stepper, images): Promise<BookDraft>`: AO3 download (`ao3/parsers/download.ts`), saved AO3 work page (`ao3/parsers/work.ts`), saved FFN page (`ffn/parsers/story.ts`), FanFicFare, FicHub; else `webPage` = reader mode (`readability.ts readArticle`: Readability on JSDOMParser fed re-serialized well-formed markup, `{charThreshold: 300, keepClasses: false}`, restoring RN globals `SCRIPT_GLOBALS`; only up to `READER_MODE_MAX = 1_000_000` chars) with a whole-body fallback when reader mode drops chapters or prose (`keepsTheStory`, `partsOf`, furniture detection, `commentSections`); chapters cut at clear h1–h3 headings; `stripActive` removes script-ish tags and hidden-by-attribute / inline-style elements.
  - `text.ts`: `parseTextFile` (heading lines incl. Roman numerals guarded by `doubtfulNumeral` / `LONE_DASH`, FanFicFare's two-blank-line titles, re-joining hard-wrapped lines, `*emphasis*`, "Title / by Author" headers); `parseMarkdownFile` (`#` / `##` chapters; raw HTML shown as text).
  - `build.ts`: `ImageTable`, `importSanitizeOptions`, `sanitizeFragment`, `finishChapter`, `chapterFromHtml`, `splitParts` (`LONG_TEXT_WORDS` 30 000), warnings (`openingWarning`, `partsWarning`, `LEFT_OUT_MIN` 40), `Stepper` (progress, abort, pauses between chapters), `finishBook(draft, fileName)` (word count, title fallback, origin).
  - `dom.ts` (XML / DOM helpers, `CHAPTER_HEADING`, `ROMAN_HEADING`, `SCENE_BREAK`, `isChapterHeading`), `meta.ts` (dates, completion, languages, tags, summaries), `detect.ts` (`detectOrigin(url)` → `ImportOrigin {source: 'ao3'|'ffn'|'wp', remoteId, key}`, `originUrl`, `findStoryUrl`).
  - `ImportGenerator = 'ao3' | 'fichub' | 'fanficfare' | 'calibre' | 'ffn' | 'readability'`. `IMPORT_MIME_TYPES` (picker; MIME only).
- **Store** (`features/imports.ts`): `commitImport(book, file: ImportFile {name,size,contentHash,uri?}, CommitOptions {mode:'local'|'link', replace?, title?, authors?, keepOriginal?, onProgress?, signal?}) → StoryKey`.
  Local: `newLocalKey()` (`'local:' + base36 time + random`), `writeBookFiles`, `putMany` (replace stages and swaps), cleanup on failure; record `notify:false`, `downloaded:true`, `downloadedChapters`, `knownChapters`, `local: fileRecord(...)`; replace keeps progress / bookmarks via `mapChaptersByTitle` + `remapStoryState` + `remapStoryBookmarks` + `announceRemap`.
  Link: merges into the AO3 / FFN story (`putMany({merge:true})`), keeps progress / bookmarks / collections, then `refreshLinkedStory`. Every commit ends with `invalidate('story:'+key)`.
  Identity: `contentHash` (`md5:` from `File.md5`, else `fnv:` over bytes); `findDuplicate` by URL, identifier, hash; `normalizeSourceUrl`. `linkChoice` only for AO3 / FFN origins on an enabled site (Wattpad files stay local). `deleteImportedStory`. `keepOriginals()` (Settings → Imported files).
- **Files** (`features/importFiles.ts`): `Documents/imports/<key with ':'→'_'>/` with `original.<kind>`,
  `cover.<ext>`, `img/<n>.<ext>` (app's own names); replacement staged in `<dir>.new` (`swapInStaged` /
  `dropStaged`); `writing` set guards stories being written; `chapterImages`, `storyFileRef`
  (`ficshelf-doc:`), `writePreviewCover` / `removePreviewCover`, `importFilesBytes`, `isImportCopy`;
  `sweepImports()` at launch clears Inbox / DocumentPicker / preview copies older than 10 min not on a
  ticket, orphan import folders, `#staging` rows, and saved `local:` chapters with no library record.
- **Entry points**: `+native-intent.tsx` (Open-in `file://` → `/import?open=<ticket>`);
  `features/importHandoff.ts` in-memory tickets (`handOff`, `filesFor`, `release`, `inUse`; **the
  screen never takes a path from the route**); `features/importPicker.ts pickStoryFiles()`
  (expo-document-picker with MIME types only); `src/app/import.tsx` modal (per-file status, progress,
  preview, Link or Local, Replace or Keep both, skip one of several; files opened while it's up join the list; copies deleted after).
- **Reader for local stories**: `LOCAL_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'"`
  on `about:blank`; images stored as `<img src="ficshelf-img:<n>">`, `chapterImages` reads them into
  `data:` URIs, `withBookImages` swaps them in; web `<img>` removed under the CSP.
- Local stories never reach network code (tested), are never checked for updates, are not in backups.

---

### 7.3 Imported files (local source)
- ✅ Ways in: Library → + → Import a file (several at once), Settings → Imported files → Import a file,
  "Open in FicShelf" from Files / Safari / Mail (needs the `44a9f71` prebuild); tickets; Inbox copies deleted; leftovers swept at launch.
- ✅ Formats: EPUB (AO3, FicHub, FanFicFare, Calibre split files, Sigil, generic; nav / NCX; notes, tags,
  cover, pictures); HTML (AO3 downloads and saved pages, saved FFN pages, FanFicFare, FicHub; other
  pages get reader-mode cleanup up to 1 MB); TXT (chapter detection, unwrapping, "Title / by Author",
  stammer-vs-heading rules); Markdown. PDF, MOBI / AZW3, Word, web archives get a clear "use X instead".
- ✅ Import screen: progress (chapter N of M), preview (cover, title, author, chapters, words, tags,
  origin, warnings), editable title / author, multi-file status; every "Left out …" warning names roughly how many words.
- ✅ Linking a file from AO3 / FFN as that story (chapters as downloads, merged; site asked once;
  suggested when chapter counts agree; a linked AO3 file counts as current only when as new as AO3's text), or keep local.
- ✅ Duplicates (same story page, book id or file): Replace (keeps progress / bookmarks / collections; title then position) or Keep both.
- ✅ Local stories: Imported shelf, collections, bookmarks, Continue reading, library filter, offline
  reader and audiobook, file stats and original-site link on the story page; Delete removes text,
  pictures, file, bookmarks, collection entries and listening position; never checked for updates, never touch the network.
- ✅ Safety: allowlist sanitizer, `about:blank` + CSP reader, zip-slip and zip-bomb guards, size caps, no slow regexes, inline images stored as files.
- ✅ Storage: chapters like downloads; original file (Keep original files, on by default), cover and
  pictures in `Documents/imports/<story>/` by relative path; Settings shows space used and "only on this device, not in backups".
- ✅ Pinned by the golden corpus (299 cases + 1 todo). 🧪 Import has never been run on the device.
- Known open minor cases: `docs/known_issues.md` §11 (ISSUE-M1, D3, G5, NEST).
- ⏳ Not picked by the user: EPUB export, full backup with imported stories, FicHub / link import,
  Wattpad linking (Wattpad files import as local stories, link kept), share extension, web pictures inside an imported page (P-IMPORT-X).
- ✅ 🧪 **"Clip this page"** for any https website (`docs/clipping/p-clip.md` §4, approved 2026-10-21, built 2026-10-27):
  open mode of the in-app browser (`src/app/web.tsx`, rules in `src/net/webPolicy.ts` / `webHosts.ts`),
  capture script `src/net/clipScript.ts` (hidden elements found on the live page, dropped from an inert copy;
  scripts, inline data, form fields and token-carrying attributes left behind), `src/import/clip.ts`
  `parseClip` (reader mode, text only, site name off the title), `src/features/clips.ts` (new story, next
  chapter, undo), `LocalOrigin.clip`, ClipSheet preview, menus, What's new v2, "Send links from Safari".
  Works on the phone (2026-10-27, "perfect it works perfectly now"); CLIP-A1..A9 not reported one by one.
- ✅ 🧪 **P-CLIP3** "Clip a whole story" in the background (paste a first chapter; banner for logins / checks; Clipping screen; resumes after relaunch) and text in web components / frames (`docs/clipping/README.md` §4b; 2026-10-29; tests + headless Chromium only).
- ✅ 🧪 **P-CLIP2** "Clip & next", "Clip the next N chapters", "What Clip sees", Settings → Clipping
  (`docs/clipping/p-clip2.md` §4a; built 2026-10-27; tests + headless Chromium only). ⏳ Clip polish
  (scroll-loaded text, same-origin frames, shadow DOM) after the user's reports (AC-11).

---

### 8.5 The golden import corpus (`tests/import-corpus.test.ts` + `tests/helpers/corpus.ts`)
- Why: three verify → fix rounds on import heuristics oscillated (each fixed one shape and broke another). The corpus pins the right result for every scenario found.
- 266 cases at creation, 269 at `49442b7`, **299** at `5cc19e8`, in 21 `describe` groups named after
  repro scripts (`vp/`, `rv/`, `r1/`–`r4/`, `speed:`), plus `it.todo('r1/nest: …')` at line 2555.
- **The four rules** (file header; apply to every heuristic change):
  1. Never lose story text silently: anything left out (front matter, comments, furniture) is named in
     a warning with about how many words; under `LEFT_OUT_MIN = 40` (title, byline) no warning needed.
  2. When genuinely ambiguous, keep the older trees' behaviour plus a warning rather than a new heuristic.
  3. Prefer removing or narrowing a rule over adding one; every rule is justified by a corpus case.
  4. No synchronous stretch over about 1 s for inputs under the limits; no O(n²) over TOC entries or lines; push, don't spread, in loops.
- Case fields: `name` (cites where it came from), `file` (extension picks the parser), `input: () => Uint8Array | string`,
  `why` (required wherever trees or opinions disagree), `title`, `authors`, `origin`, `sourceUrl`,
  `generator`, `summary`, `chapters` (titles; RegExp when several are right), `count`, `words` (per
  chapter ±max(5, 3%); `null` skips), `total`, `has`, `inChapter: {index: [...]}`, `lacks`, `html`,
  `warn` (`'none'` or RegExp), `leftOut: {words, of}` (±max(5, 5%)), `keptOrWarned: {has, words, of}`,
  `ms` / `stall` (usual bounds `ms: 3000, stall: 1500`; 5000 for the 585k-word TXT; measured with a 2 ms interval),
  `extra` (`inOrder(...)`, `allParts`), `timeout` (default 20_000; 60_000 for crafted perf cases).
  `runCase` throws if `leftOut` / `keptOrWarned` asks for under 40 words; compares all in one `toEqual` diff.
- Adding a case: reproduce → add → **show it fails on HEAD** → fix. Change an existing expectation only
  when it contradicts the rules, and say why in `why` and the commit. Keep the corpus under about 25 s.

---

### 10.12 Import heuristics
The verifier rounds after `16eaf18` oscillated:

| Round (commit) | Fixed | Broke or found next |
|---|---|---|
| verify of `16eaf18` | 27/28 | Stammer fix half-done ("I - I don't know." still a heading); reader-mode coverage kept only the longest section; WordPress body classes ("right-sidebar") marked the page as furniture; "1-Storm" no longer a heading; wrapped first paragraph taken as "Title / by Author"; Markdown `[` lines froze import (48 ms per line) |
| r1 (`99f38f9`) | 10/10 | `loneNumeralTitle` too strict; Tumblr reblog notes imported; `partsOf` O(words × depth) froze nested pages |
| r2 (`99f38f9`) | 6 | `frontPaths` took whole files, so a Calibre-split one-shot **lost 1,000–2,000 words**; author's-note links became the origin; comment-posted story parts dropped silently; quadratic loops |
| r3 (`3212230`) | 8 | `runsOn` merged books with non-h1–h3 chapter files; a long reader comment rejected reader mode; `storyOf` cut a rescued prologue's opening; a new rule demoted a real "V. …" heading |

Why: each fixer added a rule for the reported shape with nothing guarding earlier shapes. Fix: the
golden corpus (§8.5) built from every repro, with disputed expectations settled by running against
snapshots of every tree (`44a9f71`, `16eaf18`, round 1, `99f38f9`, `3212230`; failures fell 136 → 90 → 69 → 49 → 39).

| What happened | Rule |
|---|---|
| A one-shot was decided by **the first line of later files** (`runsOn`); a Calibre split file opening "No." was cut into 'x' chapters; a "Start"-only TOC with bold-line titles merged into one chapter | **Decide one-shots by metadata**: run on only when the single TOC entry equals the book title or fields say `Chapters: 1/1` (`5cc19e8`); else one chapter per file + "The table of contents didn't match the text" |
| Corpus EPUBs all had the placeholder title "T", so the title signal never fired in tests | Synthetic fixtures need realistic metadata (`dc:title`, AO3-style fields); `epub()` takes `meta` |
| Front matter decided by title (Preface / Afterword one-shots couldn't import), then by whole file (lost story), then by part | Decide by content (copyright, link and fields pages); a file is front matter only when *every* TOC entry in it is; short text sharing chapter 1's file is kept; title / cover / Information pages in their own file stay front matter **with a counted warning**; `titleLines` drops only heading, title, byline, ©, "Disclaimer…" and `Key: value` lines; a whole `<br>` block isn't a title line |
| Stammers ("I... I don't know.", "I - I…", "V – very well.") became headings, then fixes rejected real Roman headings | `isChapterHeading` / `doubtfulNumeral` (`src/import/dom.ts`) + `text.ts`: a surer heading ("V. Vows are made.") beats a nearby doubtful stammer; "1-Storm", "1.Storm" are headings; "10-year-old", "5...", "1.5" are prose |
| Reader mode dropped sections, rejected pages for a long comment, or kept chrome | `keepsTheStory()` compares article and body; comments never count against reader mode; a dropped comments section with 300+ running words gets "Left out the page's comments … about N words"; theme body classes are never furniture; ignore `<select>` / `<option>` / `<button>` / `<textarea>` text; reader mode only up to 1,000,000 chars |
| Text before the first heading in TXT / MD / HTML dropped silently | Keep it or name it in a counted warning |
| A linked AO3 file older than AO3's text blocked downloading newer text | `linkedFileVersion()` records AO3's version only when counts match and the file isn't older |

---

### 10.13 Import performance (all fixed; keep them fixed)
- `partsOf` counted words at every nesting level (O(words × depth)) → count once (`wordCounts()`).
- 17–64 s freezes: `starts.indexOf` / `splice` per removal in TXT; `findOne` per TOC entry; spread
  copies in `entriesIn`; `splitBefore` re-linking every later sibling → mark-and-filter once, per-file
  id indexes, push only, splice once.
- Markdown regexes (`\*\*(?=\S)(.*?\S)\*\*`, link patterns) were quadratic on long `[` / `*` lines.
- `parseEpub` rendered and counted every chapter in one synchronous pass; a heading-less file became one
  unbounded chapter → yield between chapters (`Stepper`), split heading-less books into parts, write each chapter as parsed.
- `data:` images skipped the 5 MB cap and cost ~1 s per MB in the sanitizer; the preview cover was
  base64-encoded in JS during render → store images as files; cap `data:` URIs.
- jest runs about 3× slower than `tsx` → corpus bounds under jest: < 3000 ms total (5000 for `vp/stall`), stall < 1500 ms (2000 for p7 / p7b).

---

### 10.14 Import flow and security (`16eaf18`)
- A `ficshelf://import?file=…` link could point the screen at any file and delete it on failure; a regex
  guard was bypassable with `Documents/Inbox/../SQLite/<db>`. → One-time tickets only; **never take a file path from a route param**.
- The launch sweep deleted an Inbox copy being imported (iOS copies keep the original mtime). → Never decide "leftover" by mtime alone; ticketed files are in use.
- `file://` URLs were percent-decoded twice (router query parsing, then `useLocalSearchParams`), breaking names with `#`, `?`, `%`. → Tickets; test odd file names.
- Deleting an imported story while its reader was still mounted let the reader's next progress message (`upsertStory` with `create: true`) re-create a ghost. → Deletes must stop or ignore late writers.
- A second "Open in" while the import screen was focused arrived as a params update and was dropped. → Queue it.
- A linked import stored `downloaded: true` without `downloadedVersion`, so the first update check re-downloaded the whole AO3 work. → Linking must not cause automatic site traffic.
- expo-document-picker silently drops UTI strings (`UTType(mimeType:)` + `compactMap`) and always opens `asCopy: true`. → **MIME types only** (`IMPORT_MIME_TYPES`); delete cached copies; same for the backup picker in `settings.tsx` (still uses `'public.json'`: fix in P-IMPORT-X).

---

## 9. P-IMPORT-X: import extras the user did not pick

```yaml
id: P-IMPORT-X
title: Import extras (EPUB export, .ficshelf backup, FicHub, share extension)
status: only-if-asked
order: 6
depends_on: [P5 (done)]
approved_by_user: >-
  No. On 2026-10-08 the user picked EPUB + HTML/TXT import and did NOT pick "Links from other
  sites" or "Backup / export".
native_rebuild: EPUB export and FicHub no; .ficshelf Open-in yes; share extension yes (+ an App ID)
```

### why
Imported (and clipped) stories exist only on the phone and are not in backups; no export.

### scope
- [ ] IMPX-1 EPUB export (no prebuild): `src/import/exportEpub.ts` `writeEpub(story, chapters, images): Uint8Array`,
      EPUB 3 via fflate `zipSync`: `mimetype` stored first and **uncompressed** (`level: 0`,
      `application/epub+zip`); `META-INF/container.xml` → `OEBPS/content.opf` with `dc:identifier`
      (`urn:uuid:`), `dc:title`, `dc:creator`, `dc:language`, `dcterms:modified`, `dc:source` (story URL
      when known), manifest, spine, `properties="cover-image"`; `OEBPS/nav.xhtml` (`epub:type="toc"`);
      one XHTML per chapter, notes as `aside`; a title page with "Original source: <a>". A research
      prototype passed EPUBCheck 5.3.0 with 0 errors / 0 warnings; it isn't in the repo: rebuild to
      that structure and re-validate. Share with `Sharing.shareAsync(uri, {mimeType: 'application/epub+zip', UTI: 'org.idpf.epub-container'})`.
      Scope: local stories by default; for AO3 works offer **"Download EPUB from AO3"** instead; FFN and
      Wattpad export is OQ-6 (default no).
- [ ] IMPX-2 `.ficshelf` full backup: a zip (fflate) with `backup.json` (`BackupFile`, new version),
      `chapters/<key>/<n>.html` and `imports/<dir>/*` for local stories (**clipped stories included**),
      optionally site-story downloads (off by default). Restore through "Open in FicShelf" (`sniff.ts`
      sees a zip containing `backup.json`). `app.json`: `CFBundleDocumentTypes` adds
      `com.ficshelf.backup` (Editor / Owner) and `UTExportedTypeDeclarations` declares it with
      extension `ficshelf` → **prebuild**. The old `.json` backup stays importable. Fix the backup
      picker in `src/app/settings.tsx` to use MIME types, not `'public.json'` (expo-document-picker
      drops UTI strings). Keep "Imported stories exist only on this device" until this ships.
- [ ] IMPX-3 FicHub opt-in (no prebuild): `GET https://fichub.net/api/v0/epub?q=<url-encoded story URL>` →
      `{err:0, urlId, info, meta:{title, author, authorUrl, chapters, words, status, created, updated, description, source, rawExtendedMeta}, hashes:{epub:<md5>}, urls:{epub, html, mobi, pdf}}`;
      download `'https://fichub.net' + urls.epub` → `parseImport`; also `/api/v0/meta?q=`. FicHub's
      "Unstable API" rules: custom UA with contact (`POLICIES['fichub.net'].userAgent` is already
      `FicShelf/1.0 (personal reader app; +https://github.com/Carnyte/mhm)`), no concurrent requests,
      honour 429 / Retry-After, no exporting a large fraction of a site; v0 may change; content may be
      stale. Store `fichubId` (`urlId`) and `fichubHash` (`hashes.epub`) in `LocalOrigin` (+ `normalizeLocal`);
      re-check only on request. Sites: SpaceBattles, SufficientVelocity, QuestionableQuesting (XenForo),
      FFN, FictionPress, AO3, HPFanficArchive, SIYE, AdultFanfiction.org, Worm/Ward and others; **not**
      Wattpad or Royal Road. Opt-in toggle, off by default.
- [ ] IMPX-4 Share extension (prebuild, App ID, Xcode signing): `expo-share-intent` 8.0.1 (SDK 57 →
      8.0+; peers `expo ^57`, expo-linking ≥57.0.1, expo-constants ≥57.0.3); native Swift, writes to App
      Group `group.<bundleId>`, opens `<scheme>://dataUrl=<scheme>ShareKey?nonce=…#<type>`; adds
      `com.apple.security.application-groups` and target `<bundleId>.share-extension`;
      `iosActivationRules` WebURL, WebPage, Text, File. Free-ID cost: one more App ID (10 per 7 days),
      setting the Team on the ShareExtension target after **every** prebuild, App Group under the
      Personal Team; scene-lifecycle compatibility unverified. **Recommended instead**: the Shortcut +
      bookmarklet help page (CLIP-16).

### files
`src/import/exportEpub.ts`, `src/state/library.ts` (BackupFile), `src/import/sniff.ts`,
`src/app/import.tsx`, `src/app/settings.tsx`, `app.json`, `src/features/fichub.ts` (new),
`src/db/migrations/v2.ts` (`normalizeLocal` fields).

### data / API details
In scope above.

### policies
FicHub opt-in, one request at a time, contact UA; backups never include cookies or session data.

### tests
- [ ] IMPX-T1 `tests/export-epub.test.ts`: export → `parseImport` round trip (titles, words, images equal).
- [ ] IMPX-T2 `tests/backup-zip.test.ts`: round trip; hostile zip (zip-slip, zip bomb) refused; v1 / v2 JSON still accepted.
- [ ] IMPX-T3 FicHub fake transport: one request at a time, 429 honoured, opt-in respected.

### acceptance
Per item with the user.

### install_notes
IMPX-1 / IMPX-3: T1. IMPX-2 / IMPX-4: T2 (prebuild); IMPX-4 also needs the extension target's signing in Xcode.

### risks
App ID budget on a free account; FicHub API instability; backup size.

### open_questions
| id | question | default |
|---|---|---|
| OQ-6 | EPUB export of downloaded site stories? | Only imported files; for AO3 link to AO3's own EPUB |
| OQ-8 | Import defaults | Built: keep originals on, ask to link AO3 / FFN files. Full backup: imported text always, site downloads off (not built) |
| OQ-9 | Links from Safari | Shortcut + bookmarklet (CLIP-16); share extension only on request |
| OQ-10 | FicHub and clipping for other sites | Clip approved (P-CLIP); FicHub opt-in, only if asked |
