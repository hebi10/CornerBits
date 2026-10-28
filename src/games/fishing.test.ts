import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  baitPackPrice, baitRareChance, fishSalePrice, fishingSaleValue, initialFishing, migrateFishing, parseFishing,
  reduceFishing, isFishingComplete, isLocationUnlocked, rodWaitReduction, rodWaitRange, rodBiteWindow, migrateFishingV6, type FishingState,
} from './fishing';
import Fishing, { confirmedFishingFeedback } from './Fishing.tsx';

function cast(state = initialFishing(), now = 1_000) {
  return reduceFishing(state, { type: 'cast' }, now);
}

function catchFish(state: FishingState, now: number) {
  const waiting = cast(state, now);
  return reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt + 500);
}

describe('fishing timing and persistence', () => {
  it('makes each equipment level reduce the next wait and extend its hook window without rerolling species', () => {
    const base = cast(initialFishing(), 1_000);
    for (let rod = 1; rod <= 8; rod += 1) {
      const upgraded = cast({ ...initialFishing(), rod }, 1_000);
      expect(rodWaitReduction(rod)).toBe((rod - 1) * 500);
      expect(rodWaitRange(rod)).toEqual([18_000 - (rod - 1) * 500, 30_000 - (rod - 1) * 500]);
      expect(rodBiteWindow(rod)).toBe(5_000 + (rod - 1) * 1_000);
      expect(upgraded.cast!.species).toBe(base.cast!.species);
      expect(upgraded.rng).toBe(base.rng);
      expect(upgraded.cast!.biteAt).toBe(base.cast!.biteAt - rodWaitReduction(rod));
      expect(upgraded.cast!.expiresAt - upgraded.cast!.biteAt).toBe(rodBiteWindow(rod));
      expect(parseFishing(upgraded)).toEqual(upgraded);
    }
    const strong = cast({ ...initialFishing(), rod: 8 }, 1_000);
    expect(reduceFishing(strong, { type: 'hook' }, strong.cast!.biteAt + 11_999).totalCaught).toBe(1);
    expect(reduceFishing(strong, { type: 'hook' }, strong.cast!.expiresAt).misses).toBe(1);
  });

  it('keeps the three most recent distinct caught fish displayed after selling and round trips them', () => {
    let state = initialFishing();
    for (const species of [0, 1, 2, 0, 3]) {
      const waiting = cast(state, state.lastObservedAt + 1_000);
      waiting.cast!.species = species;
      state = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt);
    }
    expect(state.keepsakes).toEqual([3, 0, 2]);
    const sold = reduceFishing(state, { type: 'sell' }, state.lastObservedAt);
    expect(sold.keepsakes).toEqual([3, 0, 2]);
    const parsed = parseFishing(sold);
    expect(parsed).toEqual(sold);
    expect(parsed.keepsakes).not.toBe(sold.keepsakes);
    for (const keepsakes of [[3, 3], [3, 0, 2, 1], [35], [-1], [0.5], ['0'], Array(1)]) {
      expect(() => parseFishing({ ...sold, keepsakes })).toThrow();
    }
    expect(() => parseFishing({ ...sold, keepsakes: null })).toThrow();
  });

  it('preserves every v6 field including an old active cast while rebuilding collected keepsakes', () => {
    const state = cast({ ...initialFishing(), rod: 8, caught: [1, 0, 2, 0, 1, ...Array(31).fill(0)], totalCaught: 4, casts: 4 }, 1_000);
    state.cast!.expiresAt = state.cast!.biteAt + 5_000;
    const { keepsakes: ignored, ...legacy } = state;
    void ignored;
    const migrated = migrateFishingV6(legacy);
    expect(migrated).toMatchObject(legacy);
    expect(migrated.keepsakes).toEqual([4, 2, 0]);
    expect(migrated.cast).toEqual(legacy.cast);
    expect(migrated.rng).toBe(legacy.rng);
    expect(reduceFishing(migrated, { type: 'hook' }, migrated.cast!.biteAt + 6_000).misses).toBe(1);
    expect(() => migrateFishingV6(state)).toThrow();
    expect(() => parseFishing(legacy)).toThrow();
    expect(parseFishing(migrated)).toEqual(migrated);
  });
  it('keeps a caught fish in sale inventory without immediately crediting coins', () => {
    const before = { ...initialFishing(), coins: 123 };
    const waiting = cast(before);
    const caught = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt);
    expect(caught.coins).toBe(123);
    expect(caught.inventory[waiting.cast!.species]).toBe(1);
    expect(caught.inventoryBonus).toBeGreaterThan(0);
  });
  it('stores a deterministic species and bite time before the timing action', () => {
    const before = initialFishing();
    const waiting = cast(before);
    expect(waiting.cast!.biteAt - 1_000).toBeGreaterThanOrEqual(18_000);
    expect(waiting.cast!.biteAt - 1_000).toBeLessThanOrEqual(30_000);
    expect(waiting.cast!.expiresAt - waiting.cast!.biteAt).toBe(5_000);
    expect(waiting.casts).toBe(1);
    expect(before.cast).toBeNull();
    const restored = parseFishing(JSON.parse(JSON.stringify(waiting)));
    expect(cast(restored, 2_000)).toBe(restored);
    expect(restored).toEqual(waiting);
    expect(cast(before)).toEqual(waiting);
  });

  it('counts one catch and its pending sale value only once at the opening boundary', () => {
    const waiting = cast();
    const caught = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt);
    expect(caught.totalCaught).toBe(1);
    expect(caught.caught[waiting.cast!.species]).toBe(1);
    expect(caught.coins).toBe(0);
    expect(fishingSaleValue(caught)).toBeGreaterThan(0);
    expect(caught.streak).toBe(1);
    expect(caught.bestStreak).toBe(1);
    expect(caught.cast).toBeNull();
    expect(reduceFishing(caught, { type: 'hook' }, waiting.cast!.expiresAt)).toBe(caught);
    expect(parseFishing(caught)).toEqual(caught);
  });

  it.each(['early', 'expired'] as const)('a %s hook is a free miss and does not grant a fish', (kind) => {
    const waiting = cast();
    const now = kind === 'early' ? waiting.cast!.biteAt - 1 : waiting.cast!.expiresAt;
    const missed = reduceFishing(waiting, { type: 'hook' }, now);
    expect(missed.misses).toBe(1);
    expect(missed.totalCaught).toBe(0);
    expect(missed.coins).toBe(0);
    expect(missed.cast).toBeNull();
    expect(parseFishing(missed)).toEqual(missed);
  });

  it('can replace an expired cast while accounting for its missed attempt', () => {
    const waiting = cast();
    const next = cast(waiting, waiting.cast!.expiresAt);
    expect(next.casts).toBe(2);
    expect(next.misses).toBe(1);
    expect(next.cast).not.toBeNull();
    expect(next.rng).not.toBe(waiting.rng);
    expect(parseFishing(next)).toEqual(next);
  });

  it('uses a monotonic clock and refuses casts too near the timestamp limit', () => {
    const waiting = cast(initialFishing(), 100_000);
    expect(reduceFishing(waiting, { type: 'hook' }, 0).lastObservedAt).toBe(100_000);
    const after = { ...initialFishing(), lastObservedAt: 8_640_000_000_000_000 };
    expect(cast(after, after.lastObservedAt)).toBe(after);
    const limit = 8_640_000_000_000_000;
    const lastPossible = limit - rodWaitRange(8)[1] - rodBiteWindow(8);
    const strong = { ...initialFishing(), rod: 8 };
    const atBoundary = cast(strong, lastPossible);
    expect(atBoundary.cast).not.toBeNull();
    expect(atBoundary.cast!.expiresAt).toBeLessThanOrEqual(limit);
    expect(cast(strong, lastPossible + 1)).toBe(strong);
  });
});

