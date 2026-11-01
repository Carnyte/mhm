# Known limitations and open minor issues

> Read before reopening a "bug": many are known and accepted.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 7.9 Known limitations (README plus review)
- AI translation / writing tools used FictionPress's private service (iOS menu Look Up / Translate instead).
- No server "HD" voices; lock-screen next / previous paragraph via ±10 s (expo-audio has no next / previous track); "play over other audio" has no lock-screen controls.
- New-chapter checks only at launch, foreground and iOS background windows (no push).
- Forum posting, publishing and account settings use FFN's own pages in the in-app browser.
- AO3 has no in-app login; reading doesn't add hits; work skins not applied.
- Imported stories exist only on the phone (not in backups; deleting the app erases them); no EPUB
  export, no link import from other sites; Wattpad files import as local; web pictures in imported pages not shown.
- The in-app browser's open mode (Clip) takes https pages only; Clip keeps text only, one page per tap, and
  can't see canvas, cross-origin frames, shadow DOM or scroll-loaded text.
- Piper voices can vanish after a phone restart until the Piper app is opened; the Piper speed mapping depends on current Piper behaviour.
- FFN logged-in pages use adaptive parsing never inspected with an account.
- Cloudflare challenged the container's headless browser after many automated requests (on a phone, the "Quick security check" sheet appears).

---

## 11. Known open minor issues (left at 5cc19e8; none loses text silently)

| id | where | what | recommendation |
|---|---|---|---|
| ISSUE-M1 (low, crafted) | `src/import/text.ts` ~l.205, the `surer` clause of the Roman-numeral stammer rule | Two doubtful lines with the same numeral adjacent: the dotted form always wins. A TXT with `V – Vows are made.` (100 words) then `V. Very well.` puts chapter V's first ~100 words at the end of IV, and V is titled by the stammer. `49442b7` and `16eaf18` kept the real heading. | Not pinned in the corpus. Leave unless a real file shows it. If fixing: add the corpus case first, then check `r3/p8` A–C and `r4/a2` A–C still pass |
| ISSUE-D3 (accepted) | `src/import/epub.ts` front-matter rules; corpus `r4/a5 D3` | A shared "Title Page" whose prologue's first paragraph mentions "copyright" is read as a notice and left out, with a counted warning ("Left out “Title Page” … about 212 words") | Pinned as `keptOrWarned` (either result passes). A fix needs a new rule; don't add one without a real file |
| ISSUE-G5 (cosmetic) | EPUB; corpus `r4/a6 G5` | Field lines ("Fandom: … Rating: …") in an unnamed file after the Title Page show as text in the Introduction chapter | Not pinned (`words: [null, …]`) |
| ISSUE-NEST (todo) | `tests/import-corpus.test.ts:2555` `it.todo('r1/nest: 12,000 unclosed tags overflow the stack in every tree …')` | 12,000 nested unclosed tags overflow the stack in a recursive DOM walk (domutils / dom-serializer style) | Measure depth iteratively right after parsing; above about 2,000 levels flatten or refuse with `ImportError('invalid', 'This page is nested too deeply to import.')`; then turn the todo into a case. Also relevant to Clip (CLIP input is a page) |
| ISSUE-FLAKE-1 | `tests/import-screen.test.tsx` | Cold transform cache: first test hits jest's 5 s timeout; 7 cascade failures; rerun passes | PRE-1 |
| ISSUE-FLAKE-2 | `tests/sanitize.test.ts:163` | `< 1500 ms` timing assertion failed once in a full parallel run (1087/1088) | More headroom (PRE-1) |
| ISSUE-WEB-COOKIE | `src/app/web.tsx` `onMessage` | Any page in the in-app browser could post `{type:'cookies'}` into `bridge.updateCookies` | CLIP-3 |
| ISSUE-LIVECHECK | `scripts/live-check.ts` ~l.288 | Unknown `--source` silently runs the FFN check | PRE-3; `wp` branch in WP-17 |
| ISSUE-ALLOWSCRIPTS (harmless) | the user's npm | `npm install` warns "3 packages have install scripts not yet covered by allowScripts" (esbuild, fsevents, unrs-resolver) | Dev tools only; the iPhone build doesn't need them. Tell the user to ignore it; never `npm audit fix` |
| ISSUE-DOCTOR (fixed 2026-10-27) | deps | `npx expo-doctor` was 20/21: 11 patch mismatches | Done with the Xcode 27 fix (21/21) |
| ISSUE-XCODE-SWIFT (fixed 2026-10-27) | `app.json` expo-build-properties | After an Xcode update (Swift 6.4) the user's build failed: Expo's npm-shipped precompiled ExpoModulesCore (built with Swift 6.3.1) can't be read ("this SDK is not supported by the compiler", "Cannot find type '__ObjC::expo'") | `ios.usePrecompiledModules: false` (the Podfile then forces `EXPO_USE_PRECOMPILED_MODULES=0`): Expo modules build from source on the Mac. Native change: T2 (prebuild). Keep it unless Expo's prebuilts follow Xcode. The second half of the same failure (`Cannot find type '__ObjC::expo'` in ExpoModulesJSI's interface) is Expo's bug, fixed in expo-modules-jsi 57.1.3 ("Fix the `.swiftinterface` failing to compile with Xcode 27 (Swift 6.4)"), which PRE-4's `npx expo install --fix` brings in. Confirmed working on the user's phone 2026-10-27 (with 57.1.3 installed by hand first) |
| ISSUE-DOCS | `PLAN.md`, `INSTALL.md`, `README.md` | Stale counts and device statements | PRE-2 |
| ISSUE-TITLES | `src/sources/meta.ts` `withKnownTitles` | Removing this safety net still passes all AO3 suites (untested) | POL-8 |
| ISSUE-RTR | `package.json` | `react-test-renderer` only arrives through jest-expo | POL-7 |

Already fixed in `5cc19e8`, do not reopen: "Start"-only EPUBs whose files open with bold named
titles stay one chapter per file with the mismatch warning; files run on as one chapter only when
the book says it's a one-shot (its TOC entry equals the book title, or its fields say `Chapters: 1/1`).
