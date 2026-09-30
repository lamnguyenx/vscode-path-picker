# AGENTS.md

## Project Layout

- `./exp` is the temporary directory for experiments, outputs, and scratch
  data (dev-host profiles, logs, screenshots). You may recreate it if it does
  not exist. **Do not put tracked code here.**
- `./tests/units/` — pure-logic checks runnable with `bun` (no host, no vscode):
  `fuzzy_check.ts`, `paths_check.ts`, `gitignore_check.ts`, `text_check.ts`.
- `./tests/playwright/` — committed E2E suite (`@playwright/test`; REST Control
  arranges/acts, CDP asserts the QuickPick DOM + status-bar copy echo).
- `./tests/workspace/` — controlled fixture workspace the E2E suite opens.
- `_refs/`: references, read-only
  - `_refs/vscode` : source code of vscode for refrence only


See `docs/important/how-to-test.md` for the full pipeline and gotchas.

### Testing

```bash
make test-units        # pure-logic checks (bun)
make typecheck-tests   # strict typecheck of tests/ + configs
make test-e2e          # Playwright E2E against the running code-server (CDP 9024)
```