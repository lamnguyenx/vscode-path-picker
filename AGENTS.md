# AGENTS.md

## Project Layout

- `./exp` is the temporary directory for experiments, outputs, and scratch
  data (dev-host profiles, logs, screenshots). You may recreate it if it does
  not exist. **Do not put tracked code here.**
- `./tests` contains the test harness (`open_view.cjs`, `test_preview.cjs`,
  `cdp_eval.cjs`) and the `tests/workspace/` fixtures used by the dev host.
- `_refs/`: references, read-only
  - `_refs/vscode` : source code of vscode for refrence only


See `docs/important/how-to-test.md` for the full pipeline and gotchas.