# Library, update checks and background work

> Read before touching src/state/library.ts behaviour, src/features/updates.ts, background tasks or notifications.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 7.6 Library and updates
- ✅ Reading history with progress, filter by fandom; Follows, Favourites and authors synced from the FFN
  account; Downloads with storage used and per-story delete; Imported shelf; collections; sorts (last
  read, updated, added, title, unread, progress); filters (fandom, status, unread, site); "New chapters" badges.
- ✅ Backup to JSON via the share sheet and restore via the picker (v1 backups import; imported stories left out).
- ✅ Updates tab: Check now, pull to refresh, last-checked time; checks on launch and foreground (at
  most once a minute; waits up to 30 s for the bridge when FFN is due); background task
  `ficshelf-update-check` with `minimumInterval = max(15, hours × 60)` minutes when notifications are on;
  local notifications (individual for ≤ 3 stories, else one summary) open the story; optional
  auto-download (Wi-Fi only option; at most `MAX_QUIET_REDOWNLOADS = 3` version-only refreshes; never
  from the background for a logged-in source).
- Update logic (`src/features/updates.ts`): `storiesToCheck()` = `notify !== false`, not complete, not
  gone, and followed / in library / downloaded / favourited-and-read, oldest `lastCheckedAt` first;
  `checkable(id)` = `caps.updates && enabled() && !comingSoon`; per-site stamps
  `lastUpdateCheckBySource` (`stampChecked`); `dueSources(now, share)` (interval ≥ 30 min);
  `runBackgroundCheck()` covers `dueSources(now, 0.5)` minus FFN unless `bridge.pageReady`,
  `BACKGROUND_BUDGET_MS = 25_000`, `addExpirationListener → abort`; only a new chapter is news; `redownload` only marks a download stale.
- ✅ Storage v2 (`docs/database_schema.md` §5.7), pre-upgrade copy shown under Settings → Library & storage 🧪 (never reported run on the phone).
- ⏳ Server push (needs FictionPress's servers).

---

### 10.4 Background work
- **What happened**: the AO3 background check had no budget, wasn't oldest-first and saved results only
  at the end; a short iOS window threw everything away and later works were never checked (fixed in
  `6c1015f`). → `BACKGROUND_BUDGET_MS = 25_000`, oldest `lastCheckedAt` first, results per batch,
  `addExpirationListener` aborts. FFN follows the same budget.
- **What happened**: an AO3-only run (bridge down in background) stamped the global `lastUpdateCheck`,
  starving FFN for 6 h. → Per-site stamps (`lastUpdateCheckBySource`, `dueSources()`); any global stamp is a cross-source regression risk.
