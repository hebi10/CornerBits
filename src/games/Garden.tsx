import { useEffect, useState } from 'react';
import {
  expansionCost, gardenNow, growthDuration, isPlantReady, isSpeciesUnlocked,
  PLANTS, type GardenAction, type GardenState,
} from './garden';
import './garden.css';

interface GardenProps {
  state: GardenState;
  onAction: (action: GardenAction) => void;
  disabled: boolean;
}

const numbers = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });

function remainingLabel(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}시간 ${Math.floor(seconds % 3_600 / 60)}분`;
  return `${Math.floor(seconds / 86_400)}일 ${Math.floor(seconds % 86_400 / 3_600)}시간`;
}

export default function Garden({ state, onAction, disabled }: GardenProps) {
  const [selectedSpecies, setSelectedSpecies] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = gardenNow(state, clock);
  const species = isSpeciesUnlocked(state, selectedSpecies) ? selectedSpecies : 0;
  const unlocked = PLANTS.filter((_, index) => isSpeciesUnlocked(state, index)).length;
  const discovered = state.harvested.filter((count) => count > 0).length;
  const cost = expansionCost(state);
  const canExpand = state.pots.length < 12;
  const harvestLimitReached = state.totalHarvests >= 1_000_000_000_000;

  return (
    <section className="garden" aria-label="작은 정원">
      <div className="garden-heading">
        <h1>작은 정원</h1>
        <span title={`${state.coins.toLocaleString('ko-KR')} 코인`}>{numbers.format(state.coins)} 코인</span>
      </div>
      <div className="garden-tools">
        <label className="sr-only" htmlFor="garden-seed">심을 씨앗</label>
        <select id="garden-seed" value={species} disabled={disabled} onChange={(event) => setSelectedSpecies(Number(event.target.value))}>
          {PLANTS.map((plant, index) => isSpeciesUnlocked(state, index) && <option key={plant.name} value={index}>{plant.name}</option>)}
        </select>
        <button type="button" disabled={disabled || !canExpand || state.coins < cost} onClick={() => onAction({ type: 'expand' })}
          aria-label={canExpand ? `화분 늘리기 ${cost.toLocaleString('ko-KR')} 코인` : '화분 확장 완료 12개'}>
          {canExpand ? `화분 +1 · ${cost.toLocaleString('ko-KR')}` : '화분 12개 완료'}
        </button>
      </div>
      <div className="garden-pots" aria-label={`화분 ${state.pots.length}개`}>
        {state.pots.map((plant, index) => {
          const ready = plant !== null && isPlantReady(plant, now);
          const waiting = plant !== null && plant.watered && !ready;
          const action: GardenAction = plant === null ? { type: 'plant', index, species }
            : ready ? { type: 'harvest', index } : { type: 'water', index };
          const actionName = plant === null ? `${PLANTS[species].name} 심기` : ready ? '수확' : waiting ? '성장 중' : '물주기';
          const remaining = plant === null || ready ? '' : remainingLabel(growthDuration(plant) - (now - plant.plantedAt));
          return (
            <button type="button" key={index} className={`garden-pot${ready ? ' garden-pot-ready' : ''}`}
              disabled={disabled || waiting || (ready && harvestLimitReached)} onClick={() => onAction(action)}
              aria-label={`${index + 1}번 화분 ${plant === null ? actionName : `${PLANTS[plant.species].name} ${actionName}`}${remaining ? `, ${remaining} 남음` : ''}`}>
              <span className="garden-pot-name">{plant === null ? `빈 화분 ${index + 1}` : PLANTS[plant.species].name}</span>
              <span className="garden-pot-action">{plant === null ? '심기' : ready ? `수확 +${15 + plant.species * 5}` : waiting ? remaining : '물주기'}</span>
            </button>
          );
        })}
      </div>
      <details className="garden-details">
        <summary>도감 {discovered}/40 · 가꾸는 방법</summary>
        <div className="garden-details-body">
          <p>빈 화분에 무료 씨앗을 심으세요. 물은 한 번만 줄 수 있고, 전체 성장 시간이 25% 줄어듭니다.</p>
          <p>앱을 닫아도 자라며 시들지 않습니다. 다 자라면 직접 수확하세요. 한 품종을 5회 수확하면 다음 씨앗이 열립니다.</p>
          <p>씨앗 {unlocked}/40종 · 수확 {numbers.format(state.totalHarvests)}회 · 화분 {state.pots.length}/12개</p>
          {harvestLimitReached && <p>수확 기록 한도에 도달했습니다.</p>}
          <ol className="garden-collection">
            {PLANTS.map((plant, index) => {
              const available = isSpeciesUnlocked(state, index);
              return <li key={plant.name} className={available ? '' : 'garden-locked'}>
                <div><span>{index + 1}. {plant.name}</span><span>{available ? `${numbers.format(state.harvested[index])}회` : '미해금'}</span></div>
                <small>{available ? `${remainingLabel(plant.growMs)} · 수확 ${15 + index * 5} 코인` : `${PLANTS[index - 1].name} ${Math.min(5, state.harvested[index - 1])}/5회 수확`}</small>
              </li>;
            })}
          </ol>
        </div>
      </details>
    </section>
  );
}
