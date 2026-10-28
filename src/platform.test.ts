import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ setSize: vi.fn(), setAlwaysOnTop: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => native,
  LogicalSize: class { constructor(public width: number, public height: number) {} },
}));
import { applyWindow } from './platform';

beforeEach(() => vi.clearAllMocks());

it('keeps widget placement under native control when loading an old always-on-top setting', async () => {
  await applyWindow({ alwaysOnTop: true, compact: false });
  expect(native.setAlwaysOnTop).not.toHaveBeenCalled();
  expect(native.setSize).toHaveBeenCalledWith(expect.objectContaining({ width:280, height:380 }));
  await applyWindow({ alwaysOnTop: false, compact: true });
  expect(native.setSize).toHaveBeenLastCalledWith(expect.objectContaining({ width:280, height:36 }));
});
