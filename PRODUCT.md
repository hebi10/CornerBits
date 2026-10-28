# CornerBits · 해안 생활

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop widget implemented with local React/Tauri. Above wallpaper and behind other applications, not in the taskbar or Alt+Tab. The current host size is 280×380 logical pixels; compact is 280×36.

## Approved direction

On 2026-10-28 the user rejected the prior three-game/monochrome design, chose a full rethink, then explicitly selected concept A: one colored pixel coastal place connecting fishing, gathering and home decoration. After the actual-size moving prototype, the user approved continuing in this direction with resource-based home growth, automatic progress saving, backup and restore.

The accepted reference is the left A scene in the generated concept board: a muted teal sea, ochre/rust roof, small timber home, large tree, dock, small boat and a tiny adult figure. Use a coherent place rather than tabs of unrelated games. Existing game rules are not requirements for the new concept.

## Current playable growth chapter

- Native default `coast.html` provides one transparent coastal scene, animated water glints, chimney smoke and an independently walking/acting person.
- Dock: walk, fish, return; caught fish remain on a rack until sold. Each fish sells for 15 shell coins through the rack or home menu. Beach: walk, gather wood, return.
- Home levels 1/2/3 yield 1/2/3 fish or wood per trip. Upgrade 1→2 costs 12 wood and 75 coins; 2→3 costs 25 wood and 150 coins. The same island changes visibly with each home level.
- Flowerpot (3 wood/20 coins, level 1), lantern (6/45, level 2) and bench (12/90, level 3) are independent one-time decorations. Costs are reserved at the start; the finished object appears after the return. Resuming a saved project does not charge again.
- This is the first growth chapter: three home levels and three decorations. No daily quota, offline farming or 60-day pacing claim applies to the new coast.
- Pause, document hiding, compact, the home menu and the record menu freeze progress. Reduced motion suppresses ambient effects and skips walk interpolation.

## Durable progress and recovery

- schema8 adds `games.coast`: resources, lifetime totals, home level, placed decorations and an optional activity with elapsed time. Existing five games and settings remain in the same save. Versions 1–7 migrate only after preserving their original bytes; the coast starts fresh. The v0.7.0 prototype had no saved coastal progress to migrate.
- Save at action start/completion, sale and checkpoints for pause/hide/compact/menu/export/exit, rather than each animation tick. Confirm rewards only after successful persistence. A failed save freezes progress and retains the exact pending snapshot for retry. Normal close waits for persistence and stays open if saving fails.
- Resume the saved elapsed point without giving extra repeated rewards for time spent closed. All coastal progress participates in `.cornerbits` backup and restore. Restore has an explicit preview/confirmation and preserves the previous record before replacement. A legacy backup resets the new coast to its initial state and restores legacy games to that backup's state; disclose this before confirmation.
- Native files remain under `%APPDATA%\dev.cornerbits.app`; browser preview uses isolated local storage. Native startup inspection remains read-only, while the playable screen loads/migrates and saves through the existing storage service. The legacy `index.html` entry and game code remain for regression checks. Compact changes the live window size without changing legacy compact settings.

## Constraints

Existing React/TypeScript/Tauri/Vite and package manager. No new dependencies or remote services. Keep accessible hotspots, readable errors and system fonts. No large application panel, unnecessary cards, rounded UI, shadows or hover animations. Generated raster art and exact prompts/source paths remain preserved. Avoid Computer Use; native visual interaction is verified by the user.

## Scope boundary

Keep the accepted coastal world while establishing the first resource-to-home loop and safe persistence. Longer-term content, collection systems and pacing beyond this growth chapter require further design; do not present prior games' 60-day estimates as evidence for this coast.
