import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  enchantChance, enchantCost, isSwordComplete, polishPhase, polishReward, safeCost,
  POLISH_COOLDOWN, SWORD_FORMS, SWORD_MAX_TIMESTAMP, swordForm, swordNow, type SwordAction, type SwordState,
} from './sword';
import { Sprite } from './Art';
import './sword.css';

interface SwordProps {
  state: SwordState;
  disabled: boolean;
  onAction: (action: SwordAction) => void;
}

interface SwordFeedback {
  type: 'polish' | 'success' | 'failure' | 'safe';
  ore: number;
  level: number;
  shards: number;
}

/** Effects only follow the corresponding confirmed persisted state transition. */
export function confirmedSwordFeedback(before: SwordState, after: SwordState, action: SwordAction): SwordFeedback | null {
  if (before === after) return null;
  if (action.type === 'polish') {
    return after.totalPolishes === before.totalPolishes + 1 && after.ore > before.ore
      ? { type: 'polish', ore: after.ore - before.ore, level: 0, shards: 0 } : null;
  }
  if (after.attempts !== before.attempts + 1) return null;
  if (action.type === 'safe' && after.lastResult === 'safe' && after.level === before.level + 1) {
    return { type: 'safe', ore: 0, level: 1, shards: 0 };
  }
  if (action.type === 'enchant' && after.lastResult === 'success' && after.level === before.level + 1) {
    return { type: 'success', ore: 0, level: 1, shards: 0 };
  }
  return action.type === 'enchant' && after.lastResult === 'failure' && after.failures === before.failures + 1
    ? { type: 'failure', ore: 0, level: 0, shards: after.shards - before.shards } : null;
}

const number = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });

