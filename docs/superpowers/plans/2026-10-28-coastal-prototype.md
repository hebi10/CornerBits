# Coastal life animated prototype implementation plan

**Goal:** A concept-faithful live280×380 scene, with one connected fishing/gathering/decorating interaction.
**Architecture:** Separate Vite coast.html entry and React scene within existing Tauri widget; temporary pure scene state; old app/data remain intact.
**Spec:** docs/superpowers/specs/2026-10-28-coastal-prototype.md

- [x] Generate coherent transparent coastal base,16-pose actor and8 props matching approved A.
- [x] Implement temporary action timeline/state, movement sampling, completion-only rewards and wood-gated decoration; minimal boundary tests.
- [x] Build independent coastal shell with pause/info/compact/close, native tray exit/resize/error handling, no game-state writes.
- [x] Compose the scene, animated water/smoke/person and meaningful hotspots, then inspect bright/dark renders at1×.
- [x] Add multi-page build/default native URL, run focused browser and existing regression tests/build, independently review, launch Windows and compare saved bytes.
- [x] Record limits/results, request actual visual feedback and commit locally.

Result:297 unit tests,53 browser tests plus final3 focused repeats,68 Rust tests, typecheck/format/product build passed. Read-only Store.inspect prevents migration writes during prototype startup. Windows v0.7.0 launched; original state bytes and9 snapshots unchanged. Manual visual/interaction feedback is pending. This is a temporary visual prototype, not permanent new-game progression.
