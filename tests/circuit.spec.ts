import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { circuitStatus, puzzleForStage, rotateMask, type CircuitState } from '../src/games/circuit.ts';

async function saved(page: Page) {
  await expect(page.getByRole('status').first()).toContainText('저장 완료');
  return page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!));
}

async function solve(page: Page) {
  let circuit: CircuitState = (await saved(page)).games.circuit;
  const puzzle = puzzleForStage(circuit.stage);
  for (let index = 0; index < circuit.rotations.length; index++) {
    for (let turn = 0; turn < 3 && rotateMask(puzzle.masks[index], circuit.rotations[index]) !== puzzle.masks[index] && !circuitStatus(circuit).solved; turn++) {
      await page.getByRole('button', { name: new RegExp(`^회로 ${index + 1}번,`) }).click();
      circuit = (await saved(page)).games.circuit;
    }
  }
  expect(circuitStatus(circuit).solved).toBe(true);
  return circuit;
}

test('version two migration preserves exact original bytes and both games', async ({ page }) => {
  const backup = JSON.parse(await readFile('tests/fixtures/phase-two.cornerbits', 'utf8'));
  const original = JSON.stringify(backup.state, null, 2);
  await page.addInitScript(value => localStorage.setItem('cornerbits.preview.state', value), original);
  await page.goto('/');
  const state = await saved(page);
  expect(state.schemaVersion).toBe(3);
  expect(state.games.mine).toEqual(backup.state.games.mine);
  expect(state.games.garden).toEqual(backup.state.games.garden);
  expect(state.games.circuit.totalClears).toBe(0);
  const snapshots = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('cornerbits.preview.pre-migration.')).map(key => localStorage.getItem(key)));
  expect(snapshots).toEqual([original]);
});

test('rotations, solved records and all three games survive reload and backup restore', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await expect(page.getByRole('button', { name: '회로', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^1번.*내구도/ }).click();
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByRole('button', { name: /1번.*심기/ }).click();
  await saved(page);
  await page.getByRole('button', { name: '회로', exact: true }).click();
  await page.getByRole('button', { name: /^회로 1번,/ }).click();
  const partial = (await saved(page)).games.circuit;
  await page.reload();
  expect((await saved(page)).games.circuit).toEqual(partial);
  await page.getByRole('button', { name: '회로', exact: true }).click();
  const completed = await solve(page);
  expect(completed.totalClears).toBe(1);
  expect(completed.records[0]).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /^회로 1번,/ })).toBeDisabled();
  const expected = (await saved(page)).games;
  await page.getByRole('button', { name: '관리', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기' }).click();
  const backupPath = await (await download).path();
  await page.getByRole('button', { name: '회로', exact: true }).click();
  await page.getByRole('button', { name: '다음 회로', exact: true }).click();
  expect((await saved(page)).games.circuit.stage).toBe(2);
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(backupPath!);
  await page.getByRole('button', { name: '이 백업으로 복원' }).click();
  expect((await saved(page)).games).toEqual(expected);
  await page.reload();
  expect((await saved(page)).games).toEqual(expected);
});

test('old two-game backups warn about circuit reset and invalid circuit data is rejected', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.getByRole('button', { name: '회로', exact: true }).click();
  await page.getByRole('button', { name: /^회로 1번,/ }).click();
  const before = await saved(page);
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/phase-two.cornerbits');
  await expect(page.getByText('광산·정원 백업입니다. 복원하면 회로 기록은 처음 상태로 바뀝니다.')).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect((await saved(page)).games).toEqual(before.games);
  const invalid = structuredClone(before);
  invalid.games.circuit.rotations[0] = 4;
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid-circuit.cornerbits', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format:'CornerBits', backupVersion:1, exportedAt:before.updatedAt, state:invalid })) });
  await expect(page.getByRole('alert')).toBeVisible();
  expect((await saved(page)).games).toEqual(before.games);
});

test('version two migration failure leaves its source untouched', async ({ page }) => {
  const original = JSON.stringify(JSON.parse(await readFile('tests/fixtures/phase-two.cornerbits', 'utf8')).state);
  await page.addInitScript(value => {
    localStorage.setItem('cornerbits.preview.state', value);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, content) {
      if (key.startsWith('cornerbits.preview.pre-migration.')) throw new Error('test snapshot unavailable');
      setItem.call(this, key, content);
    };
  }, original);
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cornerbits.preview.state'))).toBe(original);
});

test('circuit save failure locks further turns and retry preserves the pending turn', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.getByRole('button', { name: '회로', exact: true }).click();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, content) {
      if (key === 'cornerbits.preview.state' && fail) { fail = false; throw new Error('test full'); }
      setItem.call(this, key, content);
    };
  });
  const tile = page.getByRole('button', { name: /^회로 1번,/ });
  await tile.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(tile).toBeDisabled();
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  expect((await saved(page)).games.circuit.turns).toBe(1);
  await expect(tile).toBeEnabled();
});

test('migrated state is not snapshotted again and a persisted five by five circuit fits', async ({ page }) => {
  const old = JSON.parse(await readFile('tests/fixtures/phase-two.cornerbits', 'utf8')).state;
  await page.goto('/');
  await saved(page);
  await page.evaluate(value => localStorage.setItem('cornerbits.preview.state', JSON.stringify(value)), old);
  await page.reload();
  await saved(page);
  await page.reload();
  await saved(page);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('cornerbits.preview.pre-migration.')).length)).toBe(1);
  const state = JSON.parse(await readFile('tests/fixtures/phase-three.cornerbits', 'utf8')).state;
  await page.evaluate(value => localStorage.setItem('cornerbits.preview.state', JSON.stringify(value)), state);
  await page.reload();
  expect((await saved(page)).games.circuit).toEqual(state.games.circuit);
  await page.getByRole('button', { name: '회로', exact: true }).click();
  await expect(page.locator('.circuit-tile')).toHaveCount(25);
  const box = await page.locator('.circuit-board').boundingBox();
  expect(box!.y + box!.height).toBeLessThan(380);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(280);
});
