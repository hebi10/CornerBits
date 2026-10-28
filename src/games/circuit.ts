export interface CircuitState {
  stage: number;
  rotations: number[];
  turns: number;
  records: number[];
  totalClears: number;
}

export type CircuitAction =
  | { type: 'rotate'; index: number }
  | { type: 'retry' }
  | { type: 'next' }
  | { type: 'select'; stage: number };

export interface CircuitPuzzle {
  stage: number;
  size: 4 | 5;
  masks: readonly number[];
  initialRotations: readonly number[];
}

export interface CircuitStatus {
  solved: boolean;
  connected: boolean[];
  connectedCount: number;
  masks: number[];
}

export const CIRCUIT_STAGES = 300;
export const CIRCUIT_TURN_LIMIT = 1_000_000;
export const CIRCUIT_CLEAR_LIMIT = 1_000_000_000_000;

// Generator version 1. Changing the seed, neighbor order or PRNG would change saved puzzles.
const DIRECTIONS = [
  { dx: 0, dy: -1, bit: 1, opposite: 4 },
  { dx: 1, dy: 0, bit: 2, opposite: 8 },
  { dx: 0, dy: 1, bit: 4, opposite: 1 },
  { dx: -1, dy: 0, bit: 8, opposite: 2 },
] as const;
const puzzles = new Map<number, CircuitPuzzle>();

export function rotateMask(mask: number, turns: number): number {
  const rotation = ((turns % 4) + 4) % 4;
  return ((mask << rotation) | (mask >>> (4 - rotation))) & 15;
}

function neighbor(index: number, direction: typeof DIRECTIONS[number], size: number): number {
  const x = index % size + direction.dx;
  const y = Math.floor(index / size) + direction.dy;
  return x < 0 || y < 0 || x >= size || y >= size ? -1 : y * size + x;
}

function statusForMasks(masks: number[], size: number): CircuitStatus {
  const connected = Array<boolean>(masks.length).fill(false);
  const queue = [0];
  connected[0] = true;
  let unmatched = false;
  for (let index = 0; index < masks.length; index += 1) {
    for (const direction of DIRECTIONS) {
      if (!(masks[index] & direction.bit)) continue;
      const next = neighbor(index, direction, size);
      if (next < 0 || !(masks[next] & direction.opposite)) unmatched = true;
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    for (const direction of DIRECTIONS) {
      if (!(masks[index] & direction.bit)) continue;
      const next = neighbor(index, direction, size);
      if (next < 0 || connected[next] || !(masks[next] & direction.opposite)) continue;
      connected[next] = true;
      queue.push(next);
    }
  }
  return { solved: !unmatched && queue.length === masks.length, connected, connectedCount: queue.length, masks };
}

export function puzzleForStage(stage: number): CircuitPuzzle {
  if (!Number.isInteger(stage) || stage < 1 || stage > CIRCUIT_STAGES) throw new Error('회로 단계가 올바르지 않습니다.');
  const cached = puzzles.get(stage);
  if (cached) return cached;
  const size = stage <= 150 ? 4 : 5;
  let seed = (0x9e3779b9 ^ Math.imul(stage, 0x045d9f3b)) >>> 0;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const masks = Array<number>(size * size).fill(0);
  const visited = Array<boolean>(masks.length).fill(false);
  const stack = [0];
  visited[0] = true;
  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const available = DIRECTIONS.filter((direction) => {
      const next = neighbor(current, direction, size);
      return next >= 0 && !visited[next];
    });
    if (available.length === 0) { stack.pop(); continue; }
    const direction = available[random() % available.length];
    const next = neighbor(current, direction, size);
    masks[current] |= direction.bit;
    masks[next] |= direction.opposite;
    visited[next] = true;
    stack.push(next);
  }
  const initialRotations = masks.map(() => random() % 4);
  if (statusForMasks(masks.map((mask, index) => rotateMask(mask, initialRotations[index])), size).solved) {
    initialRotations[0] = (initialRotations[0] + 1) % 4;
  }
  const puzzle = Object.freeze({ stage, size, masks: Object.freeze(masks), initialRotations: Object.freeze(initialRotations) });
  puzzles.set(stage, puzzle);
  return puzzle;
}

