import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Garden, { confirmedGardenFeedback } from './Garden.tsx';
import {
  expansionCost, gardenNow, initialGarden, isPlantReady, isSpeciesUnlocked,
  parseGarden, PLANTS, reduceGarden, type GardenState,
} from './garden';

const MINUTE = 60_000;
const DAY = 86_400_000;
const LIMIT = 1_000_000_000_000;

function planted(species = 0, at = 1_000): GardenState {
  const state = initialGarden();
  if (species > 0) { state.unlockedSpecies = species + 1; }
  return reduceGarden(state, { type: 'plant', index: 0, species }, at);
}

describe('garden actions', () => {
  it('keeps unlocked seeds permanent and unlocks later seeds at their own harvest target', () => {
    const state = initialGarden();
    expect(state.unlockedSpecies).toBe(1);
    state.unlockedSpecies = 3;
    state.harvested[2] = 19;
    state.totalHarvests = 19;
    const growing = reduceGarden(state, { type: 'plant', index: 0, species: 2 }, 0);
    const harvested = reduceGarden(growing, { type: 'harvest', index: 0 }, 120_000);
    expect(harvested.unlockedSpecies).toBe(4);
    expect(isSpeciesUnlocked(harvested, 1)).toBe(true);
    expect(isSpeciesUnlocked(harvested, 3)).toBe(true);
    expect(isSpeciesUnlocked(harvested, 4)).toBe(false);
  });
  it('starts with free seeds and three empty pots, and leaves its inputs untouched', () => {
    const state = initialGarden();
    const next = reduceGarden(state, { type: 'plant', index: 0, species: 0 }, 1_000);
    expect(state.pots).toEqual([null, null, null]);
    expect(next.pots).toEqual([{ species: 0, plantedAt: 1_000, watered: false }, null, null]);
    expect(next.coins).toBe(0);
    expect(next.lastObservedAt).toBe(1_000);
    expect(initialGarden()).not.toBe(state);
  });

  it('returns the same reference for invalid, locked, occupied, and empty-pot actions', () => {
    const state = initialGarden();
    for (const index of [-1, 3, 0.5, NaN]) {
      expect(reduceGarden(state, { type: 'plant', index, species: 0 }, 1_000)).toBe(state);
      expect(reduceGarden(state, { type: 'water', index }, 1_000)).toBe(state);
      expect(reduceGarden(state, { type: 'harvest', index }, 1_000)).toBe(state);
    }
    for (const species of [-1, 1, 40, 0.5, NaN]) {
      expect(reduceGarden(state, { type: 'plant', index: 0, species }, 1_000)).toBe(state);
    }
    expect(reduceGarden(state, { type: 'water', index: 0 }, 1_000)).toBe(state);
    expect(reduceGarden(state, { type: 'harvest', index: 0 }, 1_000)).toBe(state);
    const growing = planted();
    expect(reduceGarden(growing, { type: 'plant', index: 0, species: 0 }, 2_000)).toBe(growing);
  });

  it('matures while offline without auto-harvesting or repeating harvests', () => {
    const growing = planted();
    expect(reduceGarden(growing, { type: 'harvest', index: 0 }, 60_999)).toBe(growing);
    const restored = parseGarden(JSON.parse(JSON.stringify(growing)));
    const next = reduceGarden(restored, { type: 'harvest', index: 0 }, 60 * DAY);
    expect(next.pots[0]).toBeNull();
    expect(next.totalHarvests).toBe(1);
    expect(next.harvested[0]).toBe(1);
    expect(next.coins).toBe(15);
    expect(reduceGarden(next, { type: 'harvest', index: 0 }, 61 * DAY)).toBe(next);
  });

  it('water removes one quarter of total growth time once', () => {
    const growing = planted();
    const watered = reduceGarden(growing, { type: 'water', index: 0 }, 11_000);
    expect(growing.pots[0]?.watered).toBe(false);
    expect(watered.pots[0]?.watered).toBe(true);
    expect(reduceGarden(watered, { type: 'water', index: 0 }, 21_000)).toBe(watered);
    expect(reduceGarden(watered, { type: 'harvest', index: 0 }, 45_999)).toBe(watered);
    expect(reduceGarden(watered, { type: 'harvest', index: 0 }, 46_000).coins).toBe(15);
  });

  it('clamps backward clocks to the last successful observation', () => {
    let state = planted();
    state = reduceGarden(state, { type: 'plant', index: 1, species: 0 }, 61_000);
    expect(gardenNow(state, 0)).toBe(61_000);
    expect(isPlantReady(state.pots[0]!, gardenNow(state, 0))).toBe(true);
    const next = reduceGarden(state, { type: 'harvest', index: 0 }, 0);
    expect(next.coins).toBe(15);
    expect(next.lastObservedAt).toBe(61_000);
    expect(next.pots[1]?.plantedAt).toBe(61_000);
  });

  it('opens the first new seed after five harvests and keeps later seeds locked', () => {
    let state = initialGarden();
    for (let i = 0; i < 5; i++) {
      state = reduceGarden(state, { type: 'plant', index: 0, species: 0 }, i * MINUTE);
      state = reduceGarden(state, { type: 'harvest', index: 0 }, (i + 1) * MINUTE);
      expect(isSpeciesUnlocked(state, 1)).toBe(i === 4);
    }
    expect(isSpeciesUnlocked(state, 2)).toBe(false);
    state = reduceGarden(state, { type: 'plant', index: 0, species: 1 }, 5 * MINUTE);
    expect(reduceGarden(state, { type: 'harvest', index: 0 }, 10 * MINUTE).coins).toBe(95);
    expect(isSpeciesUnlocked(state, 40)).toBe(false);
  });

  it.each([[1, 90_000], [2, 120_000], [3, 180_000], [7, 180_000], [8, 180_000], [19, 180_000], [20, 180_000], [39, 180_000]])(
    'species %i cannot be harvested before its full duration', (species, duration) => {
      const state = planted(species, 0);
      expect(reduceGarden(state, { type: 'harvest', index: 0 }, duration - 1)).toBe(state);
      expect(reduceGarden(state, { type: 'harvest', index: 0 }, duration).coins).toBe(15 + species * 5);
    },
  );

  it('watered middle-tier plants finish during a short play session', () => {
    const state = reduceGarden(planted(8, 0), { type: 'water', index: 0 }, 0);
    expect(reduceGarden(state, { type: 'harvest', index: 0 }, 134_999)).toBe(state);
    expect(reduceGarden(state, { type: 'harvest', index: 0 }, 135_000).coins).toBe(55);
  });

  it('expands at escalating prices up to twelve pots', () => {
    const initial = initialGarden();
    expect(expansionCost(initial)).toBe(50);
    expect(reduceGarden(initial, { type: 'expand' }, 1_000)).toBe(initial);
    let state = { ...initial, coins: 14_250 };
    const prices = [50, 200, 450, 800, 1_250, 1_800, 2_450, 3_200, 4_050];
    for (const cost of prices) {
      expect(expansionCost(state)).toBe(cost);
      state = reduceGarden(state, { type: 'expand' }, 1_000);
    }
    expect(state.pots).toHaveLength(12);
    expect(state.coins).toBe(0);
    expect(reduceGarden(state, { type: 'expand' }, 2_000)).toBe(state);
  });

  it('saturates coins and refuses harvest count overflow', () => {
    const state = { ...planted(), coins: LIMIT - 1 };
    const next = reduceGarden(state, { type: 'harvest', index: 0 }, 61_000);
    expect(next.coins).toBe(LIMIT);
    const full = planted();
    full.harvested[0] = LIMIT;
    full.totalHarvests = LIMIT;
    expect(reduceGarden(full, { type: 'harvest', index: 0 }, 61_000)).toBe(full);
  });

  it('never stores unsafe timestamps or overflows near the date limit', () => {
    const state = reduceGarden(initialGarden(), { type: 'plant', index: 0, species: 0 }, 8_640_000_000_000_000);
    expect(reduceGarden(state, { type: 'harvest', index: 0 }, Number.MAX_SAFE_INTEGER)).toBe(state);
    expect(gardenNow(state, Infinity)).toBe(8_640_000_000_000_000);
    expect(gardenNow(state, NaN)).toBe(8_640_000_000_000_000);
    expect(parseGarden(state)).toEqual(state);
  });
});

