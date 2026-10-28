import type {CoastalState} from './model';
const format=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});
export function workReportText(report:CoastalState['lastReport']):string {
  if(!report)return '';
  return `${report.activity==='fish'?'낚시 소식 · 물고기':'채집 소식 · 나무'} +${format.format(report.amount)}${report.cycles>1?` · ${format.format(report.cycles)}회 모아보기`:''}`;
}
export function workTimeText(milliseconds:number):string {
  const seconds=Math.floor(milliseconds/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
  return hours>0?`${hours}:${String(minutes%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:`${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
export function workSummaryText(state:CoastalState):string {
  return `${state.activity==='fish'?'낚시':'채집'} ${workTimeText(state.workTimeMs)} · ${state.activity==='fish'?'물고기':'나무'} +${format.format(state.workAmount)}`;
}
