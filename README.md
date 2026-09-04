# Path Picker

Pick a file **or folder** from the workspace — like VS Code's File Picker (Ctrl/Cmd+P) — and copy its path.

- **Enter** → copy the **relative path** (relative to the workspace root)
- **Shift+Enter** → copy the **real path** (absolute, symlinks resolved)

## Usage

Trigger the picker:

| Shortcut | Platform |
| --- | --- |
| `Ctrl+Shift+P` | macOS |
| `Meta+Shift+P` | Windows / Linux |

or via Command Palette: **Path Picker: Pick File or Folder and Copy Path**.

The default keybinding for `pathPicker.pickPath` is defined in
`package.json` → `contributes.keybindings` (along with the picker-scoped
`shift+enter` for `pathPicker.copyRealPath`), so it can be changed/rebound from
**Preferences → Keyboard Shortcuts** like any other command.

Inside the picker:

- Type to fuzzy-search files and folders (subsequence match, e.g. `cmp` → `src/components.ts`).
- Glob queries work too: `src/*.ts`, `**/test/**`, `docs/{a,b}.md`.
- Directories are indexed alongside files, so you can copy folder paths too.
- You can also type an exact path — relative (`src/foo.ts`) or absolute (`/Users/me/foo`) — and press Enter; it is copied if it exists on disk.
- The copied path is written to the clipboard and confirmed in the status bar.

The `Shift+Enter` keybinding is scoped to the open picker (context key
`pathPickerPickerVisible`), so it never interferes outside it.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pathPicker.exclude` | `["node_modules", ".git", ".hg", ".svn"]` | Directory names skipped while indexing folders. |
| `pathPicker.maxEntries` | `30000` | Maximum number of files + folders to index. |
| `pathPicker.followSymlinks` | `false` | Follow symbolic links while indexing. Symlink cycles are detected and skipped. |

Files are discovered via `findFiles` (respects `files.exclude` /
`search.exclude`); folder traversal honors `pathPicker.exclude`. Both honor
`.gitignore` files, including nested ones, so ignored files and directories
don't show up in the picker. Symbolic links are not followed by default;
set `pathPicker.followSymlinks` to `true` to index symlinked files and
folders (symlink cycles are skipped). The index rebuilds automatically when
the workspace changes.

## Development

Requires Node.js. Everything below is automated:

```bash
make build      # npm install + compile + package (produces *.vsix)
make install    # build + install the VSIX into VS Code
```

Manual equivalent:

```
npm install
npm run compile
npm run package     # produces vscode-hacker-path-picker-2026.08.14-1.vsix
```

Install the VSIX via the Extensions view → `...` → **Install from VSIX...**.

See `docs/important/how-to-test.md` for the end-to-end test procedure
(isolated VS Code instance driven over CDP).
