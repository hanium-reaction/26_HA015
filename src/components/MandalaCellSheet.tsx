import React, { useEffect, useState } from 'react';
import { X, LockSimple, Quotes, Sparkle, PencilSimple, Check, ArrowUpRight, Gauge, Repeat } from '@phosphor-icons/react';
import { friendlyError, goalsApi, habitsApi } from '../lib/api';
import { GOAL_STATUS_META } from '../data';
import { SOURCE_LABEL, type MandalaBoard, type MandalaSlot } from '../lib/mandala';
import type { ApiGoal, GoalTier, HabitInstance, MandalaNode } from '../types/api';
import { ErrorBanner } from './ErrorBanner';

// S32 — 셀 상세 바텀시트.
//
// 두 곳에서 쓴다:
//  · mode="tree"  승인된 만다라(S31). 저장은 즉시 서버로(U9), 축은 승격(U10) 가능.
//  · mode="draft" 승인 전 초안(S30). 서버 호출 없이 로컬 편집만 — 최종 승인(U6) body 에 실려 나간다.
//
// 어느 모드든 누가 썼는지(source)·왜 그런지(whyText)·직접 체크했는지(completedAt)는 계속 보존해 보여준다.

export type CellSheetMode = 'tree' | 'draft';

interface MandalaCellSheetProps {
  board: MandalaBoard;
  slot: MandalaSlot;
  mode: CellSheetMode;
  onClose: () => void;
  /** tree 모드 — U9 응답 노드를 상위로 올려 격자를 갱신한다. */
  onUpdated?: (node: MandalaNode) => void;
  /** tree 모드 — U10 승격 성공. */
  onPromoted?: (goal: ApiGoal, slot: MandalaSlot) => void;
  /** tree 모드 — 반복형 링크 변경 후 상위 트리의 habitId/롤업을 다시 읽는다. */
  onHabitChanged?: () => void;
  /** draft 모드 — 로컬 편집본 반영(서버 호출 없음). */
  onLocalSave?: (slot: MandalaSlot, patch: { title: string; whyText: string | null }) => void;
}

const TIER_CHOICES: GoalTier[] = ['focus', 'maintain', 'parked'];

