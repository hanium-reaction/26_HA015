import React, { useState, useEffect } from 'react';
import { Clock, Lightbulb } from '@phosphor-icons/react';
import { DAYS_KO, DEFAULT_GOAL_CATEGORY, categoryLabel, goalColor } from '../data';
import { SetupProgress } from '../components/SetupProgress';
import { AiDraftCard } from '../components/AiDraftCard';
import { DemoNotice } from '../components/DemoNotice';
import { BlockEditSheet } from '../components/BlockEditSheet';
import { ApiError, plansApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { useNavigation } from '../contexts/NavigationContext';
import type { Block } from '../types';
import type { FirstPlanGenerateRequest, ScheduledBlockPreview, WeeklyPlanResponse } from '../types/api';

// 이미 저장된 이번 주 계획(GET /plans/weekly) → 화면 Block. 온보딩 4/4 에서 새 draft
// 뒤에 흐리게 겹쳐 보여줘 "기존 계획이 사라진 것처럼" 보이는 오해를 없앤다(#103).
function weeklyToBlocks(res: WeeklyPlanResponse): Block[] {
  const out: Block[] = [];
  for (const day of res.days ?? []) {
    for (const b of day.blocks ?? []) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      out.push({
        id: `existing-${b.blockId}`,
        day: (s.getDay() + 6) % 7,
        time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
        dur: Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000)),
        title: b.title,
        goal: b.category,
        fixed: b.source === 'fixed',
      });
    }
  }
  return out;
}

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

// 생성 로딩 화면용 — 백엔드 First-Plan 파이프라인(decompose→schedule→review)에 맞춘
// 단계 문구와, 기다리는 동안 보여줄 앱 철학 팁. 실제 진행률 이벤트는 없으므로 단계는
// 타이머로 진행하되 마지막 단계에서 멈춰 "완료"를 거짓 표시하지 않는다.
const GEN_STAGES = [
  '목표를 잘게 나누고 있어요',
  '비어 있는 시간을 찾고 있어요',
  '우선순위대로 배치하고 있어요',
  '계획을 한 번 더 다듬고 있어요',
];
const GEN_TIPS = [
  '계획이 틀어져도 괜찮아요. 다시 시작할 방법을 늘 함께 찾아요.',
  '집중 목표엔 좋은 시간대를 먼저 잡아둬요.',
  '막힐 땐 “딱 5분”부터. 시작이 가장 어렵거든요.',
  '유지 목표는 서로 겹치지 않게, 보류는 일정에서 빼둬요.',
  '완벽한 하루보다, 다시 돌아오는 하루가 더 강해요.',
];

