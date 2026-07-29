import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  Flag,
  Sparkle,
  Check,
  Info,
} from '@phosphor-icons/react';
import { ApiError, friendlyError, recoveryApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';
import { RecoveryOptionCard } from '../components/RecoveryOptionCard';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
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

// 실패 태그 코드 → 사람이 읽는 두 가지 형태.
//   ifClause — if-then 카드의 "만약 …" 조건절
//   because  — [왜?] 패널에서 이 제안을 고른 이유를 설명하는 과거형
// 백엔드는 태그를 자유 문자열로 주므로 여기 없는 값이 올 수 있다. 그럴 땐
// 영문 코드를 화면에 흘리지 말고 그냥 생략한다(아래 cardToProposal 참고).
const TRIGGER_KO: Record<string, { ifClause: string; because: string }> = {
  TIME_SHORTAGE:  { ifClause: '시간이 부족했다면',      because: '지난번엔 시간이 모자랐어요.' },
  LOW_ENERGY:     { ifClause: '기운이 없었다면',        because: '그때 기운이 많이 떨어져 있었어요.' },
  HARD_TO_START:  { ifClause: '시작이 막막했다면',      because: '시작하는 게 제일 어려웠어요.' },
  PRIORITY_SHIFT: { ifClause: '우선순위가 바뀌었다면',  because: '그날 더 급한 일이 앞섰어요.' },
  PLAN_TOO_BIG:   { ifClause: '계획이 너무 컸다면',     because: '한 번에 하기엔 덩어리가 컸어요.' },
  FATIGUE:        { ifClause: '피곤했다면',            because: '몸이 많이 지쳐 있었어요.' },
  AMBIGUITY:      { ifClause: '뭘 할지 모호했다면',     because: '무엇부터 할지가 분명하지 않았어요.' },
  CONFLICT:       { ifClause: '일정이 겹쳤다면',        because: '다른 일정과 시간이 겹쳤어요.' },
  OVERRUN:        { ifClause: '시간이 초과됐다면',      because: '생각보다 시간이 더 걸렸어요.' },
  AVOIDANCE:      { ifClause: '미루게 됐다면',          because: '자꾸 뒤로 미루게 됐어요.' },
  DISTRACTION:    { ifClause: '집중이 흐트러졌다면',    because: '중간에 집중이 자주 끊겼어요.' },
  EMERGENCY:      { ifClause: '급한 일이 생겼다면',     because: '갑자기 급한 일이 생겼어요.' },
  CONTEXT_LOSS:   { ifClause: '맥락을 놓쳤다면',        because: '이어서 하려니 흐름이 끊겨 있었어요.' },
};

// optionGroup(백엔드 enum) → 이 방식이 왜 도움이 되는지. 코드값을 그대로 보여주지 않는다.
const GROUP_WHY: Record<string, string> = {
  DOWNSCOPE:  '크기를 줄이면 시작 문턱이 낮아져요.',
  RESCHEDULE: '더 잘 되는 시간대로 옮겨요.',
  CARRY_OVER: '오늘은 넘기고 내일 이어서 해요.',
  PARK:       '지금은 접어두고, 여유가 생기면 다시 봐요.',
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
    // 예전엔 `감지된 패턴: TIME_SHORTAGE` 처럼 내부 코드를 그대로 보여줬다.
    // 매핑되는 것만 한국어로 조립하고, 하나도 못 풀면 why 자체를 비워
    // [왜?] 버튼이 아예 안 나오게 한다(영문 코드 노출 < 설명 없음).
    why: [c.triggerTag ? TRIGGER_KO[c.triggerTag]?.because : null, GROUP_WHY[c.optionGroup]]
      .filter(Boolean)
      .join(' ') || undefined,
    // 미상일 때 '—' 를 넣으면 버그처럼 보인다. 비워서 칩 자체가 안 나오게 한다.
    time: c.minRecoveryUnitMinutes ? `${c.minRecoveryUnitMinutes}분~` : undefined,
    conf: 0,
    trigger: c.triggerTag ? TRIGGER_KO[c.triggerTag]?.ifClause : undefined,
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
  // 회복 선택 저장 중/실패 — 실패 시 다음 화면으로 넘기지 않는다(#164).
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  // 이 실행은 이미 회복 결정을 마침(generate 409) — 오류가 아니라 정상 상태.
  const [alreadyDecided, setAlreadyDecided] = useState(false);

  // 진입 시 + "다른 제안" 버튼에서 LLM 회복 제안 생성. executionId 있을 때만(데모 task 는 skip).
  // 4 UX 그룹당 ≤1 로 dedup. hooks 는 early-return 앞에 둔다(호출 순서 고정).
  const loadProposals = React.useCallback(() => {
    if (!executionId) return;
    setDecideError(null);
    recoveryApi.generateProposals(executionId).then(
      (res) => {
        setProposals(dedupeByGroup(res.cards ?? []).map(cardToProposal));
        setAiSource(res.aiSource === 'rule' ? 'rule' : 'llm');
        setUsingRealProposals(true);
        setSel(null);
        setAlreadyDecided(false);
      },
      (err: unknown) => {
        // 409 RECOVERY_ALREADY_DECIDED — 이미 결정을 끝낸 실행에 재진입한 것. 오류가
        // 아니므로 에러 토스트 대신 "이미 결정함" 안내를 보여준다(#164).
        if (err instanceof ApiError && err.status === 409) {
          setAlreadyDecided(true);
          return;
        }
        /* 그 외 오류 — 빈 상태 */
      },
    );
  }, [executionId]);
  useEffect(() => { loadProposals(); }, [loadProposals]);

  // 이미 회복 결정을 마친 실행에 재진입 — 에러가 아니라 정상 상태로 안내한다(#164).
  if (alreadyDecided) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 14 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>이미 회복 계획을 골랐어요</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 260, margin: 0, lineHeight: 1.6 }}>이 카드는 회복 방법이 정해져 있어요. 주간 계획에서 새로 잡힌 시간을 확인할 수 있어요.</p>
        <button onClick={onDismiss} style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>오늘로 돌아가기</button>
      </div>
    );
  }

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

  // "나중에" — 계약상 'skipped'("오늘은 쉬기"). 'reject'/'rejected' 는 요청 값이 아니다(#164).
  // 기록에 실패해도 화면은 닫되(사용자를 가두지 않음) 조용히 삼키지 않고 경고를 남긴다.
  const reject = () => {
    if (executionId) {
      recoveryApi
        .decide({ executionId, decision: 'skipped', decisionReason: failReason ?? null }, `rec-${executionId}-skipped`)
        .catch((err) => { console.warn('[recovery] skip 기록 실패', err); });
    }
    onDismiss();
  };

  const accept = async () => {
    if (!sel || deciding) return;
    const chosen = proposals.find((p) => p.id === sel);
    // 사용자 선택 저장 — 실제 executionId 가 있을 때만(없으면 task.id 는 executionId 가
    // 아니라 백엔드에서 실패하므로 호출하지 않는다). usingRealProposals 면 sel 은 실제
    // attemptId 이므로 그대로 전달. Idempotency-Key 동봉.
    //
    // #164: 예전엔 실패를 .catch(()=>{}) 로 삼켜 422 여도 "복구 계획이 준비됐어요" 로
    // 넘어갔다(회복 ActionItem·replan 이 안 생겼는데 사용자는 됐다고 믿음). 이제 저장에
    // 실패하면 진행하지 않고 에러를 보여준다.
    if (executionId) {
      setDeciding(true);
      setDecideError(null);
      try {
        await recoveryApi.decide(
          { executionId, decision: 'accepted', acceptedAttemptId: sel },
          `rec-${executionId}-${sel}`,
        );
      } catch (err) {
        setDecideError(friendlyError(err, '회복 계획을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        return;
      } finally {
        setDeciding(false);
      }
    }
    setAccepted(true);
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
            // 여기는 "무엇이 멈췄나"를 알려주는 자리지 경고가 아니다. 예전엔 빨간 에러
            // 박스(#FAE2D8 + danger 아이콘/글씨)라, 회복 화면에서 제일 먼저 보이는 게
            // 빨간 경고였다 — 바로 아래 "괜찮아요" 카피와 정면으로 어긋난다.
            // 사실만 중립 톤으로: 무엇을 · 언제 · 왜.
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, padding: '9px 11px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 10 }}>
              <Flag size={14} color="var(--text-3)" weight="fill" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 1 }}>여기서 멈췄어요</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                {failReason && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{failReason} · 실행 기록에 남겼어요</div>}
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
            <div style={{ marginBottom: 14 }}>
              <EmptyState>지금은 제안할 복구안이 없어요.</EmptyState>
            </div>
          )}
          {usingRealProposals && aiSource === 'rule' && proposals.length > 0 && (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 10, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
              오프라인 모드(룰 기반)로 제안했어요. AI 호출이 가능해지면 더 맞춤 제안을 받을 수 있어요.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {proposals.map((p, i) => (
              <RecoveryOptionCard
                key={p.id}
                title={p.title}
                description={p.desc}
                trigger={p.trigger}
                confidence={p.conf}
                timeLabel={p.time}
                recommended={i === 0}
                selected={sel === p.id}
                onSelect={() => setSel(p.id)}
                why={p.why}
                whyOpen={showWhy === p.id}
                onToggleWhy={() => setShowWhy(showWhy === p.id ? null : p.id)}
                colors={{ bg: p.bg, bc: p.bc, ac: p.ac }}
              />
            ))}
          </div>

          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>실패는 데이터예요. 다시 한 번이면 충분해요.</div>

          {decideError && (
            <div style={{ marginBottom: 10 }}>
              <ErrorBanner>{decideError}</ErrorBanner>
            </div>
          )}
          {/* 3버튼: 나중에(거절) / 다른 제안(수정=재생성) / 이 방법으로(수락) — S19 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={reject} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>나중에</button>
            <button onClick={loadProposals} disabled={!usingRealProposals} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: usingRealProposals ? 'pointer' : 'not-allowed', opacity: usingRealProposals ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ArrowsClockwise size={13} /> 다른 제안</button>
            <button onClick={accept} disabled={!sel || deciding} style={{ flex: 1.6, height: 44, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: sel && !deciding ? 'pointer' : 'not-allowed', opacity: sel && !deciding ? 1 : 0.35, transition: 'opacity 160ms' }}>{deciding ? '저장하는 중…' : '이 방법으로'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