export function MandalaCellSheet({ board, slot, mode, onClose, onUpdated, onPromoted, onHabitChanged, onLocalSave }: MandalaCellSheetProps) {
  const [title, setTitle] = useState(slot.title);
  const [whyText, setWhyText] = useState(slot.whyText ?? '');
  const [busy, setBusy] = useState<null | 'save' | 'complete' | 'promote' | 'habit' | 'check'>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState<ApiGoal | null>(null);
  const [tier, setTier] = useState<GoalTier>('focus');
  const [habitId, setHabitId] = useState<string | null>(slot.habitId);
  const [habitInstance, setHabitInstance] = useState<HabitInstance | null>(null);
  const [frequency, setFrequency] = useState(3);

  // 다른 칸을 눌러 시트 내용이 바뀌면 편집 버퍼도 그 칸으로 되돌린다.
  useEffect(() => {
    setTitle(slot.title);
    setWhyText(slot.whyText ?? '');
    setError(null);
    setPromoted(null);
    setHabitId(slot.habitId);
    setHabitInstance(null);
  }, [slot.nodeId, slot.role, slot.axisIndex, slot.cellIndex, slot.title, slot.whyText, slot.habitId]);

  useEffect(() => {
    if (mode !== 'tree' || !habitId) return;
    let cancelled = false;
    Promise.all([habitsApi.list(), habitsApi.instancesForWeek(currentMonday())]).then(([habits, instances]) => {
      if (cancelled) return;
      const habit = habits.find((item) => item.habitId === habitId);
      if (habit) setFrequency(habit.frequencyPerWeek);
      setHabitInstance(instances.find((item) => item.habitId === habitId) ?? null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [habitId, mode]);

  const axisTitle = slot.axisIndex >= 0 ? board.axes[slot.axisIndex]?.slot.title : null;
  const position =
    slot.role === 'core'
      ? '가운데 칸 · 궁극적 목표'
      : slot.role === 'axis'
        ? `${slot.axisIndex + 1}번 축 · 하위 목표`
        : `${axisTitle || `${slot.axisIndex + 1}번 축`} · ${slot.cellIndex + 1}번째 칸`;

  // 중앙 칸은 궁극목표 본문이라 여기서 고치지 않는다(재인터뷰로 다듬는다).
  const canEdit = slot.role !== 'core' && (mode === 'draft' || slot.nodeId != null);
  const canComplete = mode === 'tree' && slot.nodeId != null && slot.role === 'leaf';
  const canToggleHabit = canComplete && slot.filled;
  // 승격은 축(depth=1)만 — 중앙·개별 셀을 승격하려 하면 서버가 422 를 준다.
  const canPromote = mode === 'tree' && slot.role === 'axis' && slot.nodeId != null && slot.filled;

  const dirty = title !== slot.title || (whyText.trim() || null) !== (slot.whyText ?? null);

  const save = async () => {
    if (!canEdit) return;
    const patch = { title: title.trim(), whyText: whyText.trim() || null };
    if (mode === 'draft') {
      onLocalSave?.(slot, patch);
      onClose();
      return;
    }
    if (!slot.nodeId) return;
    setBusy('save');
    setError(null);
    try {
      const node = await goalsApi.updateMandalaNode(slot.nodeId, patch);
      onUpdated?.(node);
      onClose();
    } catch (err: unknown) {
      setError(friendlyError(err, '칸을 저장하지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  const toggleComplete = async () => {
    if (!canComplete || habitId || !slot.nodeId) return;
    setBusy('complete');
    setError(null);
    try {
      const node = await goalsApi.updateMandalaNode(slot.nodeId, { completed: slot.completedAt == null });
      onUpdated?.(node);
    } catch (err: unknown) {
      setError(friendlyError(err, '완료 상태를 바꾸지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  const toggleHabit = async () => {
    if (!canToggleHabit || !slot.nodeId) return;
    setBusy('habit');
    setError(null);
    try {
      if (habitId) {
        await goalsApi.unlinkMandalaHabit(slot.nodeId);
        setHabitId(null);
        setHabitInstance(null);
        onHabitChanged?.();
      } else {
        const habit = await goalsApi.linkMandalaHabit(slot.nodeId, {
          category: 'other', frequencyPerWeek: frequency, minutesPerSession: 20,
          timePreference: 'anytime', priorityLevel: 3,
        });
        setHabitId(habit.habitId);
        onHabitChanged?.();
      }
    } catch (err: unknown) {
      setError(friendlyError(err, '반복형 설정을 바꾸지 못했어요.'));
    } finally { setBusy(null); }
  };

  const checkHabit = async () => {
    if (!habitInstance) return;
    setBusy('check');
    setError(null);
    try { setHabitInstance(await habitsApi.check(habitInstance.instanceId)); }
    catch (err: unknown) { setError(friendlyError(err, '이번 주 횟수를 기록하지 못했어요.')); }
    finally { setBusy(null); }
  };

  const promote = async () => {
    if (!canPromote || !slot.nodeId) return;
    setBusy('promote');
    setError(null);
    try {
      const goal = await goalsApi.promoteMandalaNode(slot.nodeId, { goalTier: tier });
      setPromoted(goal);
      onPromoted?.(goal, slot);
    } catch (err: unknown) {
      setError(friendlyError(err, '이 축을 목표로 올리지 못했어요.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="칸 상세"
        style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '24px 24px 0 0', padding: '12px 20px 32px', boxShadow: 'var(--shadow-xl)', maxHeight: '86%', overflowY: 'auto' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 14px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>{position}</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-0.01em', wordBreak: 'keep-all', overflowWrap: 'anywhere', lineHeight: 1.4 }}>
              {slot.filled ? slot.title : '아직 비어 있는 칸'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 9999, border: 'none', background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={12} color="var(--text-2)" />
          </button>
        </div>

        {/* 출처·상태 배지 — 승인 후에도 누가 썼는지, 직접 체크했는지를 계속 보존해 보여준다. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
          <Badge icon={slot.source === 'user' ? <PencilSimple size={10} weight="fill" /> : <Sparkle size={10} weight="fill" />}>
            {SOURCE_LABEL[slot.source]}
          </Badge>
          {slot.locked && (mode === 'draft'
            ? <Badge icon={<LockSimple size={10} weight="fill" />}>내가 직접 말한 축 · 축 다시 뽑기에서 유지</Badge>
            : <Badge icon={<Quotes size={10} weight="fill" />}>인터뷰에서 직접 말한 축 · 편집 가능</Badge>)}
          {habitId && <Badge tone="brand" icon={<Repeat size={10} weight="bold" />}>반복형 칸</Badge>}
          {slot.completedAt && <Badge tone="success" icon={<Check size={10} weight="bold" />}>{formatDone(slot.completedAt)} 완료</Badge>}
          {slot.role === 'axis' && slot.progress != null && (
            <Badge icon={<Gauge size={10} weight="fill" />}>
              깊이 {Math.round(slot.progress * 100)}% · 폭 {slot.coverage == null ? '—' : `${Math.round(slot.coverage * 100)}%`}
            </Badge>
          )}
          {slot.promotedGoalId && <Badge tone="brand" icon={<ArrowUpRight size={10} weight="bold" />}>이미 학기 목표로 올린 축</Badge>}
        </div>

        {!slot.filled && (
          <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px dashed var(--sand-300)', background: 'var(--surface-ground)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
            {slot.gapReason
              ? `AI가 이 칸을 비워 뒀어요 — ${slot.gapReason}`
              : '이 칸은 비어 있어요. 억지로 채우기보다, 정말 할 일이 생겼을 때 직접 적는 게 좋아요.'}
          </div>
        )}

        {error && <div style={{ marginBottom: 12 }}><ErrorBanner>{error}</ErrorBanner></div>}

        {canEdit && (
          <>
            <Field label="제목">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={slot.role === 'axis' ? '축 이름 (10자 이내)' : '이 칸에서 할 일 (16자 이내)'}
                style={inputStyle}
              />
            </Field>
            <Field label="왜 이 칸인가 (선택)">
              <textarea
                value={whyText}
                onChange={(e) => setWhyText(e.target.value)}
                rows={3}
                placeholder="나중의 내가 이 칸을 왜 골랐는지 알 수 있게"
                style={{ ...inputStyle, height: 'auto', padding: '10px 14px', resize: 'vertical', lineHeight: 1.55 }}
              />
            </Field>
            <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5 }}>
              {mode === 'draft'
                ? '승인 전 편집은 이 기기에만 저장돼요. 마지막에 [이대로 확정]을 눌러야 서버에 남아요.'
                : '저장하면 이 칸의 출처가 “내가 씀”으로 바뀌어요.'}
            </p>
          </>
        )}

        {canToggleHabit && (
          <div style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 14, background: 'var(--surface-ground)', border: '1px solid var(--sand-200)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>이건 반복이에요</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{habitId ? '완료 대신 이번 주 횟수로 기록해요.' : '끝이 없는 활동이라면 반복형으로 바꿔요.'}</div>
              </div>
              <button onClick={toggleHabit} disabled={busy != null} aria-pressed={habitId != null} style={{ minWidth: 62, height: 36, borderRadius: 9999, border: 'none', background: habitId ? 'var(--brand-surface)' : 'var(--sand-200)', color: habitId ? '#FFFCF6' : 'var(--text-2)', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                {busy === 'habit' ? '변경 중' : habitId ? '반복 중' : '전환'}
              </button>
            </div>
            {!habitId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11, color: 'var(--text-2)' }}>
                주간 목표
                <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} style={{ height: 32, borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontFamily: 'inherit' }}>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}회</option>)}
                </select>
              </label>
            )}
            {habitId && habitInstance && (
              <button onClick={checkHabit} disabled={busy != null} style={{ width: '100%', minHeight: 42, marginTop: 10, borderRadius: 10, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}>
                {busy === 'check' ? '기록 중…' : `${habitInstance.doneCount}회 / 목표 ${habitInstance.targetCount}회 · 1회 기록`}
              </button>
            )}
          </div>
        )}

        {/* 완료 체크 — 반복형이 아닌 셀만. 축·중앙은 롤업이라 직접 체크하지 않는다. */}
        {canComplete && !habitId && (
          <button
            onClick={toggleComplete}
            disabled={busy != null}
            style={{
              width: '100%',
              minHeight: 44,
              marginBottom: 10,
              borderRadius: 12,
              border: `1.5px solid ${slot.completedAt ? 'var(--success)' : 'var(--sand-200)'}`,
              background: slot.completedAt ? 'var(--success-soft)' : 'var(--surface-ground)',
              color: slot.completedAt ? 'var(--text-1)' : 'var(--text-2)',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: busy === 'complete' ? 0.6 : 1,
            }}
          >
            <Check size={14} weight="bold" />
            {slot.completedAt ? '완료 취소하기' : '이 칸 완료로 체크'}
          </button>
        )}

        {/* 승격(U10) — 축만. 이미 승격했으면 새로 만들지 않고 기존 목표를 그대로 돌려준다(멱등). */}
        {canPromote && (
          <div style={{ marginTop: 4, marginBottom: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--coral-700)', marginBottom: 4 }}>이번 학기 목표로 올리기</div>
            <p style={{ fontSize: 11, color: 'var(--coral-700)', margin: '0 0 9px', lineHeight: 1.55, opacity: 0.9 }}>
              이 축을 이번 학기에 굴릴 목표로 올려요. 같은 축을 다시 눌러도 목표가 중복으로 쌓이지는 않아요.
            </p>
            <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
              {TIER_CHOICES.map((t) => {
                const meta = GOAL_STATUS_META[t];
                const active = tier === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTier(t)}
                    style={{ flex: 1, minHeight: 36, borderRadius: 9999, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', background: active ? meta.color : 'var(--surface-raised)', color: active ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${active ? meta.color : 'var(--sand-200)'}`, cursor: 'pointer' }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
            {promoted ? (
              <div style={{ fontSize: 12, color: 'var(--coral-700)', fontWeight: 700, lineHeight: 1.55 }}>
                「{promoted.title}」을(를) 목표로 올렸어요. 목표 화면에서 이어서 계획을 세울 수 있어요.
              </div>
            ) : (
              <button
                onClick={promote}
                disabled={busy != null}
                style={{ width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy === 'promote' ? 0.6 : 1 }}
              >
                <ArrowUpRight size={14} weight="bold" />
                {busy === 'promote' ? '올리는 중…' : '이 축을 목표로 올리기'}
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, minHeight: 48, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
            닫기
          </button>
          {canEdit && (
            <button
              onClick={save}
              disabled={busy != null || !dirty}
              style={{ flex: 2, minHeight: 48, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: busy || !dirty ? 'default' : 'pointer', opacity: busy != null || !dirty ? 0.45 : 1 }}
            >
              {busy === 'save' ? '저장 중…' : '저장'}
            </button>
          )}
        </div>
        {slot.role === 'core' && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '10px 0 0', lineHeight: 1.55 }}>
            가운데 칸은 궁극적 목표 본문이라 여기서 고치지 않아요. 목표 화면에서 다시 인터뷰하면 이 문장을 다듬을 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

function Badge({ children, icon, tone = 'neutral' }: { children: React.ReactNode; icon?: React.ReactNode; tone?: 'neutral' | 'success' | 'brand' }) {
  const palette =
    tone === 'success'
      ? { bg: 'var(--success-soft)', fg: 'var(--text-1)', bd: 'var(--success)' }
      : tone === 'brand'
        ? { bg: 'var(--brand-soft)', fg: 'var(--coral-700)', bd: 'var(--coral-200)' }
        : { bg: 'var(--sand-100)', fg: 'var(--text-2)', bd: 'var(--sand-200)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 24, padding: '0 9px', borderRadius: 9999, background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`, fontSize: 11, fontWeight: 600, lineHeight: 1.4 }}>
      {icon}
      {children}
    </span>
  );
}

// 서버가 KST ISO 로 내려준다. 시각까지 보여줄 자리는 없어 날짜만 쓴다.
function formatDone(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function currentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid var(--sand-200)',
  background: 'var(--surface-ground)',
  padding: '0 14px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  outline: 'none',
  boxSizing: 'border-box',
};
