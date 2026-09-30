# Path Picker: committed test suite (bun pure-logic checks + Playwright E2E)

**Date:** 2026-09-29
**Status:** implemented & verified (`npm run typecheck:tests`; `npm run test:units` → 4/4; `npm run test:e2e` → `16 passed` ≈ 1.8 m against code-server + CDP 9024).
**Scope:** `tests/units/*`, `tests/playwright/*`, `tests/workspace/*`, `playwright.config.ts`, `tsconfig.tests.json`, `package.json`, `Makefile`, `.vscodeignore`, `.gitignore`, `src/text.ts`, `src/picker.ts`, `docs/important/how-to-test.md`, `docs/important/vscode-quick-pick-quirks.md`, `README.md`, `AGENTS.md`; meta `docs/important/how-to-test-all.md`.

---

## 0. Session summary

One session took *path picker* from **zero committed tests** to a two-layer
suite: **bun pure-logic checks** over the shipped modules and a
**16-test Playwright E2E** that drives the real code-server + CDP stack.

| Phase | Delivered |
| --- | --- |
| **Pure logic** | `tests/units/{fuzzy,paths,gitignore,text}_check.ts`; extracted `truncateLeft` into a `vscode`-free `src/text.ts` so it is unit-testable |
| **E2E core** | `@playwright/test` project (`rest.ts`, `workbench.ts`, `fixture.ts`, `path-picker.spec.ts`), `playwright.config.ts`, `tsconfig.tests.json`, npm/Make targets |
| **Determinism** | Dedicated fixture workspace `tests/workspace/` + folder switch in `beforeAll`/`afterAll` (the meta workspace has 94 238 files against a 30 000 index cap) |
| **Oracle** | Status-bar copy echo (`Copied relative path: …` / `Copied real path: …`) — the host clipboard is unusable under code-server |
| **Hygiene** | Runtime fixtures are generated into gitignored paths and removed in a `finally`; Playwright output moved to `exp/playwright` |
| **Docs** | `how-to-test.md` (rewritten), quirks reference, `README.md`, `AGENTS.md`, and the meta playbook |

Total: **16/16 E2E green**, **4/4 unit checks green**, `npm run typecheck:tests`
clean, and a deliberately-failed run still left the tree clean.

---

## 1. Problem

The extension had **no committed tests at all** — no `tests/` directory. Its
`docs/important/how-to-test.md` described a `full.js` / `edges.js` Playwright
suite, and `AGENTS.md` referenced `open_view.cjs` / `test_preview.cjs` /
`cdp_eval.cjs`, but none of those files existed. The doc was also written for a
desktop/macOS instance (`pbpaste`, `code --user-data-dir …`) while the live
environment is **code-server in Docker on nuc + a CDP browser on pp**. It cited
the stale extension id `lamnt45.vscode-path-picker`; the package now publishes
as `lamnguyenx.hacker-path-picker`.

## 2. Goal

A committed, runnable suite in the modern repo style (as in
`vscode-hacker-browser` / `vscode-hacker-terminal-enhanced`): pure logic checked
with bun against the shipped sources, and E2E with `@playwright/test` where
REST Control arranges/acts and Playwright asserts — plus docs that match the
code-server topology.

## 3. Design

```
Layer          Needs                       How
-----------------------------------------------------------------------------
Pure logic     bun only                    import src/{fuzzy,paths,gitignore,text}
E2E (act)      code-server + REST Control  vscode.commands.executeCommand / custom.eval
E2E (assert)   CDP browser (Playwright)    QuickPick DOM + status-bar copy echo
```

### Files

- `tests/units/` — `fuzzy_check.ts` (glob→RegExp, escaping, fuzzy scoring),
  `paths_check.ts` (`rootOf`/`relativeToRoot`/`realPath`),
  `gitignore_check.ts` (layered `.gitignore` + negation), `text_check.ts`
  (segment-aware truncation).
- `tests/playwright/rest.ts` — REST Control client
  (`HACKER_REST_CONTROL_PORT`).
- `tests/playwright/workbench.ts` — `connectWorkbench()`
  (`chromium.connectOverCDP`), folder switch + REST re-poll, QuickPick helpers,
  status-bar oracle, Global-scope settings snapshot/restore.
- `tests/playwright/fixture.ts` — writes/removes the **runtime** half of the
  fixture workspace.
- `tests/playwright/path-picker.spec.ts` — 16 tests.
- `tests/workspace/` — the **committed, clean** fixture tree.
- `playwright.config.ts`, `tsconfig.tests.json`.

### The picker is not a webview

Unlike *hacker browser* / *hacker markdown*, there is **no iframe and no OOPIF**:
the picker is the workbench's own QuickInput widget, rendered in the top-level
page, so plain Playwright locators see it:

