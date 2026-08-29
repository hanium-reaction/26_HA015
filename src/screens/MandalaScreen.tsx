import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GridFour, ListBullets, SquaresFour, Sparkle, ArrowClockwise } from '@phosphor-icons/react';
import { friendlyError, goalsApi } from '../lib/api';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import { boardFromTree, type MandalaBoard, type MandalaSlot } from '../lib/mandala';
import { MandalaAxisStrip, MandalaBlockView, MandalaFullView, MandalaListView, MandalaProgress } from '../components/MandalaGrid';
import { MandalaCellSheet } from '../components/MandalaCellSheet';
import { EmptyState } from '../components/EmptyState';
import { ErrorBanner } from '../components/ErrorBanner';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { ReButton } from '../components/ReButton';
import type { MandalaNode, MandalaTreeResponse } from '../types/api';

// S31 — 만다라트 상시 뷰(73칸).
//
// 기본은 9×9 전체가 아니라 3×3 드릴다운이다. 모바일 폭에서 81칸을 균등 배치하면
// 셀 한 변이 ≈38pt 로 최소 터치 타겟(44pt)에 못 미치고 한글도 찌그러진다.
// 전체 조망은 토글로 따로 두고 읽기 전용으로 둔다.

type ViewMode = 'block' | 'full' | 'list';

