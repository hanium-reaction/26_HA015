import React, { useRef } from 'react';
import { CaretLeft, Pause, Play, Check, X } from '@phosphor-icons/react';
import { Chip } from '../components/Chip';
import { ReButton } from '../components/ReButton';
import { todayApi } from '../lib/api';
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
  // mock-and-replace: 백엔드 /today/* 일부 미구현. 시작/일시정지/완료를 시도하되 실패는 조용히.
  const executionIdRef = useRef<string | null>(null);

  // 타이머 — 순수 setInterval 카운트업은 백그라운드/슬립 시 throttle 되어 시간이 어긋난다.
  // 대신 "시작 시각(startAt)" 타임스탬프에서 매번 재계산하고, visibilitychange·새로고침
  // (sessionStorage) 에도 경과를 복원한다(S13 브라우저 sleep 대응).
  const storeKey = task ? `reaction.focus.${task.id}` : '';
  const startAtRef = useRef(0);            // epoch ms
  const pausedMsRef = useRef(0);           // 누적 일시정지 시간(ms)
  const pauseAtRef = useRef<number | null>(null); // 현재 정지 시작 시각(정지 중일 때만)
  const [elapsedSec, setElapsedSec] = React.useState(Math.max(0, Math.round(elapsedMin * 60)));
  const [running, setRunning] = React.useState(true);
  const [startLabel, setStartLabel] = React.useState('');

  const recompute = React.useCallback(() => {
    if (!startAtRef.current) return;
    const now = Date.now();
    const extra = pauseAtRef.current ? now - pauseAtRef.current : 0;
    setElapsedSec(Math.max(0, Math.round((now - startAtRef.current - pausedMsRef.current - extra) / 1000)));
  }, []);

  const persist = () => {
    if (!storeKey) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ startAt: startAtRef.current, pausedMs: pausedMsRef.current, pauseAt: pauseAtRef.current, running }));
    } catch { /* ignore */ }
  };

  // 최초 마운트 — sessionStorage 에 진행 중 세션이 있으면 복원, 없으면 새로 시작.
  React.useEffect(() => {
    if (!task) return;
    let restored = false;
    try {
      const saved = sessionStorage.getItem(storeKey);
      if (saved) {
        const o = JSON.parse(saved);
        startAtRef.current = o.startAt;
        pausedMsRef.current = o.pausedMs ?? 0;
        pauseAtRef.current = o.pauseAt ?? null;
        setRunning(o.running ?? true);
        restored = true;
      }
    } catch { /* ignore */ }
    if (!restored) {
      startAtRef.current = Date.now();
      pausedMsRef.current = 0;
      pauseAtRef.current = null;
      persist();
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

  // 첫 진입 시 시작 호출 (executionId 확보 시도)
  React.useEffect(() => {
    if (!task) return;
    let cancelled = false;
    todayApi.start(task.id).then(
      (e) => {
        if (cancelled) return;
        executionIdRef.current = e.executionId;
        onExecutionStart?.(task.id, e.executionId);
      },
      () => { /* 미구현 — 그냥 진행 */ },
    );
    return () => { cancelled = true; };
  }, [task?.id]);

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

  // 일시정지/재개 — 정지 시간 누적 + 백엔드 pause/resume(미구현이면 조용히).
  const toggleRun = () => {
    const next = !running;
    if (next) {
      if (pauseAtRef.current) { pausedMsRef.current += Date.now() - pauseAtRef.current; pauseAtRef.current = null; }
    } else {
      pauseAtRef.current = Date.now();
    }
    setRunning(next);
    persist();
    recompute();
    if (executionIdRef.current) {
      (next ? todayApi.resume : todayApi.pause)(executionIdRef.current).catch(() => {});
    }
  };

  const clearSession = () => { if (storeKey) { try { sessionStorage.removeItem(storeKey); } catch { /* ignore */ } } };

  const handleComplete = () => {
    clearSession();
    if (executionIdRef.current) {
      // 목표 시간 초과면 over_done, 아니면 done (소요 시간은 백엔드가 start 시각 기준 계산).
      const status: 'done' | 'over_done' = elapsedSec > totalMin * 60 ? 'over_done' : 'done';
      todayApi
        .checkIn(
          { executionId: executionIdRef.current, completionStatus: status },
          `check-${executionIdRef.current}`,
        )
        .catch(() => {});
    }
    onComplete();
  };

  // 중단 — 기록 없이 오늘로 복귀(세션 정리). 나중에 다시 시작할 수 있다.
  const handleAbort = () => { clearSession(); onBack(); };

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
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-2)', padding: 0, marginBottom: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
        <CaretLeft size={20} /> Today
      </button>
      <Chip tone={running ? 'amber' : 'neutral'} style={{ marginBottom: 12 }}>
        {running ? '● 집중 중' : '❚❚ 일시정지됨'}
      </Chip>
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
        <ReButton variant="ghost" size="lg" full onClick={handleAbort}>
          <X size={16} /> 중단
        </ReButton>
        <ReButton variant="primary" size="lg" full onClick={handleComplete}>
          <Check size={16} /> 완료
        </ReButton>
      </div>
    </div>
  );
}
