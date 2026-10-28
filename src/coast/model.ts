export type CoastalAction = 'fish' | 'gather' | 'decorate';
export type Pose = 'idle' | 'walk' | 'fish' | 'gather' | 'decorate';

export interface CoastalState {
  activity: CoastalAction | null;
  startedAt: number | null;
  catches: number;
  wood: number;
  decoration: number;
}

export const ANCHORS = {
  home: { x: 46, y: 51 },
  dock: { x: 24, y: 54 },
  beach: { x: 82, y: 68 },
  house: { x: 47, y: 49 },
};

const CENTRAL_PATH = { x: 48, y: 56 };
const TRAVEL_MS = 1_200;
const WORK_MS: Record<CoastalAction, number> = { fish: 2_800, gather: 1_800, decorate: 1_800 };
const FRAME_START: Record<CoastalAction, number> = { fish: 4, gather: 8, decorate: 12 };

function validTime(now: number): boolean {
  return Number.isFinite(now) && now >= 0;
}

function validAction(action: CoastalAction | null): action is CoastalAction {
  return action === 'fish' || action === 'gather' || action === 'decorate';
}

function validState(state: CoastalState): boolean {
  return [state.catches, state.wood, state.decoration].every((count) => Number.isSafeInteger(count) && count >= 0)
    && state.decoration <= 3
    && (state.activity === null
      ? state.startedAt === null
      : validAction(state.activity) && state.startedAt !== null && validTime(state.startedAt));
}

export function initialCoast(): CoastalState {
  return { activity: null, startedAt: null, catches: 0, wood: 0, decoration: 0 };
}

export function activityDuration(action: CoastalAction): number {
  return TRAVEL_MS * 2 + WORK_MS[action];
}

export function startActivity(state: CoastalState, action: CoastalAction, now: number): CoastalState {
  if (!validState(state) || !validTime(now) || !validAction(action) || state.activity !== null) return state;
  if (action === 'decorate' && (state.wood === 0 || state.decoration === 3)) return state;
  return { ...state, activity: action, startedAt: now };
}

export function settleCoast(state: CoastalState, now: number): CoastalState {
  if (!validState(state) || !validTime(now) || state.activity === null || state.startedAt === null) return state;
  if (now - state.startedAt < activityDuration(state.activity)) return state;
  if (state.activity === 'decorate' && (state.wood === 0 || state.decoration === 3)) return state;
  const next: CoastalState = {
    activity: null,
    startedAt: null,
    catches: state.catches + (state.activity === 'fish' ? 1 : 0),
    wood: state.wood + (state.activity === 'gather' ? 1 : state.activity === 'decorate' ? -1 : 0),
    decoration: state.decoration + (state.activity === 'decorate' ? 1 : 0),
  };
  return validState(next) ? next : state;
}

function walkPoint(target: { x: number; y: number }, ratio: number, returning = false): { x: number; y: number } {
  const path = returning ? [target, CENTRAL_PATH, ANCHORS.home] : [ANCHORS.home, CENTRAL_PATH, target];
  const segment = ratio < 0.5 ? 0 : 1;
  const progress = ratio * 2 - segment;
  return {
    x: path[segment].x + (path[segment + 1].x - path[segment].x) * progress,
    y: path[segment].y + (path[segment + 1].y - path[segment].y) * progress,
  };
}

export function sampleCoast(state: CoastalState, now: number): {
  x: number;
  y: number;
  pose: Pose;
  frame: number;
  phase: 'idle' | 'outbound' | 'working' | 'inbound';
  progress: number;
} {
  const idle = { ...ANCHORS.home, pose: 'idle' as const, frame: 0, phase: 'idle' as const, progress: 0 };
  if (!validState(state) || state.activity === null || state.startedAt === null) return idle;
  const elapsed = validTime(now) ? Math.max(0, now - state.startedAt) : 0;
  const duration = activityDuration(state.activity);
  const progress = Math.min(1, elapsed / duration);
  if (elapsed >= duration) return { ...idle, progress: 1 };
  const target = state.activity === 'fish' ? ANCHORS.dock : state.activity === 'gather' ? ANCHORS.beach : ANCHORS.house;
  if (elapsed < TRAVEL_MS) {
    return {
      ...walkPoint(target, elapsed / TRAVEL_MS),
      pose: 'walk', frame: Math.floor(elapsed / 180) % 4, phase: 'outbound', progress,
    };
  }
  const workingElapsed = elapsed - TRAVEL_MS;
  if (workingElapsed < WORK_MS[state.activity]) {
    return {
      ...target, pose: state.activity,
      frame: FRAME_START[state.activity] + Math.floor(workingElapsed / 200) % 4,
      phase: 'working', progress,
    };
  }
  const returningElapsed = workingElapsed - WORK_MS[state.activity];
  return {
    ...walkPoint(target, returningElapsed / TRAVEL_MS, true),
    pose: 'walk', frame: Math.floor(returningElapsed / 180) % 4, phase: 'inbound', progress,
  };
}