interface MandalaScreenProps {
  /** 볼 만다라의 목표 id. 없으면 GET /goals 에서 궁극목표(isUltimate)를 찾는다. */
  goalId?: string | null;
  /** 궁극목표가 아직 없을 때 인터뷰(S29)로 보낸다. */
  onStartUltimate?: () => void;
  /** 궁극목표는 있는데 아직 승인된 만다라가 없을 때 초안(S30)으로 보낸다. */
  onBuildMandala?: (goalId: string) => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MandalaScreen({ goalId, onStartUltimate, onBuildMandala }: MandalaScreenProps) {
  const { setInterviewReturnTo } = useNavigation();
  const toast = useToast();
  const [tree, setTree] = useState<MandalaTreeResponse | null>(null);
  const [resolvedGoalId, setResolvedGoalId] = useState<string | null>(goalId ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 궁극목표 자체가 아직 없는 경우(만다라 미승인과 구분해야 안내 문구가 달라진다).
  const [noUltimate, setNoUltimate] = useState(false);
  // reduced-motion 사용자는 격자 대신 목록을 기본으로 — 자동 전환이지 강제는 아니다.
  const [view, setView] = useState<ViewMode>(() => (prefersReducedMotion() ? 'list' : 'block'));
  const [axis, setAxis] = useState<number | null>(null);
  const [openListAxis, setOpenListAxis] = useState<number | null>(null);
  const [selected, setSelected] = useState<MandalaSlot | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNoUltimate(false);
    try {
      let id = goalId ?? null;
      if (!id) {
        const goals = await goalsApi.list();
        const all = [...goals.focus, ...goals.maintain, ...goals.parked];
        // 궁극목표는 tier="parked" 로 일반 목표와 섞여 온다 — isUltimate 로만 구분한다.
        id = all.find((g) => g.isUltimate)?.goalId ?? null;
      }
      if (!id) {
        setNoUltimate(true);
        setTree(null);
        return;
      }
      setResolvedGoalId(id);
      const data = await goalsApi.mandala(id);
      setTree(data);
    } catch (err: unknown) {
      setError(friendlyError(err, '만다라트를 불러오지 못했어요.'));
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const board: MandalaBoard | null = useMemo(() => (tree ? boardFromTree(tree) : null), [tree]);

  // U9(셀 편집) 응답은 progress/coverage 를 다시 계산하지 않고 null 로 준다.
  // 그래서 편집한 노드만 갈아끼우고, 진척도는 U8 을 다시 불러 최신으로 맞춘다.
  const applyNode = (updated: MandalaNode) => {
    setTree((prev) =>
      prev
        ? { ...prev, nodes: prev.nodes.map((n) => (n.nodeId === updated.nodeId ? { ...n, ...updated, progress: n.progress, coverage: n.coverage } : n)) }
        : prev,
    );
    setSelected((s) => (s && s.nodeId === updated.nodeId ? { ...s, title: updated.title, whyText: updated.whyText, source: updated.source, completedAt: updated.completedAt, filled: updated.title.trim() !== '' } : s));
    if (resolvedGoalId) {
      goalsApi
        .mandala(resolvedGoalId)
        .then(setTree)
        .catch(() => { /* 진척도만 못 갱신 — 편집 자체는 이미 저장됐다 */ });
    }
  };

  if (isLoading) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SkeletonBlock count={1} height={64} radius={14} />
        <SkeletonBlock count={1} height={280} radius={18} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <ErrorBanner action={<ReButton variant="ghost" size="sm" onClick={() => void load()}>다시 시도</ReButton>}>{error}</ErrorBanner>
        )}

        {noUltimate && (
          <EmptyState
            tone="hero"
            title="궁극적 목표가 아직 없어요"
            icon={<Sparkle size={26} weight="fill" color="var(--brand)" />}
          >
            여러 학기를 관통하는 목표를 하나 세우면, 그걸 8개 축으로 펼친 만다라트를 여기서 볼 수 있어요.
          </EmptyState>
        )}
        {noUltimate && onStartUltimate && (
          <ReButton variant="primary" full onClick={onStartUltimate}>궁극적 목표 세우기</ReButton>
        )}

        {board && tree && tree.nodes.length === 0 && (
          <>
            <EmptyState tone="hero" title="아직 만다라트가 없어요" icon={<SquaresFour size={26} weight="fill" color="var(--brand)" />}>
              「{tree.statement}」은(는) 세워 뒀지만, 8축·64칸이 아직 확정되지 않았어요.<br />
              초안을 만들고 <b>이대로 확정</b>을 누르면 여기에 73칸이 남아요.
            </EmptyState>
            {resolvedGoalId && onBuildMandala && (
              <ReButton variant="primary" full onClick={() => onBuildMandala(resolvedGoalId)}>
                만다라트 초안 만들기
              </ReButton>
            )}
          </>
        )}

        {board && tree && tree.nodes.length > 0 && (
          <>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>궁극적 목표</div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.45, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                {tree.statement}
              </h1>
            </div>

            <MandalaProgress progress={tree.progress} coverage={tree.coverage} />

            {/* 뷰 전환 — 편집은 ①/③ 에서만, ② 는 조망 전용. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ViewToggle mode={view} onChange={setView} />
              <button
                onClick={() => void load()}
                aria-label="새로고침"
                style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <ArrowClockwise size={13} color="var(--text-2)" />
              </button>
            </div>

            {view === 'block' && (
              <>
                <MandalaAxisStrip board={board} active={axis} onChange={setAxis} />
                <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, padding: '0 2px' }}>
                  {axis == null
                    ? '가운데가 궁극적 목표, 둘레 8칸이 하위 목표예요. 축을 누르면 그 축의 8칸이 열려요.'
                    : '점선 칸은 아직 비워 둔 자리예요. 억지로 채우지 않아도 괜찮아요.'}
                </div>
                <MandalaBlockView board={board} axisIndex={axis} onSelect={(s) => (s.role === 'axis' && axis == null ? setAxis(s.axisIndex) : setSelected(s))} />
                {axis != null && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 2px 0', lineHeight: 1.5 }}>
                    가운데 칸을 누르면 이 축을 이번 학기 목표로 올릴 수 있어요.
                  </p>
                )}
              </>
            )}

            {view === 'full' && (
              <MandalaFullView
                board={board}
                onZoom={(a) => {
                  setAxis(a);
                  setView('block');
                }}
              />
            )}

            {view === 'list' && (
              <MandalaListView
                board={board}
                onSelect={setSelected}
                openAxis={openListAxis}
                onToggleAxis={setOpenListAxis}
              />
            )}
          </>
        )}
      </div>

      {board && selected && (
        <MandalaCellSheet
          board={board}
          slot={selected}
          mode="tree"
          onClose={() => setSelected(null)}
          onUpdated={applyNode}
          onHabitChanged={() => { if (resolvedGoalId) goalsApi.mandala(resolvedGoalId).then(setTree).catch(() => {}); }}
          onPromoted={(goal) => {
            toast.success(`「${goal.title}」을(를) 이번 학기 목표로 올렸어요.`);
            // 승격한 축은 계획 인터뷰(S02)로 이어져야 실제 실행 계획이 된다.
            // 강제로 끌고 가지 않고, 사용자가 목표 화면에서 이어가도록 둔다.
            setInterviewReturnTo('mandala');
            if (resolvedGoalId) {
              goalsApi.mandala(resolvedGoalId).then(setTree).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const items: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'block', label: '3×3', icon: <SquaresFour size={12} weight="fill" /> },
    { id: 'full', label: '전체', icon: <GridFour size={12} weight="fill" /> },
    { id: 'list', label: '목록', icon: <ListBullets size={12} weight="bold" /> },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 9999, background: 'var(--sand-100)', border: '1px solid var(--sand-200)' }}>
      {items.map((it) => {
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            aria-pressed={active}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 9999,
              border: 'none',
              background: active ? 'var(--surface-raised)' : 'transparent',
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
