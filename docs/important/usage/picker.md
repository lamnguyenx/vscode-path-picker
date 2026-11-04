# Using the picker

How to trigger the picker, what the two copy actions do, and the query forms it accepts.

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
