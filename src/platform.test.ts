import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ invoke: vi.fn(), setSize: vi.fn(), setAlwaysOnTop: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: native.invoke }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => native,
  LogicalSize: class { constructor(public width: number, public height: number) {} },
}));
import { applyWindow, inspectState } from './platform';
import { initialState } from './core/state';

beforeEach(() => vi.clearAllMocks());

it('keeps widget placement under native control when loading an old always-on-top setting', async () => {
  await applyWindow({ alwaysOnTop: true, compact: false });
  expect(native.setAlwaysOnTop).not.toHaveBeenCalled();
  expect(native.invoke).toHaveBeenCalledWith('resize_widget', { compact: false });
  await applyWindow({ alwaysOnTop: false, compact: true });
  expect(native.invoke).toHaveBeenLastCalledWith('resize_widget', { compact: true });
  expect(native.setSize).not.toHaveBeenCalled();
});

it('inspects existing records through the read-only command without loading or saving them', async () => {
  const state=initialState();native.invoke.mockResolvedValueOnce(state);
  expect(await inspectState()).toEqual(state);
  expect(native.invoke).toHaveBeenCalledTimes(1);
  expect(native.invoke).toHaveBeenCalledWith('inspect_state');
});

it('rejects an invalid inspection result without attempting a repair write', async () => {
  native.invoke.mockResolvedValueOnce({...initialState(),schemaVersion:999});
  await expect(inspectState()).rejects.toThrow('지원하지 않는');
  expect(native.invoke).toHaveBeenCalledTimes(1);
  expect(native.invoke).toHaveBeenCalledWith('inspect_state');
});
