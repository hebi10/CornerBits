import { useEffect, useRef, useState } from 'react';
import {
  BAITS, BAIT_HINTS, FISH, FISHING_COUNT_LIMIT, FISHING_GOAL, LOCATION_REQUIREMENTS,
  canUpgradeRod, fishingNow, isFishingComplete, isLocationUnlocked, locationNames,
  rodUpgradeCatches, rodUpgradeCost, type FishingAction, type FishingState,
} from './fishing';
import { Sprite } from './Art';
import './fishing.css';

interface FishingProps {
  state: FishingState;
  disabled: boolean;
  onAction: (action: FishingAction) => void;
}

export interface FishingFeedback {
  type: 'catch' | 'miss' | 'upgrade';
  species: number | null;
  reward: number;
  discovered: boolean;
}

export function confirmedFishingFeedback(before: FishingState, after: FishingState, action: FishingAction): FishingFeedback | null {
  if (before === after) return null;
  if (action.type === 'hook' && before.cast && after.totalCaught === before.totalCaught + 1
    && after.caught[before.cast.species] === before.caught[before.cast.species] + 1 && after.cast === null) {
    return { type: 'catch', species: before.cast.species, reward: Math.max(0, after.coins - before.coins), discovered: before.caught[before.cast.species] === 0 };
  }
  if ((action.type === 'hook' || action.type === 'cast') && after.misses === before.misses + 1) {
    return { type: 'miss', species: null, reward: 0, discovered: false };
  }
  return action.type === 'upgrade' && after.rod === before.rod + 1
    ? { type: 'upgrade', species: null, reward: 0, discovered: false } : null;
}

const number = new Intl.NumberFormat('ko-KR');
const compact = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });

