import type {AppState} from '../core/state';
import {workReportText,workSummaryText} from './workText';
export interface PendingCoastBackup {state:AppState;sourceVersion:number}
interface Props {state:AppState|null;busy:boolean;saveFailed:boolean;saveStatus:string;error:string;pending:PendingCoastBackup|null;onInterval:(minutes:10|15)=>void;onExport:()=>void;onImport:()=>void;onRestore:()=>void;onCancel:()=>void;onRetry:()=>void;onClose:()=>void}
const number=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});
const date=(text:string)=>new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(text));

export default function RecordPanel({state,busy,saveFailed,saveStatus,error,pending,onInterval,onExport,onImport,onRestore,onCancel,onRetry,onClose}:Props) {
  const coast=state?.games.coast;
  return <section className="coast-panel coast-record-panel" aria-label="기록과 백업">
    <header><span>해안 기록</span><button type="button" aria-label="기록 닫기" disabled={busy} onClick={onClose}>닫기</button></header>
    {pending?<div className="coast-restore-confirm" aria-label="복원 확인">
      <p>{date(pending.state.updatedAt)} 백업으로 바꿉니다.</p>
      <p>집 {pending.state.games.coast.houseLevel}/3 · 나무 {number.format(pending.state.games.coast.wood)} · 코인 {number.format(pending.state.games.coast.coins)}</p>
      {pending.sourceVersion<8&&<p>해안 생활 이전 백업입니다. 해안은 처음부터 시작하며, 이전 게임 기록도 백업 시점으로 복원합니다.</p>}
      {pending.sourceVersion===8&&<p>이전 작업 시간을 보존하고, 10분 간격의 작업으로 이어갑니다.</p>}{pending.sourceVersion===9&&<p>자원과 진행 시간은 보존하며, 작업별 누적 표시는 저장된 경과 시간과 획득 0부터 시작합니다.</p>}
      <p>현재 기록은 복원 전에 별도로 보관합니다.</p>
      <div className="coast-record-actions"><button type="button" disabled={busy} onClick={onRestore}>이 백업으로 복원</button><button type="button" disabled={busy} onClick={onCancel}>취소</button></div>
    </div>:<>
      <p>{saveStatus}{state?` · ${date(state.updatedAt)}`:''}</p>
      {coast&&<><p>집 {coast.houseLevel}/3 · 꾸미기 {[1,2,4].filter(bit=>(coast.decoration&bit)!==0).length}/3</p><p>물고기 {number.format(coast.fish)} · 나무 {number.format(coast.wood)} · 조개코인 {number.format(coast.coins)}</p></>}
      {coast&&(coast.activity==='fish'||coast.activity==='gather')&&<p>{workSummaryText(coast)}</p>}{coast&&<><div className="coast-interval" role="group" aria-label="작업 정산 간격"><span>정산 간격</span>{([10,15] as const).map(minutes=><button key={minutes} type="button" aria-label={`정산 간격 ${minutes}분`} aria-pressed={coast.workInterval===minutes} disabled={busy||saveFailed||coast.activity!==null} onClick={()=>onInterval(minutes)}>{minutes}분{coast.workInterval===minutes?' 선택':''}</button>)}</div>{coast.activity&&<p>작업을 중단하면 간격을 바꿀 수 있어요.</p>}{coast.lastReport&&<p className="coast-last-report">최근 정산 {workReportText(coast.lastReport)}</p>}</>}
      <div className="coast-record-actions"><button type="button" aria-label="백업 내보내기" disabled={busy||!state||saveFailed} onClick={onExport}>백업 저장</button><button type="button" aria-label="백업에서 복원" disabled={busy} onClick={onImport}>백업 복원</button></div>
      <p>한 번 맡기면 접거나 다른 일을 해도 계속 일합니다. 정지하거나 앱을 종료하면 작업 시간이 멈춥니다. 진행도는 자동 저장됩니다.</p>
    </>}
    {error&&<p className="coast-panel-error" role="alert">{error}</p>}
    {saveFailed&&<button type="button" disabled={busy} onClick={onRetry}>저장 다시 시도</button>}
  </section>;
}
