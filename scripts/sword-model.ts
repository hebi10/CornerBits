import {
  enchantCost, initialSword, isSwordComplete, reduceSword, safeCost,
  type SwordAction, type SwordState,
} from '../src/games/sword.ts';

export type SwordStrategy = 'normal' | 'mixed' | 'safe';

export interface SwordModelOptions {
  seed?: number;
  strategy?: SwordStrategy;
  timedEvery?: number;
  actionSeconds?: number;
}

export interface SwordModel {
  state: SwordState;
  strategy: SwordStrategy;
  seed: number;
  elapsedSeconds: number;
  inputSeconds: number;
  cooldownSeconds: number;
  actions: { polish: number; enchant: number; safe: number };
  timedPolishes: number;
}

/**
 * One second per successful input by default, with material cooldowns counted
 * separately. Every fourth polish aims at the timing band. The mixed strategy
 * reserves shards for a guaranteed attempt at each new six-level appearance,
 * unless its current pity count is already at least 30. These are declared
 * choices, not observed human behavior, offline material generation or limits.
 */
export function simulateSword(options: SwordModelOptions = {}): SwordModel {
  const { seed = 0x1a2b3c4d, strategy = 'mixed', timedEvery = 4, actionSeconds = 1 } = options;
  const actionMs = actionSeconds * 1_000;
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 4_294_967_295
    || !['normal', 'mixed', 'safe'].includes(strategy) || !Number.isSafeInteger(timedEvery) || timedEvery < 0
    || !Number.isSafeInteger(actionMs) || actionMs <= 0) throw new Error('검 진행 모델의 매개변수가 올바르지 않습니다.');
  let state = { ...initialSword(), rng: seed };
  let now = 0;
  let timedPolishes = 0;
  const actions = { polish: 0, enchant: 0, safe: 0 };
  while (!isSwordComplete(state)) {
    const cost = safeCost(state.level);
    const wantsSafe = (strategy === 'safe' || strategy === 'mixed' && state.level % 6 === 0)
      && state.shards >= cost.shards && state.pity < 30;
    let action: SwordAction;
    if (wantsSafe && state.ore >= cost.ore) {
      action = { type: 'safe' };
    } else if (!wantsSafe && state.ore >= enchantCost(state.level)) {
      action = { type: 'enchant' };
    } else {
      const aim = timedEvery > 0 && state.totalPolishes % timedEvery === 0;
      now = Math.max(now, state.nextPolishAt) + (aim ? 800 : 0);
      if (aim) timedPolishes += 1;
      action = { type: 'polish' };
    }
    const next = reduceSword(state, action, now);
    if (next === state) throw new Error('검 진행 모델의 행동이 처리되지 않았습니다.');
    state = next;
    actions[action.type] += 1;
    now += actionMs;
    if (actions.polish + actions.enchant + actions.safe > 200_000) throw new Error('검 진행 모델의 행동 한도를 넘었습니다.');
  }
  const inputSeconds = (actions.polish + actions.enchant + actions.safe) * actionSeconds;
  return {
    state, strategy, seed, elapsedSeconds: now / 1_000, inputSeconds,
    cooldownSeconds: now / 1_000 - inputSeconds, actions, timedPolishes,
  };
}

export interface SwordSeedModel {
  samples: SwordModel[];
  minimumSeconds: number;
  medianSeconds: number;
  meanSeconds: number;
  maximumSeconds: number;
  tenthPercentileSeconds: number;
  ninetiethPercentileSeconds: number;
}

export function simulateSwordSeeds(count = 100, strategy: SwordStrategy = 'mixed'): SwordSeedModel {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000) throw new Error('검 진행 모델의 표본 수가 올바르지 않습니다.');
  const samples = Array.from({ length: count }, (_, index) => simulateSword({
    seed: (0x1a2b3c4d + Math.imul(index, 1_234_567)) >>> 0 || 1, strategy,
  }));
  const seconds = samples.map(sample => sample.elapsedSeconds).sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  return {
    samples, minimumSeconds: seconds[0], maximumSeconds: seconds[count - 1],
    medianSeconds: count % 2 ? seconds[middle] : (seconds[middle - 1] + seconds[middle]) / 2,
    meanSeconds: seconds.reduce((sum, value) => sum + value, 0) / count,
    tenthPercentileSeconds: seconds[Math.floor((count - 1) * 0.1)],
    ninetiethPercentileSeconds: seconds[Math.floor((count - 1) * 0.9)],
  };
}
