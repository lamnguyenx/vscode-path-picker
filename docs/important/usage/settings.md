# Settings

The indexing limits, excludes, and symlink behavior.

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
