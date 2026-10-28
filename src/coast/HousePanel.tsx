import {CoastIcon} from './CoastalArt';
import {COIN_PER_FISH,MAX_COAST_COUNT,PROJECTS,canStartActivity,projectCost,type CoastalAction,type CoastalState} from './model';

interface Props {state:CoastalState;disabled:boolean;onProject:(action:CoastalAction)=>void;onSell:()=>void;onClose:()=>void}
const format=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});

export default function HousePanel({state,disabled,onProject,onSell,onClose}:Props) {
  const cost=projectCost(state,'upgrade');
  const canSell=state.activity===null&&state.fish>0&&state.fish<=Math.floor((MAX_COAST_COUNT-state.coins)/COIN_PER_FISH);
  return <section className="coast-panel coast-house-panel" aria-label="집 꾸미기와 성장">
    <header><span>집 {state.houseLevel}/3</span><button type="button" aria-label="집 메뉴 닫기" onClick={onClose}>닫기</button></header>
    <p className="coast-resources">물고기 {format.format(state.fish)} · 나무 {format.format(state.wood)} · 조개코인 {format.format(state.coins)}</p>
    <div className="coast-projects">{PROJECTS.map(item=>{
      const owned=(state.decoration&item.bit)!==0;
      const reason=owned?'배치 완료':state.houseLevel<item.requiredLevel?`집 ${item.requiredLevel}단계부터`:state.activity?'진행 중인 일을 마친 뒤 제작':`나무 ${item.wood}개 · 조개코인 ${item.coins}`;
      return <button type="button" key={item.action} aria-label={`${item.name} 제작`} title={reason} disabled={disabled||!canStartActivity(state,item.action)} onClick={()=>onProject(item.action)}>
        <CoastIcon frame={item.frame}/><span>{item.name}</span><small>{owned?'배치 완료':state.houseLevel<item.requiredLevel?`집 ${item.requiredLevel}부터`:`나무 ${item.wood} · 코인 ${item.coins}`}</small>
      </button>;
    })}</div>
    <button type="button" className="coast-upgrade" aria-label={state.houseLevel===3?'집 최고 단계':'집 확장'} disabled={disabled||!canStartActivity(state,'upgrade')} onClick={()=>onProject('upgrade')}>
      {state.houseLevel===3?'집 확장 완료':`집 ${state.houseLevel+1}로 확장 · 나무 ${cost.wood} · 코인 ${cost.coins}`}
    </button>
    <p>{state.houseLevel===3?'낚시·채집으로 한 번에 3개씩 모아요':`지금 한 번에 ${state.houseLevel}개씩 · 확장하면 ${state.houseLevel+1}개씩 모아요`}</p>
    <button type="button" className="coast-sell" aria-label="물고기 모두 판매" disabled={disabled||!canSell} onClick={onSell}>물고기 판매 · {format.format(state.fish*COIN_PER_FISH)}조개코인</button>
  </section>;
}
