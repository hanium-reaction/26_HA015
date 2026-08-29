import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowClockwise, ArrowRight, LockSimple, Sparkle, Trash, WarningCircle } from '@phosphor-icons/react';
import { friendlyError, plansApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import {
  AXIS_COUNT,
  boardFromDraft,
  clearLocalEdit,
  loadLocalEdit,
  saveLocalEdit,
  type MandalaSlot,
} from '../lib/mandala';
import { MandalaAxisStrip, MandalaBlockView } from '../components/MandalaGrid';
import { MandalaCellSheet } from '../components/MandalaCellSheet';
import { ErrorBanner } from '../components/ErrorBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { ReButton } from '../components/ReButton';
import type { MandalaCell, MandalaCenterPreview, MandalaSubgoal } from '../types/api';

// S30 — AI 만다라트 초안(HITL 승인).
//
// 승인 모델은 3층이다(#220 §3):
//   셀 텍스트 수정 → 서버 호출 없음. 최종 승인(U6) body 에 편집본을 통째로 실어 보낸다.
//   링(8칸) 재생성 → U5 (LLM 1콜)
//   전체 확정 / 처음부터 → U6 / U7
//
// 서버 호출이 없는 층이 있으므로 편집본은 planId 키로 localStorage 에 즉시 저장한다 —
// 앱이 죽으면 편집이 통째로 날아간다. Draft 는 72시간 후 만료(410)된다.

type Stage = 'axes' | 'cells';

interface MandalaDraftScreenProps {
  goalId: string;
  /** 승인(U6) 성공 — 상시 뷰(S31)로. */
  onApproved: (goalId: string) => void;
  /** 폐기하거나 접고 나갈 때. */
  onLeave: () => void;
}

export function MandalaDraftScreen({ goalId, onApproved, onLeave }: MandalaDraftScreenProps) {
  const toast = useToast();
  const [stage, setStage] = useState<Stage>('axes');
  const [center, setCenter] = useState<MandalaCenterPreview | null>(null);
  const [subgoals, setSubgoals] = useState<MandalaSubgoal[]>([]);
  const [cells, setCells] = useState<MandalaCell[]>([]);
  const [gaps, setGaps] = useState<{ subgoalIndex: number; orderIndex: number; reason: string }[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [aiSource, setAiSource] = useState<'llm' | 'rule'>('llm');
  const [busy, setBusy] = useState<null | 'load' | 'generate' | 'regen' | 'approve' | 'discard'>('load');
  const [error, setError] = useState<string | null>(null);
  const [axis, setAxis] = useState<number | null>(null);
  const [selected, setSelected] = useState<MandalaSlot | null>(null);
  const [hint, setHint] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // ── Stage A (U2) — 8축 ──
  const loadSubgoals = useCallback(async () => {
    setBusy('load');
    setError(null);
    try {
      const res = await plansApi.mandalaSubgoals({ goalId });
      setCenter(res.center);
      setSubgoals(normalizeSubgoals(res.subgoals));
      setAiSource(res.aiSource ?? 'llm');
      setPlanId(null);
      forgetPlanId(goalId);
      setCells([]);
      setGaps([]);
      setStage('axes');
    } catch (err: unknown) {
      setError(friendlyError(err, '하위 목표를 만들지 못했어요.'));
    } finally {
      setBusy(null);
    }
  }, [goalId]);

  // 진입 시: 이 목표로 만들어 둔 초안이 있으면 U4 로 스냅샷만 다시 받아 이어서 본다
  // (LLM 재호출 0회). 만료(410)·없음(404)이면 Stage A 부터 새로 시작한다.
  useEffect(() => {
    let cancelled = false;
    const key = `reaction.mandalaPlanId.${goalId}`;
    const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    if (!saved) {
      void loadSubgoals();
      return;
    }
    setBusy('load');
    plansApi
      .mandalaGet(saved)
      .then((draft) => {
        if (cancelled) return;
        applyDraft(draft);
        const edit = loadLocalEdit(draft.planId);
        if (edit) {
          setSubgoals(normalizeSubgoals(edit.subgoals));
          setCells(edit.cells);
          setCenter((c) => (c ? { ...c, whyText: edit.centerWhyText } : c));
        }
        setAxis(0);
        setBusy(null);
      })
      .catch(() => {
        if (cancelled) return;
        // 만료·삭제된 초안 — 흔적을 지우고 처음부터.
        window.localStorage.removeItem(key);
        clearLocalEdit(saved);
        void loadSubgoals();
      });
    return () => {
      cancelled = true;
    };
  }, [goalId, loadSubgoals]);

  // 승인 전 편집본은 서버에 없다 — planId 가 생기는 순간부터 로컬에 계속 붙여둔다.
  useEffect(() => {
    if (!planId || stage !== 'cells') return;
    saveLocalEdit(planId, { subgoals, cells, centerWhyText: center?.whyText ?? null });
  }, [planId, stage, subgoals, cells, center]);

  const board = useMemo(
    () => boardFromDraft(center ?? { title: '', whyText: null }, subgoals, cells, gaps),
    [center, subgoals, cells, gaps],
  );

  const applyDraft = (d: {
    planId: string;
    center: MandalaCenterPreview;
    subgoals: MandalaSubgoal[];
    cells: MandalaCell[];
    gaps: { subgoalIndex: number; orderIndex: number; reason: string }[];
    aiSource?: 'llm' | 'rule';
  }) => {
    setPlanId(d.planId);
    // 화면을 떠났다 돌아와도 같은 초안으로 이어가기 위한 흔적(U4 로 스냅샷만 다시 받는다).
    if (typeof window !== 'undefined') window.localStorage.setItem(`reaction.mandalaPlanId.${goalId}`, d.planId);
    setCenter(d.center);
    setSubgoals(normalizeSubgoals(d.subgoals));
    setCells(d.cells);
    setGaps(d.gaps);
    setAiSource(d.aiSource ?? 'llm');
    setStage('cells');
  };

  // ── Stage B (U3) — 64칸 ──
  const generate = async () => {
    setBusy('generate');
    setError(null);
    try {
      const draft = await plansApi.mandalaGenerate({ goalId, subgoals });
      // 같은 초안으로 돌아온 경우(재진입) 로컬 편집본이 있으면 그쪽이 권위다 —
      // 승인 전 편집은 서버에 아예 없기 때문에 서버 스냅샷으로 덮으면 사용자 편집이 사라진다.
      const saved = loadLocalEdit(draft.planId);
      applyDraft(draft);
      if (saved) {
        setSubgoals(normalizeSubgoals(saved.subgoals));
        setCells(saved.cells);
        setCenter((c) => (c ? { ...c, whyText: saved.centerWhyText } : c));
        toast.info('이 기기에 저장해 둔 편집 내용을 이어서 불러왔어요.');
      }
      setAxis(0);
    } catch (err: unknown) {
      setError(friendlyError(err, '만다라트 초안을 만들지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  // ── 링 재생성 (U5) ──
  const regenerate = async (subgoalIndex: number) => {
    if (!planId) return;
    setBusy('regen');
    setError(null);
    try {
      const draft = await plansApi.mandalaRegenerateBranch(planId, {
        subgoalIndex,
        userHint: hint.trim() || null,
        // 재생성 대상이 아닌 칸의 현재 편집 상태를 함께 보낸다(서버는 그대로 되돌려준다).
        editedSubgoals: subgoals,
        editedCells: cells,
      });
      applyDraft(draft);
      setHint('');
      toast.success('이 축의 8칸을 다시 만들었어요.');
    } catch (err: unknown) {
      setError(friendlyError(err, '이 축을 다시 만들지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  // ── 승인 (U6) ──
  const approve = async () => {
    if (!planId) return;
    setBusy('approve');
    setError(null);
    try {
      const res = await plansApi.mandalaApprove(planId, {
        subgoals,
        cells,
        centerWhyText: center?.whyText ?? null,
      });
      clearLocalEdit(planId);
      forgetPlanId(goalId);
      toast.success(`${res.activated}칸을 확정했어요.`);
      onApproved(res.goalId);
    } catch (err: unknown) {
      setError(friendlyError(err, '만다라트를 확정하지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  // ── 폐기 (U7) ──
  const discard = async () => {
    setBusy('discard');
    setError(null);
    try {
      if (planId) {
        await plansApi.discard(planId);
        clearLocalEdit(planId);
      }
      forgetPlanId(goalId);
      onLeave();
    } catch (err: unknown) {
      setError(friendlyError(err, '초안을 버리지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  // ── 로컬 셀/축 편집 (서버 호출 없음) ──
  const applyLocalEdit = (slot: MandalaSlot, patch: { title: string; whyText: string | null }) => {
    if (slot.role === 'axis') {
      setSubgoals((prev) =>
        prev.map((s) => (s.orderIndex === slot.axisIndex ? { ...s, title: patch.title, whyText: patch.whyText, source: 'user' } : s)),
      );
      return;
    }
    if (slot.role === 'leaf') {
      setCells((prev) => {
        const idx = prev.findIndex((c) => c.subgoalIndex === slot.axisIndex && c.orderIndex === slot.cellIndex);
        // 비우면 그 칸은 목록에서 뺀다 — 빈 문자열을 실어 보내면 "제목 없는 칸"이 확정된다.
        if (patch.title.trim() === '') {
          return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
        }
        const next: MandalaCell = {
          subgoalIndex: slot.axisIndex,
          orderIndex: slot.cellIndex,
          title: patch.title.trim(),
          source: 'user',
        };
        if (idx >= 0) return prev.map((c, i) => (i === idx ? next : c));
        return [...prev, next];
      });
    }
  };

  const filledAxes = subgoals.filter((s) => s.title.trim() !== '').length;
  const filledCells = cells.filter((c) => c.title.trim() !== '').length;

  if (busy === 'load') {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkle size={14} weight="fill" className="pulse" color="var(--brand)" /> 궁극적 목표를 8개 축으로 나누는 중…
        </div>
        <SkeletonBlock count={4} height={56} radius={14} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <ErrorBanner action={<ReButton variant="ghost" size="sm" onClick={() => (stage === 'axes' ? void loadSubgoals() : setError(null))}>다시 시도</ReButton>}>
            {error}
          </ErrorBanner>
        )}

        {center && (
          <div style={{ padding: '12px 14px', borderRadius: 16, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--coral-700)', marginBottom: 4 }}>가운데 칸 · 궁극적 목표</div>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.5, color: 'var(--text-1)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{center.title}</div>
            {center.whyText && <div style={{ fontSize: 12, color: 'var(--coral-700)', marginTop: 6, lineHeight: 1.55 }}>{center.whyText}</div>}
          </div>
        )}

        {aiSource === 'rule' && (
          <div style={{ display: 'flex', gap: 7, padding: '10px 12px', borderRadius: 12, border: '1px dashed var(--sand-300)', background: 'var(--surface-raised)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
            <WarningCircle size={14} weight="fill" color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
            AI가 아니라 규칙으로 채운 초안이에요. 직접 고쳐 쓰는 편이 훨씬 나아요.
          </div>
        )}

        {/* ── Stage A: 8축 확인·편집 ── */}
        {stage === 'axes' && (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 3 }}>① 8개 축부터 확인해요</div>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                축 이름은 여기까지만 고칠 수 있어요. 64칸을 만들고 나면 축의 개수와 순서는 고정돼요.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {subgoals.map((s) => (
                <div key={s.orderIndex} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 12, background: 'var(--surface-raised)', border: `1px solid ${s.locked ? 'var(--coral-200)' : 'var(--sand-200)'}` }}>
                  <span className="tnum" style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 9999, background: 'var(--sand-100)', color: 'var(--text-3)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {s.orderIndex + 1}
                  </span>
                  <input
                    value={s.title}
                    onChange={(e) =>
                      setSubgoals((prev) => prev.map((x) => (x.orderIndex === s.orderIndex ? { ...x, title: e.target.value, source: 'user' } : x)))
                    }
                    placeholder="비워 두면 그 축은 만들지 않아요"
                    aria-label={`${s.orderIndex + 1}번 축 이름`}
                    style={{ flex: 1, minWidth: 0, height: 34, border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }}
                  />
                  {s.locked && (
                    <span title="내가 직접 말한 축" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--coral-700)' }}>
                      <LockSimple size={11} weight="fill" /> 직접 말함
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
              {filledAxes}/{AXIS_COUNT}개 축이 채워졌어요. 자물쇠가 붙은 축은 인터뷰에서 직접 말한 축이라 축을 다시 뽑아도 유지돼요.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <ReButton variant="ghost" onClick={() => void loadSubgoals()} disabled={busy != null}>
                <ArrowClockwise size={14} /> 다시 뽑기
              </ReButton>
              <div style={{ flex: 1 }}>
                <ReButton variant="primary" full onClick={generate} disabled={busy != null || filledAxes === 0}>
                  {busy === 'generate' ? '64칸을 만드는 중…' : '이 8축으로 64칸 만들기'}
                </ReButton>
              </div>
            </div>
          </>
        )}

        {/* ── Stage B: 64칸 확인·편집 ── */}
        {stage === 'cells' && (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 3 }}>② 칸을 확인하고 고쳐요</div>
              <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
                점선 칸은 AI가 억지로 채우지 않고 비워 둔 자리예요. 지금 편집한 내용은 확정을 눌러야 서버에 남아요.
              </p>
            </div>

            <MandalaAxisStrip board={board} active={axis} onChange={setAxis} />
            <MandalaBlockView
              board={board}
              axisIndex={axis}
              onSelect={(s) => (s.role === 'axis' && axis == null ? setAxis(s.axisIndex) : s.role === 'core' ? undefined : setSelected(s))}
            />

            {axis != null && (
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>이 축이 마음에 안 들면</div>
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="어떻게 바꿀지 한 줄로 (선택) — 예: 더 구체적인 행동으로"
                  style={{ height: 40, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '0 12px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }}
                />
                <ReButton variant="ghost" size="sm" full onClick={() => void regenerate(axis)} disabled={busy != null}>
                  <ArrowClockwise size={13} /> {busy === 'regen' ? '다시 만드는 중…' : '이 축의 8칸만 다시 만들기'}
                </ReButton>
                <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                  다시 만들어도 내가 직접 고친 칸은 그대로 남아요.
                </p>
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
              {filledCells}칸이 채워졌어요 (최대 64칸). 빈 칸은 그대로 둬도 괜찮아요.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <ReButton variant="primary" size="lg" full onClick={approve} disabled={busy != null}>
                {busy === 'approve' ? '확정하는 중…' : '이대로 확정하기'} <ArrowRight size={16} />
              </ReButton>
              {confirmDiscard ? (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: '#FAE2D8', border: '1px solid var(--coral-200)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--coral-700)', lineHeight: 1.55 }}>
                    이 초안과 지금까지 고친 내용이 모두 사라져요. 정말 버릴까요?
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ReButton variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>그대로 둘래요</ReButton>
                    <div style={{ flex: 1 }}>
                      <ReButton variant="primary" size="sm" full onClick={discard} disabled={busy != null}>정말 버리기</ReButton>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDiscard(true)}
                  style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 36, padding: '0 12px', borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <Trash size={12} /> 이 초안 버리고 처음부터
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {selected && (
        <MandalaCellSheet
          board={board}
          slot={selected}
          mode="draft"
          onClose={() => setSelected(null)}
          onLocalSave={applyLocalEdit}
        />
      )}
    </div>
  );
}

function forgetPlanId(goalId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(`reaction.mandalaPlanId.${goalId}`);
}

// 서버는 항상 8개를 주지만, 화면은 자리 8개가 언제나 있다고 가정한다(빈 축 포함).
function normalizeSubgoals(list: MandalaSubgoal[]): MandalaSubgoal[] {
  return Array.from({ length: AXIS_COUNT }, (_, k) => {
    const found = list.find((s) => s.orderIndex === k);
    return found ?? { orderIndex: k, title: '', source: 'rule' as const, locked: false, whyText: null };
  });
}
