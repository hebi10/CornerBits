import { expect, test } from '@playwright/test';

async function saved(page: import('@playwright/test').Page) {
  await expect(page.getByRole('status').first()).toContainText('저장 완료');
  return page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!));
}

test('mining damage and garden planting survive reload and one backup restores both', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '미니 광산', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^1번.*내구도/ }).click();
  let state = await saved(page);
  expect(state.games.mine.tiles[0]).toBe(1);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByRole('button', { name: /1번.*심기/ }).click();
  state = await saved(page);
  expect(state.games.garden.pots[0]?.species).toBe(0);
  const expected = state.games;
  await page.reload();
  expect((await saved(page)).games).toEqual(expected);
  await page.getByRole('button', { name: '관리', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기' }).click();
  const backupPath = await (await downloadPromise).path();
  await page.getByRole('button', { name: '광산', exact: true }).click();
  await page.getByRole('button', { name: /^1번.*내구도/ }).click();
  expect((await saved(page)).games.mine.totalMined).toBe(1);
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await page.getByRole('button', { name: '이 백업으로 복원' }).click();
  expect((await saved(page)).games).toEqual(expected);
  const snapshot = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cornerbits.preview.before-restore.')).map((key) => JSON.parse(localStorage.getItem(key)!)));
  expect(snapshot[0].games.mine.totalMined).toBe(1);
  await page.reload();
  expect((await saved(page)).games).toEqual(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(280);
});

test('legacy save migration preserves the original and settings', async ({ page }) => {
  const legacy = { schemaVersion: 1, revision: 8, updatedAt: '2026-10-28T01:00:00Z', settings: { alwaysOnTop: true, compact: false } };
  await page.goto('/');
  await saved(page);
  await page.evaluate((value) => localStorage.setItem('cornerbits.preview.state', value), JSON.stringify(legacy));
  await page.reload();
  const state = await saved(page);
  expect(state.schemaVersion).toBe(3);
  expect(state.settings).toEqual(legacy.settings);
  const originals = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cornerbits.preview.pre-migration.')).map((key) => localStorage.getItem(key)));
  expect(originals).toEqual([JSON.stringify(legacy)]);
  await page.reload();
  await saved(page);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cornerbits.preview.pre-migration.')).length)).toBe(1);
});

test('offline garden growth is ready once after reopening', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T03:00:00Z') });
  await page.goto('/');
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByRole('button', { name: /1번.*심기/ }).click();
  await saved(page);
  await page.clock.fastForward(2 * 60_000);
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByRole('button', { name: /1번.*수확/ }).click();
  expect((await saved(page)).games.garden.totalHarvests).toBe(1);
  await expect(page.getByRole('button', { name: /1번.*수확/ })).toHaveCount(0);
});

test('a damaged game backup cannot replace current progress', async ({ page }) => {
  await page.goto('/');
  const state = await saved(page);
  state.games.mine.tiles = [999];
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'bad-game.cornerbits', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'CornerBits', backupVersion: 1, exportedAt: state.updatedAt, state })) });
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await saved(page)).games.mine.tiles).toEqual(Array(25).fill(2));
});

test('failed game saves lock further play and retry persists the pending action', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cornerbits.preview.state' && sessionStorage.getItem('fail-game-save') === 'yes') throw new Error('disk full');
      original.call(this, key, value);
    };
    sessionStorage.setItem('fail-game-save', 'yes');
  });
  const tile = page.getByRole('button', { name: /^1번.*내구도/ });
  await tile.click();
  await expect(page.getByRole('button', { name: '저장 다시 시도' })).toBeVisible();
  await expect(tile).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!).games.mine.tiles[0])).toBe(2);
  await page.evaluate(() => sessionStorage.setItem('fail-game-save', 'no'));
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  expect((await saved(page)).games.mine.tiles[0]).toBe(1);
  await page.reload();
  expect((await saved(page)).games.mine.tiles[0]).toBe(1);
});

test('legacy restore warns that games restart and cancellation preserves progress', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.getByRole('button', { name: /^1번.*내구도/ }).click();
  const before = await saved(page);
  const legacy = { schemaVersion: 1, revision: 3, updatedAt: before.updatedAt, settings: before.settings };
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'legacy.cornerbits', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({format:'CornerBits',backupVersion:1,exportedAt:before.updatedAt,state:legacy})) });
  await expect(page.getByText('1단계 설정 백업입니다. 복원하면 세 게임 진행도가 처음 상태로 바뀝니다.')).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect((await saved(page)).games).toEqual(before.games);
});

test('failed legacy snapshot leaves the original save untouched', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  const original = JSON.stringify({ schemaVersion:1,revision:8,updatedAt:'2026-10-28T01:00:00Z',settings:{alwaysOnTop:true,compact:false} });
  await page.evaluate(value => localStorage.setItem('cornerbits.preview.state', value), original);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('cornerbits.preview.pre-migration.')) throw new Error('snapshot denied');
      set.call(this,key,value);
    };
  });
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cornerbits.preview.state'))).toBe(original);
  await expect(page.getByRole('button', { name: /^1번.*내구도/ })).toHaveCount(0);
});
