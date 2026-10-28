import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { decodeBackup, initialState, SaveQueue, type AppState } from './core/state';
import { nextRevision, PendingOperations } from './core/lifecycle';
import * as platform from './platform';

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
  const [saveFailed, setSaveFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const changing = useRef(false);
  const closing = useRef(false);
  const operations = useRef(new PendingOperations());

  function runOperation(operation: () => Promise<void>) {
    if (closing.current) return Promise.resolve();
    return operations.current.run(operation);
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
    if (!ready || !current || changing.current || busy) return;
    changing.current = true;
    setBusy(true);
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
    } finally {
      changing.current = false;
      setBusy(false);
    }
  }

  async function retrySave() {
    if (!stateRef.current || busy) return;
    setBusy(true);
    setError('');
    try { await persist(stateRef.current); } catch { /* persist displays the recovery action. */ }
    finally { setBusy(false); }
  }

  async function handleExport() {
    if (!stateRef.current || busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      await queue.current.flush();
      const path = await platform.exportBackup(stateRef.current);
      if (path) setNote('백업 파일을 내보냈습니다.');
    } catch (cause) { setError(`백업을 내보내지 못했습니다. ${errorMessage(cause)}`); }
    finally { setBusy(false); }
  }

  function previewBackup(text: string) {
    setError('');
    setNote('');
    setPendingBackup(null);
    try { setPendingBackup(decodeBackup(text)); }
    catch (cause) { setError(`이 파일을 복원할 수 없습니다. ${errorMessage(cause)} 현재 기록은 변경하지 않았습니다.`); }
  }

  async function handleImport() {
    if (!platform.desktop) { fileInput.current?.click(); return; }
    setBusy(true);
    setError('');
    setNote('');
    try {
      const text = await platform.readNativeBackup();
      if (text !== null) previewBackup(text);
    } catch (cause) { setError(`백업 파일을 읽지 못했습니다. ${errorMessage(cause)}`); }
    finally { setBusy(false); }
  }

  async function confirmRestore() {
    if (!pendingBackup || busy) return;
    setBusy(true);
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
    finally { setBusy(false); }
  }

  const compact = state?.settings.compact ?? false;
  return (
    <div className={`shell${compact ? ' compact' : ''}`}>
      <header className="titlebar">
        <span className="brand" data-tauri-drag-region>CornerBits</span>
        {compact && <span className="compact-status" role="status" aria-live="polite">{saveStatus}</span>}
        <div className="window-actions">
          <button className="window-button" type="button" aria-label={compact ? '펼치기' : '막대로 축소'} disabled={!ready || !state || busy} onClick={() => void runOperation(() => changeSetting('compact', !compact))}>{compact ? '펼침' : '축소'}</button>
          {platform.desktop && <button className="window-button" aria-label="최소화" onClick={() => void platform.minimizeWindow().catch((cause) => setError(errorMessage(cause)))}>−</button>}
          {platform.desktop && <button className="window-button" aria-label="종료" onClick={() => void platform.closeWindow().catch((cause) => setError(errorMessage(cause)))}>×</button>}
        </div>
      </header>
      {!compact && <main>
        <div className="page-heading"><h1>데이터 관리</h1><span className="version">v0.0.1</span></div>
        <section className="save-summary" aria-label="저장 상태">
          <span className="save-state" role="status" aria-live="polite">{saveStatus}</span>
          <span className="saved-time">{state ? dateLabel(state.updatedAt) : '기록 확인 중'}</span>
        </section>
        <fieldset disabled={!ready || !state || busy || !!pendingBackup}>
          <legend className="sr-only">창 설정</legend>
          <label className="setting-row"><span>항상 위에 표시</span><input type="checkbox" checked={state?.settings.alwaysOnTop ?? false} onChange={(event) => { const checked = event.target.checked; void runOperation(() => changeSetting('alwaysOnTop', checked)); }} /></label>
        </fieldset>
        <section className="backup-section" aria-label="백업 관리">
          <p className="section-label">기록 보관</p>
          <p className="description">설정은 자동으로 저장됩니다.<br />백업 파일로 다른 PC에서도 이어가세요.</p>
          <div className="backup-actions">
            <button type="button" disabled={!ready || !state || busy || !!pendingBackup} onClick={() => void runOperation(handleExport)}>백업 내보내기</button>
            <button type="button" disabled={!ready || busy || !!pendingBackup} onClick={() => void runOperation(handleImport)}>백업에서 복원</button>
          </div>
          <input ref={fileInput} type="file" accept=".cornerbits,application/json" className="sr-only" tabIndex={-1} aria-label="백업 파일 선택" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { setError('백업 파일은 2 MiB 이하여야 합니다. 현재 기록은 변경하지 않았습니다.'); return; }
            void file.text().then(previewBackup).catch((cause) => setError(`파일을 읽지 못했습니다. ${errorMessage(cause)}`));
          }} />
        </section>
        {pendingBackup && <section className="restore-confirm" aria-label="복원 확인">
          <p>{dateLabel(pendingBackup.updatedAt)} 기록으로 바꿉니다. 현재 기록은 먼저 별도 보관합니다.</p>
          <div className="confirm-actions"><button type="button" className="primary" disabled={busy} onClick={() => void runOperation(confirmRestore)}>이 백업으로 복원</button><button type="button" disabled={busy} onClick={() => setPendingBackup(null)}>취소</button></div>
        </section>}
        {(error || saveFailed) && <div className="message error" role="alert">{error || '자동 저장에 실패했습니다. 다시 시도해 주세요.'}{saveFailed && <button type="button" disabled={busy} onClick={() => void runOperation(retrySave)}>저장 다시 시도</button>}</div>}
        {note && <p className="message" aria-live="polite">{note}</p>}
        <footer>{platform.desktop ? '이 PC에 저장 · 오프라인' : '브라우저 미리보기 · 이 브라우저에만 저장'}</footer>
      </main>}
      {compact && (error || saveFailed) && <button className="compact-error" aria-label="저장 오류 확인하고 펼치기" onClick={() => void runOperation(() => changeSetting('compact', false))}>저장 확인</button>}
    </div>
  );
}