describe('garden schema', () => {
  it('round trips valid state while cloning nested data', () => {
    const state = planted();
    const parsed = parseGarden(state);
    expect(parsed).toEqual(state);
    parsed.pots[0]!.watered = true;
    parsed.harvested[0] = 10;
    expect(state.pots[0]?.watered).toBe(false);
    expect(state.harvested[0]).toBe(0);
  });

  it.each([
    null, [], {}, { ...initialGarden(), extra: 1 },
    { ...initialGarden(), coins: -1 }, { ...initialGarden(), coins: LIMIT + 1 },
    { ...initialGarden(), coins: 0.5 }, { ...initialGarden(), coins: NaN },
    { ...initialGarden(), pots: [null, null] }, { ...initialGarden(), pots: Array(13).fill(null) },
    { ...initialGarden(), pots: Array(3) }, { ...initialGarden(), harvested: Array(40) },
    { ...initialGarden(), harvested: Array(39).fill(0) },
    { ...initialGarden(), harvested: [1, ...Array(39).fill(0)] },
    { ...initialGarden(), harvested: [LIMIT, 1, ...Array(38).fill(0)], totalHarvests: LIMIT },
    { ...initialGarden(), lastObservedAt: 8_640_000_000_000_001 },
    { ...initialGarden(), unlockedSpecies: 0 }, { ...initialGarden(), unlockedSpecies: 41 },
    { ...initialGarden(), unlockedSpecies: 1.5 }, { ...initialGarden(), unlockedSpecies: undefined },
    { ...initialGarden(), pots: [{ species: 40, plantedAt: 0, watered: false }, null, null] },
    { ...initialGarden(), pots: [{ species: 0, plantedAt: 1, watered: false }, null, null] },
    { ...initialGarden(), pots: [{ species: 0, plantedAt: 0, watered: 0 }, null, null] },
    { ...initialGarden(), pots: [{ species: 0, plantedAt: 0, watered: false, extra: true }, null, null] },
  ])('rejects malformed, incomplete, and inconsistent state %#', (value) => {
    expect(() => parseGarden(value)).toThrow();
  });
});

