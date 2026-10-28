import {
  FISHING_GOAL, canUpgradeRod, initialFishing, isFishingComplete,
  isLocationUnlocked, reduceFishing, type FishingAction, type FishingState,
} from '../src/games/fishing.ts';

export interface FishingSession {
  day: number;
  catches: number;
  misses: number;
  inputSeconds: number;
  waitingSeconds: number;
  unusedSeconds: number;
  elapsedSeconds: number;
}

export interface FishingModelOptions {
  sessionMinutes?: number;
  seed?: number;
  missesPer20?: number;
  maxDays?: number;
}

export interface FishingModel {
  state: FishingState;
  days: number;
  sessionMinutes: number;
  missesPer20: number;
  inputSeconds: number;
  waitingSeconds: number;
  unusedSeconds: number;
  sessions: FishingSession[];
}

/**
 * Explicit routine, not observed human play: one visit per day; 1s cast input,
 * 1s hook input and 1s reaction after the saved bite time. Two of every twenty
 * casts are deliberately late by default (10% misses), rather than a claim
 * about real players. Reflective menu/selection time is not separately modeled.
 *
 * The player finishes an area's collection before moving to the earliest
 * unlocked incomplete area. Bait 2 is free. Affordable rod upgrades are taken
 * between casts. A new cast starts only with 36s remaining, so every saved cast
 * is resolved within its visit. No catches or resources are earned offline.
 */
export function simulateFishing(options: FishingModelOptions = {}): FishingModel {
  const { sessionMinutes = 12.5, seed = 0x6d2b79f5, missesPer20 = 2, maxDays = 365 } = options;
  const budgetMs = sessionMinutes * 60_000;
  if (!Number.isSafeInteger(budgetMs) || budgetMs < 37_000 || budgetMs >= 86_400_000
    || !Number.isSafeInteger(seed) || seed < 1 || seed > 4_294_967_295
    || !Number.isInteger(missesPer20) || missesPer20 < 0 || missesPer20 >= 20
    || !Number.isInteger(maxDays) || maxDays < 1) throw new Error('낚시 모델의 시간·시드·실패 가정이 올바르지 않습니다.');

  let state = { ...initialFishing(), rng: seed };
  const sessions: FishingSession[] = [];
  for (let day = 1; day <= maxDays; day += 1) {
    const start = (day - 1) * 86_400_000;
    const end = start + budgetMs;
    let now = start;
    let inputMs = 0;
    let waitingMs = 0;
    let unusedMs = 0;
    const caughtBefore = state.totalCaught;
    const missedBefore = state.misses;

    function perform(action: FishingAction) {
      if (now + 1_000 > end) throw new Error('낚시 모델이 세션 입력 예산을 넘었습니다.');
      const next = reduceFishing(state, action, now);
      if (next === state) throw new Error(`낚시 모델의 ${action.type} 행동이 진행되지 않았습니다.`);
      state = next;
      now += 1_000;
      inputMs += 1_000;
    }

    while (now + 37_000 <= end && !isFishingComplete(state)) {
      if (canUpgradeRod(state)) perform({ type: 'upgrade' });
      if (isFishingComplete(state)) break;
      if (state.bait !== 2) perform({ type: 'bait', index: 2 });
      const incompleteArea = [0, 1, 2, 3, 4, 5].find((area) =>
        isLocationUnlocked(state, area) && state.caught.slice(area * 6, area * 6 + 6).some((count) => count === 0));
      // After collecting all open areas, continue there until the next one opens.
      const area = incompleteArea ?? state.location;
      if (area !== state.location) perform({ type: 'location', index: area });
      if (now + 36_000 > end) break;
      perform({ type: 'cast' });
      const current = state.cast;
      if (current === null) throw new Error('낚시 모델에 저장된 캐스트가 없습니다.');
      const miss = (state.casts - 1) % 20 < missesPer20;
      const target = miss ? current.expiresAt : current.biteAt + 1_000;
      waitingMs += target - now;
      now = target;
      perform({ type: 'hook' });
      if (canUpgradeRod(state) && now + 1_000 <= end) perform({ type: 'upgrade' });
    }
    if (state.cast !== null) throw new Error('낚시 모델이 진행 중인 캐스트를 남겼습니다.');
    if (!isFishingComplete(state)) { unusedMs = end - now; now = end; }
    sessions.push({
      day, catches: state.totalCaught - caughtBefore, misses: state.misses - missedBefore,
      inputSeconds: inputMs / 1_000, waitingSeconds: waitingMs / 1_000,
      unusedSeconds: unusedMs / 1_000, elapsedSeconds: (now - start) / 1_000,
    });
    if (isFishingComplete(state)) return {
      state, days: day, sessionMinutes, missesPer20, sessions,
      inputSeconds: sessions.reduce((sum, visit) => sum + visit.inputSeconds, 0),
      waitingSeconds: sessions.reduce((sum, visit) => sum + visit.waitingSeconds, 0),
      unusedSeconds: sessions.reduce((sum, visit) => sum + visit.unusedSeconds, 0),
    };
  }
  throw new Error(`낚시 모델이 ${maxDays}일 안에 ${FISHING_GOAL}마리·36종·낚싯대8 목표에 도달하지 못했습니다.`);
}