describe('fishing collection and upgrades', () => {
  it('locks locations, respects selected bait, and prevents changing an active cast', () => {
    const initial = initialFishing();
    expect(reduceFishing(initial, { type: 'location', index: 1 }, 1_000)).toBe(initial);
    const bait = reduceFishing({ ...initial, coins: 150 }, { type: 'buy-bait', index: 2 }, 1_000);
    expect(bait.bait).toBe(2);
    const waiting = cast(bait);
    expect(reduceFishing(waiting, { type: 'bait', index: 1 }, 2_000)).toBe(waiting);
    expect(reduceFishing(waiting, { type: 'location', index: 0 }, 2_000)).toBe(waiting);
  });

  it('guarantees an undiscovered fish on each twenty-fifth catch in an area', () => {
    const initial = initialFishing();
    initial.caught[0] = 24;
    initial.totalCaught = 24;
    initial.casts = 24;
    const waiting = cast(initial);
    expect(waiting.cast!.species).toBe(1);
    const caught = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt + 1_000);
    expect(caught.caught[1]).toBe(1);
    expect(parseFishing(caught)).toEqual(caught);
  });

  it('reaches the rod, six locations and full collection through ordinary rewards', () => {
    let state = initialFishing();
    let now = 0;
    for (let fish = 0; fish < 1_500; fish += 1) {
      const location = [0, 1, 2, 3, 4, 5].find((area) => isLocationUnlocked(state, area)
        && state.caught.slice(area * 6, area * 6 + 6).some((count) => count === 0));
      if (location !== undefined) state = reduceFishing(state, { type: 'location', index: location }, now);
      state = catchFish(state, now);
      now = state.lastObservedAt + 1_000;
      state = reduceFishing(state, { type: 'sell' }, now);
      state = reduceFishing(state, { type: 'upgrade' }, now);
    }
    expect(state.totalCaught).toBe(1_500);
    expect(state.rod).toBe(8);
    expect(state.caught.filter((count) => count > 0)).toHaveLength(36);
    expect(isFishingComplete(state)).toBe(true);
    expect(parseFishing(state)).toEqual(state);
  });
});

