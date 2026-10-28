import { expect, test } from '@playwright/test';
import { saved } from './helpers';

test('one connected angler scene replaces loose ornaments and keeps tools in the menu', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await expect(page.locator('.fishing-play').getByRole('button')).toHaveCount(1);
  await expect(page.locator('.fishing-angler-scene')).toBeVisible();
  await expect(page.locator('.fishing-keepsakes, .fishing-island')).toHaveCount(0);
  await page.getByLabel('낚시 도구와 도감', { exact: true }).click();
  await expect(page.locator('.fishing-play')).toBeHidden();
  await expect(page.getByRole('button', { name: /^낚싯대 강화/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^낚싯대 강화/ })).toBeDisabled();
});

test('the angler shows saved waiting bite and catch states without changing the fishing rules', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T08:00:00Z') });
  await page.goto('/');
  await saved(page);
  const scene = page.locator('.fishing-angler-scene');
  await expect(scene).toHaveAttribute('data-scene', 'idle');
  await page.getByRole('button', { name: '낚싯대 던지기', exact: true }).click();
  const cast = (await saved(page)).games.fishing.cast;
  await expect(scene).toHaveAttribute('data-scene', 'waiting');
  const now = await page.evaluate(() => Date.now());
  await page.clock.fastForward(cast.biteAt - now + 500);
  await expect(scene).toHaveAttribute('data-scene', 'bite');
  await page.getByRole('button', { name: /낚싯줄 당기기, 입질 중/ }).click();
  await expect(scene).toHaveAttribute('data-scene', 'catch');
  const caught = (await saved(page)).games.fishing;
  expect(caught.totalCaught).toBe(1);
  expect(caught.caught[cast.species]).toBe(1);
  await page.reload();
  expect((await saved(page)).games.fishing).toEqual(caught);
  await expect(scene).toHaveAttribute('data-scene', 'idle');
});
