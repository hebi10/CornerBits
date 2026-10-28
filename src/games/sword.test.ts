import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Sword, { confirmedSwordFeedback } from './Sword.tsx';
import {
  enchantChance, enchantCost, initialSword, parseSword, polishReward,
  reduceSword, safeCost, swordNow, type SwordState,
} from './sword';

const LIMIT = 1_000_000_000_000;
const MAX_TIME = 8_640_000_000_000_000;

function funded(level = 0): SwordState {
  return { ...initialSword(), level, successes: level, attempts: level, ore: 1_000_000, lastResult: level ? 'success' : 'none' };
}

describe('sword material and probability actions', () => {
  it('starts independently and rewards a timed polish only once per cooldown', () => {
    const state = initialSword();
    const next = reduceSword(state, { type: 'polish' }, 0);
    expect(next.ore).toBe(20);
    expect(next.totalPolishes).toBe(1);
    expect(next.nextPolishAt).toBe(10_000);
    expect(state.ore).toBe(0);
    expect(reduceSword(next, { type: 'polish' }, 9_999)).toBe(next);
    const timed = reduceSword(next, { type: 'polish' }, 10_800);
    expect(timed.ore).toBe(48);
    expect(polishReward(next, 10_800)).toBe(28);
  });

  it('keeps the saved random outcome stable after reloading and refuses free attempts', () => {
    const poor = initialSword();
    expect(reduceSword(poor, { type: 'enchant' }, 1_000)).toBe(poor);
    const state = funded(25);
    const a = reduceSword(state, { type: 'enchant' }, 1_000);
    const b = reduceSword(parseSword(JSON.parse(JSON.stringify(state))), { type: 'enchant' }, 1_000);
    expect(a).toEqual(b);
    expect(a.rng).not.toBe(state.rng);
    expect(a.attempts).toBe(state.attempts + 1);
    expect(a.ore).toBe(state.ore - enchantCost(state.level));
    expect(parseSword(a)).toEqual(a);
  });

  it('fails without losing a sword level, adds a shard and eventually guarantees success', () => {
    let state = funded(59);
    let failure: SwordState | null = null;
    for (let index = 0; index < 20 && !failure; index += 1) {
      const next = reduceSword(state, { type: 'enchant' }, index);
      if (next.lastResult === 'failure') failure = next;
      state = next;
    }
    expect(failure).not.toBeNull();
    expect(failure!.level).toBe(59);
    expect(failure!.shards).toBe(1);
    expect(failure!.pity).toBe(1);
    const protectedState = { ...funded(59), pity: 39, failures: 39, attempts: 98, shards: 39 };
    expect(enchantChance(protectedState)).toBe(100);
    const success = reduceSword(protectedState, { type: 'enchant' }, 5_000);
    expect(success.level).toBe(60);
    expect(success.pity).toBe(0);
    expect(success.lastResult).toBe('success');
    expect(success.failures).toBe(39);
  });

  it('offers a guaranteed shard choice without consuming the random sequence', () => {
    const state = { ...funded(40), shards: 100 };
    const cost = safeCost(state.level);
    const next = reduceSword(state, { type: 'safe' }, 1_000);
    expect(next.level).toBe(41);
    expect(next.lastResult).toBe('safe');
    expect(next.rng).toBe(state.rng);
    expect(next.ore).toBe(state.ore - cost.ore);
    expect(next.shards).toBe(state.shards - cost.shards);
    const poor = { ...state, ore: cost.ore - 1 };
    expect(reduceSword(poor, { type: 'safe' }, 1_000)).toBe(poor);
    expect(reduceSword({ ...state, shards: cost.shards - 1 }, { type: 'safe' }, 1_000).level).toBe(40);
  });

  it('clamps a backward clock, preserves counts at caps and stops at +60', () => {
    const state = { ...initialSword(), lastObservedAt: 20_000, nextPolishAt: 20_000 };
    expect(swordNow(state, 100)).toBe(20_000);
    expect(swordNow(state, NaN)).toBe(20_000);
    const next = reduceSword(state, { type: 'polish' }, 100);
    expect(next.lastObservedAt).toBe(20_000);
    expect(next.nextPolishAt).toBe(30_000);
    const capped = { ...initialSword(), ore: LIMIT - 1 };
    expect(reduceSword(capped, { type: 'polish' }, 0).ore).toBe(LIMIT);
    expect(reduceSword({ ...capped, ore: LIMIT }, { type: 'polish' }, 0).totalPolishes).toBe(0);
    expect(reduceSword({ ...initialSword(), totalPolishes: LIMIT }, { type: 'polish' }, 0).ore).toBe(0);
    expect(reduceSword(initialSword(), { type: 'polish' }, MAX_TIME).ore).toBe(0);
    const done = funded(60);
    for (const type of ['polish', 'enchant', 'safe'] as const) expect(reduceSword(done, { type }, 50_000)).toBe(done);
  });
});