```js
.quick-input-widget            // visible while open
  .quick-input-title           // "Path Picker"
  input                        // the query (focused)
  .monaco-list-row             // rows (label text)
```

Do **not** use the accessibility snapshot — it omits the quick input widget.

### Fixture workspace

The meta workspace is enormous (94 238 files via `findFiles`) and the index is
capped (`pathPicker.maxEntries`, 30 000), so a query's results are not
deterministic. The suite switches code-server to the committed fixture
`tests/workspace/` and back:

```
committed (clean)              runtime (written in beforeAll, deleted in afterAll)
  .gitignore                     ignored.log            (gitignored file)
  README.md  main.ts             scratch.tmp            (*.tmp)
  src/app.ts                     build/output.js        (build/)
  src/deep/nested.ts             symlink-src -> src     (followSymlinks)
  src/components/Button.tsx      long-paths/very-long-directory-name/
  docs/guide.md                    another-very-long-directory-name/
  docs/api/endpoint.md             an-example-file-with-a-long-name.ts  (>80 chars)
```

Default root rows are exactly `docs/`, `long-paths/`, `src/`, `.gitignore`,
`main.ts`, `README.md`; the gitignored entries are on disk but never indexed,
and `symlink-src/` appears only with `followSymlinks: true`.

### Copy oracle: the status bar

The extension echoes every copy as `Copied relative path: …` /
`Copied real path: …` in the status bar. That is the user-visible result and it
carries the exact payload, so the suite polls `.statusbar-item` — see Trial 4
for why the clipboard itself cannot be used here.

## 4. Trials, errors & lessons learnt

### Trial 0 — "no tests" was only half the problem; the loaded extension was stale

**Symptom.** `vscode.commands.getCommands(true)` contained no `pathPicker.*`.
**Diagnosis.** The repository's `tests/` was missing entirely, *and* the
code-server container had an old `lamnt45.vscode-path-picker-0.0.1` installed
(same command ids), while the current build is
`lamnguyenx.hacker-path-picker-2026.9.3`.
**Further trap.** Two code-server data dirs exist on nuc: the container's
mounted `exp/code-server/.local/share/code-server` and the host's real
`~/.local/share/code-server`. `make install`'s `code-server --install-extension`
targeted the *host* dir and did nothing for the running container; installing
with an explicit `--user-data-dir`/`--extensions-dir` pointing at the mounted
dir was required.
**Fix.** `make build`, then uninstall the old id and install the current VSIX
into the container's extensions dir; a folder switch (below) restarts the host
so the new code loads.
**Lesson.** Install the identity you ship and verify what the *host* loaded
(`vscode.extensions.getExtension(id)`), not what a directory listing shows.

### Trial 1 — a symlinked fixture broke `vsce package`

**Symptom.** `make build` → `EISDIR: illegal operation on a directory, read
.../tests/workspace/symlink-src`.
**Diagnosis.** `vsce` tried to read the symlinked directory as a file because
`tests/` was not excluded from the VSIX.
**Fix.** Added `tests/**`, `playwright.config.ts`, `tsconfig.tests.json` to
`.vscodeignore`.
**Lesson.** Any new top-level test tree must be kept out of the packaged VSIX.

### Trial 2 — the real workspace is not deterministic

**Symptom.** A `/tmp`-style "query a fixture file" assumption was untestable
against the meta workspace.
**Diagnosis.** `vscode.workspace.findFiles('**/*')` returns **94 238** paths for
the meta repo, but `PathIndex.build()` stops at `maxEntries` (30 000), so which
fixtures survive is arbitrary.
**Fix.** A dedicated workspace of ~10 files (below).
**Lesson.** Test against a bounded fixture when the subject indexes the whole
workspace.

### Trial 3 — `/tmp` puts code-server into Restricted Mode

