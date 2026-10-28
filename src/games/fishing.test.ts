import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialFishing, parseFishing, reduceFishing, isFishingComplete, isLocationUnlocked, type FishingState } from './fishing';
import Fishing, { confirmedFishingFeedback } from './Fishing.tsx';

function cast(state = initialFishing(), now = 1_000) {
  return reduceFishing(state, { type: 'cast' }, now);
}

function catchFish(state: FishingState, now: number) {
  const waiting = cast(state, now);
  return reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt + 500);
}

describe('fishing timing and persistence', () => {
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

  it('counts one catch and reward only once at the opening boundary', () => {
    const waiting = cast();
    const caught = reduceFishing(waiting, { type: 'hook' }, waiting.cast!.biteAt);
    expect(caught.totalCaught).toBe(1);
    expect(caught.caught[waiting.cast!.species]).toBe(1);
    expect(caught.coins).toBeGreaterThan(0);
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
  });
});

describe('fishing collection and upgrades', () => {
  it('locks locations, respects selected bait, and prevents changing an active cast', () => {
    const initial = initialFishing();
    expect(reduceFishing(initial, { type: 'location', index: 1 }, 1_000)).toBe(initial);
    const bait = reduceFishing(initial, { type: 'bait', index: 2 }, 1_000);
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
      for (let location = 5; location >= 0; location -= 1) {
        if (isLocationUnlocked(state, location)) {
          state = reduceFishing(state, { type: 'location', index: location }, now);
          break;
        }
      }
      state = catchFish(state, now);
      now = state.lastObservedAt + 1_000;
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
  it('shows a catch only after a matching state transition and uses the actual coin gain', () => {
    const waiting = cast({ ...initialFishing(), coins: 999_999_999_999 });
    const action = { type: 'hook' as const };
    const caught = reduceFishing(waiting, action, waiting.cast!.biteAt);
    expect(confirmedFishingFeedback(waiting, caught, action)).toEqual({ type: 'catch', species: waiting.cast!.species, reward: 1, discovered: true });
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
    expect(html).toContain('0/1,500마리');
    expect(html).toContain('fishing-art frame-8');
  });
});
