import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function saved(page: Page) {
  await expect(page.getByRole('status').first()).toContainText('저장 완료');
  return page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!));
}

async function legacy(version: number) {
  if (version === 1) return {
    schemaVersion: 1, revision: 8, updatedAt: '2026-10-28T01:00:00Z',
    settings: { alwaysOnTop: true, compact: false },
  };
  const names: Record<number, string> = { 2: 'phase-two', 3: 'phase-three', 4: 'phase-four', 5: 'phase-five', 6: 'phase-six', 7: 'phase-seven', 8: 'phase-eight', 9: 'phase-nine' };
  return JSON.parse(await readFile(`tests/fixtures/${names[version]}.cornerbits`, 'utf8')).state;
}

async function importState(page: Page, state: unknown) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy-progress.cornerbits', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'CornerBits', backupVersion: 1, exportedAt: '2026-10-28T03:00:00Z', state,
    })),
  });
}

async function assertNewNavigation(page: Page) {
  const navigation = page.getByRole('navigation', { name: '화면 선택' });
  await expect(navigation.getByRole('button')).toHaveCount(4);
  for (const name of ['낚시', '정원', '검 키우기', '관리']) {
    await expect(navigation.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const name of ['광산', '회로']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
}

const newCoast = { activity: null, elapsedMs: 0, catches: 0, totalGathered: 0, fish: 0, wood: 0, coins: 0, decoration: 0, houseLevel: 1, workInterval: 10, lastReport: null, workTimeMs: 0, workAmount: 0 };
const workIntervalWarning = '작업 간격 이전 백업입니다. 해안 재료와 꾸밈·집·진행 시간을 보존하고, 10분 작업으로 이어집니다.';
const workCounterWarning = '작업별 집계 이전 백업입니다. 기존 진행도를 보존합니다. 낚시·채집의 작업 시간은 저장된 경과 시간부터, 획득량은 0부터 집계합니다.';

for (const version of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  test(`v${version} migration to v10 preserves its exact source once and keeps the legacy games playable`, async ({ page }) => {
    const previous = await legacy(version);
    const original = `${JSON.stringify(previous, null, 2)}\n`;
    await page.addInitScript(value => {
      if (localStorage.getItem('cornerbits.preview.state') === null) {
        localStorage.setItem('cornerbits.preview.state', value);
      }
    }, original);
    await page.goto('/');
    const migrated = await saved(page);
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.revision).toBe(previous.revision);
    expect(migrated.updatedAt).toBe(previous.updatedAt);
    expect(migrated.settings).toEqual(previous.settings);
    if (version >= 2) {
      expect(migrated.games.mine).toEqual(previous.games.mine);
      expect(migrated.games.garden).toEqual(version < 4
        ? { ...previous.games.garden, unlockedSpecies: 1 } : previous.games.garden);
    }
    if (version >= 3) expect(migrated.games.circuit).toEqual(previous.games.circuit);
    if (version >= 5) {
      expect(migrated.games.fishing).toMatchObject(previous.games.fishing);
      if (version === 5) {
        expect(migrated.games.fishing.inventory).toEqual(Array(36).fill(0));
        expect(migrated.games.fishing.baitStock).toEqual([0, 0]);
      }
      expect(migrated.games.fishing.keepsakes).toEqual(version >= 7 ? previous.games.fishing.keepsakes : previous.games.fishing.caught.flatMap((n:number,i:number)=>n>0?[i]:[]).reverse().slice(0,3));
      expect(migrated.games.sword).toEqual(previous.games.sword);
    }
    if(version<5)expect(migrated.games.fishing).toMatchObject({ totalCaught: 0, casts: 0, cast: null });
    expect(migrated.games.sword).toMatchObject({ level: 0, attempts: 0 });
    const expectedCoast = version === 9 ? { ...previous.games.coast, workTimeMs: 1800, workAmount: 0 }
      : version === 8 ? { ...previous.games.coast, workInterval: 10, lastReport: null, workTimeMs: 1800, workAmount: 0 } : newCoast;
    expect(migrated.games.coast).toEqual(expectedCoast);
    if (version >= 7) expect(migrated.games).toEqual({ ...previous.games, coast: expectedCoast });
    await assertNewNavigation(page);
    await page.reload();
    expect((await saved(page)).games).toEqual(migrated.games);
    const snapshots = await page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('cornerbits.preview.pre-migration.'))
      .map(key => localStorage.getItem(key)));
    expect(snapshots).toEqual([original]);
  });

  test(`v${version} migration snapshot failure leaves its original untouched`, async ({ page }) => {
    const original = JSON.stringify(await legacy(version));
    await page.addInitScript(value => {
      localStorage.setItem('cornerbits.preview.state', value);
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, content) {
        if (key.startsWith('cornerbits.preview.pre-migration.')) throw new Error('test snapshot unavailable');
        setItem.call(this, key, content);
      };
    }, original);
    await page.goto('/');
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('cornerbits.preview.state'))).toBe(original);
    expect(await page.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('cornerbits.preview.pre-migration.')))).toEqual([]);
  });

  test(`v${version} backup warns before restoring and keeps legacy records in its replacement state`, async ({ page }) => {
    const previous = await legacy(version);
    await page.goto('/');
    await saved(page);
    await page.getByRole('button', { name: '검 키우기', exact: true }).click();
    await page.getByRole('button', { name: /^검 연마, 재료/ }).click();
    const before = await saved(page);
    expect(before.games.sword.totalPolishes).toBe(1);
    await page.getByRole('button', { name: '관리', exact: true }).click();
    await importState(page, previous);
    await expect(page.getByText(version === 1
      ? '1단계 설정 백업입니다. 복원하면 세 게임 진행도가 처음 상태로 바뀝니다.'
      : version === 9 ? workCounterWarning : version === 8 ? workIntervalWarning : version === 7 ? '해안 생활 이전 백업입니다. 이전 게임 기록을 보존하고, 해안 생활은 처음 상태로 복원합니다.' : version === 6 ? '전시 기능 이전 백업입니다. 기존 기록을 유지하고 수집한 어종으로 전시를 구성합니다.' : version === 5 ? '판매 기능 이전 백업입니다. 기존 코인·도감은 유지하고 판매 재고·미끼 재고는0으로 시작합니다. 이미 정산된 물고기를 다시 지급하지 않습니다.' : '이전 게임 구성의 백업입니다. 정원과 광산·회로 기록은 보존하고, 낚시와 검 키우기는 처음 상태로 복원합니다.')).toBeVisible();
    await page.getByRole('button', { name: '취소', exact: true }).click();
    expect((await saved(page)).games).toEqual(before.games);
    await importState(page, previous);
    await page.getByRole('button', { name: '이 백업으로 복원', exact: true }).click();
    const restored = await saved(page);
    expect(restored.schemaVersion).toBe(10);
    const expectedCoast = version === 9 ? { ...previous.games.coast, workTimeMs: 1800, workAmount: 0 }
      : version === 8 ? { ...previous.games.coast, workInterval: 10, lastReport: null, workTimeMs: 1800, workAmount: 0 } : newCoast;
    expect(restored.games.coast).toEqual(expectedCoast);
    if (version >= 7) expect(restored.games).toEqual({ ...previous.games, coast: expectedCoast });
    expect(restored.games.sword).toMatchObject({ level: 0, ore: 0, totalPolishes: 0 });
    if(version>=5)expect(restored.games.fishing).toMatchObject(previous.games.fishing);
    else expect(restored.games.fishing).toMatchObject({ totalCaught: 0, casts: 0, cast: null });
    if (version >= 2) expect(restored.games.mine).toEqual(previous.games.mine);
    if (version >= 3) expect(restored.games.circuit).toEqual(previous.games.circuit);
    if (version >= 2) expect(restored.games.garden).toMatchObject(previous.games.garden);
    else expect(restored.games.garden).toMatchObject({ totalHarvests: 0, pots: [null, null, null] });
    await page.reload();
    expect((await saved(page)).games).toEqual(restored.games);
  });
}

