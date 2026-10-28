import { describe, expect, it } from 'vitest';
import { simulateFishing } from '../../scripts/fishing-model.ts';
import { isFishingComplete, parseFishing } from './fishing.ts';

describe('fishing progression model', () => {
  it.each([0x6d2b79f5, 1, 0xffffffff])('completes the journey with strict daily sessions and seed %i', (seed) => {
    const result = simulateFishing({ seed });
    expect(isFishingComplete(result.state)).toBe(true);
    expect(parseFishing(result.state)).toEqual(result.state);
    expect(result.state.cast).toBeNull();
    expect(result.state.inventory).toEqual(Array(36).fill(0));
    expect(result.state.inventoryBonus).toBe(0);
    expect(result.actions.sell).toBeGreaterThan(0);
    expect(result.actions.buyBait).toBeGreaterThan(0);
    expect(result.inputSeconds).toBe(Object.values(result.actions).reduce((sum, count) => sum + count, 0));
    expect(result.state.unlockedLocations).toBe(6);
    expect(result.state.keepsakes).toHaveLength(3);
    expect(result.days).toBeGreaterThanOrEqual(55);
    expect(result.days).toBeLessThanOrEqual(72);
    for (const session of result.sessions) {
      expect(session.elapsedSeconds).toBeLessThanOrEqual(750);
      expect(session.inputSeconds + session.waitingSeconds + session.unusedSeconds).toBeCloseTo(session.elapsedSeconds, 6);
    }
    expect(result.state.misses / result.state.casts).toBeCloseTo(0.1, 2);
  });

  it('settles even the longest upgraded hook windows inside short visits', () => {
    const result = simulateFishing({ seed: 1, sessionMinutes: 1, maxDays: 2_000 });
    expect(isFishingComplete(result.state)).toBe(true);
    expect(result.state.rod).toBe(8);
    expect(result.state.cast).toBeNull();
    expect(result.sessions.every((session) => session.elapsedSeconds <= 60)).toBe(true);
    for (const session of result.sessions) {
      expect(session.inputSeconds + session.waitingSeconds + session.unusedSeconds).toBeCloseTo(session.elapsedSeconds, 6);
    }
  });

  it('reports the time budget and increased misses without pretending they are measured play times', () => {
    const ten = simulateFishing({ sessionMinutes: 10 });
    const fifteen = simulateFishing({ sessionMinutes: 15 });
    const lessAccurate = simulateFishing({ missesPer20: 3 });
    expect(ten.days).toBeGreaterThan(fifteen.days);
    expect(ten.state.totalCaught).toBeGreaterThanOrEqual(1_500);
    expect(fifteen.state.totalCaught).toBeGreaterThanOrEqual(1_500);
    expect(lessAccurate.days).toBeGreaterThan(simulateFishing().days);
    expect(lessAccurate.state.misses / lessAccurate.state.casts).toBeCloseTo(0.15, 2);
    expect(ten.sessions.every((session) => session.elapsedSeconds <= 600)).toBe(true);
    expect(fifteen.sessions.every((session) => session.elapsedSeconds <= 900)).toBe(true);
  });

  it.each([{ seed: 0 }, { sessionMinutes: 0 }, { sessionMinutes: 1 / 100 }, { missesPer20: 20 }, { maxDays: 0 }])('rejects invalid model inputs %#', (options) => {
    expect(() => simulateFishing(options)).toThrow();
  });
});
