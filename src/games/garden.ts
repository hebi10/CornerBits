export interface GardenPlant {
  species: number;
  plantedAt: number;
  watered: boolean;
}

export interface GardenState {
  coins: number;
  pots: (GardenPlant | null)[];
  harvested: number[];
  totalHarvests: number;
  lastObservedAt: number;
  unlockedSpecies: number;
}

export type GardenAction =
  | { type: 'plant'; index: number; species: number }
  | { type: 'water'; index: number }
  | { type: 'harvest'; index: number }
  | { type: 'expand' };

const MAX_COUNT = 1_000_000_000_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MINUTE = 60_000;

export const PLANTS: readonly { name: string; growMs: number }[] = [
  '새싹', '클로버', '민들레', '데이지', '팬지', '봉선화', '메리골드', '코스모스',
  '백일홍', '페튜니아', '나팔꽃', '금어초', '수레국화', '안개꽃', '카모마일', '라벤더',
  '로즈메리', '바질', '애플민트', '타임', '튤립', '수선화', '히아신스', '프리지아',
  '아이리스', '작약', '수국', '장미', '달리아', '백합', '카라', '은방울꽃',
  '알스트로메리아', '아네모네', '리시안셔스', '동백', '치자', '자스민', '목련', '에델바이스',
].map((name, index) => ({
  name,
  growMs: index === 0 ? MINUTE : index === 1 ? 90_000 : index === 2 ? 2 * MINUTE : 3 * MINUTE,
}));

export function initialGarden(): GardenState {
  return { coins: 0, pots: [null, null, null], harvested: Array(40).fill(0), totalHarvests: 0, lastObservedAt: 0, unlockedSpecies: 1 };
}

/** Harvests of the preceding species needed to open this seed. */
export function harvestsToUnlock(species: number): number {
  return species <= 0 ? 0 : species === 1 ? 5 : species === 2 ? 12 : species === 3 ? 20 : species <= 8 ? 50 : species <= 20 ? 90 : 120;
}

export function expansionCost(state: GardenState): number {
  return 50 * (state.pots.length - 2) ** 2;
}

/** Only successful actions persist this clock; render ticks never change saves. */
export function gardenNow(state: GardenState, now: number): number {
  const safeNow = Number.isSafeInteger(now) ? Math.min(MAX_TIMESTAMP, Math.max(0, now)) : state.lastObservedAt;
  return Math.max(state.lastObservedAt, safeNow);
}

export function growthDuration(plant: GardenPlant): number {
  return PLANTS[plant.species].growMs * (plant.watered ? 0.75 : 1);
}

export function isPlantReady(plant: GardenPlant, now: number): boolean {
  return now - plant.plantedAt >= growthDuration(plant);
}

export function isSpeciesUnlocked(state: GardenState, species: number): boolean {
  return Number.isInteger(species) && species >= 0 && species < PLANTS.length
    && species < state.unlockedSpecies;
}

export function reduceGarden(state: GardenState, action: GardenAction, now: number): GardenState {
  const observedAt = gardenNow(state, now);
  if (action.type === 'expand') {
    const cost = expansionCost(state);
    if (state.pots.length >= 12 || state.coins < cost) return state;
    return { ...state, coins: state.coins - cost, pots: [...state.pots, null], lastObservedAt: observedAt };
  }
  if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.pots.length) return state;
  const plant = state.pots[action.index];
  if (action.type === 'plant') {
    if (plant !== null || !isSpeciesUnlocked(state, action.species)) return state;
    const pots = [...state.pots];
    pots[action.index] = { species: action.species, plantedAt: observedAt, watered: false };
    return { ...state, pots, lastObservedAt: observedAt };
  }
  if (plant === null) return state;
  if (action.type === 'water') {
    if (plant.watered || isPlantReady(plant, observedAt)) return state;
    const pots = [...state.pots];
    pots[action.index] = { ...plant, watered: true };
    return { ...state, pots, lastObservedAt: observedAt };
  }
  if (action.type === 'harvest') {
    if (!isPlantReady(plant, observedAt) || state.totalHarvests >= MAX_COUNT) return state;
    const pots = [...state.pots];
    pots[action.index] = null;
    const harvested = [...state.harvested];
    harvested[plant.species] += 1;
    let unlockedSpecies = state.unlockedSpecies;
    while (unlockedSpecies < PLANTS.length && harvested[unlockedSpecies - 1] >= harvestsToUnlock(unlockedSpecies)) unlockedSpecies += 1;
    return {
      ...state,
      pots,
      harvested,
      coins: Math.min(MAX_COUNT, state.coins + 15 + plant.species * 5),
      totalHarvests: state.totalHarvests + 1,
      lastObservedAt: observedAt,
      unlockedSpecies,
    };
  }
  return state;
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('정원 기록 형식이 올바르지 않습니다.');
  const fields = Object.keys(value);
  if (fields.length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) throw new Error('정원 기록 항목이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}

function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error('정원 기록 값이 허용 범위를 벗어났습니다.');
  return value;
}

export function parseGarden(value: unknown): GardenState {
  const data = record(value, ['coins', 'pots', 'harvested', 'totalHarvests', 'lastObservedAt', 'unlockedSpecies']);
  const unlockedSpecies = integer(data.unlockedSpecies, 40);
  if (unlockedSpecies < 1) throw new Error('해금된 씨앗 수가 올바르지 않습니다.');
  const coins = integer(data.coins, MAX_COUNT);
  const totalHarvests = integer(data.totalHarvests, MAX_COUNT);
  const lastObservedAt = integer(data.lastObservedAt, MAX_TIMESTAMP);
  if (!Array.isArray(data.pots) || data.pots.length < 3 || data.pots.length > 12) throw new Error('화분 수가 올바르지 않습니다.');
  const pots = Array.from(data.pots, (value): GardenPlant | null => {
    if (value === null) return null;
    const plant = record(value, ['species', 'plantedAt', 'watered']);
    const species = integer(plant.species, 39);
    const plantedAt = integer(plant.plantedAt, lastObservedAt);
    if (typeof plant.watered !== 'boolean') throw new Error('물주기 기록이 올바르지 않습니다.');
    return { species, plantedAt, watered: plant.watered };
  });
  if (!Array.isArray(data.harvested) || data.harvested.length !== 40) throw new Error('수확 기록 길이가 올바르지 않습니다.');
  const harvested = Array.from(data.harvested, (count) => integer(count, MAX_COUNT));
  if (harvested.reduce((sum, count) => sum + count, 0) !== totalHarvests) throw new Error('수확 기록 합계가 올바르지 않습니다.');
  return { coins, pots, harvested, totalHarvests, lastObservedAt, unlockedSpecies };
}

/** Preserve every seed available or already grown under the old five-harvest rule. */
export function migrateGarden(value: unknown): GardenState {
  const data = record(value, ['coins', 'pots', 'harvested', 'totalHarvests', 'lastObservedAt']);
  const state = parseGarden({ ...data, unlockedSpecies: 1 });
  for (let species = 1; species < PLANTS.length; species += 1) {
    if (state.harvested[species - 1] >= 5 || state.harvested[species] > 0 || state.pots.some((plant) => plant !== null && plant.species >= species)) {
      state.unlockedSpecies = species + 1;
    }
  }
  return state;
}
