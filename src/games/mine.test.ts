import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialMine, MINERALS, oreAt, parseMine, reduceMine, type MineState } from './mine';
import Mine from './Mine.tsx';

function emptyFloor(depth = 1): MineState {
  return { depth, pickaxe: 1, coins: 0, inventory: Array(30).fill(0), collected: Array(30).fill(0), tiles: Array(25).fill(0), totalMined: 0 };
}

function stocked(count: number, mineral = 0): MineState {
  const state = emptyFloor();
  state.inventory[mineral] = count;
  state.collected[mineral] = count;
  state.totalMined = count;
  return state;
}

describe('mine progression', () => {
  it('starts with 25 blocks requiring two hits and independent collections', () => {
    const state = initialMine();
    expect(state).toEqual({ ...emptyFloor(), tiles: Array(25).fill(2) });
    state.tiles[0] = 0;
    state.inventory[0] = 1;
    expect(initialMine().tiles[0]).toBe(2);
    expect(initialMine().inventory[0]).toBe(0);
  });

  it('keeps damage and grants one mineral only when a block breaks', () => {
    const before = { ...emptyFloor(), tiles: Array(25).fill(2) };
    const damaged = reduceMine(before, { type: 'hit', index: 0 });
    expect(damaged.tiles[0]).toBe(1);
    expect(damaged.totalMined).toBe(0);
    expect(before.tiles[0]).toBe(2);
    const mined = reduceMine(damaged, { type: 'hit', index: 0 });
    expect(mined.tiles[0]).toBe(0);
    expect(mined.inventory[0]).toBe(1);
    expect(mined.collected[0]).toBe(1);
    expect(mined.totalMined).toBe(1);
    expect(damaged.inventory[0]).toBe(0);
    expect(reduceMine(mined, { type: 'hit', index: 0 })).toBe(mined);
  });

  it.each([-1, 25, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('ignores invalid tile index %s', (index) => {
    const state = { ...emptyFloor(), tiles: Array(25).fill(2) };
    expect(reduceMine(state, { type: 'hit', index })).toBe(state);
  });

  it('requires every block to be mined before descending', () => {
    const unfinished = { ...emptyFloor(), tiles: [1, ...Array(24).fill(0)] };
    expect(reduceMine(unfinished, { type: 'descend' })).toBe(unfinished);
    const cleared = emptyFloor();
    const next = reduceMine(cleared, { type: 'descend' });
    expect(next.depth).toBe(2);
    expect(next.tiles).toEqual(Array(25).fill(2));
    expect(cleared.depth).toBe(1);
    expect(cleared.tiles).toEqual(Array(25).fill(0));
  });

  it.each([[100, 4], [900, 20], [1000, 20]])('sets correct block HP after floor %i', (depth, hp) => {
    const next = reduceMine(emptyFloor(depth), { type: 'descend' });
    expect(next.depth).toBe(depth + 1);
    expect(next.tiles).toEqual(Array(25).fill(hp));
  });

  it('uses pickaxe level as damage without negative block HP', () => {
    const state = { ...emptyFloor(201), pickaxe: 3, tiles: [2, ...Array(24).fill(0)] };
    const next = reduceMine(state, { type: 'hit', index: 0 });
    expect(next.tiles[0]).toBe(0);
    expect(next.totalMined).toBe(1);
  });

  it('caps depth and refuses loot overflow without damaging the block', () => {
    const deepest = emptyFloor(1_000_000);
    expect(reduceMine(deepest, { type: 'descend' })).toBe(deepest);
    const full = { ...stocked(1_000_000_000_000), tiles: Array(25).fill(2) };
    expect(reduceMine(full, { type: 'hit', index: 0 })).toBe(full);
    const last = { ...stocked(999_999_999_999), tiles: [1, ...Array(24).fill(0)] };
    expect(parseMine(reduceMine(last, { type: 'hit', index: 0 })).totalMined).toBe(1_000_000_000_000);
  });
});

describe('ore distribution', () => {
  it('provides 30 distinct Korean mineral names', () => {
    expect(MINERALS).toHaveLength(30);
    expect(new Set(MINERALS).size).toBe(30);
    expect(MINERALS.every((name) => /[가-힣]/.test(name))).toBe(true);
  });

  it.each([[1, 0], [34, 0], [35, 1], [69, 2], [987, 29], [1000, 29], [1_000_000, 29]])('guarantees the unlocked mineral at depth %i', (depth, mineral) => {
    expect(oreAt(depth, 12)).toBe(mineral);
    for (let index = 0; index < 25; index += 1) {
      const ore = oreAt(depth, index);
      expect(Number.isInteger(ore)).toBe(true);
      expect(ore).toBeGreaterThanOrEqual(0);
      expect(ore).toBeLessThanOrEqual(mineral);
      expect(oreAt(depth, index)).toBe(ore);
    }
  });

  it('preserves deterministic loot when reloading a damaged floor', () => {
    const state = { ...emptyFloor(987), pickaxe: 10, tiles: Array(25).fill(20) };
    const damaged = reduceMine(state, { type: 'hit', index: 12 });
    const restored = parseMine(JSON.parse(JSON.stringify(damaged)));
    expect(reduceMine(restored, { type: 'hit', index: 12 })).toEqual(reduceMine(damaged, { type: 'hit', index: 12 }));
    expect(reduceMine(restored, { type: 'hit', index: 12 }).inventory[29]).toBe(1);
  });
});

describe('mine economy', () => {
  it('sells all inventory at 3 times the one-based mineral index and keeps the collection', () => {
    const state = stocked(2);
    state.inventory[29] = 1;
    state.collected[29] = 1;
    state.totalMined = 3;
    const next = reduceMine(state, { type: 'sell' });
    expect(next.coins).toBe(96);
    expect(next.inventory).toEqual(Array(30).fill(0));
    expect(next.collected).toEqual(state.collected);
    expect(next.totalMined).toBe(3);
    expect(state.inventory[0]).toBe(2);
    expect(reduceMine(next, { type: 'sell' })).toBe(next);
  });

  it('refuses the whole sale if the coin limit would be exceeded', () => {
    const state = { ...stocked(1), coins: 999_999_999_998 };
    expect(reduceMine(state, { type: 'sell' })).toBe(state);
    const fits = { ...state, coins: 999_999_999_997 };
    expect(reduceMine(fits, { type: 'sell' }).coins).toBe(1_000_000_000_000);
  });

  it('requires both the current level depth gate and squared upgrade price', () => {
    const tooShallow = { ...emptyFloor(199), pickaxe: 2, coins: 4000 };
    expect(reduceMine(tooShallow, { type: 'upgrade' })).toBe(tooShallow);
    const tooPoor = { ...tooShallow, depth: 200, coins: 3999 };
    expect(reduceMine(tooPoor, { type: 'upgrade' })).toBe(tooPoor);
    const ready = { ...tooPoor, coins: 4000 };
    expect(reduceMine(ready, { type: 'upgrade' })).toEqual({ ...ready, pickaxe: 3, coins: 0 });
    expect(ready.pickaxe).toBe(2);
    const max = { ...ready, depth: 1000, pickaxe: 10, coins: 1_000_000 };
    expect(reduceMine(max, { type: 'upgrade' })).toBe(max);
  });
});

describe('mine save validation', () => {
  it('clones a valid state so callers cannot mutate the input arrays', () => {
    const source = stocked(2);
    const parsed = parseMine(source);
    expect(parsed).toEqual(source);
    expect(parsed).not.toBe(source);
    parsed.inventory[0] = 0;
    parsed.collected[0] = 0;
    parsed.tiles[0] = 1;
    expect(source.inventory[0]).toBe(2);
    expect(source.collected[0]).toBe(2);
    expect(source.tiles[0]).toBe(0);
  });

  it.each([
    ['null', null], ['array', []], ['missing field', { depth: 1 }],
    ['extra field', { ...emptyFloor(), extra: true }],
    ['zero depth', { ...emptyFloor(), depth: 0 }],
    ['excess depth', { ...emptyFloor(), depth: 1_000_001 }],
    ['fractional depth', { ...emptyFloor(), depth: 1.5 }],
    ['zero pickaxe', { ...emptyFloor(), pickaxe: 0 }],
    ['excess pickaxe', { ...emptyFloor(), pickaxe: 11 }],
    ['negative coins', { ...emptyFloor(), coins: -1 }],
    ['excess coins', { ...emptyFloor(), coins: 1_000_000_000_001 }],
    ['NaN coins', { ...emptyFloor(), coins: Number.NaN }],
    ['inventory length', { ...emptyFloor(), inventory: Array(29).fill(0) }],
    ['collection length', { ...emptyFloor(), collected: Array(31).fill(0) }],
    ['tile length', { ...emptyFloor(), tiles: Array(26).fill(0) }],
    ['sparse tiles', { ...emptyFloor(), tiles: Array(25) }],
    ['negative tile HP', { ...emptyFloor(), tiles: [-1, ...Array(24).fill(0)] }],
    ['excess tile HP', { ...emptyFloor(), tiles: [3, ...Array(24).fill(0)] }],
    ['fractional quantity', { ...emptyFloor(), collected: [0.5, ...Array(29).fill(0)], totalMined: 0.5 }],
    ['excess quantity', { ...emptyFloor(), collected: [1_000_000_000_001, ...Array(29).fill(0)], totalMined: 1_000_000_000_001 }],
    ['inventory exceeds collection', { ...emptyFloor(), inventory: [1, ...Array(29).fill(0)] }],
    ['incorrect total', { ...stocked(1), totalMined: 0 }],
    ['excess total', { ...emptyFloor(), collected: [1_000_000_000_000, 1, ...Array(28).fill(0)], totalMined: 1_000_000_000_001 }],
  ])('rejects %s with a Korean error', (_label, value) => {
    expect(() => parseMine(value)).toThrow(/[가-힣]/);
  });

  it.each([[100, 2], [101, 4], [900, 18], [901, 20], [1_000_000, 20]])('accepts exact HP limit at depth %i', (depth, hp) => {
    const state = { ...emptyFloor(depth), tiles: Array(25).fill(hp) };
    expect(parseMine(state)).toEqual(state);
    expect(() => parseMine({ ...state, tiles: [hp + 1, ...Array(24).fill(hp)] })).toThrow(/[가-힣]/);
  });
});

describe('long-term mine progression', () => {
  it('reaches 1000 floors, all 30 minerals and pickaxe level 10 with normal earnings', () => {
    let state = { ...emptyFloor(), tiles: Array(25).fill(2) };
    let hits = 0;
    for (let floor = 1; floor <= 1000; floor += 1) {
      state = reduceMine(state, { type: 'upgrade' });
      for (let index = 0; index < 25; index += 1) {
        while (state.tiles[index] > 0) {
          const next = reduceMine(state, { type: 'hit', index });
          expect(next).not.toBe(state);
          state = next;
          hits += 1;
        }
      }
      state = reduceMine(state, { type: 'sell' });
      expect(parseMine(state)).toEqual(state);
      if (floor < 1000) state = reduceMine(state, { type: 'descend' });
    }
    expect(state.depth).toBe(1000);
    expect(state.pickaxe).toBe(10);
    expect(state.collected.filter((count) => count > 0)).toHaveLength(30);
    expect(state.totalMined).toBe(25_000);
    // The level-2 upgrade at floor 100 makes its 25 HP-2 blocks one-hit blocks.
    expect(hits).toBe(49_975);
    expect(reduceMine(state, { type: 'descend' }).depth).toBe(1001);
  });
});

describe('mine controls', () => {
  it('labels each tile with its position, mineral and remaining HP', () => {
    const html = renderToStaticMarkup(createElement(Mine, { state: initialMine(), disabled: false, onAction: () => {} }));
    expect(html.match(/aria-label="\d+번 칸, 석영, 내구도 2\/2"/g)).toHaveLength(25);
    expect(html).toContain('다음 층');
    expect(html).toContain('판매');
    expect(html).toContain('곡괭이 강화');
  });

  it('locks every game action while the parent is loading or recovering', () => {
    const state = { ...stocked(5), depth: 100, coins: 1000, tiles: Array(25).fill(2) };
    const html = renderToStaticMarkup(createElement(Mine, { state, disabled: true, onAction: () => {} }));
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(28);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
  });
});
