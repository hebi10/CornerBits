import {expect,test} from '@playwright/test';
import {saved,catchFish} from './helpers';

test('caught fish stay on display after selling reloading and restoring a backup',async({page})=>{
  await page.clock.install();await page.goto('/');await catchFish(page);const before=await saved(page);
  await expect(page.locator('.fishing-keepsake')).toHaveCount(1);
  const display=before.games.fishing.keepsakes;expect(display).toHaveLength(1);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await page.getByRole('button',{name:/^물고기 일괄 판매/}).click();await saved(page);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await expect(page.locator('.fishing-keepsake')).toHaveCount(1);
  await page.reload();expect((await saved(page)).games.fishing.keepsakes).toEqual(display);await expect(page.locator('.fishing-keepsake')).toHaveCount(1);
  await page.getByRole('button',{name:'관리',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'백업 내보내기'}).click();const file=await(await download).path();
  await catchFish(page);await page.getByRole('button',{name:'관리',exact:true}).click();await page.locator('input[type=file]').setInputFiles(file!);await page.getByRole('button',{name:'이 백업으로 복원'}).click();
  expect((await saved(page)).games.fishing.keepsakes).toEqual(display);
});

test('equipment changes the actual next cast and regions change the transparent scene',async({page})=>{
  await page.clock.install();await page.goto('/');const state=await saved(page);
  Object.assign(state.games.fishing,{coins:500,totalCaught:25,casts:25,caught:[25,...Array(35).fill(0)],keepsakes:[0],unlockedLocations:6});
  await page.evaluate(s=>localStorage.setItem('cornerbits.preview.state',JSON.stringify(s)),state);await page.reload();await saved(page);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await page.getByRole('button',{name:'장비',exact:true}).click();await page.getByRole('button',{name:/^낚싯대 강화/}).click();expect((await saved(page)).games.fishing.rod).toBe(2);
  await expect(page.locator('.fishing-gear-effect')).toContainText('6초');
  await page.getByRole('button',{name:'지역',exact:true}).click();await page.getByLabel('낚시터 고르기').selectOption('5');await saved(page);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await expect(page.locator('.fishing-region').first()).toHaveAttribute('data-location','5');await expect(page.locator('.fishing-equipped-rod')).toHaveAttribute('data-rod','2');
  await page.getByRole('button',{name:'낚싯대 던지기',exact:true}).click();const cast=(await saved(page)).games.fishing.cast;
  expect(cast.biteAt-cast.startedAt).toBeGreaterThanOrEqual(17500);expect(cast.biteAt-cast.startedAt).toBeLessThanOrEqual(29500);expect(cast.expiresAt-cast.biteAt).toBe(6000);
});

test('resting widget keeps saved text accessible while showing only a quiet marker',async({page})=>{
  await page.goto('/');await saved(page);await expect(page.locator('.save-state')).toHaveClass(/save-state-quiet/);await expect(page.locator('.save-state')).toHaveCSS('font-size','0px');
  await expect(page.locator('.brand-name')).toHaveClass(/sr-only/);await expect(page.locator('.fishing-main-action')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});
