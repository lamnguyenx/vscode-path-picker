# How to Test Path Picker

This extension was validated end-to-end against a **real, running VS Code instance** (not unit mocks). The extension runs in an isolated profile with a fresh `user-data-dir` and its own `extensions-dir`, and is driven over the Chrome DevTools Protocol (CDP) with Playwright. Clipboard results are verified on the OS level with `pbpaste`.

## 1. Build and package

```bash
cd ~/git/vscode-path-picker
make build                  # npm install + compile + vsce package
```

Produces `vscode-path-picker-0.0.1.vsix`.

## 2. Launch an isolated test instance

The test instance must not touch your daily VS Code setup, so it gets its own
user data and extension dirs, and its own debugging port:

```bash
# test workspace with a representative tree (files + nested dirs)
mkdir -p /tmp/pcp-ws/src/deep /tmp/pcp-ws/src/components /tmp/pcp-ws/docs /tmp/pcp-ws/build
touch /tmp/pcp-ws/main.ts \
      /tmp/pcp-ws/src/app.ts /tmp/pcp-ws/src/deep/nested.ts \
      /tmp/pcp-ws/src/components/Button.tsx \
      /tmp/pcp-ws/docs/README.md

# pre-seed settings: disable workspace-trust dialog and window restore
mkdir -p /tmp/pcp-ud/User
printf '{\n  "security.workspace.trust.enabled": false,\n  "window.restoreWindows": "none"\n}\n' \
  > /tmp/pcp-ud/User/settings.json

# install the VSIX into the isolated extensions dir
code --extensions-dir /tmp/pcp-ext \
     --install-extension vscode-path-picker-0.0.1.vsix --force

# launch with remote debugging (pick a free port, e.g. 9341)
code --user-data-dir /tmp/pcp-ud \
     --extensions-dir /tmp/pcp-ext \
     --remote-debugging-port=9341 \
     --new-window /tmp/pcp-ws &
sleep 10
curl -s http://127.0.0.1:9341/json/list   # expect: page | Welcome — pcp-ws
```

> Note: `--remote-debugging-port` is passed through to Electron/Chromium; VS Code
> prints a warning about it being an unknown option — that is expected.
>
> If the port is already taken by another VS Code instance, pick another one.

## 3. Drive the UI with Playwright over CDP

```bash
cd exp && npm i -D playwright-core   # no browser download needed; attaches via CDP
```

The core suite (`full.js`) exercises: opening via keybinding, path queries,
relative copy on Enter, value reset on reopen, real-path copy on Shift+Enter,
reveal in Explorer on Cmd+Enter, directory picking, absolute-path queries,
and glob queries.

```js
const { chromium } = require('playwright-core');
const { execSync } = require('child_process');

const PORT = process.env.PORT || '9341';

async function main() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts().flatMap(c => c.pages())
    .find(p => p.url().includes('vscode-app')) || pages[0];
  await page.bringToFront();
  await page.waitForTimeout(1200);

  const press = (key) => page.keyboard.press(key).then(() => page.waitForTimeout(700));
  const pbpaste = () => execSync('pbpaste').toString().trim();   // OS clipboard
  const rows = () => page.evaluate(() =>
    [...document.querySelectorAll('.quick-input-list .monaco-list-row')]
      .map(r => (r.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean));

  // open picker via keybinding
  await press('Meta+Shift+A');
  await page.waitForTimeout(1000);
  console.log('root rows:', JSON.stringify(await rows()));
  // -> assets/, build/, docs/, src/, .gitignore, main.ts

  // path query + Enter -> relative path
  await page.keyboard.type('src/deep/nested.ts', { delay: 40 });
  await page.waitForTimeout(700);
  console.log('query rows:', JSON.stringify(await rows()));       // src/deep/nested.ts
  await press('Enter');
  console.log('clipboard:', JSON.stringify(pbpaste()));           // src/deep/nested.ts

  // Shift+Enter -> real path
  await press('Meta+Shift+A');
  await page.waitForTimeout(1000);
  await page.keyboard.type('button', { delay: 60 });
  await page.waitForTimeout(700);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  console.log('clipboard:', JSON.stringify(pbpaste()));           // /abs/.../Button.tsx

  // directory
  await press('Meta+Shift+A');
  await page.waitForTimeout(1000);
  await page.keyboard.type('docs', { delay: 60 });
  await page.waitForTimeout(700);
  await press('Enter');
  console.log('clipboard:', JSON.stringify(pbpaste()));           // docs

  // Cmd+Enter (mac) / Ctrl+Enter (win, linux) -> reveal in Explorer
  await press('Meta+Shift+A');
  await page.waitForTimeout(1000);
  await page.keyboard.type('nested', { delay: 60 });
  await page.waitForTimeout(700);
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(700);
  const revealed = await page.evaluate(() =>
    document.querySelector('.explorer-viewlet .monaco-list-row.selected')
      ?.getAttribute('aria-label') || '');
  console.log('revealed:', JSON.stringify(revealed));             // nested.ts

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
```

