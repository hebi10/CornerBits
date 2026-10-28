import { describe, expect, it } from 'vitest';
import { simulateSword, simulateSwordSeeds } from '../../scripts/sword-model.ts';
import { parseSword } from './sword';

describe('sword progression model', () => {
  it('finishes with consistent persisted counts across 100 deterministic random seeds', () => {
    const report = simulateSwordSeeds();
    expect(report.samples).toHaveLength(100);
    for (const sample of report.samples) {
      expect(sample.state.level).toBe(60);
      expect(parseSword(sample.state)).toEqual(sample.state);
      expect(sample.actions.enchant + sample.actions.safe).toBe(sample.state.attempts);
      expect(sample.actions.polish).toBe(sample.state.totalPolishes);
      expect(sample.inputSeconds + sample.cooldownSeconds).toBeCloseTo(sample.elapsedSeconds);
      expect(sample.cooldownSeconds).toBeGreaterThan(sample.inputSeconds);
    }
    // Explicit mixed strategy targets roughly 60 model days at 12.5 min/day;
    // random outcomes remain variable and are not a calendar completion promise.
    expect(report.medianSeconds / 750).toBeGreaterThan(55);
    expect(report.medianSeconds / 750).toBeLessThan(65);
    expect(report.minimumSeconds).toBeLessThan(report.medianSeconds);
    expect(report.maximumSeconds).toBeGreaterThan(report.medianSeconds);
  });

  it('repeats the same saved random sequence and separates timing skill from required inputs', () => {
    const a = simulateSword({ seed: 12345, timedEvery: 0 });
    const b = simulateSword({ seed: 12345, timedEvery: 0 });
    const skilled = simulateSword({ seed: 12345, timedEvery: 1 });
    expect(a).toEqual(b);
    expect(skilled.state.level).toBe(60);
    expect(skilled.state.attempts).toBe(a.state.attempts);
    expect(skilled.timedPolishes).toBe(skilled.actions.polish);
    expect(skilled.actions.polish).toBeLessThan(a.actions.polish);
    expect(skilled.elapsedSeconds).toBeLessThan(a.elapsedSeconds);
  });
});
