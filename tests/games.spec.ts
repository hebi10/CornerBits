import { expect, test } from '@playwright/test';
import { saved, catchFish } from './helpers';

test('fishing garden and sword changes survive reload and a combined backup restore', async ({ page }) => {
  await page.clock.install({ time:new Date('2026-10-28T06:00:00Z') });
  await page.goto('/');
  await catchFish(page);
  await page.getByRole('button', { name:'정원', exact:true }).click();
  await page.getByRole('button', { name:/1번.*심기/ }).click();
  await saved(page);
  await page.getByRole('button', { name:'검 키우기', exact:true }).click();
  await page.getByRole('button', { name:/^검 연마,/ }).click();
  await saved(page);
  await page.clock.fastForward(10_000);
  await page.getByRole('button', { name:/^검 연마,/ }).click();
  await saved(page);
  await page.getByRole('button', { name:/^일반 강화,/ }).click();
  const expected = (await saved(page)).games;
  expect(expected.fishing.totalCaught).toBe(1);
  expect(expected.garden.pots[0]?.species).toBe(0);
  expect(expected.sword.attempts).toBe(1);
  await page.reload();
  expect((await saved(page)).games).toEqual(expected);
  await page.getByRole('button', { name:'관리', exact:true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name:'백업 내보내기' }).click();
  const path = await (await download).path();
  await catchFish(page);
  await page.getByRole('button', { name:'관리', exact:true }).click();
  await page.locator('input[type=file]').setInputFiles(path!);
  await page.getByRole('button', { name:'이 백업으로 복원' }).click();
  expect((await saved(page)).games).toEqual(expected);
  const snapshots = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('cornerbits.preview.before-restore.')).map(key => JSON.parse(localStorage.getItem(key)!)));
  expect(snapshots[0].games.fishing.totalCaught).toBe(2);
  await page.reload();
  expect((await saved(page)).games).toEqual(expected);
});

test('the persisted fishing bite and species cannot be rerolled by reopening', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name:'낚싯대 던지기', exact:true }).click();
  const state = await saved(page);
  const now = await page.evaluate(() => Date.now());
  await page.reload();
  expect((await saved(page)).games.fishing).toEqual(state.games.fishing);
  await page.clock.fastForward(state.games.fishing.cast.biteAt - now + 500);
  await page.getByRole('button', { name:/낚싯줄 당기기, 입질 중/ }).click();
  const caught = (await saved(page)).games.fishing;
  expect(caught.caught[state.games.fishing.cast.species]).toBe(1);
  expect(caught.rng).toBe(state.games.fishing.rng);
});

test('offline garden growth is ready once after reopening', async ({ page }) => {
  await page.clock.install({ time:new Date('2026-10-28T06:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name:'정원', exact:true }).click();
  await page.getByRole('button', { name:/1번.*심기/ }).click();
  await saved(page);
  await page.clock.fastForward(120_000);
  await page.reload();
  await page.getByRole('button', { name:'정원', exact:true }).click();
  await page.getByRole('button', { name:/1번.*수확/ }).click();
  expect((await saved(page)).games.garden.totalHarvests).toBe(1);
  await expect(page.getByRole('button', { name:/1번.*수확/ })).toHaveCount(0);
});

test('failed saves lock fishing and retry preserves the pending cast', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) {
      if (key === 'cornerbits.preview.state' && sessionStorage.getItem('fail') === 'yes') throw new Error('disk full');
      return original.call(this,key,value);
    };
    sessionStorage.setItem('fail','yes');
  });
  await page.getByRole('button', { name:'낚싯대 던지기', exact:true }).click();
  await expect(page.locator('.fishing-main-action')).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!).games.fishing.casts)).toBe(0);
  await page.evaluate(() => sessionStorage.setItem('fail','no'));
  await page.getByRole('button', { name:'저장 다시 시도' }).click();
  expect((await saved(page)).games.fishing.casts).toBe(1);
  await page.reload();
  expect((await saved(page)).games.fishing.cast).not.toBeNull();
});