export default function Fishing({ state, disabled, onAction }: FishingProps) {
  const [clock, setClock] = useState(() => Date.now());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [feedback, setFeedback] = useState<FishingFeedback | null>(null);
  const pending = useRef<{ before: FishingState; action: FishingAction } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    function sync() {
      window.clearInterval(timer);
      if (document.hidden) return;
      setClock(Date.now());
      timer = window.setInterval(() => setClock(Date.now()), 200);
    }
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  }, []);

  useEffect(() => {
    const action = pending.current;
    if (!action || state === action.before) return;
    pending.current = null;
    const confirmed = confirmedFishingFeedback(action.before, state, action.action);
    if (confirmed) setFeedback(confirmed);
  }, [state]);

  function act(action: FishingAction) {
    if (disabled) return;
    pending.current = { before: state, action };
    if (action.type === 'cast' || action.type === 'location') setFeedback(null);
    onAction(action);
  }

  const now = fishingNow(state, clock);
  const expired = state.cast !== null && now >= state.cast.expiresAt;
  const biting = state.cast !== null && now >= state.cast.biteAt && !expired;
  const waiting = state.cast !== null && !expired && !biting;
  const castLimit = state.casts >= FISHING_COUNT_LIMIT;
  const caughtSpecies = state.caught.flatMap((count, index) => count > 0 ? [index] : []);
  const seconds = state.cast === null ? 0 : Math.max(0, Math.ceil((state.cast.biteAt - now) / 1_000));
  const buttonLabel = state.cast === null ? '낚싯대 던지기' : expired ? '다시 낚싯대 던지기'
    : biting ? '낚싯줄 당기기, 입질 중' : '낚싯줄 당기기, 아직 입질을 기다리는 중';
  const status = state.cast === null ? feedback?.type === 'catch' ? `${feedback.discovered ? '신규 어종 · ' : ''}${FISH[feedback.species!]} · +${number.format(feedback.reward)} 코인`
    : feedback?.type === 'miss' ? '낚시 실패 · 다시 던지기' : feedback?.type === 'upgrade' ? `낚싯대 ${state.rod}단계 강화 완료` : ''
    : expired ? '입질 종료 · 다시 던지기' : biting ? '입질 · 지금 당기세요' : `입질 대기 · 약 ${seconds}초`;
  const scene = state.cast !== null && !expired ? biting ? 'bite' : 'waiting' : feedback?.type === 'catch' ? 'catch' : 'idle';

  return <section className={`fishing${biting ? ' fishing-biting' : ''}`} aria-label="작은 낚시">
    <h1 className="sr-only">작은 낚시</h1>
    <div className="fishing-play">
      <span className="sr-only">{locationNames[state.location]} · {BAITS[state.bait]}</span>
      <button type="button" className="fishing-main-action" aria-label={buttonLabel}
        title={`${locationNames[state.location]} · ${BAITS[state.bait]} · ${waiting ? '찌가 움직일 때 누르세요' : buttonLabel}`}
        disabled={disabled || (castLimit && (state.cast === null || expired))}
        onClick={() => act({ type: state.cast === null || expired ? 'cast' : 'hook' })}>
        <span className="fishing-angler-scene" data-scene={scene} aria-hidden="true" />
      </button>
      <p className="fishing-status" role="status" aria-live="polite">{status}</p>
    </div>
    <details className="fishing-tools" onToggle={(event) => {
      setToolsOpen(event.currentTarget.open);
      if (event.currentTarget.open) { setPage(Math.floor(state.location * 6 / 8)); setShowHelp(false); }
    }}>
      <summary aria-label="낚시 도구와 도감" title={toolsOpen ? '낚시터로 돌아가기' : '낚시 도구와 도감'}><Sprite atlas={toolsOpen ? 'charms' : 'fishing'} frame={toolsOpen ? 15 : 14} /></summary>
      <div className="fishing-tools-body">
        <div className="fishing-selectors">
        <label className="fishing-tool-select"><Sprite atlas="fishing" frame={12} /><span className="sr-only">낚시터 고르기</span><select aria-label="낚시터 고르기" value={state.location} disabled={disabled || state.cast !== null} onChange={(event) => act({ type: 'location', index: Number(event.target.value) })}>
          {locationNames.map((name, index) => <option key={name} value={index} disabled={!isLocationUnlocked(state, index)}>{name}{isLocationUnlocked(state, index) ? '' : ` · ${number.format(LOCATION_REQUIREMENTS[index])}마리`}</option>)}
        </select></label>
        <label className="fishing-tool-select"><Sprite atlas="fishing" frame={11} /><span className="sr-only">미끼 고르기</span><select aria-label="미끼 고르기" title={BAIT_HINTS[state.bait]} value={state.bait} disabled={disabled || state.cast !== null} onChange={(event) => act({ type: 'bait', index: Number(event.target.value) })}>
          {BAITS.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </select></label>
        <button type="button" className="fishing-upgrade" aria-label={state.rod === 8 ? '낚싯대 최고 단계 8' : `낚싯대 강화 ${rodUpgradeCost(state.rod).toLocaleString('ko-KR')} 코인, 누적 ${rodUpgradeCatches(state.rod)}마리 필요`}
          title={state.rod === 8 ? '최고 단계' : `강화 · ${number.format(rodUpgradeCost(state.rod))}코인 · ${number.format(state.totalCaught)}/${number.format(rodUpgradeCatches(state.rod))}마리`}
          disabled={disabled || !canUpgradeRod(state)} onClick={() => act({ type: 'upgrade' })}><Sprite atlas="fishing" frame={15} /></button>
        </div>
        <p className="fishing-record" title={`${number.format(state.coins)} 코인`}>도감 {caughtSpecies.length}/36 · 낚싯대 {state.rod}/8 · {compact.format(state.coins)} 코인</p>
        <p className="fishing-goal" title={`누적 ${number.format(state.totalCaught)}마리 · 연속 ${state.streak}마리 · 최고 연속 ${state.bestStreak}마리`}>{isFishingComplete(state) ? '낚시 주요 목표 달성' : `수집 목표 · ${compact.format(state.totalCaught)}/${number.format(FISHING_GOAL)}마리`}</p>
        {showHelp ? <div className="fishing-help">
          <p>던진 뒤 약 18~30초 기다려요. 찌가 움직이면 5초 안에 당겨 주세요.</p>
          <p>빠르게 반응하면 코인을 더 받아요. 놓쳐도 재화는 줄지 않아요.</p>
          <p>미끼에 따라 어종 비중이 달라집니다. 지역별25번째 성공에서는 미발견 어종을 우선합니다.</p>
        </div> : <div className="fishing-collection" role="group" aria-label="물고기 그림 도감">
          {FISH.slice(page * 8, page * 8 + 8).map((name, offset) => {
            const index = page * 8 + offset;
            return <span className={`fishing-species${state.caught[index] ? '' : ' fishing-undiscovered'}`} key={name} title={`${name} · ${locationNames[Math.floor(index / 6)]} · ${number.format(state.caught[index])}마리`}>
              <Sprite atlas="fishing" frame={index % 6} /><span>{name}</span>
            </span>;
          })}
        </div>}
        <div className="fishing-pages"><button type="button" aria-label="이전 물고기 도감 쪽" disabled={page === 0 || showHelp} onClick={() => setPage(page - 1)}>이전</button><span aria-live="polite">{page + 1} / 5</span><button type="button" aria-label="다음 물고기 도감 쪽" disabled={page === 4 || showHelp} onClick={() => setPage(page + 1)}>다음</button></div>
        <button type="button" className="fishing-help-toggle" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}>{showHelp ? '물고기 그림 보기' : '낚시하는 법'}</button>
      </div>
    </details>
  </section>;
}
