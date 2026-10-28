# Coastal life · A concept

The latest approved world is a colored pixel coastal place. This replaces the rejected monochrome three-game presentation; its implementation remains in Git and the legacy entry for data safety.

## Visual world

- One coherent miniature: timber home, rust roof, large leafy tree, dock, boat, turquoise water and broken shoreline. Transparent outside the actual island silhouette, no rectangular water or sky background.
- Pixel art follows the approved A board. Quiet natural palette: sea teal/sage, sand/linen, ochre/rust and charcoal timber. UI ink#304940, readable temporary surface#f5efe3. Do not grayscale the new raster assets.
- All art comes from the built-in image generator: coast-island.png, coast-actor.png(4×4), coast-props.png(4×4 first8). coast-prompts.json preserves exact prompts, source files, alpha and measured frame anchors. Align at display time; do not repaint or trim generated pixels manually.
- True1× canvas is280×280 inside the280×380 widget. No scaling the whole UI to fake its actual size. The actor is a small adult figure, with feet fixed to the projected paths/dock/beach. Props sit in the same perspective and scale as the house.

## Interaction and motion

- Dock, beach and home are real invisible-background buttons with native tooltip names and visible keyboard focus. Pointer interaction stays inside the scene; no three-game nav or permanent numerical HUD.
- Person walks from home through the path to the destination, acts, returns; rewards occur once at completed return. Gathered wood enables the next home decoration. Objects stay visibly placed within the session.
- A few local water glints and rising pixel smoke provide quiet ambient motion. Do not float or rotate the whole island. Animation and temporary progress pause with the user control, hidden document, compact state or info view. Reduced motion disables ambient motion and simplifies walking.
- Tiny top controls provide drag, pause, info, compact and native close. Plain text controls have no fill or border; essential text over wallpaper uses a thin light keyline. No hover decoration, box shadows or rounded cards. Font weight500/at most700, maximum34px; current controls9px and status10px at logical1×.
- Info/errors are readable inline overlays only when opened/needed. The info must disclose this is a screen prototype whose temporary play resets on close; old records remain intact.

## Verification

View bright and dark backgrounds at1×, all action poses and placed props. Check walk anchors, no atlas neighbors/clipping, layout within280×380, single-action lock, wood consumption, pause/hidden/compact preservation, keyboard access and reduced motion. Preserve the existing native desktop-layer placement and cross-monitor drag policy.