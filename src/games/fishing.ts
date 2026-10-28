export interface FishingCast {
  startedAt: number;
  biteAt: number;
  expiresAt: number;
  species: number;
}

export interface FishingState {
  rng: number;
  coins: number;
  rod: number;
  location: number;
  bait: number;
  caught: number[];
  totalCaught: number;
  casts: number;
  misses: number;
  streak: number;
  bestStreak: number;
  lastObservedAt: number;
  cast: FishingCast | null;
}

export type FishingAction =
  | { type: 'cast' }
  | { type: 'hook' }
  | { type: 'upgrade' }
  | { type: 'location'; index: number }
  | { type: 'bait'; index: number };

export const FISHING_COUNT_LIMIT = 1_000_000_000_000;
export const FISHING_TIME_LIMIT = 8_640_000_000_000_000;
export const FISHING_GOAL = 1_500;
export const LOCATION_REQUIREMENTS = [0, 70, 220, 450, 800, 1_200] as const;
export const locationNames = ['조약돌 연못', '갈대 개울', '달빛 호수', '조개 해변', '안개 만', '별빛 바다'] as const;
export const BAITS = ['빵 부스러기', '풀잎 미끼', '반짝 미끼'] as const;
export const BAIT_HINTS = ['동글고 익숙한 친구를 자주 만나요', '줄무늬와 긴 꼬리 친구가 좋아해요', '드문 별빛 친구를 더 자주 만나요'] as const;
export const FISH = [
  '새싹 붕어', '동글 송사리', '줄무늬 납자루', '물방울 미꾸리', '별눈 잉어', '은빛 금붕어',
  '갈대 피라미', '돌돌 버들치', '풀잎 참마자', '긴꼬리 쉬리', '반달 연준모치', '꽃무늬 산천어',
  '달빛 빙어', '고요한 황어', '밤하늘 끄리', '초승달 쏘가리', '진주눈 은어', '작은 유리메기',
  '조개 망둑어', '모래 복어', '물결 전갱이', '점박이 쥐치', '소라 해마', '리본 나비고기',
  '안개 고등어', '구름 가오리', '동그란 문어', '달고리 오징어', '깃털 쏠배감펭', '별점 만다린',
  '별빛 청어', '혜성 날치', '우주 개복치', '꼬마 고래상어', '은하 실러캔스', '소원 달물고기',
] as const;

const UPGRADE_CATCHES = [25, 90, 220, 450, 800, 1_200, FISHING_GOAL] as const;
const UPGRADE_COINS = [150, 500, 1_500, 3_500, 7_000, 12_000, 18_000] as const;
const BAIT_WEIGHTS = [
  [42, 25, 16, 10, 5, 2],
  [22, 34, 25, 12, 5, 2],
  [25, 20, 20, 17, 12, 6],
] as const;

export function initialFishing(): FishingState {
  return { rng: 0x6d2b79f5, coins: 0, rod: 1, location: 0, bait: 0, caught: Array(36).fill(0), totalCaught: 0, casts: 0, misses: 0, streak: 0, bestStreak: 0, lastObservedAt: 0, cast: null };
}

export function fishingNow(state: FishingState, now: number): number {
  return Math.max(state.lastObservedAt, Number.isSafeInteger(now) ? Math.min(FISHING_TIME_LIMIT, Math.max(0, now)) : state.lastObservedAt);
}

export function isLocationUnlocked(state: Pick<FishingState, 'totalCaught'>, location: number): boolean {
  return Number.isInteger(location) && location >= 0 && location < locationNames.length && state.totalCaught >= LOCATION_REQUIREMENTS[location];
}

export function rodUpgradeCost(rod: number): number { return UPGRADE_COINS[rod - 1] ?? 0; }
export function rodUpgradeCatches(rod: number): number { return UPGRADE_CATCHES[rod - 1] ?? FISHING_GOAL; }
export function canUpgradeRod(state: FishingState): boolean {
  return state.cast === null && state.rod < 8 && state.totalCaught >= rodUpgradeCatches(state.rod) && state.coins >= rodUpgradeCost(state.rod);
}
export function isFishingComplete(state: FishingState): boolean {
  return state.rod === 8 && state.totalCaught >= FISHING_GOAL && state.caught.every((count) => count > 0);
}