describe('fishing state validation', () => {
  it('clones nested data and rejects unknown or inconsistent state', () => {
    const state = cast();
    const parsed = parseFishing(state);
    expect(parsed).toEqual(state);
    expect(parsed.caught).not.toBe(state.caught);
    expect(parsed.cast).not.toBe(state.cast);
    for (const value of [
      { ...state, extra: 1 }, { ...state, rng: 0 }, { ...state, rng: 4_294_967_296 },
      { ...state, rod: 9 }, { ...state, caught: Array(35).fill(0) },
      { ...state, totalCaught: 1 }, { ...state, casts: 0 }, { ...state, streak: 1 },
      { ...state, cast: { ...state.cast!, species: 6 } },
      { ...state, cast: { ...state.cast!, expiresAt: state.cast!.biteAt } },
      { ...state, cast: { ...state.cast!, startedAt: 2_000 } },
    ]) expect(() => parseFishing(value)).toThrow();
  });

  it('does not change state for malformed choices, active upgrades, or exhausted cast counts', () => {
    const state = initialFishing();
    for (const index of [-1, 6, 0.5, NaN]) expect(reduceFishing(state, { type: 'location', index }, 5_000)).toBe(state);
    for (const index of [-1, 3, 0.5, NaN]) expect(reduceFishing(state, { type: 'bait', index }, 5_000)).toBe(state);
    expect(reduceFishing(state, { type: 'upgrade' }, 5_000)).toBe(state);
    const waiting = cast({ ...state, coins: 1_000, totalCaught: 25, casts: 25, caught: [25, ...Array(35).fill(0)] });
    expect(reduceFishing(waiting, { type: 'upgrade' }, 5_000)).toBe(waiting);
    const full = { ...state, casts: 1_000_000_000_000, misses: 1_000_000_000_000 };
    expect(cast(full)).toBe(full);
    expect(parseFishing(full)).toEqual(full);
  });
});

