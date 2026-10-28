import { expect, test } from '@playwright/test';
import { saved, catchFish } from './helpers';

async function manage(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '관리', exact: true }).click();
}

test('backup cancellation keeps progress and confirmation restores the saved cast', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T06:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: '낚싯대 던지기', exact: true }).click();
  const before = (await saved(page)).games;
  await page.reload();
  expect((await saved(page)).games).toEqual(before);
  await manage(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/\.cornerbits$/);
  await page.getByRole('button', { name: '낚시', exact: true }).click();
  await page.getByRole('button', { name: /낚싯줄 당기기/ }).click();
  expect((await saved(page)).games.fishing.misses).toBe(1);
  await manage(page);
  await page.locator('input[type=file]').setInputFiles(path!);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect((await saved(page)).games.fishing.misses).toBe(1);
  await page.locator('input[type=file]').setInputFiles(path!);
  await page.getByRole('button', { name: '이 백업으로 복원' }).click();
  expect((await saved(page)).games).toEqual(before);
  await page.reload();
  expect((await saved(page)).games).toEqual(before);
});

test('invalid backups do not overwrite current progress', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  const before = (await catchFish(page)).games;
  await manage(page);
  await page.locator('input[type=file]').setInputFiles({ name:'bad.cornerbits', mimeType:'application/json', buffer:Buffer.from('{"backupVersion":999}') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  expect((await saved(page)).games).toEqual(before);
});

test('compact mode is reversible and fits the small window', async ({ page }) => {
  await page.goto('/');
  await manage(page);
  await page.getByRole('button', { name:'막대로 축소' }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('button', { name:'펼치기' })).toBeVisible();
  await page.getByRole('button', { name:'펼치기' }).click();
  await saved(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(280);
});

test('corrupt saved data blocks autosave without silently resetting it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cornerbits.preview.state', 'broken data'));
  await page.goto('/');
  await manage(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name:'백업에서 복원' })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('cornerbits.preview.state'))).toBe('broken data');
});

test('a maximum revision backup remains readable after layout changes', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await manage(page);
  const state = { schemaVersion:1, revision:Number.MAX_SAFE_INTEGER, updatedAt:'2026-10-28T01:00:00.000Z', settings:{ alwaysOnTop:true, compact:false } };
  await page.locator('input[type=file]').setInputFiles({ name:'max.cornerbits', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({ format:'CornerBits', backupVersion:1, exportedAt:state.updatedAt, state })) });
  await page.getByRole('button', { name:'이 백업으로 복원' }).click();
  await saved(page);
  await page.getByRole('button', { name:'막대로 축소' }).click();
  await page.getByRole('button', { name:'펼치기' }).click();
  await saved(page);
  await page.reload();
  expect((await saved(page)).settings.alwaysOnTop).toBe(true);
});

test('save failure stays recoverable after opening and cancelling restore', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'cornerbits.preview.state' && sessionStorage.getItem('fail-save') === 'yes') throw new Error('disk full');
      return original.call(this,key,value);
    };
    sessionStorage.setItem('fail-save','yes');
  });
  await page.getByRole('button', { name:'낚싯대 던지기', exact:true }).click();
  await expect(page.getByRole('button', { name:'저장 다시 시도' })).toBeVisible();
  await manage(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/phase-five.cornerbits');
  await page.getByRole('button', { name:'취소', exact:true }).click();
  await page.evaluate(() => sessionStorage.setItem('fail-save','no'));
  await page.getByRole('button', { name:'저장 다시 시도' }).click();
  expect((await saved(page)).games.fishing.cast).not.toBeNull();
  await page.reload();
  expect((await saved(page)).games.fishing.casts).toBe(1);
});
