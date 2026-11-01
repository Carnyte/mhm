# iOS build, app.json, dependencies, Expo / Hermes gotchas

> Read before touching app.json, plugins/, package.json, native modules, or answering an Xcode error.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 4.2 `app.json` essentials
- `name: FicShelf`, `slug: ficshelf`, **`scheme: ficshelf`** (`ficshelf://open?url=…`, `ficshelf://s/<id>/<ch>`), `orientation: default`, `userInterfaceStyle: automatic`.
- iOS: `bundleIdentifier: com.ficshelf.reader` (each user picks their own), `supportsTablet: true`;
  `UIBackgroundModes: [fetch, processing, audio]`; `ITSAppUsesNonExemptEncryption: false`;
  `CFBundleDocumentTypes` "EPUB Book" (`org.idpf.epub-container`) and "Story File" (`public.html`,
  `public.plain-text`, `net.daringfireball.markdown`), role Viewer, rank Alternate;
  `UTImportedTypeDeclarations` for `net.daringfireball.markdown` (conforms to `public.plain-text`,
  extensions `md` / `markdown`, MIME `text/markdown`); `LSSupportsOpeningDocumentsInPlace: false`
  (iOS copies files to `Documents/Inbox`). No `NSAppTransportSecurity` entry (prebuilt Info.plist has `NSAllowsArbitraryLoads=false`).
- Android: package `com.ficshelf.reader`, adaptive icon, `predictiveBackGestureEnabled: false` (not a target).
- Web: `bundler: metro`, `output: single` (dev harness only).
- `plugins` in order: `./plugins/withoutPushEntitlement`, `expo-router`, `expo-sqlite`,
  `expo-background-task`, `expo-notifications` (color `#1F3A5F`), `expo-sharing`, `expo-font`,
  `expo-audio` (`microphonePermission: false`, `recordAudioAndroid: false`, `enableBackgroundPlayback: true`),
  `expo-splash-screen`, `expo-build-properties` (`ios.enableSceneSupport: true`, `ios.usePrecompiledModules: false`), `expo-asset`.
  `usePrecompiledModules: false` (2026-10-27): Expo's npm-shipped ready-made module frameworks were
  built with an older Swift than the user's Xcode; the Podfile then sets
  `EXPO_USE_PRECOMPILED_MODULES=0` and CocoaPods builds Expo's modules from source (slower first build).
- Prebuild result: deployment target iOS 16.4, scene life cycle on, empty entitlements (no push), background audio, no microphone permission.

---

### 4.3 Dependencies (installed versions)
Runtime (updated 2026-10-27 by `npx expo install --fix`: expo 57.0.31, expo-router 57.0.29, expo-modules-core 57.0.24, expo-modules-jsi 57.1.3, jest-expo 57.0.6; the list below is otherwise as at 5cc19e8): expo 57.0.27; react-native 0.86.3; react / react-dom 19.2.3; expo-router 57.0.25; expo-sqlite
57.0.4; expo-file-system 57.0.7 (new `File` / `Directory` / `Paths` API); expo-speech 57.0.3;
expo-audio 57.0.5; expo-background-task 57.0.21; expo-task-manager ~57.0.21; expo-notifications
57.0.22; expo-document-picker ~57.0.3; expo-sharing, -clipboard, -network, -haptics, -keep-awake,
-brightness, -linking, -constants, -font, -splash-screen, -status-bar, -system-ui, -asset, -dev-client,
-build-properties (all ~57.0.x); react-native-webview 13.16.1; react-native-gesture-handler ~2.32.0;
react-native-reanimated 4.5.1; react-native-worklets 0.10.1; react-native-screens ~4.26.0;
react-native-safe-area-context ~5.7.0; @react-native-community/slider 5.2.0; react-native-web ^0.21.2;
@expo/vector-icons ^15.0.2 (Ionicons); htmlparser2 9.1.0; css-select 5.2.2; domhandler 5.0.3;
domutils 3.2.2; dom-serializer 2.0.0; fflate 0.8.3 (sync only: Hermes has no Workers);
@mozilla/readability 0.6.0 (its `JSDOMParser.js`: Hermes has no DOMParser).

Dev: typescript 6.0.3, jest 29.7.0, jest-expo 57.0.5, @types/jest 29.5.14, @types/react ~19.2.2,
eslint 9.39.5, eslint-config-expo ~57.0.2, tsx 4.23.15, playwright-core 1.56.1 (live-check and
dev-proxy only). `react-test-renderer` 19.2.3 (screen tests) arrives only through jest-expo.
jsdom 20.0.3 and `jest-environment-jsdom` are present in node_modules (transitive).

`npx expo-doctor`: 21/21 since `ca4749f` (the 11 patch mismatches at `5cc19e8` were fixed with
`npx expo install --fix` together with the Xcode 27 native fix). Patch updates are native changes:
the user's next install is a prebuild.

---

### 10.1 iOS, Expo, Hermes, free Apple ID

