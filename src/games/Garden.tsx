import { useEffect, useRef, useState } from 'react';
import {
  expansionCost, gardenNow, growthDuration, harvestsToUnlock, isPlantReady, isSpeciesUnlocked,
  PLANTS, type GardenAction, type GardenState,
} from './garden';
import { Sprite } from './Art';
import './garden.css';

interface GardenProps {
  state: GardenState;
  onAction: (action: GardenAction) => void;
  disabled: boolean;
}

const numbers = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
// The atlas represents plant families; precise species names remain on controls.
const matureFrames = [8, 4, 5, 6, 7, 7, 11, 6, 11, 7, 7, 9, 9, 6, 6, 9, 14, 10, 10, 8, 12, 15, 9, 15, 15, 13, 13, 13, 11, 15, 15, 15, 15, 6, 7, 13, 6, 6, 15, 6];

interface GardenFeedback {
  index: number;
  type: 'water' | 'harvest';
  reward: number;
}

export function confirmedGardenFeedback(before: GardenState, after: GardenState, action: GardenAction): GardenFeedback | null {
  if (before === after || (action.type !== 'water' && action.type !== 'harvest')) return null;
  const planted = before.pots[action.index];
  const current = after.pots[action.index];
  if (!planted) return null;
  if (action.type === 'water') {
    return !planted.watered && current?.watered === true && current.species === planted.species && current.plantedAt === planted.plantedAt
      ? { index: action.index, type: 'water', reward: 0 } : null;
  }
  return current === null && after.harvested[planted.species] === before.harvested[planted.species] + 1
    && after.totalHarvests === before.totalHarvests + 1
    ? { index: action.index, type: 'harvest', reward: Math.max(0, after.coins - before.coins) } : null;
}

