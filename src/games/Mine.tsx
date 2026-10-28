import { MINE_COUNT_LIMIT, MINE_DEPTH_LIMIT, MINERALS, mineDurability, oreAt, saleValue, upgradeCost, type MineAction, type MineState } from './mine';
import './mine.css';

const compactNumber = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat('ko-KR');

export default function Mine({ state, onAction, disabled }: { state: MineState; onAction: (action: MineAction) => void; disabled: boolean }) {
  const remaining = state.tiles.filter((hp) => hp > 0).length;
  const found = state.collected.filter((count) => count > 0).length;
  const durability = mineDurability(state.depth);
  const sale = saleValue(state.inventory);
  const cost = upgradeCost(state.pickaxe);
  const gate = 100 * state.pickaxe;
  const maxPickaxe = state.pickaxe === 10;
  const full = state.totalMined >= MINE_COUNT_LIMIT;
  const saleOverflow = sale > MINE_COUNT_LIMIT - state.coins;

  return (
    <section className="mine-game" aria-label="미니 광산">
      <div className="mine-heading"><h1>미니 광산</h1><span>{fullNumber.format(state.depth)}층</span></div>
      <div className="mine-stats">
        <span title={`${fullNumber.format(state.coins)} 코인`}>{compactNumber.format(state.coins)} 코인</span>
        <span>곡괭이 {state.pickaxe}단계</span>
      </div>
      <div className="mine-grid" role="group" aria-label={`채굴 구역, 남은 칸 ${remaining}개`}>
        {state.tiles.map((hp, index) => {
          const mineral = MINERALS[oreAt(state.depth, index)];
          return <button
            key={index}
            type="button"
            className={`mine-tile${hp === 0 ? ' mined' : hp < durability ? ' damaged' : ''}`}
            disabled={disabled || hp === 0 || full}
            aria-label={`${index + 1}번 칸, ${mineral}, 내구도 ${hp}/${durability}`}
            title={`${mineral} · 내구도 ${hp}/${durability}`}
            onClick={() => onAction({ type: 'hit', index })}
          ><span>{hp === 0 ? '완료' : mineral.slice(0, 2)}</span><small>{hp === 0 ? '0' : `${hp}/${durability}`}</small></button>;
        })}
      </div>
      <div className="mine-actions">
        <button type="button" className={remaining === 0 ? 'primary' : ''} disabled={disabled || remaining > 0 || state.depth === MINE_DEPTH_LIMIT} onClick={() => onAction({ type: 'descend' })}>
          {state.depth === MINE_DEPTH_LIMIT ? '최대 깊이 도달' : remaining > 0 ? `다음 층 · ${remaining}칸 남음` : '다음 층'}
        </button>
        <button type="button" disabled={disabled || sale === 0 || saleOverflow} aria-label={`광물 일괄 판매, ${fullNumber.format(sale)} 코인`} onClick={() => onAction({ type: 'sell' })}>판매 +{compactNumber.format(sale)}</button>
      </div>
      <button type="button" className="mine-upgrade" disabled={disabled || maxPickaxe || state.depth < gate || state.coins < cost} onClick={() => onAction({ type: 'upgrade' })}>
        {maxPickaxe ? '곡괭이 10단계 · 최고 단계' : `곡괭이 강화 · ${fullNumber.format(cost)}코인${state.depth < gate ? ` · ${gate}층` : ''}`}
      </button>
      {full && <p className="mine-note" role="status">누적 채굴 한도에 도달했습니다.</p>}
      {saleOverflow && <p className="mine-note" role="status">코인 한도로 판매할 수 없습니다. 강화에 코인을 사용해 주세요.</p>}
      <details className="mine-details">
        <summary>광물 도감 {found}/30 · 도움말</summary>
        <p>칸을 눌러 채굴하고 모두 캐면 다음 층으로 내려가세요. 광물은 한꺼번에 판매합니다.</p>
        <p>목표는 1,000층과 광물 30종입니다. 목표 뒤에도 계속 내려갈 수 있습니다.</p>
        <p>곡괭이는 100층마다 강화 조건이 열립니다. 코인도 필요하며 최고 10단계입니다.</p>
        <p>누적 채굴 {fullNumber.format(state.totalMined)}개 · 현재 층 {25 - remaining}/25칸 완료</p>
        <ol className="mine-collection" aria-label="광물 도감">
          {MINERALS.map((name, mineral) => <li key={name}>
            <span>{state.collected[mineral] > 0 ? name : '미발견'}</span>
            <span>{state.collected[mineral] > 0 ? `누적 ${fullNumber.format(state.collected[mineral])}개 · 보유 ${fullNumber.format(state.inventory[mineral])}개` : `${1 + mineral * 34}층부터`}</span>
          </li>)}
        </ol>
      </details>
    </section>
  );
}
