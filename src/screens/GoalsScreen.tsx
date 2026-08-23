import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash, PencilSimple, TreeStructure, Target, ChatCircleDots, SquaresFour, ArrowUpRight } from '@phosphor-icons/react';
import { ApiError, friendlyError, goalsApi } from '../lib/api';
import type { ApiGoal, GoalDecomposition, GoalTier } from '../types/api';
import { GOAL_STATUS_META, GOAL_CATEGORY_OPTIONS, categoryLabel } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import { ReButton } from '../components/ReButton';
import { GoalCard } from '../components/GoalCard';
import { IconAction } from '../components/IconAction';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { ReinterviewSheet } from '../components/ReinterviewSheet';

// Focus ≤ 3 / Maintain ≤ 5. Parked 는 한도 자유 (백엔드 _TIER_LIMITS 와 동일).
const TIER_LIMIT: Record<GoalTier, number | null> = { focus: 3, maintain: 5, parked: null };
const TIER_ORDER: GoalTier[] = ['focus', 'maintain', 'parked'];

const isReal = (id: string) => id.startsWith('goal_');

interface EditDraft {
  title: string;
  deadline: string;
  priorityLevel: number;
}

export function GoalsScreen() {
  // 목표의 결이 바뀌면 계획의 전제(가용 시간·역량·마감·회복 톤)가 통째로 무너진다.
  // 여기서 딥 인터뷰로 되돌아갈 수 있어야 하고, 끝나면 온보딩이 아니라 이 화면으로 와야 한다(#216).
  const { setScreen, setInterviewReturnTo, setMandalaGoalId } = useNavigation();
  const [confirmReinterview, setConfirmReinterview] = useState(false);
  // 초기값 비움 → 로딩 중 스켈레톤, 실패 시엔 빈 목록 + 에러(더미로 가리지 않는다).
  const [goals, setGoals] = useState<ApiGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // goals 가 실데이터(비어있어도)인지 — list() 성공 시 true.
  const [usingReal, setUsingReal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [decomp, setDecomp] = useState<{ goalId: string; data: GoalDecomposition } | null>(null);
  const [decompBusy, setDecompBusy] = useState<string | null>(null);

  // 추가 폼
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addCategory, setAddCategory] = useState('study');
  const [addTier, setAddTier] = useState<GoalTier>('focus');
  const [addDeadline, setAddDeadline] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addLimitHit, setAddLimitHit] = useState(false);

  const fetchGoals = useCallback(() => {
    setIsLoading(true);
    let cancelled = false;
    goalsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        // 200 응답 = 연동 성공. 비어있어도 실데이터(빈 목표)로 처리한다.
        setUsingReal(true);
        setGoals([...res.focus, ...res.maintain, ...res.parked]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(friendlyError(err, '목표를 불러오지 못했어요.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => fetchGoals(), [fetchGoals]);

  const count = (tier: GoalTier) => goals.filter((g) => g.goalTier === tier).length;

  // 궁극목표는 사용자당 1개. parked 그룹에 일반 목표와 섞여 오므로 isUltimate 로만 구분한다.
  const ultimateGoal = goals.find((g) => g.isUltimate) ?? null;

  // ── tier 변경 (focus/maintain → PATCH, parked → park) ──
  const changeTier = async (goal: ApiGoal, tier: GoalTier) => {
    if (goal.goalTier === tier) return;
    const prev = goals;
    setGoals((gs) => gs.map((g) => (g.goalId === goal.goalId ? { ...g, goalTier: tier } : g)));
    setError(null);
    if (!isReal(goal.goalId)) return; // 더미 — 로컬만
    try {
      const updated = tier === 'parked'
        ? await goalsApi.park(goal.goalId)
        : await goalsApi.update(goal.goalId, { goalTier: tier });
      setGoals((gs) => gs.map((g) => (g.goalId === updated.goalId ? updated : g)));
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGoals(prev); // 422 한도 초과 등 — 되돌리고 사유 표시
        setError(friendlyError(err, '분류를 바꾸지 못했어요.'));
      }
    }
  };

  // ── 인라인 수정 (제목/마감/우선순위) ──
  const startEdit = (goal: ApiGoal) => {
    setEditId(goal.goalId);
    setEdit({ title: goal.title, deadline: goal.deadline ?? '', priorityLevel: goal.priorityLevel });
  };

  const saveEdit = async (goal: ApiGoal) => {
    if (!edit) return;
    const body = {
      title: edit.title.trim(),
      deadline: edit.deadline.trim() || null,
      priorityLevel: edit.priorityLevel,
    };
    const prev = goals;
    setGoals((gs) => gs.map((g) => (g.goalId === goal.goalId ? { ...g, ...body } : g)));
    setEditId(null);
    setEdit(null);
    setError(null);
    if (!isReal(goal.goalId)) return;
    try {
      const updated = await goalsApi.update(goal.goalId, body);
      setGoals((gs) => gs.map((g) => (g.goalId === updated.goalId ? updated : g)));
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGoals(prev);
        setError(friendlyError(err, '목표를 수정하지 못했어요.'));
      }
    }
  };

  // ── 삭제 (soft) ──
  const removeGoal = async (goal: ApiGoal) => {
    const prev = goals;
    setGoals((gs) => gs.filter((g) => g.goalId !== goal.goalId));
    setConfirmDeleteId(null);
    setExpandedId(null);
    if (!isReal(goal.goalId)) return;
    try {
      await goalsApi.remove(goal.goalId);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGoals(prev);
        setError(friendlyError(err, '목표를 삭제하지 못했어요.'));
      }
    }
  };

  // ── 분해 트리 조회 ──
  // 생성이 아니라 **읽기**다. 트리는 계획 승인 시 만들어져 저장돼 있고, 여기서는 그걸 보여줄
  // 뿐이다. 승인 전 목표는 nodes=[] 로 와서 빈 상태 안내를 띄운다.
  const openNodes = async (goal: ApiGoal) => {
    if (decomp?.goalId === goal.goalId) { setDecomp(null); return; }  // 토글
    setDecompBusy(goal.goalId);
    setError(null);
    try {
      const data = await goalsApi.nodes(goal.goalId);
      setDecomp({ goalId: goal.goalId, data });
    } catch (err: unknown) {
      setError(friendlyError(err, '단계를 불러오지 못했어요.'));
    } finally {
      setDecompBusy(null);
    }
  };

  // ── 추가 ──
  const resetAdd = () => {
    setShowAdd(false);
    setAddTitle('');
    setAddCategory('study');
    setAddTier('focus');
    setAddDeadline('');
    setAddError(null);
    setAddLimitHit(false);
  };

  const addGoal = async (tierOverride?: GoalTier) => {
    const tier = tierOverride ?? addTier;
    if (!addTitle.trim()) return;
    const body = {
      title: addTitle.trim(),
      category: addCategory,
      goalTier: tier,
      priorityLevel: 3,
      deadline: addDeadline.trim() || null,
    };
    setAddError(null);
    try {
      const created = await goalsApi.create(body);
      setGoals((gs) => [...gs, created]);
      resetAdd();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setAddError(err.message);
        setAddLimitHit(err.code === 'GOAL_TIER_LIMIT_EXCEEDED');
      } else {
        // 백엔드 미동작 — 더미라도 추가해 시연 유지
        setGoals((gs) => [
          ...gs,
          { goalId: `demo-${Date.now()}`, title: body.title, category: body.category, goalTier: tier, priorityLevel: 3, deadline: body.deadline, estimatedMinutes: 0, status: 'active' },
        ]);
        resetAdd();
      }
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 헤더 + tier 사용량 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Target size={18} weight="fill" color="var(--brand)" />
            <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>목표 관리</h1>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
            {isLoading ? '목표를 불러오는 중…' : '집중·유지·보류로 나눠 관리해요. 집중은 최대 3개, 유지는 5개까지.'}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['focus', 'maintain'] as GoalTier[]).map((t) => {
              const m = GOAL_STATUS_META[t];
              const limit = TIER_LIMIT[t];
              const n = count(t);
              const full = limit != null && n >= limit;
              return (
                <span key={t} className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 10px', background: m.bg, border: `1px solid ${m.border}`, color: m.color, borderRadius: 9999, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, opacity: full ? 1 : 0.92 }}>
                  {m.label} {n}/{limit}{full ? ' · 가득참' : ''}
                </span>
              );
            })}
          </div>
          {/* 목표의 결이 바뀌었을 때의 탈출구(#216). 강제로 끌고 가지 않는다 —
              누를지 말지는 사용자가 정하고, 무슨 일이 일어나는지는 시트에서 밝힌다. */}
          <button
            onClick={() => setConfirmReinterview(true)}
            style={{ marginTop: 10, alignSelf: 'flex-start', height: 'var(--ctrl-sm)', padding: '0 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <ChatCircleDots size={13} weight="fill" />
            목표가 바뀌었어요 · 다시 인터뷰하기
          </button>

          {/* 궁극적 목표(#220) — 한 학기가 아니라 여러 학기를 관통하는 목표.
              tier="parked" 로 아래 목록에도 섞여 나오지만, 여기서 만다라트로 바로 들어간다. */}
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 16, background: ultimateGoal ? 'var(--surface-raised)' : 'var(--brand-soft)', border: `1px solid ${ultimateGoal ? 'var(--sand-200)' : 'var(--coral-200)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <SquaresFour size={14} weight="fill" color="var(--brand)" />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>궁극적 목표 만다라트</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 10px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
              {ultimateGoal
                ? `「${ultimateGoal.title}」을(를) 8개 축으로 펼쳐서 보고 있어요.`
                : '몇 년을 관통하는 목표를 하나 세우고, 8개 축 · 64칸으로 펼쳐 봐요.'}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ultimateGoal && (
                <ReButton
                  variant="primary"
                  size="sm"
                  onClick={() => { setMandalaGoalId(ultimateGoal.goalId); setScreen('mandala'); }}
                >
                  만다라트 보기
                </ReButton>
              )}
              <ReButton
                variant={ultimateGoal ? 'ghost' : 'primary'}
                size="sm"
                onClick={() => { setMandalaGoalId(null); setScreen('ultimate-interview'); }}
              >
                {ultimateGoal ? '다시 세우기' : '궁극적 목표 세우기'}
              </ReButton>
            </div>
          </div>
        </div>

        {error && (
          <ErrorBanner>{error}</ErrorBanner>
        )}

        {/* 첫 로드 중엔 스켈레톤, 연동 성공했는데 목표가 없으면 빈 상태 안내. */}
        {isLoading && (
          <SkeletonBlock count={3} height={72} radius={14} />
        )}
        {!isLoading && usingReal && goals.length === 0 && (
          <EmptyState>
            아직 등록된 목표가 없어요. 아래 <b>+ 목표 추가</b>로 만들어보세요.
          </EmptyState>
        )}

        {/* tier 별 그룹 */}
        {!isLoading && TIER_ORDER.map((tier) => {
          const items = goals.filter((g) => g.goalTier === tier);
          if (items.length === 0) return null;
          const m = GOAL_STATUS_META[tier];
          return (
            <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-3)' }}>
                {m.label} · {items.length}
              </div>
              {items.map((g) => {
                const isExp = expandedId === g.goalId;
                const isEditing = editId === g.goalId;
                return (
                  <GoalCard
                    key={g.goalId}
                    title={g.title}
                    tier={g.goalTier}
                    categoryLabel={categoryLabel(g.category)}
                    deadline={g.deadline}
                    priorityLevel={g.priorityLevel}
                    expanded={isExp}
                    onToggle={() => { setExpandedId(isExp ? null : g.goalId); setConfirmDeleteId(null); }}
                    proposed={g.status === 'proposed'}
                  >

                    {/* 인라인 수정 폼 */}
                    {isEditing && edit && (
                      <>
                        <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="제목" style={inputStyle} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input value={edit.deadline} onChange={(e) => setEdit({ ...edit, deadline: e.target.value })} placeholder="마감 YYYY-MM-DD" style={{ ...inputStyle, flex: 1 }} />
                          <select value={edit.priorityLevel} onChange={(e) => setEdit({ ...edit, priorityLevel: Number(e.target.value) })} style={{ ...inputStyle, width: 96 }}>
                            {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>우선순위 {p}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <ReButton variant="ghost" size="sm" onClick={() => { setEditId(null); setEdit(null); }}>취소</ReButton>
                          <div style={{ flex: 1 }}>
                            <ReButton variant="primary" size="sm" full onClick={() => saveEdit(g)} disabled={!edit.title.trim()}>저장</ReButton>
                          </div>
                        </div>
                      </>
                    )}

                    {/* 액션 패널 */}
                    {!isEditing && (
                      <>
                        {/* 만다라트에서 온 목표는 어느 축에서 왔는지 카드에서 바로 보인다.
                            (서버가 GET /goals 응답에 축 제목을 실어준다 — 카드마다 별도 조회하지 않는다) */}
                        {g.promotedFromAxis && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', height: 24, padding: '0 9px', borderRadius: 9999, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', fontSize: 11, fontWeight: 700 }}>
                            <ArrowUpRight size={10} weight="bold" /> 만다라트 축 · {g.promotedFromAxis}
                          </div>
                        )}
                        {g.isUltimate && (
                          <button
                            onClick={() => { setMandalaGoalId(g.goalId); setScreen('mandala'); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', height: 34, padding: '0 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                          >
                            <SquaresFour size={13} weight="fill" /> 만다라트 보기
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: 5 }}>
                          {TIER_ORDER.map((t) => {
                            const tm = GOAL_STATUS_META[t];
                            const active = g.goalTier === t;
                            return (
                              <button key={t} onClick={() => changeTier(g, t)} style={{ flex: 1, height: 36, borderRadius: 9999, fontSize: 11, fontWeight: 600, background: active ? tm.color : 'var(--surface-ground)', color: active ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${active ? tm.color : 'var(--sand-200)'}`, cursor: 'pointer' }}>{tm.label}</button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <IconAction icon={<PencilSimple size={13} />} label="수정" onClick={() => startEdit(g)} />
                          <IconAction icon={<TreeStructure size={13} />} label={decompBusy === g.goalId ? '불러오는 중…' : '단계 보기'} onClick={() => openNodes(g)} disabled={decompBusy === g.goalId} />
                          {confirmDeleteId === g.goalId ? (
                            <button onClick={() => removeGoal(g)} style={{ flex: 1, height: 34, borderRadius: 10, border: 'none', background: 'var(--danger)', color: '#FFFCF6', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>정말 삭제</button>
                          ) : (
                            <IconAction icon={<Trash size={13} />} label="삭제" tone="danger" onClick={() => setConfirmDeleteId(g.goalId)} />
                          )}
                        </div>

                        {decomp && decomp.goalId === g.goalId && (
                          <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-sunken)', border: '1px solid var(--sand-200)' }}>
                            {decomp.data.nodes.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
                                아직 이 목표의 단계가 없어요. 계획을 만들고 <b>이대로 시작</b>을 누르면
                                여기에 단계가 저장돼요.
                              </div>
                            ) : (
                              <>
                                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>계획에 저장된 단계</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {decomp.data.nodes.map((n) => (
                                    <div key={n.nodeId} style={{ paddingLeft: n.depth * 12, fontSize: 12, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ width: 4, height: 4, borderRadius: 9999, background: 'var(--brand)', flexShrink: 0 }} />
                                      {n.title}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </GoalCard>
                );
              })}
            </div>
          );
        })}

        {/* 추가 */}
        {showAdd ? (
          <div style={{ background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--coral-700)' }}>새 목표</div>
            <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="예: 정보처리기사 필기" style={inputStyle} />
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={addCategory} onChange={(e) => setAddCategory(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                {GOAL_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <input value={addDeadline} onChange={(e) => setAddDeadline(e.target.value)} placeholder="마감 YYYY-MM-DD" style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {TIER_ORDER.map((t) => {
                const tm = GOAL_STATUS_META[t];
                const active = addTier === t;
                return (
                  <button key={t} onClick={() => { setAddTier(t); setAddLimitHit(false); }} style={{ flex: 1, height: 34, borderRadius: 9999, fontSize: 11, fontWeight: 600, background: active ? tm.color : 'var(--surface-raised)', color: active ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${active ? tm.color : 'var(--sand-200)'}`, cursor: 'pointer' }}>{tm.label}</button>
                );
              })}
            </div>
            {addError && (
              <ErrorBanner
                action={
                  addLimitHit && addTier !== 'maintain' ? (
                    <button onClick={() => addGoal('maintain')} style={{ alignSelf: 'flex-start', height: 28, padding: '0 10px', borderRadius: 9999, border: '1px solid var(--coral-300, #EBA98F)', background: 'var(--surface-raised)', color: 'var(--coral-700)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      유지(Maintain)로 추가할까요?
                    </button>
                  ) : undefined
                }
              >
                {addError}
              </ErrorBanner>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <ReButton variant="ghost" size="sm" onClick={resetAdd}>취소</ReButton>
              <div style={{ flex: 1 }}>
                <ReButton variant="primary" size="sm" full onClick={() => addGoal()} disabled={!addTitle.trim()}>추가</ReButton>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', height: 40, borderRadius: 12, border: '1.5px dashed var(--sand-300)', background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={14} /> 목표 추가
          </button>
        )}
      </div>

      {/* 재인터뷰 확인(#216) — 문구와 동작은 주간 계획 화면과 공유한다(ReinterviewSheet). */}
      <ReinterviewSheet
        open={confirmReinterview}
        onClose={() => setConfirmReinterview(false)}
        onConfirm={() => {
          setConfirmReinterview(false);
          // 끝나면 온보딩 체인이 아니라 이 화면으로 돌아오게 표시해둔다.
          setInterviewReturnTo('goals');
          setScreen('goal-intake');
        }}
      />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--sand-200)',
  background: 'var(--surface-raised)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  color: 'var(--text-1)',
};
