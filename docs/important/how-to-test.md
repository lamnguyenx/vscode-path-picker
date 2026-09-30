# How to Test Path Picker

> **General rules live in the meta repo** —
> [`how-to-test-all.md`](../../../../docs/important/how-to-test-all.md). Read it
> first: it consolidates environment choice, the control-channel-vs-CDP model,
> determinism, state hygiene, ports/paths, cache-busting, A/B isolation, and
> flakiness. This document keeps only what is specific to *path picker*.

Path Picker has two committed layers:

| Layer | Where | Needs | Run |
| --- | --- | --- | --- |
| **Pure logic** | `tests/units/*_check.ts` | `bun` only | `make test-units` |
| **E2E** | `tests/playwright/` (`@playwright/test`) | code-server + CDP browser + REST Control | `make test-e2e` |

The E2E suite arranges/acts through **REST Control** and asserts the
**QuickPick DOM** and the **status-bar copy echo** over CDP — see
`docs/important/how-to-test-all.md` §3 ("REST → arrange + act, CDP → assert
only"). There is no webview/iframe: the picker is the workbench's own QuickInput
widget, rendered in the top-level page.

## 0. Prerequisites (code-server, Option A)

Start the reference stack from the meta repo (`docker-compose.yml`), install
this extension, and make sure the CDP browser is reachable:

```bash
# build + install into the *container's* code-server data dir
make build
EXT=/home/lamnt45/git/vscode-hacker-meta/exp/code-server/.local/share/code-server/extensions
UD=/home/lamnt45/git/vscode-hacker-meta/exp/code-server/.local/share/code-server
code-server --extensions-dir "$EXT" --user-data-dir "$UD" \
  --install-extension build/lamnguyenx.hacker-path-picker-*.vsix --force

# CDP browser (pp) + REST Control must be up:
curl -s http://127.0.0.1:9024/json/version     # browser
curl -s -X POST http://127.0.0.1:40620/ -H 'Content-Type: application/json' \
  -d '{"command":"custom.eval","args":["1+1"]}'   # REST Control -> 2
```

`CDP_PORT` (default `9024`) and `HACKER_REST_CONTROL_PORT` (default `40620`)
are the only knobs; both read from the environment.

> A just-reinstalled extension is only picked up after the extension host
> restarts. The suite switches folders in `beforeAll`, which restarts the host,
> so it always loads the freshly installed build.

## 1. Pure-logic checks

```bash
bun tests/units/fuzzy_check.ts        # glob -> RegExp, escaping, fuzzy scoring
bun tests/units/paths_check.ts        # rootOf / relativeToRoot / realPath
bun tests/units/gitignore_check.ts    # layered .gitignore + negation
bun tests/units/text_check.ts         # segment-aware label truncation
make test-units                       # all four
make typecheck-tests                  # strict tsc over tests/ + configs
```

These import the shipped `src/**` modules directly. To keep that possible, the
interesting logic lives in modules with **no `vscode` import**
(`fuzzy.ts`, `paths.ts`, `gitignore.ts`, `text.ts`); `picker.ts` only wires them
to the widget.

## 2. E2E suite

```bash
make test-e2e                         # CDP_PORT=9024 npm run test:e2e
# or: CDP_PORT=9024 npx playwright test --config playwright.config.ts
```

Files:

- `tests/playwright/rest.ts` — REST Control client (`custom.eval`,
  `executeCommand`).
- `tests/playwright/workbench.ts` — connect/CDP, folder switch, QuickPick
  helpers, the status-bar copy oracle, and settings snapshot/restore.
- `tests/playwright/path-picker.spec.ts` — the 16 checks.
- `tests/workspace/` — the controlled fixture tree (see §3).

What the checks cover: command activation; root listing with `.gitignore`
exclusions and hidden symlinks; fuzzy and path queries; glob queries;
`Enter` → relative copy; `Shift+Enter`/`pathPicker.copyRealPath` → real copy;
directory pick; `revealInExplorer`; unmatched query staying open; absolute-path
queries; no-op commands while the picker is closed; and the
`followSymlinks` / `exclude` / `maxEntries` settings.

### Why the **status bar** is the copy oracle

`vscode.env.clipboard.writeText` succeeds but a host-side `readText()` **hangs**
under code-server, and the browser clipboard is shared/synced (ClipCascade) so a
`s?pbpaste` / `navigator.clipboard.readText()` check is unreliable. The
extension echoes every copy as `Copied relative path: …` / `Copied real path: …`
in the status bar; that is the user-visible result and it carries the exact
payload, so the suite polls `.statusbar-item` for it. Messages auto-hide after
~4 s — assert promptly, and call `waitCopyCleared()` before a *negative* check.

### QuickPick DOM selectors

```js
document.querySelector('.quick-input-widget')            // visible while open
  .querySelector('.quick-input-title')                   // "Path Picker"
  .querySelector('input').value                          // the query
  .querySelectorAll('.monaco-list-row')                  // rows (label text)
```

Do **not** use the accessibility snapshot — it omits the quick input widget
(`vscode-quick-pick-quirks.md` §7).

## 3. The fixture workspace (determinism)

The meta workspace has ~94 000 files while the index is capped at
`pathPicker.maxEntries` (30 000), so which files appear is not deterministic.
The suite therefore switches code-server to the committed fixture at
`tests/workspace/` and back to the original folder in `afterAll`.

**Committed (clean) tree:**

```
tests/workspace/
  .gitignore          ignored.log, build/, *.tmp
  README.md  main.ts
  src/app.ts  src/deep/nested.ts  src/components/Button.tsx
  docs/guide.md  docs/api/endpoint.md
```

**Written at runtime** by `tests/playwright/fixture.ts` in `beforeAll` and
**deleted in `afterAll`** (the names are all listed in the repo's root
`.gitignore`, so a crashed run does not dirty `git status`):

```
tests/workspace/
  ignored.log            gitignored file (must not be indexed)
  scratch.tmp            gitignored by *.tmp
  build/output.js        gitignored directory (build/)
  symlink-src -> src     proves pathPicker.followSymlinks
  long-paths/very-long-directory-name/another-very-long-directory-name/
    an-example-file-with-a-long-name.ts   >80-char label (truncation)
```

The default root rows are therefore exactly `docs/`, `long-paths/`, `src/`,
`.gitignore`, `main.ts`, `README.md`; the gitignored files and `build/` are on
disk but never indexed, and `symlink-src/` appears only with
`followSymlinks: true`. The runtime half means the committed fixture contains
no junk files, no symlink and no ugly long path — only the generated ones, which
are cleaned up.

One constraint:

- **The fixture must stay inside a trusted folder.** `code-server` runs in
  Restricted Mode for an untrusted folder (`/tmp/…`), which disables *all* user
  extensions — REST Control never binds and every command hangs. The fixture is
  a subfolder of the already-trusted meta repo, so it inherits trust. Opening
  `/tmp/...` instead silently breaks the suite.

## 4. Bugs found this way

The `QuickPick` widget **re-filters items itself** against the raw query using
its own fuzzy matcher on the label/description. Path queries like
`src/deep/nested.ts` never match a label of `nested.ts`, so every row would be
hidden even though the extension computed results. Fix: set
`alwaysShow: true` on every item and do all filtering yourself (covered by the
"path query with slashes" check).

Related issues discovered during testing:

- **Stale selection**: `selectedItems` survives a hide/show cycle, so a
  previous pick could be copied when the list was empty. Fix: reset
  `activeItems`/`selectedItems` on every show (covered by "reopening resets").
- **Stale value**: reopening kept the previous query. Fix: reset `value` on show.
- **Glob prefix double-escape**: prepending `(?:.*/)?` to a glob *before*
  converting it to a regex escapes the regex metacharacters. Build the raw
  regex first, then prepend the prefix (covered by `fuzzy_check.ts`).
- **Auto-description from `resourceUri`** (VS Code ≥ 1.112): any
  `QuickPickItem` that sets `resourceUri` but *no* `description` gets one
  auto-filled by the renderer, so the row shows the path twice. Fix: always set
  `description: ''`. See `vscode-quick-pick-quirks.md`.
- **Right-only ellipsis**: the widget truncates long labels on the right. Fix:
  pre-truncate in code, keeping the tail (`truncateLeft` in `src/text.ts`,
  80 chars, segment-aware with a `…/` prefix; covered by `text_check.ts` and a
  `*.ts` glob check).
- **Status bar check**: on the Welcome screen the status bar is not rendered;
  the E2E suite opens a folder, so it is present.

## 5. State hygiene

- `beforeAll` writes the runtime fixtures (`tests/playwright/fixture.ts`);
  `afterAll` removes them **in a `finally`**, so even a failing run leaves no
  `ignored.log` / `build/` / `symlink-src` / `long-paths/` behind. Their names
  are in the root `.gitignore` as a belt-and-braces guard.
- Playwright's run artifacts go to `outputDir: ./exp/playwright` (already
  gitignored), so no `test-results/` appears in the repo root.
- `afterEach` closes the picker and restores the three `pathPicker.*` settings
  to their **Global-scope** values captured in `beforeAll` (`setConfig(key,
  undefined)` removes a key that did not exist).
- `afterAll` switches code-server back to the folder it was on and disconnects.
  If a run crashed while on the fixture, the next run falls back to the meta
  repo instead of restoring the fixture.
- The workbench destabilizes after a lot of picker churn; run the suite against
  a quiet host and restart code-server between larger batches.

## 6. Manual / limits

- The "no workspace open" information message has no stable oracle (it needs a
  folderless window) — check it by hand.
- Dev-host (Option B) runs are supported in principle (same helpers, picker is
  still a workbench widget), but the committed suite targets code-server. The
  fixture path must be visible to the extension host; adjust `PP_EXT_ROOT` if
  the runner and host do not share an absolute path.
