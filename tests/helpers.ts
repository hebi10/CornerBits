import { expect, type Page } from '@playwright/test';

export async function saved(page: Page) {
  await expect(page.locator('.save-state, .compact-status')).toContainText('저장 완료');
  return page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!));
}

export async function catchFish(page: Page) {
  await page.getByRole('button', { name: '낚시', exact: true }).click();
  await page.getByRole('button', { name: '낚싯대 던지기', exact: true }).click();
  const state = await saved(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.fastForward(Math.max(0, state.games.fishing.cast.biteAt - now + 700));
  await page.getByRole('button', { name: /낚싯줄 당기기, 입질 중/ }).click();
  return saved(page);
}
