import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  XCircle,
  Sparkle,
  Check,
  Info,
} from '@phosphor-icons/react';
import { recoveryApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';
import type { Task, RecoveryProposal } from '../types';
import type { RecoveryCard } from '../types/api';

// 옵션 그룹별 카드 색상 (백엔드 RecoveryCard 엔 색이 없어 클라이언트가 지정).
const GROUP_COLOR: Record<string, { bg: string; bc: string; ac: string }> = {
  DOWNSCOPE: { bg: '#E5EFE3', bc: '#b4dfc8', ac: 'var(--success)' },
  RESCHEDULE: { bg: '#FBEEDA', bc: '#F2D29A', ac: 'var(--warning)' },
  CARRY_OVER: { bg: 'var(--brand-soft)', bc: 'var(--coral-200)', ac: 'var(--brand)' },
  PARK: { bg: 'var(--sand-100)', bc: 'var(--sand-200)', ac: 'var(--text-2)' },
};
const DEFAULT_COLOR = { bg: 'var(--brand-soft)', bc: 'var(--coral-200)', ac: 'var(--brand)' };

// 실패 태그 코드 → if-then 카드용 자연어 trigger("만약 …")
const TRIGGER_LABEL: Record<string, string> = {
  TIME_SHORTAGE: '시간이 부족했다면', LOW_ENERGY: '기운이 없었다면', HARD_TO_START: '시작이 막막했다면',
  PRIORITY_SHIFT: '우선순위가 바뀌었다면', PLAN_TOO_BIG: '계획이 너무 컸다면', FATIGUE: '피곤했다면',
  AMBIGUITY: '뭘 할지 모호했다면', CONFLICT: '일정이 겹쳤다면', OVERRUN: '시간이 초과됐다면',
  AVOIDANCE: '미루게 됐다면', DISTRACTION: '집중이 흐트러졌다면', EMERGENCY: '급한 일이 생겼다면',
  CONTEXT_LOSS: '맥락을 놓쳤다면',
};

// 백엔드 RecoveryCard → 화면 RecoveryProposal. conf(성공률)는 백엔드 미제공 → 0(숨김).
function cardToProposal(c: RecoveryCard): RecoveryProposal {
  const col = GROUP_COLOR[c.optionGroup] ?? DEFAULT_COLOR;
  return {
    id: c.attemptId,
    type: c.optionGroup,
    bg: col.bg,
    bc: col.bc,
    ac: col.ac,
    title: c.labelKo,
    desc: c.suggestedActionText,
    why: c.triggerTag ? `감지된 패턴: ${c.triggerTag}` : `복구 전략: ${c.strategyType}`,
    time: c.minRecoveryUnitMinutes ? `${c.minRecoveryUnitMinutes}분~` : '—',
    conf: 0,
    trigger: c.triggerTag ? (TRIGGER_LABEL[c.triggerTag] ?? undefined) : undefined,
  };
}

// 4 UX 그룹당 동시노출 ≤ 1 (베이스라인 §S19) — 같은 optionGroup 은 첫 카드만 남긴다.
function dedupeByGroup(cards: RecoveryCard[]): RecoveryCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.optionGroup)) return false;
    seen.add(c.optionGroup);
    return true;
  });
}

interface MergedRecoveryScreenProps {
  task: Task | null;
  failReason?: string;
  // 선택된 실제 제안 객체를 그대로 올려준다 — 컨트롤러가 더미에서 id 로 재조회하지
  // 않고, 실제 카드 내용을 그대로 써야 정직하다(#80).
  onAccept: (proposal: RecoveryProposal) => void;
  onDismiss: () => void;
  // 시작/실패한 실제 실행의 executionId. 데모 task 엔 없으므로 optional.
  // 있으면 백엔드 LLM 회복 제안(POST /recovery/proposals/generate)과 연동한다.
  // task.id 는 task id 일 뿐 executionId 가 아니라서 그것으로는 호출하지 않는다.
  executionId?: string;
}

