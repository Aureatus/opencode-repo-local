# Changelog

## Unreleased

- Lock `repo_ensure_local` to the default `~/.opencode/repos` clone root unless `OPENCODE_REPO_CLONE_ROOT` is explicitly set in the environment.
- Restrict `update_mode` inputs to the supported values `ff-only`, `fetch-only`, and `reset-clean`.
