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

Three independent games with persistent growth: timing-based fishing, an offline growing garden, and probabilistic sword growth with a guaranteed alternative. Each game's major goals target about 60 days at 10–15 minutes per day. On 2026-10-28 the user approved replacing the mine and circuit with fishing and sword growth. Their old data stays archived in backups; they are not extra visible games.

## Capabilities and Constraints

- Small monochrome desktop decoration with cute smiling fish, plants, and swords and quiet motion. Picture controls replace persistent text buttons and scores; exact information is available through tooltips and expandable tools. Management matches the same transparent keepsake-box style. No shadows, rounded cards, or unsolicited sound.
- Growth, fishing bites, and sword upgrades should be visible in the art; exact names, odds and counts remain available in controls and collections. Honor reduced motion and pause hidden content.
- Progress is tuned without daily limits. Use docs/balance.md: about58–61 modeled days at12.5 minutes per game, explicitly including bite/growth/polish waits. Sword variance and player strategy affect completion. Garden seeds stay permanently unlocked.
- Preserve saved data outside the installation directory.
- Backup and restore must validate input and preserve the current state before replacement.
- No server, accounts, push, or publication in the current phase.

## Product Principles

- Interruptible play and trustworthy persistence.
- Readable controls within a 280 by 380 logical-pixel window.
- Corrupt data must produce a recovery message rather than a silent reset.
