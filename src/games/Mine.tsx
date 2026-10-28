import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MINE_COUNT_LIMIT, MINE_DEPTH_LIMIT, MINERALS, mineDurability, oreAt, saleValue, upgradeCost, type MineAction, type MineState } from './mine';
import { Sprite } from './Art';
import './mine.css';

const compactNumber = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat('ko-KR');
// MINERALS order: crystalline stone, dark ore, metallic ore, or gemstone.
const MINERAL_ART = [
  0, 0, 1, 0, 2, 1, 1, 3, 3, 3,
  0, 3, 3, 3, 0, 0, 0, 3, 1, 3,
  3, 3, 3, 3, 2, 2, 3, 3, 3, 3,
] as const;

export default function Mine({ state, onAction, disabled }: { state: MineState; onAction: (action: MineAction) => void; disabled: boolean }) {
  const pendingHit = useRef<{ index: number; hp: number; depth: number } | null>(null);
  const [feedback, setFeedback] = useState<{ index: number; depth: number; hp: number } | null>(null);
  const remaining = state.tiles.filter((hp) => hp > 0).length;
  const found = state.collected.filter((count) => count > 0).length;
  const durability = mineDurability(state.depth);
  const sale = saleValue(state.inventory);
  const cost = upgradeCost(state.pickaxe);
  const gate = 100 * state.pickaxe;
  const maxPickaxe = state.pickaxe === 10;
  const full = state.totalMined >= MINE_COUNT_LIMIT;
  const saleOverflow = sale > MINE_COUNT_LIMIT - state.coins;
  const descendLabel = state.depth === MINE_DEPTH_LIMIT ? '최대 깊이 도달' : remaining > 0 ? `다음 층 · ${remaining}칸 남음` : '다음 층';
  const saleLabel = `광물 일괄 판매, ${fullNumber.format(sale)} 코인`;
  const upgradeLabel = maxPickaxe ? '곡괭이 10단계 · 최고 단계' : `곡괭이 강화 ${state.pickaxe}/10 · ${compactNumber.format(cost)}코인${state.depth < gate ? ` · ${gate}층` : ''}`;

  useEffect(() => {
    const pending = pendingHit.current;
    if (!pending) return;
    pendingHit.current = null;
    if (pending.depth === state.depth && state.tiles[pending.index] < pending.hp) {
      setFeedback({ index: pending.index, depth: state.depth, hp: state.tiles[pending.index] });
    }
  }, [state]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 650);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function hit(index: number) {
    pendingHit.current = { index, hp: state.tiles[index], depth: state.depth };
    onAction({ type: 'hit', index });
  }

  return (
    <section className="mine-game" aria-label="미니 광산">
      <h1 className="sr-only">미니 광산</h1>
      <div className="mine-heading" aria-hidden="true">
        <Sprite atlas="mine" frame={11} className="mine-cart" />
        <Sprite atlas="mine" frame={15} className="mine-lantern game-motion" />
      </div>
      <div className="mine-grid" role="group" aria-label={`채굴 구역, 남은 칸 ${remaining}개`}>
        {state.tiles.map((hp, index) => {
          const mineralId = oreAt(state.depth, index);
          const mineral = MINERALS[mineralId];
          const variant = MINERAL_ART[mineralId];
          const frame = hp === 0 ? 8 : variant + (hp < durability ? 4 : 0);
          const active = feedback?.index === index && feedback.depth === state.depth;
          return <button
            key={index}
            type="button"
            className={`mine-tile${hp === 0 ? ' mined' : hp < durability ? ' damaged' : ''}`}
            disabled={disabled || hp === 0 || full}
            aria-label={`${index + 1}번 칸, ${mineral}, 내구도 ${hp}/${durability}`}
            title={`${mineral} · 내구도 ${hp}/${durability}`}
            onClick={() => hit(index)}
          >
            <Sprite atlas="mine" frame={frame} className="mine-rock" />
            {hp > 0 && hp < durability && <span className="mine-durability" aria-hidden="true" style={{ '--remaining-hp': `${hp / durability * 100}%` } as CSSProperties} />}
            {active && <span className={`mine-feedback game-motion ${feedback.hp === 0 ? 'loot' : 'strike'}`} key={`${feedback.depth}-${feedback.index}-${feedback.hp}`} aria-hidden="true">
              <Sprite atlas="mine" frame={feedback.hp === 0 ? 12 : 10} className="mine-feedback-art" />
              {feedback.hp === 0 && <span>+1</span>}
              <Sprite atlas="mine" frame={9} className="mine-chips" />
            </span>}
          </button>;
        })}
      </div>
      <div className="mine-tools">
        <div className="mine-actions">
          <button type="button" disabled={disabled || remaining > 0 || state.depth === MINE_DEPTH_LIMIT} aria-label={descendLabel} title={descendLabel} onClick={() => onAction({ type: 'descend' })}>
            <Sprite atlas="charms" frame={10} className="mine-button-art" />
          </button>
          <button type="button" disabled={disabled || sale === 0 || saleOverflow} aria-label={saleLabel} title={saleLabel} onClick={() => onAction({ type: 'sell' })}>
            <Sprite atlas="charms" frame={9} className="mine-button-art" />
          </button>
          <button type="button" disabled={disabled || maxPickaxe || state.depth < gate || state.coins < cost} aria-label={upgradeLabel} title={upgradeLabel} onClick={() => onAction({ type: 'upgrade' })}>
            <Sprite atlas="charms" frame={11} className="mine-button-art" />
          </button>
        </div>
        <details className="mine-details">
          <summary aria-label="광산 도감과 기록" title="광산 도감과 기록"><Sprite atlas="charms" frame={8} className="mine-menu-art" /></summary>
          <div className="mine-details-body">
            <p>{fullNumber.format(state.depth)}층 · {fullNumber.format(state.coins)} 코인 · 곡괭이 {state.pickaxe}/10단계</p>
            <p>광물 도감 {found}/30 · 판매 가능 {fullNumber.format(sale)} 코인</p>
            <p>광석 그림을 눌러 채굴하고 모두 캐면 사다리로 다음 층에 내려가세요. 도구에 마우스를 올리면 이름과 필요한 조건을 볼 수 있습니다.</p>
            <p>목표는 1,000층과 광물 30종입니다. 목표 뒤에도 계속 내려갈 수 있습니다.</p>
            <p>곡괭이는 100층마다 강화 조건이 열립니다. 코인도 필요하며 최고 10단계입니다.</p>
            <p>누적 채굴 {fullNumber.format(state.totalMined)}개 · 현재 층 {25 - remaining}/25칸 완료</p>
            <ol className="mine-collection" aria-label="광물 도감">
              {MINERALS.map((name, mineral) => <li key={name}>
                <span className="mine-collection-name"><Sprite atlas="mine" frame={state.collected[mineral] > 0 ? mineral === 29 ? 13 : 12 : 9} className="mine-collection-art" />{state.collected[mineral] > 0 ? name : '미발견'}</span>
                <span>{state.collected[mineral] > 0 ? `누적 ${fullNumber.format(state.collected[mineral])}개 · 보유 ${fullNumber.format(state.inventory[mineral])}개` : `${1 + mineral * 34}층부터`}</span>
              </li>)}
            </ol>
          </div>
        </details>
      </div>
      {full && <p className="mine-note" role="status">누적 채굴 한도에 도달했습니다.</p>}
      {saleOverflow && <p className="mine-note" role="status">코인 한도로 판매할 수 없습니다. 강화에 코인을 사용해 주세요.</p>}
    </section>
  );
}
