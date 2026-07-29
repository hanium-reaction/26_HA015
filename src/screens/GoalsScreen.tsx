import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash, PencilSimple, TreeStructure, Target } from '@phosphor-icons/react';
import { ApiError, friendlyError, goalsApi } from '../lib/api';
import type { ApiGoal, GoalDecomposition, GoalTier } from '../types/api';
import { GOAL_STATUS_META, GOAL_CATEGORY_OPTIONS, categoryLabel } from '../data';
import { ReButton } from '../components/ReButton';
import { AiDraftCard } from '../components/AiDraftCard';
import { GoalCard } from '../components/GoalCard';
import { IconAction } from '../components/IconAction';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';

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

  // ── decompose (Draft Layer) ──
  const runDecompose = async (goal: ApiGoal) => {
    setDecompBusy(goal.goalId);
    setError(null);
    try {
      const data = await goalsApi.decompose(goal.goalId);
      setDecomp({ goalId: goal.goalId, data });
    } catch (err: unknown) {
      setError(friendlyError(err, '분해에 실패했어요.'));
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 헤더 + tier 사용량 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Target size={18} weight="fill" color="var(--brand)" />
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>목표 관리</h1>
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
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
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
                        <div style={{ display: 'flex', gap: 5 }}>
                          {TIER_ORDER.map((t) => {
                            const tm = GOAL_STATUS_META[t];
                            const active = g.goalTier === t;
                            return (
                              <button key={t} onClick={() => changeTier(g, t)} style={{ flex: 1, height: 36, borderRadius: 9999, fontSize: 11, fontWeight: 600, background: active ? tm.color : 'var(--surface-ground)', color: active ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${active ? tm.color : 'var(--sand-200)'}`, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{tm.label}</button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <IconAction icon={<PencilSimple size={13} />} label="수정" onClick={() => startEdit(g)} />
                          <IconAction icon={<TreeStructure size={13} />} label={decompBusy === g.goalId ? '분해 중…' : '분해'} onClick={() => runDecompose(g)} disabled={decompBusy === g.goalId} />
                          {confirmDeleteId === g.goalId ? (
                            <button onClick={() => removeGoal(g)} style={{ flex: 1, height: 34, borderRadius: 10, border: 'none', background: 'var(--danger)', color: '#FFFCF6', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>정말 삭제</button>
                          ) : (
                            <IconAction icon={<Trash size={13} />} label="삭제" tone="danger" onClick={() => setConfirmDeleteId(g.goalId)} />
                          )}
                        </div>

                        {decomp && decomp.goalId === g.goalId && (
                          <AiDraftCard
                            isDraft
                            aiSource="llm"
                            onAccept={() => setDecomp(null)}
                            onEdit={() => setDecomp(null)}
                            onReject={() => runDecompose(g)}
                            acceptLabel="반영"
                            editLabel="닫기"
                            rejectLabel="다시"
                          >
                            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 6 }}>하위 단계 제안</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {decomp.data.nodes.map((n) => (
                                <div key={n.nodeId} style={{ paddingLeft: n.depth * 12, fontSize: 12, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 4, height: 4, borderRadius: 9999, background: 'var(--brand)', flexShrink: 0 }} />
                                  {n.title}
                                </div>
                              ))}
                            </div>
                          </AiDraftCard>
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
                  <button key={t} onClick={() => { setAddTier(t); setAddLimitHit(false); }} style={{ flex: 1, height: 34, borderRadius: 9999, fontSize: 11, fontWeight: 600, background: active ? tm.color : 'var(--surface-raised)', color: active ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${active ? tm.color : 'var(--sand-200)'}`, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{tm.label}</button>
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
