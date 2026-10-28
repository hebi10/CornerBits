# CornerBits interface

Approved visual brief: small Windows desktop decoration, black/gray/white, cute smiling stone, plant, and lightbulb companions. The latest 2026-10-28 feedback explicitly removes persistent text buttons and scores and unifies management with the same illustrated world.

- Three picture-selectable games plus a keepsake management view, a draggable compact title bar, shared save status and backup actions. Art leads in resting views; exact controls and statistics appear in tooltips and expandable tools.
- Background #f5f5f3, surface #ffffff, text #252525, muted text #595959, border #bdbdb8.
- System Korean font stack; body 12–13px, heading 18px, weight 500, emphasis at most 700.
- Text buttons have no fill or border. Picture controls keep their existing forms. No box shadows, one-sided accent borders, or hover animation. Text directly over wallpaper uses a thin light outline for legibility.
- Keyboard focus uses a visible two-pixel outline. Status and errors use words rather than color alone.
- Confirmation for restoring a backup is inline and explains replacement and the recovery snapshot.
- Browser preview is explicitly labeled; desktop files never silently fall back to browser storage.
- The user selected a desktop widget rather than an independent app window. Hide standard minimize/taskbar affordances, keep compact/close and tray recovery, and place behind other applications.
- Expanded views and the compact bar have no large background or outline: sprite art and compact text sit directly over wallpaper. A 26px title bar and 40px picture navigation leave the art dominant. Management uses a smiling box and export/import picture buttons. Expanded-view status captions and open tools retain 88–96% neutral backplates; errors/restore confirmations are readable solid surfaces. Their text buttons remain transparent and borderless.
- Generated transparent PNG atlases in public/art provide cute mine, garden, and lightbulb/tool sprites. Assets are rendered with grayscale(1), preserving alpha. Exact generation prompts are embedded in each PNG and recorded in JSON manifests. Earlier art stays preserved but the new atlas URLs drive the interface.
- Mine tiles show intact, cracked, or excavated rock. Four ore families represent 30 minerals consistently; full names and durability remain in accessible labels/tooltips.
- Garden pots show soil, seed, sprout, leaves, then mature plant families. Twelve mature illustrations represent 40 species; do not imply every species has a unique illustration.
- Picture buttons keep explicit accessible names and native title tooltips. Garden seed/expansion tools and all detailed records live behind the magnifier. Mature plants sway; watering-needed pots show a watering-can marker. Circuit wires are functional CSS geometry and every bulb rotates its ports when clicked; the underlying puzzle is224px square.
- A slow lantern/plant sway and brief pickaxe/chips/water/harvest effects provide quiet movement. Effects follow successful game state changes. Hidden documents pause CSS animation and the garden clock; compact/game switching unmount content; reduced-motion removes animation.
