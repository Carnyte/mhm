# Data model and storage: keys, model, library, settings, SQLite, migrations, remapping

> Read before changing stored data, settings fields, keys, migrations or chapter numbering.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 5. Data model and storage

---

### 5.1 Story keys (`src/sources/keys.ts`)
- `SOURCE_IDS = ['ffn','ao3','wp','local'] as const`; `type StoryKey = \`${SourceId}:${string}\``.
  Examples `'ffn:123'`, `'ao3:94201446'`, `'wp:404053457'`, `'local:lx3k9f2a8q'`.
- `SOURCE_NAMES`: `{ffn:'FanFiction.net', ao3:'AO3', wp:'Wattpad', local:'Imported file'}`.
- `REMOTE_ID` (private): ffn, ao3, wp `/^\d{1,15}$/`; local `/^[a-z0-9_-]{1,64}$/i`.
- Helpers: `isSourceId`, `toKey(source, id)`, `splitKey(key)` → `{source, remoteId}`, `sourceOfKey`,
  `normalizeKey(x)` (`123 | '123' | 'ffn:0123' | 'AO3:5'` → canonical or `null`; trims leading
  zeros, lower-cases the prefix), `isStoryKey`, `keyFromParam(p)` (URL-decodes; bare number = FFN),
  `authorKey({source,id})`, `compareKeys` (source, then numeric id).
- Remote ids are opaque strings; only a site's own code turns them into numbers (`check-keys.ts`).

---

### 5.2 Site-neutral model (`src/sources/types.ts`)
- `RouteHref {pathname, params?}`; `AuthorRef {source, id, name, avatarUrl?}` (FFN '123', AO3 'user/pseud', Wattpad username).
- `Tag {kind: fandom|rating|warning|category|relationship|character|freeform|genre, label, id?}`;
  `StoryStats {reviews,favs,follows,kudos,hits,bookmarks,comments,reads,votes}` (all optional).
- `ChapterInfo {number, title, remoteId?, published?, words?, locked?: {price?}, abbreviated?}`.
- `StoryMeta {key, source, remoteId, url, title, author?, coAuthors?, summary, coverUrl?, fandom?, fandoms?, isCrossover?, rating?, language?, genres, characters?, tags?, chapters, plannedChapters?, words, stats, updated?, published?, complete, restricted?, mature?, paywalled?, version?, ao3?: {downloadHtmlHref?, guestComments?}}`.
  Times are Unix seconds. `version` is AO3's `updated_at`: a saved copy is stale; never "new chapter".
- `StoryInfo extends StoryMeta {chapterList, coverLargeUrl?, series?: SeriesRef[], ffn?: {storyTextId?, breadcrumbs?, slug?}, wp?: {lastPublishedPartId?, modifyDate?}}`; `SeriesRef = {id,title,part,prevId?,nextId?}`.
- `ChapterContent {number, title?, html (sanitized), notesBefore?, notesAfter?, remoteId?, story?: StoryInfo, ffn?: {storyTextId?}}`.
- `UpdateResult {key, info?, meta?, chapterIds?, chapterTitles?, chapters?, changed, redownload?, gone?, restricted?, error?}`.
- `FetchOpts {quiet?, signal?, priority?: 'user'|'background'}`; `UpdateCheckOpts {deadline?, onResults?}`; `DownloadOpts {knownVersion?, onInfo?}`.
- `LinkHit`: `story {id, chapter?, chapterRemoteId?, url?}` | `part {partId, url?}` | `author {id, url?}` | `route {href, url?}` | `web {url}`, each with `source`. `SearchQuery {text, [field]: unknown}`.

---

### 5.4 Library (`src/state/library.ts`)
- `LibraryStory` metadata: `{key, source, remoteId, title, author?: LibraryAuthor {id: number|string, name, avatarUrl?}, summary, fandom?, isCrossover?, rating?, language?, genres, characters?, chapters, words, stats, updated?, published?, complete, coverUrl?, chapterTitles?, chapterIds?, coAuthors?, fandoms?, tags?, plannedChapters?, series?, restricted?, mature?, version?, downloadedVersion?}`.
  **`chapterIds` is written only through `applyChapterIds`.**
