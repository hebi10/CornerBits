import {expect,test} from '@playwright/test';
import {saved,catchFish} from './helpers';

test('catch sell buy and consume premium bait then restore the full fishing inventory',async({page})=>{
  await page.clock.install({time:new Date('2026-10-28T08:00:00Z')});await page.goto('/');
  for(let i=0;i<5;i++)await catchFish(page);
  let fishing=(await saved(page)).games.fishing;
  expect(fishing.coins).toBe(0);expect(fishing.inventory.reduce((a:number,b:number)=>a+b,0)).toBe(5);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();
  await page.getByRole('button',{name:/^물고기 일괄 판매/}).click();
  fishing=(await saved(page)).games.fishing;
  expect(fishing.coins).toBeGreaterThanOrEqual(50);expect(fishing.inventory.every((n:number)=>n===0)).toBe(true);
  const coins=fishing.coins;
  await page.getByRole('button',{name:/5개 구매 50 코인/}).click();
  fishing=(await saved(page)).games.fishing;
  expect(fishing.coins).toBe(coins-50);expect(fishing.baitStock).toEqual([5,0]);expect(fishing.bait).toBe(1);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();
  const expected=(await catchFish(page)).games;
  expect(expected.fishing.baitStock).toEqual([4,0]);expect(expected.fishing.inventory.reduce((a:number,b:number)=>a+b,0)).toBe(1);
  expect(expected.fishing.coins).toBe(coins-50);
  await page.getByRole('button',{name:'관리',exact:true}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'백업 내보내기'}).click();const path=await(await download).path();
  await catchFish(page);
  await page.getByRole('button',{name:'관리',exact:true}).click();await page.locator('input[type=file]').setInputFiles(path!);await page.getByRole('button',{name:'이 백업으로 복원'}).click();
  expect((await saved(page)).games).toEqual(expected);await page.reload();expect((await saved(page)).games).toEqual(expected);
});

test('a fourth local species and the catch threshold permanently open the next location',async({page})=>{
  await page.clock.install({time:new Date('2026-10-28T08:00:00Z')});await page.goto('/');const state=await saved(page);
  const now=await page.evaluate(()=>Date.now());
  state.games.fishing={...state.games.fishing,caught:[67,1,1,0,...Array(32).fill(0)],totalCaught:69,casts:70,lastObservedAt:now,cast:{startedAt:now,biteAt:now+18000,expiresAt:now+23000,species:3}};
  await page.evaluate(value=>localStorage.setItem('cornerbits.preview.state',JSON.stringify(value)),state);await page.reload();await saved(page);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await expect(page.getByLabel('낚시터 고르기').locator('option[value="1"]')).toBeDisabled();await page.getByLabel('낚시 도구와 도감',{exact:true}).click();
  await page.clock.fastForward(18500);await page.getByRole('button',{name:/낚싯줄 당기기, 입질 중/}).click();expect((await saved(page)).games.fishing.unlockedLocations).toBe(2);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();const location=page.getByLabel('낚시터 고르기');await location.selectOption('1');await saved(page);await location.selectOption('0');await saved(page);await location.selectOption('1');await saved(page);
  await page.reload();expect((await saved(page)).games.fishing).toMatchObject({location:1,unlockedLocations:2});
});

test('an empty paid bait selection can switch to the free bait without losing progress',async({page})=>{
  await page.goto('/');const state=await saved(page);state.games.fishing.bait=1;
  await page.evaluate(value=>localStorage.setItem('cornerbits.preview.state',JSON.stringify(value)),state);await page.reload();await saved(page);
  await expect(page.getByRole('button',{name:'낚싯대 던지기',exact:true})).toBeDisabled();await expect(page.getByText('미끼 없음 · 도구에서 구매 또는 기본 미끼 선택')).toBeVisible();
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await page.getByLabel('미끼 고르기').selectOption('0');await saved(page);await page.getByLabel('낚시 도구와 도감',{exact:true}).click();
  await expect(page.getByRole('button',{name:'낚싯대 던지기',exact:true})).toBeEnabled();
});

test('the open shop still exposes an active bite and lets the angler land it',async({page})=>{
  await page.clock.install();await page.goto('/');await page.getByRole('button',{name:'낚싯대 던지기',exact:true}).click();const state=await saved(page);
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();const now=await page.evaluate(()=>Date.now());await page.clock.fastForward(state.games.fishing.cast.biteAt-now+500);
  await page.getByRole('button',{name:'당기기',exact:true}).click();expect((await saved(page)).games.fishing.totalCaught).toBe(1);await expect(page.locator('.fishing-play')).toBeVisible();
});

for(const result of ['catch','miss'] as const)test(`the last paid bait ${result} explains how to continue fishing`,async({page})=>{
  await page.clock.install();await page.goto('/');const state=await saved(page);
  state.games.fishing.bait=1;state.games.fishing.baitStock=[1,0];
  await page.evaluate(value=>localStorage.setItem('cornerbits.preview.state',JSON.stringify(value)),state);await page.reload();await saved(page);
  await page.getByRole('button',{name:'낚싯대 던지기',exact:true}).click();const cast=(await saved(page)).games.fishing.cast;
  if(result==='catch'){
    const now=await page.evaluate(()=>Date.now());await page.clock.fastForward(cast.biteAt-now+500);
  }
  await page.getByRole('button',{name:/낚싯줄 당기기/}).click();
  const fishing=(await saved(page)).games.fishing;expect(fishing.baitStock).toEqual([0,0]);expect(fishing.cast).toBeNull();
  expect(result==='catch'?fishing.totalCaught:fishing.misses).toBe(1);
  await expect(page.getByRole('button',{name:'낚싯대 던지기',exact:true})).toBeDisabled();
  await expect(page.locator('.fishing-status')).toContainText('미끼 없음 · 도구에서 구매 또는 기본 미끼 선택');
  await page.getByLabel('낚시 도구와 도감',{exact:true}).click();await page.getByLabel('미끼 고르기').selectOption('0');await saved(page);await page.getByLabel('낚시 도구와 도감',{exact:true}).click();
  await expect(page.getByRole('button',{name:'낚싯대 던지기',exact:true})).toBeEnabled();
});
