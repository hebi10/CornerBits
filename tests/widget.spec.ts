import { expect, test } from '@playwright/test';

test('management describes the desktop widget without a conflicting always-on-top control', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '관리', exact:true }).click();
  await expect(page.getByText('바탕화면 위젯', {exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox', {name:'항상 위에 표시'})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'백업 내보내기'})).toBeEnabled();
  await expect(page.getByRole('button', {name:'백업에서 복원'})).toBeEnabled();
});
