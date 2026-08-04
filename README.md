# Path Copier

Pick a file **or folder** from the workspace — like VS Code's File Picker (Ctrl/Cmd+P) — and copy its path.

- **Enter** → copy the **relative path** (relative to the workspace root)
- **Shift+Enter** → copy the **real path** (absolute, symlinks resolved)

## Usage

Trigger the picker:

| Shortcut | Platform |
| --- | --- |
| `Cmd+Shift+P` | macOS |
| `Ctrl+Shift+P` | Windows / Linux |

or via Command Palette: **Path Copier: Pick File or Folder and Copy Path**.

### Rogue mode

Rogue mode is the same picker but it **ignores `.gitignore`** — everything on
disk is listed, including gitignored files and directories.

| Shortcut | Platform |
| --- | --- |
| `Ctrl+Cmd+Shift+P` | macOS |
| `Ctrl+Alt+Shift+P` | Windows / Linux |

or via Command Palette: **Path Copier: Pick File or Folder and Copy Path
(Rogue Mode)**.

Inside the picker:

- Type to fuzzy-search files and folders (subsequence match, e.g. `cmp` → `src/components.ts`).
- Glob queries work too: `src/*.ts`, `**/test/**`, `docs/{a,b}.md`.
- Directories are indexed alongside files, so you can copy folder paths too.
- You can also type an exact path — relative (`src/foo.ts`) or absolute (`/Users/me/foo`) — and press Enter; it is copied if it exists on disk.
- The copied path is written to the clipboard and confirmed in the status bar.

The `Shift+Enter` keybinding is scoped to the open picker (context key
`pathCopierPickerVisible`), so it never interferes outside it.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pathCopier.exclude` | `["node_modules", ".git", ".hg", ".svn"]` | Directory names skipped while indexing folders. |
| `pathCopier.maxEntries` | `30000` | Maximum number of files + folders to index. |
| `pathCopier.followSymlinks` | `false` | Follow symbolic links while indexing. Symlink cycles are detected and skipped. |
| `pathCopier.rogueFollowSymlinks` | `false` | Whether rogue mode (ignores `.gitignore`) follows symbolic links. Symlink cycles are detected and skipped. |

Files are discovered via `findFiles` (respects `files.exclude` /
`search.exclude`); folder traversal honors `pathCopier.exclude`. Both honor
`.gitignore` files, including nested ones, so ignored files and directories
don't show up in the picker. Symbolic links are not followed by default;
set `pathCopier.followSymlinks` to `true` to index symlinked files and
folders (symlink cycles are skipped). The index rebuilds automatically when
the workspace changes.

Rogue mode instead does a raw filesystem walk: it ignores `.gitignore`
**and** `files.exclude`/`search.exclude` (only `pathCopier.exclude` and
`pathCopier.maxEntries` still apply), and follows symlinks according to
`pathCopier.rogueFollowSymlinks`.

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
npm run package     # produces vscode-path-picker-0.0.1.vsix
```

Install the VSIX via the Extensions view → `...` → **Install from VSIX...**.

See `docs/important/how-to-test.md` for the end-to-end test procedure
(isolated VS Code instance driven over CDP).
