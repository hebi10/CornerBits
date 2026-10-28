import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const key='cornerbits.preview.state';
async function fixture(){return JSON.parse(await readFile('tests/fixtures/phase-ten.cornerbits','utf8'));}
async function seed(page:Page,state:unknown){await page.addInitScript(({key,state})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(state));},{key,state});}
async function saved(page:Page){await expect(page.locator('.coast-save-state')).toHaveText('저장 완료');return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);}
async function records(page:Page){await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await expect(page.getByRole('button',{name:'백업에서 복원'})).toBeVisible();await saved(page);}

test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date('2026-10-28T03:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-28T03:00:01Z'));
});

test('exported coastal backup restores resources, scenery, pending work and all earlier games',async({page})=>{
 const source=await fixture();await seed(page,source.state);await page.goto('/coast.html');await saved(page);await records(page);
 const before=await saved(page);expect(before.games).toEqual(source.state.games);const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'백업 내보내기'}).click();const download=await downloaded;const backupPath=await download.path();
 expect(JSON.parse(await readFile(backupPath!,'utf8')).state.games).toEqual(before.games);
 await page.getByRole('button',{name:'기록 닫기'}).click();await page.clock.fastForward(900000);expect((await saved(page)).games.coast).toMatchObject({wood:7,totalGathered:28,activity:'gather',workTimeMs:901800,workAmount:6,lastReport:{id:5,activity:'gather',amount:6,cycles:1}});
 await records(page);const modified=await saved(page);await page.locator('input[type=file]').setInputFiles(backupPath!);await expect(page.getByRole('button',{name:'이 백업으로 복원'})).toBeVisible();await page.clock.fastForward(900000);expect((await saved(page)).games).toEqual(modified.games);
 await page.getByRole('button',{name:'취소',exact:true}).click();expect((await saved(page)).games).toEqual(modified.games);
 await page.locator('input[type=file]').setInputFiles(backupPath!);await page.getByRole('button',{name:'이 백업으로 복원'}).click();expect((await saved(page)).games).toEqual(before.games);
 const snapshot=await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('cornerbits.preview.before-restore.')).map(key=>JSON.parse(localStorage.getItem(key)!)));expect(snapshot).toHaveLength(1);expect(snapshot[0].games).toEqual(modified.games);
 await page.getByRole('button',{name:'기록 닫기'}).click();await page.clock.fastForward(900000);const coast=(await saved(page)).games.coast;expect(coast).toMatchObject({wood:7,totalGathered:28,decoration:3,houseLevel:2,activity:'gather',workInterval:15,workTimeMs:901800,workAmount:6,lastReport:{id:5,activity:'gather',amount:6,cycles:1}});
 await page.reload();expect((await saved(page)).games.coast).toEqual(coast);
});

test('a reserved decoration resumes after reload without consuming materials twice',async({page})=>{
 const source=await fixture();source.state.games.coast={activity:'flower',elapsedMs:1750,catches:2,totalGathered:3,fish:0,wood:0,coins:10,decoration:0,houseLevel:1,workInterval:10,lastReport:null,workTimeMs:0,workAmount:0};await seed(page,source.state);
 await page.goto('/coast.html');await saved(page);await page.reload();await saved(page);await page.clock.fastForward(4400);
 const coast=(await saved(page)).games.coast;expect(coast).toEqual({...source.state.games.coast,activity:null,elapsedMs:0,decoration:1});await expect(page.getByRole('img',{name:'직접 놓은 꽃화분'})).toBeVisible();
 await page.clock.fastForward(4400);expect((await saved(page)).games.coast).toEqual(coast);
});

