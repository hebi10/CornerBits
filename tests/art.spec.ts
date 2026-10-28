import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function saved(page: Page) {
  await expect(page.getByRole('status').first()).toContainText('저장 완료');
  return page.evaluate(() => JSON.parse(localStorage.getItem('cornerbits.preview.state')!));
}

test('local sprite atlases load with transparency and mine damage changes the art', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  const assets = await page.evaluate(async () => Promise.all(['cute-mine-atlas.png', 'cute-garden-spaced.png', 'charms-atlas.png'].map(async (name) => {
    const image = new Image();
    image.src = `/art/${name}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let clear = 0; let opaque = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] === 0) clear++;
      if (pixels[index] === 255) opaque++;
    }
    return { width: image.width, height: image.height, clear, opaque };
  })));
  for (const asset of assets) {
    expect(asset.width).toBe(asset.height);
    expect(asset.width).toBeGreaterThanOrEqual(1_024);
    expect(asset.clear).toBeGreaterThan(0);
    expect(asset.opaque).toBeGreaterThan(0);
  }
  const tile = page.getByRole('button', { name: /^1번.*내구도/ });
  await expect(tile.locator('.mine-rock')).toHaveClass(/frame-0/);
  await expect(tile.locator('.mine-rock')).toHaveCSS('filter', 'grayscale(1)');
  await tile.click();
  await saved(page);
  await expect(tile.locator('.mine-rock')).toHaveClass(/frame-4/);
  await tile.click();
  await saved(page);
  await expect(tile.locator('.mine-rock')).toHaveClass(/frame-8/);
  await expect(tile).toBeDisabled();
  await expect(tile.locator('.mine-feedback')).toHaveCount(0, { timeout: 2_000 });
});

test('growth artwork follows time without writing saves and harvest feedback uses the actual coin gain', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T03:00:00Z') });
  await page.goto('/');
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  const pot = page.locator('.garden-pot').first();
  await expect(pot.locator('.garden-pot-art')).toHaveClass(/frame-0/);
  await pot.click();
  const planted = await saved(page);
  await expect(pot.locator('.garden-pot-art')).toHaveClass(/frame-1/);
  await page.clock.fastForward(20_000);
  await expect(pot.locator('.garden-pot-art')).toHaveClass(/frame-2/);
  await page.clock.fastForward(20_000);
  await expect(pot.locator('.garden-pot-art')).toHaveClass(/frame-3/);
  await page.clock.fastForward(20_000);
  await expect(pot.locator('.garden-pot-art')).toHaveClass(/frame-8/);
  expect((await saved(page)).revision).toBe(planted.revision);
  const state = await saved(page);
  state.games.garden.coins = 999_999_999_999;
  await page.evaluate((value) => localStorage.setItem('cornerbits.preview.state', JSON.stringify(value)), state);
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await page.getByRole('button', { name: /1번.*수확/ }).click();
  expect((await saved(page)).games.garden.coins).toBe(1_000_000_000_000);
  await expect(page.locator('.garden-feedback-harvest')).toHaveText('+1');
  await expect(pot.locator('.garden-pot-art')).toHaveClass(/frame-0/);
});

test('motion pauses while hidden and reduced motion disables decorative animations', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  const lantern = page.locator('.mine-lantern');
  await expect(lantern).toHaveCSS('animation-name', 'mine-lantern-sway');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(lantern).toHaveCSS('animation-play-state', 'paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(lantern).toHaveCSS('animation-play-state', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(lantern).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: '막대로 축소', exact: true }).click();
  await expect(lantern).toHaveCount(0);
});

test('twelve mature pots fit the widget and respect reduced motion', async ({ page }) => {
  const state = JSON.parse(await readFile('tests/fixtures/phase-two.cornerbits', 'utf8')).state;
  state.games.garden.pots = Array.from({ length: 12 }, (_, index) => ({ species: index + 20, plantedAt: 1_000, watered: true }));
  state.games.garden.harvested = Array(40).fill(5);
  state.games.garden.totalHarvests = 200;
  await page.goto('/');
  await saved(page);
  await page.evaluate((value) => localStorage.setItem('cornerbits.preview.state', JSON.stringify(value)), state);
  await page.reload();
  await saved(page);
  await page.getByRole('button', { name: '정원', exact: true }).click();
  await expect(page.locator('.garden-pot')).toHaveCount(12);
  const bounds = await page.locator('.garden-pot').evaluateAll((pots) => pots.map((pot) => {
    const { left, right, top, bottom } = pot.getBoundingClientRect();
    return { left, right, top, bottom };
  }));
  for (const box of bounds) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(280);
    expect(box.bottom).toBeLessThanOrEqual(380);
  }
  const art = page.locator('.garden-pot-art').first();
  await expect(art).toHaveCSS('animation-name', 'garden-sway');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(art).toHaveCSS('animation-name', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(280);
});

test('games expose the wallpaper while management and error messages stay readable', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await expect(page.locator('.shell')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.mine-grid')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.mine-grid')).toHaveCSS('border-top-width', '0px');
  for (const wallpaper of ['#202328', '#e5e5e5']) {
    await page.evaluate((color) => { document.documentElement.style.backgroundColor = color; }, wallpaper);
    await expect(page.getByRole('button', { name: '관리', exact: true })).toBeVisible();
    await expect(page.locator('.save-state')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await page.getByRole('button', { name: '관리', exact: true }).click();
  await expect(page.locator('.shell')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  for (const selector of ['.keepsake-caption', 'footer']) {
    await expect(page.locator(selector)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator(selector)).not.toHaveCSS('text-shadow', 'none');
  }
  const backup = page.getByRole('button', { name: '백업 내보내기' });
  await backup.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(backup).toBeFocused();
  await expect(backup).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(backup).toHaveCSS('outline-style', 'solid');
  await page.getByLabel('보관함 사용 안내', { exact: true }).click();
  await expect(page.locator('.widget-help')).toHaveCSS('background-color', 'rgba(245, 245, 243, 0.96)');
  await expect(page.getByRole('button', { name: '백업 내보내기' })).toBeEnabled();
  await page.getByRole('button', { name: '광산', exact: true }).click();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cornerbits.preview.state') throw new Error('test disk full');
      setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: /^1번.*내구도/ }).click();
  await expect(page.getByRole('alert')).toHaveCSS('background-color', 'rgb(245, 245, 243)');
  await expect(page.getByRole('button', { name: '저장 다시 시도' })).toBeVisible();
});
