import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  XCircle,
  Sparkle,
  Check,
  Info,
} from '@phosphor-icons/react';
import { MERGED_PROPOSALS } from '../data';
import { recoveryApi } from '../lib/api';
import type { Task, RecoveryProposal } from '../types';

interface MergedRecoveryScreenProps {
  task: Task | null;
  failReason?: string;
  onAccept: (optionId: string) => void;
  onDismiss: () => void;
}

export function MergedRecoveryScreen({ task, failReason, onAccept, onDismiss }: MergedRecoveryScreenProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  // mock-and-replace: 진입 시 LLM 회복 제안 생성 시도. 백엔드 501 → 더미 그대로.
  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    recoveryApi.generateProposals(task.id).then(
      (proposals) => {
        if (cancelled) return;
        // TODO(backend-#20): proposals → RecoveryProposal[] 매핑
        void proposals;
      },
      () => { /* 501 ok */ },
    );
    return () => { cancelled = true; };
  }, [task]);

  const accept = () => {
    if (!sel) return;
    // mock-and-replace: 사용자 선택 저장 시도. Idempotency-Key 동봉.
    if (task) {
      recoveryApi
        .decide({ executionId: task.id, proposalId: sel }, `rec-${task.id}-${sel}`)
        .catch(() => { /* 501 ok */ });
    }
    setAccepted(true);
    setTimeout(() => onAccept(sel), 1400);
  };

  if (accepted) {
    const p = MERGED_PROPOSALS.find((x) => x.id === sel);
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowsClockwise size={32} weight="fill" color="var(--brand)" />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em' }}>좋아요.</div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 260 }}>{p?.title} — 지금 바로 시작해요. 잘 하고 있어요.</p>
        <div style={{ background: '#E5EFE3', border: '1px solid #b4dfc8', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: 'var(--success)', width: '100%' }}>캘린더 업데이트 완료. 실행 메모리에 복구 기록이 저장됐어요.</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 16px 36px' }}>
      <div onClick={onDismiss} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)' }} />
      <div style={{ position: 'relative', background: 'var(--surface-raised)', borderRadius: 28, padding: 22, border: '1px solid var(--coral-200)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 90% -10%, rgba(226,109,78,0.10) 0%, transparent 50%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          {task && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, padding: '8px 10px', background: '#FAE2D8', border: '1px solid var(--coral-200)', borderRadius: 10 }}>
              <XCircle size={14} color="var(--danger)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                {failReason && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>이유: {failReason} · <span style={{ color: 'var(--brand)', fontWeight: 600 }}>Execution Memory 반영됨</span></div>}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coral-600)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
            <ArrowsClockwise size={12} weight="fill" /> Recovery Proposal
          </div>

          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 6 }}>오늘은 절반쯤 왔어요.</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 18, lineHeight: 1.55 }}>끝까지 가지 못해도 괜찮아요. 다시 시작할 방법이 있어요.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MERGED_PROPOSALS.map((p, i) => {
              const isSel = sel === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSel(p.id)}
                  style={{ borderRadius: 14, border: `${isSel ? '1.5px' : '1px'} solid ${isSel ? p.bc : 'var(--sand-200)'}`, background: isSel ? p.bg : 'var(--surface-raised)', cursor: 'pointer', transition: 'all 160ms', padding: '12px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showWhy === p.id ? 8 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 9999, flexShrink: 0, border: `1.5px solid ${isSel ? p.ac : 'var(--sand-300)'}`, background: isSel ? p.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSel && <Check size={10} color="#FFFCF6" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{p.title}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                          {i === 0 && <span style={{ height: 16, padding: '0 6px', background: p.bg, border: `1px solid ${p.bc}`, borderRadius: 9999, fontSize: 9, fontWeight: 700, color: p.ac, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', letterSpacing: '0.04em' }}>if-then ✓</span>}
                          <span className="tnum" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: p.conf > 80 ? 'var(--success)' : p.conf > 65 ? 'var(--warning)' : 'var(--text-3)' }}>성공률 {p.conf}%</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.time}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setShowWhy(showWhy === p.id ? null : p.id); }} style={{ flexShrink: 0, background: 'transparent', border: 'none', fontSize: 11, color: 'var(--brand)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 0 8px', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Info size={12} /> 왜?
                    </button>
                  </div>
                  {showWhy === p.id && (
                    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--brand-soft)', borderRadius: 8, fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5 }}>{p.why}</div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>실패는 데이터예요. 다시 한 번이면 충분해요.</div>

          <button onClick={accept} disabled={!sel} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', marginTop: 14, background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', opacity: sel ? 1 : 0.35, transition: 'opacity 160ms' }}>이 방법으로 복구하기 →</button>
        </div>
      </div>
    </div>
  );
}