- Per-source bags: `ffn?: {storyTextId?}`, `ao3?: {adultOk?}`, `local?: LocalOrigin`; `id?: number` = FFN legacy numeric id (read `key`, never `id`).
- State: `inLibrary, followed?, favorited?, downloaded?, downloadedChapters?, lastReadAt?, lastChapter?, lastProgress?, readChapters?, chapterProgress?: Record<string,number>, knownChapters?, lastCheckedAt?, gone?, addedAt, notify?`.
  `newChapterCount(s) = max(0, chapters - (knownChapters ?? chapters))`.
- `LocalOrigin {kind: 'epub'|'html'|'txt'|'md', fileName, generator?, importedAt (ms), size, contentHash ('md5:…'|'fnv:…'), sourceUrl?, origin?: ImportOrigin, identifiers?, chapters?, updated?, dir ('imports/local_<id>'), original?, cover?, images?: Record<index,'img/<n>.<ext>'>}`;
  rebuilt by `normalizeLocal` on load: only the app's own path shapes survive, never `..`, and **unknown fields are dropped**.
- `Bookmark {id, storyKey, storyId? (legacy), storyTitle, chapter, progress, note?, excerpt?, createdAt}`;
  `Collection {id, name, storyKeys, storyIds? (legacy), createdAt}`; `SavedAuthor {key (authorKey), source, id, name, avatarUrl?, followed?, favorited?, storyCount?}`;
  `Draft`; `RecentSearch {source, keywords, type, at}` (`RECENT_SEARCHES_PER_SITE = 20`).
- `AnyStory = StorySummary | StoryDetail | StoryMeta | LibraryStory`; `isLibraryStory` = key and no url; `isStoryMeta` = key and url; `keyOf`, `statsOf`.
- Store `{stories: Record<StoryKey,…>, bookmarks, collections, authors, drafts, searches, lastSync?}`; hooks `useLibrary`, `useLibraryStory`, `reloadLibrary`.
- Mutations: `upsertStory(src, patch, {create})`, `patchStory(key, patch | fn)`, `removeStory`, `setInLibrary`,
  `recordReading`, `markChapterRead`, `markAllRead`, `acknowledgeUpdates`; derived `linkedFileVersion`,
  `newChapterCount`, `unreadCount`, `storyProgress`; `clearHistory`, `syncAccountList`, `syncAuthors`,
  `setAuthorFlag`, `setLastSync`; bookmarks `addBookmark`, `removeBookmark`, `removeBookmarksOf`,
  `remapStoryBookmarks`, `updateBookmarkNote`; collections `createCollection`, `renameCollection`,
  `deleteCollection`, `toggleInCollection`; `saveDraft`, `deleteDraft`, `addRecentSearch`, `clearRecentSearches`;
  `exportBackup`, `importBackup`, `BACKUP_VERSION = 2`.
- `upsertStory` rules: undefined metadata fields are dropped (partial list data never wipes richer
  data); shortened AO3 titles never replace full ones (`withKnownTitles`); metadata `chapterIds`
  ignored when the record has ids; **`ffn` and `ao3` bags are merged, not replaced (add new site bags
  there)**; a record failing `keep()` (`inLibrary || followed || favorited || downloaded || lastReadAt`)
  is deleted; `persistStory` writes `story:<key>` (FFN also a numeric `id`).
- Backups: `exportBackup` leaves out local stories, their bookmarks and collection entries (`isImported`),
  and passes records through `portable()` (drops `local`, `downloaded:false`, strips `ficshelf-doc:` covers);
  `importBackup` accepts v1 files and refuses newer versions.
- kv keys: `story:<StoryKey>`, `author:<authorKey>`, `bookmarks`, `collections`, `drafts`, `searches`,
  `lastSync`, `settings`, `listenPositions`, `myUser`, `session:ao3` (`{username, checkedAt}` only: no cookie, token or password; not in backups), `schemaVersion`, `migration:v2`, `unreadable:<oldKey>`.

