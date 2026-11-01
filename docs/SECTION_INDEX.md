# Section index: old MASTER_FEATURES.md / FEATURES.md section → new file

> The docs keep the old section numbers in their headings. A reference like "§10.12" in a moved
> text means MASTER_FEATURES §10.12 unless it came from FEATURES (phase specs, ROADMAP, process §1).

| old file | § | heading | now in |
|---|---|---|---|
| MASTER_FEATURES | 1 | Project overview and goals | `docs/architecture.md` |
| MASTER_FEATURES | 2 | The user | `docs/user_and_install.md` |
| MASTER_FEATURES | 2.1 | Profile | `docs/user_and_install.md` |
| MASTER_FEATURES | 2.2 | How to communicate | `docs/user_and_install.md` |
| MASTER_FEATURES | 2.3 | The two environments | `docs/user_and_install.md` |
| MASTER_FEATURES | 2.4 | How the user builds, installs and updates (INSTALL.md Path B: Mac + free Apple ID) | `docs/user_and_install.md` |
| MASTER_FEATURES | 2.5 | What is confirmed on the device | `docs/user_and_install.md` |
| MASTER_FEATURES | 3 | Architecture overview | `docs/architecture.md` |
| MASTER_FEATURES | 4 | Codebase map | `docs/architecture.md` |
| MASTER_FEATURES | 4.1 | Top level | `docs/architecture.md` |
| MASTER_FEATURES | 4.2 | `app.json` essentials | `docs/ios_build.md` |
| MASTER_FEATURES | 4.3 | Dependencies (installed versions) | `docs/ios_build.md` |
| MASTER_FEATURES | 4.4 | `src/` map | `docs/codebase_map.md` |
| MASTER_FEATURES | 4.5 | Routes (`src/app/**`) | `docs/codebase_map.md` |
| MASTER_FEATURES | 4.6 | `scripts/` | `docs/codebase_map.md` |
| MASTER_FEATURES | 5 | Data model and storage | `docs/database_schema.md` |
| MASTER_FEATURES | 5.1 | Story keys (`src/sources/keys.ts`) | `docs/database_schema.md` |
| MASTER_FEATURES | 5.2 | Site-neutral model (`src/sources/types.ts`) | `docs/database_schema.md` |
| MASTER_FEATURES | 5.3 | The `Source` contract | `docs/sources_common.md` |
| MASTER_FEATURES | 5.4 | Library (`src/state/library.ts`) | `docs/database_schema.md` |
| MASTER_FEATURES | 5.5 | Settings (`src/state/settings.ts`) | `docs/database_schema.md` |
| MASTER_FEATURES | 5.6 | SQLite storage (`src/db/kv.ts`) | `docs/database_schema.md` |
| MASTER_FEATURES | 5.7 | Migration v2 (`src/db/migrations/v2.ts`, `migrateV2`) | `docs/database_schema.md` |
| MASTER_FEATURES | 5.8 | Chapter-id remapping (`src/sources/remap.ts`, `src/features/chapterIds.ts`) | `docs/database_schema.md` |
| MASTER_FEATURES | 6 | Sources and per-site policies | `docs/sources_common.md` |
| MASTER_FEATURES | 6.1 | Across sites | `docs/sources_common.md` |
| MASTER_FEATURES | 6.2 | FanFiction.net | `docs/ffn.md` |
| MASTER_FEATURES | 6.3 | AO3 (reading without login) | `docs/ao3.md` |
| MASTER_FEATURES | 6.4 | Local source and the import pipeline | `docs/import.md` |
| MASTER_FEATURES | 6.5 | Wattpad (planned; research only) | `docs/wattpad.md` |
| MASTER_FEATURES | 6.6 | How to add a new Source (checklist; Wattpad `wp` is the next one) | `docs/sources_common.md` |
| MASTER_FEATURES | 6.7 | Novelpia (2026-10-21 research) and other sites | `docs/novelpia.md` |
| MASTER_FEATURES | 6.8 | Clip this page (any https site) and automatic clipping | `docs/clipping/README.md` |
| MASTER_FEATURES | 7 | Feature inventory | `docs/architecture.md` |
| MASTER_FEATURES | 7.1 | FanFiction.net | `docs/ffn.md` |
| MASTER_FEATURES | 7.2 | AO3 (no login) | `docs/ao3.md` |
| MASTER_FEATURES | 7.3 | Imported files (local source) | `docs/import.md` |
| MASTER_FEATURES | 7.4 | Reader (all sources) | `docs/reader.md` |
| MASTER_FEATURES | 7.5 | Audiobook (all sources) | `docs/audiobook.md` |
| MASTER_FEATURES | 7.6 | Library and updates | `docs/library_updates.md` |
| MASTER_FEATURES | 7.7 | App and settings (`src/app/settings.tsx`, in order) | `docs/ui_rules.md` |
| MASTER_FEATURES | 7.8 | Other sites | `docs/ui_rules.md` |
| MASTER_FEATURES | 7.9 | Known limitations (README plus review) | `docs/known_issues.md` |
| MASTER_FEATURES | 8 | Testing and verification | `docs/testing.md` |
| MASTER_FEATURES | 8.1 | Checks (run before every commit) | `docs/testing.md` |
| MASTER_FEATURES | 8.2 | Test files (51) and counts at `5cc19e8` | `docs/testing.md` |
| MASTER_FEATURES | 8.3 | Helpers (`tests/helpers/`) | `docs/testing.md` |
| MASTER_FEATURES | 8.4 | Fixture policy | `docs/testing.md` |
| MASTER_FEATURES | 8.5 | The golden import corpus (`tests/import-corpus.test.ts` + `tests/helpers/corpus.ts`) | `docs/import.md` |
| MASTER_FEATURES | 8.6 | Live-request budgets | `docs/testing.md` |
| MASTER_FEATURES | 9 | Process and conventions | `docs/process.md` |
| MASTER_FEATURES | 9.1 | Git | `docs/process.md` |
| MASTER_FEATURES | 9.2 | Commit message style | `docs/process.md` |
| MASTER_FEATURES | 9.3 | Code conventions | `docs/process.md` |
| MASTER_FEATURES | 9.4 | Checks before commit | `docs/process.md` |
| MASTER_FEATURES | 9.5 | How implementation, review and verification workflows were run | `docs/process.md` |
| MASTER_FEATURES | 9.6 | Harness constraints | `docs/process.md` |
| MASTER_FEATURES | 9.7 | Reporting to the user | `docs/user_and_install.md` |
| MASTER_FEATURES | 10 | Lessons learned: mistakes, patterns, gotchas | `AGENT_ROOT.md` |
| MASTER_FEATURES | 10.0 | The rules that matter most | `AGENT_ROOT.md` |
| MASTER_FEATURES | 10.1 | iOS, Expo, Hermes, free Apple ID | `docs/ios_build.md` |
| MASTER_FEATURES | 10.2 | WebView | `docs/webview.md` |
| MASTER_FEATURES | 10.3 | Audio / TTS | `docs/audiobook.md` |
| MASTER_FEATURES | 10.4 | Background work | `docs/library_updates.md` |
| MASTER_FEATURES | 10.5 | Modals and sheets | `docs/ui_rules.md` |
| MASTER_FEATURES | 10.6 | Storage, keys and migration | `docs/database_schema.md` |
| MASTER_FEATURES | 10.7 | Across sites (source layer review, `2ae4a2a`) | `docs/sources_common.md` |
| MASTER_FEATURES | 10.8 | FanFiction.net | `docs/ffn.md` |
| MASTER_FEATURES | 10.9 | AO3 | `docs/ao3.md` |
| MASTER_FEATURES | 10.10 | Wattpad (research) | `docs/wattpad.md` |
| MASTER_FEATURES | 10.11 | Novelpia and the classifier denial (2026-10-21) | `docs/novelpia.md` |
| MASTER_FEATURES | 10.12 | Import heuristics | `docs/import.md` |
| MASTER_FEATURES | 10.13 | Import performance (all fixed; keep them fixed) | `docs/import.md` |
| MASTER_FEATURES | 10.14 | Import flow and security (`16eaf18`) | `docs/import.md` |
| MASTER_FEATURES | 10.15 | Testing | `docs/testing.md` |
| MASTER_FEATURES | 10.16 | Process and orchestration | `docs/process.md` |
| MASTER_FEATURES | 10.17 | Communicating with this user | `docs/user_and_install.md` |
| MASTER_FEATURES | 11 | Milestone history | `docs/history.md` |
| MASTER_FEATURES | 12 | Glossary | `docs/glossary.md` |
| MASTER_FEATURES | 13 | Next work | `docs/history.md` |
| FEATURES | 1 | Resume protocol | `docs/process.md` |
| FEATURES | 1.1 | Preflight (do first in the next session) | `docs/process.md` |
| FEATURES | 2 | Rules that always apply | `AGENT_ROOT.md` |
| FEATURES | 3 | Order | `docs/ROADMAP.md` |
| FEATURES | 3a | P-UI1: Kindle-style look (FIRST PHASE: do this before anything else) | `docs/ui_rules.md` |
| FEATURES | 4 | P-CLIP: "Clip this page" for any website | `docs/clipping/p-clip.md` |
| FEATURES | 4a | P-CLIP2: "Clip & next" and "Clip the next N chapters" (auto-clip), then perfect Clip | `docs/clipping/p-clip2.md` |
| FEATURES | 4b | P-CLIP3: "Clip a whole story" in the background, and Clip for more sites | `docs/clipping/README.md` |
| FEATURES | 5 | P4: Wattpad reading loop (no login) | `docs/wattpad.md` |
| FEATURES | 6 | P6: AO3 account and social | `docs/ao3.md` |
| FEATURES | 7 | P7: Wattpad account and social | `docs/wattpad.md` |
| FEATURES | 8 | P8: Polish and optional extras | `docs/polish_extras.md` |
| FEATURES | 9 | P-IMPORT-X: import extras the user did not pick | `docs/import.md` |
| FEATURES | 10 | P-NOVELPIA: optional Novelpia source | `docs/novelpia.md` |
| FEATURES | 11 | Known open minor issues (left at 5cc19e8; none loses text silently) | `docs/known_issues.md` |
| FEATURES | 12 | Open questions and defaults (all phases) | `docs/history.md` |
| FEATURES | 13 | Change log of this file | `docs/history.md` |
