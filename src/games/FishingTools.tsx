import {useImperativeHandle,useRef,useState,type Ref} from 'react';
import {Sprite} from './Art';
import {FishSprite,RegionSprite,RodSprite} from './FishingScene';
import type {FishingFeedback} from './Fishing.tsx';
import {BAITS,BAIT_HINTS,BAIT_PACK_SIZE,FISH,FISHING_GOAL,FISHING_COUNT_LIMIT,LOCATION_REQUIREMENTS,baitPackPrice,baitRareChance,canBuyBait,canUpgradeRod,fishingSaleValue,isFishingComplete,isLocationUnlocked,locationNames,locationSpeciesCount,rodBiteWindow,rodWaitRange,rodUpgradeCatches,rodUpgradeCost,type FishingAction,type FishingState} from './fishing';

export interface FishingToolsHandle {openCollection:(species:number)=>void}
interface Props {ref:Ref<FishingToolsHandle>;state:FishingState;disabled:boolean;status:string;biting:boolean;expired:boolean;feedback:FishingFeedback|null;onAction:(action:FishingAction)=>void;onOpenChange:(open:boolean)=>void}
const number=new Intl.NumberFormat('ko-KR');
const compact=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});

export default function FishingTools({ref,state,disabled,status,biting,expired,feedback,onAction,onOpenChange}:Props) {
  const details=useRef<HTMLDetailsElement>(null);
  const [open,setOpen]=useState(false);
  const [view,setView]=useState<'shop'|'collection'|'gear'|'travel'>('shop');
  const [page,setPage]=useState(0);
  const [help,setHelp]=useState(false);
  useImperativeHandle(ref,()=>({openCollection(species){setView('collection');setPage(Math.floor(species/8));setHelp(false);if(details.current)details.current.open=true;}}),[]);
  const sale=fishingSaleValue(state);
  const next=state.unlockedLocations<6?state.unlockedLocations:null;
  const range=rodWaitRange(state.rod);
  const window=rodBiteWindow(state.rod)/1000;
  return <details className="fishing-tools" ref={details} onToggle={event=>{setOpen(event.currentTarget.open);onOpenChange(event.currentTarget.open);}}>
    <summary aria-label="낚시 도구와 도감" title={open?'낚시터로 돌아가기':'상점 · 도감 · 장비 · 지역'}><Sprite atlas={open?'charms':'fishing'} frame={open?15:14}/></summary>
    <div className="fishing-tools-body">
      {state.cast!==null&&<p className="fishing-menu-cast" role="status">{status}{(biting||expired)&&<button type="button" disabled={disabled} onClick={()=>{onAction({type:'hook'});if(details.current)details.current.open=false;}}>{biting?'당기기':'정리하기'}</button>}</p>}
      <div className="fishing-shop" aria-label="낚시 상점" hidden={view!=='shop'}>
        <p className="fishing-panel-title">보관 {number.format(state.inventory.reduce((sum,count)=>sum+count,0))}마리 · {compact.format(state.coins)}코인</p>
        <div className="fishing-trade-actions">
          <button type="button" aria-label={`물고기 일괄 판매 ${sale} 코인`} disabled={disabled||sale===0||sale>FISHING_COUNT_LIMIT-state.coins} onClick={()=>onAction({type:'sell'})}><Sprite atlas="charms" frame={9}/><span>모두 판매</span><small>{compact.format(sale)} 코인</small></button>
          {([1,2] as const).map(bait=><button type="button" key={bait} aria-label={`${BAITS[bait]} ${BAIT_PACK_SIZE}개 구매 ${baitPackPrice(bait)} 코인`} title={`${BAIT_HINTS[bait]} · 던질 때1개 사용`} disabled={disabled||!canBuyBait(state,bait)} onClick={()=>onAction({type:'buy-bait',index:bait})}><Sprite atlas="fishing" frame={11}/><span>{BAITS[bait]} ×5</span><small>{baitPackPrice(bait)} 코인</small><small>희귀 {baitRareChance(bait)}%</small></button>)}
        </div>
        <p>풀잎 {compact.format(state.baitStock[0])}개 · 반짝 {compact.format(state.baitStock[1])}개</p>
        <p className="fishing-transaction" role="status">{feedback?.type==='sell'?`판매 +${number.format(feedback.reward)}코인`:feedback?.type==='purchase'?`미끼 +5개 · -${number.format(feedback.reward)}코인`:'판매 후에도 수집한 물고기는 남습니다.'}</p>
      </div>
      <div hidden={view!=='collection'} className="fishing-collection-panel">
        <p className="fishing-panel-title">수집 {state.caught.filter(count=>count>0).length}/36</p>
        <div className="fishing-collection" role="group" aria-label="물고기 그림 도감">{FISH.slice(page*8,page*8+8).map((name,offset)=>{const species=page*8+offset;return <span className={`fishing-species${state.caught[species]?'':' fishing-undiscovered'}`} key={name} title={`${name} · ${locationNames[Math.floor(species/6)]} · ${number.format(state.caught[species])}마리`}><FishSprite species={species}/><span>{name}</span></span>;})}</div>
        <div className="fishing-pages"><button type="button" aria-label="이전 물고기 도감 쪽" disabled={page===0} onClick={()=>setPage(page-1)}>이전</button><span>{page+1}/5</span><button type="button" aria-label="다음 물고기 도감 쪽" disabled={page===4} onClick={()=>setPage(page+1)}>다음</button></div>
      </div>
      <div className="fishing-gear-panel" hidden={view!=='gear'}>
        <div className="fishing-gear-controls" hidden={help}>
        <div className="fishing-gear-heading"><RodSprite rod={state.rod}/><div><p>낚싯대 {state.rod}/8</p><p className="fishing-gear-effect">입질 {range[0]/1000}~{range[1]/1000}초 · 반응 {window}초</p></div></div>
        <button type="button" className="fishing-upgrade" aria-label={state.rod===8?'낚싯대 최고 단계 8':`낚싯대 강화 ${rodUpgradeCost(state.rod)} 코인, 누적 ${rodUpgradeCatches(state.rod)}마리 필요`} disabled={disabled||!canUpgradeRod(state)} onClick={()=>onAction({type:'upgrade'})}><Sprite atlas="fishing" frame={15}/><span>{state.rod===8?'최고 단계':`강화 ${number.format(rodUpgradeCost(state.rod))}코인 · ${number.format(state.totalCaught)}/${number.format(rodUpgradeCatches(state.rod))}마리`}</span></button>
        <label className="fishing-tool-select"><Sprite atlas="fishing" frame={11}/><span className="sr-only">미끼 고르기</span><select aria-label="미끼 고르기" title={BAIT_HINTS[state.bait]} value={state.bait} disabled={disabled||state.cast!==null} onChange={event=>onAction({type:'bait',index:Number(event.target.value)})}>{BAITS.map((name,index)=><option key={name} value={index} disabled={index>0&&state.baitStock[index-1]===0}>{name} · {index===0?'무료':`${number.format(state.baitStock[index-1])}개`}</option>)}</select></label>
        </div>
        <button type="button" className="fishing-help-toggle" aria-expanded={help} onClick={()=>setHelp(!help)}>{help?'장비로 돌아가기':'낚시하는 법'}</button>
        {help&&<p>배를 눌러 던지고 찌가 움직이면 {window}초 안에 당깁니다. 강화마다 입질 대기0.5초 감소·반응 여유1초 증가. 유료 미끼는 던질 때1개 사용합니다.</p>}
      </div>
      <div className="fishing-travel-panel" hidden={view!=='travel'}>
        <RegionSprite location={state.location} className="fishing-region-preview"/>
        <label className="fishing-tool-select"><span className="sr-only">낚시터 고르기</span><select aria-label="낚시터 고르기" value={state.location} disabled={disabled||state.cast!==null} onChange={event=>onAction({type:'location',index:Number(event.target.value)})}>{locationNames.map((name,index)=><option key={name} value={index} disabled={!isLocationUnlocked(state,index)}>{name}{isLocationUnlocked(state,index)?'':` · ${LOCATION_REQUIREMENTS[index]}마리/이전4종`}</option>)}</select></label>
        <p className="fishing-next-location">{isFishingComplete(state)?'낚시 주요 목표 달성':next===null?`모든 지역 개방 · ${number.format(state.totalCaught)}/${number.format(FISHING_GOAL)}마리`:`다음 ${locationNames[next]} · ${number.format(state.totalCaught)}/${number.format(LOCATION_REQUIREMENTS[next])}마리 · 이전 지역 ${locationSpeciesCount(state,next-1)}/4종`}</p>
      </div>
      <div className="fishing-menu-links">{([['shop','상점'],['collection','도감'],['gear','장비'],['travel','지역']] as const).map(([tab,label])=><button type="button" key={tab} aria-pressed={view===tab} onClick={()=>setView(tab)}>{label}</button>)}</div>
    </div>
  </details>;
}
