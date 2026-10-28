# CornerBits phase one

User approved phase-one implementation: small Windows window, automatic save, backup export and restore. No games yet.

## Approach

Build the approved Tauri/React/TypeScript shell incrementally rather than implementing four games at once. Keep state validation/backup format in a pure TypeScript module and native disk operations in Rust. Native saves use atomic replacement; restores keep the previous state. Frontend saves are serialized and failures remain visible.

## Contract

AppState JSON: `{ schemaVersion: 1, revision: number, updatedAt: string, settings: { alwaysOnTop: boolean, compact: boolean } }`. revision is a nonnegative safe integer, updatedAt a valid ISO timestamp. Backup JSON: `{ format: 'CornerBits', backupVersion: 1, exportedAt: string, state: AppState }`. Maximum import 2 MiB. Unknown or malformed versions must fail without changing current data.

Native commands: `load_state(): Promise<AppState|null>`, `save_state({state}): Promise<void>`, `export_backup(): Promise<string|null>`, `read_backup(): Promise<string|null>`, `restore_state({state}): Promise<void>`. Export and read use native dialogs, null means cancellation. Reads and writes validate independently. Native data directory uses stable identifier `dev.cornerbits.app`. One application instance. Native restore takes a pre-restore snapshot before replacing data. First changed save each UTC day retains a daily snapshot; no automatic backup deletion in phase one.

Window: 280×380 logical pixels, compact 280×36, frameless draggable title bar, minimize, close, always-on-top toggle, position remembered and clamped to a connected monitor. Close flushes pending saves. Native file failures must not silently reset or use browser storage. Browser preview exists only for frontend QA and says so explicitly.

## Verification

Test malformed/future schemas, roundtrip backup, queued writes, save failure and recovery, restore snapshot and disk replacement. Browser flows verify autosave after reload, export/import, invalid backup, cancellation, compact mode and keyboard use. Run typecheck, frontend tests, production build, Rust tests and desktop smoke test when toolchain is available.
