import { describe, expect, it } from 'vitest';
import {
  ANCHORS, activityDuration, initialCoast, sampleCoast, settleCoast, startActivity,
  type CoastalState,
} from './model';

describe('coastal session activities', () => {
  it('starts a fresh session and locks other activities until the return finishes', () => {
    const state = initialCoast();
    expect(state).toEqual({ activity: null, startedAt: null, catches: 0, wood: 0, decoration: 0 });
    const fishing = startActivity(state, 'fish', 100);
    expect(fishing.activity).toBe('fish');
    expect(fishing.startedAt).toBe(100);
    expect(startActivity(fishing, 'gather', 200)).toBe(fishing);
    expect(startActivity(fishing, 'gather', 10_000)).toBe(fishing);
    expect(state.activity).toBeNull();
    expect(initialCoast()).not.toBe(state);
  });

  it('awards a fish once after the full return, including a late completion tick', () => {
    const fishing = startActivity(initialCoast(), 'fish', 100);
    expect(activityDuration('fish')).toBe(5_200);
    expect(settleCoast(fishing, 5_299)).toBe(fishing);
    const finished = settleCoast(fishing, 5_300);
    expect(finished).toEqual({ activity: null, startedAt: null, catches: 1, wood: 0, decoration: 0 });
    expect(settleCoast(finished, 100_000)).toBe(finished);
    expect(settleCoast(fishing, 100_000).catches).toBe(1);
    expect(fishing.catches).toBe(0);
  });

  it('connects gathering to three wood-funded decorations and stops at completion', () => {
    let state = initialCoast();
    expect(startActivity(state, 'decorate', 0)).toBe(state);
    expect(activityDuration('gather')).toBe(4_200);
    expect(activityDuration('decorate')).toBe(4_200);
    for (let decoration = 0; decoration < 3; decoration += 1) {
      const at = decoration * 10_000;
      state = settleCoast(startActivity(state, 'gather', at), at + 4_200);
      expect(state.wood).toBe(1);
      const decorating = startActivity(state, 'decorate', at + 4_500);
      expect(decorating.wood).toBe(1);
      expect(settleCoast(decorating, at + 8_699)).toBe(decorating);
      state = settleCoast(decorating, at + 8_700);
      expect(state.wood).toBe(0);
      expect(state.decoration).toBe(decoration + 1);
      expect(settleCoast(state, at + 9_000)).toBe(state);
    }
    const supplied = { ...state, wood: 1 };
    expect(startActivity(supplied, 'decorate', 40_000)).toBe(supplied);
  });

  it('walks through the central path and returns over the same points', () => {
    const fishing = startActivity(initialCoast(), 'fish', 0);
    expect(sampleCoast(fishing, 0)).toMatchObject({ ...ANCHORS.home, pose: 'walk', phase: 'outbound', progress: 0 });
    expect(sampleCoast(fishing, 600)).toMatchObject({ x: 48, y: 56, phase: 'outbound' });
    expect(sampleCoast(fishing, 1_200)).toMatchObject({ ...ANCHORS.dock, pose: 'fish', phase: 'working' });
    expect(sampleCoast(fishing, 4_000)).toMatchObject({ ...ANCHORS.dock, pose: 'walk', phase: 'inbound' });
    expect(sampleCoast(fishing, 4_600)).toMatchObject({ x: 48, y: 56, phase: 'inbound' });
    expect(sampleCoast(fishing, 5_200)).toMatchObject({ ...ANCHORS.home, pose: 'idle', frame: 0, phase: 'idle', progress: 1 });
    expect(sampleCoast(initialCoast(), 5_200)).toMatchObject({ ...ANCHORS.home, pose: 'idle', phase: 'idle', progress: 0 });
  });

  it('samples the action-specific sprite rows while keeping frame changes deterministic', () => {
    const fishing = startActivity(initialCoast(), 'fish', 0);
    expect(sampleCoast(fishing, 180).frame).toBe(1);
    expect(sampleCoast(fishing, 1_200).frame).toBe(4);
    expect(sampleCoast(fishing, 1_400).frame).toBe(5);
    expect(sampleCoast(fishing, 1_800).frame).toBe(7);
    expect(sampleCoast(fishing, 2_000).frame).toBe(4);
    const gathering = startActivity(initialCoast(), 'gather', 0);
    expect(sampleCoast(gathering, 1_200)).toMatchObject({ ...ANCHORS.beach, pose: 'gather', frame: 8 });
    const decorating = startActivity({ ...initialCoast(), wood: 1 }, 'decorate', 0);
    expect(sampleCoast(decorating, 1_200)).toMatchObject({ ...ANCHORS.house, pose: 'decorate', frame: 12 });
  });

  it('ignores invalid numbers and treats a reversed clock as zero elapsed', () => {
    const state = initialCoast();
    const fishing = startActivity(state, 'fish', 100);
    for (const now of [NaN, Infinity, -Infinity, -1]) {
      expect(startActivity(state, 'fish', now)).toBe(state);
      expect(settleCoast(fishing, now)).toBe(fishing);
      expect(sampleCoast(fishing, now)).toMatchObject({ ...ANCHORS.home, progress: 0 });
    }
    expect(settleCoast(fishing, 99)).toBe(fishing);
    expect(sampleCoast(fishing, 99)).toMatchObject({ ...ANCHORS.home, phase: 'outbound', frame: 0, progress: 0 });
    const invalidStates: CoastalState[] = [
      { ...state, catches: NaN }, { ...state, wood: Infinity },
      { ...state, decoration: -1 }, { ...state, wood: 0.5 },
      { ...fishing, startedAt: NaN },
    ];
    for (const invalid of invalidStates) {
      expect(startActivity(invalid, 'fish', 0)).toBe(invalid);
      expect(settleCoast(invalid, 10_000)).toBe(invalid);
      expect(sampleCoast(invalid, 10_000)).toMatchObject({ ...ANCHORS.home, pose: 'idle', progress: 0 });
    }
  });
});
