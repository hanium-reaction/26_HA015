import React, { useState, useEffect } from 'react';
import { Clock } from '@phosphor-icons/react';
import { DAYS_KO, DEFAULT_GOAL_CATEGORY, categoryLabel, goalColor } from '../data';
import { SetupProgress } from '../components/SetupProgress';
import { AiDraftCard } from '../components/AiDraftCard';
import { DemoNotice } from '../components/DemoNotice';
import { BlockEditSheet } from '../components/BlockEditSheet';
import { plansApi } from '../lib/api';
import { useNavigation } from '../contexts/NavigationContext';
import type { Block } from '../types';
import type { FirstPlanGenerateRequest, ScheduledBlockPreview } from '../types/api';

// 소요 시간 프리셋 — 온보딩(생성)과 메인 캘린더가 공유하는 블록 편집 시트에 넘긴다.
const DURATIONS = [30, 45, 60, 90, 120];

// 백엔드 ScheduledBlockPreview(start/end KST ISO) → 화면 Block(day/time/dur).
function previewToBlock(b: ScheduledBlockPreview, i: number): Block {
  const s = new Date(b.start);
  const e = new Date(b.end);
  const day = (s.getDay() + 6) % 7; // 월=0 .. 일=6
  const time = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
  const dur = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
  return {
    id: b.originId ?? `gen-${i}`,
    day,
    time,
    title: b.title,
    dur,
    // 카테고리 미지정이면 정식 값 'other' 로 정규화해 '기타' 로 합쳐지게 한다.
    goal: b.category || DEFAULT_GOAL_CATEGORY,
    fixed: b.origin === 'fixed',
    type: b.origin,
  };
}

interface WeeklyPlanGenerationScreenProps {
  onContinue: () => void;
}