function remainingLabel(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}시간 ${Math.floor(seconds % 3_600 / 60)}분`;
  return `${Math.floor(seconds / 86_400)}일 ${Math.floor(seconds % 86_400 / 3_600)}시간`;
}

export default function Garden({ state, onAction, disabled }: GardenProps) {
  const [selectedSpecies, setSelectedSpecies] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [catalogPage, setCatalogPage] = useState(0);
  const [showCare, setShowCare] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<(GardenFeedback & { sequence: number }) | null>(null);
  const pendingAction = useRef<{ before: GardenState; action: GardenAction } | null>(null);
  useEffect(() => {
    const pending = pendingAction.current;
    if (!pending || state === pending.before) return;
    pendingAction.current = null;
    const confirmed = confirmedGardenFeedback(pending.before, state, pending.action);
    if (confirmed) setFeedback((previous) => ({ ...confirmed, sequence: (previous?.sequence ?? 0) + 1 }));
  }, [state]);
  useEffect(() => {
    let timer: number | undefined;
    function syncClock() {
      window.clearInterval(timer);
      if (document.hidden) return;
      setClock(Date.now());
      timer = window.setInterval(() => setClock(Date.now()), 1_000);
    }
    syncClock();
    document.addEventListener('visibilitychange', syncClock);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);
  useEffect(() => {
    if (feedback === null) return;
    const timer = window.setTimeout(() => setFeedback(null), 900);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const now = gardenNow(state, clock);
  const species = isSpeciesUnlocked(state, selectedSpecies) ? selectedSpecies : 0;
  const unlocked = PLANTS.filter((_, index) => isSpeciesUnlocked(state, index)).length;
  const discovered = state.harvested.filter((count) => count > 0).length;
  const cost = expansionCost(state);
  const canExpand = state.pots.length < 12;
  const harvestLimitReached = state.totalHarvests >= 1_000_000_000_000;
  const nextSpecies = unlocked < PLANTS.length ? unlocked : null;
  const pageStart = catalogPage * 8;

  return (
    <section className="garden" aria-label="작은 정원">
      <h1 className="sr-only">작은 정원</h1>
      <div className={`garden-pots garden-pots-${Math.ceil(state.pots.length / 3)}`} aria-label={`화분 ${state.pots.length}개`}>
        {state.pots.map((plant, index) => {
          const ready = plant !== null && isPlantReady(plant, now);
          const waiting = plant !== null && plant.watered && !ready;
          const action: GardenAction = plant === null ? { type: 'plant', index, species }
            : ready ? { type: 'harvest', index } : { type: 'water', index };
          const actionName = plant === null ? `${PLANTS[species].name} 심기` : ready ? '수확' : waiting ? '성장 중' : '물주기';
          const remaining = plant === null || ready ? '' : remainingLabel(growthDuration(plant) - (now - plant.plantedAt));
          const elapsedFraction = plant === null ? 0 : Math.max(0, now - plant.plantedAt) / growthDuration(plant);
          const frame = plant === null ? 0 : ready ? matureFrames[plant.species] : elapsedFraction < 0.25 ? 1 : elapsedFraction < 0.6 ? 2 : 3;
          const name = `${index + 1}번 화분 ${plant === null ? actionName : `${PLANTS[plant.species].name} ${actionName}`}${remaining ? `, ${remaining} 남음` : ''}`;
          const reward = plant === null ? 0 : Math.min(15 + plant.species * 5, 1_000_000_000_000 - state.coins);
          return (
            <button type="button" key={index} className={`garden-pot${ready ? ' garden-pot-ready' : ''}${plant !== null && frame > 1 ? ' garden-pot-alive' : ''}`}
              disabled={disabled || waiting || (ready && harvestLimitReached)} onClick={() => {
                pendingAction.current = action.type === 'water' || action.type === 'harvest' ? { before: state, action } : null;
                onAction(action);
              }} aria-label={name} title={`${name}${ready ? ` · +${reward} 코인` : ''}`}>
              <Sprite atlas="garden" frame={frame} className="garden-pot-art" />
              {plant !== null && !plant.watered && !ready && <Sprite atlas="charms" frame={13} className="garden-water-mark" />}
              {feedback?.index === index && <span key={feedback.sequence} className={`garden-feedback garden-feedback-${feedback.type}`} aria-hidden="true">
                {feedback.type === 'harvest' ? `+${feedback.reward}` : <Sprite atlas="charms" frame={13} className="garden-water-feedback-art" />}
              </span>}
            </button>
          );
        })}
      </div>
      <details className="garden-details" onToggle={(event) => {
        const open = event.currentTarget.open;
        setToolsOpen(open);
        if (open) { setCatalogPage(Math.floor(species / 8)); setShowCare(false); }
      }}>
        <summary aria-label="정원 도구와 도감" title={toolsOpen ? '화분으로 돌아가기' : '정원 도구와 도감'}><Sprite atlas="charms" frame={toolsOpen ? 15 : 8} className="garden-menu-art" /></summary>
        <div className="garden-details-body">
          <div className="garden-tools">
            <Sprite atlas="charms" frame={12} className="garden-seed-art" />
            <label className="sr-only" htmlFor="garden-seed">심을 씨앗</label>
            <select id="garden-seed" value={species} disabled={disabled} onChange={(event) => {
              const selected = Number(event.target.value);
              setSelectedSpecies(selected);
              setCatalogPage(Math.floor(selected / 8));
            }} title={`${PLANTS[species].name} · ${remainingLabel(PLANTS[species].growMs)} · 수확 ${15 + species * 5} 코인`}>
              {PLANTS.map((plant, index) => isSpeciesUnlocked(state, index) && <option key={plant.name} value={index}>{plant.name}</option>)}
            </select>
            <button type="button" disabled={disabled || !canExpand || state.coins < cost} onClick={() => onAction({ type: 'expand' })}
              aria-label={canExpand ? `화분 늘리기 ${cost.toLocaleString('ko-KR')} 코인` : '화분 확장 완료 12개'}
              title={canExpand ? `화분 늘리기 ${cost.toLocaleString('ko-KR')} 코인` : '화분 확장 완료 12개'}>
              <Sprite atlas="charms" frame={14} className="garden-expand-art" />
            </button>
          </div>
          <p className="garden-catalog-stats">도감 {discovered}/40 · <span title={`${state.coins.toLocaleString('ko-KR')} 코인`}>{numbers.format(state.coins)} 코인</span> · 화분 {state.pots.length}/12</p>
          <p className="garden-next-seed" title={`씨앗 ${unlocked}/40종 · 총 수확 ${state.totalHarvests.toLocaleString('ko-KR')}회`}>
            {harvestLimitReached ? '수확 기록 한도에 도달했습니다.' : nextSpecies === null ? '모든 씨앗 해금' : `다음 ${PLANTS[nextSpecies].name} · ${PLANTS[nextSpecies - 1].name} ${Math.min(harvestsToUnlock(nextSpecies), state.harvested[nextSpecies - 1])}/${harvestsToUnlock(nextSpecies)}회`}
          </p>
          {showCare ? <div className="garden-care" id="garden-catalog-content">
            <p>화분을 눌러 심고, 물뿌리개가 보이면 물을 주세요. 성장 시간이 25% 줄어요.</p>
            <p>다 자라면 눌러 수확하세요. 앱을 닫아도 자라며 시들지 않아요.</p>
            <p>다음 씨앗까지 필요한 수확은 도감 위에서 확인할 수 있어요.</p>
          </div> : <div className="garden-collection" id="garden-catalog-content" role="group" aria-label="씨앗 그림 도감">
            {PLANTS.slice(pageStart, pageStart + 8).map((plant, offset) => {
              const index = pageStart + offset;
              const available = isSpeciesUnlocked(state, index);
              const description = available
                ? `${plant.name} · ${remainingLabel(plant.growMs)} · 수확 ${state.harvested[index].toLocaleString('ko-KR')}회`
                : `${PLANTS[index - 1].name} ${Math.min(harvestsToUnlock(index), state.harvested[index - 1])}/${harvestsToUnlock(index)}회 수확하면 열려요`;
              return <button type="button" key={plant.name} className={`garden-seed-choice${available ? '' : ' garden-locked'}`}
                disabled={disabled || !available} aria-label={available ? `${plant.name} 씨앗 선택` : `${plant.name} 씨앗, 잠김`}
                aria-pressed={species === index} title={description} onClick={() => setSelectedSpecies(index)}>
                <Sprite atlas="garden" frame={matureFrames[index]} className="garden-collection-art" />
                <span>{plant.name}</span>
              </button>;
            })}
          </div>}
          <div className="garden-catalog-pages">
            <button type="button" aria-label="이전 도감 쪽" disabled={catalogPage === 0 || showCare} onClick={() => setCatalogPage(catalogPage - 1)}>이전</button>
            <span aria-live="polite">{catalogPage + 1} / 5</span>
            <button type="button" aria-label="다음 도감 쪽" disabled={catalogPage === 4 || showCare} onClick={() => setCatalogPage(catalogPage + 1)}>다음</button>
          </div>
          <button type="button" className="garden-care-toggle" aria-expanded={showCare} aria-controls="garden-catalog-content" onClick={() => setShowCare(!showCare)}>{showCare ? '그림 도감으로' : '가꾸는 법'}</button>
        </div>
      </details>
    </section>
  );
}