---

### 5.5 Settings (`src/state/settings.ts`)
- `AppSettings`: `appearance, look? ('kindle' | 'classic', missing = DEFAULT_LOOK 'kindle'; lookOf / useLook / LOOK_LABELS), libraryView? ('grid' | 'list'), defaultRating, defaultLanguage, defaultSort, notifications, checkIntervalHours (6), autoDownloadUpdates, wifiOnly, checkOnLaunch, haptics`; `excludedFandoms` (FFN), `pinnedFandoms: {source,name,path}[]`; `sources: Record<SourceId, SourceSettings>`; `reader: ReaderSettings`; `lastUpdateCheck?`, `lastUpdateCheckBySource?`; `onboarded?`, `browseSource?`, `searchScope?`, `whatsNewSeen?`, `settingsVersion?`.
- `SourceSettings {enabled, askAdult? (AO3), hiddenFandoms? (non-FFN), keepOriginals? (local)}`.
  `DEFAULT_SOURCES`: ffn on, ao3 `{enabled:true, askAdult:true}`, wp off, local on. `SETTINGS_VERSION = 2`; `migrateSettings` turns AO3 on once for settings older than 2.
- `ReaderSettings` includes TTS options `ttsRate`, `ttsPitch`, `ttsContinue`, `ttsMixWithOthers`, `ttsReadTitles`, `ttsPauses: off|natural|long`, `ttsSkipNotes` (default true), `collapseNotes`.
- `settingsStore` saved to kv `settings` on every change; `updateSettings`, `updateReader`, `updateSource`, per-site hidden fandoms, `togglePinnedFandom`.

---

### 5.6 SQLite storage (`src/db/kv.ts`)
- `ficshelf.db` (expo-sqlite, `Documents/SQLite/`), opened lazily with `PRAGMA busy_timeout = 5000`, `PRAGMA journal_mode = WAL`, `SCHEMA_SQL`, then `runMigrations`.
- Tables: `kv(key TEXT PK, value TEXT)` (JSON); `chapters(story_id INTEGER, number, html, saved_at)` (v1, **kept and emptied every launch** so an older build can still write); `chapter_text(story_key TEXT, number INTEGER, html TEXT, saved_at INTEGER, remote_id TEXT, PK(story_key, number))`; `http_cache(key PK, body, etag, fetched_at)`.
- `kv`: `writable` (false after a failed migration: every write is a no-op), `getSync`, `prefixSync`, `entriesSync(prefix)`, async `set`, `delete`, `deletePrefix`.
- `chapterStore`: `get(key,n)`, `getRow(key,n) → {html, savedAt?, remoteId?}`, `put(key,n,html,remoteId?)`;
  `putMany(key, rows, {replace?, merge?, batch=20, onProgress, signal})` (multi-row `INSERT OR REPLACE`,
  `setTimeout(0)` yield between batches; with `replace` / `merge`, rows staged under `${key}#staging` and
  swapped in one `withExclusiveTransactionAsync`; staging deleted on failure); `storyKeys(prefix)`,
  `removeStaging()`, `list(key)`, `remove(key)`, `removeAll(keep?)` (`'local:'` kept), `sizeBytes(key?)`;
  `renumber(key, Map<old, new|null>)` (one exclusive transaction; parks rows on negative numbers first; null deletes).
- `httpCache`: `get`, `put`, `clear` (lifetime decided by the caller; AO3 7 days).
- Migration state: `migrationStatus()`, `retryMigration()`, `copyDatabaseForSharing()`, `snapshotInfo()`, `deleteSnapshot()`, `SNAPSHOT_NAME = 'ficshelf-pre-v2.db'`.

---

