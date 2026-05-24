import React, { useEffect } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { replanApi } from '../lib/api';

interface RecoveredScreenProps {
  recoveryCount: number;
  onDone: () => void;
}

export function RecoveredScreen({ recoveryCount, onDone }: RecoveredScreenProps) {
  // mock-and-replace: 진입 시 replan diff 조회 시도. 백엔드 501 → 더미 유지.
  // 실제 executionId 는 RecoveryScreen 에서 전달받게 되면 props 로 받을 자리.
  useEffect(() => {
    let cancelled = false;
    replanApi.diff('demo-exec-stub').then(
      (diff) => { if (!cancelled) { /* TODO: render diff */ void diff; } },
      () => { /* 501 ok */ },
    );
    return () => { cancelled = true; };
  }, []);

  const handleDone = () => {
    // 알겠어요 클릭 시 approve 시도 (Idempotency-Key).
    replanApi
      .approve('demo-exec-stub', `replan-${Date.now()}`)
      .catch(() => { /* 501 ok */ });
    onDone();
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', background: 'var(--surface-ground)', gap: 20 }}>
      <div style={{ width: 80, height: 80, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ArrowsClockwise size={36} weight="fill" color="var(--brand)" />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>좋아요.</div>
      <p style={{ fontSize: 15, color: 'var(--text-2)', maxWidth: 260, lineHeight: 1.6, margin: 0 }}>10분 뒤에 알려드릴게요. 그 사이엔 폰을 잠시 내려놔도 좋아요.</p>
      <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 18, padding: 18, width: '100%', maxWidth: 300, textAlign: 'left' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>30일 누적 회복</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="tnum" style={{ fontSize: 44, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.03em' }}>{recoveryCount}</span>
          <span style={{ fontSize: 16, color: 'var(--text-2)' }}>회</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>+1 today</span>
        </div>
      </div>
      <button onClick={handleDone} style={{ width: 160, height: 44, borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>알겠어요</button>
    </div>
  );
}