export function initialCircuit(): CircuitState {
  return { stage: 1, rotations: [...puzzleForStage(1).initialRotations], turns: 0, records: Array(300).fill(0), totalClears: 0 };
}

export function circuitStatus(state: Pick<CircuitState, 'stage' | 'rotations'>): CircuitStatus {
  const puzzle = puzzleForStage(state.stage);
  return statusForMasks(puzzle.masks.map((mask, index) => rotateMask(mask, state.rotations[index])), puzzle.size);
}

export function completedCircuits(state: Pick<CircuitState, 'records'>): number {
  const firstIncomplete = state.records.indexOf(0);
  return firstIncomplete === -1 ? CIRCUIT_STAGES : firstIncomplete;
}

function startStage(state: CircuitState, stage: number): CircuitState {
  return { ...state, stage, rotations: [...puzzleForStage(stage).initialRotations], turns: 0 };
}

export function reduceCircuit(state: CircuitState, action: CircuitAction): CircuitState {
  if (action.type === 'retry') {
    const initial = puzzleForStage(state.stage).initialRotations;
    if (state.turns === 0 && state.rotations.every((rotation, index) => rotation === initial[index])) return state;
    return startStage(state, state.stage);
  }
  if (action.type === 'select') {
    if (!Number.isInteger(action.stage) || action.stage < 1 || action.stage > Math.min(CIRCUIT_STAGES, completedCircuits(state) + 1) || action.stage === state.stage) return state;
    return startStage(state, action.stage);
  }
  if (action.type === 'next') {
    if (state.stage >= CIRCUIT_STAGES || state.records[state.stage - 1] === 0 || !circuitStatus(state).solved) return state;
    return startStage(state, state.stage + 1);
  }
  if (action.type !== 'rotate' || !Number.isInteger(action.index) || action.index < 0 || action.index >= state.rotations.length
    || state.turns >= CIRCUIT_TURN_LIMIT || state.totalClears >= CIRCUIT_CLEAR_LIMIT || circuitStatus(state).solved) return state;
  const rotations = [...state.rotations];
  rotations[action.index] = (rotations[action.index] + 1) % 4;
  const next = { ...state, rotations, turns: state.turns + 1 };
  if (!circuitStatus(next).solved) return next;
  const records = [...state.records];
  records[state.stage - 1] = records[state.stage - 1] === 0 ? next.turns : Math.min(records[state.stage - 1], next.turns);
  return { ...next, records, totalClears: state.totalClears + 1 };
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function numberArray(value: unknown, length: number, maximum: number): number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error('회로 기록의 배열 길이가 올바르지 않습니다.');
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!integer(value[index], 0, maximum)) throw new Error('회로 기록의 회전 또는 완료 횟수가 올바르지 않습니다.');
    result.push(value[index]);
  }
  return result;
}

export function parseCircuit(value: unknown): CircuitState {
  const keys = ['stage', 'rotations', 'turns', 'records', 'totalClears'];
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.ownKeys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('회로 기록의 필드가 올바르지 않습니다.');
  const data = value as Record<string, unknown>;
  if (!integer(data.stage, 1, CIRCUIT_STAGES) || !integer(data.turns, 0, CIRCUIT_TURN_LIMIT)
    || !integer(data.totalClears, 0, CIRCUIT_CLEAR_LIMIT)) throw new Error('회로 기록의 단계 또는 횟수가 올바르지 않습니다.');
  const rotations = numberArray(data.rotations, data.stage <= 150 ? 16 : 25, 3);
  const records = numberArray(data.records, CIRCUIT_STAGES, CIRCUIT_TURN_LIMIT);
  const completed = completedCircuits({ records });
  if (records.slice(completed).some((record) => record > 0) || data.stage > Math.min(CIRCUIT_STAGES, completed + 1)
    || data.totalClears < completed) throw new Error('회로 기록의 완료 순서 또는 누적 횟수가 올바르지 않습니다.');
  return { stage: data.stage, rotations, turns: data.turns, records, totalClears: data.totalClears };
}