describe('fishing picture controls and confirmed feedback', () => {
  it('shows a catch only after a matching state transition and reports its held sale value', () => {
    const waiting = cast({ ...initialFishing(), coins: 999_999_999_999 });
    const action = { type: 'hook' as const };
    const caught = reduceFishing(waiting, action, waiting.cast!.biteAt);
    expect(confirmedFishingFeedback(waiting, caught, action)).toEqual({ type: 'catch', species: waiting.cast!.species, reward: fishingSaleValue(caught) - fishingSaleValue(waiting), discovered: true });
    expect(confirmedFishingFeedback(waiting, waiting, action)).toBeNull();
    expect(confirmedFishingFeedback(waiting, { ...waiting }, action)).toBeNull();
    const missed = reduceFishing(waiting, action, waiting.cast!.expiresAt);
    expect(confirmedFishingFeedback(waiting, missed, action)?.type).toBe('miss');
  });

  it('keeps picture actions labeled and initially locked locations disabled', () => {
    const html = renderToStaticMarkup(createElement(Fishing, { state: initialFishing(), disabled: false, onAction: () => undefined }));
    expect(html).toContain('aria-label="낚싯대 던지기"');
    expect(html).toContain('aria-label="낚시 도구와 도감"');
    expect(html).toContain('aria-label="미끼 고르기"');
    expect(html).toContain('aria-label="낚시터 고르기"');
    expect(html).toMatch(/<option value="5" disabled="">/);
    expect(html).toContain('다음 갈대 개울 · 0/70마리 · 이전 지역 0/4종');
    expect(html).toMatch(/aria-label="물고기 일괄 판매 0 코인" disabled=""/);
    expect(html).toMatch(/aria-label="반짝 미끼 5개 구매 150 코인"[^>]*disabled=""/);
    expect(html).toContain('fishing-angler-scene');
  });
});

