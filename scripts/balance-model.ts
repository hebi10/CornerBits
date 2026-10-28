import {
  initialMine, reduceMine, type MineAction, type MineState,
} from '../src/games/mine.ts';
import {
  initialGarden, reduceGarden, type GardenAction, type GardenState,
} from '../src/games/garden.ts';
import {
  CIRCUIT_STAGES, circuitStatus, initialCircuit, puzzleForStage, reduceCircuit, rotateMask,
  type CircuitState,
} from '../src/games/circuit.ts';

/** Explicit estimates, not measured human completion times or daily limits. */
export const SESSION_MINUTES = [10, 12.5, 15] as const;
const DAY_MS = 86_400_000;

export interface SessionEstimate {
  sessionMinutes: number;
  days: number;
  roundedDays: number;
}

function estimates(seconds: number): SessionEstimate[] {
  return SESSION_MINUTES.map((sessionMinutes) => ({
    sessionMinutes,
    days: seconds / (sessionMinutes * 60),
    roundedDays: Math.ceil(seconds / (sessionMinutes * 60)),
  }));
}

export interface MineModel {
  state: MineState;
  actions: { hit: number; sell: number; descend: number; upgrade: number };
  upgradeFloors: number[];
  inputSeconds: number;
  estimates: SessionEstimate[];
}

/** Every floor is mined and sold; an affordable upgrade is taken before mining. */
export function simulateMine(): MineModel {
  let state = initialMine();
  const actions = { hit: 0, sell: 0, descend: 0, upgrade: 0 };
  const upgradeFloors: number[] = [];
  function perform(action: MineAction): boolean {
    const next = reduceMine(state, action);
    if (next === state) return false;
    state = next;
    actions[action.type] += 1;
    return true;
  }
  for (let floor = 1; floor <= 1_000; floor += 1) {
    if (perform({ type: 'upgrade' })) upgradeFloors.push(floor);
    for (let index = 0; index < 25; index += 1) {
      while (state.tiles[index] > 0) {
        if (!perform({ type: 'hit', index })) throw new Error('광산 모델의 채굴이 진행되지 않았습니다.');
      }
    }
    perform({ type: 'sell' });
    if (floor < 1_000 && !perform({ type: 'descend' })) throw new Error('광산 모델의 다음 층이 열리지 않았습니다.');
  }
  const inputSeconds = actions.hit + 2 * (actions.sell + actions.descend) + 3 * actions.upgrade;
  return { state, actions, upgradeFloors, inputSeconds, estimates: estimates(inputSeconds) };
}

export interface GardenSession {
  day: number;
  inputSeconds: number;
  waitingSeconds: number;
  elapsedSeconds: number;
  latestActionEndSeconds: number;
}

export interface GardenModel {
  state: GardenState;
  days: number;
  sessionMinutes: number;
  allSeedsUnlockedDay: number;
  twelvePotsDay: number;
  actions: { plant: number; water: number; harvest: number; expand: number };
  inputSeconds: number;
  waitingSeconds: number;
  sessions: GardenSession[];
}

export interface GardenModelOptions {
  sessionMinutes?: number;
  actionSeconds?: number;
  maxDays?: number;
}

/**
 * One visit per day, offline growth included. All successful actions consume the
 * declared input time; failed attempts consume none. Growth waits are separate.
 * The latest unlocked seed is used, and pots are expanded as soon as affordable.
 */
