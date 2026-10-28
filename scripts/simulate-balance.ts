import { simulateGarden } from './balance-model.ts';
import { simulateFishing } from './fishing-model.ts';
import { simulateSwordSeeds } from './sword-model.ts';
const minutes = [10,12.5,15];
const gardens=minutes.map(sessionMinutes=>simulateGarden({sessionMinutes}));
const fishing=minutes.map(sessionMinutes=>simulateFishing({sessionMinutes}));
const sword=simulateSwordSeeds(100,'mixed');
const round=(n:number)=>Math.round(n*100)/100;
console.log('CornerBits v0.4 진행량 모델 — 실제 사람의 60일 체험이나 일일 제한이 아닙니다.');
console.log('낚시: 하루 한 번, 10% 놓침·무료 미끼2·지역마다 미발견 수집·가능한 강화. 37초 미만 남으면 다음 방문으로 넘깁니다.');
console.log('정원: 하루 한 번, 성공 행동1초·최신 씨앗·가능한 확장. 성장 대기와 오프라인 성장을 포함합니다.');
console.log('검: 100시드, 성공 행동1초·연마4회 중1회 조준·6단계마다 가능한 안정강화(실패보정30 이상이면 일반) 전략의 중앙값.');
console.table(minutes.map((m,i)=>({ '하루 게임별 분':m,'낚시 방문 일':fishing[i].days,'정원 방문 일':gardens[i].days,'검 중앙 예상 일':round(sword.medianSeconds/(m*60)) })));
console.log('하루12.5분 상세 — 입력과 대기를 구분합니다.');
console.log(JSON.stringify({
 fishing:{goal:1500,casts:fishing[1].state.casts,misses:fishing[1].state.misses,inputMinutes:round(fishing[1].inputSeconds/60),biteWaitMinutes:round(fishing[1].waitingSeconds/60),unusedSessionMinutes:round(fishing[1].unusedSeconds/60)},
 garden:{inputMinutes:round(gardens[1].inputSeconds/60),growthWaitMinutes:round(gardens[1].waitingSeconds/60)},
 sword:{medianMinutes:round(sword.medianSeconds/60),tenthPercentileDays:round(sword.tenthPercentileSeconds/750),ninetiethPercentileDays:round(sword.ninetiethPercentileSeconds/750),minimumDays:round(sword.minimumSeconds/750),maximumDays:round(sword.maximumSeconds/750),meanInputMinutes:round(sword.samples.reduce((sum,s)=>sum+s.inputSeconds,0)/sword.samples.length/60),meanCooldownMinutes:round(sword.samples.reduce((sum,s)=>sum+s.cooldownSeconds,0)/sword.samples.length/60)}
},null,2));
console.log('시간에는 입질·성장·연마 대기가 포함됩니다. 타이밍, 미끼/씨앗 선택, 강화 전략과 운에 따라 달라지며 순수 능동 조작10~15분을 뜻하지 않습니다.');