describe('fishing sales and consumable bait', () => {
  it('sells the held fish and quality premium exactly once without erasing the collection', () => {
    const held = catchFish({ ...initialFishing(), coins: 123 }, 0);
    const value = fishingSaleValue(held);
    const sold = reduceFishing(held, { type: 'sell' }, held.lastObservedAt);
    expect(sold.coins).toBe(123 + value);
    expect(sold.inventory).toEqual(Array(36).fill(0));
    expect(sold.inventoryBonus).toBe(0);
    expect(sold.caught).toEqual(held.caught);
    expect(sold.totalCaught).toBe(held.totalCaught);
    expect(held.inventory.some((count) => count > 0)).toBe(true);
    expect(reduceFishing(sold, { type: 'sell' }, held.lastObservedAt)).toBe(sold);
    expect(parseFishing(sold)).toEqual(sold);
  });

  it('buys an atomic pack and spends one premium bait on a cast, including misses', () => {
    const empty = initialFishing();
    expect(reduceFishing(empty, { type: 'buy-bait', index: 1 }, 0)).toBe(empty);
    expect(reduceFishing(empty, { type: 'bait', index: 2 }, 0)).toBe(empty);
    const bought = reduceFishing({ ...empty, coins: 500 }, { type: 'buy-bait', index: 2 }, 0);
    expect(bought.coins).toBe(500 - baitPackPrice(2));
    expect(bought.baitStock).toEqual([0, 5]);
    expect(bought.bait).toBe(2);
    expect(empty.baitStock).toEqual([0, 0]);
    const waiting = cast(bought);
    expect(waiting.baitStock).toEqual([0, 4]);
    expect(reduceFishing(waiting, { type: 'buy-bait', index: 1 }, 2_000)).toBe(waiting);
    const missed = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.expiresAt);
    expect(missed.baitStock).toEqual([0, 4]);
    expect(missed.coins).toBe(bought.coins);
    expect(parseFishing(missed)).toEqual(missed);
  });

  it('does not create a paid cast without stock and still settles an expired last bait', () => {
    const dry = { ...initialFishing(), bait: 2 };
    expect(cast(dry)).toBe(dry);
    const waiting = cast({ ...dry, baitStock: [0, 1] });
    expect(waiting.baitStock).toEqual([0, 0]);
    const settled = cast(waiting, waiting.cast!.expiresAt);
    expect(settled.cast).toBeNull();
    expect(settled.misses).toBe(1);
    expect(settled.casts).toBe(1);
    expect(settled.rng).toBe(waiting.rng);
    expect(parseFishing(settled)).toEqual(settled);
    expect(reduceFishing(settled, { type: 'bait', index: 0 }, settled.lastObservedAt).bait).toBe(0);
  });

  it('can sell previously held fish during another cast without changing its saved outcome', () => {
    const held = catchFish(initialFishing(), 0);
    const waiting = cast(held, held.lastObservedAt + 1_000);
    const sold = reduceFishing(waiting, { type: 'sell' }, waiting.lastObservedAt + 500);
    expect(sold.cast).toEqual(waiting.cast);
    expect(sold.rng).toBe(waiting.rng);
    expect(sold.casts).toBe(waiting.casts);
    expect(sold.coins).toBe(fishingSaleValue(waiting));
    const caught = reduceFishing(sold, { type: 'hook' }, sold.cast!.biteAt);
    expect(caught.totalCaught).toBe(2);
    expect(caught.inventory.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(parseFishing(caught)).toEqual(caught);
  });

  it('refuses sale and pack overflows without consuming the held items or coins', () => {
    const held = catchFish(initialFishing(), 0);
    const full = { ...held, coins: 1_000_000_000_000 };
    expect(reduceFishing(full, { type: 'sell' }, held.lastObservedAt)).toBe(full);
    const stockFull = { ...initialFishing(), coins: 500, baitStock: [999_999_999_996, 0] };
    expect(reduceFishing(stockFull, { type: 'buy-bait', index: 1 }, 0)).toBe(stockFull);
    const fits = reduceFishing({ ...stockFull, baitStock: [999_999_999_995, 0] }, { type: 'buy-bait', index: 1 }, 0);
    expect(fits.baitStock[0]).toBe(1_000_000_000_000);
    for (const index of [0, 3, -1, 0.5, NaN]) expect(reduceFishing(stockFull, { type: 'buy-bait', index }, 0)).toBe(stockFull);
  });

  it('makes better bait favor rare species across a fixed set of random seeds', () => {
    const rare = [0, 0, 0];
    for (let seed = 1; seed <= 500; seed += 1) {
      for (let bait = 0; bait < 3; bait += 1) {
        const waiting = cast({ ...initialFishing(), rng: seed, bait, baitStock: [1, 1] }, 0);
        if (waiting.cast!.species % 6 >= 4) rare[bait] += 1;
      }
    }
    expect(rare[1]).toBeGreaterThan(rare[0]);
    expect(rare[2]).toBeGreaterThan(rare[1]);
    expect(rare[2]).toBeGreaterThan(rare[0] * 2);
    expect([0, 1, 2].map(baitRareChance)).toEqual([7, 12, 27]);
    expect(baitRareChance(3)).toBe(0);
    for (let bait = 0; bait < 3; bait += 1) expect(Math.abs(rare[bait] / 500 * 100 - baitRareChance(bait))).toBeLessThan(3);
  });
});