describe('garden controls', () => {
  it('shows feedback only for a confirmed watering transition', () => {
    const before = planted();
    const action = { type: 'water' as const, index: 0 };
    const accepted = reduceGarden(before, action, 2_000);
    expect(confirmedGardenFeedback(before, accepted, action)).toEqual({ type: 'water', index: 0, reward: 0 });
    const stale = reduceGarden(before, action, 61_000);
    expect(confirmedGardenFeedback(before, stale, action)).toBeNull();
    expect(confirmedGardenFeedback(before, { ...before }, action)).toBeNull();
  });

  it('shows the actual credited amount when a harvest reaches the coin limit', () => {
    const before = { ...planted(), coins: LIMIT - 1 };
    const action = { type: 'harvest' as const, index: 0 };
    const after = reduceGarden(before, action, 61_000);
    expect(confirmedGardenFeedback(before, after, action)).toEqual({ type: 'harvest', index: 0, reward: 1 });
    expect(confirmedGardenFeedback(before, initialGarden(), action)).toBeNull();
    expect(confirmedGardenFeedback(before, before, action)).toBeNull();
    const html = renderToStaticMarkup(createElement(Garden, { state: before, disabled: false, onAction: () => undefined }));
    expect(html).toContain('title="1번 화분 새싹 수확 · +1 코인"');
  });

  it('counts harvested species separately from free seeds available for planting', () => {
    const html = renderToStaticMarkup(createElement(Garden, { state: initialGarden(), disabled: false, onAction: () => undefined }));
    expect(html.replace(/<[^>]*>/g, '')).toContain('도감 0/40');
  });

  it('uses picture-only pots while keeping the first free seed action accessible', () => {
    const html = renderToStaticMarkup(createElement(Garden, { state: initialGarden(), disabled: false, onAction: () => undefined }));
    const pots = html.match(/<button\b[^>]*class="garden-pot[^\"]*"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(pots).toHaveLength(3);
    expect(pots.every((pot) => pot.replace(/<[^>]*>/g, '').trim() === '')).toBe(true);
    expect(html).toContain('aria-label="1번 화분 새싹 심기"');
  });

  it('shows seed, sprout, leafy and mature illustrations from elapsed growth', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    try {
      const state = initialGarden();
      state.lastObservedAt = 100_000;
      state.pots = [95_000, 80_000, 50_000, 40_000].map((plantedAt) => ({ species: 0, plantedAt, watered: false }));
      const html = renderToStaticMarkup(createElement(Garden, { state, disabled: false, onAction: () => undefined }));
      const frames = [...html.matchAll(/garden-art frame-(\d+) garden-pot-art/g)].map((match) => Number(match[1]));
      expect(frames).toEqual([1, 2, 3, 8]);
      expect(html).toContain('4번 화분 새싹 수확');
      expect(html.match(/garden-water-mark/g)).toHaveLength(3);
    } finally {
      clock.mockRestore();
    }
  });
});