export function simulateGarden(options: GardenModelOptions = {}): GardenModel {
  const { sessionMinutes = 12.5, actionSeconds = 1, maxDays = 180 } = options;
  const sessionMs = sessionMinutes * 60_000;
  const actionMs = actionSeconds * 1_000;
  if (!Number.isSafeInteger(sessionMs) || !Number.isSafeInteger(actionMs)
    || actionMs <= 0 || sessionMs < actionMs || sessionMs >= DAY_MS
    || !Number.isSafeInteger(maxDays) || maxDays < 1) {
    throw new Error('정원 모델의 세션 시간 또는 행동 예산이 올바르지 않습니다.');
  }
  let state = initialGarden();
  let allSeedsUnlockedDay = 0;
  let twelvePotsDay = 0;
  const actions = { plant: 0, water: 0, harvest: 0, expand: 0 };
  const sessions: GardenSession[] = [];
  for (let day = 1; day <= maxDays; day += 1) {
    const start = (day - 1) * DAY_MS;
    const end = start + sessionMs;
    let now = start;
    let inputMs = 0;
    let waitingMs = 0;
    let latestActionEndSeconds = 0;
    let budgetExhausted = false;
    function perform(action: GardenAction): boolean {
      // Never start an action whose completion would exceed this visit.
      if (now + actionMs > end) { budgetExhausted = true; return false; }
      const next = reduceGarden(state, action, now);
      if (next === state) return false;
      state = next;
      actions[action.type] += 1;
      now += actionMs;
      inputMs += actionMs;
      latestActionEndSeconds = (now - start) / 1_000;
      if (!allSeedsUnlockedDay && state.unlockedSpecies === 40) allSeedsUnlockedDay = day;
      if (!twelvePotsDay && state.pots.length === 12) twelvePotsDay = day;
      return true;
    }
    session: while (now < end) {
      let changed = false;
      for (let index = 0; index < state.pots.length; index += 1) {
        changed = perform({ type: 'harvest', index }) || changed;
        if (budgetExhausted || state.harvested.every((count) => count > 0)) break session;
      }
      while (perform({ type: 'expand' })) changed = true;
      if (budgetExhausted) break;
      const species = state.unlockedSpecies - 1;
      for (let index = 0; index < state.pots.length; index += 1) {
        if (state.pots[index] === null) changed = perform({ type: 'plant', index, species }) || changed;
        if (budgetExhausted) break session;
        changed = perform({ type: 'water', index }) || changed;
        if (budgetExhausted) break session;
      }
      if (!changed) {
        const wait = Math.min(1_000, end - now);
        now += wait;
        waitingMs += wait;
      }
    }
    if (budgetExhausted) { waitingMs += end - now; now = end; }
    sessions.push({
      day, inputSeconds: inputMs / 1_000, waitingSeconds: waitingMs / 1_000,
      elapsedSeconds: (now - start) / 1_000, latestActionEndSeconds,
    });
    if (state.harvested.every((count) => count > 0)) {
      return {
        state, days: day, sessionMinutes, allSeedsUnlockedDay, twelvePotsDay, actions,
        inputSeconds: sessions.reduce((sum, session) => sum + session.inputSeconds, 0),
        waitingSeconds: sessions.reduce((sum, session) => sum + session.waitingSeconds, 0),
        sessions,
      };
    }
  }
  throw new Error(`정원 모델이 ${maxDays}일 안에 목표를 달성하지 못했습니다.`);
}

export interface CircuitStageModel {
  stage: number;
  size: 4 | 5;
  rotations: number;
  solved: boolean;
  thinkingSeconds: number;
}

export interface CircuitModel {
  state: CircuitState;
  stages: CircuitStageModel[];
  rotations: number;
  inputSeconds: number;
  thinkingSeconds: number;
  totalSeconds: number;
  estimates: SessionEstimate[];
}

/** A known valid orientation path, not a claim about the shortest human solution. */
export function simulateCircuit(): CircuitModel {
  let state = initialCircuit();
  const stages: CircuitStageModel[] = [];
  for (let stage = 1; stage <= CIRCUIT_STAGES; stage += 1) {
    const puzzle = puzzleForStage(stage);
    let rotations = 0;
    for (let index = 0; index < puzzle.masks.length && !circuitStatus(state).solved; index += 1) {
      let turns = 0;
      while (rotateMask(puzzle.masks[index], state.rotations[index] + turns) !== puzzle.masks[index]) turns += 1;
      for (let count = 0; count < turns && !circuitStatus(state).solved; count += 1) {
        const next = reduceCircuit(state, { type: 'rotate', index });
        if (next === state) throw new Error('회로 모델의 회전이 진행되지 않았습니다.');
        state = next;
        rotations += 1;
      }
    }
    const solved = circuitStatus(state).solved;
    if (!solved) throw new Error(`회로 모델이 ${stage}단계를 풀지 못했습니다.`);
    stages.push({ stage, size: puzzle.size, rotations, solved, thinkingSeconds: puzzle.size === 4 ? 90 : 155 });
    if (stage < CIRCUIT_STAGES) {
      const next = reduceCircuit(state, { type: 'next' });
      if (next === state) throw new Error('회로 모델의 다음 단계가 열리지 않았습니다.');
      state = next;
    }
  }
  const rotations = stages.reduce((sum, stage) => sum + stage.rotations, 0);
  const inputSeconds = rotations * 0.8 + (CIRCUIT_STAGES - 1) * 2;
  const thinkingSeconds = stages.reduce((sum, stage) => sum + stage.thinkingSeconds, 0);
  const totalSeconds = inputSeconds + thinkingSeconds;
  return { state, stages, rotations, inputSeconds, thinkingSeconds, totalSeconds, estimates: estimates(totalSeconds) };
}
