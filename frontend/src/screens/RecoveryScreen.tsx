import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  CircleNotch,
  Flag,
  Sparkle,
  Check,
  Info,
  HourglassMedium,
} from '@phosphor-icons/react';
import { ApiError, friendlyError, recoveryApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';
import { RecoveryOptionCard } from '../components/RecoveryOptionCard';
import { ReEngagementAnchorPicker } from '../components/ReEngagementAnchorPicker';
import { EmptyState } from '../components/EmptyState';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { ErrorBanner } from '../components/ErrorBanner';
import { localDateStr, defaultCarryOverAnchorDate, defaultReEngagementAnchorDate, DEFAULT_REENGAGEMENT_TIME } from '../lib/dates';
import type { Task, RecoveryProposal } from '../types';
import type { RecoveryCard } from '../types/api';

// 이 optionGroup 은 "보류·이월" 계열 — 수락 시 재관여 앵커(#221)를 같이 정한다.
// PARK("지금은 접어두기") / CARRY_OVER("내일 이어서") 만 해당. DOWNSCOPE/RESCHEDULE 는
// 바로 다음 실행이 다시 잡히므로 별도 재관여 장치가 필요 없다.
const REENGAGEMENT_GROUPS = new Set(['PARK', 'CARRY_OVER']);

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
  onAccept: (proposal: RecoveryProposal, requiresReplan: boolean) => void;
  onDismiss: () => void;
  // 시작/실패한 실제 실행의 executionId. 데모 task 엔 없으므로 optional.
  // 있으면 백엔드 LLM 회복 제안(POST /recovery/proposals/generate)과 연동한다.
  // task.id 는 task id 일 뿐 executionId 가 아니라서 그것으로는 호출하지 않는다.
  executionId?: string;
  // 실행 기록(체크인·태그)을 저장하는 중 — 아직 executionId 가 없지만 곧 온다.
  // 데모 카드처럼 executionId 가 영영 오지 않는 경우와 구분하려고 부모가 내려준다.
  preparing?: boolean;
  preparationError?: string | null;
  onOpenWeekly: () => void;
}

