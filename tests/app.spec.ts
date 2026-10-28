import { expect, test } from '@playwright/test';

test('settings autosave survives reload and an exported backup restores them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '데이터 관리' })).toBeVisible();
  const pinned = page.getByRole('checkbox', { name: '항상 위에 표시' });
  await pinned.check();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.reload();
  await expect(pinned).toBeChecked();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(download.suggestedFilename()).toMatch(/\.cornerbits$/);
  await pinned.uncheck();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await expect(page.getByRole('button', { name: '이 백업으로 복원' })).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(pinned).not.toBeChecked();
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await page.getByRole('button', { name: '이 백업으로 복원' }).click();
  await expect(pinned).toBeChecked();
  await page.reload();
  await expect(pinned).toBeChecked();
});

test('invalid backups do not overwrite current settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('checkbox', { name: '항상 위에 표시' }).check();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.cornerbits', mimeType: 'application/json', buffer: Buffer.from('{"backupVersion":999}') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '항상 위에 표시' })).toBeChecked();
});

test('compact mode is reversible and fits the small window', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '막대로 축소' }).click();
  await expect(page.getByRole('heading', { name: '데이터 관리' })).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByRole('button', { name: '펼치기' })).toBeVisible();
  await page.getByRole('button', { name: '펼치기' }).click();
  await expect(page.getByRole('heading', { name: '데이터 관리' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(280);
});

test('corrupt saved data blocks autosave without silently resetting it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cornerbits.preview.state', 'broken data'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: '백업에서 복원' })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('cornerbits.preview.state'))).toBe('broken data');
});

test('restoring a backup with the maximum revision remains readable after changes', async ({ page }) => {
  await page.goto('/');
  const state = { schemaVersion: 1, revision: Number.MAX_SAFE_INTEGER, updatedAt: '2026-10-28T01:00:00.000Z', settings: { alwaysOnTop: true, compact: false } };
  const backup = { format: 'CornerBits', backupVersion: 1, exportedAt: state.updatedAt, state };
  await page.locator('input[type=file]').setInputFiles({ name: 'max.cornerbits', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: '이 백업으로 복원' }).click();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '항상 위에 표시' })).toBeChecked();
  await page.getByRole('checkbox', { name: '항상 위에 표시' }).uncheck();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('save failures stay recoverable after opening and cancelling restore', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cornerbits.preview.state' && sessionStorage.getItem('fail-save') === 'yes') throw new Error('disk full');
      return original.call(this, key, value);
    };
    sessionStorage.setItem('fail-save', 'yes');
  });
  await page.getByRole('checkbox', { name: '항상 위에 표시' }).check();
  await expect(page.getByRole('button', { name: '저장 다시 시도' })).toBeVisible();
  const state = { schemaVersion: 1, revision: 0, updatedAt: '2026-10-28T01:00:00.000Z', settings: { alwaysOnTop: false, compact: false } };
  const backup = { format: 'CornerBits', backupVersion: 1, exportedAt: state.updatedAt, state };
  await page.locator('input[type=file]').setInputFiles({ name: 'valid.cornerbits', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '저장 다시 시도' })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('fail-save', 'no'));
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  await expect(page.getByRole('status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '항상 위에 표시' })).toBeChecked();
});