**Symptom.** Navigating to `?folder=/tmp/pp-e2e-ws` (created inside the
container) left REST Control unreachable: even `custom.eval 1+1` timed out and
the status bar read **Restricted Mode**.
**Diagnosis.** An untrusted workspace disables *all* user extensions, so the
REST-control extension never activates. (The asymmetry the general playbook
describes — pure evals work but commands/config hang — shows up here as "REST
never binds at all" when the control extension itself is the disabled one.)
**Fix.** Put the fixture **inside the already-trusted meta repo**
(`_submodules/vscode-hacker-path-picker/tests/workspace`); trust is inherited
from the parent folder. Verified `vscode.workspace.isTrusted === true` and REST
returning on the new folder.
**Lesson.** The fixture must live under a trusted folder. Verify
`isTrusted` before chasing "missing command".

### Trial 4 — the clipboard is not a usable oracle under code-server

**Symptom / probes.**
- `vscode.env.clipboard.writeText('…')` resolved (`"wrote"`), but a host-side
  `vscode.env.clipboard.readText()` **never returned** (request hung).
- With CDP `navigator.clipboard` permissions granted, a direct write/read in the
  page round-tripped, but after the extension copied, `readText()` returned an
  unrelated path — the clipboard is shared/synced (the host runs ClipCascade).
- Monkey-patching `vscode.env.clipboard.writeText` to capture the payload
  failed: `Cannot assign to read only property 'writeText'`.

**Fix.** Assert the **status-bar echo** instead. It is the extension's
user-visible output and includes the exact copied text.
**Gotchas discovered with it.**
- Messages auto-hide after ~4 s: assert promptly.
- The status bar also carries live items (Git branch, network speed), so
  "did the status bar change?" is *not* an oracle — match
  `^Copied (?:relative|real) path: `.
- Call `waitCopyCleared()` before a *negative* assertion so a previous echo
  cannot produce a false positive.

### Trial 5 — folder navigation restarts the extension host

**Symptom.** Immediately after `page.goto('?folder=…')` every REST call was
`ECONNREFUSED` while the workbench repainted.
**Diagnosis.** Switching folders tears down and recreates the extension host;
the control server re-binds seconds later (~18–26 s on this stack).
**Fix.** `waitForRest(page)` polls `custom.eval 1+1` until it answers, then a
short settle. `beforeAll` captures the original URL **before** navigating, and
`afterAll` restores it in a `finally`; if a run crashed while on the fixture the
restore falls back to the meta repo.
**Lesson.** Treat a folder switch as a full host restart — poll the control
channel, never assume it is up.

### Trial 6 — TypeScript module-format minefield

- `src/gitignore.ts` uses `import ignore = require('ignore')`, which errors
  (`TS1202`) under an `ESNext` tsconfig. The Playwright suite is CommonJS (the
  package has no `"type"`), so `tsconfig.tests.json` uses
  `module: CommonJS` / `moduleResolution: node` and the helper uses `__dirname`
  rather than `import.meta.url`.
- The bun units use top-level `await`, which errors (`TS1378`) under CommonJS →
  wrapped in `async function main()`.
- Spreading `NodeListOf` inside `page.evaluate` needed `DOM.Iterable` in `lib`.

**Lesson.** One tsconfig for units + Playwright tests + src means reconciling
module formats; pick the runtime's module system (CJS for Playwright here).

### Trial 7 — the QuickPick re-sorts, so DOM order ≠ extension order

**Symptom.** The `*.ts` glob result rendered the longest path **first**, while
`entriesFor` sorts by relative-length ascending.
**Diagnosis.** The QuickPick's `sortByLabel` defaults to `true` and re-orders
rows by label (an ellipsis-prefixed label sorts before ASCII).
**Fix.** Compare glob result sets order-insensitively; assert order only where
it is the behavior under test (the active/first row).
**Lesson.** Assert the extension's *order* in the pure layer; assert *membership*
in the widget.

### Trial 8 — a "no match" fuzzy query that matched

**Symptom.** The new gitignore test queried `scratch` and got the long-path file
back (`fuzzyScore('scratch', longRel) === 7`).
**Diagnosis.** The fuzzy matcher is a greedy subsequence over the whole relative
path and happily crosses segment boundaries, so a query rarely matches only the
file you mean.
**Fix.** The exclusion test uses **glob** queries (`*.log`, `*.tmp`, `build/*`)
which go through `globMatch` and cannot cross-match. The root-row assertions
(`rows` must not contain `ignored.log` / `scratch.tmp` / `build/`) cover the
rest.
**Lesson.** For "must not appear", prefer a glob or a structural assertion over
fuzzy text.

### Trial 9 — `custom.eval` and the status bar are not boolean oracles

- A `page.evaluate` snapshot distinguishes `display` and `focused`, not just
  "visible"; after accept the widget stays in the DOM with `display: none`, so
  assert on DOM visibility (`toBeHidden`).
- Status messages persist for 4 s, and the status bar has other live items;
  see Trial 4.

## 5. Round 2 — fixture hygiene & post-test cleanup

The first cut committed the awkward parts of the fixture: the force-added
`ignored.log` / `scratch.tmp` / `build/output.js` (needed so the extension could
see files its own `.gitignore` hides), a committed symlink, and a genuinely
absurd long path
(`verylongdirectoryname-aaaa…/…/example-file-with-a-really-long-name-here.ts`).
This is exactly the kind of "weird file" a reviewer flags.

### Fix

- The committed tree is now **clean**: `.gitignore`, `README.md`, `main.ts`,
  `src/**`, `docs/**`.
- `tests/playwright/fixture.ts` **generates** the ignored files, the symlink and
  the `long-paths/…` file in `beforeAll`, and deletes them in `afterAll` **in a
  `finally`** so even a failing run leaves nothing behind.
- Every generated name is listed in the repo's root `.gitignore`
  (`tests/workspace/{ignored.log,scratch.tmp,symlink-src,long-paths/}`, with
  `build/` already covered by the generic rule) so a *crashed* run still does
  not dirty `git status`.
- Playwright's `outputDir` moved to `./exp/playwright` (gitignored) so its
  `.last-run.json` no longer creates a stray root `test-results/`; the one that
  had been created was deleted.
- Added a dedicated check, `gitignored files and directories never reach the
  picker`, using globs.

### Lessons

- **Commit only the interesting static fixture; generate the "ignored" half.**
  Files that exist to be hidden fight `git` (they need `git add -f`) and look
  like junk.
- **Gitignore every generated path** — cleanup runs in `afterAll`, but a hard
  interrupt must not leave tracked noise either.
- **Keep tool run-artifacts out of the tree** (`outputDir` under `exp/`).
- The user's phrasing is a good lint: "make sure the tests write into gitignored
  dirs" and "make sure there is a post-test cleanup mechanism".

## 6. Verification

```sh
cd _submodules/vscode-hacker-path-picker

# pure logic (no host)
make test-units          # fuzzy/paths/gitignore/text -> all passed
make typecheck-tests     # tsc -p tsconfig.tests.json -> clean

# build + install into the *container's* code-server data dir
make build               # produces build/lamnguyenx.hacker-path-picker-2026.9.3.vsix
EXT=/home/lamnt45/git/vscode-hacker-meta/exp/code-server/.local/share/code-server/extensions
UD=/home/lamnt45/git/vscode-hacker-meta/exp/code-server/.local/share/code-server
code-server --extensions-dir "$EXT" --user-data-dir "$UD" \
  --install-extension build/lamnguyenx.hacker-path-picker-2026.9.3.vsix --force

# E2E (REST Control 40620, CDP browser 9024)
make test-e2e            # 16 passed (~1.8 m)
```

Run history / observations on the reference stack:

- First full E2E: `15 passed (1.8m)`.
- After the hygiene rework: `16 passed (1.8m)`.
- A run that **failed** at the new exclusion test still cleaned up: no runtime
  fixtures, original folder restored, no root `test-results/`.
- Units: `fuzzy_check` / `paths_check` / `gitignore_check` / `text_check` all
  pass; `typecheck:tests` clean.

## 7. Follow-ups

- **No-workspace message** (`Path Picker: open a folder …`) has no stable
  oracle and is left manual (needs a folderless window).
- **The open keybinding** (`meta+alt+shift+p`) is not exercised — tests invoke
  `pathPicker.pickPath` over REST. Trusted CDP key input could cover it.
- **The real clipboard is unverified**; the suite proves the payload via the
  status-bar echo only. A host-OS oracle (or fixing `clipboard.readText()`
  under code-server) would strengthen it.
- **`maxEntries`** is asserted weakly (`rows.length < default root count`); a
  smaller, fully enumerable fixture would let it assert an exact count.
- **Dev-host (Option B)** coverage is documented but not committed; the helpers
  assume the runner and the extension host see the fixture at the same absolute
  path (`PP_EXT_ROOT` overrides).
- Consider `sortByLabel = false` in the extension if deterministic row order in
  the widget is ever desired (today the extension's own order is unit-tested,
  not UI-asserted).

## 8. Lessons learnt (consolidated)

### Environment & host health

- **Verify the loaded extension / its id** (`vscode.extensions.getExtension`)
  and install into the right code-server data dir — the host's
  `~/.local/share/code-server` is not the container's mounted one.
- **A folder switch is a full extension-host restart.** Poll REST until it
  returns; capture the previous folder first and restore it in `afterAll`.
- **Restricted Mode disables every user extension** (including REST Control).
  Keep the fixture under a trusted folder.

### Test design

- **Layer it:** pure logic with bun (against the shipped `src`), then E2E.
  Extract pure helpers (`truncateLeft` → `src/text.ts`) when needed.
- **REST → arrange/act, Playwright → assert only.**
- **No webview here:** the QuickPick is top-level workbench DOM; the a11y
  snapshot omits it, so query with `page.evaluate`/locators.
- **The widget re-sorts** — assert membership, not the extension's order, in the
  DOM.
- **For exclusion assertions use globs**, not fuzzy text, which crosses
  segments.
- **Assert the user-visible echo** (the status bar) and poll it; remember its
  4 s timeout and the other live status items.

### Fixture & state hygiene

- **Commit a clean fixture; generate the ignored half at runtime** and delete it
  in a `finally`.
- **Gitignore every generated path** and keep tool artifacts under `exp/`.
- **Snapshot/restore Global-scope settings** (`inspect().globalValue`,
  remove-if-absent) so a run never mutates the developer's profile.

### Packaging

- Keep `tests/**` (and configs) in `.vscodeignore`; a symlinked fixture
  otherwise breaks `vsce package` with `EISDIR`.
