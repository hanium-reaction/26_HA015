import React, { useEffect, useState } from 'react';
import { ArrowsClockwise, ArrowDown, XCircle, CheckCircle, Clock } from '@phosphor-icons/react';
import { replanApi } from '../lib/api';
import type { ReplanDiff } from '../types/api';
import { DemoNotice } from '../components/DemoNotice';

// 적용된 복구 내역 — RecoveryScreen 에서 사용자가 고른 제안 + 실패한 카드.
// 백엔드 replan diff(#20-B) 가 응답하면 그 before/after 로 교체, 아니면 이 props 로 표시.
export interface AppliedRecovery {
  taskTitle: string;
  failReason: string;
  proposalTitle: string;
  proposalDesc: string;
  proposalTime: string;
}

interface RecoveredScreenProps {
  recoveryCount: number;
  applied?: AppliedRecovery | null;
  onDone: () => void;
  // 회복 수락으로 생성된 새 액션의 execution id.
  // RecoveryScreen → 컨트롤러가 전달한다. 없으면 replan 연동을 시도하지 않는다
  // (존재하지 않는 stub id 로 호출해 404/오작동하던 문제 제거).
  executionId?: string;
}

// ISO date-time(KST +09:00) → "HH:MM–HH:MM" KST 표기. 런타임 TZ 와 무관하게 Asia/Seoul 고정.
function formatKstRange(startAt: string, endAt: string): string {
  try {
    const fmt = (s: string) =>
      new Date(s).toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    return `${fmt(startAt)}–${fmt(endAt)}`;
  } catch {
    return '—';
  }
}

export function RecoveredScreen({ recoveryCount, applied, onDone, executionId }: RecoveredScreenProps) {
  // mock-and-replace: 진입 시 replan diff 조회 — 실제 executionId 가 있을 때만.
  // 백엔드(#20-B)가 before/after 를 주면 실데이터로 교체, 실패/없음이면 applied props fallback.
  const [diff, setDiff] = useState<ReplanDiff | null>(null);
  useEffect(() => {
    if (!executionId) return;
    let cancelled = false;
    replanApi.diff(executionId).then(
      (d) => { if (!cancelled && d?.before && d?.after) setDiff(d); },
      () => { /* 미구현/오류 ok — applied props 사용 */ },
    );
    return () => { cancelled = true; };
  }, [executionId]);

  // 표시 데이터: 백엔드 diff 가 있으면 우선, 없으면 클라이언트 applied.
  const usingRealDiff = !!diff;
  const view = diff
    ? {
        taskTitle: diff.before.title,
        failReason: applied?.failReason ?? '',
        proposalTitle: diff.after.title,
        proposalDesc: applied?.proposalDesc ?? '',
        proposalTime: formatKstRange(diff.after.startAt, diff.after.endAt),
      }
    : applied ?? null;

  const handleDone = () => {
    // 알겠어요 클릭 시 approve 시도. executionId 없으면 skip.
    // Idempotency-Key 는 반드시 "대상 스코프"여야 한다(#164) — approve 는 body 가 없어
    // 모든 호출의 body 해시가 같으므로, Date.now() 같은 전역 값을 쓰면 재시도마다 키가
    // 달라져 멱등 보호가 무력해진다. executionId 로 고정한다.
    if (executionId) {
      replanApi
        .approve(executionId, `replan-${executionId}`)
        .catch((err) => { console.warn('[replan] approve 실패', err); });
    }
    onDone();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '32px 24px', background: 'var(--surface-ground)', gap: 18, overflowY: 'auto' }}>
      <div style={{ width: 72, height: 72, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <ArrowsClockwise size={32} weight="fill" color="var(--brand)" />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>복구 계획이 준비됐어요</div>

      {/* Before → After — 무엇이 어떻게 바뀌었는지 한눈에. */}
      {view ? (
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* BEFORE */}
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <XCircle size={18} color="var(--danger-ink)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>이전</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', textDecoration: 'line-through', textDecorationColor: 'var(--sand-300)' }}>{view.taskTitle}</div>
              {view.failReason && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>막힌 이유: {view.failReason}</div>}
            </div>
          </div>

          <ArrowDown size={16} color="var(--text-3)" style={{ alignSelf: 'center' }} />

          {/* AFTER */}
          <div style={{ background: 'var(--brand-soft)', border: '1.5px solid var(--coral-200)', borderRadius: 14, padding: '12px 14px', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <CheckCircle size={18} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coral-600)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>이렇게 다시</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{view.proposalTitle}</div>
              {view.proposalDesc && <div style={{ fontSize: 12, color: 'var(--coral-700)', marginTop: 2, lineHeight: 1.5 }}>{view.proposalDesc}</div>}
              {view.proposalTime && view.proposalTime !== '—' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, height: 'var(--ctrl-xs)', padding: '0 8px', background: 'var(--surface-raised)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 10, fontWeight: 600, color: 'var(--coral-700)' }}>
                  <Clock size={10} weight="fill" /> {view.proposalTime}
                </div>
              )}
            </div>
          </div>

          {/* 백엔드 diff 가 응답하면 실제 일정 반영 확정, 아니면 미리보기임을 정직하게 알림. */}
          {usingRealDiff ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 2, fontSize: 10, fontWeight: 700, color: 'var(--success-ink)', fontFamily: 'var(--font-mono)' }}>
              <CheckCircle size={12} weight="fill" /> 실제 일정에 반영됐어요
            </div>
          ) : (
            <div style={{ marginTop: 2 }}>
              <DemoNotice storageKey="replan-diff">
                이 회복 미리보기는 실제 실행에 연결되면 일정에 반영돼요.
              </DemoNotice>
            </div>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 15, color: 'var(--text-2)', maxWidth: 260, lineHeight: 1.6, margin: 0 }}>10분 뒤에 알려드릴게요. 그 사이엔 폰을 잠시 내려놔도 좋아요.</p>
      )}

      {/* 이번 세션 회복 카드 (백엔드 누적 집계 엔드포인트가 없어 세션 카운트로 정직하게) */}
      <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 18, padding: 18, width: '100%', maxWidth: 320, textAlign: 'left', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>이번 세션 회복</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="tnum" style={{ fontSize: 44, fontWeight: 800, color: 'var(--brand-ink)', letterSpacing: '-0.03em' }}>{recoveryCount}</span>
          <span style={{ fontSize: 16, color: 'var(--text-2)' }}>회</span>
          {/* 실제로 이번에 회복을 수락했을 때(count>0)만 +1 — 0회일 땐 모순이라 숨긴다. */}
          {recoveryCount > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--success-ink)', fontWeight: 700 }}>방금 +1</span>}
        </div>
      </div>

      <button onClick={handleDone} style={{ width: 160, height: 44, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>알겠어요</button>
    </div>
  );
}
