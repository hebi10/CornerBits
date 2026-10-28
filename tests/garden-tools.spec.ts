import { expect, test } from '@playwright/test';

test('garden picture catalog replaces the pots and fits without a scrolling panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByLabel('정원 도구와 도감', { exact: true }).click();
  const catalog = page.getByRole('group', { name: '씨앗 그림 도감' });
  await expect(catalog).toBeVisible();
  await expect(catalog.getByRole('button')).toHaveCount(8);
  await expect(page.locator('.garden-pots')).toBeHidden();
  await expect(page.locator('.garden-details')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.garden-details-body')).toHaveCSS('overflow-y', 'visible');
  const bottom = await page.locator('.garden-details').evaluate(element => element.getBoundingClientRect().bottom);
  expect(bottom).toBeLessThanOrEqual(355);
  await expect(page.getByRole('button', { name: '이전 도감 쪽' })).toBeDisabled();
  await page.getByRole('button', { name: '다음 도감 쪽' }).click();
  await expect(page.getByText('2 / 5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '백일홍 씨앗, 잠김' })).toBeDisabled();
  for (let index = 0; index < 3; index += 1) await page.getByRole('button', { name: '다음 도감 쪽' }).click();
  await expect(page.getByText('5 / 5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 도감 쪽' })).toBeDisabled();
  await page.getByLabel('정원 도구와 도감', { exact: true }).click();
  await expect(page.locator('.garden-pots')).toBeVisible();
});

test('an unlocked seed can be chosen with the picture catalog and planted after closing it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status').first()).toHaveText('저장 완료');
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('cornerbits.preview.state')!);
    state.games.garden.harvested[0] = 5;
    state.games.garden.totalHarvests = 5;
    state.games.garden.unlockedSpecies = 2;
    localStorage.setItem('cornerbits.preview.state', JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByLabel('정원 도구와 도감', { exact: true }).click();
  const clover = page.getByRole('button', { name: '클로버 씨앗 선택', exact: true });
  await clover.focus();
  await page.keyboard.press('Enter');
  await expect(clover).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('심을 씨앗', { exact: true })).toHaveValue('1');
  await page.getByLabel('정원 도구와 도감', { exact: true }).click();
  await page.getByRole('button', { name: '1번 화분 클로버 심기', exact: true }).click();
  await expect(page.getByRole('status').first()).toHaveText('저장 완료');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!).games.garden.pots[0].species)).toBe(1);
});
