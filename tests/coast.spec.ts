import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('one coast connects fishing gathering and decorating without writing the old save',async({page})=>{
  const raw=await readFile('tests/fixtures/phase-seven.cornerbits','utf8');
  await page.addInitScript(value=>localStorage.setItem('cornerbits.preview.state',value),raw);
  await page.clock.install();await page.goto('/coast.html');
  await page.getByRole('button',{name:'집 꾸미기',exact:true}).click();await expect(page.getByRole('status')).toContainText('나무를 먼저');
  await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await expect(page.getByRole('button',{name:'부두에서 낚시하기'})).toBeDisabled();
  await page.clock.fastForward(4400);await expect(page.getByRole('img',{name:'주운 나무 1개'})).toBeVisible();
  await page.getByRole('button',{name:'집 꾸미기',exact:true}).click();await page.clock.fastForward(4400);await expect(page.getByRole('img',{name:'직접 놓은 꽃화분'})).toBeVisible();await expect(page.locator('.coast-wood')).toHaveCount(0);
  await page.getByRole('button',{name:'부두에서 낚시하기'}).click();await page.clock.fastForward(5400);await expect(page.getByRole('img',{name:'잡은 물고기 1마리'})).toBeVisible();
  for(let n=0;n<2;n++){await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await page.clock.fastForward(4400);await page.getByRole('button',{name:'집 꾸미기',exact:true}).click();await page.clock.fastForward(4400);}
  await expect(page.getByRole('img',{name:'직접 놓은 등불'})).toBeVisible();await expect(page.getByRole('img',{name:'직접 놓은 벤치'})).toBeVisible();await expect(page.getByRole('status')).toContainText('꾸미기 완성');
  expect(await page.evaluate(()=>localStorage.getItem('cornerbits.preview.state'))).toBe(raw);
});

test('pause compact and page hiding freeze the temporary action instead of awarding resources',async({page})=>{
  await page.clock.install();await page.goto('/coast.html');await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await page.clock.fastForward(600);
  await page.getByRole('button',{name:'움직임 정지'}).click();const position=await page.locator('.coast-person').getAttribute('style');
  await page.clock.fastForward(10000);expect(await page.locator('.coast-person').getAttribute('style')).toBe(position);await expect(page.locator('.coast-wood')).toHaveCount(0);
  await page.getByRole('button',{name:'움직임 재생'}).click();await page.getByRole('button',{name:'막대로 축소'}).click();await page.clock.fastForward(10000);await page.getByRole('button',{name:'펼치기'}).click();await expect(page.locator('.coast-wood')).toHaveCount(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(10000);await expect(page.locator('.coast-wood')).toHaveCount(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(4400);await expect(page.getByRole('img',{name:'주운 나무 1개'})).toBeVisible();
});

test('actual size stays transparent and reduced motion suppresses environmental animation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/coast.html');
  await expect(page.locator('.coast-shell')).toHaveCSS('width','280px');await expect(page.locator('.coast-shell')).toHaveCSS('height','380px');await expect(page.locator('.coast-shell')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(page.locator('.coast-water i').first()).toHaveCSS('animation-name','none');await expect(page.locator('.coast-smoke')).toHaveCSS('display','none');
  const corners=await page.evaluate(async()=>{const results=[];for(const name of ['coast-island.png','coast-actor.png','coast-props.png']){const image=new Image();image.src='/art/'+name;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);results.push([context.getImageData(0,0,1,1).data[3],context.getImageData(image.width-1,image.height-1,1,1).data[3]]);}return results;});
  expect(corners).toEqual([[0,0],[0,0],[0,0]]);
  expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width:280,height:380});
  await page.getByRole('button',{name:'화면 안내'}).click();await expect(page.getByText('이번 행동은 닫으면 초기화되며 기존 게임 기록은 바꾸지 않습니다.')).toBeVisible();
});
