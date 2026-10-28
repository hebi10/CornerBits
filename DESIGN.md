# CornerBits interface

Approved visual brief: small Windows utility, black/gray/white, data-oriented presentation.

- Operate mode. Three small views (mine, garden, management), a draggable compact title bar, shared save status and backup actions.
- Background #f5f5f3, surface #ffffff, text #252525, muted text #595959, border #bdbdb8.
- System Korean font stack; body 12–13px, heading 18px, weight 500, emphasis at most 700.
- Square controls, full outlines when needed, no shadows, no one-sided accent borders, no hover animation.
- Keyboard focus uses a visible two-pixel outline. Status and errors use words rather than color alone.
- Confirmation for restoring a backup is inline and explains replacement and the recovery snapshot.
- Browser preview is explicitly labeled; desktop files never silently fall back to browser storage.
- The user selected a desktop widget rather than an independent app window. Hide standard minimize/taskbar affordances, keep compact/close and tray recovery, and place behind other applications.
- Desktop surface uses rgb(245 245 243 / 90%) over wallpaper and a title bar using rgb(232 232 227 / 70%). Text and game controls retain the existing readable grayscale colors. Browser preview shows the same interface; true desktop placement is native only.
