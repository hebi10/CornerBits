# CornerBits · 해안 생활

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop widget implemented with local React/Tauri. Above wallpaper and behind other applications, not in the taskbar or Alt+Tab. The current host size is 280×380 logical pixels; compact is 280×36.

## Approved direction

On 2026-10-28 the user rejected the prior three-game/monochrome design, chose a full rethink, then explicitly selected concept A: one colored pixel coastal place connecting fishing, gathering and home decoration. After the actual-size moving prototype, the user approved continuing in this direction with resource-based home growth, automatic progress saving, backup and restore. v0.9.1 keeps that world and lets an assigned fishing or gathering job continue while the user works. The widget continuously shows the current job's total elapsed time and earned amount, while settling rewards every 10 or 15 minutes.

The accepted reference is the left A scene in the generated concept board: a muted teal sea, ochre/rust roof, small timber home, large tree, dock, small boat and a tiny adult figure. Use a coherent place rather than tabs of unrelated games. Existing game rules are not requirements for the new concept.

## Current playable growth chapter

- Native default `coast.html` provides one transparent coastal scene, animated water glints, chimney smoke and an independently walking/acting person.
- Assign the dock or beach once to keep fishing or gathering. Each full work cycle lasts the chosen 10 or 15 minutes; the default is 10. After confirming one cycle's reward, the same job continues. Caught fish remain on a rack until sold. Each fish sells for 15 shell coins through the rack or home menu, including while work continues.
- A 10-minute cycle yields 2 fish or wood multiplied by home level; a 15-minute cycle yields 3 multiplied by home level. Home levels 1/2/3 therefore yield 2/4/6 per 10 minutes or 3/6/9 per 15 minutes. Upgrade 1→2 costs 12 wood and 75 coins; 2→3 costs 25 wood and 150 coins. The same island changes visibly with each home level.
- Flowerpot (3 wood/20 coins, level 1), lantern (6/45, level 2) and bench (12/90, level 3) are independent one-time decorations. Costs are reserved at the start; the finished object appears after the return. Resuming a saved project does not charge again.
- Stop work before crafting, expansion or an interval change. Stopping preserves earned resources and clears the unfinished cycle and current job counters. Each new job starts its time and amount at zero. Work also stops when the next full reward would exceed storage limits.
- This is the first growth chapter: three home levels and three decorations. No daily quota, offline farming or 60-day pacing claim applies to the new coast.
- Work continues behind other applications, in hidden documents, while compact and with home or record menus open. The scene's motion rests while hidden, compact or covered by a menu. Explicit pause, a failed save and restore preview freeze work time. Reduced motion suppresses ambient effects and skips walk interpolation.
- A persistent line such as **채집 12:34 · 나무 +2** shows total time and the amount actually earned during this job. Selling resources leaves that job's earned amount intact. Keep recent settlement details in the record menu. Delayed timer ticks settle elapsed full cycles together. Do not add scene alerts at cycle boundaries or send Windows notifications, sound, external messages or scheduled automation.

## Durable progress and recovery

- schema10 retains the existing five games, settings and coastal resources, lifetime totals, home level, placed decorations and pending activity. It retains `workInterval` (10 or 15 minutes) and `lastReport` (null or `{id, activity, amount, cycles}`), and adds `workTimeMs` and `workAmount`: integers from 0 to 1e12 for the current job's total time and earned amount. Work time accumulates across cycles and saturates at the limit; work amount grows only when rewards are confirmed. Both are zero outside fishing or gathering.
- Validate schema9 against its exact eleven-field coastal format and preserve the original bytes before adding counters. Retain every existing value, including interval, report and elapsed time. A fishing or gathering job starts its total time at the saved cycle's elapsed time and its earned amount at zero. Do not reconstruct unavailable job totals from past reports or resource inventory.
- Validate schema8 against its original nine coastal fields and activity timing before preserving its original bytes and adding the 10-minute interval, null report and the same counter defaults. Preserve all resources, home, decorations and pending elapsed time into the longer first cycle. If the next full reward would exceed storage limits, stop that work and clear cycle time and job counters while retaining resources and ownership. Versions 1–7 keep their prior migrations and start the coast fresh. The v0.7.0 prototype had no saved coastal progress to migrate.
- Keep display elapsed time in memory. Save at work start, cycle reward, stop, interval change, sale and project changes, plus 60-second checkpoints and pause/hide/compact/menu/export/exit checkpoints. Confirm rewards only after successful persistence. A failed save freezes progress and retains the exact pending snapshot for retry. Normal close waits for persistence and stays open if saving fails.
- Resume the saved elapsed point and exclude time spent closed. All coastal progress, job counters, interval and the latest settlement participate in `.cornerbits` backup and restore. Restore has an explicit preview/confirmation and preserves the previous record before replacement. Schema8/9 backups retain pending coastal progress with the applicable defaults; a version 1–7 backup starts the coast fresh. Legacy games return to the backup's state. Disclose the applicable migration before confirmation.
- Native files remain under `%APPDATA%\dev.cornerbits.app`; browser preview uses isolated local storage. Native startup inspection remains read-only, while the playable screen loads/migrates and saves through the existing storage service. The legacy `index.html` entry and game code remain for regression checks. Compact changes the live window size without changing legacy compact settings.

## Constraints

Existing React/TypeScript/Tauri/Vite and package manager. No new dependencies or remote services. Keep accessible hotspots, readable errors and system fonts. No large application panel, unnecessary cards, rounded UI, shadows or hover animations. Generated raster art and exact prompts/source paths remain preserved. Avoid Computer Use; leave native visual interaction for user verification.

## Scope boundary

Keep the accepted coastal world, continuous assigned work, the first resource-to-home loop and safe persistence. Longer-term content, collection systems and pacing beyond this growth chapter require further design; do not present prior games' 60-day estimates as evidence for this coast. The behavior contract is recorded in `docs/superpowers/specs/2026-10-28-coastal-idle.md`.
