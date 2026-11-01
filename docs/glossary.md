# Glossary

> Terms used across the code and these docs.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 12. Glossary

| Term | Meaning |
|---|---|
| **StoryKey** | `'<source>:<remoteId>'` (`ffn:123`, `ao3:5`, `wp:6`, `local:lx3k…`); the one id for a story outside FFN-only code. A bare number means FFN |
| **remoteId** | the site's own id as an opaque string |
| **SourceId / source** | `ffn`, `ao3`, `wp`, `local`; one `Source` adapter each (`src/sources/registry.ts`) |
| **Source contract** | the `Source` interface (`docs/sources_common.md` §5.3): caps, reader base, `getStory`, `getChapter`, `downloadAll?`, `checkUpdates?`, `search?`, `session?` |
| **caps** | what a source can do (`browse`, `search`, `download`, `updates`, `login`, `follow`, `endorse`, `discuss`, `accountSync`, `groups`) |
| **slots / SourceUi** | per-site UI pieces (stat cells, actions, routes, tag groups, reader end actions) that shared screens render without branching on the site |
| **bag** | a per-site sub-object on a record (`ffn`, `ao3`, `wp`, `local`), merged in `upsertStory` |
| **bridge** | the hidden WKWebView on www.fanfiction.net that runs FFN requests same-origin (`src/net/bridge.ts`, `BridgeHost.tsx`, `BRIDGE_SCRIPT`) |
| **challenge / verification** | Cloudflare's bot check; passive reload first, then the visible "Verify you are human" sheet |
| **quiet / priority** | background requests that never escalate to a visible check; `user` vs `background` priority in the HTTP queue |
| **POLICIES** | per-host spacing, timeout and cooldown table in `src/net/httpCore.ts` |
| **cooldown / rest** | a host paused after 429 (cooldown, `RateLimitedError`) or another 5xx (rest, `ServerBusyError`) |
| **block detector** | per-site `isXBlock` / `detectXBlock` in `src/net/blocks.ts` → `SourceBlockedError` |
| **stableText** | AO3 flag: a saved chapter copy can be reused if its chapter id and version match |
| **version / updated_at** | AO3's edit stamp on `StoryMeta.version`; marks a download stale, never a new chapter |
| **chapter ids / remap** | site chapter ids per number (`LibraryStory.chapterIds`, only via `applyChapterIds`); a `ChapterRemap` moves progress, downloads, bookmarks and listen positions when chapters are inserted, deleted or reordered |
| **restricted** | an AO3 work for logged-in users only |
| **adult gate** | FicShelf's own "show this Mature / Explicit / Not Rated work?" prompt |
| **official download** | AO3's HTML download whose link is copied from the work page |
| **local source** | imported (and, soon, clipped) stories under `local:` keys; never touches the network |
| **LocalOrigin** | `LibraryStory.local`: the imported file's record (kind, generator, hashes, dir, images, origin, soon `clip`) |
| **linking** | storing an imported AO3 / FFN file as that site's story (chapters as downloads) instead of a local story |
| **ticket** | a one-time in-memory handle (`importHandoff.ts`) that hands an Open-in file to the import screen; routes never carry paths |
| **Inbox** | `Documents/Inbox`, where iOS copies "Open in" files |
| **sweep** | `sweepImports()` at launch: removes stale copies, orphan folders, staging rows, orphan local chapters |
| **staging** | `${key}#staging` chapter rows or `<dir>.new` folders used for atomic replace |
| **ImageTable / ficshelf-img: / ficshelf-zip: / ficshelf-doc:** | import image registry; in-text image refs; zip-entry keys during parsing; relative Documents file refs |
| **reader mode** | the Safari-Reader-style cleanup (Mozilla Readability on JSDOMParser) for unknown HTML pages |
| **furniture** | site chrome (menus, sidebars, footers, comments) that reader mode drops |
| **front matter** | (import) title / copyright / fields pages before the story, kept as metadata with a counted warning; (audiobook) author's notes at a chapter's start that "Skip author's notes" passes over |
| **notes asides** | `aside.fs-notes[data-pos=before|after]` the reader folds and the audiobook uses as an exact boundary |
| **one-shot / runsOn** | a single-chapter work; `runsOn` decides by metadata whether split files run on as one chapter |
| **stammer / doubtfulNumeral** | dialogue like "I... I" or "V – very well." that must not become a chapter heading |
| **Left out warning / leftOut / keptOrWarned** | the counted warning for dropped text; corpus expectations for it (`keptOrWarned`: either kept or warned) |
| **LEFT_OUT_MIN** | 40 words; below it no warning is needed |
| **corpus** | `tests/import-corpus.test.ts`: 299 synthetic cases pinning every import scenario found |
| **Stepper** | import progress / abort / pause helper so parsing yields between chapters |
| **migration v2 / snapshot / drainLegacy / unreadable:** | the v1 → v2 storage upgrade; its `ficshelf-pre-v2.db` copy; the per-launch merge of rows an older build wrote; kept rows naming no story |
| **writable** | `kv.writable`; false after a failed migration (writes become no-ops, `MigrationFailed` shows) |
| **normalize-on-read** | stored records re-validated on every load (`normalizeStory`, `normalizeLocal`, …) |
| **check-keys** | `scripts/check-keys.ts`, part of lint, rejecting numeric-id misuse outside FFN-only files |
| **FFN-only files** | `src/ffn/`, `src/sources/ffn/`, `app/review/[id]`, `app/reviews/[id]`, `app/user/[id]`, `app/s/` |
| **segments / listen position** | TTS chunks ≤ 420 chars with `data-tts` block ids; per-story `{chapter, index, at}` in kv `listenPositions` |
| **add-on voice / Piper / Lessac** | third-party iOS speech voices (Piper – Neural TTS); Lessac is the user's voice |
| **silent loop** | `assets/audio/silence.wav` played through expo-audio to keep the audio session and lock-screen controls |
| **What's new** | `WhatsNewSheet` shown once per `WHATS_NEW_VERSION` |
| **prebuild** | `npx expo prebuild -p ios`: regenerates `ios/` from `app.json`; needed after native changes |
| **Personal Team** | the free Apple ID signing team; 7-day profiles |
| **T1 / T2 / T3 / T4** | update templates: JS-only, prebuild, storage change, weekly re-sign (`docs/user_and_install.md` §2.4) |
| **live check** | `scripts/live-check.ts` against the real sites, strictly budgeted |
| **synthetic fixture** | test input with real markup shapes and lorem text (`scripts/synthesize-fixture.ts`) |
| **CTX block / lenses / refuter / verifier / confirm** | workflow terms: shared context in agent prompts; review angles; agents that try to disprove a finding; independent re-check of fixes; bounded closing check |
| **journal** | a workflow's per-agent result log (old session only; not in a fresh container) |
| **Clip / open mode / ffn mode** | the planned "Clip this page" feature; the in-app browser's any-https mode vs today's FFN mode (`docs/clipping/p-clip.md` §4) |
| **kill switch** | a per-site Enabled switch that hides the site and stops all its requests (planned for Wattpad) |
| **lock / fail closed** | Wattpad paid parts; unknown lock state is treated as locked |
