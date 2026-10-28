import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { decodeBackup, initialState, SaveQueue, type AppState } from './core/state';
import { nextRevision, PendingOperations } from './core/lifecycle';
import * as platform from './platform';
import Mine from './games/Mine.tsx';
import Garden from './games/Garden.tsx';
import { reduceMine, type MineAction } from './games/mine';
import { reduceGarden, type GardenAction } from './games/garden';
import Circuit from './games/Circuit.tsx';
import { reduceCircuit, type CircuitAction } from './games/circuit';
import { Sprite } from './games/Art';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const queue = useRef(new SaveQueue(platform.saveState));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState('불러오는 중');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [pendingBackup, setPendingBackup] = useState<AppState | null>(null);
  const [backupSchema, setBackupSchema] = useState(3);
  const [screen, setScreen] = useState<'mine' | 'garden' | 'circuit' | 'manage'>('mine');
  const [visible, setVisible] = useState(() => !document.hidden);
  const [saveFailed, setSaveFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const changing = useRef(false);
  const closing = useRef(false);
  const operations = useRef(new PendingOperations());

  useEffect(() => {
    const updateVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  function runOperation(operation: () => Promise<void>) {
    if (closing.current || changing.current) return Promise.resolve();
    changing.current = true;
    setBusy(true);
    return operations.current.run(async () => {
      try { await operation(); }
      finally { changing.current = false; setBusy(false); }
    });
  }

  function showState(next: AppState) {
    stateRef.current = next;
    setState(next);
  }

  async function persist(next: AppState) {
    setSaveStatus('저장 중');
    try {
      await queue.current.enqueue(next);
      if (stateRef.current?.revision === next.revision) {
        setSaveStatus('저장 완료');
        setSaveFailed(false);
      }
    } catch (cause) {
      setSaveStatus('저장 실패');
      setSaveFailed(true);
      setError(`자동 저장에 실패했습니다. ${errorMessage(cause)} 다시 시도해 주세요.`);
      throw cause;
    }
  }

  useEffect(() => {
    let active = true;
    const unlisteners: (() => void)[] = [];
    async function requestExit() {
      if (closing.current) return;
      closing.current = true;
      try {
        await operations.current.idle();
        await queue.current.flush();
        await getCurrentWindow().destroy();
      } catch (cause) {
        setError(`저장을 마치지 못해 창을 닫지 않았습니다. ${errorMessage(cause)}`);
      } finally {
        closing.current = false;
      }
    }
    async function start() {
      try {
        if (platform.desktop) {
          const stopClose = await getCurrentWindow().onCloseRequested((event) => {
            event.preventDefault();
            void requestExit();
          });
          if (!active) { stopClose(); return; }
          unlisteners.push(stopClose);
          const stopExit = await listen('request-exit', () => { void requestExit(); });
          if (!active) { stopExit(); return; }
          unlisteners.push(stopExit);
          const stopNativeError = await listen<string>('native-error', (event) => setError(event.payload));
          if (!active) { stopNativeError(); return; }
          unlisteners.push(stopNativeError);
        }
        const stored = await platform.loadState();
        if (!active) return;
        const next = stored ?? initialState();
        showState(next);
        await platform.applyWindow(next.settings);
        if (!stored) await persist(next);
        else setSaveStatus('저장 완료');
      } catch (cause) {
        if (active) {
          setError(`기록을 불러오지 못했습니다. 원본은 그대로 보존했습니다. ${errorMessage(cause)} 백업에서 복원할 수 있습니다.`);
          setSaveStatus('확인 필요');
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void operations.current.run(start);
    return () => { active = false; unlisteners.forEach((stop) => stop()); };
  }, []);

  async function changeSetting(key: keyof AppState['settings'], value: boolean) {
    const current = stateRef.current;
    if (!ready || !current) return;
    setError('');
    setNote('');
    try {
      const settings = { ...current.settings, [key]: value };
      await platform.applyWindow(settings);
      const next = { ...current, settings, revision: nextRevision(current.revision), updatedAt: new Date().toISOString() };
      showState(next);
      await persist(next);
    } catch (cause) {
      setError(`설정을 적용하거나 저장하지 못했습니다. ${errorMessage(cause)}`);
    }
  }

  async function play(game: 'mine' | 'garden' | 'circuit', action: MineAction | GardenAction | CircuitAction) {
    const current = stateRef.current;
    if (!ready || !current || pendingBackup || saveFailed) return;
    const games = game === 'mine'
      ? { ...current.games, mine: reduceMine(current.games.mine, action as MineAction) }
      : game === 'garden' ? { ...current.games, garden: reduceGarden(current.games.garden, action as GardenAction, Date.now()) }
      : { ...current.games, circuit: reduceCircuit(current.games.circuit, action as CircuitAction) };
    if (games[game] === current.games[game]) return;
    setError('');
    setNote('');
    const next: AppState = { ...current, games, revision: nextRevision(current.revision), updatedAt: new Date().toISOString() };
    showState(next);
    try { await persist(next); } catch { /* Preserve unsaved progress and show retry. */ }
  }

  async function retrySave() {
    if (!stateRef.current) return;
    setError('');
    try { await persist(stateRef.current); } catch { /* persist displays the recovery action. */ }
  }

  async function handleExport() {
    if (!stateRef.current) return;
    setError('');
    setNote('');
    try {
      await queue.current.flush();
      const path = await platform.exportBackup(stateRef.current);
      if (path) setNote('백업 파일을 내보냈습니다.');
    } catch (cause) { setError(`백업을 내보내지 못했습니다. ${errorMessage(cause)}`); }
  }

  function previewBackup(text: string) {
    setError('');
    setNote('');
    setPendingBackup(null);
    try {
      const decoded = decodeBackup(text);
      setBackupSchema(JSON.parse(text).state.schemaVersion);
      setPendingBackup(decoded);
    }
    catch (cause) { setError(`이 파일을 복원할 수 없습니다. ${errorMessage(cause)} 현재 기록은 변경하지 않았습니다.`); }
  }

  async function handleImport() {
    if (!platform.desktop) { fileInput.current?.click(); return; }
    setError('');
    setNote('');
    try {
      const text = await platform.readNativeBackup();
      if (text !== null) previewBackup(text);
    } catch (cause) { setError(`백업 파일을 읽지 못했습니다. ${errorMessage(cause)}`); }
  }

  async function confirmRestore() {
    if (!pendingBackup) return;
    setError('');
    try {
      await queue.current.flush();
      const next: AppState = { ...pendingBackup, revision: nextRevision(stateRef.current?.revision ?? 0, pendingBackup.revision), updatedAt: new Date().toISOString() };
      await platform.restoreState(next);
      showState(next);
      setPendingBackup(null);
      setSaveFailed(false);
      setSaveStatus('저장 완료');
      setNote('복원 완료. 이전 기록도 별도 보관했습니다.');
      try { await platform.applyWindow(next.settings); }
      catch (cause) { setError(`기록은 복원했지만 창 설정 적용에 실패했습니다. ${errorMessage(cause)}`); }
    } catch (cause) { setError(`복원하지 못했습니다. ${errorMessage(cause)} 현재 기록을 확인하고 다시 시도해 주세요.`); }
  }

  const compact = state?.settings.compact ?? false;
  const gameDisabled = !ready || !state || busy || !!pendingBackup || saveFailed;
  return (
    <div className={`shell${compact ? ' compact' : ` shell-game${screen === 'manage' ? ' shell-manage' : ''}`}${!visible ? ' motion-paused' : ''}`}>
      <header className="titlebar">
        <span className="brand" data-tauri-drag-region><span data-tauri-drag-region>CornerBits</span></span>
        {compact && <span className="compact-status" role="status" aria-live="polite">{saveStatus}</span>}
        <div className="window-actions">
          <button className="window-button" type="button" title={compact ? '펼치기' : '막대로 축소'} aria-label={compact ? '펼치기' : '막대로 축소'} disabled={!ready || !state || busy || !!pendingBackup} onClick={() => void runOperation(() => changeSetting('compact', !compact))}>{compact ? '펼침' : <Sprite atlas="charms" frame={15} />}</button>
          {platform.desktop && <button className="window-button" aria-label="종료" onClick={() => void platform.closeWindow().catch((cause) => setError(errorMessage(cause)))}>×</button>}
        </div>
      </header>
      {!compact && <main>
        <nav className="game-nav" aria-label="화면 선택">
          <button type="button" aria-label="광산" title="광산 친구들" aria-pressed={screen === 'mine'} disabled={busy || !!pendingBackup} onClick={() => setScreen('mine')}><Sprite atlas="mine" frame={0} /></button>
          <button type="button" aria-label="정원" title="정원 친구들" aria-pressed={screen === 'garden'} disabled={busy || !!pendingBackup} onClick={() => setScreen('garden')}><Sprite atlas="garden" frame={6} /></button>
          <button type="button" aria-label="회로" title="전구 친구들 · 회로 연결" aria-pressed={screen === 'circuit'} disabled={busy || !!pendingBackup} onClick={() => setScreen('circuit')}><Sprite atlas="charms" frame={1} /></button>
          <button type="button" aria-label="관리" title="기록 보관함" aria-pressed={screen === 'manage'} disabled={busy || !!pendingBackup} onClick={() => setScreen('manage')}><Sprite atlas="charms" frame={4} /></button>
        </nav>
        <section className="save-summary" aria-label="저장 상태">
          <span className="save-state" role="status" aria-live="polite" title={state ? `마지막 저장 ${dateLabel(state.updatedAt)}` : undefined}>{saveStatus}</span>
          {screen === 'manage' && <span className="saved-time">{state ? dateLabel(state.updatedAt) : '기록 확인 중'}</span>}
        </section>
        {(error || saveFailed) && <div className="message error" role="alert">{error || '자동 저장에 실패했습니다. 다시 시도해 주세요.'}{saveFailed && <button type="button" disabled={busy} onClick={() => void runOperation(retrySave)}>저장 다시 시도</button>}</div>}
        {note && <p className="message" aria-live="polite">{note}</p>}
        {state && screen === 'mine' && <Mine state={state.games.mine} disabled={gameDisabled} onAction={(action) => void runOperation(() => play('mine', action))} />}
        {state && screen === 'garden' && <Garden state={state.games.garden} disabled={gameDisabled} onAction={(action) => void runOperation(() => play('garden', action))} />}
        {state && screen === 'circuit' && <Circuit state={state.games.circuit} disabled={gameDisabled} onAction={(action) => void runOperation(() => play('circuit', action))} />}
        {!state && screen !== 'manage' && <p className="description">{ready ? '기록을 확인할 수 없습니다. 관리 화면에서 백업을 복원해 주세요.' : '기록을 불러오고 있습니다.'}</p>}
        {screen === 'manage' && <>
        <h1 className="sr-only">데이터 관리</h1>
        <section className="backup-section" aria-label="백업 관리">
          <Sprite atlas="charms" frame={4} className="keepsake-art" />
          <p className="keepsake-caption">세 친구의 기록 보관함</p>
          <div className="backup-actions">
            <button type="button" className="picture-button" aria-label="백업 내보내기" title="백업 내보내기 · 세 게임과 설정을 파일로 보관" disabled={!ready || !state || busy || !!pendingBackup} onClick={() => void runOperation(handleExport)}><Sprite atlas="charms" frame={5} /></button>
            <button type="button" className="picture-button" aria-label="백업에서 복원" title="백업에서 복원 · 보관한 기록 불러오기" disabled={!ready || busy || !!pendingBackup} onClick={() => void runOperation(handleImport)}><Sprite atlas="charms" frame={6} /></button>
          </div>
          <input ref={fileInput} type="file" accept=".cornerbits,application/json" className="sr-only" tabIndex={-1} aria-label="백업 파일 선택" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { setError('백업 파일은 2 MiB 이하여야 합니다. 현재 기록은 변경하지 않았습니다.'); return; }
            void runOperation(async () => {
              try { previewBackup(await file.text()); }
              catch (cause) { setError(`파일을 읽지 못했습니다. ${errorMessage(cause)}`); }
            });
          }} />
        </section>
        <details className="widget-info">
          <summary aria-label="보관함 사용 안내" title="보관함 사용 안내"><Sprite atlas="charms" frame={8} /></summary>
          <div className="widget-help">
            <p className="section-label">바탕화면 위젯</p>
            <p className="description">광산·정원·전구 그림으로 세 게임을 바꿉니다. 그림에 마우스를 두면 설명이 나타납니다.</p>
            <p className="description">위쪽 제목을 끌어 위치를 옮기세요. 트레이의 ‘위젯 찾기’로 다시 볼 수 있습니다.</p>
            <p className="description">위쪽 화살표 상자는 백업 내보내기, 아래쪽 화살표 상자는 복원입니다. 세 게임의 진행도·도감·재화·설정을 함께 보관합니다.</p>
            <span className="version">v0.2.0</span>
          </div>
        </details>
        {pendingBackup && <section className="restore-confirm" aria-label="복원 확인">
          <p>{dateLabel(pendingBackup.updatedAt)} 기록으로 바꿉니다. 현재 기록은 먼저 별도 보관합니다.</p>
          <p>{backupSchema === 1 ? '1단계 설정 백업입니다. 복원하면 세 게임 진행도가 처음 상태로 바뀝니다.' : `광산 ${pendingBackup.games.mine.depth}층 · 채굴 ${pendingBackup.games.mine.totalMined}개 / 정원 수확 ${pendingBackup.games.garden.totalHarvests}회 · 화분 ${pendingBackup.games.garden.pots.length}개 / 회로 ${pendingBackup.games.circuit.records.filter((turns) => turns > 0).length}/300개 완료`}</p>
          {backupSchema === 2 && <p>광산·정원 백업입니다. 복원하면 회로 기록은 처음 상태로 바뀝니다.</p>}
          <div className="confirm-actions"><button type="button" className="primary" disabled={busy} onClick={() => void runOperation(confirmRestore)}>이 백업으로 복원</button><button type="button" disabled={busy} onClick={() => setPendingBackup(null)}>취소</button></div>
        </section>}
        </>}
        {(screen === 'manage' || !platform.desktop) && <footer>{platform.desktop ? '바탕화면 위젯 · 이 PC에 자동 저장' : '브라우저 미리보기 · 이 브라우저에만 저장'}</footer>}
      </main>}
      {compact && (error || saveFailed) && <button className="compact-error" aria-label="저장 오류 확인하고 펼치기" onClick={() => void runOperation(() => changeSetting('compact', false))}>저장 확인</button>}
    </div>
  );
}
