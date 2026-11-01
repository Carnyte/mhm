# Process and conventions: git, commits, code style, review workflow, harness, resume protocol

> Read before committing, reviewing, or resuming after a cut-off. The unbreakable rules are in AGENT_ROOT.md.
> Section numbers (§N) are the ones of the old MASTER_FEATURES.md / FEATURES.md, kept so
> cross-references resolve: `docs/SECTION_INDEX.md` maps each to its file.

## 9. Process and conventions

---

### 9.1 Git
- Branch `claude/ficshelf-fanfiction-app` (upstream `origin/claude/ficshelf-fanfiction-app`); `master`
  holds the old unrelated Python project (a "Microsoft Rewards Farmer" bot; `695e10d` replaced it after
  the user said "you're free to delete everything").
- Commits by `Claude <noreply@anthropic.com>`, SSH-signed by the environment (`commit.gpgsign=true`,
  `gpg.format=ssh`); `%G?` shows `N` only because `allowedSignersFile` isn't set. Don't change git config.
- Push with `git push -u origin claude/ficshelf-fanfiction-app`. **No pull request has ever been opened**; don't open one unless asked.
- Commit:
  ```
  git add -A && git commit -q -F - <<'EOF'
  <Subject>

  <body>

  <the two attribution lines from the current session's system reminder, verbatim>
  EOF
  git push -u origin claude/ficshelf-fanfiction-app
  ```
  Stage explicit paths instead of `-A` when the tree holds unrelated work (as in `3212230`). Scratch
  files never go in the repo (`ios/`, `android/`, `dist/` are gitignored).
- Commit and push at the end of every green step; checkpoint commits of reviewed-but-unfinished work
  are fine (tell the user "pushed, but don't install yet"; add "Known open items (being fixed next): …" to the body).

---

### 9.2 Commit message style
- Subject: imperative, plain English, user-visible effect, no prefix (no `feat:`), no trailing period,
  about 50–75 characters (e.g. "Fix iPhone login/search and add the audiobook player", "Pin file
  import with a golden corpus and fix the open findings").
- Body wrapped at about 72 columns: a short "why" paragraph, then `- ` bullets, sometimes under plain headings ("Connection", "Audiobook (src/audio)").
- Trailers: exactly the two lines (`Co-Authored-By: …` and `Claude-Session: https://claude.ai/code/session_…`)
  after a blank line, copied from **your own** session's attribution reminder (the session URL changes
  per session; the last one used at `5cc19e8` was `session_01JHSZecYy27N5viB3DRjR5V`). **No model
  names or ids anywhere else** (subjects, bodies, code, docs); the repo was checked clean.
- Every commit with new tests updates README's Verification row `| N / N pass |` (done with `sed`) plus README / PLAN / INSTALL text for new features.

---

### 9.3 Code conventions
- Every module opens with a `//` header saying what it's for and why (161 of 172 `src` files); exported
  fields and functions carry `/** … */` with intent, units ("Unix seconds", "ms since epoch") and edge
  cases; about 10.6% of non-blank lines are comments; plain, British-leaning English ("favourite",
  "colour"); no `TODO`, `FIXME` or `console.log` in `src/`.
