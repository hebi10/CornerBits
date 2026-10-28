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
  inventory: number[];
  inventoryBonus: number;
  baitStock: number[];
  unlockedLocations: number;
}

export type FishingAction =
  | { type: 'cast' }
  | { type: 'hook' }
  | { type: 'upgrade' }
  | { type: 'sell' }
  | { type: 'buy-bait'; index: number }
  | { type: 'location'; index: number }
  | { type: 'bait'; index: number };

export const FISHING_COUNT_LIMIT = 1_000_000_000_000;
export const FISHING_TIME_LIMIT = 8_640_000_000_000_000;
export const FISHING_GOAL = 1_500;
export const LOCATION_REQUIREMENTS = [0, 70, 220, 450, 800, 1_200] as const;
export const locationNames = ['조약돌 연못', '갈대 개울', '달빛 호수', '조개 해변', '안개 만', '별빛 바다'] as const;
export const BAITS = ['빵 부스러기', '풀잎 미끼', '반짝 미끼'] as const;
export const BAIT_HINTS = ['무료 기본 미끼', '희귀 어종 비중을 조금 높인 소모 미끼', '희귀 어종 비중을 더 높인 소모 미끼'] as const;
export const BAIT_PACK_SIZE = 5;
export const BAIT_PACK_PRICES = [0, 50, 150] as const;
export const FISH = [
  '새싹 붕어', '동글 송사리', '줄무늬 납자루', '물방울 미꾸리', '별눈 잉어', '은빛 금붕어',
  '갈대 피라미', '돌돌 버들치', '풀잎 참마자', '긴꼬리 쉬리', '반달 연준모치', '꽃무늬 산천어',
  '달빛 빙어', '고요한 황어', '밤하늘 끄리', '초승달 쏘가리', '진주눈 은어', '작은 유리메기',
  '조개 망둑어', '모래 복어', '물결 전갱이', '점박이 쥐치', '소라 해마', '리본 나비고기',
  '안개 고등어', '구름 가오리', '회색 문어', '달고리 오징어', '깃털 쏠배감펭', '별점 만다린',
  '별빛 청어', '혜성 날치', '우주 개복치', '고래상어', '은하 실러캔스', '소원 달물고기',
] as const;

const UPGRADE_CATCHES = [25, 90, 220, 450, 800, 1_200, FISHING_GOAL] as const;
const UPGRADE_COINS = [150, 500, 1_500, 3_500, 7_000, 12_000, 18_000] as const;
const BAIT_WEIGHTS = [
  [42, 25, 16, 10, 5, 2],
  [30, 25, 20, 13, 8, 4],
  [12, 18, 23, 20, 17, 10],
] as const;

export function baitRareChance(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= BAIT_WEIGHTS.length) return 0;
  return BAIT_WEIGHTS[index][4] + BAIT_WEIGHTS[index][5];
}

export function initialFishing(): FishingState {
  return { rng: 0x6d2b79f5, coins: 0, rod: 1, location: 0, bait: 0, caught: Array(36).fill(0), totalCaught: 0, casts: 0, misses: 0, streak: 0, bestStreak: 0, lastObservedAt: 0, cast: null, inventory: Array(36).fill(0), inventoryBonus: 0, baitStock: [0, 0], unlockedLocations: 1 };
}

export function fishingNow(state: FishingState, now: number): number {
  return Math.max(state.lastObservedAt, Number.isSafeInteger(now) ? Math.min(FISHING_TIME_LIMIT, Math.max(0, now)) : state.lastObservedAt);
}

export function isLocationUnlocked(state: Pick<FishingState, 'unlockedLocations'>, location: number): boolean {
  return Number.isInteger(location) && location >= 0 && location < locationNames.length && location < state.unlockedLocations;
}

export function locationSpeciesCount(state: Pick<FishingState, 'caught'>, location: number): number {
  return state.caught.slice(location * 6, location * 6 + 6).filter((count) => count > 0).length;
}

export function fishSalePrice(species: number): number {
  return Number.isInteger(species) && species >= 0 && species < 36 ? 12 + Math.floor(species / 6) * 8 + species % 6 * 12 : 0;
}

export function fishingSaleValue(state: Pick<FishingState, 'inventory' | 'inventoryBonus'>): number {
  return state.inventory.reduce((sum, count, species) => sum + count * fishSalePrice(species), state.inventoryBonus);
}

export function hasBait(state: Pick<FishingState, 'bait' | 'baitStock'>): boolean {
  return state.bait === 0 || state.baitStock[state.bait - 1] > 0;
}

export function baitPackPrice(index: number): number {
  return BAIT_PACK_PRICES[index as 0 | 1 | 2] ?? 0;
}

