import {expect,test,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

const backup=readFileSync('tests/fixtures/phase-nine.cornerbits');
async function saved(page:Page){
 await expect(page.locator('.coast-save-state')).toHaveText('저장 완료');
 return page.evaluate(()=>JSON.parse(localStorage.getItem('cornerbits.preview.state')!));
}
async function delayedRead(page:Page){
 await page.addInitScript(()=>{
  const original=File.prototype.text;
  const pending:Array<()=>Promise<void>>=[];
  Object.assign(window,{releaseBackupRead:async(index=0)=>{await pending.splice(index,1)[0]?.();}});
  File.prototype.text=function(){
   const file=this;
   return new Promise<string>(resolve=>pending.push(async()=>resolve(await original.call(file))));
  };
 });
 await page.clock.install();await page.goto('/coast.html');await saved(page);
 await page.getByRole('button',{name:'해변에서 나무 줍기'}).click();await saved(page);
 await page.getByRole('button',{name:'기록과 백업',exact:true}).click();await saved(page);
 await page.locator('input[type=file]').setInputFiles({name:'phase-nine.cornerbits',mimeType:'application/json',buffer:backup});
}
async function releaseRead(page:Page,index=0){
 await page.evaluate(async index=>{await (window as unknown as {releaseBackupRead:(index:number)=>Promise<void>}).releaseBackupRead(index);},index);
 await page.clock.runFor(1);
}

test('closing records discards a late file preview and keeps work running',async({page})=>{
 await delayedRead(page);
 await page.getByRole('button',{name:'기록 닫기',exact:true}).click();await releaseRead(page);
 await page.clock.fastForward(120_000);
 expect((await saved(page)).games.coast.elapsedMs).toBeGreaterThan(60_000);
 await page.getByRole('button',{name:'기록과 백업',exact:true}).click();
 await expect(page.getByText('이 백업으로 복원',{exact:true})).toHaveCount(0);
});

test('folding discards a late file preview and continues work in the compact bar',async({page})=>{
 await delayedRead(page);
 await page.getByRole('button',{name:'막대로 축소',exact:true}).click();await saved(page);await releaseRead(page);
 await page.clock.fastForward(120_000);
 expect((await saved(page)).games.coast.elapsedMs).toBeGreaterThan(60_000);
 await page.getByRole('button',{name:'펼치기',exact:true}).click();
 await expect(page.getByText('이 백업으로 복원',{exact:true})).toHaveCount(0);
});

test('the newest selected backup wins when earlier file reads finish later',async({page})=>{
 await delayedRead(page);
 const newer=JSON.parse(backup.toString('utf8'));newer.state.games.coast.coins=123;
 await page.locator('input[type=file]').setInputFiles({name:'newer.cornerbits',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(newer))});
 await releaseRead(page,1);
 await expect(page.getByText(/코인 123/)).toBeVisible();
 await releaseRead(page);
 await expect(page.getByText(/코인 123/)).toBeVisible();
});
