import {useCallback,useEffect,useRef,useState} from 'react';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import * as platform from '../platform';
import {decodeBackup} from '../core/state';
import {useCoastalSession} from './useCoastalSession';
import CoastalScene from './CoastalScene';
import HousePanel from './HousePanel';
import RecordPanel,{type PendingCoastBackup} from './RecordPanel';
import type {CoastalAction} from './model';
import './coastal-shell.css';
const message=(cause:unknown)=>cause instanceof Error?cause.message:String(cause);

export default function CoastalApp(){
 const {view,session}=useCoastalSession();
 const advance=useCallback((deltaMs:number)=>session.advance(deltaMs),[session]);
 const [compact,setCompact]=useState(false),[paused,setPaused]=useState(false),[hidden,setHidden]=useState(()=>document.hidden);
 const [houseOpen,setHouseOpen]=useState(false),[recordOpen,setRecordOpen]=useState(false),[resizing,setResizing]=useState(platform.desktop),[closing,setClosing]=useState(false);
 const [windowError,setWindowError]=useState('');
 const [pending,setPending]=useState<PendingCoastBackup|null>(null);
 const input=useRef<HTMLInputElement>(null),active=useRef(true),closingRef=useRef(false),resizingRef=useRef(platform.desktop);
 const pendingResize=useRef<Promise<void>>(Promise.resolve());
 const importEpoch=useRef(0);
 const error=[view.error,windowError].filter(Boolean).join(' ');
 const blocked=!view.ready||!view.coast||view.busy||view.saveFailed||resizing||closing;
 const scenePaused=paused||hidden||compact||houseOpen||recordOpen||blocked;

 useEffect(()=>{
  if(paused||blocked||pending)return;
  let last=Date.now();
  const timer=window.setInterval(()=>{const now=Date.now();const delta=Math.max(0,now-last);last=now;advance(delta);},250);
  return()=>window.clearInterval(timer);
 },[paused,blocked,pending,advance]);

 async function requestExit(){
  if(!platform.desktop||closingRef.current)return;
  closingRef.current=true;setClosing(true);
  try{await pendingResize.current.catch(()=>undefined);if(!await session.prepareClose())return;await getCurrentWindow().destroy();}
  catch(cause){session.cancelClose();if(active.current)setWindowError(`창을 닫지 못했습니다. ${message(cause)}`);}
  finally{if(active.current){closingRef.current=false;setClosing(false);}}
 }
 useEffect(()=>{
  active.current=true;let cancelled=false;const stops:UnlistenFn[]=[];
  const visibility=()=>{setHidden(document.hidden);if(document.hidden)void session.checkpoint();};
  document.addEventListener('visibilitychange',visibility);
  async function start(){
   if(!platform.desktop)return;
   try{
    const close=await getCurrentWindow().onCloseRequested(event=>{event.preventDefault();void requestExit();});if(cancelled){close();return;}stops.push(close);
    const exit=await listen('request-exit',()=>void requestExit());if(cancelled){exit();return;}stops.push(exit);
    const nativeError=await listen<string>('native-error',event=>{if(!cancelled)setWindowError(event.payload);});if(cancelled){nativeError();return;}stops.push(nativeError);
    if(closingRef.current)return;await platform.applyWindow({alwaysOnTop:false,compact:false});
   }catch(cause){if(!cancelled)setWindowError(`화면을 준비하지 못했습니다. ${message(cause)}`);}
   finally{resizingRef.current=false;if(!cancelled)setResizing(false);}
  }
  pendingResize.current=start();
  return()=>{cancelled=true;active.current=false;importEpoch.current+=1;document.removeEventListener('visibilitychange',visibility);stops.forEach(stop=>stop());};
 },[session]);

 async function resize(next:boolean){
  if(resizingRef.current||closingRef.current)return false;
  if(next)cancelPreview();
  resizingRef.current=true;setResizing(true);setWindowError('');
  const operation=(async()=>{if(!await session.checkpoint())throw new Error('먼저 저장을 다시 시도해 주세요.');await platform.applyWindow({alwaysOnTop:false,compact:next});if(active.current)setCompact(next);})();
  pendingResize.current=operation;
  try{await operation;return true;}catch(cause){if(active.current)setWindowError(`크기를 바꾸지 못했습니다. ${message(cause)}`);return false;}
  finally{resizingRef.current=false;if(active.current)setResizing(false);}
 }
 async function togglePause(){const next=!paused;setPaused(next);if(next)await session.checkpoint();}
 function cancelPreview(){importEpoch.current+=1;setPending(null);}
 function closeRecords(){cancelPreview();setRecordOpen(false);}
 async function openHouse(){if(!view.coast||view.busy)return;cancelPreview();setHouseOpen(true);setRecordOpen(false);await session.checkpoint();}
 async function toggleRecords(){if(compact&&!await resize(false))return;cancelPreview();setHouseOpen(false);setRecordOpen(!recordOpen);if(!recordOpen)await session.checkpoint();}
 function startProject(action:CoastalAction){if(paused||hidden||compact||blocked)return;setHouseOpen(false);void session.start(action);}
 function sell(){if(paused||hidden||compact||blocked)return;void session.sell();}
 function stop(){if(blocked)return;void session.stop();}
 function preview(text:string,epoch:number){
  if(epoch!==importEpoch.current||!active.current)return;
  try{const state=decodeBackup(text);const source=JSON.parse(text);setPending({state,sourceVersion:source.state.schemaVersion});session.setError('');}
  catch(cause){setPending(null);session.setError(`백업을 읽지 못했습니다. ${message(cause)}`);}
 }
 async function importBackup(){
  const epoch=++importEpoch.current;setPending(null);
  if(!await session.checkpoint()&&!view.saveFailed&&view.state)return;
  if(epoch!==importEpoch.current||!active.current)return;
  if(platform.desktop){try{const raw=await platform.readNativeBackup();if(raw!==null)preview(raw,epoch);}catch(cause){if(epoch===importEpoch.current&&active.current)session.setError(`백업을 읽지 못했습니다. ${message(cause)}`);}}
  else input.current?.click();
 }
 async function restore(){if(!pending)return;if(await session.restore(pending.state)){cancelPreview();setWindowError('');}}
 const uiBusy=view.busy||resizing||closing;
 return <div className={`coast-shell${compact?' coast-compact':''}`} data-paused={scenePaused}>
  <header className="coast-titlebar">
   <span className="coast-drag-handle" data-tauri-drag-region title="위쪽 여백을 끌어 이동"><span data-tauri-drag-region>해안 생활</span></span>
   <span className={`coast-save-state${view.saveStatus==='저장 완료'?' coast-save-quiet':''}`} role="status" title={view.saveStatus}>{view.saveStatus}</span>
   <div className="coast-window-controls">
    <button type="button" aria-label={paused?'움직임 재생':'움직임 정지'} aria-pressed={paused} disabled={!view.ready||uiBusy} onClick={()=>void togglePause()}>{paused?'재생':'정지'}</button>
    <button type="button" aria-label="기록과 백업" aria-expanded={recordOpen&&!compact} disabled={uiBusy} onClick={()=>void toggleRecords()}>기록</button>
    <button type="button" aria-label={compact?'펼치기':'막대로 축소'} disabled={!view.ready||uiBusy} onClick={()=>void resize(!compact)}>{compact?'펼침':'접기'}</button>
    {platform.desktop&&<button type="button" aria-label="종료" disabled={resizing||closing} onClick={()=>void platform.closeWindow().catch(cause=>setWindowError(message(cause)))}>닫기</button>}
   </div>
  </header>
  <main className="coast-scene-area" hidden={compact}>
   {view.coast?<CoastalScene state={view.coast} paused={scenePaused} disabled={blocked} notice={view.notice} onAction={startProject} onStop={stop} onHouse={()=>void openHouse()} onSell={sell}/>:<div className="coast-waiting">{view.ready?'기록을 확인해 주세요':'해안을 불러오는 중'}</div>}
  </main>
  {!compact&&!recordOpen&&error&&<div className="coast-shell-error" role="alert">{error}{view.saveFailed&&<button type="button" disabled={uiBusy} onClick={()=>void session.retry()}>저장 다시 시도</button>}</div>}
  {compact&&error&&<button type="button" className="coast-compact-error" aria-label="저장 오류 확인하고 펼치기" onClick={()=>void toggleRecords()}>저장 확인</button>}
  {!compact&&houseOpen&&view.coast&&<HousePanel state={view.coast} disabled={blocked||paused} onProject={startProject} onSell={sell} onStop={stop} onClose={()=>setHouseOpen(false)}/>}
  {!compact&&recordOpen&&<RecordPanel state={view.state} busy={uiBusy} saveFailed={view.saveFailed} saveStatus={view.saveStatus} error={error} pending={pending} onInterval={minutes=>void session.changeInterval(minutes)} onExport={()=>void session.exportBackup()} onImport={()=>void importBackup()} onRestore={()=>void restore()} onCancel={cancelPreview} onRetry={()=>void session.retry()} onClose={closeRecords}/>}
  <input type="file" ref={input} className="coast-sr-only" tabIndex={-1} aria-label="백업 파일 선택" accept=".cornerbits,application/json" onChange={event=>{const epoch=++importEpoch.current;const file=event.target.files?.[0];event.target.value='';if(!file)return;setPending(null);if(file.size>2*1024*1024){session.setError('백업 파일은 2 MiB 이하여야 합니다.');return;}void file.text().then(text=>preview(text,epoch)).catch(cause=>{if(epoch===importEpoch.current&&active.current)session.setError(message(cause));});}}/>
 </div>;
}
