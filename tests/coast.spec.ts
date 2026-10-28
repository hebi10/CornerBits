import {expect,test,type Page} from '@playwright/test';
async function saved(page:Page){await expect(page.locator('.coast-save-state')).toHaveText('저장 완료');return page.evaluate(()=>JSON.parse(localStorage.getItem('cornerbits.preview.state')!));}

test('fishing and gathered resources become a permanently saved home decoration',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install();await page.goto('/coast.html');await saved(page);
 await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await saved(page);await page.clock.fastForward(600_000);expect((await saved(page)).games.coast).toMatchObject({wood:2,activity:'gather'});
 await page.clock.fastForward(600_000);const running=(await saved(page)).games.coast;expect(running).toMatchObject({wood:4,activity:'gather',lastReport:{id:2,amount:2},workAmount:4});expect(running.workTimeMs).toBeGreaterThanOrEqual(1_200_000);expect(running.workTimeMs).toBeLessThan(1_201_000);await expect(page.getByRole('timer')).toHaveText('채집 20:00 · 나무 +4');await expect(page.locator('.coast-work-line')).toHaveAttribute('title','나무 4개');
 await page.getByRole('button',{name:'작업 중단',exact:true}).click();await saved(page);await page.getByRole('button',{name:'부두에서 낚시하기'}).click();await saved(page);
 await page.clock.fastForward(10_000);expect((await saved(page)).games.coast.fish).toBe(0);await page.clock.fastForward(590_000);await saved(page);
 await page.getByRole('button',{name:'물고기 2마리 판매',exact:true}).click();expect((await saved(page)).games.coast.coins).toBe(30);
 expect((await saved(page)).games.coast.activity).toBe('fish');await expect(page.getByRole('timer')).toHaveText('낚시 10:00 · 물고기 +2');await page.getByRole('button',{name:'작업 중단',exact:true}).click();await saved(page);
 await page.getByRole('button',{name:'집 꾸미기',exact:true}).click();await page.getByRole('button',{name:'꽃화분 제작',exact:true}).click();await saved(page);await page.clock.fastForward(4500);
 const coast=(await saved(page)).games.coast;expect(coast).toMatchObject({decoration:1,wood:1,coins:10,fish:0,catches:2,totalGathered:4});await expect(page.getByRole('img',{name:'직접 놓은 꽃화분'})).toBeVisible();expect(errors).toEqual([]);
 await page.reload();expect((await saved(page)).games.coast).toEqual(coast);
});

test('explicit pause freezes work while compact keeps working and reopening preserves the remainder',async({page})=>{
 await page.clock.install();await page.goto('/coast.html');await saved(page);await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await saved(page);await page.clock.fastForward(640);
 await page.getByRole('button',{name:'움직임 정지'}).click();let coast=(await saved(page)).games.coast;expect(coast.elapsedMs).toBeGreaterThan(0);expect(coast.wood).toBe(0);
 await page.clock.fastForward(600_000);expect((await saved(page)).games.coast).toEqual(coast);
 await page.getByRole('button',{name:'움직임 재생'}).click();await page.getByRole('button',{name:'막대로 축소'}).click();await saved(page);await page.clock.fastForward(600_000);await page.getByRole('button',{name:'펼치기'}).click();await saved(page);expect((await saved(page)).games.coast.wood).toBe(2);
 const before=(await saved(page)).games.coast;await page.reload();coast=(await saved(page)).games.coast;expect(coast).toEqual(before);await page.clock.fastForward(600_000);expect((await saved(page)).games.coast.wood).toBe(4);
});

test('one-to-one transparent scene and record menu remain usable with reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/coast.html');await saved(page);
 await expect(page.locator('.coast-shell')).toHaveCSS('width','280px');await expect(page.locator('.coast-shell')).toHaveCSS('height','380px');await expect(page.locator('.coast-shell')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(page.locator('.coast-water i').first()).toHaveCSS('animation-name','none');
 await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await expect(page.getByRole('button',{name:'백업 내보내기'})).toBeVisible();await expect(page.getByRole('button',{name:'백업에서 복원'})).toBeVisible();
 expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width:280,height:380});
});

test('coastal scenery and growth stages load with transparent corners',async({page})=>{
 await page.goto('/coast.html');await saved(page);
 const assets=await page.evaluate(async()=>Promise.all(['coast-island.png','coast-island-level2.png','coast-island-level3.png','coast-actor.png','coast-props.png'].map(async name=>{
  const image=new Image();image.src=`/art/${name}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const pixels=context.getImageData(0,0,image.width,image.height).data;
  return{name,width:image.width,height:image.height,clear:pixels.filter((_,index)=>index%4===3&&pixels[index]===0).length,opaque:pixels.filter((_,index)=>index%4===3&&pixels[index]===255).length,corners:[3,image.width*4-1,(image.height-1)*image.width*4+3,pixels.length-1].map(index=>pixels[index])};
 })));
 for(const asset of assets){expect(asset.width).toBe(1254);expect(asset.height).toBe(1254);expect(asset.clear).toBeGreaterThan(0);expect(asset.opaque).toBeGreaterThan(0);
  // The approved v0.7 actor has one corner at alpha 1/255. Keep its original
  // generated pixels; every new scenery stage must have exactly clear corners.
  if(asset.name==='coast-actor.png')expect(Math.max(...asset.corners)).toBeLessThanOrEqual(1);else expect(asset.corners,asset.name).toEqual([0,0,0,0]);
 }
});

test('hidden documents and an open records menu keep working',async({page})=>{
 await page.clock.install();await page.goto('/coast.html');await saved(page);await page.getByRole('button',{name:'부두에서 낚시하기'}).click();await saved(page);await page.clock.fastForward(800);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const before=await saved(page);expect(before.games.coast.elapsedMs).toBeGreaterThan(0);
 await page.clock.fastForward(600_000);expect((await saved(page)).games.coast).toMatchObject({fish:2,catches:2,activity:'fish'});await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await saved(page);
 await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await saved(page);await page.clock.fastForward(600_000);expect((await saved(page)).games.coast).toMatchObject({fish:4,catches:4,activity:'fish'});await expect(page.locator('.coast-last-report')).toContainText('낚시 소식');
});

test('15 minute work waits for its real boundary and keeps a saved quiet report',async({page})=>{
 await page.clock.install();await page.goto('/coast.html');await saved(page);await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await page.getByRole('button',{name:'정산 간격 15분',exact:true}).click();await saved(page);await page.getByRole('button',{name:'기록 닫기'}).click();await page.getByRole('button',{name:'부두에서 낚시하기'}).click();await saved(page);
 await page.clock.fastForward(600_000);expect((await saved(page)).games.coast).toMatchObject({fish:0,lastReport:null});await page.clock.fastForward(300_000);expect((await saved(page)).games.coast).toMatchObject({fish:3,activity:'fish',workInterval:15,lastReport:{amount:3,id:1,cycles:1}});
 await expect(page.getByRole('timer')).toHaveText('낚시 15:00 · 물고기 +3');await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await expect(page.getByRole('button',{name:'정산 간격 10분',exact:true})).toBeDisabled();
 await page.reload();await saved(page);await expect(page.getByRole('timer')).toHaveText('낚시 15:00 · 물고기 +3');
});