export function MergedRecoveryScreen({ task, failReason, onAccept, onDismiss, executionId }: MergedRecoveryScreenProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  // 백엔드 실제 복구 카드. 더미로 가리지 않고, 없으면 빈 상태로 정직하게 보여준다.
  const [proposals, setProposals] = useState<RecoveryProposal[]>([]);
  const [usingRealProposals, setUsingRealProposals] = useState(false);
  // 응답 aiSource — 'rule' 이면 "오프라인 모드(룰 기반)" 안내를 띄운다(S19).
  const [aiSource, setAiSource] = useState<'llm' | 'rule'>('llm');

  // 진입 시 + "다른 제안" 버튼에서 LLM 회복 제안 생성. executionId 있을 때만(데모 task 는 skip).
  // 4 UX 그룹당 ≤1 로 dedup. hooks 는 early-return 앞에 둔다(호출 순서 고정).
  const loadProposals = React.useCallback(() => {
    if (!executionId) return;
    recoveryApi.generateProposals(executionId).then(
      (res) => {
        setProposals(dedupeByGroup(res.cards ?? []).map(cardToProposal));
        setAiSource(res.aiSource === 'rule' ? 'rule' : 'llm');
        setUsingRealProposals(true);
        setSel(null);
      },
      () => { /* 오류 — 빈 상태 */ },
    );
  }, [executionId]);
  useEffect(() => { loadProposals(); }, [loadProposals]);

  // task 없이 잘못 마운트된 경우 — 회색 빈 영역을 보여주지 않도록 안내 화면.
  if (!task) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 14 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>회복할 카드를 먼저 골라주세요</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 260, margin: 0, lineHeight: 1.6 }}>오늘 화면에서 ‘일부만’ 또는 ‘잘 안됨’ 으로 표시한 카드가 있으면 여기서 회복 제안을 받을 수 있어요.</p>
        <button onClick={onDismiss} style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>오늘로 돌아가기</button>
      </div>
    );
  }

  // 거절("나중에") — 실제 executionId 있으면 decide(reject) 기록 후 오늘로 복귀.
  const reject = () => {
    if (executionId) {
      recoveryApi
        .decide({ executionId, decision: 'reject', decisionReason: failReason ?? null }, `rec-${executionId}-reject`)
        .catch(() => {});
    }
    onDismiss();
  };

  const accept = () => {
    if (!sel) return;
    // 사용자 선택 저장 — 실제 executionId 가 있을 때만(없으면 task.id 는 executionId 가
    // 아니라 백엔드에서 실패하므로 호출하지 않는다). usingRealProposals 면 sel 은 실제
    // attemptId 이므로 그대로 전달. Idempotency-Key 동봉.
    if (executionId) {
      recoveryApi
        .decide(
          { executionId, decision: 'accept', acceptedAttemptId: sel },
          `rec-${executionId}-${sel}`,
        )
        .catch(() => { /* 오류 ok — 흐름 유지 */ });
    }
    setAccepted(true);
    const chosen = proposals.find((p) => p.id === sel);
    if (chosen) setTimeout(() => onAccept(chosen), 1400);
  };

  if (accepted) {
    const p = proposals.find((x) => x.id === sel);
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowsClockwise size={32} weight="fill" color="var(--brand)" />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em' }}>좋아요.</div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 260 }}>{p?.title} — 복구안을 적용하고 있어요…</p>
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
                {failReason && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>이유: {failReason} · <span style={{ color: 'var(--brand)', fontWeight: 600 }}>실행 기록에 반영</span></div>}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--coral-600)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
            <Sparkle size={12} weight="fill" /> AI 추천 · 회복 제안
          </div>

          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 6 }}>오늘은 절반쯤 왔어요.</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.55 }}>끝까지 가지 못해도 괜찮아요. 다시 시작할 방법이 있어요.</p>

          {!usingRealProposals && (
            <div style={{ marginBottom: 14 }}>
              <DemoNotice storageKey="recovery-proposals">
                복구 제안을 아직 준비 중이에요. 실제 실행 중 막혔을 때 AI 제안이 연결됩니다.
              </DemoNotice>
            </div>
          )}
          {usingRealProposals && proposals.length === 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 14 }}>
              지금은 제안할 복구안이 없어요.
            </div>
          )}
          {usingRealProposals && aiSource === 'rule' && proposals.length > 0 && (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 10, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
              오프라인 모드(룰 기반)로 제안했어요. AI 호출이 가능해지면 더 맞춤 제안을 받을 수 있어요.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {proposals.map((p, i) => {
              const isSel = sel === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSel(p.id)}
                  style={{ borderRadius: 14, border: `${isSel ? '1.5px' : '1px'} dashed ${isSel ? p.bc : 'var(--sand-300)'}`, background: isSel ? p.bg : 'var(--surface-raised)', cursor: 'pointer', transition: 'all 160ms', padding: '12px 14px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showWhy === p.id ? 8 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 9999, flexShrink: 0, border: `1.5px solid ${isSel ? p.ac : 'var(--sand-300)'}`, background: isSel ? p.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSel && <Check size={10} color="#FFFCF6" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{p.title}</div>
                        {/* if-then: "만약 [trigger] 이면, [action]" */}
                        {p.desc && (
                          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.45 }}>
                            {p.trigger ? <><span style={{ color: 'var(--coral-600)', fontWeight: 600 }}>만약 {p.trigger},</span> </> : ''}{p.desc}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 5, alignItems: 'center' }}>
                          {i === 0 && <span style={{ height: 'var(--ctrl-xs)', padding: '0 6px', background: p.bg, border: `1px solid ${p.bc}`, borderRadius: 9999, fontSize: 9, fontWeight: 700, color: p.ac, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', letterSpacing: '0.04em' }}>추천 ✓</span>}
                          {p.conf > 0 && <span className="tnum" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, color: p.conf > 80 ? 'var(--success)' : p.conf > 65 ? 'var(--warning)' : 'var(--text-3)' }}>성공률 {p.conf}%</span>}
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

          {/* 3버튼: 나중에(거절) / 다른 제안(수정=재생성) / 이 방법으로(수락) — S19 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={reject} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>나중에</button>
            <button onClick={loadProposals} disabled={!usingRealProposals} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: usingRealProposals ? 'pointer' : 'not-allowed', opacity: usingRealProposals ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ArrowsClockwise size={13} /> 다른 제안</button>
            <button onClick={accept} disabled={!sel} style={{ flex: 1.6, height: 44, borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: sel ? 'pointer' : 'not-allowed', opacity: sel ? 1 : 0.35, transition: 'opacity 160ms' }}>이 방법으로</button>
          </div>
        </div>
      </div>
    </div>
  );
}
