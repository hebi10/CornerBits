export type CoastalAction = 'fish' | 'gather' | 'flower' | 'lantern' | 'bench' | 'upgrade';
export type Pose = 'idle' | 'walk' | 'fish' | 'gather' | 'decorate';

export interface CoastalState {
  activity: CoastalAction | null;
  elapsedMs: number;
  catches: number;
  totalGathered: number;
  fish: number;
  wood: number;
  coins: number;
  decoration: number;
  houseLevel: number;
}

export const MAX_COAST_COUNT = 1_000_000_000_000;
export const COIN_PER_FISH = 15;
export const PROJECTS = [
  { action: 'flower', name: '꽃화분', bit: 1, frame: 5, requiredLevel: 1, wood: 3, coins: 20 },
  { action: 'lantern', name: '등불', bit: 2, frame: 6, requiredLevel: 2, wood: 6, coins: 45 },
  { action: 'bench', name: '벤치', bit: 4, frame: 7, requiredLevel: 3, wood: 12, coins: 90 },
] as const;

export const ANCHORS = {
  home: { x: 46, y: 51 }, dock: { x: 24, y: 54 },
  beach: { x: 82, y: 68 }, house: { x: 47, y: 49 },
};
const CENTRAL_PATH = { x: 48, y: 56 };
const TRAVEL_MS = 1_200;
const ACTIONS: readonly CoastalAction[] = ['fish', 'gather', 'flower', 'lantern', 'bench', 'upgrade'];
const KEYS = ['activity', 'elapsedMs', 'catches', 'totalGathered', 'fish', 'wood', 'coins', 'decoration', 'houseLevel'];

function validAction(action: unknown): action is CoastalAction {
  return ACTIONS.includes(action as CoastalAction);
}
function integer(value: unknown, max = MAX_COAST_COUNT, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function project(action: CoastalAction) { return PROJECTS.find(item => item.action === action); }

export function activityDuration(action: CoastalAction): number {
  return action === 'fish' ? 5_200 : validAction(action) ? 4_200 : 0;
}

/** Pending costs are already reserved. Only completion eligibility is checked here. */
function canFinish(state: CoastalState, action: CoastalAction): boolean {
  if (action === 'fish') return state.catches <= MAX_COAST_COUNT - state.houseLevel && state.fish <= MAX_COAST_COUNT - state.houseLevel;
  if (action === 'gather') return state.totalGathered <= MAX_COAST_COUNT - state.houseLevel && state.wood <= MAX_COAST_COUNT - state.houseLevel;
  if (action === 'upgrade') return state.houseLevel < 3;
  const item = project(action);
  return item !== undefined && state.houseLevel >= item.requiredLevel && (state.decoration & item.bit) === 0;
}

function validState(value: unknown): value is CoastalState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(value, key))) return false;
  const state = value as CoastalState;
  if (![state.catches, state.totalGathered, state.fish, state.wood, state.coins].every(count => integer(count))
    || !integer(state.decoration, 7) || !integer(state.houseLevel, 3, 1)
    || state.fish > state.catches || state.wood > state.totalGathered
    || (state.decoration & ~((1 << state.houseLevel) - 1)) !== 0) return false;
  if (state.activity === null) return state.elapsedMs === 0;
  return validAction(state.activity) && integer(state.elapsedMs, activityDuration(state.activity) - 1)
    && canFinish(state, state.activity);
}

export function initialCoast(): CoastalState {
  return { activity: null, elapsedMs: 0, catches: 0, totalGathered: 0, fish: 0, wood: 0, coins: 0, decoration: 0, houseLevel: 1 };
}

export function parseCoast(value: unknown): CoastalState {
  if (!validState(value)) throw new Error('해안 생활 기록이 올바르지 않습니다.');
  return { ...value };
}

export function projectCost(state: CoastalState, action: CoastalAction): { wood: number; coins: number } {
  if (action === 'upgrade') return state.houseLevel === 1 ? { wood: 12, coins: 75 } : state.houseLevel === 2 ? { wood: 25, coins: 150 } : { wood: 0, coins: 0 };
  const item = project(action);
  return item ? { wood: item.wood, coins: item.coins } : { wood: 0, coins: 0 };
}

