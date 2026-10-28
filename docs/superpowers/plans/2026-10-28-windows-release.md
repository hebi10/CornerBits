# GitHub Windows download release

**User request:** Upload current CornerBits publicly to hebi10/CornerBits and use Actions for downloadable Windows builds. Public visibility explicitly selected.
**Architecture:** Existing local build stays portable-only; release override produces NSIS. Read-only Windows CI checks/tests/builds/package, tag-only release job publishes installer/ZIP/checksums with contents write permission.

- [x] Inspect repo/authentication and current tracked/history files; no secret patterns found.
- [x] Add and verify release config, explicit-file PowerShell packaging, pinned Actions workflow, download documentation.
- [x] Review, local checks, commit; create public repo and push current branch/version tag without rewriting history.
- [x] Observe real Windows Actions execution, fix failures, verify release downloads/checksums, report links.

Verified source dcff9f889bfa1860a5525c0c4c19915d5afb0cf3, Actions run40663620439, public releasev0.9.1. First release uses the successful branch-run artifacts; tag-only release job was skipped on that branch event. See docs/verification.md for exact coverage and anonymous-download checks.

No branch/worktree creation, deletes, force pushes, personal saved progress uploads, or Computer Use. No app gameplay changes. Root performs all GitHub mutations and commits.