| What happened | Rule |
|---|---|
| The first install set had `react-native-worklets` 0.13, outside expo-modules-core's range; it would have broken the iOS build (fixed in `456dc51`) | Add native deps with `npx expo install <pkg>`; run `npx expo install --fix` after version changes; never `npm audit fix` |
| A free Personal Team can't sign the `aps-environment` (push) entitlement | Keep `plugins/withoutPushEntitlement.js` **first** in `plugins`; local notifications only; no App Groups / Associated Domains / iCloud / Push |
| Xcode 27 / iOS 27 SDK can open to a black screen without the UIKit scene life cycle | Keep `["expo-build-properties", {"ios": {"enableSceneSupport": true}}]` |
| The Mac was on Sequoia 15.7.4; SDK 57 needs Xcode 26.4+ (macOS Tahoe 26.2+); Xcode 27 needs 26.6+ and an iOS 17+ phone | Check `sw_vers -productVersion` before giving Xcode steps; Node ≥ 22.13 |
| Free ID: apps stop opening after 7 days; 3 apps per device; 10 new App IDs per 7 days | Weekly reinstall (T4) without deleting; a share extension costs an App ID and a second signing target after every prebuild, so it stays optional |
| Debug builds need the Mac and Metro | Scheme **Release**, "Debug executable" unticked; re-check after a prebuild |
| Hundreds of yellow Xcode warnings pasted | They come from RN / Expo code; say so briefly; only red errors matter |
| Expo Go can't run the app; the container has no Mac or device | Checks stop at `npx expo export --platform ios`; tell the user what needs a device test |
| The audiobook (`fde0496`, expo-audio) and import (`44a9f71`, `CFBundleDocumentTypes` etc.) only worked after `npx expo prebuild -p ios`, which recreates `ios/` and wipes `ios/.xcode.env.local` | Every update message says whether prebuild is needed; after prebuild redo the NODE_BINARY line and check Signing / Release |
| `git pull` could conflict with the user's own `bundleIdentifier` | Always `git pull --autostash`; repo edits stay away from that line; on conflict keep the user's line |
| With `LSSupportsOpeningDocumentsInPlace: false`, Open-in files arrive as copies in `Documents/Inbox` as `file://` URLs to `+native-intent.tsx` | Route them through tickets; sweep leftovers |

Hermes / JS runtime:

| Gotcha | Rule |
|---|---|
| Xcode updated itself to Xcode 27 / Swift 6.4 (2026-10): the build failed twice. First "Failed to build module 'ExpoModulesCore'; this SDK is not supported by the compiler (the SDK is built with 'Apple Swift version 6.3.1' …)": Expo's npm-shipped precompiled modules (`usePrecompiledModules` defaults to true) were built with an older Swift. Then "Cannot find type '__ObjC::expo' in scope" in ExpoModulesJSI's interface: Expo's own bug, fixed in expo-modules-jsi 57.1.3 | `app.json` `ios.usePrecompiledModules: false` (`570b9ad`) + keep Expo on the latest SDK patches (`npx expo install --fix`, `ca4749f`); both are native changes (T2). When a red Xcode error names an Expo module after an Xcode update, read the package CHANGELOGs on unpkg (`https://unpkg.com/<pkg>@<version>/CHANGELOG.md`) for a fix first. A by-hand `npm install <pkg>@<ver> --no-save` unblocks the user without touching tracked files |
| The user's newer npm prints "install scripts not yet covered by allowScripts" (esbuild, fsevents, unrs-resolver) | Harmless dev tools; tell the user to ignore it |
| Hermes has **no Web Workers**; fflate's async APIs spawn them | Only fflate's sync APIs or streaming `Inflate` (`src/import/zip.ts`); one-shot inflate keeps decoding past its output, so stream and stop when an entry outgrows its declared size; zip names are lookup keys only |
| Hermes has **no DOMParser** | Readability runs on its bundled `JSDOMParser`; feed it htmlparser2-parsed, dom-serializer-rewritten HTML (it knows only the five XML entities and wants quoted attributes) |
| Metro runs `JSDOMParser.js` without a receiver and not strict, so it **overwrites RN's global `Node`, `Element`, `Document`, `Text`** (RN defines them lazily via getters) | `readability.ts` saves `SCRIPT_GLOBALS` (read *before* the require) and restores them; keep it |
| Research said Hermes rejects `\p{…}` regexes; RN 0.86's own `hermesc` accepts `\p{Lu}` (and `src/import/dom.ts` uses `\p{L}` / `\p{Lu}`) | Check runtime claims with the project toolchain (`npx expo export --platform ios`), not an older CLI |
| node-html-parser dropped `<SELECT>` with unclosed `<option>`s and collapsed a forum table on an unclosed `<span>` | htmlparser2 + css-select + domutils + dom-serializer behind `El`; `normalizeSelects()` closes options; use `tr` selectors, not `tbody tr` |
| RN 0.86 removed `StyleSheet.absoluteFillObject`; a TS 6 `never` narrowing bit a type guard; eslint `react-hooks` purity flagged `Date.now()` in a callback | `StyleSheet.absoluteFill` / explicit styles; impure calls in module-level helpers (`freshHome()` in `BridgeHost.tsx`) |
| A non-`async` fetcher threw synchronously for a non-FFN key; `useQuery` calls it outside its try, so the screen sat on "Loading story…" forever | Every fetcher passed to `useQuery` / `usePaged` must be `async` |
| Integer-like object keys enumerate in numeric order; `stories[123]` → `stories['ffn:123']` silently changed library tie-break order | Sort explicitly (`compareKeys`) when re-keying maps |
| `push(...arr)` with huge arrays overflowed the stack in the sanitizer; a recursive walk over 12,000 nested tags still overflows (`it.todo`) | No spread into calls or array copies in loops; walk iteratively |
