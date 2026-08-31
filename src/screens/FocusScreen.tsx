import React, { useRef } from 'react';
import { CaretLeft, Pause, Play, Check, X } from '@phosphor-icons/react';
import { Chip } from '../components/Chip';
import { ReButton } from '../components/ReButton';
import { ApiError, friendlyError, todayApi } from '../lib/api';
import { readFocusSession, removeFocusSession, writeFocusSession, type RunIntent } from '../lib/executionSync';
import type { Task } from '../types';

interface FocusScreenProps {
  // 잘못된 상태(force navigation, 빈 tasks 등)로 마운트되어도 폭발하지 않도록 null 허용.
  task: Task | null;
  // 이어하기용 초기 경과(분). 새로 시작이면 0.
  elapsedMin: number;
  totalMin: number;
  onPause: () => void;
  onComplete: () => void;
  onBack: () => void;
  // 실 executionId 확보 시 컨트롤러로 리프트 — 실패→회복→수락 화면들이 이 값으로
  // reflectionApi.tagExecution/recoveryApi.generateProposals 등을 실호출한다(#80).
  onExecutionStart?: (taskId: string, executionId: string) => void;
}

export function FocusScreen({ task, elapsedMin, totalMin, onComplete, onBack, onExecutionStart }: FocusScreenProps) {
  type SyncState = 'pending' | 'synced' | 'retrying' | 'failed';
  const executionIdRef = useRef<string | null>(null);
  const queuedRunIntentRef = useRef<RunIntent | null>(null);
  const [syncState, setSyncState] = React.useState<SyncState>('pending');
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [failedMutation, setFailedMutation] = React.useState<'start' | 'run' | 'check-in' | null>(null);
  const [completing, setCompleting] = React.useState(false);
  const onExecutionStartRef = useRef(onExecutionStart);
  onExecutionStartRef.current = onExecutionStart;

  // 타이머 — 순수 setInterval 카운트업은 백그라운드/슬립 시 throttle 되어 시간이 어긋난다.
  // 대신 "시작 시각(startAt)" 타임스탬프에서 매번 재계산하고, visibilitychange·새로고침
  // (sessionStorage) 에도 경과를 복원한다(S13 브라우저 sleep 대응).
  const startAtRef = useRef(0);            // epoch ms
  const pausedMsRef = useRef(0);           // 누적 일시정지 시간(ms)
  const pauseAtRef = useRef<number | null>(null); // 현재 정지 시작 시각(정지 중일 때만)
  const [elapsedSec, setElapsedSec] = React.useState(Math.max(0, Math.round(elapsedMin * 60)));
  const [running, setRunning] = React.useState(true);
  const runningRef = useRef(true);
  runningRef.current = running;
  const [startLabel, setStartLabel] = React.useState('');

  const recompute = React.useCallback(() => {
    if (!startAtRef.current) return;
    const now = Date.now();
    const extra = pauseAtRef.current ? now - pauseAtRef.current : 0;
    setElapsedSec(Math.max(0, Math.round((now - startAtRef.current - pausedMsRef.current - extra) / 1000)));
  }, []);

  const persist = React.useCallback((overrides: { executionId?: string | null; queuedIntent?: RunIntent | null; running?: boolean } = {}) => {
    if (!task) return;
    try {
      writeFocusSession(sessionStorage, task.id, {
        version: 1,
        startAt: startAtRef.current,
        pausedMs: pausedMsRef.current,
        pauseAt: pauseAtRef.current,
        running: overrides.running ?? runningRef.current,
        executionId: overrides.executionId !== undefined ? overrides.executionId : executionIdRef.current,
        queuedIntent: overrides.queuedIntent !== undefined ? overrides.queuedIntent : queuedRunIntentRef.current,
      });
    } catch { /* ignore */ }
  }, [task?.id]);

  // 최초 마운트 — sessionStorage 에 진행 중 세션이 있으면 복원, 없으면 새로 시작.
  React.useEffect(() => {
    if (!task) return;
    let restored = false;
    try {
      const o = readFocusSession(sessionStorage, task.id);
      if (o) {
        startAtRef.current = o.startAt;
        pausedMsRef.current = o.pausedMs;
        pauseAtRef.current = o.pauseAt;
        executionIdRef.current = o.executionId;
        queuedRunIntentRef.current = o.queuedIntent;
        setRunning(o.running);
        if (o.executionId) onExecutionStartRef.current?.(task.id, o.executionId);
        restored = true;
      }
    } catch { /* ignore */ }
    if (!restored) {
      startAtRef.current = Date.now();
      pausedMsRef.current = 0;
      pauseAtRef.current = null;
      writeFocusSession(sessionStorage, task.id, {
        version: 1, startAt: startAtRef.current, pausedMs: 0, pauseAt: null,
        running: true, executionId: null, queuedIntent: null,
      });
    }
    setStartLabel(new Date(startAtRef.current).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }));
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // 매 초 재계산(타임스탬프 기준). 정지 중엔 멈춘다.
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(recompute, 1000);
    return () => clearInterval(id);
  }, [running, recompute]);

  // 백그라운드 복귀 시 재계산(슬립 드리프트 보정).
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') recompute(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [recompute]);

  const logMutationFailure = (mutation: string, err: unknown) => {
    console.warn('[execution] mutation failed', {
      mutation,
      status: err instanceof ApiError ? err.status : 'offline-or-network',
      code: err instanceof ApiError ? err.code : 'NETWORK_ERROR',
    });
  };

  const startExecution = React.useCallback(async (retry = false) => {
    if (!task || executionIdRef.current) return;
    setSyncState(retry ? 'retrying' : 'pending');
    setSyncError(null);
    setFailedMutation(null);
    try {
      const e = await todayApi.start(task.id);
      executionIdRef.current = e.executionId;
      onExecutionStartRef.current?.(task.id, e.executionId);
      persist({ executionId: e.executionId });
      setSyncState('synced');
      // start가 늦게 복구된 사이 사용자가 누른 마지막 pause/resume 의도만 적용한다.
      const queued = queuedRunIntentRef.current;
      if (queued) {
        await todayApi[queued](e.executionId);
        queuedRunIntentRef.current = null;
        persist({ executionId: e.executionId, queuedIntent: null });
      }
    } catch (err) {
      const mutation = executionIdRef.current ? 'run' : 'start';
      logMutationFailure(mutation, err);
      setSyncState('failed');
      setFailedMutation(mutation);
      setSyncError(mutation === 'run'
        ? '타이머 변경이 서버에 저장되지 않았어요. 다시 시도해 주세요.'
        : friendlyError(err, '집중 기록이 서버에 저장되지 않았어요. 타이머는 계속 사용할 수 있어요.'));
    }
  }, [task?.id]);

  const retrySync = async () => {
    if (!executionIdRef.current) {
      await startExecution(true);
      return;
    }
    const intent = queuedRunIntentRef.current;
    if (!intent) {
      setSyncState('synced');
      setSyncError(null);
      setFailedMutation(null);
      return;
    }
    setSyncState('retrying');
    setSyncError(null);
    setFailedMutation(null);
    try {
      await todayApi[intent](executionIdRef.current);
      queuedRunIntentRef.current = null;
      persist({ queuedIntent: null });
      setSyncState('synced');
    } catch (err) {
      logMutationFailure(intent, err);
      setSyncState('failed');
      setFailedMutation('run');
      setSyncError('타이머 변경이 서버에 저장되지 않았어요. 다시 시도해 주세요.');
    }
  };

  // 로컬 타이머는 네트워크 실패와 무관하게 시작하되, 서버 저장 상태는 명확히 분리한다(#284).
  React.useEffect(() => {
    if (!task) return;
    const restored = readFocusSession(sessionStorage, task.id);
    if (restored?.executionId) {
      executionIdRef.current = restored.executionId;
      queuedRunIntentRef.current = restored.queuedIntent;
      setSyncState(restored.queuedIntent ? 'failed' : 'synced');
      setFailedMutation(restored.queuedIntent ? 'run' : null);
      setSyncError(restored.queuedIntent ? '앱을 다시 연 뒤 아직 서버에 반영하지 못한 타이머 변경이 있어요.' : null);
      return;
    }
    executionIdRef.current = null;
    queuedRunIntentRef.current = restored?.queuedIntent ?? null;
    void startExecution();
  }, [task?.id, startExecution]);

  // task 없이 잘못 마운트된 경우 — 빈 흰 화면 대신 명확한 안내 + 뒤로가기.
  if (!task) {
    return (
      <div style={{ padding: '60px 24px', background: 'var(--surface-ground)', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 22, color: 'var(--text-1)' }}>시작할 카드가 없어요</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 260, margin: 0, lineHeight: 1.6 }}>오늘 화면에서 카드를 골라 시작해주세요.</p>
        <ReButton variant="primary" size="md" onClick={onBack}>오늘로 돌아가기</ReButton>
      </div>
    );
  }

  // 일시정지/재개 — 서버 실패 시 마지막 의도를 보존하고 미동기화 상태를 표시한다.
  const toggleRun = () => {
    const next = !running;
    if (next) {
      if (pauseAtRef.current) { pausedMsRef.current += Date.now() - pauseAtRef.current; pauseAtRef.current = null; }
    } else {
      pauseAtRef.current = Date.now();
    }
    setRunning(next);
    persist({ running: next });
    recompute();
    const intent = next ? 'resume' : 'pause';
    queuedRunIntentRef.current = intent;
    persist({ running: next, queuedIntent: intent });
    if (!executionIdRef.current) {
      setSyncState('failed');
      setFailedMutation('run');
      setSyncError('타이머 변경이 아직 서버에 저장되지 않았어요.');
      return;
    }
    setSyncState('pending');
    setSyncError(null);
    setFailedMutation(null);
    todayApi[intent](executionIdRef.current).then(
      () => { queuedRunIntentRef.current = null; persist({ queuedIntent: null }); setSyncState('synced'); setFailedMutation(null); },
      (err) => {
        logMutationFailure(intent, err);
        setSyncState('failed');
        setFailedMutation('run');
        setSyncError('타이머 변경이 서버에 저장되지 않았어요. 다시 시도해 주세요.');
      },
    );
  };

  const clearSession = () => { if (task) { try { removeFocusSession(sessionStorage, task.id); } catch { /* ignore */ } } };

  const handleComplete = async () => {
    if (completing) return;
    if (!executionIdRef.current) {
      setSyncState('failed');
      setFailedMutation('start');
      setSyncError('시작 기록이 저장되지 않아 완료할 수 없어요. 먼저 저장을 다시 시도해 주세요.');
      return;
    }
    setCompleting(true);
    setSyncState('pending');
    setSyncError(null);
    setFailedMutation(null);
    const status: 'done' | 'over_done' = elapsedSec > totalMin * 60 ? 'over_done' : 'done';
    try {
      await todayApi.checkIn(
        { executionId: executionIdRef.current, completionStatus: status },
        `check-${executionIdRef.current}`,
      );
      setSyncState('synced');
      clearSession();
      onComplete();
    } catch (err) {
      logMutationFailure('check-in', err);
      setSyncState('failed');
      setFailedMutation('check-in');
      setSyncError(friendlyError(err, '완료 기록을 저장하지 못했어요. 저장 전에는 완료로 처리되지 않으니 완료 버튼으로 다시 시도해 주세요.'));
    } finally {
      setCompleting(false);
    }
  };

  // 뒤로가기/중단은 결과 판정이 아니다. 로컬·서버 타이머를 멈춘 뒤 세션을 남겨
  // 오늘 화면에서 이어서 시작할 수 있게 한다. 완료는 handleComplete 성공 경로뿐이다.
  const handleExit = () => {
    if (running) {
      pauseAtRef.current = Date.now();
      setRunning(false);
      runningRef.current = false;
      queuedRunIntentRef.current = 'pause';
      persist({ running: false, queuedIntent: 'pause' });

      const executionId = executionIdRef.current;
      if (executionId) {
        void todayApi.pause(executionId).then(
          () => {
            queuedRunIntentRef.current = null;
            persist({ running: false, queuedIntent: null });
          },
          (err) => logMutationFailure('pause-on-exit', err),
        );
      }
    } else {
      persist({ running: false });
    }
    onBack();
  };

  const totalSec = Math.max(1, totalMin * 60);
  const pct = Math.min(elapsedSec / totalSec, 1);
  const mm = Math.floor(elapsedSec / 60);
  const ss = elapsedSec % 60;
  const timeLabel = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const remainSec = totalMin * 60 - elapsedSec;
  const remainLabel = remainSec > 0 ? `${Math.ceil(remainSec / 60)}분 남음` : `목표 달성 · +${Math.floor(-remainSec / 60)}분`;
  const R = 120;
  const circumference = 2 * Math.PI * R;

  return (
    <div style={{ padding: '12px 20px 110px', background: 'var(--surface-ground)', minHeight: '100%' }}>
      <button onClick={handleExit} style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-2)', padding: 0, marginBottom: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
        <CaretLeft size={20} /> Today
      </button>
      <Chip tone={running ? 'amber' : 'neutral'} style={{ marginBottom: 12 }}>
        {running ? '● 집중 중' : '❚❚ 일시정지됨'}
      </Chip>
      {syncState !== 'synced' && (
        <div role="status" aria-live="polite" style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, background: syncState === 'failed' ? '#FFF1ED' : 'var(--sand-100)', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
          <strong style={{ display: 'block', color: 'var(--text-1)', marginBottom: syncError ? 3 : 0 }}>
            {syncState === 'failed' ? '서버에 저장되지 않음' : syncState === 'retrying' ? '다시 저장하는 중…' : '서버에 저장하는 중…'}
          </strong>
          {syncError}
          {syncState === 'failed' && failedMutation !== 'check-in' && (
            <button type="button" onClick={() => void retrySync()} style={{ display: 'block', marginTop: 8, padding: 0, border: 0, background: 'transparent', color: 'var(--brand-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
              저장 다시 시도
            </button>
          )}
        </div>
      )}
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>{task.title}</h1>
      <p className="tnum" style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 36 }}>시작 {startLabel} · 목표 {totalMin}분</p>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 28px' }}>
        <svg width="280" height="280" viewBox="0 0 280 280">
          <circle cx="140" cy="140" r={R} stroke="var(--sand-200)" strokeWidth="10" fill="none" />
          <circle
            cx="140" cy="140" r={R} stroke={running ? 'var(--brand)' : 'var(--sand-300)'} strokeWidth="10" fill="none"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
            transform="rotate(-90 140 140)"
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 200ms' }}
          />
          <text x="140" y="138" textAnchor="middle" fontSize="52" fontWeight="700" fill="var(--text-1)" fontFamily="Pretendard Variable" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
            {timeLabel}
          </text>
          <text x="140" y="166" textAnchor="middle" fontSize="13" fill="var(--text-3)" fontFamily="Pretendard Variable" letterSpacing="0.08em">
            {remainLabel}
          </text>
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <ReButton variant="ghost" size="lg" full onClick={toggleRun}>
          {running ? <><Pause size={16} /> 멈춤</> : <><Play size={16} weight="fill" /> 이어서</>}
        </ReButton>
        <ReButton variant="ghost" size="lg" full onClick={handleExit}>
          <X size={16} /> 중단
        </ReButton>
        <ReButton variant="primary" size="lg" full onClick={() => void handleComplete()} disabled={completing || syncState === 'pending' || syncState === 'retrying'}>
          <Check size={16} /> {completing ? '저장 중…' : '완료'}
        </ReButton>
      </div>
    </div>
  );
}