Expected results:

| Action | Clipboard / result |
| --- | --- |
| `Meta+Shift+A`, type `src/deep/nested.ts`, Enter | `src/deep/nested.ts` |
| `Meta+Shift+A`, type `button`, Shift+Enter | absolute path ending `.../src/components/Button.tsx` |
| `Meta+Shift+A`, type `docs`, Enter | `docs` |
| `Meta+Shift+A`, type `nested`, `Meta+Enter` | file selected/revealed in Explorer view |
| reopen picker | input resets to empty, root children shown |

### Edge cases (`edges.js`)

| Scenario | Expected |
| --- | --- |
| absolute path + Shift+Enter | real path copied |
| query matching nothing + Enter | picker stays open, nothing copied |
| Shift+Enter with picker closed | nothing happens (keybinding is scoped by `pathPickerPickerVisible`) |
| Cmd+Enter with picker closed | nothing happens (scoped by `pathPickerPickerVisible`) |
| directory + Shift+Enter | absolute directory path copied |

## 4. What to watch for (bugs found this way)

The `QuickPick` widget **re-filters items itself** against the raw query using
its own fuzzy matcher on the label/description. Path queries like
`src/deep/nested.ts` never match a label of `nested.ts`, so every row would be
hidden even though your extension computed results. Fix: set
`alwaysShow: true` on every item and do all filtering yourself.

Related issues discovered during testing:

- **Stale selection**: `selectedItems` survives a hide/show cycle, so a
  previous pick could be copied when the list was empty. Fix: reset
  `activeItems`/`selectedItems` on every show.
- **Stale value**: reopening kept the previous query. Fix: reset `value` on show.
- **Glob prefix double-escape**: prepending `(?:.*/)?` to a glob *before*
  converting it to a regex escapes the regex metacharacters. Build the raw
  regex first, then prepend the prefix.
- **Auto-description from `resourceUri`** (VS Code ≥ 1.112): any
  `QuickPickItem` that sets `resourceUri` but *no* `description` gets one
  auto-filled by the renderer (`description ??= getUriLabel(uri, {relative:
  true})`), so the row shows the path twice — once big, once small. Fix:
  always set `description: ''` on items carrying `resourceUri`. See
  `vscode-quick-pick-quirks.md`.
- **Right-only ellipsis**: the widget truncates long labels on the right with
  CSS `text-overflow`, hiding the filename. Fix: pre-truncate the label in
  code, keeping the tail (`truncateLeft` in `picker.ts`, 80 chars,
  segment-aware with a `…/` prefix).
- **Status bar check**: on the Welcome screen the status bar is not rendered;
  verify copies via the clipboard (`pbpaste`), not the status bar.

## 5. Tips

- When VS Code reuses a running instance, the new window may bind to a
  different port than requested — always check `code-launch.log` / `lsof` for
  the actual listener, and use `--user-data-dir` to force an isolated instance.
- `page.screenshot()` is useful for visual checks, but assert behavior via the
  DOM (list rows, input value) and the clipboard.
- `navigator.clipboard.readText()` is denied in the renderer; read the OS
  clipboard instead.

## 6. Testing on code-server

The same CDP approach works when the extension runs in code-server inside a
browser tab (e.g. Vivaldi on port 9222):

1. Install the VSIX into code-server's extensions dir, then reload the page:

   ```bash
   code --extensions-dir ~/.local/share/code-server/extensions \
        --install-extension vscode-path-picker-0.0.1.vsix --force
   ```

   `make install` already covers this via `vscode-hacker-meta` (installs for
   both desktop VS Code and code-server).

2. Connect Playwright/CDP to the browser's debugging port (9222), find the
   code-server tab, and drive it as usual.

Gotchas specific to code-server:

- After (re)installing the VSIX, the extension host must be restarted: a
  page reload (or `Developer: Reload Window`) does it; otherwise the old
  code keeps running even though the files on disk are new.
- CDP key presses can be swallowed: a focused terminal pane eats keys, and
  the browser may intercept shortcuts (e.g. `Ctrl+Shift+P` in Vivaldi).
  Click into the editor first, and open the command palette with `F1` when
  keybindings misbehave.
- The list DOM is the same as desktop (`monaco-list-row`, `label-name`); the
  a11y snapshot may omit the quick input widget, query it with
  `page.evaluate` instead.
