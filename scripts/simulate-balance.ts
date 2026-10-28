import { SESSION_MINUTES, simulateCircuit, simulateGarden, simulateMine } from './balance-model.ts';

const mine = simulateMine();
const gardens = SESSION_MINUTES.map((sessionMinutes) => simulateGarden({ sessionMinutes }));
const circuit = simulateCircuit();
const round = (value: number) => Math.round(value * 100) / 100;

console.log('CornerBits 진행량 모델 — 실제 사람의 60일 플레이 검증이나 일일 제한이 아닙니다.');
console.log('광산: 타격 1초, 매층 판매·층 이동 각 2초, 가능한 강화 3초. 1000층 전체 채굴.');
console.log('정원: 하루 한 번 방문, 성공 행동 1초, 매 행동 전 잔여 예산 확인. 최신 해금 씨앗과 가능한 화분 확장.');
console.log('정원의 세션 시간에는 성장 대기를 포함하며, 앱을 닫은 동안의 성장도 계산합니다.');
console.log('정원은 가능한 행동을 즉시 고르는 모델이며, 씨앗 선택이나 화면 판독에 쓰는 별도 시간은 가정하지 않습니다.');
console.log('회로: generator1의 300개를 한 정답 방향으로 풀이. 회전 0.8초, 다음 2초, 생각 시간 4×4 90초·5×5 155초 가정.');
console.table(SESSION_MINUTES.map((sessionMinutes) => ({
  '하루 게임별 분': sessionMinutes,
  '광산 예상 일': round(mine.estimates.find((entry) => entry.sessionMinutes === sessionMinutes)!.days),
  '정원 방문 일': gardens.find((entry) => entry.sessionMinutes === sessionMinutes)!.days,
  '회로 예상 일': round(circuit.estimates.find((entry) => entry.sessionMinutes === sessionMinutes)!.days),
})));
console.log('분량/입력/대기 상세');
console.log(JSON.stringify({
  mine: { actions: mine.actions, upgradeFloors: mine.upgradeFloors, inputMinutes: round(mine.inputSeconds / 60) },
  garden: gardens.map((garden) => ({
    sessionMinutes: garden.sessionMinutes, days: garden.days, twelvePotsDay: garden.twelvePotsDay,
    allSeedsUnlockedDay: garden.allSeedsUnlockedDay, actions: garden.actions,
    inputMinutes: round(garden.inputSeconds / 60), growthWaitMinutes: round(garden.waitingSeconds / 60),
    averageDailyInputMinutes: round(garden.inputSeconds / 60 / garden.days),
    maximumSessionSeconds: Math.max(...garden.sessions.map((session) => session.elapsedSeconds)),
  })),
  circuit: {
    canonicalPathRotations: circuit.rotations,
    inputMinutes: round(circuit.inputSeconds / 60), assumedThinkingMinutes: round(circuit.thinkingSeconds / 60),
    totalMinutes: round(circuit.totalSeconds / 60),
  },
}, null, 2));
console.log('완료 시점은 클릭 속도·숙련도·강화/심기 선택·접속 패턴에 따라 달라집니다. 성장 대기는 능동 조작 시간이 아닙니다.');
