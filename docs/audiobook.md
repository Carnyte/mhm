# Audiobook (TTS): features and lessons

> Read before touching src/audio/*.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

### 7.5 Audiobook (all sources)
- ✅ Start from the reader's headphones button (first paragraph on screen), Listen on the story page, or any ⋯ menu; tap a paragraph to read from there; highlight follows in scroll and page mode.
- ✅ Background via an expo-audio silent loop (screen locked, silent switch); lock screen / Control
  Center metadata and artwork (written to a cache file since iOS can't fetch FFN images past
  Cloudflare); play / pause from lock screen and headphones; **±10 s buttons = previous / next paragraph**
  (loop position kept between 15 and 40 s); pauses for calls and unplugged headphones.
- ✅ Continues into the next chapter without the reader (offline for downloads; next chapter prefetched); mini player across the app; full player.
- ✅ Speed 0.5x–2x mapped per voice (`src/audio/rate.ts`): above 1x rate `1+(speed−1)/3`; Apple voices
  below 1x use `speed`; Piper below 1x follows Piper's speedCurve between AVSpeechUtterance rates 0.205
  and 0.5; Piper = id starts with `dev.ihor-shevchuk.piper` or contains `>0<`; based on piper-objc 0.2.36–0.2.44 🧪.
- ✅ Pitch; a voice per story language (Premium / Enhanced labelled and preferred); "no voice for this
  language" notice; voice preview; FFN native language names matched; Norwegian `no` / `nn` → `nb`.
- ✅ Add-on voices (Piper): labelled "Add-on · low / medium / high", listed first, never auto-chosen, up
  to 40 per language with smaller models before numbered speakers (Lessac stays visible), 15 s start
  watchdog then default voice, notice when a chosen add-on drops out (open Piper once).
- ✅ Sleep timer 5 min – 2 h or end of chapter; announce chapter titles; separators not spoken; natural
  pauses (Natural 300 / 1100 / 800 ms between paragraphs / scene breaks / after title; Long 650 / 1800 / 1200; Off);
  speech-only cleanup; "Skip author's notes at the start" (default on; errs towards reading) 🧪;
  listening position per story (body-segment index; follows AO3 remaps); "Play over music and other audio" (ducks; no lock-screen controls).
- Engine details: segments ≤ 420 chars at sentence / clause breaks with `breakBefore: none|paragraph|scene`;
  blocks tagged `data-tts`; title segment `block: -1` when `ttsReadTitles` and more than one chapter;
  front-matter boundary exact at `aside.fs-notes[data-pos=before]`, else `frontMatterBlocks` heuristic
  (A/N, Summary, Disclaimer near the top, up to a scene break or heading, at most 2 unlabelled tail blocks,
  word cap max(400, 40%), never the whole chapter); `expo-speech` with `LOOKAHEAD = 1`; watchdogs 5 s /
  15 s; `BASE_WPM = 175`; positions in kv `listenPositions` (200 most recent, saved 1.5 s after a
  change); `resumePoint` prefers reader progress when newer by > 90 s; `forgetListenPosition` on delete;
  `onChapterRemap(remapListenPosition)` at module level plus a temporary listener during a load (follows once). `AUDIOBOOK_SUPPORTED` iOS and Android only.
- ⏳ Server "HD" voices (FictionPress GPUs). ⏳ Kokoro on-device neural TTS / BYO-key cloud voices (offered 2026-10-07; not picked).

---

### 10.3 Audio / TTS

| What happened (commit) | Rule |
|---|---|
| Background play and lock screen needed an active audio session (`fde0496`, `0698ebb`) | Silent 60 s 8 kHz WAV loop through expo-audio with `keepAudioSessionActive: true` (`src/audio/session.ts`); start it as soon as playback is requested, or locking during the first chapter download suspends the app |
| expo-audio stacks remote-command handlers | `setActiveForLockScreen` **once per launch**, then only `updateLockScreenMetadata` |
| Lock-screen / headphone play never reached the player: 500 ms status updates kept restarting the external-change check (`0698ebb`) | Never restart that timer on every status tick |
| Seeking before the silent track was `readyToPlay` could throw in AVFoundation | Guard seeks with `isLoaded`; re-base in `finally` |
| expo-audio has no next / previous track | ±10 s = next / previous paragraph; duck / mix mode has no lock-screen controls (README) |
| expo-speech **fails silently** on a missing / invalid voice ("playing", no sound) | Start watchdog (`WATCHDOG_MS` 5000, `ADDON_WATCHDOG_MS` 15000) retries once with the default voice; voice list refreshed on foreground |
| FFN gives native language names ("Español", "日本語"), so non-English stories got an English voice (`956add0`) | `languageCode()` maps native and English names; `no` / `nn` → `nb` (`31439d4`) |
| Piper add-on voices report **Enhanced** quality; a multi-speaker model adds hundreds of numbered speakers that filled the 40 cap and hid Lessac (`e3c72f0`, `31439d4`) | Label add-ons by identifier, never auto-pick one, smaller named models before numbered speakers, show low / medium / high; on drop-out tell the user to reopen Piper |
| **Speed**: iOS hands extension voices `<prosody rate="P%">` with P = 100×rate below normal and 100 + 300×(rate−1) above, so Apple voices at 2x played about 4x; Piper (piper-objc 0.2.36–0.2.44) reads 20–99 % as an AVSpeechUtterance rate where 50 % is normal, so 0.9x played about 2.2x and 0.5x at 1x (user report 2026-10-07) | `speechRate(speed, voice)` per voice (`PIPER_SLOW` curve, floor about 0.5057; `c79d776`). A research workflow measured what iOS actually sends before the mapping changed; do the same next time. Ask for a re-test if Piper updates |
| "Skip the summary": FicShelf never reads the summary; the user heard the author's notes. The first heuristic ate real story (unlabelled paragraphs after a note, "…" / "?!" dialogue as separators, hyphenated words matching labels) (`3321ff1` → `4b7f0ba`) | `frontMatterBlocks()` errs towards reading; switchable; skipped notes stay tappable; `skip(+1)` from the title respects it |
| Short dialogue ("I-I...", "Mm.") dropped as a separator (`956add0`) | A line with quotes or sentence punctuation is speakable; only repeated-letter dividers (`-x-x-x-`, `xXx`, `oOoOo`) are scene breaks |
| The saved position was a raw segment index; toggling chapter titles shifted resume by one | Positions are body indexes; resume uses the newer of listen position and reading progress (`resumePoint()`) |
| Two player tests broke when pauses were added (they assumed queue-ahead across paragraphs) (`07f2553`) | New behaviour defaults get disabled in older tests' `beforeEach` (`ttsPauses: 'off'`), with dedicated tests |
| Kokoro / sherpa-onnx researched: 215–400 MB, ~800 MB RAM, iOS kills > 80 % CPU over 60 s in background, Core ML crashes on some iOS 26.x / 27.0 | Don't build without an explicit go-ahead; native code that can't be compiled here means Xcode fix rounds with the user |