export function WeeklyPlanGenerationScreen({ onContinue }: WeeklyPlanGenerationScreenProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editing, setEditing] = useState<Block | null>(null);
  const [generating, setGenerating] = useState(true);
  // 백엔드 실제 플랜이 들어왔는지 — true 면 더미가 아니라 진짜 데이터.
  const [usingRealPlan, setUsingRealPlan] = useState(false);
  // 라이브 호출을 실제로 시도했으나 실패했는지 — 배너 문구를 정직하게 맞추는 용도.
  const [genFailed, setGenFailed] = useState(false);
  const planIdRef = React.useRef<string | null>(null);

  // POST /plans/generate 는 outcome 또는 interviewSessionId 중 하나가 필수다(빈 본문 → 422).
  // 온보딩 인터뷰(S02)에서 만든 sessionId 를 GoalIntakeScreen 이 NavigationContext 에
  // 올려두므로(setInterviewSessionId), 이 화면이 진입할 땐 이미 채워져 있다.
  //   → sessionId 가 있으면 실연동 호출, 없으면(인터뷰 건너뜀) 예시 유지.
  const { interviewSessionId } = useNavigation();
  const generateInput: FirstPlanGenerateRequest | null = interviewSessionId
    ? { interviewSessionId }
    : null;

  // /plans/generate 실연동: 유효 입력이 있으면 호출해 실데이터로 더미를 교체.
  // useCallback 으로 빼서 진입 시 + AiDraftCard 재생성 버튼에서 재사용.
  const generatePlan = React.useCallback(() => {
    setGenerating(true);
    setGenFailed(false);
    const minDelay = new Promise<void>((r) => setTimeout(r, 1400));
    // 유효 입력이 없으면 422 가 보장된 호출을 보내지 않고 더미를 유지한다.
    const fetchPlan: Promise<void> = generateInput
      ? plansApi.generate(generateInput).then(
          (plan) => {
            planIdRef.current = plan.planId;
            // 200 응답 = 연동 성공. 블록이 0개여도 '예시'가 아니라 '아직 계획 없음'인
            // 실데이터다 — 더미로 가리지 않고 그대로 반영한다.
            setBlocks((plan.blocks ?? []).map(previewToBlock));
            setUsingRealPlan(true);
          },
          () => { setGenFailed(true); /* 네트워크/422 등 — 빈 상태 유지, 배너로 정직하게 알림 */ },
        )
      : Promise.resolve();
    Promise.all([minDelay, fetchPlan]).finally(() => setGenerating(false));
  }, [interviewSessionId]);

  // 자동 생성은 '유효 입력(interviewSessionId)'별로 딱 한 번만 호출한다.
  // StrictMode 이중 실행이나 interviewSessionId 지연 세팅(null→값)으로 /plans/generate 가
  // 두 번 나가던 중복 생성을 막는다. (AiDraftCard 재생성 버튼은 generatePlan 을 직접 호출)
  const autoGenKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    const key = interviewSessionId ?? 'none';
    if (autoGenKeyRef.current === key) return;
    autoGenKeyRef.current = key;
    generatePlan();
  }, [interviewSessionId, generatePlan]);

  // "이대로 시작" 클릭 시 plan approve 시도 (mock-and-replace)
  const handleContinue = () => {
    if (planIdRef.current) {
      plansApi.approve(planIdRef.current).catch(() => { /* 501 ok */ });
    }
    onContinue();
  };

  // 자정부터 자정까지 24시간 전체를 스크롤로 훑을 수 있어야 한다 — 실제 주간
  // 캘린더(WeeklyCalendarScreen)와 동일한 범위·치수를 써서 두 화면이 같은
  // 캘린더처럼 보이게 한다(#85 뒤 이어진 요청).
  const START_H = 0, END_H = 24;
  const HOUR_PX = 56;
  const COL_W = 50;
  const TIME_W = 30;
  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  // 이번 주 월요일부터 7일치 일자 숫자 — 주간 캘린더와 동일하게 요일 아래 날짜를 보여준다.
  const TODAY = (new Date().getDay() + 6) % 7;
  const dayNumbers = (() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - TODAY);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.getDate();
    });
  })();

  const goalCount: Record<string, number> = {};
  blocks.forEach((b) => { if (b.goal) goalCount[b.goal] = (goalCount[b.goal] || 0) + b.dur; });
  const totalH = Object.values(goalCount).reduce((a, b) => a + b, 0) / 60;

  const handleSave = (updated: Block) => { setBlocks((bs) => bs.map((b) => b.id === updated.id ? updated : b)); setEditing(null); };
  const handleDelete = (id: string) => { setBlocks((bs) => bs.filter((b) => b.id !== id)); setEditing(null); };
  const addBlock = () => {
    const id = 'new-' + Date.now();
    // 기본 목표는 지금 계획의 첫 카테고리, 없으면 정식 기본값 'other'(→ '기타').
    const defaultGoal = blocks.find((b) => b.goal)?.goal ?? DEFAULT_GOAL_CATEGORY;
    const newBlock: Block = { id, day: 0, time: '14:00', dur: 60, title: '새 블록', goal: defaultGoal };
    setBlocks((bs) => [...bs, newBlock]);
    setEditing(newBlock);
  };

  if (generating) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', background: 'var(--surface-ground)', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--coral-200)', borderTopColor: 'var(--brand)', borderRadius: 9999, animation: 'spin 1s linear infinite' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>주간 계획 생성 중…</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 240, lineHeight: 1.6, margin: 0 }}>목표·우선순위·고정 일정을 분석해 최적의 슬롯에 배치하고 있어요.</p>
        <div style={{ width: '100%', maxWidth: 280, height: 4, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--brand)', borderRadius: 9999, animation: 'load 1.3s ease-out forwards' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', position: 'relative' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 18px 12px', borderBottom: '1px solid var(--sand-200)' }}>
        <SetupProgress current={4} total={4} label="계획" />
        {/* 헤더 'AI 생성 완료' 뱃지는 AiDraftCard 가 푸터에서 동일 정보 (LLM 아이콘 + 점선 +
            '수락/수정/재생성' 라벨) 를 표시하므로 중복 제거. §1.4 잠금 결정의 시각 통일. */}
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 6px' }}>이번 주 계획이에요</h2>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>블록을 탭하면 수정할 수 있어요.</p>
        {!usingRealPlan && (
          <DemoNotice storageKey="weekly-plan-gen">
            {genFailed
              ? 'AI 계획을 서버에서 생성하지 못했어요. 아래 "블록 추가"로 직접 채워보세요.'
              : 'AI 자동 계획은 인터뷰 세션 정보가 연결돼야 생성돼요. 아래 "블록 추가"로 직접 채워보세요.'}
          </DemoNotice>
        )}
        {usingRealPlan && blocks.length === 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            아직 계획 블록이 없어요. 아래 "블록 추가"로 채워보세요.
          </div>
        )}
      </div>

      {/* Day headers — 주간 캘린더(WeeklyCalendarScreen)와 동일하게 요일 아래 날짜 숫자 +
          오늘 강조를 보여준다. */}
      <div style={{ flexShrink: 0, display: 'flex', borderBottom: '1px solid var(--sand-200)' }}>
        <div style={{ width: TIME_W, flexShrink: 0 }} />
        {DAYS_KO.map((d, i) => {
          const isToday = i === TODAY;
          return (
            <div key={d} style={{ width: COL_W, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', background: isToday ? 'rgba(226,109,78,0.04)' : 'transparent' }}>
              <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: isToday ? 'var(--brand)' : 'var(--text-3)', marginBottom: 3 }}>{d}</div>
              <div className="tnum" style={{ width: 22, height: 22, borderRadius: 9999, background: isToday ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: isToday ? '#FFFCF6' : 'var(--text-1)' }}>{dayNumbers[i]}</div>
            </div>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', minWidth: TIME_W + COL_W * 7 }}>
          <div style={{ width: TIME_W, flexShrink: 0, background: 'var(--surface-ground)' }}>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, display: 'flex', alignItems: 'flex-start', paddingTop: 4, justifyContent: 'flex-end', paddingRight: 4 }}>
                <span className="tnum" style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{h}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: COL_W * 7 }}>
            {hours.map((h, i) => (
              <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: i * HOUR_PX, height: 1, background: 'var(--sand-200)' }} />
            ))}
            {DAYS_KO.map((d, i) => (
              <div key={d} style={{ position: 'absolute', left: i * COL_W, top: 0, bottom: 0, width: 1, background: 'var(--sand-200)' }} />
            ))}
            {blocks.map((b) => {
              const tMin = parseMin(b.time);
              const y = toY(tMin);
              if (y < 0) return null;
              const bh = Math.max((b.dur * HOUR_PX / 60) - 2, 20);
              const c = b.fixed ? { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' } : goalColor(b.goal);
              return (
                <button key={b.id} onClick={() => setEditing(b)} style={{ position: 'absolute', left: b.day * COL_W + 2, top: y + 1, width: COL_W - 4, height: bh, background: c.bg, border: `1.5px solid ${c.bd}`, borderRadius: 6, padding: '3px 4px', cursor: 'pointer', overflow: 'hidden', textAlign: 'left', fontFamily: 'inherit', transition: 'box-shadow 120ms, transform 120ms' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: c.fg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: bh > 32 ? 'normal' : 'nowrap' }}>{b.title}</div>
                  {bh > 32 && <div className="tnum" style={{ fontSize: 7, color: c.fg, opacity: 0.7, marginTop: 1, fontFamily: 'var(--font-mono)' }}>{b.time}·{b.dur}분</div>}
                </button>
              );
            })}
            <div style={{ height: hours.length * HOUR_PX + HOUR_PX }} />
          </div>
        </div>
      </div>

      {/* AI Draft footer — Issue #12 §1.4 잠금 결정 시각화.
          onAccept 은 우리 handleContinue (plansApi.approve mock-and-replace 포함) 사용.
          onReject 는 generating=true 로 되돌려 useEffect 의 plansApi.generate 재호출. */}
      <div style={{ flexShrink: 0, padding: '10px 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))', background: 'var(--surface-ground)' }}>
        <AiDraftCard
          isDraft={true}
          aiSource="llm"
          onAccept={handleContinue}
          onEdit={addBlock}
          onReject={generatePlan}
          acceptLabel="이대로 시작"
          editLabel="블록 추가"
          rejectLabel="재생성"
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 10px', background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} weight="fill" /> 총 {totalH.toFixed(1)}h
            </span>
            {Object.entries(goalCount).map(([g, mins]) => {
              const c = goalColor(g);
              return (
                <span key={g} style={{ height: 'var(--ctrl-xs)', padding: '0 10px', background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 9999, background: c.fg }} />
                  {categoryLabel(g)} <span className="tnum">{(mins / 60).toFixed(1)}h</span>
                </span>
              );
            })}
          </div>
        </AiDraftCard>
      </div>

      {editing && (
        <BlockEditSheet
          block={editing}
          existingCategories={Array.from(new Set(blocks.map((b) => b.goal).filter((g): g is string => !!g)))}
          durations={DURATIONS}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
