# CornerBits · 해안 생활

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop widget implemented with local React/Tauri. Above wallpaper and behind other applications, not in the taskbar or Alt+Tab. The current host size is280×380 logical pixels; compact is280×36.

## Approved direction

On2026-10-28 the user rejected the prior three-game/monochrome design, chose a full rethink, then explicitly selected concept A: one colored pixel coastal place connecting fishing, gathering and home decoration. The immediate request is a live actual-size screen prototype, not the complete long-term economy.

The accepted reference is the left A scene in the generated concept board: a muted teal sea, ochre/rust roof, small timber home, large tree, dock, small boat and a tiny adult figure. Use a coherent place rather than tabs of unrelated games. Existing game rules are not requirements for the new concept.

## Current prototype

- Native default coast.html provides one transparent coastal scene, animated water glints, chimney smoke and an independently walking/acting person.
- Dock: walk, fish, return; caught fish appear on a rack. Beach: walk, gather wood, return. Home: spend one gathered wood per flowerpot, lantern and bench, placed into the same scene.
- Trips are short visual interactions, temporary within the session. Pause, document hiding, compact and the info view freeze progress. Reduced motion suppresses decoration and skips walk interpolation.
- No new gameplay save schema, currency, daily quota or60-day pacing claim. Restart resets this prototype only. The info view must say so clearly.
- Existing schema7 games, settings, backup tools, index.html and records remain preserved as legacy code. New scene actions never call saveState or restoreState. Native startup may read existing state; compact changes only the live window size.

## Constraints

Existing React/TypeScript/Tauri/Vite and package manager. No new dependencies or remote services. Keep accessible hotspots, readable errors and system fonts. No large application panel, unnecessary cards, rounded UI, shadows or hover animations. Generated raster art and exact prompts/source paths remain preserved. Avoid Computer Use; native visual interaction is verified by the user.

## Next decision

Approve the actual-size motion and interaction feel before designing permanent progression, economy, collecting rules or migration for this new world.