### 5.7 Migration v2 (`src/db/migrations/v2.ts`, `migrateV2`)
1. Precheck: needs `2 × dbBytes + 20 MB` free; if short → `{ok:false, lowSpace:true}`, nothing changed.
2. Snapshot `ficshelf-pre-v2.db` via `backupDatabaseSync`, only if `free > need + db + 50 MB` and the db has rows; deleted 30 days later (`expireSnapshot`).
3. One `withTransactionSync` around `moveLegacy({blobs:true})`: `story:<n>` → `story:ffn:<n>` (merged with any v2 row), `author:<n>` → `author:ffn:<n>`, chapters copied into `chapter_text`; blobs `bookmarks`, `collections`, `listenPositions`, `searches`, `settings` converted; read-back checks (title, read chapters subset, downloaded chapters, lastReadAt, chapter progress, flags, chapter rows and bytes byte for byte); any failure throws `MigrationError` and rolls back; rows naming no story kept as `unreadable:<key>`; writes `migration:v2 {at, snapshot, counts}` and `schemaVersion: 2`.
4. After success: `wal_checkpoint(TRUNCATE)`, then `VACUUM` 5 s later (unref'd timer).
5. Every later launch runs `drainLegacy` (merges v1-shaped rows an older build wrote).

Safety rules (keep them): migrations never throw (return `MigrationResult`); when not ok nothing is
written and the root shows `MigrationFailed` (Retry, share a database copy); transforms pure,
idempotent and re-run on read; unknown fields kept (`normalizeStory`; but `normalizeLocal` is an
allowlist); old builds keep working (FFN rows keep numeric `id`, bookmarks `storyId`, collections
`storyIds`, notifications accept `{storyId}`, v1 `chapters` table stays); tests run migrations on real SQLite (`tests/helpers/sqliteNode.ts`).

---

### 5.8 Chapter-id remapping (`src/sources/remap.ts`, `src/features/chapterIds.ts`)
- `ChapterRemap {moves: Record<old,new>, removed: number[], changed}`; `remapChapters(oldIds, newIds)`
  (matched by id; an unknown old id keeps its number while it still exists); `remapNumber`,
  `nearestSurviving` (nearest earlier surviving chapter, else 1), `remapNumbers`, `remapRecord`;
  `remapStoryState` (moves `readChapters`, `downloadedChapters`, `chapterProgress`, `lastChapter`; a gone
  chapter resumes at the start of the nearest earlier one); `remapBookmarks`; `remapPosition` (drops an
  audio position whose chapter is gone).
- `applyChapterIds(key, ids)` is the **only writer** of `LibraryStory.chapterIds`: no-op when not in
  library or equal; first sight stores; otherwise `chapterStore.renumber`, patch state, remap titles
  ("Chapter N" for unknown), `remapStoryBookmarks`, `announceRemap` (listeners via `onChapterRemap`).
  Called from `fetchStory` / `fetchChapter`, download `onInfo`, update results. FFN has no chapter ids.
- Imports: `mapChaptersByTitle(oldTitles, oldCount, newTitles)` in `features/imports.ts` (title, else position) when replacing a local story.

---

### 10.6 Storage, keys and migration
- FFN and AO3 share ids (3171550). → `StoryKey` everywhere; `keyFromParam()`; `check-keys.ts` in lint.
- v2 migration review findings (`afafdf2` → `57ec6be`): one damaged `story:0` row failed the upgrade
  every launch; the space check counted 2× while the real cost is about 3× (snapshot + WAL + checkpoint);
  `INSERT…SELECT` + `DELETE` left the file doubled (no VACUUM, WAL never truncated); `open()` cached a
  half-opened db (a hole in "writes blocked until migrated"); dropping the numeric `id` broke an older
  build reading `stories[s.id]`. → One transaction with count and byte verification; `unreadable:<key>`
  instead of throwing; free-space check first (`bytesNeededToConvert`); snapshot only with room;
  `wal_checkpoint(TRUNCATE)` + deferred VACUUM (unref'd timer); `kv.writable` false until success
  (`MigrationFailed`); stay readable by the previous build; drain legacy rows each launch; user backs up first.
- `withExclusiveTransactionAsync` opens a **second SQLite connection**; neither had a busy timeout, so
  writes failed "database is locked" during import batches. → `PRAGMA busy_timeout = 5000`.
- The web store (`kv.web.ts`) silently fell back to memory on quota and then removed the original rows. → Never remove source rows unless the copy is stored for good.
