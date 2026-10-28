# Minimal fishing implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement independent tasks. No commits, pushes, native app manipulation, or overlapping edits by subagents.

**Goal:** Persistent fish display, functional equipment, six landscapes and quieter pixel UI.
**Architecture:** Extend the strict existing fishing state and migrations; consume generated transparent atlases through existing sprite patterns; preserve native widget shell and other game rules.
**Tech Stack:** Existing React/TypeScript/Tauri/Vitest/Playwright, built-in image generation.
**Spec:** docs/superpowers/specs/2026-10-28-minimal-fishing-design.md

## Constraints and review focus

Keep monochrome/alpha, saved RNG and active cast, every existing game field and original pre-migration bytes. Reject foreign/duplicate/uncollected keepsakes. Selling must preserve display. Failed saves must not create false display feedback. Hidden/reduced-motion states and long numeric menu states must remain usable. No new dependencies, deletes, branch/worktree, push or deploy.

## Tasks

- [x] Engine/state: write and run failing keepsake/gear/migration tests; implement schema7 + keepsakes + gear timing; update strict session model and tests; verify targeted units/typecheck.
- [x] Native: strict schema7 plus separate legacy-v6 shape and migration, shared fixture, original snapshots/failure preservation; test Rust and formatting.
- [x] Assets: generated minimal boat four poses, six transparent landscapes,36 fish silhouettes, eight gear silhouettes; inspect alpha/grid/style and preserve prompts.
- [x] UI: render location/gear/persistent fish, quiet shared shell and management/garden/sword styling, focused tool views; add meaningful browser persistence/gear/region cases and inspect bright/dark renders.
- [x] Integrate: whole tests, balance, build, independent code/visual review; request user exit if app runs, launch Windows release and check migration preservation; ask manual native verification; update docs and commit locally.

Verification:289 unit +50 browser +66 native tests, typecheck/build/format passed. Windows v0.6.0 launched; actual v6→v7 fields and exact raw snapshot preserved. User rejected the overall result and requested a full rethink including games and visual style. This iteration is preserved as a checkpoint; manual operation success and design acceptance are not claimed. See docs/verification.md.