test('malformed v5 fishing and sword backups cannot replace the saved progress', async ({ page }) => {
  await page.goto('/');
  const before = await saved(page);
  await page.getByRole('button', { name: '관리', exact: true }).click();
  for (const game of ['fishing', 'sword', 'sword-cooldown']) {
    const invalid = structuredClone(before);
    if (game === 'fishing') invalid.games.fishing.caught[0] = 1;
    else if (game === 'sword') invalid.games.sword.pity = 40;
    else invalid.games.sword.nextPolishAt = 8_640_000_000_000_000;
    await importState(page, invalid);
    await expect(page.getByRole('alert')).toContainText(game === 'fishing' ? '낚시' : '검 성장');
    await expect(page.getByRole('button', { name: '이 백업으로 복원', exact: true })).toHaveCount(0);
    expect((await saved(page)).games).toEqual(before.games);
  }
});

test('current v10 fixture preserves coastal progress through legacy play, backup and restore', async ({ page }) => {
  const state = JSON.parse(await readFile('tests/fixtures/phase-ten.cornerbits', 'utf8')).state;
  await page.addInitScript(value => {
    if (localStorage.getItem('cornerbits.preview.state') === null) {
      localStorage.setItem('cornerbits.preview.state', JSON.stringify(value));
    }
  }, state);
  await page.goto('/');
  const initial = await saved(page);
  expect(initial).toEqual(state);
  await assertNewNavigation(page);
  await page.getByRole('button', { name: '검 키우기', exact: true }).click();
  await page.getByRole('button', { name: /^검 연마, 재료/ }).click();
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByRole('button', { name: /^2번 화분.*심기/ }).click();
  const progressed = await saved(page);
  expect(progressed.games.mine).toEqual(state.games.mine);
  expect(progressed.games.circuit).toEqual(state.games.circuit);
  expect(progressed.games.coast).toEqual(state.games.coast);
  expect(progressed.games.sword.totalPolishes).toBe(1);
  expect(progressed.games.garden.pots[1]).not.toBeNull();
  await page.reload();
  expect((await saved(page)).games).toEqual(progressed.games);
  await page.getByRole('button', { name: '관리', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기', exact: true }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.state).toEqual(progressed);
  await importState(page, state);
  await expect(page.getByText('해안 생활 이전 백업입니다. 이전 게임 기록을 보존하고, 해안 생활은 처음 상태로 복원합니다.')).toHaveCount(0);
  await expect(page.getByText(workIntervalWarning)).toHaveCount(0);
  await expect(page.getByText(workCounterWarning)).toHaveCount(0);
  await page.getByRole('button', { name: '이 백업으로 복원', exact: true }).click();
  expect((await saved(page)).games).toEqual(state.games);
  await importState(page, exported.state);
  await page.getByRole('button', { name: '이 백업으로 복원', exact: true }).click();
  expect((await saved(page)).games).toEqual(progressed.games);
  await page.reload();
  expect((await saved(page)).games).toEqual(progressed.games);
  expect(await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('cornerbits.preview.pre-migration.')))).toEqual([]);
});
