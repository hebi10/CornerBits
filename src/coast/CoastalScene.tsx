import {useEffect,useState,type CSSProperties} from 'react';
import {ANCHORS,sampleCoast,MAX_COAST_COUNT,COIN_PER_FISH,type CoastalAction,type CoastalState} from './model';
import {CoastIcon,actorX,actorY,spritePosition} from './CoastalArt';
import './coastal.css';
const water=[[14,66],[23,78],[39,85],[52,89]];
function Prop({frame,x,y,className='',label}:{frame:number;x:number;y:number;className?:string;label?:string}) {
 const size=frame<4?36:frame===4||frame===5?24:frame===6?18:32;
 return <span className={`coast-prop ${className}`} role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true} style={{left:`${x}%`,top:`${y}%`}}><CoastIcon frame={frame} size={size}/></span>;
}
interface Props {state:CoastalState;paused:boolean;disabled:boolean;notice:string;onAction:(action:CoastalAction)=>void;onAdvance:(deltaMs:number)=>void;onHouse:()=>void;onSell:()=>void}
export default function CoastalScene({state,paused,disabled,notice,onAction,onAdvance,onHouse,onSell}:Props) {
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [visibleNotice,setVisibleNotice]=useState(notice);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReduced(media.matches);media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 useEffect(()=>{setVisibleNotice(notice);const timer=window.setTimeout(()=>setVisibleNotice(''),5000);return()=>window.clearTimeout(timer);},[notice]);
 useEffect(()=>{if(paused||disabled)return;let last=Date.now();const timer=window.setInterval(()=>{const now=Date.now();if(document.hidden){last=now;return;}const delta=Math.max(0,now-last);last=now;onAdvance(delta);},80);return()=>window.clearInterval(timer);},[paused,disabled,onAdvance]);
  const sample=sampleCoast(state);
  const target=state.activity==='fish'?ANCHORS.dock:state.activity==='gather'?ANCHORS.beach:state.activity?ANCHORS.house:ANCHORS.home;
  const position=reduced&&(sample.phase==='outbound'||sample.phase==='inbound')?ANCHORS.home:sample;
  const frame=reduced?(sample.pose==='walk'||sample.pose==='idle'?0:sample.pose==='fish'?4:sample.pose==='gather'?8:12):sample.frame;
  const facing=sample.phase==='inbound'?(target.x<ANCHORS.home.x?-1:1):(target.x<ANCHORS.home.x?1:-1);
  const status=state.activity?(sample.phase==='working'?(state.activity==='fish'?'부두에서 낚시하는 중':state.activity==='gather'?'해변에서 나무를 줍는 중':state.activity==='upgrade'?'집을 넓히는 중':'집 앞을 꾸미는 중'):sample.phase==='inbound'?'집으로 돌아오는 중':'오솔길을 걷는 중'):visibleNotice;
  const busy=state.activity!==null;

  return <section className="coastal-scene" aria-label="작은 해안 생활" data-paused={paused} data-activity={state.activity??'idle'}>
    <h1 className="coast-sr-only">작은 해안 생활</h1>
    <div className="coastal-canvas">
      <span className={`coast-island coast-island-${state.houseLevel}`} data-house-level={state.houseLevel} aria-hidden="true"/>
      <div className="coast-water" aria-hidden="true">{water.map(([x,y],index)=><i key={index} style={{left:`${x}%`,top:`${y}%`,animationDelay:`${-index*.7}s`}}/>)}</div>
      <div className="coast-smoke" aria-hidden="true"><i/><i/><i/></div>
      {state.catches>0&&<button type="button" className="coast-trade" aria-label={`물고기 ${state.fish}마리 판매`} title={`총 ${state.catches}마리 낚음 · 누르면 보관 물고기 판매`} disabled={disabled||paused||busy||state.fish===0||state.fish>Math.floor((MAX_COAST_COUNT-state.coins)/COIN_PER_FISH)} onClick={onSell}><CoastIcon frame={Math.min(3,state.fish)} size={36}/></button>}
      {state.wood>0&&<Prop frame={4} x={64} y={63} className="coast-wood" label={`주운 나무 ${state.wood}개`}/>}
      {(state.decoration&1)!==0&&<Prop frame={5} x={39} y={48} className="coast-flower" label="직접 놓은 꽃화분"/>}
      {(state.decoration&2)!==0&&<Prop frame={6} x={48} y={42} className="coast-lantern" label="직접 놓은 등불"/>}
      {(state.decoration&4)!==0&&<Prop frame={7} x={67} y={56} className="coast-bench" label="직접 놓은 벤치"/>}
      <span className="coast-person" data-pose={sample.pose} data-frame={frame} aria-hidden="true" style={{left:Math.round(position.x*2.8),top:Math.round(position.y*2.8),'--facing':sample.pose==='idle'?1:facing} as CSSProperties}>
        <span className="coast-actor" style={{backgroundPosition:spritePosition(frame,actorX[frame],actorY[Math.floor(frame/4)])}}/>
        {sample.pose==='fish'&&<span className="coast-fishing-rod"/>}
      </span>
      <button type="button" className="coast-hotspot coast-dock" aria-label="부두에서 낚시하기" title="부두 · 낚시하러 걸어갑니다" disabled={disabled||paused||busy} onClick={()=>onAction('fish')}/>
      <button type="button" className="coast-hotspot coast-beach" aria-label="해변에서 나무 줍기" title="해변 · 집을 꾸밀 나무를 줍습니다" disabled={disabled||paused||busy} onClick={()=>onAction('gather')}/>
      <button type="button" className="coast-hotspot coast-house" aria-label="집 꾸미기" title={`집 ${state.houseLevel}단계 · 꾸미기와 확장`} disabled={disabled} onClick={onHouse}/>
    </div>
    <p className="coast-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