export function canStartActivity(state: CoastalState, action: CoastalAction): boolean {
  if (!validState(state) || !validAction(action) || state.activity !== null || !canFinish(state, action)) return false;
  const cost = projectCost(state, action);
  return state.wood >= cost.wood && state.coins >= cost.coins;
}

export function startActivity(state: CoastalState, action: CoastalAction): CoastalState {
  if (!canStartActivity(state, action)) return state;
  const cost = projectCost(state, action);
  return { ...state, activity: action, elapsedMs: 0, wood: state.wood - cost.wood, coins: state.coins - cost.coins };
}

/** One elapsed trip can produce at most one reward, never repeated offline work. */
export function advanceCoast(state: CoastalState, deltaMs: number): CoastalState {
  if (!validState(state) || !Number.isSafeInteger(deltaMs) || deltaMs <= 0 || state.activity === null) return state;
  if (deltaMs < activityDuration(state.activity) - state.elapsedMs) return { ...state, elapsedMs: state.elapsedMs + deltaMs };
  const item = project(state.activity);
  return {
    ...state, activity: null, elapsedMs: 0,
    catches: state.catches + (state.activity === 'fish' ? state.houseLevel : 0),
    fish: state.fish + (state.activity === 'fish' ? state.houseLevel : 0),
    totalGathered: state.totalGathered + (state.activity === 'gather' ? state.houseLevel : 0),
    wood: state.wood + (state.activity === 'gather' ? state.houseLevel : 0),
    decoration: item ? state.decoration | item.bit : state.decoration,
    houseLevel: state.houseLevel + (state.activity === 'upgrade' ? 1 : 0),
  };
}

export function sellFish(state: CoastalState): CoastalState {
  if (!validState(state) || state.activity !== null || state.fish === 0
    || state.fish > Math.floor((MAX_COAST_COUNT - state.coins) / COIN_PER_FISH)) return state;
  return { ...state, fish: 0, coins: state.coins + state.fish * COIN_PER_FISH };
}

function walkPoint(target: { x: number; y: number }, ratio: number, returning = false): { x: number; y: number } {
  const path = returning ? [target, CENTRAL_PATH, ANCHORS.home] : [ANCHORS.home, CENTRAL_PATH, target];
  const segment = ratio < .5 ? 0 : 1;
  const progress = ratio * 2 - segment;
  return { x: path[segment].x + (path[segment + 1].x - path[segment].x) * progress,
    y: path[segment].y + (path[segment + 1].y - path[segment].y) * progress };
}

export function sampleCoast(state: CoastalState): {
  x: number; y: number; pose: Pose; frame: number;
  phase: 'idle' | 'outbound' | 'working' | 'inbound'; progress: number;
} {
  const idle = { ...ANCHORS.home, pose: 'idle' as const, frame: 0, phase: 'idle' as const, progress: 0 };
  if (!validState(state) || state.activity === null) return idle;
  const elapsed = state.elapsedMs;
  const progress = elapsed / activityDuration(state.activity);
  const target = state.activity === 'fish' ? ANCHORS.dock : state.activity === 'gather' ? ANCHORS.beach : ANCHORS.house;
  if (elapsed < TRAVEL_MS) return { ...walkPoint(target, elapsed / TRAVEL_MS), pose: 'walk', frame: Math.floor(elapsed / 180) % 4, phase: 'outbound', progress };
  const workMs = activityDuration(state.activity) - TRAVEL_MS * 2;
  const workingElapsed = elapsed - TRAVEL_MS;
  const pose = state.activity === 'fish' ? 'fish' : state.activity === 'gather' ? 'gather' : 'decorate';
  const firstFrame = pose === 'fish' ? 4 : pose === 'gather' ? 8 : 12;
  if (workingElapsed < workMs) return { ...target, pose, frame: firstFrame + Math.floor(workingElapsed / 200) % 4, phase: 'working', progress };
  const returningElapsed = workingElapsed - workMs;
  return { ...walkPoint(target, returningElapsed / TRAVEL_MS, true), pose: 'walk', frame: Math.floor(returningElapsed / 180) % 4, phase: 'inbound', progress };
}