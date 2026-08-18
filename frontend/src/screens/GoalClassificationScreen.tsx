import React, { useCallback, useEffect, useState } from 'react';
import { Sparkle, Check } from '@phosphor-icons/react';
import { GOAL_STATUS_META } from '../data';
import { ApiError, friendlyError, goalsApi } from '../lib/api';
import type { ApiGoal, GoalCandidate, GoalsByTier, InterviewOutcome } from '../types/api';
import type { Goal, GoalStatus } from '../types';
import { SetupProgress } from '../components/SetupProgress';
import { AiDraftCard } from '../components/AiDraftCard';
import { ErrorBanner } from '../components/ErrorBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';

interface GoalClassificationScreenProps {
  onNext: () => void;
  // 방금 끝난 목표 파악 인터뷰의 outcome. 이 화면(S03)은 First Plan 승인(S06) 이전
  // 단계라 GET /goals 는 항상 빈 테이블이므로(#75), 있으면 이쪽을 우선 렌더한다.
  outcome?: InterviewOutcome | null;
}

// 백엔드 ApiGoal → 화면용 Goal. progress·weeklyH 는 백엔드 mock 응답에 없어
// estimatedMinutes 만으로 주당 시간을 어림한다 (4주 기준).
function toUiGoal(api: ApiGoal): Goal {
  const weeklyH = api.estimatedMinutes ? Math.round((api.estimatedMinutes / 60 / 4) * 10) / 10 : 0;
  return {
    id: api.goalId,
    name: api.title,
    deadline: api.deadline ?? 'ongoing',
    status: api.goalTier,
    progress: 0,
    weeklyH,
  };
}

// 인터뷰 outcome.coreGoals → 화면용 Goal. 아직 goals 테이블에 저장되기 전(#75)이라
// goalId 가 없다 — synthetic id(cand_N, "goal_" 로 시작 안 함)를 부여해 changeStatus 가
// 기존 더미 데이터와 동일하게 로컬로만 처리하도록 한다(서버 저장은 First Plan 승인 때).
function toUiGoalFromCandidate(c: GoalCandidate, idx: number): Goal {
  return {
    id: `cand_${idx}`,
    name: c.title,
    deadline: c.deadline ?? 'ongoing',
    status: c.tentativeTier,
    progress: 0,
    weeklyH: 0,
  };
}

function flatten(byTier: GoalsByTier): Goal[] {
  return [...byTier.focus, ...byTier.maintain, ...byTier.parked].map(toUiGoal);
}

