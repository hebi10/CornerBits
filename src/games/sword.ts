export interface SwordState {
  rng: number;
  level: number;
  ore: number;
  shards: number;
  attempts: number;
  successes: number;
  failures: number;
  pity: number;
  totalPolishes: number;
  lastObservedAt: number;
  nextPolishAt: number;
  lastResult: 'none' | 'success' | 'failure' | 'safe';
}

export type SwordAction = { type: 'polish' } | { type: 'enchant' } | { type: 'safe' };

export const SWORD_MAX_LEVEL = 60;
export const SWORD_COUNT_LIMIT = 1_000_000_000_000;
export const SWORD_MAX_TIMESTAMP = 8_640_000_000_000_000;
export const POLISH_COOLDOWN = 10_000;
export const SWORD_FORMS = ['목검', '철검', '강철검', '톱날검', '수정검', '날개검', '월광검', '왕관검', '영웅검', '성운검'] as const;

export function initialSword(): SwordState {
  return {
    rng: 0x1a2b3c4d, level: 0, ore: 0, shards: 0,
    attempts: 0, successes: 0, failures: 0, pity: 0, totalPolishes: 0,
    lastObservedAt: 0, nextPolishAt: 0, lastResult: 'none',
  };
}

export function swordNow(state: SwordState, now: number): number {
  const safeNow = Number.isSafeInteger(now) ? Math.min(SWORD_MAX_TIMESTAMP, Math.max(0, now)) : state.lastObservedAt;
  return Math.max(state.lastObservedAt, safeNow);
}

export function swordForm(level: number): number {
  return Math.min(9, Math.floor(level / 6));
}

/** The functional gauge repeats every two seconds once the stone is ready. */
export function polishPhase(state: SwordState, now: number): number {
  return Math.max(0, swordNow(state, now) - state.nextPolishAt) % 2_000 / 2_000;
}

export function polishReward(state: SwordState, now: number): number {
  const phase = polishPhase(state, now);
  return phase >= 0.3 && phase <= 0.5 ? 28 : 20;
}

export function enchantCost(level: number): number {
  return 40 + 3 * level;
}

export function safeCost(level: number): { ore: number; shards: number } {
  return { ore: enchantCost(level) * 3, shards: 10 + 3 * Math.floor(level / 10) };
}

/** Percent shown in the UI and used by the reducer, including the guarantee. */
export function enchantChance(state: Pick<SwordState, 'level' | 'pity'>): number {
  if (state.level >= SWORD_MAX_LEVEL) return 0;
  if (state.pity === 39) return 100;
  return [80, 40, 20, 10, 5, 2][Math.floor(state.level / 10)];
}

export function isSwordComplete(state: Pick<SwordState, 'level'>): boolean {
  return state.level >= SWORD_MAX_LEVEL;
}

function advanceRandom(value: number): number {
  let next = value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

export function reduceSword(state: SwordState, action: SwordAction, now: number): SwordState {
  if (isSwordComplete(state)) return state;
  const observedAt = swordNow(state, now);
  if (action.type === 'polish') {
    if (observedAt < state.nextPolishAt || observedAt > SWORD_MAX_TIMESTAMP - POLISH_COOLDOWN
      || state.totalPolishes >= SWORD_COUNT_LIMIT || state.ore >= SWORD_COUNT_LIMIT) return state;
    return {
      ...state,
      ore: Math.min(SWORD_COUNT_LIMIT, state.ore + polishReward(state, observedAt)),
      totalPolishes: state.totalPolishes + 1,
      lastObservedAt: observedAt,
      nextPolishAt: observedAt + POLISH_COOLDOWN,
    };
  }
  if (state.attempts >= SWORD_COUNT_LIMIT) return state;
  if (action.type === 'safe') {
    const cost = safeCost(state.level);
    if (state.ore < cost.ore || state.shards < cost.shards) return state;
    return {
      ...state, level: state.level + 1, ore: state.ore - cost.ore, shards: state.shards - cost.shards,
      attempts: state.attempts + 1, successes: state.successes + 1, pity: 0,
      lastObservedAt: observedAt, lastResult: 'safe',
    };
  }
  if (action.type !== 'enchant') return state;
  const cost = enchantCost(state.level);
  if (state.ore < cost) return state;
  const rng = advanceRandom(state.rng);
  const success = rng % 10_000 < enchantChance(state) * 100;
  return {
    ...state, rng, ore: state.ore - cost, attempts: state.attempts + 1,
    level: state.level + (success ? 1 : 0), successes: state.successes + (success ? 1 : 0),
    failures: state.failures + (success ? 0 : 1),
    shards: success ? state.shards : Math.min(SWORD_COUNT_LIMIT, state.shards + 1),
    pity: success ? 0 : state.pity + 1,
    lastObservedAt: observedAt, lastResult: success ? 'success' : 'failure',
  };
}

function integer(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

export function parseSword(value: unknown): SwordState {
  const keys = ['rng', 'level', 'ore', 'shards', 'attempts', 'successes', 'failures', 'pity', 'totalPolishes', 'lastObservedAt', 'nextPolishAt', 'lastResult'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('검 성장 기록의 필드가 올바르지 않습니다.');
  }
  const data = value as Record<string, unknown>;
  if (!integer(data.rng, 4_294_967_295) || data.rng < 1 || !integer(data.level, SWORD_MAX_LEVEL)
    || !integer(data.ore, SWORD_COUNT_LIMIT) || !integer(data.shards, SWORD_COUNT_LIMIT)
    || !integer(data.attempts, SWORD_COUNT_LIMIT) || !integer(data.successes, SWORD_COUNT_LIMIT)
    || !integer(data.failures, SWORD_COUNT_LIMIT) || !integer(data.pity, 39)
    || !integer(data.totalPolishes, SWORD_COUNT_LIMIT) || !integer(data.lastObservedAt, SWORD_MAX_TIMESTAMP)
    || !integer(data.nextPolishAt, SWORD_MAX_TIMESTAMP) || data.nextPolishAt > data.lastObservedAt + POLISH_COOLDOWN
    || !['none', 'success', 'failure', 'safe'].includes(data.lastResult as string)
    || data.attempts !== data.successes + data.failures || data.successes !== data.level || data.pity > data.failures) {
    throw new Error('검 성장 기록의 수치 또는 합계가 올바르지 않습니다.');
  }
  return {
    rng: data.rng, level: data.level, ore: data.ore, shards: data.shards,
    attempts: data.attempts, successes: data.successes, failures: data.failures, pity: data.pity,
    totalPolishes: data.totalPolishes, lastObservedAt: data.lastObservedAt, nextPolishAt: data.nextPolishAt,
    lastResult: data.lastResult as SwordState['lastResult'],
  };
}
