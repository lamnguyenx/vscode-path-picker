# Path Picker

Pick a file **or folder** from the workspace — like VS Code's File Picker (Ctrl/Cmd+P) — and copy its path.

- **Enter** → copy the **relative path** (relative to the workspace root)
- **Shift+Enter** → copy the **real path** (absolute, symlinks resolved)

## Quick start

Press `Ctrl+Shift+P` on macOS or `Meta+Shift+P` on Windows/Linux, or run
**Path Picker: Pick File or Folder and Copy Path** from the Command Palette.
Type to fuzzy-search, glob (`src/*.ts`), or enter an exact path, then press
`Enter` / `Shift+Enter` to copy.

## Development

Requires Node.js. Everything below is automated:

```bash
make build      # npm install + compile + package (produces *.vsix)
make install    # build + install into VS Code and code-server
```

Manual equivalent:

```
npm install
npm run compile
npm run package     # produces vscode-hacker-path-picker-2026.08.14-1.vsix
```

### Tests

```bash
make test-units        # pure-logic checks (fuzzy, paths, gitignore, truncation)
make typecheck-tests   # strict typecheck of tests/ + configs
make test-e2e          # Playwright E2E against running code-server (CDP 9024)
```

Install the VSIX via the Extensions view → `...` → **Install from VSIX...**.

## Docs

### [Usage](docs/important/usage/)

- [Using the picker](docs/important/usage/picker.md): triggers, keybindings, glob/exact-path queries, folders, and the copy confirmation.
- [Settings](docs/important/usage/settings.md): `pathPicker.exclude`, `maxEntries`, `followSymlinks`, and how indexing respects ignores.

### [Testing](docs/important/testing/)

- [How to test Path Picker](docs/important/testing/how-to-test.md): the end-to-end procedure — REST Control arranges/acts, CDP asserts the QuickPick UI; works against code-server or a dev host.
- [VS Code QuickPick quirks](docs/important/testing/vscode-quick-pick-quirks.md): built-in `QuickPick` behaviors that surprised us, with the workarounds.
