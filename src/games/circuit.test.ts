import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { circuitStatus, initialCircuit, parseCircuit, puzzleForStage, reduceCircuit, rotateMask, type CircuitState } from './circuit';
import Circuit from './Circuit.tsx';

function stateAt(stage = 1): CircuitState {
  const puzzle = puzzleForStage(stage);
  return { stage, rotations: [...puzzle.initialRotations], turns: 0, records: Array.from({ length: 300 }, (_, index) => index < stage - 1 ? 30 : 0), totalClears: stage - 1 };
}

function solve(state: CircuitState): CircuitState {
  let next = state;
  for (let index = 0; index < next.rotations.length; index += 1) {
    for (let count = 0; count < 4 && next.rotations[index] !== 0 && !circuitStatus(next).solved; count += 1) {
      next = reduceCircuit(next, { type: 'rotate', index });
    }
  }
  return next;
}

describe('circuit generation version 1', () => {
  it('keeps the stage-one migration fixture stable across releases', () => {
    expect(initialCircuit().rotations).toEqual([3, 2, 0, 2, 0, 2, 1, 1, 3, 2, 1, 1, 3, 1, 3, 0]);
    expect(puzzleForStage(1).masks).toEqual([4, 2, 10, 12, 5, 6, 10, 13, 3, 9, 4, 5, 2, 10, 11, 9]);
  });
  it('rotates north/east/south/west ports clockwise with wrapping', () => {
    expect(rotateMask(1, 1)).toBe(2);
    expect(rotateMask(2, 1)).toBe(4);
    expect(rotateMask(4, 1)).toBe(8);
    expect(rotateMask(8, 1)).toBe(1);
    expect(rotateMask(3, 3)).toBe(9);
    expect(rotateMask(5, 2)).toBe(5);
    expect(rotateMask(7, 4)).toBe(7);
  });

  it('starts with an independent scrambled 4 by 4 board and empty records', () => {
    const state = initialCircuit();
    expect(state).toEqual({ stage: 1, rotations: expect.any(Array), turns: 0, records: Array(300).fill(0), totalClears: 0 });
    expect(state.rotations).toHaveLength(16);
    expect(circuitStatus(state).solved).toBe(false);
    state.rotations[0] = 99;
    state.records[0] = 1;
    expect(initialCircuit().rotations[0]).toBeLessThan(4);
    expect(initialCircuit().records[0]).toBe(0);
  });

  it('generates 300 deterministic unsolved puzzles whose base masks form connected trees', () => {
    for (let stage = 1; stage <= 300; stage += 1) {
      const puzzle = puzzleForStage(stage);
      const length = stage <= 150 ? 16 : 25;
      expect(puzzle.size).toBe(stage <= 150 ? 4 : 5);
      expect(puzzle.masks).toHaveLength(length);
      expect(puzzle.initialRotations).toHaveLength(length);
      expect(puzzleForStage(stage)).toEqual(puzzle);
      expect(puzzle.initialRotations.every((value) => Number.isInteger(value) && value >= 0 && value <= 3)).toBe(true);
      expect(circuitStatus({ stage, rotations: [...puzzle.initialRotations] }).solved).toBe(false);
      const solution = circuitStatus({ stage, rotations: Array(length).fill(0) });
      expect(solution.solved).toBe(true);
      expect(solution.connectedCount).toBe(length);
      const ports = puzzle.masks.reduce((sum, mask) => sum + [1, 2, 4, 8].filter((bit) => (mask & bit) !== 0).length, 0);
      expect(ports).toBe(2 * (length - 1));
    }
  });

  it.each([0, 301, 1.5, Number.NaN])('rejects invalid stage %s', (stage) => {
    expect(() => puzzleForStage(stage)).toThrow(/[가-힣]/);
  });
});

