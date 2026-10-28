export type CoastalAction = 'fish' | 'gather' | 'flower' | 'lantern' | 'bench' | 'upgrade';
export type WorkAction = 'fish' | 'gather';
export type WorkInterval = 10 | 15;
export type Pose = 'idle' | 'walk' | 'fish' | 'gather' | 'decorate';

export interface WorkReport {
  id: number;
  activity: WorkAction;
  amount: number;
  cycles: number;
}

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
  workInterval: WorkInterval;
  lastReport: WorkReport | null;
  workTimeMs: number;
  workAmount: number;
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
const LEGACY_KEYS = ['activity', 'elapsedMs', 'catches', 'totalGathered', 'fish', 'wood', 'coins', 'decoration', 'houseLevel'];
const V9_KEYS = [...LEGACY_KEYS, 'workInterval', 'lastReport'];
const KEYS = [...V9_KEYS, 'workTimeMs', 'workAmount'];
type LegacyCoastalStateV9 = Omit<CoastalState, 'workTimeMs' | 'workAmount'>;
type LegacyCoastalState = Omit<LegacyCoastalStateV9, 'workInterval' | 'lastReport'>;

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validAction(action: unknown): action is CoastalAction {
  return ACTIONS.includes(action as CoastalAction);
}
function integer(value: unknown, max = MAX_COAST_COUNT, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function project(action: CoastalAction) { return PROJECTS.find(item => item.action === action); }

export function isWork(action: unknown): action is WorkAction {
  return action === 'fish' || action === 'gather';
}

export function activityDuration(action: CoastalAction, interval: WorkInterval = 10): number {
  return isWork(action) ? interval * 60_000 : validAction(action) ? 4_200 : 0;
}

export function workYield(state: Pick<CoastalState, 'houseLevel' | 'workInterval'>): number {
  return state.houseLevel * (state.workInterval === 10 ? 2 : 3);
}

/** Pending costs are already reserved. Only completion eligibility is checked here. */
function canFinish(state: LegacyCoastalState, action: CoastalAction, amount: number): boolean {
  if (action === 'fish') return state.catches <= MAX_COAST_COUNT - amount && state.fish <= MAX_COAST_COUNT - amount;
  if (action === 'gather') return state.totalGathered <= MAX_COAST_COUNT - amount && state.wood <= MAX_COAST_COUNT - amount;
  if (action === 'upgrade') return state.houseLevel < 3;
  const item = project(action);
  return item !== undefined && state.houseLevel >= item.requiredLevel && (state.decoration & item.bit) === 0;
}

function validResources(state: LegacyCoastalState): boolean {
  if (![state.catches, state.totalGathered, state.fish, state.wood, state.coins].every(count => integer(count))
    || !integer(state.decoration, 7) || !integer(state.houseLevel, 3, 1)
    || state.fish > state.catches || state.wood > state.totalGathered
    || (state.decoration & ~((1 << state.houseLevel) - 1)) !== 0) return false;
  return true;
}

function validReport(report: unknown, state: LegacyCoastalStateV9): report is WorkReport | null {
  if (report === null) return true;
  return exactRecord(report, ['id', 'activity', 'amount', 'cycles']) && isWork(report.activity)
    && integer(report.id, MAX_COAST_COUNT, 1) && integer(report.amount, MAX_COAST_COUNT, 1)
    && integer(report.cycles, MAX_COAST_COUNT, 1)
    && report.amount >= 2 * report.cycles && report.amount <= 9 * report.cycles
    && report.amount <= (report.activity === 'fish' ? state.catches : state.totalGathered);
}

function validV9Fields(state: LegacyCoastalStateV9): boolean {
  if (!validResources(state) || (state.workInterval !== 10 && state.workInterval !== 15)
    || !validReport(state.lastReport, state)) return false;
  if (state.activity === null) return state.elapsedMs === 0;
  return validAction(state.activity) && integer(state.elapsedMs, activityDuration(state.activity, state.workInterval) - 1)
    && canFinish(state, state.activity, workYield(state));
}

function validState(value: unknown): value is CoastalState {
  if (!exactRecord(value, KEYS)) return false;
  const state = value as unknown as CoastalState;
  if (!validV9Fields(state) || !integer(state.workTimeMs) || !integer(state.workAmount)) return false;
  return isWork(state.activity)
    ? state.workTimeMs >= state.elapsedMs && state.workAmount <= (state.activity === 'fish' ? state.catches : state.totalGathered)
    : state.workTimeMs === 0 && state.workAmount === 0;
}

export function initialCoast(): CoastalState {
  return { activity: null, elapsedMs: 0, catches: 0, totalGathered: 0, fish: 0, wood: 0, coins: 0, decoration: 0, houseLevel: 1, workInterval: 10, lastReport: null, workTimeMs: 0, workAmount: 0 };
}

export function parseCoast(value: unknown): CoastalState {
  if (!validState(value)) throw new Error('해안 생활 기록이 올바르지 않습니다.');
  return { ...value, lastReport: value.lastReport ? { ...value.lastReport } : null };
}

/** Older saves have no per-job totals, so only the known remainder is carried forward. */
export function migrateCoastV9(value: unknown): CoastalState {
  if (!exactRecord(value, V9_KEYS) || !validV9Fields(value as unknown as LegacyCoastalStateV9)) throw new Error('해안 생활 기록이 올바르지 않습니다.');
  const legacy = value as unknown as LegacyCoastalStateV9;
  return { ...legacy, lastReport: legacy.lastReport ? { ...legacy.lastReport } : null, workTimeMs: isWork(legacy.activity) ? legacy.elapsedMs : 0, workAmount: 0 };
}

/** Validate the original v8 contract before introducing any newer defaults. */
export function migrateCoastV8(value: unknown): CoastalState {
  if (!exactRecord(value, LEGACY_KEYS)) throw new Error('해안 생활 기록이 올바르지 않습니다.');
  const legacy = value as unknown as LegacyCoastalState;
  const duration = legacy.activity === 'fish' ? 5_200 : 4_200;
  if (!validResources(legacy) || (legacy.activity === null ? legacy.elapsedMs !== 0
    : !validAction(legacy.activity) || !integer(legacy.elapsedMs, duration - 1)
      || !canFinish(legacy, legacy.activity, legacy.houseLevel))) throw new Error('해안 생활 기록이 올바르지 않습니다.');
  const migrated: LegacyCoastalStateV9 = { ...legacy, workInterval: 10, lastReport: null };
  if (isWork(migrated.activity) && !canFinish(migrated, migrated.activity, workYield(migrated))) {
    return migrateCoastV9({ ...migrated, activity: null, elapsedMs: 0 });
  }
  return migrateCoastV9(migrated);
}

export function projectCost(state: CoastalState, action: CoastalAction): { wood: number; coins: number } {
  if (action === 'upgrade') return state.houseLevel === 1 ? { wood: 12, coins: 75 } : state.houseLevel === 2 ? { wood: 25, coins: 150 } : { wood: 0, coins: 0 };
  const item = project(action);
  return item ? { wood: item.wood, coins: item.coins } : { wood: 0, coins: 0 };
}

export function canStartActivity(state: CoastalState, action: CoastalAction): boolean {
  if (!validState(state) || !validAction(action) || state.activity !== null || !canFinish(state, action, workYield(state))) return false;
  const cost = projectCost(state, action);
  return state.wood >= cost.wood && state.coins >= cost.coins;
}

export function startActivity(state: CoastalState, action: CoastalAction): CoastalState {
  if (!canStartActivity(state, action)) return state;
  const cost = projectCost(state, action);
  return { ...state, activity: action, elapsedMs: 0, workTimeMs: 0, workAmount: 0, wood: state.wood - cost.wood, coins: state.coins - cost.coins };
}

export function stopWork(state: CoastalState): CoastalState {
  return validState(state) && isWork(state.activity) ? { ...state, activity: null, elapsedMs: 0, workTimeMs: 0, workAmount: 0 } : state;
}

export function setWorkInterval(state: CoastalState, interval: WorkInterval): CoastalState {
  return validState(state) && state.activity === null && (interval === 10 || interval === 15)
    && state.workInterval !== interval ? { ...state, workInterval: interval } : state;
}

/** Delayed timer ticks settle full cycles in O(1), without adding unsafe timestamps. */
export function advanceCoast(state: CoastalState, deltaMs: number): CoastalState {
  if (!validState(state) || !Number.isSafeInteger(deltaMs) || deltaMs <= 0 || state.activity === null) return state;
  const duration = activityDuration(state.activity, state.workInterval);
  const remaining = duration - state.elapsedMs;
  const workTimeMs = isWork(state.activity) ? state.workTimeMs + Math.min(deltaMs, MAX_COAST_COUNT - state.workTimeMs) : 0;
  if (deltaMs < remaining) return { ...state, elapsedMs: state.elapsedMs + deltaMs, workTimeMs };
  if (isWork(state.activity)) {
    const capacity = state.activity === 'fish'
      ? Math.min(MAX_COAST_COUNT - state.catches, MAX_COAST_COUNT - state.fish)
      : Math.min(MAX_COAST_COUNT - state.totalGathered, MAX_COAST_COUNT - state.wood);
    const yieldAmount = workYield(state);
    const dueCycles = 1 + Math.floor((deltaMs - remaining) / duration);
    const cycles = Math.min(dueCycles, Math.floor(capacity / yieldAmount));
    const amount = cycles * yieldAmount;
    const next: CoastalState = {
      ...state, elapsedMs: (deltaMs - remaining) % duration, workTimeMs, workAmount: state.workAmount + amount,
      catches: state.catches + (state.activity === 'fish' ? amount : 0),
      fish: state.fish + (state.activity === 'fish' ? amount : 0),
      totalGathered: state.totalGathered + (state.activity === 'gather' ? amount : 0),
      wood: state.wood + (state.activity === 'gather' ? amount : 0),
      lastReport: { id: state.lastReport === null || state.lastReport.id === MAX_COAST_COUNT ? 1 : state.lastReport.id + 1, activity: state.activity, amount, cycles },
    };
    return canFinish(next, state.activity, yieldAmount) ? next : { ...next, activity: null, elapsedMs: 0, workTimeMs: 0, workAmount: 0 };
  }
  const item = project(state.activity);
  return {
    ...state, activity: null, elapsedMs: 0, workTimeMs: 0, workAmount: 0,
    decoration: item ? state.decoration | item.bit : state.decoration,
    houseLevel: state.houseLevel + (state.activity === 'upgrade' ? 1 : 0),
  };
}

export function sellFish(state: CoastalState): CoastalState {
  if (!validState(state) || (state.activity !== null && !isWork(state.activity)) || state.fish === 0
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
  const duration = activityDuration(state.activity, state.workInterval);
  const progress = elapsed / duration;
  const target = state.activity === 'fish' ? ANCHORS.dock : state.activity === 'gather' ? ANCHORS.beach : ANCHORS.house;
  if (elapsed < TRAVEL_MS) return { ...walkPoint(target, elapsed / TRAVEL_MS), pose: 'walk', frame: Math.floor(elapsed / 180) % 4, phase: 'outbound', progress };
  const workMs = duration - TRAVEL_MS * 2;
  const workingElapsed = elapsed - TRAVEL_MS;
  const pose = state.activity === 'fish' ? 'fish' : state.activity === 'gather' ? 'gather' : 'decorate';
  const firstFrame = pose === 'fish' ? 4 : pose === 'gather' ? 8 : 12;
  if (workingElapsed < workMs) return { ...target, pose, frame: firstFrame + Math.floor(workingElapsed / 200) % (pose === 'fish' ? 2 : 4), phase: 'working', progress };
  const returningElapsed = workingElapsed - workMs;
  return { ...walkPoint(target, returningElapsed / TRAVEL_MS, true), pose: 'walk', frame: Math.floor(returningElapsed / 180) % 4, phase: 'inbound', progress };
}