export default function Sword({ state, disabled, onAction }: SwordProps) {
  const [clock, setClock] = useState(() => Date.now());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [feedback, setFeedback] = useState<(SwordFeedback & { sequence: number }) | null>(null);
  const pendingAction = useRef<{ before: SwordState; action: SwordAction } | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    function sync() {
      window.clearInterval(timer);
      if (document.hidden) return;
      setClock(Date.now());
      timer = window.setInterval(() => setClock(Date.now()), 100);
    }
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useEffect(() => {
    const pending = pendingAction.current;
    if (!pending || state === pending.before) return;
    pendingAction.current = null;
    const confirmed = confirmedSwordFeedback(pending.before, state, pending.action);
    if (confirmed) setFeedback(previous => ({ ...confirmed, sequence: (previous?.sequence ?? 0) + 1 }));
  }, [state]);
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1_100);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const now = swordNow(state, clock);
  const complete = isSwordComplete(state);
  const frame = swordForm(state.level);
  const chance = enchantChance(state);
  const cost = enchantCost(state.level);
  const safe = safeCost(state.level);
  const remaining = Math.max(0, Math.ceil((state.nextPolishAt - now) / 1_000));
  const canPolish = !complete && remaining === 0 && now <= SWORD_MAX_TIMESTAMP - POLISH_COOLDOWN
    && state.ore < 1_000_000_000_000 && state.totalPolishes < 1_000_000_000_000;
  const attemptsFull = state.attempts >= 1_000_000_000_000;
  const canEnchant = !complete && !attemptsFull && state.ore >= cost;
  const canSafe = !complete && !attemptsFull && state.ore >= safe.ore && state.shards >= safe.shards;
  const reward = polishReward(state, now);

  function act(action: SwordAction) {
    pendingAction.current = { before: state, action };
    onAction(action);
  }

  return <section className={`sword-game${complete ? ' sword-complete' : ''}`} aria-label="검 키우기">
    <h1 className="sr-only">검 키우기</h1>
    <div className="sword-display">
      <span className="sword-level" title={`${SWORD_FORMS[frame]} · 목표 +60`}>+{state.level}</span>
      <button type="button" className="sword-object" disabled={disabled || !canPolish}
        aria-label={complete ? '검 성장 완료 +60' : remaining ? `검 연마, ${remaining}초 뒤 가능` : `검 연마, 재료 ${reward}개 얻기`}
        title={complete ? '성운검 +60 완성' : remaining ? `${remaining}초 뒤 연마 가능` : `검을 눌러 연마 · 재료 +${reward} · 표시가 홈 안에 오면 +28`}
        onClick={() => act({ type: 'polish' })}>
        <Sprite atlas="sword" frame={15} className="sword-stand" />
        <Sprite atlas="sword" frame={frame} className={`sword-blade${feedback?.type === 'success' || feedback?.type === 'safe' ? ' sword-celebrate' : ''}`} />
        {feedback && <span key={feedback.sequence} className={`sword-feedback sword-feedback-${feedback.type}`} aria-hidden="true">
          {feedback.type === 'polish' ? `+${feedback.ore}` : feedback.type === 'failure' ? `조각 +${feedback.shards}` : '+1'}
        </span>}
      </button>
      <div className="sword-polish-hint" aria-live="off">{complete ? '소원 검 완성' : remaining ? `숫돌 쉬는 중 · ${remaining}초` : reward === 28 ? '지금 연마하면 +28' : '검을 눌러 연마해 주세요'}</div>
      {!complete && <div className={`sword-timing${canPolish ? '' : ' sword-timing-rest'}`} aria-hidden="true" style={{ '--polish-phase': `${polishPhase(state, now) * 100}%` } as CSSProperties}>
        <span className="sword-timing-target" /><span className="sword-timing-marker" />
      </div>}
    </div>
    <div className="sword-actions">
      <button type="button" className="sword-tool" disabled={disabled || !canEnchant} aria-label={`일반 강화, 성공 ${chance}%, 재료 ${cost}개`}
        title={`일반 강화 ${chance}% · 재료 ${cost}개 · 실패 보정 ${state.pity}/39`} onClick={() => act({ type: 'enchant' })}>
        <Sprite atlas="sword" frame={11} />
      </button>
      <span className="sword-chance" role="status" aria-live="polite">{complete ? '+60 달성' : `${chance}% · 보정 ${state.pity}/39`}</span>
      <button type="button" className="sword-tool" disabled={disabled || !canSafe} aria-label={`안정 강화, 성공 100%, 재료 ${safe.ore}개와 조각 ${safe.shards}개`}
        title={`안정 강화 100% · 재료 ${safe.ore}개 + 조각 ${safe.shards}개`} onClick={() => act({ type: 'safe' })}>
        <Sprite atlas="sword" frame={14} />
      </button>
    </div>
    <details className="sword-details" onToggle={event => setToolsOpen(event.currentTarget.open)}>
      <summary aria-label="검 도구와 강화 기록" title={toolsOpen ? '검으로 돌아가기' : '검 도구와 강화 기록'}><Sprite atlas="charms" frame={toolsOpen ? 15 : 8} /></summary>
      <div className="sword-details-body">
        <p>재료 {number.format(state.ore)} · 조각 {number.format(state.shards)} · +{state.level}/60</p>
        <p>일반 {chance}% · 재료 {cost}<br />안정 100% · 재료 {safe.ore} + 조각 {safe.shards}</p>
        <p>실패: 검 유지·조각 +1. 39회 연속 실패 뒤 다음 일반 강화는 100%예요. 현재 {state.pity}/39회입니다.</p>
        <p>연마는10초마다 재료20개, 표시를 홈에 맞추면28개입니다. 외형은6단계마다 바뀝니다.</p>
        <div className="sword-forms" aria-label="검의 모습 도감">
          {SWORD_FORMS.map((name, index) => <span key={name} className={index <= frame ? '' : 'sword-form-locked'} title={`${name} · +${index * 6}부터`}>
            <Sprite atlas="sword" frame={index} /><small>+{index * 6}</small>
          </span>)}
        </div>
        <p>총 강화 {number.format(state.attempts)}회 · 연마 {number.format(state.totalPolishes)}회</p>
      </div>
    </details>
  </section>;
}
