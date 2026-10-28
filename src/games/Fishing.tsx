import { useEffect, useRef, useState } from 'react';
import { FISH, FISHING_COUNT_LIMIT, fishingNow, fishingSaleValue, hasBait, BAIT_PACK_SIZE, type FishingAction, type FishingState } from './fishing';
import FishingScene from './FishingScene';
import FishingTools, {type FishingToolsHandle} from './FishingTools';
import './fishing.css';

interface FishingProps {
  state: FishingState;
  disabled: boolean;
  onAction: (action: FishingAction) => void;
}

export interface FishingFeedback {
  type: 'catch' | 'miss' | 'upgrade' | 'sell' | 'purchase';
  species: number | null;
  reward: number;
  discovered: boolean;
}

export function confirmedFishingFeedback(before: FishingState, after: FishingState, action: FishingAction): FishingFeedback | null {
  if (before === after) return null;
  if (action.type === 'hook' && before.cast && after.totalCaught === before.totalCaught + 1
    && after.caught[before.cast.species] === before.caught[before.cast.species] + 1 && after.cast === null) {
    return { type: 'catch', species: before.cast.species, reward: Math.max(0, fishingSaleValue(after) - fishingSaleValue(before)), discovered: before.caught[before.cast.species] === 0 };
  }
  if ((action.type === 'hook' || action.type === 'cast') && after.misses === before.misses + 1) {
    return { type: 'miss', species: null, reward: 0, discovered: false };
  }
  if (action.type === 'sell' && after.coins > before.coins && after.inventory.every((count) => count === 0)) return { type: 'sell', species: null, reward: after.coins - before.coins, discovered: false };
  if (action.type === 'buy-bait' && after.coins < before.coins && after.baitStock[action.index - 1] === before.baitStock[action.index - 1] + BAIT_PACK_SIZE) return { type: 'purchase', species: null, reward: before.coins - after.coins, discovered: false };
  return action.type === 'upgrade' && after.rod === before.rod + 1
    ? { type: 'upgrade', species: null, reward: 0, discovered: false } : null;
}

const number = new Intl.NumberFormat('ko-KR');

export default function Fishing({ state, disabled, onAction }: FishingProps) {
  const [clock, setClock] = useState(() => Date.now());
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<FishingToolsHandle>(null);
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
  const castLimit = state.casts >= FISHING_COUNT_LIMIT;
  const seconds = state.cast === null ? 0 : Math.max(0, Math.ceil((state.cast.biteAt - now) / 1_000));
  const buttonLabel = state.cast === null ? '낚싯대 던지기' : expired ? '다시 낚싯대 던지기'
    : biting ? '낚싯줄 당기기, 입질 중' : '낚싯줄 당기기, 아직 입질을 기다리는 중';
  const status = state.cast === null ? !hasBait(state) ? '미끼 없음 · 도구에서 구매 또는 기본 미끼 선택'
    : feedback?.type === 'catch' ? `${feedback.discovered ? '신규 · ' : ''}${FISH[feedback.species!]} 보관 · 판매가 ${number.format(feedback.reward)}`
    : feedback?.type === 'miss' ? '낚시 실패 · 다시 던지기' : feedback?.type === 'upgrade' ? `낚싯대 ${state.rod}단계 강화 완료` : ''
    : expired ? '입질 종료 · 다시 던지기' : biting ? '입질 · 지금 당기세요' : `입질 대기 · 약 ${seconds}초`;
  const scene = state.cast !== null && !expired ? biting ? 'bite' : 'waiting' : feedback?.type === 'catch' ? 'catch' : 'idle';

  return <section className={`fishing${biting ? ' fishing-biting' : ''}${toolsOpen ? ' fishing-tools-open' : ''}`} aria-label="작은 낚시">
    <h1 className="sr-only">작은 낚시</h1>
    <FishingScene state={state} scene={scene} status={status} buttonLabel={buttonLabel}
      disabled={disabled || (castLimit && (state.cast === null || expired)) || (state.cast === null && !hasBait(state))}
      urgent={expired || (state.cast === null && !hasBait(state))} feedback={feedback}
      onFish={() => act({type:state.cast === null || expired ? 'cast' : 'hook'})}
      onCollection={species => toolsRef.current?.openCollection(species)}/>
    <FishingTools ref={toolsRef} state={state} disabled={disabled} status={status} biting={biting} expired={expired}
      feedback={feedback} onAction={act} onOpenChange={setToolsOpen}/>
  </section>;
}