// 주간 계획 생성(1~8s, +재시도) 동안의 로딩 화면. 단계 표시 + indeterminate 바 + 회전 팁.
function PlanGeneratingView() {
  const [stage, setStage] = useState(0);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    // 단계는 2초마다 한 칸, 마지막에서 멈춤(가짜 완료 방지). 팁은 계속 회전.
    const s = setInterval(() => setStage((i) => Math.min(i + 1, GEN_STAGES.length - 1)), 2000);
    const t = setInterval(() => setTip((i) => (i + 1) % GEN_TIPS.length), 3800);
    return () => { clearInterval(s); clearInterval(t); };
  }, []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', background: 'var(--surface-ground)', gap: 14, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 9999, background: 'var(--coral-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '3px solid var(--coral-200)', borderTopColor: 'var(--brand)', borderRadius: 9999, animation: 'spin 1s linear infinite' }} />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>주간 계획 생성 중…</div>

      {/* 현재 단계 (N/총) — 실제 파이프라인 순서에 맞춘 문구 */}
      <div aria-live="polite" style={{ minHeight: 20, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className="tnum" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', letterSpacing: '0.06em' }}>{stage + 1}/{GEN_STAGES.length}</span>
        <span key={stage} style={{ fontSize: 13, color: 'var(--text-2)', animation: 'toastIn 350ms ease-out' }}>{GEN_STAGES[stage]}</span>
      </div>

      {/* Indeterminate 진행바 — 가짜 %를 채우지 않고 계속 흐른다 */}
      <div className="rx-indeterminate-track" style={{ width: '100%', maxWidth: 280, height: 4, background: 'var(--sand-200)', borderRadius: 9999 }}>
        <div className="rx-indeterminate-bar" />
      </div>

      {/* 기다리는 동안 팁 — 앱 철학. 3.8초마다 페이드 전환 */}
      <div style={{ marginTop: 10, width: '100%', maxWidth: 300, minHeight: 66, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left' }}>
        <div style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Lightbulb size={14} weight="fill" color="var(--brand)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 3 }}>알아두면 좋아요</div>
          <p key={tip} style={{ margin: 0, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, animation: 'toastIn 400ms ease-out' }}>{GEN_TIPS[tip]}</p>
        </div>
      </div>
    </div>
  );
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
  // 응답의 aiSource — 'rule' 이면 AiDraftCard 가 "오프라인 모드(룰 기반)" 안내를 띄운다(#12).
  const [planAiSource, setPlanAiSource] = useState<'llm' | 'rule'>('llm');
  // 응답의 warnings[] — 스케줄러가 남긴 경고(예: 슬롯 부족) 헤더 표시(#6).
  const [warnings, setWarnings] = useState<string[]>([]);
  const planIdRef = React.useRef<string | null>(null);
  // 생성이 이미 진행 중인지 — 자기 자신 중복 발사(effect 재실행/재생성 버튼)로 백엔드
  // planning advisory lock 에 겹쳐 409 AGENT_CONCURRENT_ACCESS 가 나는 걸 막는다.
  const inFlightRef = React.useRef(false);
  // 이미 저장된 이번 주 계획 — draft 뒤에 흐리게 겹쳐 표시(#103). 표시 전용이라
  // 집계(총h·tier)·승인("이대로 시작")에는 포함하지 않는다.
  const [existingBlocks, setExistingBlocks] = useState<Block[]>([]);
  useEffect(() => {
    let cancelled = false;
    const monday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return localDateStr(d);
    })();
    plansApi.weekly(monday).then(
      (res) => { if (!cancelled) setExistingBlocks(weeklyToBlocks(res)); },
      () => { /* 기존 계획 없거나 오류 — 미표시 */ },
    );
    return () => { cancelled = true; };
  }, []);

  // 온보딩 인터뷰(S02)의 sessionId 를 GoalIntakeScreen 이 NavigationContext 에 올려둔다.
  // sessionId 는 메모리 보관이라 새로고침/재진입 시 사라질 수 있는데(#91), 백엔드
  // POST /plans/generate 가 빈 본문이면 "최근 정상 종료 인터뷰"로 자동 복구하므로
  // (api-contract v1.16) 항상 호출한다 — sessionId 가 있으면 그 세션을 명시.
  // 완료된 인터뷰가 아예 없으면 422 → genFailed 배너로 정직하게 안내.
  const { interviewSessionId } = useNavigation();
  const generateInput: FirstPlanGenerateRequest = interviewSessionId
    ? { interviewSessionId }
    : {};

  // /plans/generate 실연동 — useCallback 으로 빼서 진입 시 + AiDraftCard 재생성에서 재사용.
  const generatePlan = React.useCallback(() => {
    if (inFlightRef.current) return; // 이미 생성 중이면 무시 (중복 발사 방지)
    inFlightRef.current = true;
    setGenerating(true);
    setGenFailed(false);
    const minDelay = new Promise<void>((r) => setTimeout(r, 1400));
    // Idempotency-Key — 이 한 번의 생성(3회 재시도 포함)에 같은 키를 써서, 409 재시도 시
    // 백엔드가 LLM 을 다시 돌리지 않고 같은 planId 를 돌려주게 한다(#6). 재생성 버튼은
    // 새 generatePlan 호출이라 새 키가 생겨 새 plan 이 나온다.
    const key = crypto.randomUUID();

    // 409 AGENT_CONCURRENT_ACCESS: 같은 유저의 다른 /plans/generate 가 아직 LLM 실행 중이라
    // planning advisory lock(5s 대기 후 409)을 못 잡은 경우 — 하드 실패로 보지 말고 짧게
    // 기다렸다 재시도한다(앞 생성이 끝나면 lock 이 풀림). 그 외 오류·재시도 소진 시 genFailed.
    const attempt = async (): Promise<void> => {
      for (let i = 0; i < 3; i++) {
        try {
          const plan = await plansApi.generate(generateInput, key);
          planIdRef.current = plan.planId;
          // 200 응답 = 연동 성공. 블록이 0개여도 '예시'가 아니라 '아직 계획 없음'인
          // 실데이터다 — 더미로 가리지 않고 그대로 반영한다.
          setBlocks((plan.blocks ?? []).map(previewToBlock));
          setPlanAiSource(plan.aiSource === 'rule' ? 'rule' : 'llm');
          setWarnings(plan.warnings ?? []);
          setUsingRealPlan(true);
          return;
        } catch (err) {
          const concurrent = err instanceof ApiError && err.status === 409;
          if (concurrent && i < 2) {
            await new Promise((r) => setTimeout(r, 3500));
            continue;
          }
          setGenFailed(true); // 네트워크/422(완료 인터뷰 없음)/재시도 소진 — 빈 상태 + 정직 배너
          return;
        }
      }
    };

    Promise.all([minDelay, attempt()]).finally(() => {
      inFlightRef.current = false;
      setGenerating(false);
    });
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

  // 그리드가 0시(자정)부터라 그냥 두면 새벽 빈 칸부터 보인다 — 생성이 끝나면
  // 가장 이른 블록(없으면 오전 8시) 근처로 스크롤을 맞춘다.
  const gridRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (generating) return;
    const el = gridRef.current;
    if (!el) return;
    // draft + 기존 계획 통틀어 가장 이른 블록 기준(없으면 오전 8시).
    const all = [...blocks, ...existingBlocks];
    const earliest = all.length ? Math.min(...all.map((b) => parseMin(b.time))) : 8 * 60;
    el.scrollTop = Math.max(0, toY(Math.max(earliest, 6 * 60)) - 8);
  }, [generating, blocks.length, existingBlocks.length]);

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

  if (generating) return <PlanGeneratingView />;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', position: 'relative' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 18px 12px', borderBottom: '1px solid var(--sand-200)' }}>
        <SetupProgress current={4} total={4} label="계획" />
        {/* 헤더 'AI 생성 완료' 뱃지는 AiDraftCard 가 푸터에서 동일 정보 (LLM 아이콘 + 점선 +
            '수락/수정/재생성' 라벨) 를 표시하므로 중복 제거. §1.4 잠금 결정의 시각 통일. */}
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 6px' }}>이번 주 계획이에요</h2>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>블록을 탭하면 수정할 수 있어요.</p>
        {/* 기존 계획이 있으면 범례로 구분 — 흐린 점선=기존, 진한=이번에 추가(#103). */}
        {existingBlocks.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11, color: 'var(--text-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 10, borderRadius: 3, border: '1.5px dashed var(--sand-300)', background: 'var(--sand-100)', opacity: 0.5 }} /> 기존 계획
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 12, height: 10, borderRadius: 3, border: '1.5px solid var(--coral-200)', background: 'var(--brand-soft)' }} /> 이번에 추가
            </span>
          </div>
        )}
        {!usingRealPlan && genFailed && (
          <DemoNotice storageKey="weekly-plan-gen">
            AI 계획을 생성하지 못했어요 — 완료된 인터뷰가 없거나 서버 오류예요. 아래 "블록
            추가"로 직접 채우거나, 목표 파악(인터뷰)을 먼저 진행해 주세요.
          </DemoNotice>
        )}
        {usingRealPlan && blocks.length === 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            아직 계획 블록이 없어요. 아래 "블록 추가"로 채워보세요.
          </div>
        )}
        {/* 스케줄러 경고(warnings[]) — 슬롯 부족 등 (#6) */}
        {warnings.length > 0 && (
          <div style={{ padding: '8px 12px', borderRadius: 12, background: '#FBEEDA', border: '1px solid #F2D29A', fontSize: 11, color: 'var(--warning)', lineHeight: 1.5 }}>
            {warnings.map((w, i) => (
              <div key={i}>· {w}</div>
            ))}
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
      <div ref={gridRef} style={{ flex: 1, overflowY: 'auto' }}>
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
            {/* 기존 계획 — 흐리게·점선·클릭 불가로 draft 뒤에 깔아둔다(#103). */}
            {existingBlocks.map((b) => {
              const tMin = parseMin(b.time);
              const y = toY(tMin);
              if (y < 0) return null;
              const bh = Math.max((b.dur * HOUR_PX / 60) - 2, 20);
              const c = b.fixed ? { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' } : goalColor(b.goal);
              return (
                <div key={b.id} aria-hidden style={{ position: 'absolute', left: b.day * COL_W + 2, top: y + 1, width: COL_W - 4, height: bh, background: c.bg, border: `1.5px dashed ${c.bd}`, borderRadius: 6, padding: '3px 4px', overflow: 'hidden', opacity: 0.38, pointerEvents: 'none' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: c.fg, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: bh > 32 ? 'normal' : 'nowrap' }}>{b.title}</div>
                </div>
              );
            })}
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
          aiSource={planAiSource}
          onAccept={handleContinue}
          onEdit={addBlock}
          onReject={generatePlan}
          // 블록이 하나도 없으면 "이대로 시작"이 말이 안 되므로 막고, 아래 안내로 유도.
          acceptDisabled={blocks.length === 0}
          acceptLabel="이대로 시작"
          editLabel="블록 추가"
          rejectLabel="재생성"
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {blocks.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>블록을 추가하면 시작할 수 있어요.</span>
            )}
            {blocks.length > 0 && (
            <span className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 10px', background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={11} weight="fill" /> 총 {totalH.toFixed(1)}h
            </span>
            )}
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