test('a failed completion freezes play and retry commits one exact reward',async({page})=>{
 await page.goto('/coast.html');await saved(page);await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();const pending=await saved(page),pendingRaw=await page.evaluate(key=>localStorage.getItem(key),key);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='cornerbits.preview.state'&&sessionStorage.getItem('fail-coast')==='yes'){sessionStorage.setItem('failed-coast-snapshot',value);throw new Error('disk full');}return original.call(this,key,value);};sessionStorage.setItem('fail-coast','yes');});
 await page.clock.fastForward(600000);await expect(page.locator('.coast-save-state')).toHaveText('저장 실패');await expect(page.getByRole('button',{name:'저장 다시 시도'})).toBeVisible();await expect(page.getByRole('button',{name:'부두에서 낚시하기'})).toBeDisabled();
 expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(pendingRaw);await page.clock.fastForward(600000);expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe(pendingRaw);
 const attempted=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('failed-coast-snapshot')!));
 await page.evaluate(()=>sessionStorage.setItem('fail-coast','no'));await page.getByRole('button',{name:'저장 다시 시도'}).click();const confirmed=await saved(page);expect(confirmed).toEqual(attempted);expect(confirmed.games.coast).toMatchObject({activity:'gather',wood:2,totalGathered:2,workTimeMs:600000,workAmount:2,lastReport:{id:1,activity:'gather',amount:2,cycles:1}});expect(confirmed.revision).toBe(pending.revision+1);
 await page.getByRole('button',{name:'작업 중단',exact:true}).click();const stopped=await saved(page);expect(stopped.games.coast).toEqual({...confirmed.games.coast,activity:null,elapsedMs:0,workTimeMs:0,workAmount:0});await page.clock.fastForward(600000);expect(await saved(page)).toEqual(stopped);await page.reload();expect((await saved(page)).games).toEqual(stopped.games);
});

test('a corrupt source stays untouched until a valid backup is explicitly restored',async({page})=>{
 await page.addInitScript(()=>{if(localStorage.getItem('cornerbits.preview.state')===null)localStorage.setItem('cornerbits.preview.state','broken coast original');});
 await page.goto('/coast.html');await expect(page.getByRole('alert')).toContainText('원본은 보존');await recordsWithoutSave();
 await page.locator('input[type=file]').setInputFiles({name:'bad.cornerbits',mimeType:'application/json',buffer:Buffer.from('{bad')});await expect(page.getByRole('alert')).toContainText('백업을 읽지 못했습니다');expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe('broken coast original');
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/phase-ten.cornerbits');await page.getByRole('button',{name:'이 백업으로 복원'}).click();expect((await saved(page)).games).toEqual((await fixture()).state.games);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('cornerbits.preview.before-restore.')).map(key=>localStorage.getItem(key)))).toEqual(['broken coast original']);
 async function recordsWithoutSave(){await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await expect(page.getByRole('button',{name:'백업에서 복원'})).toBeEnabled();}
});

for(const level of [1,2])test(`house ${level+1} changes the island and increases the next work cycle yield`,async({page})=>{
 const source=await fixture();source.state.games.coast={activity:null,elapsedMs:0,catches:0,totalGathered:level===1?12:25,fish:0,wood:level===1?12:25,coins:level===1?75:150,decoration:0,houseLevel:level,workInterval:10,lastReport:null,workTimeMs:0,workAmount:0};await seed(page,source.state);await page.goto('/coast.html');await saved(page);
 await page.getByRole('button',{name:'집 꾸미기',exact:true}).click();await page.getByRole('button',{name:'집 확장',exact:true}).click();expect((await saved(page)).games.coast).toMatchObject({houseLevel:level,wood:0,coins:0,activity:'upgrade'});
 await page.clock.fastForward(4400);expect((await saved(page)).games.coast.houseLevel).toBe(level+1);await expect(page.locator('.coast-island')).toHaveCSS('background-image',new RegExp(`coast-island-level${level+1}\\.png`));
 await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await saved(page);await page.clock.fastForward(600000);expect((await saved(page)).games.coast).toMatchObject({wood:2*(level+1),activity:'gather',workTimeMs:600000,workAmount:2*(level+1),lastReport:{id:1,activity:'gather',amount:2*(level+1),cycles:1}});
});