export function canBuyBait(state: FishingState, index: number): boolean {
  return Number.isInteger(index) && index >= 1 && index <= 2 && state.cast === null
    && state.coins >= baitPackPrice(index) && state.baitStock[index - 1] <= FISHING_COUNT_LIMIT - BAIT_PACK_SIZE;
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
    return state.cast !== null || !Number.isInteger(action.index) || action.index < 0 || action.index > 2 || action.index === state.bait
      || action.index > 0 && state.baitStock[action.index - 1] === 0 ? state
      : { ...state, bait: action.index, lastObservedAt: observedAt };
  }
  if (action.type === 'sell') {
    const value = fishingSaleValue(state);
    return value <= 0 || value > FISHING_COUNT_LIMIT - state.coins ? state
      : { ...state, coins: state.coins + value, inventory: Array(36).fill(0), inventoryBonus: 0, lastObservedAt: observedAt };
  }
  if (action.type === 'buy-bait') {
    if (!canBuyBait(state, action.index)) return state;
    const baitStock = [...state.baitStock];
    baitStock[action.index - 1] += BAIT_PACK_SIZE;
    return { ...state, coins: state.coins - baitPackPrice(action.index), baitStock, bait: action.index, lastObservedAt: observedAt };
  }
  if (action.type === 'upgrade') {
    return !canUpgradeRod(state) ? state
      : { ...state, rod: state.rod + 1, coins: state.coins - rodUpgradeCost(state.rod), lastObservedAt: observedAt };
  }
  if (action.type === 'cast') {
    if (state.cast !== null && observedAt < state.cast.expiresAt) return state;
    const settled = state.cast === null ? state : { ...state, cast: null, misses: state.misses + 1, streak: 0, lastObservedAt: observedAt };
    if (settled.casts >= FISHING_COUNT_LIMIT || observedAt > FISHING_TIME_LIMIT - 35_000 || !hasBait(settled)) return settled;
    const speciesRoll = random(settled.rng);
    const rng = random(speciesRoll);
    const biteAt = observedAt + 18_000 + rng % 12_001;
    const baitStock = [...settled.baitStock];
    if (settled.bait > 0) baitStock[settled.bait - 1] -= 1;
    return {
      ...settled, rng, baitStock, casts: settled.casts + 1, lastObservedAt: observedAt,
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
  const inventory = [...state.inventory];
  inventory[current.species] += 1;
  const base = fishSalePrice(current.species);
  const delay = observedAt - current.biteAt;
  const bonus = delay <= 1_000 ? Math.floor(base / 2) : delay <= 3_000 ? Math.floor(base / 4) : 0;
  const streak = state.streak + 1;
  const totalCaught = state.totalCaught + 1;
  let unlockedLocations = state.unlockedLocations;
  while (unlockedLocations < 6 && totalCaught >= LOCATION_REQUIREMENTS[unlockedLocations]
    && locationSpeciesCount({ caught }, unlockedLocations - 1) >= 4) unlockedLocations += 1;
  return {
    ...state, cast: null, caught, totalCaught, inventory, inventoryBonus: Math.min(FISHING_COUNT_LIMIT, state.inventoryBonus + bonus), unlockedLocations,
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

const LEGACY_KEYS = ['rng', 'coins', 'rod', 'location', 'bait', 'caught', 'totalCaught', 'casts', 'misses', 'streak', 'bestStreak', 'lastObservedAt', 'cast'];
type LegacyFishingState = Omit<FishingState, 'inventory' | 'inventoryBonus' | 'baitStock' | 'unlockedLocations'>;

function parsePreviousFields(data: Record<string, unknown>): LegacyFishingState {
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

export function parseFishing(value: unknown): FishingState {
  const data = record(value, [...LEGACY_KEYS, 'inventory', 'inventoryBonus', 'baitStock', 'unlockedLocations']);
  const previous = parsePreviousFields(data);
  if (!Array.isArray(data.inventory) || data.inventory.length !== 36 || !Array.isArray(data.baitStock) || data.baitStock.length !== 2) throw new Error('낚시 보관함 또는 미끼 재고의 길이가 올바르지 않습니다.');
  const inventory = Array.from(data.inventory, (count) => integer(count));
  const inventoryBonus = integer(data.inventoryBonus);
  const baitStock = Array.from(data.baitStock, (count) => integer(count));
  const unlockedLocations = integer(data.unlockedLocations, 6, 1);
  const baseValue = fishingSaleValue({ inventory, inventoryBonus: 0 });
  if (inventory.some((count, species) => count > previous.caught[species]) || inventoryBonus > Math.floor(baseValue / 2)
    || previous.location >= unlockedLocations) throw new Error('낚시 보관함 또는 지역 해금 기록이 올바르지 않습니다.');
  return { ...previous, inventory, inventoryBonus, baitStock, unlockedLocations };
}

/** v5 catches already paid coins, so migration never makes them sellable again. */
export function migrateFishing(value: unknown): FishingState {
  const previous = parsePreviousFields(record(value, LEGACY_KEYS));
  const unlockedLocations = Math.max(previous.location + 1, LOCATION_REQUIREMENTS.filter((required) => previous.totalCaught >= required).length);
  return { ...previous, inventory: Array(36).fill(0), inventoryBonus: 0, baitStock: [0, 0], unlockedLocations };
}
