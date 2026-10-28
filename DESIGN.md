# CornerBits interface

Approved visual brief: small Windows desktop decoration, black/gray/white, cute smiling fish, plants, and sword companions. The user approved replacing mine/circuit with fishing/sword on2026-10-28 while preserving the transparent illustrated world.

- Three picture-selectable games plus a keepsake management view, a draggable compact title bar, shared save status and backup actions. Art leads in resting views; exact controls and statistics appear in tooltips and expandable tools.
- Background #f5f5f3, surface #ffffff, text #252525, muted text #595959, border #bdbdb8.
- System Korean font stack; body 12–13px, heading 18px, weight 500, emphasis at most 700.
- Text buttons have no fill or border. Picture controls keep their existing forms. No box shadows, one-sided accent borders, or hover animation. Text directly over wallpaper uses a thin light outline for legibility.
- Keyboard focus uses a visible two-pixel outline. Status and errors use words rather than color alone.
- Confirmation for restoring a backup is inline and explains replacement and the recovery snapshot.
- Browser preview is explicitly labeled; desktop files never silently fall back to browser storage.
- The user selected a desktop widget rather than an independent app window. Hide standard minimize/taskbar affordances, keep compact/close and tray recovery, and place behind other applications.
- Expanded views and the compact bar have no large background or outline: sprite art and compact text sit directly over wallpaper. A 26px title bar and 40px picture navigation leave the art dominant. Management uses a smiling box and export/import picture buttons. Save status, keepsake caption, and footer have transparent backgrounds with thin light text outlines. Keyboard focus uses an outline without a filled backplate. Open tools, errors, and restore confirmations keep readable surfaces; their text buttons remain transparent and borderless.
- Generated transparent PNG atlases provide fish, aquarium/fishing tools, ten sword forms and smith tools, plus garden and keepsake sprites. Assets use grayscale(1), preserving alpha. Exact generation prompts are embedded and recorded in JSON manifests; earlier assets stay preserved.
- Fishing presents an island, rod and bobber above wallpaper; confirmed catches animate briefly and populate the aquarium. Six fish illustrations represent36species. Its picture catalog replaces the main scene and exposes location/bait selections with their conditions.
- Sword growth uses one large illustrated sword, a functional timing gauge, hammer and safe-upgrade rune. Current odds and pity count stay visible; the small tool view gives exact costs, guarantee rules and ten forms. Failure never destroys the sword.
- Garden pots show soil, seed, sprout, leaves, then mature plant families. Twelve mature illustrations represent 40 species; do not imply every species has a unique illustration.
- Opening the garden magnifier replaces the pot area with a transparent 8-seed picture catalog. Five pages fit inside the widget without nested scrolling. Seed selection, next unlock progress, expansion, and an optional short care note share the same small view; do not restore the large white text panel.
- Picture buttons keep explicit accessible names and native title tooltips. Garden seed/expansion tools and detailed records live behind the magnifier. Mature plants sway; watering-needed pots show a watering-can marker.
- Quiet fish/bobber/sword/plant movement and brief confirmed catch/upgrade/water/harvest feedback follow successful state changes. Hidden documents pause CSS animation and clocks; compact/game switching unmount content; reduced-motion removes decoration. Functional time/state still remains available in labels.
