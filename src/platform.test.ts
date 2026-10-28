import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ invoke: vi.fn(), setSize: vi.fn(), setAlwaysOnTop: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: native.invoke }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => native,
  LogicalSize: class { constructor(public width: number, public height: number) {} },
}));
import { applyWindow } from './platform';

beforeEach(() => vi.clearAllMocks());

it('keeps widget placement under native control when loading an old always-on-top setting', async () => {
  await applyWindow({ alwaysOnTop: true, compact: false });
  expect(native.setAlwaysOnTop).not.toHaveBeenCalled();
  expect(native.invoke).toHaveBeenCalledWith('resize_widget', { compact: false });
  await applyWindow({ alwaysOnTop: false, compact: true });
  expect(native.invoke).toHaveBeenLastCalledWith('resize_widget', { compact: true });
  expect(native.setSize).not.toHaveBeenCalled();
});