- User-facing text: plain sentences saying what happened and what to do ("AO3 asked FicShelf to slow
  down. Try again after 14:05."), in the words of the site involved, curly apostrophes (`’`).
- Naming: `StoryKey` everywhere outside FFN-only code; `remoteId` opaque string; `<site>Source`,
  `<site>Ui`, `parse<Site>Link`, `<site>Meta` / `<site>Info` / `<site>Chapter`; stores `xStore` + `useX`;
  constants `UPPER_SNAKE` with named policy numbers (`BACKGROUND_BUDGET_MS`, `UPDATE_BATCH`, `MAX_QUIET_REDOWNLOADS`).
- Errors: typed classes with `this.name` and recovery fields (`BridgeError.code`, `RateLimitedError.retryAt`,
  `ServerBusyError.status`, `HttpTimeoutError`, `NetworkError.site`, `SourceBlockedError.source`,
  `FfnPageError.code`, `NeedsWebError.path`, `LoginRequiredError`, `ComingSoonError`,
  `UnsupportedSourceError`, `LocalMissingError`, `Ao3*Error` (`Ao3ChapterGoneError.chapterIds`),
  `ImportError.code`, `MigrationError`); cancellation = `Error` with `name = 'AbortError'`;
  `components/states.tsx ErrorView` maps classes to screens; background code swallows errors with
  `.catch(() => {})` only where harmless and retried later.
- Purity: adapters, parsers, `src/import`, `remap.ts`, migrations, `segments.ts` don't import RN; platform splits via `.web.ts(x)`.
- State: tiny `createStore` stores, immutable updates, kv writes that don't wait, normalize-on-read for anything stored.
- Tests: shared state replaced with `jest.mock` (captured variables must start with `mock`); module
  state reset with `jest.resetModules()` (`ao3-resume`, `bridge`) or `jest.isolateModules()`
  (`backup`, `library`, `kv-sqlite`, `import-commit`); assert behaviour plus request counts and
  priorities; each review or verifier finding becomes a regression test or corpus case.

---

### 9.4 Checks before commit
`npx tsc --noEmit`; `npx jest`; `npm run lint`; `npx expo export --platform ios --output-dir <tmp>`; update the README count.

---

### 9.5 How implementation, review and verification workflows were run
The session used the Workflow tool for substantive tasks. The pattern that worked:
1. **Implement**: one agent (or core then integration). Its prompt carries a CTX block: repo, branch,
   HEAD, what's done, the design, the policies, the checks with the expected test count, "Do NOT
   commit or push", "no new npm dependencies unless essential", "make every check green", and a JSON
   summary schema (`done`, `deviations`, `checks`, `live_check`, `manual_checklist`, `known_gaps`).
2. **Multi-lens review**: 2–4 reviewers in parallel, each in a copy of the repo outside
   `/home/user/mhm` (without `node_modules`, then symlinked), never modifying the repo, reproducing
   each finding, reporting only real defects (`file`, `line`, `severity` critical / high / medium /
   low, `failure_scenario`, `suggested_fix`). Lenses used: device fixes (connection / engine / ui /
   session); P0–1 (migration data safety / key coverage / FFN parity / code); P2 (parity / modules
   incl. sanitizer attacks); AO3 (parsers vs real pages / flows incl. FFN regressions / policy);
   import (parsing / security / flows / perf). Order lenses by risk (data safety first).
3. **Refute** (early phases): two refuters per finding defaulting to `real=false` (doubled agent
   count; later replaced by one verifier per finding or for all).
4. **Fix**: one fixer over all findings by id; root cause plus a regression test that fails before
   the fix; per-id outcome `fixed` / `not_a_bug` / `deferred`.
5. **Independent verify**: re-creates every original scenario against the fixed tree, checks a
   regression test exists, hunts for **new** problems (marked realistic or not), runs all checks read-only.
6. **Bounded confirm**: a closing check scoped to the last fixes, the corpus, the checks and sample
   files; **not an open-ended hunt**.
7. **Ship**: the main session re-runs every check, commits and pushes. Agents never commit.

Results: every phase's reviewers found real bugs (migration data safety → `57ec6be`; a sanitizer
`javascript:` bypass via an invisible space; 20 AO3 findings → `6c1015f` + 5 verifier follow-ups →
`a315dbe`; 28 import findings → `16eaf18`). Refuters removed false positives; verifiers caught partial fixes.
What didn't work: open-ended verify → fix loops on heuristics (import r1 10/10 fixed, 6 new; r2 6/7,
8 new; r3 7/9, 6 new). What converged (`phase5-import-converge-2`): corpus first (no src changes) →
fix until it passes → verify (10/10, 4 new) → final fix (critical / high / realistic-medium only) →
confirm (4/4 + one medium fixed by the main session) → `5cc19e8`.
Other helpers: schemas on every agent; per-tree output comparison of repro scripts (`git archive <sha>`
snapshots + a compare script); split big agents; pass real data in `args` and validate it at the top
of the script; resume with `{scriptPath, resumeFromRunId}` (agents with unchanged prompts replay from
cache; editing a later agent's prompt re-runs only that one). Workflow scripts and journals lived in
the old session's directories; they do not exist in a fresh container.

---

### 9.6 Harness constraints
- **Stop hook** (`~/.claude/stop-hook-git-check.sh`) blocks ending a turn with uncommitted changes,
  untracked files, unsigned or wrongly-committed commits, or unpushed commits (fired 5 times). Keep
  scratch out of the repo; end every turn committed and pushed. When reviewers run on uncommitted
  work, commit anyway and point them at `git diff <base commit>` (prompts: "the change may be
  uncommitted or already committed; use `git diff <base>`"); tell the user not to install yet.
- **Auto-mode classifier** may deny actions (2026-10-21: extracting Novelpia's `_t` ticket,
  "[Third-Party Attack]"). Don't work around it: stop, explain, offer the approved alternative. Once
  its note leaked into a subagent's output: verify such outputs and strip the note.
- **Usage limits** killed workflow agents in every multi-agent phase (phase 0–1: 22 of 36 runs; source
  layer 16 of 24; AO3 reviews 3 of 7; import 6 of 14; converge-1 its only agent; first handoff run 5 of
  9). On resume: `git status`, `git log`, inspect partial edits, run checks, resume or finish yourself.
- **Worker restarts** ("This session's worker process was restarted"): re-check state and continue.
- Foreground `sleep` is blocked (use Monitor or `run_in_background`); background work notifies on
  completion (don't poll, don't end a turn waiting); `pkill -f "scripts/dev-proxy.ts"` killed the
  agent's own shell (exit 144): use a `[d]ev-proxy` pattern.
- Network: outbound HTTPS goes through the agent proxy; on a proxy 403 / 407 report the blocked host.
- Context was compacted three times: after a compaction re-derive state from `git log`, `git status` and docs/ROADMAP.md, not memory.

---

### 10.16 Process and orchestration

| What happened | Rule |
|---|---|
| Usage limits killed agents again and again (§9.6) | Commit + push checkpoints when green (`86ec2f4`, `bf3f9f5`, `3212230`); split big agents (converge-1's single "corpus + fix" agent died at step 79 and lost everything; converge-2 split corpus → fix → verify → final-fix → confirm); resume the same script (unchanged prompts replay); after a cut-off run `git status` / `git diff --stat` and the checks |
| Two refuting verifiers per finding doubled agent count; the runner ran about two agents at a time | One verifier per finding or one for all; lenses ordered by risk; when verifiers die, read reviewer findings and fix directly |
| Placeholder args (`phase5-import-fix-round`): the script read `args.not_fixed` but was launched with placeholder input (`"note": "SEE FILE"`) | Validate `args` at the top (throw on wrong shape) or inline data from a file just written; check the first `log()` line |
| The stop hook demanded a commit while reviewers read uncommitted changes | Point reviewers at `git diff <base>`; commit early |
| Prompt drift: a verifier was told work was uncommitted after `49442b7` was pushed | Keep later prompts in sync with the real tree (edit only the tail of a script) |
| Adversarial verifiers always find another edge case | Bound it: ≤ 3 rounds, drop low-severity new findings in the last, then a corpus and a **closing check that is not an open-ended hunt**; fix the last medium item directly with a narrow rule |
| Reviewers worked in copies and `git archive` snapshots | Keep that; snapshots settle "which behaviour was right" quickly |
| Research claims were wrong (Speechify free tier said 500K chars/month, actually 50K; "avoid `\p{}`") | Fact-check vendor claims and runtime limits; mark measured vs quoted vs inferred |
| Several "done" moments were followed by verifier findings | Read actual results, run checks yourself, say test-only vs device |
| Design phase numbers didn't match build order | Use stable ids (docs/ROADMAP.md) |
| Context compacted three times | Re-derive state from git and docs/ROADMAP.md |
| 2026-10-27: Bash calls sometimes failed with "auto mode classifier gave no verdict" several times in a row (ten in a row ends the turn) | Retry once; meanwhile use Read / Grep / Glob / WebFetch (read-only tools don't need the classifier); don't loop |
| 2026-10-27: no review agents were spawned (the harness says not to unless the user asks) | Do the multi-lens review inline: re-read the diff per lens, mutation-check each new test (break the code, see it fail, restore) |

---

## 1. Resume protocol

> Superseded by `AGENT_ROOT.md` + `ACTIVE_HANDOFF.md` (2026-11-01); kept for its detailed steps and
> checks. "This file" and "the front matter" below meant the old FEATURES.md (now `docs/ROADMAP.md`,
> `ACTIVE_HANDOFF.md` and `docs/history.md`).

1. **Read this file** top to bottom: the front matter, the rules in `AGENT_ROOT.md` §2, the order in `docs/ROADMAP.md` §3, then the
   phase named by `next_task`.
2. **Read AGENT_ROOT.md + docs/**:
   - `docs/user_and_install.md` §2 "The user" (how they build, test and install; how to talk to them);
   - §9 "Process and conventions" (git, commits, workflows, harness constraints);
   - `AGENT_ROOT.md` §10 "Lessons learned" (the rules in `AGENT_ROOT.md` §10.0 apply to every change);
   - then `docs/architecture.md` §4 (architecture and codebase map) and `docs/database_schema.md` §5 (data model and storage) for the files the phase touches.
3. **Verify the repo** (one command per line):
   ```
   cd /home/user/mhm
   git fetch origin
   git status -sb
   git log --oneline -5
   git config user.email
   ```
   Expect branch `claude/ficshelf-fanfiction-app`, a clean tree, up to date with
   `origin/claude/ficshelf-fanfiction-app`, HEAD at or after `base_commit` in the front matter
   (plus the commit that last updated this file), and `noreply@anthropic.com`. Never change git config. If the tree is dirty, a
   previous session was cut off mid-step: read `git diff --stat`, decide whether the partial work
   is usable, and re-run the checks before trusting it.
4. **Verify the toolchain**:
   ```
   node -v
   npm ci
   ```
   Node must be 22.13 or later (`package.json` engines). Ignore npm's vulnerability notice; never
   run `npm audit fix` (it breaks the SDK 57 pins). If `npm ci` fails on the lockfile, use
   `npm install`.
5. **Run the checks** and compare with `checks_at_base` in the front matter:
   ```
   npx tsc --noEmit
   npx jest
   npm run lint
   npx expo export --platform ios --output-dir "$(mktemp -d)"
   ```
   - jest: the count in `checks_at_base`. The cold-cache timeout in `tests/import-screen.test.tsx`
     and the sanitizer timing check were given headroom in PRE-1 (1cca7be); if a timing test still
     fails once under load, rerun it alone before chasing it.
   - lint must end with `check-keys: ok`.
   - The export output dir must be outside the repo.
   - Clip phases also: `npx tsx scripts/clip-check.ts` (headless Chromium, synthetic pages and sites, no network; 39/39 at base).
   - `npx expo-doctor` should say 21/21.
   - Optional, at most once per phase: `npm run live-check -- --source ao3` (5 AO3 requests, 3 s apart).
   - If Bash calls fail with "auto mode classifier gave no verdict", that's transient: retry once,
     use Read / Grep / Glob meanwhile, and don't burn ten failures in a row (the turn stops).
6. **Do the preflight items** (§1.1). They are small; commit them with the first phase commit or on their own.
7. **Pick the task**: P-UI1 (`docs/ui_rules.md` §3a) is built (2026-11-01) and waits for the user's phone check;
   fix what they report there first (keep matching the preview; ask before deviating). Then the
   first phase in `docs/ROADMAP.md` §3 whose status is `pending` (clipping device checks and polish; P4 / P7 Wattpad are on hold). A new
   message from the user overrides this order. Tell the user in one or two plain lines what you are
   picking up.
8. **Work the phase**:
   - re-read the code the phase touches (the file lists below were checked at `5cc19e8`; re-check
     line-level claims);
   - plan the checklist items as tasks;
   - implement, then review with 2–4 lenses, fix, verify independently, then a bounded confirm
     (§9.5);
   - follow `AGENT_ROOT.md` §2 (rules), the per-site policies, the fixture policy and, for import changes, the
     corpus rules;
   - commit a checkpoint as soon as a step's checks are green (usage limits cut sessions off).
9. **Ship**: re-run every check yourself; update README's Verification row (`| N / N pass |`), the
   README / PLAN / INSTALL text and this file (ticks, status, front matter); commit with the
   required trailers; push.
10. **Report to the user** in plain language: state ("pushed, ready to install" or "pushed, don't
    install yet"), commit hash, test count, what changed (short bullets, no file paths), what was
    only tested versus confirmed on a phone, the exact install steps (`docs/user_and_install.md` §2.4,
    T1 or T2, one command per code block), what to try on the phone, and "don't delete the app".

### 1.1 Preflight (do first in the next session)

- [x] PRE-1 Add `jest.setTimeout(30_000);` at the top of `tests/import-screen.test.tsx` (cold-cache
      timeout cascade). Optionally give `tests/sanitize.test.ts:163` more headroom (for example
      3000 ms). (1cca7be)
- [x] PRE-2 Fix stale docs (1cca7be):
  - `PLAN.md` §4 (`npm test # unit tests (712)`) and §5 ("712 unit tests") → the current count;
  - `INSTALL.md` intro line 7 ("Nobody has run a full iPhone build of this branch yet") → the user
    has built and run it since 2026-10-06;
  - `README.md` line ~197 "Not verified here" bullet about the desktop UA / redirect / background
    audio "haven't run on an iPhone yet" → confirmed "everything works" on 2026-10-06;
  - `README.md` Verification row `npx expo-doctor | 21 / 21` → 20/21 with the patch drift noted,
    or fix the drift (PRE-4);
  - INSTALL "The file-import update": add "check the scheme is still Release" after prebuild.
- [x] PRE-3 `scripts/live-check.ts`: any `--source` other than `ao3` silently runs the FFN check
      (`target = … : 'ffn'`, line ~288). Reject unknown values with a message (a `wp` branch comes
      in P4). (1cca7be)
- [x] PRE-4 (done 2026-10-27 with the Xcode 27 / Swift 6.4 build fix, a native change; `npx expo install --fix`, expo-doctor 21/21, expo-modules-jsi 57.1.3) (previously: only bundled with the next native change, never on its own) `npx expo install --check`
      to clear the 11 patch mismatches (`expo` 57.0.27 → ~57.0.31, `expo-router` 57.0.25 → ~57.0.29,
      `jest-expo` 57.0.5 → ~57.0.6, …). These are native packages, so this makes the user's next
      update a prebuild (T2). Not needed for P-CLIP; do not do it in a JS-only phase.
