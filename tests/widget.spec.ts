import { expect, test } from '@playwright/test';

test('management describes the desktop widget without a conflicting always-on-top control', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '관리', exact:true }).click();
  await page.getByLabel('보관함 사용 안내', { exact: true }).click();
  await expect(page.getByText('바탕화면 위젯', {exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox', {name:'항상 위에 표시'})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'백업 내보내기'})).toBeEnabled();
  await expect(page.getByRole('button', {name:'백업에서 복원'})).toBeEnabled();
});

test('compact bar and text buttons have no background or border', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '막대로 축소' }).click();
  await expect(page.locator('.compact')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.titlebar')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const expand = page.getByRole('button', { name: '펼치기', exact: true });
  await expect(expand).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(expand).toHaveCSS('border-top-width', '0px');
  await expect(expand).not.toHaveCSS('text-shadow', 'none');
  await expand.click();
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/phase-three.cornerbits');
  for (const name of ['이 백업으로 복원', '취소']) {
    const control = page.getByRole('button', { name, exact: true });
    await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(control).toHaveCSS('border-top-width', '0px');
  }
});
