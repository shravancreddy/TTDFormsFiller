# CLAUDE.md — standing instructions for this repository

## Always commit, push, open a PR, and merge it

Finish every change without waiting to be asked:

1. Commit to the session's branch with a message that explains *why*.
2. `git push -u origin <branch>`.
3. Open a pull request **ready for review** (never a draft).
4. **Merge it** — squash merge, with a commit body that carries the reasoning.

Do not stop at "ready to merge?". If a merge is blocked (conflict, red check), fix the
cause and merge; if it cannot be fixed, say so plainly with the blocker.

## Before committing

- `node --check` every changed `.js` file and run `python ttd-form-helper/package.py --check`.
- Bump `version` in both `manifest.json` and `manifest.firefox.json` for user-visible
  changes, add a README version-history entry, and rebuild the download bundles with
  `python ttd-form-helper/bundle.py` (delete the stale ones).
- Tests live in `tests/` at the repository root, never inside `ttd-form-helper/` (that
  folder is what gets packaged). `tests/senior-citizen.test.js` loads the unpacked
  extension in Chromium; see its header for how to run it.
