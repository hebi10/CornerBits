import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as platform from '../platform';
import CoastalScene from './CoastalScene';
import './coastal-shell.css';

const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

export default function CoastalApp() {
  const [compact, setCompact] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [infoOpen, setInfoOpen] = useState(false);
  const [busy, setBusy] = useState(platform.desktop);
  const [readError, setReadError] = useState('');
  const [windowError, setWindowError] = useState('');
  const active = useRef(true);
  const changing = useRef(platform.desktop);
  const closing = useRef(false);
  const pendingResize = useRef<Promise<void>>(Promise.resolve());
  const error = [readError, windowError].filter(Boolean).join(' ');

  async function requestExit(fromTray = false) {
    if (!platform.desktop || closing.current) return;
    closing.current = true;
    if (active.current) setBusy(true);
    try {
      await pendingResize.current.catch(() => undefined);
      if (fromTray) await getCurrentWindow().destroy();
      else await platform.closeWindow();
    } catch (cause) {
      closing.current = false;
      if (active.current) {
        setWindowError(`창을 닫지 못했습니다. ${message(cause)}`);
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];
    const visibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', visibility);

    async function subscribe<T>(event: string, handler: (payload: T) => void) {
      const stop = await listen<T>(event, ({ payload }) => handler(payload));
      if (cancelled) stop();
      else unlisteners.push(stop);
    }

    async function start() {
      if (!platform.desktop) return;
      try {
        await subscribe('request-exit', () => { void requestExit(true); });
        await subscribe<string>('native-error', (payload) => {
          if (!cancelled) setWindowError(payload);
        });
        if (cancelled || closing.current) return;
        try {
          const stored = await platform.inspectState();
          if (!cancelled) setCompact(stored?.settings.compact ?? false);
        } catch (cause) {
          if (!cancelled) setReadError(`기존 기록을 읽지 못했습니다. 원본은 보존했습니다. ${message(cause)}`);
        }
        if (cancelled || closing.current) return;
        await platform.applyWindow({ alwaysOnTop: false, compact: false });
        if (!cancelled && !closing.current) setCompact(false);
      } catch (cause) {
        if (!cancelled) setWindowError(`화면을 준비하지 못했습니다. ${message(cause)}`);
      } finally {
        changing.current = false;
        if (!cancelled && !closing.current) setBusy(false);
      }
    }

    pendingResize.current = start();
    return () => {
      cancelled = true;
      active.current = false;
      document.removeEventListener('visibilitychange', visibility);
      unlisteners.forEach(stop => stop());
    };
  }, []);

  async function resize(nextCompact: boolean) {
    if (changing.current || closing.current) return false;
    changing.current = true;
    setBusy(true);
    setWindowError('');
    const operation = platform.applyWindow({ alwaysOnTop: false, compact: nextCompact });
    pendingResize.current = operation;
    try {
      await operation;
      if (active.current && !closing.current) setCompact(nextCompact);
      return true;
    } catch (cause) {
      if (active.current) setWindowError(`화면 크기를 바꾸지 못했습니다. ${message(cause)}`);
      return false;
    } finally {
      changing.current = false;
      if (active.current && !closing.current) setBusy(false);
    }
  }

  async function showInfo() {
    if (compact && !await resize(false)) return;
    if (active.current) setInfoOpen(value => !value);
  }

  const scenePaused = paused || hidden || compact || infoOpen || busy;
  return <div className={`coast-shell${compact ? ' coast-compact' : ''}`} data-paused={scenePaused}>
    <header className="coast-titlebar">
      <span className="coast-drag-handle" data-tauri-drag-region title="위쪽 여백을 끌어 위치를 옮기세요">
        <span data-tauri-drag-region>해안 생활</span>
      </span>
      <div className="coast-window-controls">
        <button type="button" aria-label={paused ? '움직임 재생' : '움직임 정지'} title={paused ? '움직임 재생' : '움직임 정지'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? '재생' : '정지'}</button>
        <button type="button" aria-label={compact && error ? '오류 확인하고 펼치기' : '화면 안내'} title={compact && error ? error : '화면 체험 안내'} aria-expanded={infoOpen && !compact} disabled={busy} onClick={() => void showInfo()}>{compact && error ? '오류' : '안내'}</button>
        <button type="button" aria-label={compact ? '펼치기' : '막대로 축소'} title={compact ? '펼치기' : '막대로 축소'} disabled={busy} onClick={() => void resize(!compact)}>{compact ? '펼침' : '접기'}</button>
        {platform.desktop && <button type="button" aria-label="종료" title="종료" disabled={busy} onClick={() => void requestExit()}>닫기</button>}
      </div>
    </header>
    <main className="coast-scene-area" hidden={compact}>
      <CoastalScene paused={scenePaused}/>
    </main>
    {!compact && error && <p className="coast-shell-error" role="alert">{error}</p>}
    {!compact && infoOpen && <section className="coast-screen-info" aria-label="화면 체험 안내">
      <p>화면 체험판 · 부두에서 낚시, 해변에서 나무를 주워 집을 꾸며 보세요.</p>
      <p>이번 행동은 닫으면 초기화되며 기존 게임 기록은 바꾸지 않습니다.</p>
      <p>위쪽 여백을 끌어 위치를 옮깁니다. ‘정지’로 움직임을 잠시 멈출 수 있습니다.</p>
    </section>}
  </div>;
}