describe('circuit controls', () => {
  it('labels every rotation control with its position and electric connection state', () => {
    const html = renderToStaticMarkup(createElement(Circuit, { state: initialCircuit(), disabled: false, onAction: () => {} }));
    expect(html.match(/aria-label="회로 \d+번, [^"]*시계 방향으로 회전"/g)).toHaveLength(16);
    expect(html).toContain('다시 시작');
    expect(html).toContain('다음 회로');
  });

  it('locks all actions during a save/recovery lock and locks solved tiles', () => {
    const html = renderToStaticMarkup(createElement(Circuit, { state: initialCircuit(), disabled: true, onAction: () => {} }));
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(18);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
    const finished = renderToStaticMarkup(createElement(Circuit, { state: solve(initialCircuit()), disabled: false, onAction: () => {} }));
    const tiles = finished.match(/<button\b[^>]*class="circuit-tile[^>]*>/g) ?? [];
    expect(tiles).toHaveLength(16);
    expect(tiles.every((button) => button.includes('disabled=""'))).toBe(true);
    expect(finished).toContain('모든 전구가 켜졌어요');
  });
});

describe('circuit play', () => {
  it('rotates one tile, counts one turn, and preserves the original state', () => {
    const state = initialCircuit();
    const before = state.rotations[0];
    const next = reduceCircuit(state, { type: 'rotate', index: 0 });
    expect(next).not.toBe(state);
    expect(next.rotations[0]).toBe((before + 1) % 4);
    expect(next.turns).toBe(1);
    expect(state.rotations[0]).toBe(before);
    expect(state.turns).toBe(0);
  });

  it.each([-1, 16, 0.2, Number.NaN])('ignores invalid rotation index %s', (index) => {
    const state = initialCircuit();
    expect(reduceCircuit(state, { type: 'rotate', index })).toBe(state);
  });

  it('records a solved puzzle once and unlocks the next stage without automatically advancing', () => {
    const state = solve(initialCircuit());
    expect(circuitStatus(state).solved).toBe(true);
    expect(state.stage).toBe(1);
    expect(state.records[0]).toBe(state.turns);
    expect(state.records[0]).toBeGreaterThan(0);
    expect(state.totalClears).toBe(1);
    expect(reduceCircuit(state, { type: 'rotate', index: 0 })).toBe(state);
    const next = reduceCircuit(state, { type: 'next' });
    expect(next.stage).toBe(2);
    expect(next.turns).toBe(0);
    expect(circuitStatus(next).solved).toBe(false);
    expect(next.records).toEqual(state.records);
  });

  it('retries the same deterministic scramble while retaining completion records', () => {
    const initial = initialCircuit();
    expect(reduceCircuit(initial, { type: 'retry' })).toBe(initial);
    const solved = solve(initial);
    const retry = reduceCircuit(solved, { type: 'retry' });
    expect(retry.rotations).toEqual(initial.rotations);
    expect(retry.turns).toBe(0);
    expect(retry.records).toEqual(solved.records);
    expect(retry.totalClears).toBe(1);
    const repeated = solve(retry);
    expect(repeated.totalClears).toBe(2);
    expect(repeated.records[0]).toBe(solved.records[0]);
  });

  it('keeps the better record when a completed stage is replayed with extra turns', () => {
    const first = solve(initialCircuit());
    const retry = reduceCircuit(first, { type: 'retry' });
    const slower = solve({ ...retry, turns: 100 });
    expect(slower.turns).toBeGreaterThan(first.turns);
    expect(slower.records[0]).toBe(first.records[0]);
    expect(slower.totalClears).toBe(2);
  });

  it('selects completed or newly unlocked stages and rejects locked stages', () => {
    const first = solve(initialCircuit());
    const second = reduceCircuit(first, { type: 'next' });
    const replay = reduceCircuit(second, { type: 'select', stage: 1 });
    expect(replay.stage).toBe(1);
    expect(replay.turns).toBe(0);
    expect(circuitStatus(replay).solved).toBe(false);
    expect(reduceCircuit(replay, { type: 'select', stage: 2 }).stage).toBe(2);
    expect(reduceCircuit(replay, { type: 'select', stage: 3 })).toBe(replay);
    expect(reduceCircuit(replay, { type: 'select', stage: 1 })).toBe(replay);
    expect(reduceCircuit(replay, { type: 'next' })).toBe(replay);
  });

  it('stops at turn/count/stage limits and permits retrying a turn-limited puzzle', () => {
    const limited = { ...initialCircuit(), turns: 1_000_000 };
    expect(reduceCircuit(limited, { type: 'rotate', index: 0 })).toBe(limited);
    expect(reduceCircuit(limited, { type: 'retry' }).turns).toBe(0);
    const full = { ...initialCircuit(), totalClears: 1_000_000_000_000 };
    expect(reduceCircuit(full, { type: 'rotate', index: 0 })).toBe(full);
    const final = solve(stateAt(300));
    expect(circuitStatus(final).solved).toBe(true);
    expect(final.records[299]).toBeGreaterThan(0);
    expect(reduceCircuit(final, { type: 'next' })).toBe(final);
  });

  it('allows every stage to be solved and preserves valid saves through all 300 completions', () => {
    let state = initialCircuit();
    for (let stage = 1; stage <= 300; stage += 1) {
      state = solve(state);
      expect(state.stage).toBe(stage);
      expect(circuitStatus(state).solved).toBe(true);
      expect(state.totalClears).toBe(stage);
      expect(parseCircuit(state)).toEqual(state);
      if (stage < 300) state = reduceCircuit(state, { type: 'next' });
    }
    expect(state.records.every((record) => record > 0)).toBe(true);
  });
});

describe('circuit save validation', () => {
  it('clones both arrays without modifying a valid record', () => {
    const state = initialCircuit();
    const parsed = parseCircuit(state);
    expect(parsed).toEqual(state);
    expect(parsed).not.toBe(state);
    expect(parsed.rotations).not.toBe(state.rotations);
    expect(parsed.records).not.toBe(state.records);
  });

  it.each([
    ['null', null], ['array', []], ['missing key', { stage: 1 }],
    ['unknown key', { stage: 1, rotations: Array(16).fill(1), turns: 0, records: Array(300).fill(0), totalClears: 0, extra: true }],
    ['zero stage', { stage: 0 }], ['future stage', { stage: 301 }], ['fractional stage', { stage: 1.5 }],
    ['negative turns', { turns: -1 }], ['excess turns', { turns: 1_000_001 }], ['fractional turns', { turns: 0.5 }],
    ['negative clears', { totalClears: -1 }], ['excess clears', { totalClears: 1_000_000_000_001 }],
    ['short rotations', { rotations: Array(15).fill(0) }], ['long rotations', { rotations: Array(25).fill(0) }],
    ['sparse rotations', { rotations: Array(16) }], ['negative rotation', { rotations: [-1, ...Array(15).fill(0)] }],
    ['large rotation', { rotations: [4, ...Array(15).fill(0)] }], ['fractional rotation', { rotations: [0.5, ...Array(15).fill(0)] }],
    ['short records', { records: Array(299).fill(0) }], ['sparse records', { records: Array(300) }],
    ['negative record', { records: [-1, ...Array(299).fill(0)] }], ['excess record', { records: [1_000_001, ...Array(299).fill(0)] }],
    ['record gap', { records: [1, 0, 1, ...Array(297).fill(0)], totalClears: 2 }],
    ['insufficient total', { records: [1, ...Array(299).fill(0)], totalClears: 0 }],
    ['locked stage', { stage: 2 }],
  ])('rejects %s with a Korean error', (label, changes) => {
    const value = label === 'null' || label === 'array' || label === 'missing key' ? changes : { ...initialCircuit(), ...changes };
    expect(() => parseCircuit(value)).toThrow(/[가-힣]/);
  });

  it('accepts 5 by 5 boards and exact numeric limits', () => {
    const state = { ...stateAt(300), turns: 1_000_000, totalClears: 1_000_000_000_000, records: Array(300).fill(1_000_000) };
    expect(parseCircuit(state)).toEqual(state);
  });
});