export function MergedRecoveryScreen({ task, failReason, onAccept, onDismiss, executionId, preparing = false, preparationError, onOpenWeekly }: MergedRecoveryScreenProps) {
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
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<'standard' | 'goal_renegotiation'>('standard');
  // 재관여 앵커(#221) — PARK/CARRY_OVER 수락 시 "다음에 다시 볼 시점". 기본값은 다음
  // 주간 리뷰(다음 주 월요일 09:00)로 미리 채워, 마찰 없이 그대로 확인만 해도 되게 한다.
  const [anchorDate, setAnchorDate] = useState(() => defaultReEngagementAnchorDate());
  const [anchorTime, setAnchorTime] = useState(DEFAULT_REENGAGEMENT_TIME);

  const selectedProposal = proposals.find((p) => p.id === sel);
  const needsAnchor = !!selectedProposal && REENGAGEMENT_GROUPS.has(selectedProposal.type);

  const renegotiating = usingRealProposals && recoveryMode === 'goal_renegotiation';

  // 제안 카드가 아직 없는 두 가지 대기 상태를 하나로 묶는다.
  //  (1) loadingProposals — LLM 호출이 도는 중. 수 초 걸린다.
  //  (2) preparing && !executionId — 체크인·태그 저장을 기다리는 중. markFailed 가
  //      화면 전환을 먼저 하고 저장을 뒤에 하므로 executionId 가 늦게 온다.
  //  (3) executionId 는 왔는데 첫 응답이 아직 — loadProposals 는 effect 라 커밋
  //      다음에 돌기 때문에, 이 칸이 없으면 그 사이 한 프레임이 빈 채로 지나간다.
  // 셋 다 예전에는 아무 표시가 없어서 카드 자리가 그냥 빈 공간으로 남았다.
  const waiting =
    loadingProposals ||
    (preparing && !executionId) ||
    (!!executionId && !usingRealProposals && !proposalError);

  useEffect(() => {
    if (selectedProposal?.type === 'CARRY_OVER') {
      setAnchorDate(defaultCarryOverAnchorDate());
      setAnchorTime(DEFAULT_REENGAGEMENT_TIME);
    } else if (selectedProposal?.type === 'PARK') {
      setAnchorDate(defaultReEngagementAnchorDate());
      setAnchorTime(DEFAULT_REENGAGEMENT_TIME);
    }
  }, [selectedProposal?.type]);

  // 진입 시 + "다른 제안" 버튼에서 LLM 회복 제안 생성. executionId 있을 때만(데모 task 는 skip).
  // 4 UX 그룹당 ≤1 로 dedup. hooks 는 early-return 앞에 둔다(호출 순서 고정).
  const loadProposals = React.useCallback(() => {
    if (!executionId) return;
    setDecideError(null);
    setProposalError(null);
    setLoadingProposals(true);
    recoveryApi.generateProposals(executionId).then(
      (res) => {
        setProposals(dedupeByGroup(res.cards ?? []).map(cardToProposal));
        setAiSource(res.aiSource === 'rule' ? 'rule' : 'llm');
        setRecoveryMode(res.recoveryMode === 'goal_renegotiation' ? 'goal_renegotiation' : 'standard');
        setUsingRealProposals(true);
        setSel(null);
        setAlreadyDecided(false);
        setLoadingProposals(false);
      },
      (err: unknown) => {
        // 409 RECOVERY_ALREADY_DECIDED — 이미 결정을 끝낸 실행에 재진입한 것. 오류가
        // 아니므로 에러 토스트 대신 "이미 결정함" 안내를 보여준다(#164).
        if (err instanceof ApiError && err.status === 409) {
          setAlreadyDecided(true);
          setLoadingProposals(false);
          return;
        }
        setUsingRealProposals(false);
        setProposalError(friendlyError(err, '회복 제안을 불러오지 못했어요. 다시 시도해 주세요.'));
        setLoadingProposals(false);
      },
    );
  }, [executionId]);
  useEffect(() => { loadProposals(); }, [loadProposals]);

  // 이미 회복 결정을 마친 실행에 재진입 — 에러가 아니라 정상 상태로 안내한다(#164).
  if (alreadyDecided) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>이미 회복 계획을 골랐어요</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 260, margin: 0, lineHeight: 1.6 }}>이 실행에는 이미 저장한 회복 선택이 있어요. 주간 계획에서 일정을 확인해 주세요.</p>
        <button onClick={onOpenWeekly}>주간 계획 열기</button>
        <button onClick={onDismiss} style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>오늘로 돌아가기</button>
      </div>
    );
  }

  // task 없이 잘못 마운트된 경우 — 회색 빈 영역을 보여주지 않도록 안내 화면.
  if (!task) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 22 }}>회복할 카드를 먼저 골라주세요</div>
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
    let requiresReplan = false;
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
      // PARK/CARRY_OVER 는 재관여 앵커(#221)를 함께 넘긴다 — 지금은 스펙 대기라
      // recoveryApi.decide 안에서 버려지지만, 값 자체는 여기서부터 만들어 둔다.
      const reEngagementAnchorAt = needsAnchor ? `${anchorDate}T${anchorTime}:00+09:00` : null;
      try {
        const result = await recoveryApi.decide(
          { executionId, decision: 'accepted', acceptedAttemptId: sel },
          `rec-${executionId}-${sel}`,
          reEngagementAnchorAt,
        );
        requiresReplan = !!result.resultingActionItemId;
      } catch (err) {
        setDecideError(friendlyError(err, '회복 계획을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        return;
      } finally {
        setDeciding(false);
      }
    }
    // #223 ↔ #221 연결 지점: 재협상 3장(DOWNSCOPE/RESCHEDULE/PARK) 중 하나를
    // 여기서 수락하면 재관여 앵커(#221 — "다음 주 리뷰 때 다시 볼지" 설정)가
    // 함께 필요하다. #221 은 다른 에이전트가 별도 브랜치에서 진행 중이라 여기
    // 서는 앵커 호출을 추가하지 않는다 — 그 작업이 머지되면 renegotiating===true
    // 분기에서 앵커 설정 API를 이어붙이면 된다.
    setAccepted(true);
    if (chosen) setTimeout(() => onAccept(chosen, requiresReplan), 1400);
  };

  if (accepted) {
    const p = proposals.find((x) => x.id === sel);
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px', gap: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowsClockwise size={32} weight="fill" color="var(--brand)" />
        </div>
        <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em' }}>좋아요.</div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 260 }}>{p?.title} — 복구안을 적용하고 있어요…</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 16px 36px' }}>
      <div onClick={onDismiss} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)' }} />
      <div style={{ position: 'relative', background: 'var(--surface-raised)', borderRadius: 28, padding: 22, border: `1px solid ${renegotiating ? 'var(--sand-300)' : 'var(--coral-200)'}`, boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>
        {/* 재협상 톤 — coral(에너지) 대신 sand(차분함) 그라디언트로 "잠깐 멈춤"을 신호한다. */}
        <div style={{ position: 'absolute', inset: 0, background: renegotiating ? 'radial-gradient(circle at 90% -10%, rgba(180,163,129,0.14) 0%, transparent 50%)' : 'radial-gradient(circle at 90% -10%, rgba(226,109,78,0.10) 0%, transparent 50%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          {task && (
            // 여기는 "무엇이 멈췄나"를 알려주는 자리지 경고가 아니다. 예전엔 빨간 에러
            // 박스(#FAE2D8 + danger 아이콘/글씨)라, 회복 화면에서 제일 먼저 보이는 게
            // 빨간 경고였다 — 바로 아래 "괜찮아요" 카피와 정면으로 어긋난다.
            // 사실만 중립 톤으로: 무엇을 · 언제 · 왜.
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, padding: '9px 11px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 10 }}>
              <Flag size={14} color="var(--text-3)" weight="fill" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-3)', marginBottom: 1 }}>여기서 멈췄어요</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                {failReason && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{failReason} · 실행 기록에 남겼어요</div>}
              </div>
            </div>
          )}

          {/* 통상 회복 카드와 구분되는 신호(#223) — 같은 화면·같은 카드 인터랙션을
              쓰되 헤더 아이콘/카피/톤을 바꿔 "지금은 다시 정하는 시점"임을 알린다. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: renegotiating ? 'var(--text-3)' : 'var(--coral-600)', marginBottom: 10 }}>
            {renegotiating ? <HourglassMedium size={12} weight="fill" /> : <Sparkle size={12} weight="fill" />}
            {renegotiating ? '잠깐 멈춤 · 다시 정하기' : 'AI 추천 · 회복 제안'}
          </div>

          <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1.2, marginBottom: 6 }}>
            {renegotiating ? '지금 잠깐 멈춰서 생각해볼까요' : '오늘은 절반쯤 왔어요.'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.55 }}>
            {renegotiating
              ? '같은 방식으로는 잘 안 풀렸어요. 크기·시점·지속 여부 중에서 다시 정해볼게요.'
              : '끝까지 가지 못해도 괜찮아요. 다시 시작할 방법이 있어요.'}
          </p>

          {/* 대기 안내는 DemoNotice 로 띄우지 않는다 — 그건 sessionStorage 로 한 번
              닫으면 세션 내내 사라지는 배너라, 닫아둔 사용자에게는 카드 자리가 아무
              설명 없는 빈 공간이 됐다. 기다리는 중이라는 사실은 닫히지 않아야 한다. */}
          {waiting && !proposalError && !preparationError && (
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 10, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <CircleNotch size={13} weight="bold" className="animate-spin-loader" style={{ flexShrink: 0 }} />
              {executionId
                ? '회복 제안을 준비하고 있어요. 잠시만 기다려 주세요.'
                : '실행 기록을 저장하고 있어요. 저장이 끝나면 제안을 불러올게요.'}
            </div>
          )}
          {!usingRealProposals && !waiting && !proposalError && !preparationError && (
            <div style={{ marginBottom: 14 }}>
              <DemoNotice storageKey="recovery-proposals">
                이 카드에는 실행 기록이 없어 회복 제안을 불러오지 못했어요. 오늘 화면에서 카드를 시작한 뒤 다시 시도해 주세요.
              </DemoNotice>
            </div>
          )}
          {(proposalError || preparationError) && (
            <div style={{ marginBottom: 14 }}>
              <ErrorBanner>{proposalError ?? preparationError}</ErrorBanner>
            </div>
          )}
          {usingRealProposals && !waiting && proposals.length === 0 && (
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
            {/* 기다리는 동안 카드 자리를 스켈레톤으로 잡아둔다. 비워 두면 위아래 문구만
                남아 "제안이 없는 화면" 으로 읽힌다. */}
            {waiting && proposals.length === 0 && <SkeletonBlock count={3} height={76} radius={14} />}
            {proposals.map((p, i) => (
              <RecoveryOptionCard
                key={p.id}
                title={p.title}
                description={p.desc}
                trigger={p.trigger}
                confidence={p.conf}
                timeLabel={p.time}
                // 재협상 3장은 AI 가 고른 "제일 나은 하나"가 아니라 동등한 세 방향
                // (축소/재조정/보류)이라 추천 뱃지를 붙이지 않는다.
                recommended={!renegotiating && i === 0}
                selected={sel === p.id}
                onSelect={() => setSel(p.id)}
                why={p.why}
                whyOpen={showWhy === p.id}
                onToggleWhy={() => setShowWhy(showWhy === p.id ? null : p.id)}
                colors={{ bg: p.bg, bc: p.bc, ac: p.ac }}
              />
            ))}
          </div>

          {needsAnchor && (
            <ReEngagementAnchorPicker
              date={anchorDate}
              time={anchorTime}
              minDate={localDateStr(new Date())}
              onChangeDate={setAnchorDate}
              onChangeTime={setAnchorTime}
            />
          )}

          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
            {renegotiating ? '지금 고른 방식은 다음 주 리뷰 때 다시 볼 수 있어요.' : '실패는 데이터예요. 다시 한 번이면 충분해요.'}
          </div>

          {decideError && (
            <div style={{ marginBottom: 10 }}>
              <ErrorBanner>{decideError}</ErrorBanner>
            </div>
          )}
          {/* 3버튼: 나중에(거절) / 다른 제안(수정=재생성) / 이 방법으로(수락) — S19 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={reject} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-3)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>나중에</button>
            <button onClick={loadProposals} disabled={!executionId || loadingProposals} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: executionId && !loadingProposals ? 'pointer' : 'not-allowed', opacity: executionId && !loadingProposals ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ArrowsClockwise size={13} /> {proposalError ? '다시 시도' : '다른 제안'}</button>
            <button onClick={accept} disabled={!sel || deciding} style={{ flex: 1.6, height: 44, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: sel && !deciding ? 'pointer' : 'not-allowed', opacity: sel && !deciding ? 1 : 0.35, transition: 'opacity 160ms' }}>{deciding ? '저장하는 중…' : '이 방법으로'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
