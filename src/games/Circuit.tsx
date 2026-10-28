import { CIRCUIT_CLEAR_LIMIT, CIRCUIT_STAGES, CIRCUIT_TURN_LIMIT, circuitStatus, completedCircuits, puzzleForStage, type CircuitAction, type CircuitState } from './circuit';
import { Sprite } from './Art';
import './circuit.css';

const PORTS = [{ bit: 1, side: 'north', label: '위' }, { bit: 2, side: 'east', label: '오른쪽' }, { bit: 4, side: 'south', label: '아래' }, { bit: 8, side: 'west', label: '왼쪽' }];

export default function Circuit({ state, onAction, disabled }: { state: CircuitState; onAction: (action: CircuitAction) => void; disabled: boolean }) {
  const puzzle = puzzleForStage(state.stage);
  const status = circuitStatus(state);
  const completed = completedCircuits(state);
  const unlocked = Math.min(CIRCUIT_STAGES, completed + 1);
  const turnLimit = state.turns >= CIRCUIT_TURN_LIMIT;
  const clearLimit = state.totalClears >= CIRCUIT_CLEAR_LIMIT;
  const untouched = state.turns === 0 && state.rotations.every((rotation, index) => rotation === puzzle.initialRotations[index]);

  return <section className={`circuit-game${status.solved ? ' circuit-solved' : ''}`} aria-label="회로 연결" title={`${state.stage}번 회로 · ${status.connectedCount}/${state.rotations.length} 연결`}>
    <h1 className="sr-only">회로 연결</h1>
    <div className="sr-only">
      <span>회로 {state.stage}</span>
      <span role="status" aria-live="polite">{status.solved ? '모든 전구가 켜졌어요' : `${status.connectedCount}/${state.rotations.length} 연결`}</span>
    </div>
    <div className={`circuit-board size-${puzzle.size}`} role="group" aria-label={`${puzzle.size} 곱하기 ${puzzle.size} 회로 퍼즐`}>
      {status.masks.map((mask, index) => {
        const connected = status.connected[index];
        const directions = PORTS.filter((port) => mask & port.bit).map((port) => port.label).join('·');
        return <button
          key={index}
          type="button"
          className={`circuit-tile${connected ? ' powered' : ''}`}
          disabled={disabled || status.solved || turnLimit || clearLimit}
          aria-label={`회로 ${index + 1}번, ${index === 0 ? '배터리, ' : ''}${connected ? '전기 연결됨' : '전기 연결 안 됨'}, 연결 방향 ${directions}, 시계 방향으로 회전`}
          title={`${index === 0 ? '배터리' : `${index + 1}번 전구`} · ${directions} · 시계 방향으로 회전`}
          onClick={() => onAction({ type: 'rotate', index })}
        >
          <span className="circuit-wires" aria-hidden="true">{PORTS.filter((port) => mask & port.bit).map((port) => <span key={port.bit} className={`circuit-wire ${port.side}`} />)}</span>
          <Sprite atlas="charms" frame={index === 0 ? 2 : connected ? 1 : 0} className="circuit-bulb" />
        </button>;
      })}
    </div>
    <div className="circuit-actions">
      <button type="button" aria-label="현재 회로 다시 시작" title="같은 회로 다시 시작" disabled={disabled || untouched} onClick={() => onAction({ type: 'retry' })}><Sprite atlas="charms" frame={3} /></button>
      <button type="button" aria-label="다음 회로" title={state.stage === CIRCUIT_STAGES ? '마지막 회로입니다' : '완료한 뒤 다음 회로로'} disabled={disabled || !status.solved || state.records[state.stage - 1] === 0 || state.stage === CIRCUIT_STAGES} onClick={() => onAction({ type: 'next' })}><Sprite atlas="charms" frame={10} /></button>
    </div>
    {(turnLimit || clearLimit) && <p className="circuit-note" role="status">{clearLimit ? '누적 완료 한도에 도달했습니다.' : '회전 한도에 도달했습니다. 다시 시작할 수 있어요.'}</p>}
    <details className="circuit-details">
      <summary aria-label={`회로 기록과 도움말, ${completed}/300 완료`} title={`회로 기록과 도움말 · ${completed}/300 완료`}><Sprite atlas="charms" frame={8} /></summary>
      <p>{state.stage}번 회로 · {status.connectedCount}/{state.rotations.length} 연결 · {completed}/300 완료</p>
      <p>전구를 누르면 연결선이 시계 방향으로 돌아가요. 배터리에서 모든 전구까지 전기를 연결해 주세요. 선 끝도 모두 맞아야 해요.</p>
      <p>현재 {state.turns.toLocaleString('ko-KR')}회 회전 · {state.records[state.stage - 1] ? `내 기록 ${state.records[state.stage - 1].toLocaleString('ko-KR')}회` : '아직 완료 기록이 없어요'}</p>
      <label className="circuit-select">회로 고르기<select aria-label="회로 고르기" value={state.stage} disabled={disabled} onChange={(event) => onAction({ type: 'select', stage: Number(event.target.value) })}>
        {Array.from({ length: unlocked }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}번{state.records[index] ? ` · ${state.records[index]}회` : ' · 도전 중'}</option>)}
      </select></label>
      <p>완료한 회로에 다시 도전해 내 기록을 줄여 보세요. 누적 {state.totalClears.toLocaleString('ko-KR')}회 완료했어요.</p>
    </details>
  </section>;
}
