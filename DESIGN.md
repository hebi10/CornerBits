# Coastal life · A concept

The latest approved world is a colored pixel coastal place. This replaces the rejected monochrome three-game presentation; its implementation remains in Git and the legacy entry for data safety.

## Visual world

- One coherent miniature: timber home, rust roof, large leafy tree, dock, boat, turquoise water and broken shoreline. Transparent outside the actual island silhouette, no rectangular water or sky background.
- Pixel art follows the approved A board. Quiet natural palette: sea teal/sage, sand/linen, ochre/rust and charcoal timber. UI ink#304940, readable temporary surface#f5efe3. Do not grayscale the new raster assets.
- All art comes from the built-in image generator: `coast-island.png`, `coast-actor.png` (4×4), `coast-props.png` (4×4 first 8), plus `coast-island-level2.png` and `coast-island-level3.png`. `coast-prompts.json` and `coast-growth-prompts.json` preserve exact prompts, sources, alpha and measured anchors. Align at display time; do not repaint or trim generated pixels manually.
- Growth keeps the island, door, paths, dock, tree and boat anchored. Level 2 repairs and extends the timber home; level 3 adds a glass workroom. Keep flowerpot, lantern and bench in the prop layer so their actual saved ownership determines visibility, rather than baking them into growth backgrounds.
- True1× canvas is280×280 inside the280×380 widget. No scaling the whole UI to fake its actual size. The actor is a small adult figure, with feet fixed to the projected paths/dock/beach. Props sit in the same perspective and scale as the house.

## Interaction and motion

- Dock, beach and home are real invisible-background buttons with native tooltip names and visible keyboard focus. Pointer interaction stays inside the scene; no three-game nav or permanent numerical HUD.
- Person walks from home through the path to the destination, acts, returns; rewards occur once at completed return after saving succeeds. The rack reflects currently held fish and becomes empty after sale. Gathered wood and shell coins enable home projects. Completed decorations and home growth remain visibly placed after restarting or restoring.
- A few local water glints and rising pixel smoke provide quiet ambient motion. Do not float or rotate the whole island. Animation and progress pause with the user control, hidden document, compact state, home/record menus or a blocked save. Reduced motion disables ambient motion and simplifies walking. Resume saved elapsed time without inventing closed-time rewards.
- Tiny top controls provide drag, pause, records, compact and native close. Plain text controls have no fill or border; essential text over wallpaper uses a thin light keyline. A quiet save indicator avoids a permanent numerical HUD. No hover decoration, box shadows or rounded cards. Font weight 500/at most 700, maximum 34px; current controls 9px and scene status 10px at logical 1×.
- Home and record menus are readable linen overlays opened only on request. The home menu shows fish/wood/coins, three prop-led projects with costs/lock/ownership states, home expansion and fish sale. Resource counts and construction choices belong here, not across the resting scene.
- Records contain save status, a concise progress summary, backup export/import, restore preview/confirmation and save retry. Explain legacy-backup coastal reset before confirmation. Errors stay visible and actionable; failed saving freezes progress without awarding unpersisted rewards. Never silently replace an unreadable save with a fresh game.

## Verification

View bright and dark backgrounds at 1×, all action poses, home levels, placed props, project lock/owned states, record/restore views and save errors. Check walk anchors, no atlas neighbors/clipping, distinct clickable hotspots, layout within 280×380, single-action lock, resource costs/yields, saved pending work, pause/hidden/compact preservation, keyboard access and reduced motion. Preserve the existing native desktop-layer placement and cross-monitor drag policy.