describe('sword state validation', () => {
  it('rejects a future polish deadline beyond a real cooldown while retaining its exact boundary', () => {
    const state = initialSword();
    expect(() => parseSword({ ...state, nextPolishAt: MAX_TIME })).toThrow();
    expect(() => parseSword({ ...state, nextPolishAt: 10_001 })).toThrow();
    const polished = reduceSword(state, { type: 'polish' }, 123_000);
    expect(polished.nextPolishAt).toBe(polished.lastObservedAt + 10_000);
    expect(parseSword(polished)).toEqual(polished);
    expect(parseSword({ ...state, lastObservedAt: MAX_TIME, nextPolishAt: MAX_TIME })).toEqual({
      ...state, lastObservedAt: MAX_TIME, nextPolishAt: MAX_TIME,
    });
  });

  it('round trips every field and returns a separate object', () => {
    const state = reduceSword(funded(), { type: 'enchant' }, 1_000);
    const parsed = parseSword(state);
    expect(parsed).toEqual(state);
    expect(parsed).not.toBe(state);
  });

  it.each([
    null, [], {}, { ...initialSword(), extra: true },
    { ...initialSword(), rng: 0 }, { ...initialSword(), rng: 4_294_967_296 },
    { ...initialSword(), level: -1 }, { ...initialSword(), level: 61 },
    { ...initialSword(), ore: LIMIT + 1 }, { ...initialSword(), shards: NaN },
    { ...initialSword(), attempts: 1 }, { ...initialSword(), successes: 1 },
    { ...initialSword(), pity: 1 }, { ...initialSword(), pity: 40 },
    { ...initialSword(), totalPolishes: 0.5 }, { ...initialSword(), lastObservedAt: Infinity },
    { ...initialSword(), nextPolishAt: MAX_TIME + 1 }, { ...initialSword(), lastResult: 'broken' },
  ])('rejects missing, extra, out-of-range and inconsistent records %#', (value) => {
    expect(() => parseSword(value)).toThrow();
  });
});

describe('sword illustrated controls', () => {
  it('discloses actual chance, protection and both costs in accessible actions', () => {
    const state = { ...funded(59), pity: 39, failures: 39, attempts: 98, shards: 39 };
    const html = renderToStaticMarkup(createElement(Sword, { state, disabled: false, onAction: () => undefined }));
    expect(html).toContain(`aria-label="일반 강화, 성공 100%, 재료 ${enchantCost(59)}개"`);
    expect(html).toContain('aria-label="검 도구와 강화 기록"');
    expect(html).toContain('39회 연속 실패 뒤 다음 일반 강화는 100%');
    expect(html).toContain('안정 강화, 성공 100%');
  });

  it('animates only confirmed matching transitions and uses actual capped material rewards', () => {
    const state = { ...initialSword(), ore: LIMIT - 1 };
    const action = { type: 'polish' as const };
    const next = reduceSword(state, action, 0);
    expect(confirmedSwordFeedback(state, next, action)).toEqual({ type: 'polish', ore: 1, level: 0, shards: 0 });
    expect(confirmedSwordFeedback(state, state, action)).toBeNull();
    expect(confirmedSwordFeedback(state, next, { type: 'enchant' })).toBeNull();
  });
});
