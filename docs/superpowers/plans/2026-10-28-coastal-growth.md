# Coastal growth and persistence implementation plan

**Goal:** Turn the approved coast into durable resource/crafting/house growth with safe autosave and backup restore.
**Architecture:** Strict schema8 games.coast plus pure durable model; display-only intermediate animation and serialized checkpoint commits; existing backup/native store infrastructure.
**Spec:** docs/superpowers/specs/2026-10-28-coastal-growth.md

- [x] Model/state: failing tests for yields/trade/reserved costs/elapsed/strict parsing and v7 migration; implement durable model + TS schema8.
- [x] Native: matching CoastState and explicit legacy-v7 shape, migrations/snapshots/current fixture and corruption/failure tests.
- [x] Art: two growth variants of the approved island, preserve anchors/alpha and exact prompts.
- [x] Controller: adopt saved state after successful write, checkpoint at pause/export/close, stable retry/restore generation, queued exit tests.
- [x] UI: controlled scene, house resource/craft/growth panel, trade, saved marker and record/backup/restore views; focused browser tests.
- [x] Verify existing/new suites, actual-size renders, independent reviews, Windows build and migration/manual restart check; docs and local commit.

2026-10-28: implementation, automated verification, actual-size visual review, native migration and user-confirmed play/restart checks are complete. This plan is included in the local implementation commit. See docs/verification.md for exact coverage and native manual-check limits.