export function GoalClassificationScreen({ onNext, outcome }: GoalClassificationScreenProps) {
  // 초기값 비움 → 로딩 중 스켈레톤, 실패 시엔 빈 목록 + 에러 메시지로 정직하게.
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // goals 가 실데이터(비어있어도)인지 — outcome 이든 goalsApi.list 든 성공하면 true.
  const [usingReal, setUsingReal] = useState(false);

  // outcome.coreGoals 가 있으면 그걸 쓰고(정상 경로), 없을 때만 GET /goals 로 fallback한다
  // (예: 인터뷰를 거치지 않고 이 화면에 직접 진입한 dev/force-nav 케이스).
  // AiDraftCard 재생성 버튼("다시 분류")에서도 같은 헬퍼를 재사용한다.
  const fetchGoals = useCallback(() => {
    if (outcome) {
      setUsingReal(true);
      setGoals(outcome.coreGoals.map(toUiGoalFromCandidate));
      setIsLoading(false);
      setError(null);
      return () => {};
    }
    setIsLoading(true);
    let cancelled = false;
    goalsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        // fetch 성공 = 연동됨. 비어있어도 실데이터(빈 목표)로 처리하고 empty-state 로 정직하게.
        setUsingReal(true);
        setGoals(flatten(res));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 실패 시 더미로 가리지 않고 빈 목록 + 에러 메시지로 정직하게 알린다.
        setGoals([]);
        setError(friendlyError(err, '목표를 불러오지 못했어요.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [outcome]);

  useEffect(() => {
    const cleanup = fetchGoals();
    return cleanup;
  }, [fetchGoals]);

  // 분류 요약 카운트 — AiDraftCard children 의 chip 에 사용.
  const tierCount = goals.reduce<Record<GoalStatus, number>>(
    (acc, g) => ({ ...acc, [g.status]: (acc[g.status] ?? 0) + 1 }),
    { focus: 0, maintain: 0, parked: 0 },
  );

  // 재분류 영속화: parked 는 전용 park 엔드포인트(tier 한도 자유), focus/maintain 은 PATCH.
  // 더미 데이터(goal_ 접두사 없는 id)는 로컬만 변경해 데모 흐름을 유지하고,
  // tier 한도 초과(422) 등 서버 검증 실패 시에는 되돌리고 사유를 표시한다.
  const changeStatus = async (id: string, s: GoalStatus) => {
    const prev = goals;
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, status: s } : g)));
    setSelected(null);
    if (!id.startsWith('goal_')) return;
    setError(null);
    try {
      if (s === 'parked') await goalsApi.park(id);
      else await goalsApi.update(id, { goalTier: s });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGoals(prev);
        setError(friendlyError(err, '분류를 바꾸지 못했어요.'));
      }
      // 네트워크/비-ApiError 는 데모 흐름 유지 — 로컬 변경을 그대로 둔다.
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SetupProgress current={2} total={4} label="분류" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--brand-ink)', marginBottom: 4 }}>목표 분류</div>
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 4 }}>무엇에 집중할까요?</div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
            {isLoading ? '대화에서 파악한 목표를 불러오는 중…' : '대화에서 파악한 목표들이에요. 분류를 조정할 수 있어요.'}
          </p>
        </div>

        {error && (
          <ErrorBanner>{error}</ErrorBanner>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading && <SkeletonBlock count={3} height={68} radius={14} />}
          {!isLoading && usingReal && goals.length === 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              아직 등록된 목표가 없어요. 목표 파악 인터뷰를 완료하면 여기에 표시돼요.
            </div>
          )}
          {goals.map((g) => {
            const m = GOAL_STATUS_META[g.status];
            const isSel = selected === g.id;
            return (
              <div
                key={g.id}
                onClick={() => setSelected(isSel ? null : g.id)}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                aria-label={`${g.name}, 현재 ${m.label} 분류. 분류를 변경하려면 누르세요`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(isSel ? null : g.id);
                  }
                }}
                style={{ background: isSel ? m.bg : 'var(--surface-raised)', border: `1.5px solid ${isSel ? m.border : 'var(--sand-200)'}`, borderRadius: 16, padding: 12, cursor: 'pointer', transition: 'all 160ms var(--ease-out)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <div style={{ height: 'var(--ctrl-xs)', padding: '0 8px', borderRadius: 9999, background: m.bg, border: `1px solid ${m.border}`, fontSize: 10, fontWeight: 700, color: m.color, letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center' }}>{m.label}</div>
                      {g.status === 'focus' && (
                        <div style={{ height: 'var(--ctrl-xs)', padding: '0 7px', borderRadius: 9999, background: 'var(--brand-surface)', color: '#FFFCF6', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>ACTIVE</div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 4, letterSpacing: '-0.01em' }}>{g.name}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {g.deadline !== 'ongoing' && g.deadline !== '—' && (
                        <span style={{ height: 'var(--ctrl-xs)', padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{g.deadline}</span>
                      )}
                      {g.weeklyH > 0 && (
                        <span className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{g.weeklyH}h/주</span>
                      )}
                    </div>
                    {g.status !== 'parked' && g.progress > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden', marginBottom: 2 }}>
                          <div style={{ height: '100%', borderRadius: 9999, background: g.status === 'focus' ? 'var(--brand)' : 'var(--success)', width: `${g.progress}%`, transition: 'width 0.5s' }} />
                        </div>
                        <div className="tnum" style={{ fontSize: 10, color: 'var(--text-3)' }}>{g.progress}% 진행</div>
                      </div>
                    )}
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: 9999, flexShrink: 0, border: `1.5px solid ${isSel ? m.color : 'var(--sand-300)'}`, background: isSel ? m.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSel && <Check size={10} color="#FFFCF6" weight="bold" />}
                  </div>
                </div>

                {isSel && (
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sand-200)', display: 'flex', gap: 5 }}>
                    {(['focus', 'maintain', 'parked'] as GoalStatus[]).map((s) => {
                      const sm = GOAL_STATUS_META[s];
                      return (
                        <button
                          key={s}
                          onClick={() => changeStatus(g.id, s)}
                          style={{ flex: 1, height: 38, borderRadius: 9999, fontSize: 10, fontWeight: 600, background: g.status === s ? sm.color : 'var(--surface-ground)', color: g.status === s ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${g.status === s ? sm.color : 'var(--sand-200)'}`, cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 160ms' }}
                        >
                          {sm.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--brand-soft)', borderRadius: 12, border: '1px solid var(--coral-200)', display: 'flex', gap: 8, marginBottom: 0 }}>
          <Sparkle size={13} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--coral-700)', marginBottom: 2 }}>스케줄 배치 방식</div>
            <div style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5, opacity: 0.85 }}>집중 목표에 선제적으로 슬롯을 배치하고, 유지는 겹치지 않게 고려해요. 보류는 일정에 넣지 않아요.</div>
          </div>
        </div>
        <div style={{ height: 8 }} />
      </div>

      {/* AI Draft footer — Issue #12 §1.4 잠금 결정 시각화.
          isDraft=true: 분류 결과가 AI 초안임을 점선/뱃지로 박제.
          onEdit 은 별도 인라인 편집 UI 가 없어서 '직접 분류해주세요' 안내 후 그대로. */}
      <div style={{ flexShrink: 0, padding: '10px 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}>
        <AiDraftCard
          isDraft={true}
          aiSource="llm"
          onAccept={() => !isLoading && onNext()}
          onEdit={() => setSelected(goals[0]?.id ?? null)}
          onReject={fetchGoals}
          acceptLabel="주간 계획 생성"
          editLabel="직접 조정"
          rejectLabel="다시 분류"
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['focus', 'maintain', 'parked'] as GoalStatus[]).map((s) => {
              const m = GOAL_STATUS_META[s];
              const n = tierCount[s];
              if (n === 0) return null;
              return (
                <span key={s} className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 10px', background: m.bg, border: `1px solid ${m.border}`, color: m.color, borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {m.label} <span>{n}</span>
                </span>
              );
            })}
          </div>
        </AiDraftCard>
      </div>
    </div>
  );
}
