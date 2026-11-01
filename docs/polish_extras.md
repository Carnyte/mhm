# P8 spec: polish and optional extras

> Per-item, user interest first. Read before starting any P8 item.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 8. P8: Polish and optional extras

```yaml
id: P8
title: Polish and optional extras
status: pending
order: 5
depends_on: [P4 for "All" search; other items independent]
native_rebuild: no (except the share extension, which lives in P-IMPORT-X)
approved_by_user: none; each item needs the user's interest before building
```

### why
Quality-of-life items from the design that the user hasn't asked for yet.

### scope
- [ ] POL-1 "All" federated search (`src/app/(tabs)/search.tsx`): one request per enabled source,
      **only on submit**, a section per source, no paging until asked.
- [ ] POL-2 "Find on another site": search other sources by title + author; on confirmation move
      reading progress, mapping chapters by title then number (reuse `mapChaptersByTitle` from
      `src/features/imports.ts` and `remapStoryState` from `src/sources/remap.ts`).
- [ ] POL-3 AO3 creator's style (work skins) toggle: fetch the skin `<style>` from
      `?view_full_work=true` when turned on for a work; sanitize the CSS (scope under `#workskin`;
      drop `url()`, `@import`, `position: fixed`, `expression()`); store it with the download.
- [ ] POL-4 Optional offline images: at download time save AO3 / Wattpad chapter images
      (img.wattpad.com is public; AO3 images are on arbitrary hosts) into a per-story folder as
      `img/<n>.<ext>`, swapped in as `data:` URIs like imports; cap 5 MB each.
- [ ] POL-5 Clean-up migration: stop writing legacy `Collection.storyIds` / `Bookmark.storyId`, drop
      the legacy `chapters` table; `SCHEMA_VERSION` 2 → 3 in `src/db/migrations/index.ts`, re-runnable,
      real-SQLite tests (`tests/helpers/sqliteNode.ts`). Downside: an older build installed afterwards
      sees empty collections; say so in INSTALL.md (template T3).
- [ ] POL-6 Updates tab grouped by day (optional).
- [ ] POL-7 Add `react-test-renderer` (19.2.3) to devDependencies explicitly (today it arrives only
      through jest-expo).
- [ ] POL-8 A test for the `withKnownTitles` safety net (removing it still passes all AO3 suites).

### files
Per item: `src/app/(tabs)/search.tsx`; `src/features/actions.ts`; `src/sources/ao3/{api,adapter}.ts`,
`src/reader/template.ts`; `src/features/downloads.ts`, `src/reader/images.ts`;
`src/db/migrations/{index,v3}.ts`; `src/app/(tabs)/updates.tsx`; `package.json`; `tests/ao3-*.test.ts`.

### data / API details
Work skins: AO3 renders the skin as a `<style>` in the full-work page; sanitize as above. Images: same
caps and file layout as imports (`Documents/imports/…` style per-story folders).

### policies
"All" search sends exactly one request per source on submit; no prefetching. Migration follows R-9.

### tests
Per item, following the existing patterns (request counts for POL-1; real SQLite for POL-5; CSS
sanitizer attack cases for POL-3).

### acceptance
Per item, agreed with the user before building.

### install_notes
No prebuild for any of these. POL-5 changes storage: template T3 (back up first).

### risks
POL-5 breaks reinstalling an older build; POL-3 CSS injection if the sanitizer is weak.

### open_questions
Which items the user wants (none chosen yet).
