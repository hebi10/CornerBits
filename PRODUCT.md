# CornerBits

<!-- impeccable:product-schema 1 -->

## Platform

web

Windows desktop application using a local web interface in Tauri.

## Stack

Tauri 2, React, TypeScript, Vite. User approved implementation of the proposed phase-one plan on 2026-10-28.

## Users

People who want small, quiet, offline games at the edge of a Windows desktop.

## Product Purpose

Four independent games with persistent growth. Each game's major goals target about 60 days at 10–15 minutes per day. Phase one implements only the desktop shell, automatic saving, and backup export/restore.

## Capabilities and Constraints

- Small monochrome interface; no decorative animation, shadows, rounded cards, or unsolicited sound.
- Preserve saved data outside the installation directory.
- Backup and restore must validate input and preserve the current state before replacement.
- No server, accounts, push, or publication in phase one.

## Product Principles

- Interruptible play and trustworthy persistence.
- Readable controls within a 280 by 380 logical-pixel window.
- Corrupt data must produce a recovery message rather than a silent reset.