/** Xorshift32: its state is persisted at cast time, never rolled again on hook. */
function random(rng: number): number {
  let next = rng >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function chooseSpecies(state: FishingState, roll: number): number {
  const start = state.location * 6;
  const area = state.caught.slice(start, start + 6);
  const unseen = area.indexOf(0);
  if (area.reduce((sum, count) => sum + count, 0) % 25 === 24 && unseen >= 0) return start + unseen;
  let target = roll % 100;
  for (let index = 0; index < 6; index += 1) {
    target -= BAIT_WEIGHTS[state.bait][index];
    if (target < 0) return start + index;
  }
  return start + 5;
}

export function reduceFishing(state: FishingState, action: FishingAction, now: number): FishingState {
  const observedAt = fishingNow(state, now);
  if (action.type === 'location') {
    return state.cast !== null || !isLocationUnlocked(state, action.index) || action.index === state.location ? state
      : { ...state, location: action.index, lastObservedAt: observedAt };
  }
  if (action.type === 'bait') {
    return state.cast !== null || !Number.isInteger(action.index) || action.index < 0 || action.index > 2 || action.index === state.bait ? state
      : { ...state, bait: action.index, lastObservedAt: observedAt };
  }
  if (action.type === 'upgrade') {
    return !canUpgradeRod(state) ? state
      : { ...state, rod: state.rod + 1, coins: state.coins - rodUpgradeCost(state.rod), lastObservedAt: observedAt };
  }
  if (action.type === 'cast') {
    if (state.cast !== null && observedAt < state.cast.expiresAt) return state;
    const settled = state.cast === null ? state : { ...state, cast: null, misses: state.misses + 1, streak: 0, lastObservedAt: observedAt };
    if (settled.casts >= FISHING_COUNT_LIMIT || observedAt > FISHING_TIME_LIMIT - 35_000) return settled;
    const speciesRoll = random(settled.rng);
    const rng = random(speciesRoll);
    const biteAt = observedAt + 18_000 + rng % 12_001;
    return {
      ...settled, rng, casts: settled.casts + 1, lastObservedAt: observedAt,
      cast: { startedAt: observedAt, biteAt, expiresAt: biteAt + 5_000, species: chooseSpecies(settled, speciesRoll) },
    };
  }
  if (action.type !== 'hook' || state.cast === null) return state;
  const current = state.cast;
  if (observedAt < current.biteAt || observedAt >= current.expiresAt) {
    return { ...state, cast: null, misses: state.misses + 1, streak: 0, lastObservedAt: observedAt };
  }
  if (state.totalCaught >= FISHING_COUNT_LIMIT) return state;
  const caught = [...state.caught];
  caught[current.species] += 1;
  const base = 12 + state.location * 4 + current.species % 6 * 6 + state.rod * 2;
  const delay = observedAt - current.biteAt;
  const reward = base + (delay <= 1_000 ? Math.floor(base / 2) : delay <= 3_000 ? Math.floor(base / 4) : 0);
  const streak = state.streak + 1;
  return {
    ...state, cast: null, caught, totalCaught: state.totalCaught + 1, coins: Math.min(FISHING_COUNT_LIMIT, state.coins + reward),
    streak, bestStreak: Math.max(state.bestStreak, streak), lastObservedAt: observedAt,
  };
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('낚시 기록의 항목이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}

function integer(value: unknown, max = FISHING_COUNT_LIMIT, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('낚시 기록의 수치가 올바르지 않습니다.');
  return value;
}

export function parseFishing(value: unknown): FishingState {
  const data = record(value, ['rng', 'coins', 'rod', 'location', 'bait', 'caught', 'totalCaught', 'casts', 'misses', 'streak', 'bestStreak', 'lastObservedAt', 'cast']);
  const rng = integer(data.rng, 4_294_967_295, 1);
  const coins = integer(data.coins);
  const rod = integer(data.rod, 8, 1);
  const location = integer(data.location, 5);
  const bait = integer(data.bait, 2);
  const totalCaught = integer(data.totalCaught);
  const casts = integer(data.casts);
  const misses = integer(data.misses);
  const streak = integer(data.streak);
  const bestStreak = integer(data.bestStreak);
  const lastObservedAt = integer(data.lastObservedAt, FISHING_TIME_LIMIT);
  if (!Array.isArray(data.caught) || data.caught.length !== 36) throw new Error('물고기 도감의 길이가 올바르지 않습니다.');
  const caught = Array.from(data.caught, (count) => integer(count));
  let cast: FishingCast | null = null;
  if (data.cast !== null) {
    const source = record(data.cast, ['startedAt', 'biteAt', 'expiresAt', 'species']);
    cast = {
      startedAt: integer(source.startedAt, FISHING_TIME_LIMIT), biteAt: integer(source.biteAt, FISHING_TIME_LIMIT),
      expiresAt: integer(source.expiresAt, FISHING_TIME_LIMIT), species: integer(source.species, 35),
    };
    if (cast.startedAt > cast.biteAt || cast.biteAt >= cast.expiresAt || cast.startedAt > lastObservedAt || Math.floor(cast.species / 6) !== location) throw new Error('저장된 입질 기록이 올바르지 않습니다.');
  }
  if (caught.reduce((sum, count) => sum + count, 0) !== totalCaught
    || casts !== totalCaught + misses + (cast === null ? 0 : 1) || streak > bestStreak || bestStreak > totalCaught) throw new Error('낚시 기록의 합계가 일치하지 않습니다.');
  return { rng, coins, rod, location, bait, caught, totalCaught, casts, misses, streak, bestStreak, lastObservedAt, cast };
}
