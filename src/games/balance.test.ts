import { describe, expect, it } from 'vitest';
import { simulateCircuit, simulateGarden, simulateMine } from '../../scripts/balance-model.ts';
import { parseCircuit } from './circuit.ts';
import { parseGarden } from './garden.ts';
import { parseMine } from './mine.ts';

describe('documented balance models', () => {
  it('finishes the mine goals through ordinary actions in about sixty model sessions', () => {
    const model = simulateMine();
    expect(parseMine(model.state)).toEqual(model.state);
    expect(model.state.depth).toBe(1_000);
    expect(model.state.pickaxe).toBe(10);
    expect(model.state.collected.every((count) => count > 0)).toBe(true);
    expect(model.state.tiles.every((hp) => hp === 0)).toBe(true);
    expect(model.estimates.find((entry) => entry.sessionMinutes === 12.5)!.days).toBeGreaterThan(55);
    expect(model.estimates.find((entry) => entry.sessionMinutes === 12.5)!.days).toBeLessThan(65);
  });

  it.each([10, 12.5, 15])('finishes the garden within strict %s minute daily sessions and separates input from waiting', (sessionMinutes) => {
    const model = simulateGarden({ sessionMinutes });
    expect(parseGarden(model.state)).toEqual(model.state);
    expect(model.state.harvested.every((count) => count > 0)).toBe(true);
    expect(model.state.unlockedSpecies).toBe(40);
    expect(model.state.pots).toHaveLength(12);
    expect(model.days).toBeGreaterThanOrEqual(sessionMinutes === 10 ? 60 : sessionMinutes === 12.5 ? 50 : 40);
    expect(model.days).toBeLessThanOrEqual(sessionMinutes === 10 ? 75 : sessionMinutes === 12.5 ? 65 : 60);
    expect(model.inputSeconds).toBeLessThan(model.waitingSeconds);
    expect(model.sessions).toHaveLength(model.days);
    for (const session of model.sessions) {
      expect(session.inputSeconds + session.waitingSeconds).toBe(session.elapsedSeconds);
      expect(session.elapsedSeconds).toBeLessThanOrEqual(sessionMinutes * 60);
      expect(session.latestActionEndSeconds).toBeLessThanOrEqual(sessionMinutes * 60);
    }
    expect(model.inputSeconds).toBe(Object.values(model.actions).reduce((sum, count) => sum + count, 0));
  });

  it('rejects an impossible garden action budget instead of advancing actions for free', () => {
    expect(() => simulateGarden({ sessionMinutes: 0 })).toThrow();
    expect(() => simulateGarden({ sessionMinutes: 0.01, actionSeconds: 1 })).toThrow();
  });

  it('solves all three hundred unchanged circuit puzzles with real rotate/next actions', () => {
    const model = simulateCircuit();
    expect(parseCircuit(model.state)).toEqual(model.state);
    expect(model.state.stage).toBe(300);
    expect(model.state.totalClears).toBe(300);
    expect(model.state.records.every((record) => record > 0)).toBe(true);
    expect(model.stages).toHaveLength(300);
    expect(model.stages.every((stage) => stage.solved && stage.rotations > 0)).toBe(true);
    expect(model.stages.filter((stage) => stage.size === 4)).toHaveLength(150);
    expect(model.stages.filter((stage) => stage.size === 5)).toHaveLength(150);
    expect(model.estimates.find((entry) => entry.sessionMinutes === 12.5)!.days).toBeGreaterThan(50);
    expect(model.estimates.find((entry) => entry.sessionMinutes === 12.5)!.days).toBeLessThan(65);
  });
});
