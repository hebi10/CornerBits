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

The v0.6.0 fishing loop is catching and holding fish, selling them for coins, buying better bait, collecting species, and permanently opening new fishing areas. The minimal scene is an angler in a small boat with location-specific scenery, visibly different equipment, and three collected fish that remain on display after sale. The user asked that the overall widget resemble a quiet pixel ornament at a glance.

## Capabilities and Constraints

- Minimal monochrome pixel-art desktop game, replacing the earlier cute smiling ornament style at the user's latest request. Fish, plants, swords and utility icons have no anthropomorphic faces. Pixel-step motion and a Gulim-first font match the graphic style. Quiet picture controls and transparent surfaces dominate resting views; exact information lives in explicit tools and collections. Saving/error/recovery affordances remain available. No shadows, rounded cards, or unsolicited sound.
- Growth, fishing bites, and sword upgrades should be visible in the art; exact names, odds and counts remain available in controls and collections. Honor reduced motion and pause hidden content.
- Progress is tuned without daily limits. Use docs/balance.md: about58–60.46 modeled days at12.5 minutes per game, explicitly including bite/growth/polish waits. Fishing is73/58/48 days at10/12.5/15 minutes; the15-minute case is48 days, not a claim that every schedule takes60 days. Sword variance and player strategy affect completion. Garden seeds stay permanently unlocked.
- Fishing holds caught fish until sale, preserving collection counts afterward. Free basic bait has a 7% rare-fish share; paid packs contain five baits for 50/150 coins with 12/27% rare-fish shares. Casting consumes one paid bait even on a miss. New regions require cumulative catch milestones plus four species from the preceding region and remain permanently open.
- Fishing equipment1–8 reduces the next cast's bite wait by0.5 seconds per level and extends the reaction window from5 to12 seconds. Level1 waits18–30 seconds; level8 waits14.5–26.5 seconds. Existing saved casts keep their species, RNG, bite and expiry times unchanged. Thirty-six dedicated fish silhouettes, six landscapes and eight equipment images make collecting, traveling and upgrading visible.
- Schema7 adds keepsakes: up to three unique collected fish indices, updated by each successful catch and preserved through sales/backups. Schema6 migration preserves every existing field and seeds display from discovered species indices in descending order; that order is not claimed to represent past catch recency. Schema5 keeps coins, collection, active cast, RNG and all other existing fields, while previously auto-paid catches do not become sale stock again and new trade inventories start empty. Original bytes must be snapshotted before migration, and snapshot failure must preserve the original save.
- Preserve saved data outside the installation directory.
- Backup and restore must validate input and preserve the current state before replacement.
- No server, accounts, push, or publication in the current phase.

## Product Principles

- Interruptible play and trustworthy persistence.
- Readable controls within a 280 by 380 logical-pixel window.
- Corrupt data must produce a recovery message rather than a silent reset.