describe('permanent fishing regions and v5 preservation', () => {
  it('requires the catch threshold and four previous-region species, then keeps the region open', () => {
    const locked = initialFishing();
    locked.caught[0] = 68; locked.caught[1] = 1; locked.caught[2] = 1;
    locked.totalCaught = 70; locked.casts = 70;
    expect(isLocationUnlocked(locked, 1)).toBe(false);
    const waiting = cast(locked, 0);
    waiting.cast!.species = 3;
    const unlocked = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt);
    expect(unlocked.unlockedLocations).toBe(2);
    const visited = reduceFishing(unlocked, { type: 'location', index: 1 }, unlocked.lastObservedAt);
    const returned = reduceFishing(visited, { type: 'location', index: 0 }, visited.lastObservedAt);
    expect(isLocationUnlocked(returned, 1)).toBe(true);
    expect(parseFishing(returned)).toEqual(returned);
    expect(locked.unlockedLocations).toBe(1);
  });

  it('never makes old auto-paid catches sellable and retains previously opened regions', () => {
    const state = initialFishing();
    state.caught[0] = 220; state.totalCaught = 220; state.casts = 220;
    state.coins = 987; state.location = 1; state.bait = 2;
    const legacy = Object.fromEntries(Object.entries(state).filter(([key]) => !['inventory', 'inventoryBonus', 'baitStock', 'unlockedLocations', 'keepsakes'].includes(key)));
    const migrated = migrateFishing(legacy);
    expect(migrated.coins).toBe(987);
    expect(migrated.caught).toEqual(state.caught);
    expect(migrated.location).toBe(1);
    expect(migrated.bait).toBe(2);
    expect(migrated.unlockedLocations).toBe(3);
    expect(fishingSaleValue(migrated)).toBe(0);
    expect(reduceFishing(migrated, { type: 'sell' }, 0)).toBe(migrated);
    expect(parseFishing(migrated)).toEqual(migrated);
    expect(migrateFishing({ ...legacy, location: 5 }).unlockedLocations).toBe(6);
    expect(() => migrateFishing(state)).toThrow();
  });

  it('migrates an active old premium cast without charging or rerolling it', () => {
    const waiting = cast({ ...initialFishing(), bait: 2, baitStock: [0, 1], coins: 456 }, 5_000);
    const legacy = Object.fromEntries(Object.entries(waiting).filter(([key]) => !['inventory', 'inventoryBonus', 'baitStock', 'unlockedLocations', 'keepsakes'].includes(key)));
    const migrated = migrateFishing(legacy);
    expect(migrated.cast).toEqual(waiting.cast);
    expect(migrated.rng).toBe(waiting.rng);
    expect(migrated.coins).toBe(456);
    expect(migrated.baitStock).toEqual([0, 0]);
    const landed = reduceFishing(migrated, { type: 'hook' }, migrated.cast!.biteAt);
    expect(landed.coins).toBe(456);
    expect(landed.totalCaught).toBe(1);
    expect(fishingSaleValue(landed)).toBeGreaterThan(0);
    expect(parseFishing(landed)).toEqual(landed);
  });

  it('validates inventory ownership, pending premiums, stock and permanent regions', () => {
    const held = catchFish(initialFishing(), 0);
    const price = fishSalePrice(held.cast?.species ?? held.caught.findIndex((count) => count > 0));
    expect(fishingSaleValue(held)).toBe(price + Math.floor(price / 2));
    const invalid = [
      { ...held, inventory: Array(35).fill(0) },
      { ...held, inventory: Array(36).fill(2) },
      { ...held, inventoryBonus: 1_000 },
      { ...held, inventoryBonus: -1 },
      { ...held, baitStock: [0] }, { ...held, baitStock: [0, -1] },
      { ...held, baitStock: [0, 1_000_000_000_001] },
      { ...held, unlockedLocations: 0 }, { ...held, unlockedLocations: 7 },
      { ...held, location: 1 },
    ];
    for (const value of invalid) expect(() => parseFishing(value)).toThrow();
  });
});
