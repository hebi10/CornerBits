import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { encodeBackup, parseState, type AppState } from './core/state';

export const desktop = isTauri();
const previewKey = 'cornerbits.preview.state';

export async function inspectState(): Promise<AppState | null> {
  if (!desktop) return null;
  const state = await invoke<AppState | null>('inspect_state');
  return state === null ? null : parseState(JSON.stringify(state));
}

export async function loadState(): Promise<AppState | null> {
  if (desktop) {
    const state = await invoke<AppState | null>('load_state');
    return state === null ? null : parseState(JSON.stringify(state));
  }
  const stored = localStorage.getItem(previewKey);
  if (stored === null) return null;
  const state = parseState(stored);
  if (JSON.parse(stored).schemaVersion !== state.schemaVersion) {
    // Keep the exact original before replacing a validated legacy save.
    localStorage.setItem(`cornerbits.preview.pre-migration.${crypto.randomUUID()}`, stored);
    localStorage.setItem(previewKey, JSON.stringify(state));
  }
  return state;
}

export async function saveState(state: AppState): Promise<void> {
  if (desktop) return invoke('save_state', { state });
  // Browser storage is deliberately isolated from the installed application's files.
  const previous = localStorage.getItem(previewKey);
  const day = new Date().toISOString().slice(0, 10);
  const snapshotKey = `cornerbits.preview.daily.${day}`;
  if (previous !== null && localStorage.getItem(snapshotKey) === null) {
    parseState(previous);
    localStorage.setItem(snapshotKey, previous);
  }
  localStorage.setItem(previewKey, JSON.stringify(state));
}

export async function exportBackup(state: AppState): Promise<string | null> {
  if (desktop) return invoke('export_backup');
  const name = `CornerBits_Backup_${new Date().toISOString().slice(0, 10)}.cornerbits`;
  const blob = new Blob([encodeBackup(state)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return name;
}

export async function readNativeBackup(): Promise<string | null> {
  return invoke('read_backup');
}

export async function restoreState(state: AppState): Promise<void> {
  if (desktop) return invoke('restore_state', { state });
  const previous = localStorage.getItem(previewKey);
  if (previous !== null) {
    // Preserve even a corrupt original for recovery instead of silently discarding it.
    localStorage.setItem(`cornerbits.preview.before-restore.${crypto.randomUUID()}`, previous);
  }
  localStorage.setItem(previewKey, JSON.stringify(state));
}

export async function applyWindow(settings: AppState['settings']): Promise<void> {
  if (!desktop) return;
  // Legacy alwaysOnTop stays in backups, but desktop placement belongs to the
  // native widget controller. Its explicit resize also recovers the expanded
  // layout into view, without clamping intermediate drag/DPI move events.
  await invoke('resize_widget', { compact: settings.compact });
}

export async function closeWindow(): Promise<void> {
  if (desktop) await getCurrentWindow().close();
}
