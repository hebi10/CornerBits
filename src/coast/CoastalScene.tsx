import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ANCHORS,initialCoast,sampleCoast,settleCoast,startActivity,type CoastalAction,type CoastalState} from './model';
import './coastal.css';

const decorations=['','꽃화분','등불','벤치'];
const targets={fish:ANCHORS.dock,gather:ANCHORS.beach,decorate:ANCHORS.house};
const messages={fish:'부두에서 낚시하는 중',gather:'해변에서 나무를 줍는 중',decorate:'집 앞을 꾸미는 중'};
const water=[[14,66],[23,78],[39,85],[52,89]];
// Generated frame anchors, measured in coast-prompts.json. Align at render time.
const actorX=[-.603,-.603,-.545,-.660,-1.636,-1.464,-1.522,-1.005,-1.464,-2.498,-2.383,-.947,-1.062,-1.636,-2.727,-1.120];
const actorY=[-3.437,-3.380,-3.552,-.509];
const propOffsets=[[-.660,-3.238],[-.603,-3.123],[-.545,-3.238],[-.603,-3.123],[-1.522,-3.181],[.144,-4.214],[.488,-3.181],[.545,-5.248]];
function spritePosition(frame:number,x:number,y:number){return `calc(${frame%4*100/3}% + ${x}px) calc(${Math.floor(frame/4)*100/3}% + ${y}px)`;}

function Prop({frame,x,y,className='',label}:{frame:number;x:number;y:number;className?:string;label?:string}) {
  const size=frame<4?36:frame===4||frame===5?24:frame===6?18:32;
  const offset=propOffsets[frame];
  return <span className={`coast-prop ${className}`} role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true}
    style={{left:`${x}%`,top:`${y}%`,backgroundPosition:spritePosition(frame,offset[0]*size/36,offset[1]*size/36)}}/>;
}

export default function CoastalScene({paused}:{paused:boolean}) {
  const [state,setState]=useState(initialCoast);
  const stateRef=useRef(state);
  const virtual=useRef(0);
  const [clock,setClock]=useState(0);
  const [notice,setNotice]=useState('부두 · 해변 · 집을 눌러보세요');
  const noticeUntil=useRef(6000);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>setReduced(media.matches);media.addEventListener('change',sync);
    return()=>media.removeEventListener('change',sync);
  },[]);

  function show(next:CoastalState){stateRef.current=next;setState(next);}
  function say(text:string){setNotice(text);noticeUntil.current=virtual.current+3600;}

  useEffect(()=>{
    if(paused)return;
    let last=Date.now();
    const timer=window.setInterval(()=>{
      const real=Date.now();
      if(document.hidden){last=real;return;}
      virtual.current+=Math.max(0,real-last);last=real;
      const previous=stateRef.current;
      const next=settleCoast(previous,virtual.current);
      if(next!==previous){
        show(next);
        say(previous.activity==='fish'?'잡은 물고기를 집 앞에 걸었어요':previous.activity==='gather'?'나무를 주웠어요 · 집을 눌러 꾸며보세요':next.decoration===3?'벤치를 놓았어요 · 집 앞 꾸미기 완성':`${decorations[next.decoration]}를 놓았어요 · 나무 1개 사용`);
      }else if(virtual.current>=noticeUntil.current)setNotice('');
      setClock(virtual.current);
    },80);
    return()=>window.clearInterval(timer);
  },[paused]);

  function act(action:CoastalAction){
    if(paused||stateRef.current.activity!==null)return;
    const current=stateRef.current;
    const next=startActivity(current,action,virtual.current);
    if(next===current){say(current.decoration===3?'집 앞 꾸미기를 모두 체험했어요':'해변에서 나무를 먼저 주워주세요');return;}
    show(next);setNotice('');
  }

  const sample=sampleCoast(state,clock);
  const target=state.activity?targets[state.activity]:ANCHORS.home;
  const position=reduced&&(sample.phase==='outbound'||sample.phase==='inbound')?ANCHORS.home:sample;
  const frame=reduced?(sample.pose==='walk'||sample.pose==='idle'?0:sample.pose==='fish'?4:sample.pose==='gather'?8:12):sample.frame;
  const facing=sample.phase==='inbound'?(target.x<ANCHORS.home.x?-1:1):(target.x<ANCHORS.home.x?1:-1);
  const status=state.activity?(sample.phase==='working'?messages[state.activity]:sample.phase==='inbound'?'집으로 돌아오는 중':'오솔길을 걷는 중'):notice;
  const busy=state.activity!==null;

  return <section className="coastal-scene" aria-label="작은 해안 생활" data-paused={paused} data-activity={state.activity??'idle'}>
    <h1 className="coast-sr-only">작은 해안 생활 화면 체험</h1>
    <div className="coastal-canvas">
      <span className="coast-island" aria-hidden="true"/>
      <div className="coast-water" aria-hidden="true">{water.map(([x,y],index)=><i key={index} style={{left:`${x}%`,top:`${y}%`,animationDelay:`${-index*.7}s`}}/>)}</div>
      <div className="coast-smoke" aria-hidden="true"><i/><i/><i/></div>
      {state.catches>0&&<Prop frame={Math.min(3,state.catches)} x={62} y={58} className="coast-fish-rack" label={`잡은 물고기 ${state.catches}마리`}/>}
      {state.wood>0&&<Prop frame={4} x={64} y={63} className="coast-wood" label={`주운 나무 ${state.wood}개`}/>}
      {state.decoration>=1&&<Prop frame={5} x={39} y={48} className="coast-flower" label="직접 놓은 꽃화분"/>}
      {state.decoration>=2&&<Prop frame={6} x={48} y={42} className="coast-lantern" label="직접 놓은 등불"/>}
      {state.decoration>=3&&<Prop frame={7} x={67} y={56} className="coast-bench" label="직접 놓은 벤치"/>}
      <span className="coast-person" data-pose={sample.pose} data-frame={frame} aria-hidden="true" style={{left:Math.round(position.x*2.8),top:Math.round(position.y*2.8),'--facing':sample.pose==='idle'?1:facing} as CSSProperties}>
        <span className="coast-actor" style={{backgroundPosition:spritePosition(frame,actorX[frame],actorY[Math.floor(frame/4)])}}/>
        {sample.pose==='fish'&&<span className="coast-fishing-rod"/>}
      </span>
      <button type="button" className="coast-hotspot coast-dock" aria-label="부두에서 낚시하기" title="부두 · 낚시하러 걸어갑니다" disabled={paused||busy} onClick={()=>act('fish')}/>
      <button type="button" className="coast-hotspot coast-beach" aria-label="해변에서 나무 줍기" title="해변 · 집을 꾸밀 나무를 줍습니다" disabled={paused||busy} onClick={()=>act('gather')}/>
      <button type="button" className="coast-hotspot coast-house" aria-label="집 꾸미기" title={state.decoration===3?'꽃화분·등불·벤치 배치 완료':`집 앞에 ${decorations[state.decoration+1]} 놓기 · 나무 1개 필요 · 현재 ${state.wood}개`} disabled={paused||busy} onClick={()=>act('decorate')}/>
    </div>
    <p className="coast-status" role="status" aria-live="polite">{status}</p>
  </section>;
}
