# Coastal idle work implementation plan

> **For agentic workers:** Use subagent-driven-development for model/native boundaries and inline integration. No commits by subagents.

**Goal:** One-click continuous work with real10/15-minute resource batches and a persistent job duration/earned total.
**Architecture:** schema10 strict durable model + serialized saved reports + scene-independent runtime clock. Existing React/Tauri/storage/art.
**Spec:** docs/superpowers/specs/2026-10-28-coastal-idle.md

## Constraints and review focus

Keep A world and existing resources. Persistent duration and earned amount, with count-only tooltip. Background/compact/menu work must continue. Explicit pause/closed app must not earn. No duplicate report on retry/restore; resource-cap and delayed timers must remain bounded. Preserve exact legacy8/9 validation and snapshot before migration. No new dependencies, CUA, branch/worktree/deletion/push/deployment.

- [x] Model + TS schema10: tests RED→GREEN for continuous work, report batches, cap, selling, stop, interval and exactv8 migration. Own model.ts/model.test.ts/core/state.ts/state.test.ts.
- [x] Native schema10: matching report/interval, exactv8 legacy coast/state, fixture8/9migration and fixture10roundtrip/snapshot/failure tests. Own game_state.rs/storage.rs.
- [x] Session and runtime: report commits/checkpoints/stop/interval, independent timer through compact/hidden/menu, explicit pause/restore freeze, failure retry tests.
- [x] UI + E2E: small work duration/amount controls,10/15setting,recent report, sale duringwork; update legacy regression fixtures to10 and verify full suites.
- [x] Review actual280×380 scenes, docs, native build/migration/user run, local commit.
