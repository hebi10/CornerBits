# CornerBits

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop application using a local web interface in Tauri.

The user confirmed on 2026-10-28 that the app should behave as a desktop widget above wallpaper and behind other applications, without reserving desktop work area.

## Stack

Tauri 2, React, TypeScript, Vite. User approved implementation of the proposed phase-one plan on 2026-10-28.

## Users

People who want small, quiet, offline games at the edge of a Windows desktop.

## Product Purpose

Three independent games with persistent growth: a 5×5 mine, an offline growing garden, and 300 rotating circuit puzzles. Each game's major goals target about 60 days at 10–15 minutes per day. The latest user request selects three games; the older four-game draft's dungeon is outside the current implementation.

## Capabilities and Constraints

- Small monochrome desktop decoration with cute smiling mineral/plant/lightbulb sprites and quiet motion, explicitly requested on 2026-10-28. Picture controls replace persistent text buttons and scores; exact information is available through tooltips and expandable tools. Management matches the same transparent keepsake-box style. No shadows, rounded cards, or unsolicited sound.
- Growth and mining damage should be visible in the art; exact names and counts remain available in controls and collections. Honor reduced motion and pause hidden content.
- Preserve saved data outside the installation directory.
- Backup and restore must validate input and preserve the current state before replacement.
- No server, accounts, push, or publication in the current phase.

## Product Principles

- Interruptible play and trustworthy persistence.
- Readable controls within a 280 by 380 logical-pixel window.
- Corrupt data must produce a recovery message rather than a silent reset.
