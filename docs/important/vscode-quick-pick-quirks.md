# VS Code QuickPick quirks

Behaviors of the built-in `QuickPick` widget that surprised us while building
this extension. Verified against VS Code 1.112 (code-server 4.112) and the
sources in `_refs/vscode`.

## 1. `resourceUri` auto-fills the description

Since ~VS Code 1.112, the renderer rewrites every quick-pick item that has a
`resourceUri`:

```js
e.label ??= basename(uri);
e.label ? e.description ??= getUriLabel(uri, { relative: true })
        : (e.label = uriLabel, e.description ??= getUriLabel(parent(uri)));
```

Consequence: an item with `resourceUri` but no `description` shows the path
**twice** — big label plus a small dimmed description (e.g. label `_refs/`
with auto-description `_refs`).

Fix: always set an explicit empty description on items that carry
`resourceUri`:

```ts
description: '',
```

`''` is not nullish, so the `??=` auto-fill is skipped and the row renders a
single line.

## 2. The widget re-filters (and may re-sort) your items itself

`QuickPick` runs its own fuzzy matcher against the query on every input
change, and **hides** rows that don't match label/description. A path query
like `src/deep/nested.ts` never matches a label of `nested.ts`, so a picker
that computes results itself still ends up with an empty list.

Fix: set `alwaysShow: true` on every item and do all filtering in your own
code.

Sorting: `sortByLabel` defaults to `true`, so VS Code may re-order items by
label; set `sortByLabel = false` if you need to keep your own ordering.

## 3. Ellipsis truncates on the right only

Long labels are truncated with CSS `text-overflow: ellipsis`, which hides
the **end** of the string. For paths you usually want to keep the filename
(the tail) and cut the head.

Fix: pre-truncate the label yourself, segment-aware so names aren't split
mid-word, and prefix with `…/` (see `truncateLeft` in `picker.ts`).

## 4. State survives hide/show

`activeItems`, `selectedItems` and `value` persist across `hide()`/`show()`
cycles on the same `QuickPick` instance. Reopening the picker can
re-trigger the previous selection or keep the previous query.

Fix: reset all three on every `show()`:

```ts
current.value = '';
current.activeItems = [];
current.selectedItems = [];
```

## 5. Item buttons and icons

- Icons: `iconPath` as a `ThemeIcon` (`File`/`Folder`) is used directly;
  when `resourceUri` is also set, VS Code derives file-icon-theme classes
  from the resource (e.g. `_refs-name-folder-icon`) for theme-aware icons.
- `resourceUri` also drives the icon for folders — a directory without it
  may render as a generic file icon.

## 6. Scoped keybindings

A keybinding on a command only makes sense while the picker is open. Scope it
with a context key and set it when showing/hiding:

```ts
current.onDidHide(() => {
    void vscode.commands.executeCommand('setContext', 'pathPickerPickerVisible', false);
});
// on show:
await vscode.commands.executeCommand('setContext', 'pathPickerPickerVisible', true);
```

```json
{
    "command": "pathPicker.copyRealPath",
    "key": "shift+enter",
    "when": "pathPickerPickerVisible"
}
```

Hide the command from the command palette while you're at it, or users will
invoke it outside the picker:

```json
"menus": { "commandPalette": [{ "command": "pathPicker.copyRealPath", "when": "false" }] }
```

## 7. DOM debugging

- The a11y tree often omits the quick input widget; read it with
  `page.evaluate` instead:
  ```js
  [...document.querySelectorAll('.quick-input-list .monaco-list-row')]
  ```
- Row structure: `.label-name` (primary) and `.label-description` (small,
  dimmed). The description span is absent entirely when no description is
  set — a good assertion for the quirk in #1.
- `matchOnDescription`/`matchOnDetail` only matter if you use descriptions;
  the built-in matcher runs on the label regardless.

## 8. Keyboard input via CDP

- `page.keyboard.press` on a combo (e.g. `Meta+Enter`) works for
  quick-pick keybindings, but a focused terminal pane or an intercepted
  browser shortcut (e.g. `Ctrl+Shift+P` in Vivaldi) can swallow events.
  Click into the editor first; use `F1` to open the command palette if
  shortcuts misbehave.
- The extension host caches extension code: after reinstalling a VSIX, the
  page (or code-server process) must be reloaded before changes take effect.
