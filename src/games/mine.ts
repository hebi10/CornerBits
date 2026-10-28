export interface MineState {
  depth: number;
  pickaxe: number;
  coins: number;
  inventory: number[];
  collected: number[];
  tiles: number[];
  totalMined: number;
}

export type MineAction =
  | { type: 'hit'; index: number }
  | { type: 'descend' }
  | { type: 'sell' }
  | { type: 'upgrade' };

export const MINERALS: readonly string[] = [
  '석영', '방해석', '운모', '장석', '황철석', '적철석', '자철석', '공작석', '남동석', '형석',
  '인회석', '석류석', '감람석', '황옥', '자수정', '수정', '전기석', '월장석', '청금석', '터키석',
  '오팔', '비취', '호박', '진주', '백금', '금', '에메랄드', '사파이어', '루비', '다이아몬드',
];

export const MINE_COUNT_LIMIT = 1_000_000_000_000;
export const MINE_DEPTH_LIMIT = 1_000_000;

export function mineDurability(depth: number): number {
  return 2 * Math.min(10, 1 + Math.floor((depth - 1) / 100));
}

export function upgradeCost(pickaxe: number): number {
  return 500 * pickaxe * pickaxe;
}

export function upgradeDepthRequired(pickaxe: number): number {
  return 40 * pickaxe;
}

export function saleValue(inventory: readonly number[]): number {
  return inventory.reduce((total, count, mineral) => total + count * 3 * (mineral + 1), 0);
}

export function initialMine(): MineState {
  return { depth: 1, pickaxe: 1, coins: 0, inventory: Array(30).fill(0), collected: Array(30).fill(0), tiles: Array(25).fill(2), totalMined: 0 };
}

export function oreAt(depth: number, index: number): number {
  const unlocked = Math.min(29, Math.floor((depth - 1) / 34));
  if (index === 12) return unlocked;
  // Integer hashing keeps each floor identical across saves, reloads and platforms.
  const hash = Math.imul(depth, 73_856_093) ^ Math.imul(index + 1, 19_349_663);
  return (hash >>> 0) % (unlocked + 1);
}

export function reduceMine(state: MineState, action: MineAction): MineState {
  switch (action.type) {
    case 'hit': {
      const index = action.index;
      if (!Number.isInteger(index) || index < 0 || index >= 25 || state.tiles[index] === 0 || state.totalMined >= MINE_COUNT_LIMIT) return state;
      const tiles = [...state.tiles];
      tiles[index] = Math.max(0, tiles[index] - state.pickaxe);
      if (tiles[index] > 0) return { ...state, tiles };
      const mineral = oreAt(state.depth, index);
      const inventory = [...state.inventory];
      const collected = [...state.collected];
      inventory[mineral] += 1;
      collected[mineral] += 1;
      return { ...state, tiles, inventory, collected, totalMined: state.totalMined + 1 };
    }
    case 'descend': {
      if (state.depth >= MINE_DEPTH_LIMIT || state.tiles.some((hp) => hp > 0)) return state;
      const depth = state.depth + 1;
      return { ...state, depth, tiles: Array(25).fill(mineDurability(depth)) };
    }
    case 'sell': {
      const value = saleValue(state.inventory);
      if (value === 0 || value > MINE_COUNT_LIMIT - state.coins) return state;
      return { ...state, coins: state.coins + value, inventory: Array(30).fill(0) };
    }
    case 'upgrade': {
      const cost = upgradeCost(state.pickaxe);
      if (state.pickaxe >= 10 || state.depth < upgradeDepthRequired(state.pickaxe) || state.coins < cost) return state;
      return { ...state, pickaxe: state.pickaxe + 1, coins: state.coins - cost };
    }
    default: return state;
  }
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function numbers(value: unknown, length: number, maximum: number): number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error('광산 기록의 배열 길이가 올바르지 않습니다.');
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!integer(value[index], 0, maximum)) throw new Error('광산 기록의 수량 또는 내구도가 올바르지 않습니다.');
    result.push(value[index]);
  }
  return result;
}

export function parseMine(value: unknown): MineState {
  const keys = ['depth', 'pickaxe', 'coins', 'inventory', 'collected', 'tiles', 'totalMined'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('광산 기록의 필드가 올바르지 않습니다.');
  }
  const data = value as Record<string, unknown>;
  if (!integer(data.depth, 1, MINE_DEPTH_LIMIT) || !integer(data.pickaxe, 1, 10)
    || !integer(data.coins, 0, MINE_COUNT_LIMIT) || !integer(data.totalMined, 0, MINE_COUNT_LIMIT)) {
    throw new Error('광산 기록의 깊이, 곡괭이 또는 재화가 올바르지 않습니다.');
  }
  const inventory = numbers(data.inventory, 30, MINE_COUNT_LIMIT);
  const collected = numbers(data.collected, 30, MINE_COUNT_LIMIT);
  const tiles = numbers(data.tiles, 25, mineDurability(data.depth));
  if (inventory.some((count, index) => count > collected[index]) || collected.reduce((sum, count) => sum + count, 0) !== data.totalMined) {
    throw new Error('광산 기록의 보유량과 누적 채굴 수가 일치하지 않습니다.');
  }
  return { depth: data.depth, pickaxe: data.pickaxe, coins: data.coins, inventory, collected, tiles, totalMined: data.totalMined };
}
