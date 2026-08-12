import React, { useState, useEffect, useRef } from 'react';
import { Clock, Lightbulb } from '@phosphor-icons/react';
import { DEFAULT_GOAL_CATEGORY, categoryLabel, goalColor } from '../data';
import { SetupProgress } from '../components/SetupProgress';
import { AiDraftCard } from '../components/AiDraftCard';
import { DemoNotice } from '../components/DemoNotice';
import { BlockEditSheet } from '../components/BlockEditSheet';
import { WeekGrid, type WeekGridBlock } from '../components/WeekGrid';
import { ApiError, plansApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { useNavigation } from '../contexts/NavigationContext';
import type { Block } from '../types';
import type { FirstPlanGenerateRequest, PlanDensity, ScheduledBlockPreview, WeeklyPlanResponse } from '../types/api';

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
        dateStr: localDateStr(s),
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
    dateStr: localDateStr(s),
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
  // 표시 중인 주(오늘이 속한 주=0, 다음 주=+1 …). 다중 주 계획을 주 단위로 슬라이스해 본다(#119).
  const [genWeekOffset, setGenWeekOffset] = useState(0);
  // 드래그 이동 — 온보딩 draft 도 메인 캘린더처럼 블록을 끌어 옮길 수 있게(로컬 전용).
  const [dragGhost, setDragGhost] = useState<{ id: string; day: number; minute: number } | null>(null);
  const dragMovedRef = React.useRef(false);
  // 백엔드 실제 플랜이 들어왔는지 — true 면 더미가 아니라 진짜 데이터.
  const [usingRealPlan, setUsingRealPlan] = useState(false);
  // 라이브 호출을 실제로 시도했으나 실패했는지 — 배너 문구를 정직하게 맞추는 용도.
  const [genFailed, setGenFailed] = useState(false);
  // 계획 분량(밀도) — 재생성 시 body.density 로 전달. ref 로 최신값을 읽어 generatePlan
  // 콜백의 deps 를 바꾸지 않는다(density 변경만으로 자동 재생성되지 않게).
  const [density, setDensity] = useState<PlanDensity>('standard');
  const densityRef = React.useRef(density);
  densityRef.current = density;
  // 응답의 aiSource — 'rule' 이면 AiDraftCard 가 "오프라인 모드(룰 기반)" 안내를 띄운다(#12).
  const [planAiSource, setPlanAiSource] = useState<'llm' | 'rule'>('llm');
  // 응답의 warnings[] — 스케줄러가 남긴 경고(예: 슬롯 부족) 헤더 표시(#6).
  const [warnings, setWarnings] = useState<string[]>([]);
  // 분해가 '자료를 참조했는데 원문이 없음'을 flag 하면(#materials) 자료를 붙여넣도록 되묻는다.
  const [materialsMissing, setMaterialsMissing] = useState(false);
  const planIdRef = React.useRef<string | null>(null);
  // 생성이 이미 진행 중인지 — 자기 자신 중복 발사(effect 재실행/재생성 버튼)로 백엔드
  // planning advisory lock 에 겹쳐 409 AGENT_CONCURRENT_ACCESS 가 나는 걸 막는다.
  const inFlightRef = React.useRef(false);
  // 이미 저장된 이번 주 계획 — draft 뒤에 흐리게 겹쳐 표시(#103). 표시 전용이라
  // 집계(총h·tier)·승인("이대로 시작")에는 포함하지 않는다.
  const [existingBlocks, setExistingBlocks] = useState<Block[]>([]);
  useEffect(() => {
    let cancelled = false;
    // 표시 중인 주(genWeekOffset)의 저장된 계획을 조회 — 주 이동 시에도 기존 계획 겹침이 맞게.
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + genWeekOffset * 7);
    plansApi.weekly(localDateStr(d)).then(
      (res) => { if (!cancelled) setExistingBlocks(weeklyToBlocks(res)); },
      () => { if (!cancelled) setExistingBlocks([]); /* 기존 계획 없거나 오류 — 미표시 */ },
    );
    return () => { cancelled = true; };
  }, [genWeekOffset]);

  // 온보딩 인터뷰(S02)의 sessionId 를 GoalIntakeScreen 이 NavigationContext 에 올려둔다.
  // sessionId 는 메모리 보관이라 새로고침/재진입 시 사라질 수 있는데(#91), 백엔드
  // POST /plans/generate 가 빈 본문이면 "최근 정상 종료 인터뷰"로 자동 복구하므로
  // (api-contract v1.16) 항상 호출한다 — sessionId 가 있으면 그 세션을 명시.
  // 완료된 인터뷰가 아예 없으면 422 → genFailed 배너로 정직하게 안내.
  const { interviewSessionId, setScreen, plannedMilestones } = useNavigation();
  // 확정 마일스톤을 ref 로 잡아 generatePlan 콜백 deps 를 흔들지 않는다(#milestones Stage B).
  const milestonesRef = React.useRef(plannedMilestones);
  milestonesRef.current = plannedMilestones;
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
          const plan = await plansApi.generate(
            { ...generateInput, density: densityRef.current, milestones: milestonesRef.current ?? undefined },
            key,
          );
          planIdRef.current = plan.planId;
          // 200 응답 = 연동 성공. 블록이 0개여도 '예시'가 아니라 '아직 계획 없음'인
          // 실데이터다 — 더미로 가리지 않고 그대로 반영한다.
          setBlocks((plan.blocks ?? []).map(previewToBlock));
          setPlanAiSource(plan.aiSource === 'rule' ? 'rule' : 'llm');
          setWarnings(plan.warnings ?? []);
          setMaterialsMissing(
            (plan.policyViolations ?? []).some((v) => v.reason === 'materials_referenced_but_missing'),
          );
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

  // "이대로 시작" 클릭 시 plan approve. 더블클릭/재진입 반복 승인을 막고(#115),
  // 같은 planId 엔 같은 Idempotency-Key 를 써서 서버가 1회로 처리하게 한다.
  const approvingRef = React.useRef(false);
  const [approving, setApproving] = useState(false);
  const handleContinue = () => {
    if (approvingRef.current) return; // 승인 진행 중 중복 클릭 무시
    if (!planIdRef.current) { onContinue(); return; }
    approvingRef.current = true;
    setApproving(true);
    plansApi
      .approve(planIdRef.current, `approve-${planIdRef.current}`)
      .catch(() => { /* 501/오류 ok — 온보딩 흐름은 이어간다 */ })
      .finally(() => { onContinue(); });
  };

  // "다시 인터뷰하기" — 이 계획을 버리고 처음부터 다시 답한다.
  // 예전엔 이 경로가 없어 사용자가 **새로고침으로 화면을 끊었고**, 그러면 초안이 만료(3일)
  // 까지 승인 대기로 남고 인터뷰가 만든 잠정 목표도 그대로 쌓였다. 명시적으로 버리면
  // 초안은 그 자리에서 종착 상태가 되고, 새 인터뷰가 이전 잠정 목표를 대체한다.
  const [discarding, setDiscarding] = useState(false);
  const handleRestartInterview = () => {
    if (discarding || approvingRef.current) return;
    setDiscarding(true);
    const planId = planIdRef.current;
    // 폐기 실패해도(네트워크 등) 재인터뷰는 막지 않는다 — 초안은 어차피 만료되고,
    // 사용자를 화면에 가둬 두는 게 더 나쁘다.
    const done = () => setScreen('goal-intake');
    if (!planId) { done(); return; }
    plansApi.discard(planId).catch(() => {}).finally(done);
  };

  // 자정부터 자정까지 24시간 전체를 스크롤로 훑을 수 있어야 한다 — 실제 주간
  // 캘린더(WeeklyCalendarScreen)와 동일한 범위·치수를 써서 두 화면이 같은
  // 캘린더처럼 보이게 한다(#85 뒤 이어진 요청).
  const START_H = 0, END_H = 24;
  const SNAP_MIN = 15; // 15분 snap (메인 캘린더와 동일)

  // 메인 캘린더(S14)와 같은 밀도 규칙. 7열을 폰 폭에 넣으면 열이 51px 이라
  // "캡스톤 발표 / 자료" 처럼 제목이 깨진다. 기본 3일로 열을 넓게 쓰고,
  // 한 주 전체를 확인해야 할 때(승인 판단) 7일로 토글한다.
  const [dayView, setDayView] = useState<3 | 7>(3);
  const TIME_W = dayView === 3 ? 34 : 30;
  const HOUR_PX = dayView === 3 ? 64 : 56;

  // 열 폭을 고정하면 폰 밖(태블릿·데스크탑·가로모드)에서 격자가 왼쪽에 몰리고
  // 오른쪽이 텅 빈다. 실제 컨테이너 폭에서 계산한다(메인 캘린더와 같은 규칙).
  // 드래그도 이 값으로 픽셀 → 요일을 환산하므로 렌더와 같은 값이어야 한다.
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootW, setRootW] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setRootW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setRootW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // COL_W 는 visibleCols 가 정해진 뒤 계산한다(아래).
  const parseMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toY = (m: number) => (m - START_H * 60) * HOUR_PX / 60;

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

  // 표시 중인 주의 월요일(genWeekOffset 반영) — 다중 주 계획을 주 단위로 슬라이스(#119).
  const _now = new Date();
  const _todayIdx = (_now.getDay() + 6) % 7;
  const displayedMonday = new Date(_now);
  displayedMonday.setHours(0, 0, 0, 0);
  displayedMonday.setDate(_now.getDate() - _todayIdx + genWeekOffset * 7);
  const displayedMondayStr = localDateStr(displayedMonday);
  // 오늘이 표시 주에 있으면 그 요일 인덱스, 아니면 -1(강조 없음).
  const TODAY = genWeekOffset === 0 ? _todayIdx : -1;
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(displayedMonday);
    d.setDate(displayedMonday.getDate() + i);
    return d;
  });
  const dayNumbers = weekDates.map((d) => d.getDate());
  // 블록의 실제 날짜(dateStr) → 표시 주 컬럼(0..6). 다른 주면 -1(숨김). dateStr 없으면 day 폴백.
  const colOf = (b: Block): number => {
    if (!b.dateStr) return b.day >= 0 && b.day <= 6 ? b.day : -1;
    const idx = Math.round(
      (new Date(b.dateStr + 'T00:00:00').getTime() - displayedMonday.getTime()) / 86400000,
    );
    return idx >= 0 && idx <= 6 ? idx : -1;
  };
  // 표시 주에 속하는 블록만 컬럼과 함께. 편집 시트가 요일(day)로 동작하므로 day=col 로 맞춘다.
  // 3일 뷰에서 보여줄 칸 — 블록이 처음 등장하는 요일부터 3일(없으면 오늘, 그것도 없으면 월요일).
  // 계획을 열었을 때 빈 칸부터 보이지 않게 한다.
  const visibleCols = (() => {
    if (dayView === 7) return [0, 1, 2, 3, 4, 5, 6];
    const cols = blocks.map(colOf).filter((c) => c >= 0);
    const first = cols.length ? Math.min(...cols) : (TODAY >= 0 ? TODAY : 0);
    const anchorCol = Math.min(first, 4);
    return [anchorCol, anchorCol + 1, anchorCol + 2];
  })();

  // 남는 폭을 열이 나눠 갖는다. 하한 아래로는 찌그러뜨리지 않고 가로 스크롤을 준다.
  const COL_W = rootW > 0
    ? Math.max(dayView === 3 ? 96 : 44, Math.floor((rootW - TIME_W) / visibleCols.length))
    : (dayView === 3 ? 108 : 50);

  // 가로 드래그 → 새 요일. 보이는 칸 안에서만 움직인다(화면에 없는 요일로 놓으면 사라져 보임).
  const dayFromDx = (fromCol: number, dx: number): number => {
    const i = visibleCols.indexOf(fromCol);
    if (i < 0) return fromCol;
    const to = Math.max(0, Math.min(visibleCols.length - 1, i + Math.round(dx / COL_W)));
    return visibleCols[to];
  };

  const weekBlocks = blocks.map((b) => ({ b, col: colOf(b) })).filter((x) => x.col >= 0);
  const weekExisting = existingBlocks.map((b) => ({ b, col: colOf(b) })).filter((x) => x.col >= 0);

  // 화면 Block → WeekGrid 가 받는 모양. backdrop(기존 계획)은 muted 로 넘겨 뒤에 흐리게 깔린다.
  const toGridBlock = (b: Block, col: number, muted = false): WeekGridBlock => {
    const dragging = dragGhost?.id === b.id;
    return {
      id: b.id,
      col: dragging ? dragGhost!.day : col,
      startMin: dragging ? dragGhost!.minute : parseMin(b.time),
      durMin: b.dur,
      title: b.title,
      subLabel: `${b.time}·${b.dur}분`,
      colors: b.fixed ? { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' } : goalColor(b.goal),
      muted,
      dragging,
      fixed: b.fixed,
    };
  };
  // 계획 전체의 주 범위(이번 주 월요일 기준 offset) — 이전/다음 주 버튼 활성 판단.
  const thisMonday = new Date(_now);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(_now.getDate() - _todayIdx);
  const weekOffsetsWithBlocks = blocks
    .map((b) => (b.dateStr ? Math.floor((new Date(b.dateStr + 'T00:00:00').getTime() - thisMonday.getTime()) / (86400000 * 7)) : null))
    .filter((n): n is number => n !== null);
  const minWeek = weekOffsetsWithBlocks.length ? Math.min(0, ...weekOffsetsWithBlocks) : 0;
  const maxWeek = weekOffsetsWithBlocks.length ? Math.max(0, ...weekOffsetsWithBlocks) : 0;

  const goalCount: Record<string, number> = {};
  blocks.forEach((b) => { if (b.goal) goalCount[b.goal] = (goalCount[b.goal] || 0) + b.dur; });
  const totalH = Object.values(goalCount).reduce((a, b) => a + b, 0) / 60;

  const handleSave = (updated: Block) => {
    // 편집 시트의 요일(day)을 표시 주의 실제 날짜로 환산해 dateStr 유지(#119).
    const d = new Date(displayedMonday);
    d.setDate(displayedMonday.getDate() + updated.day);
    const dateStr = localDateStr(d);
    setBlocks((bs) => bs.map((b) => b.id === updated.id ? { ...updated, dateStr } : b));
    setEditing(null);
  };
  const handleDelete = (id: string) => { setBlocks((bs) => bs.filter((b) => b.id !== id)); setEditing(null); };
  const addBlock = () => {
    const id = 'new-' + Date.now();
    // 기본 목표는 지금 계획의 첫 카테고리, 없으면 정식 기본값 'other'(→ '기타').
    const defaultGoal = blocks.find((b) => b.goal)?.goal ?? DEFAULT_GOAL_CATEGORY;
    // 표시 중인 주의 월요일에 새 블록 배치.
    const newBlock: Block = { id, day: 0, dateStr: displayedMondayStr, time: '14:00', dur: 60, title: '새 블록', goal: defaultGoal };
    setBlocks((bs) => [...bs, newBlock]);
    setEditing(newBlock);
  };

  // 블록 드래그 이동 — 메인 캘린더(S14)와 동일 조작을 온보딩 draft 에 이식.
  // draft 라 API 는 없고 로컬 state 만 갱신(승인 전이므로). 안 움직이면 탭=편집.
  const handleBlockPointerDown = (e: React.PointerEvent, block: Block, col: number) => {
    if (block.fixed) return; // 고정 블록은 이동 불가.
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startMinute = parseMin(block.time);
    dragMovedRef.current = false;
    const targetEl = e.currentTarget as HTMLElement;
    targetEl.setPointerCapture(e.pointerId);
    const calc = (ev: PointerEvent) => {
      const minDelta = Math.round(((ev.clientY - startY) / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN;
      const newDay = dayFromDx(col, ev.clientX - startX);
      const newMinute = Math.max(0, Math.min(24 * 60 - block.dur, startMinute + minDelta));
      return { newDay, newMinute };
    };
    const onMove = (ev: PointerEvent) => {
      if (!dragMovedRef.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) dragMovedRef.current = true;
      if (!dragMovedRef.current) return;
      const { newDay, newMinute } = calc(ev);
      setDragGhost({ id: block.id, day: newDay, minute: newMinute });
    };
    const onUp = (ev: PointerEvent) => {
      targetEl.removeEventListener('pointermove', onMove);
      targetEl.removeEventListener('pointerup', onUp);
      targetEl.removeEventListener('pointercancel', onUp);
      if (!dragMovedRef.current) { setEditing({ ...block, day: col }); setDragGhost(null); return; } // 탭=편집
      const { newDay, newMinute } = calc(ev);
      setDragGhost(null);
      if (newDay === col && newMinute === startMinute) return; // 제자리 = no-op
      // 표시 주의 newDay 컬럼 날짜로 dateStr, 시간은 newMinute → 로컬 draft 갱신.
      const d = new Date(displayedMonday);
      d.setDate(displayedMonday.getDate() + newDay);
      const time = `${String(Math.floor(newMinute / 60)).padStart(2, '0')}:${String(newMinute % 60).padStart(2, '0')}`;
      setBlocks((bs) => bs.map((x) => x.id === block.id ? { ...x, day: newDay, time, dateStr: localDateStr(d) } : x));
    };
    targetEl.addEventListener('pointermove', onMove);
    targetEl.addEventListener('pointerup', onUp);
    targetEl.addEventListener('pointercancel', onUp);
  };

  if (generating) return <PlanGeneratingView />;

  return (
    <div ref={rootRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)', position: 'relative' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 18px 12px', borderBottom: '1px solid var(--sand-200)' }}>
        <SetupProgress current={4} total={4} label="계획" />
        {/* 헤더 'AI 생성 완료' 뱃지는 AiDraftCard 가 푸터에서 동일 정보 (LLM 아이콘 + 점선 +
            '수락/수정/재생성' 라벨) 를 표시하므로 중복 제거. §1.4 잠금 결정의 시각 통일. */}
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: '0 0 6px' }}>계획이 만들어졌어요</h2>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>블록을 탭하면 수정, 끌면 15분 단위로 옮길 수 있어요.</p>
        {/* 3일 뷰에선 일부 요일이 가려지므로, 승인 판단에 필요한 '이번 주 몇 개'를 함께 둔다. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 9px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 10, fontWeight: 700, color: 'var(--brand-ink)', display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>
            이번 주 {weekBlocks.length}개
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'inline-flex', background: 'var(--sand-100)', borderRadius: 9999, padding: 2, gap: 2 }}>
            {([3, 7] as const).map((n) => {
              const on = dayView === n;
              return (
                <button
                  key={n}
                  onClick={() => setDayView(n)}
                  className="tnum"
                  style={{ height: 22, padding: '0 10px', borderRadius: 9999, border: 'none', background: on ? 'var(--surface-raised)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-3)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                >{n}일</button>
              );
            })}
          </div>
        </div>
        {/* 다중 주 계획 주 단위 이동(#119) — 계획이 여러 주에 걸치면 이전/다음 주로 넘겨 본다.
            화살표를 양끝으로 밀지 않고 날짜와 한 덩어리로 가운데 묶는다. 이 화면은 셸이
            그리는 뒤로가기('‹')가 왼쪽 위에 있어서, 왼쪽 끝에 같은 모양의 '‹' 를 또 두면
            뒤로가기가 두 개 겹쳐 보인다. */}
        {(maxWeek > minWeek) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => setGenWeekOffset((o) => Math.max(minWeek, o - 1))}
              disabled={genWeekOffset <= minWeek}
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: genWeekOffset <= minWeek ? 'var(--text-3)' : 'var(--text-1)', cursor: genWeekOffset <= minWeek ? 'default' : 'pointer', opacity: genWeekOffset <= minWeek ? 0.4 : 1, fontFamily: 'inherit', fontSize: 14 }}
              aria-label="이전 주"
            >‹</button>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
              <span className="tnum">{weekDates[0].getMonth() + 1}/{weekDates[0].getDate()}–{weekDates[6].getMonth() + 1}/{weekDates[6].getDate()}</span>
              <span style={{ color: 'var(--text-3)', fontWeight: 600, marginLeft: 6 }}>
                {genWeekOffset === 0 ? '이번 주' : genWeekOffset === 1 ? '다음 주' : genWeekOffset === -1 ? '지난 주' : `${genWeekOffset > 0 ? '+' : ''}${genWeekOffset}주`}
              </span>
            </div>
            <button
              onClick={() => setGenWeekOffset((o) => Math.min(maxWeek, o + 1))}
              disabled={genWeekOffset >= maxWeek}
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: genWeekOffset >= maxWeek ? 'var(--text-3)' : 'var(--text-1)', cursor: genWeekOffset >= maxWeek ? 'default' : 'pointer', opacity: genWeekOffset >= maxWeek ? 0.4 : 1, fontFamily: 'inherit', fontSize: 14 }}
              aria-label="다음 주"
            >›</button>
          </div>
        )}
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
        {/* 자료 미제공 되묻기(#materials) — 자료를 참조했는데 원문이 없어 계획이 추측으로 채워짐 */}
        {materialsMissing && (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--coral-700)' }}>참고 자료를 넣으면 계획이 훨씬 정확해져요</div>
            <div style={{ fontSize: 11.5, color: 'var(--coral-700)', lineHeight: 1.5 }}>
              자료를 참조하겠다고 하셨는데 실제 내용이 없어, 지금 계획은 일부 추측으로 채워졌어요.
              프로젝트 설명·강의계획서 같은 자료 원문을 인터뷰에서 붙여넣으면 그 내용대로 다시 세워드려요.
            </div>
            <button
              onClick={() => setScreen('goal-intake')}
              style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: 9, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              자료 붙여넣으러 가기
            </button>
          </div>
        )}
        {/* 스케줄러 경고(warnings[]) — 슬롯 부족 등 (#6) */}
        {warnings.length > 0 && (
          <div style={{ padding: '8px 12px', borderRadius: 12, background: '#FBEEDA', border: '1px solid #F2D29A', fontSize: 11, color: 'var(--warning-ink)', lineHeight: 1.5 }}>
            {warnings.map((w, i) => (
              <div key={i}>· {w}</div>
            ))}
          </div>
        )}
      </div>

      <WeekGrid
        scrollRef={gridRef}
        blocks={weekBlocks.map(({ b, col }) => toGridBlock(b, col))}
        backdrop={weekExisting.map(({ b, col }) => toGridBlock(b, col, true))}
        dayNumbers={dayNumbers}
        todayCol={TODAY >= 0 ? TODAY : null}
        startHour={START_H}
        endHour={END_H}
        hourPx={HOUR_PX}
        colWidth={COL_W}
        visibleCols={visibleCols}
        timeWidth={TIME_W}
        onBlockPointerDown={(e, gb) => {
          const hit = weekBlocks.find((x) => x.b.id === gb.id);
          if (hit) handleBlockPointerDown(e, hit.b, hit.col);
        }}
      />

      {/* AI Draft footer — Issue #12 §1.4 잠금 결정 시각화.
          onAccept 은 우리 handleContinue (plansApi.approve mock-and-replace 포함) 사용.
          onReject 는 generating=true 로 되돌려 useEffect 의 plansApi.generate 재호출. */}
      <div style={{ flexShrink: 0, padding: '10px 14px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))', background: 'var(--surface-ground)' }}>
        {/* 계획 분량(밀도) 선택 — '재생성' 시 body.density 로 전달돼 생성되는 카드 수를 좌우한다.
            선택만으로는 재생성하지 않는다(아래 재생성 버튼을 눌러야 반영). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>계획 분량</span>
          <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(0,0,0,0.05)', borderRadius: 9999, padding: 3 }}>
            {(
              [
                ['light', '가볍게'],
                ['standard', '표준'],
                ['intense', '촘촘히'],
              ] as [PlanDensity, string][]
            ).map(([val, label]) => {
              const active = density === val;
              return (
                <button
                  key={val}
                  onClick={() => setDensity(val)}
                  disabled={generating}
                  style={{
                    height: 'var(--ctrl-xs)',
                    padding: '0 12px',
                    borderRadius: 9999,
                    border: 'none',
                    cursor: generating ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 600,
                    background: active ? 'var(--text-1)' : 'transparent',
                    color: active ? '#FAF6EE' : 'var(--text-2)',
                    transition: 'background 120ms, color 120ms',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <AiDraftCard
          isDraft={true}
          aiSource={planAiSource}
          onAccept={handleContinue}
          onEdit={addBlock}
          onReject={generatePlan}
          // 블록이 하나도 없으면 "이대로 시작"이 말이 안 되므로 막고, 아래 안내로 유도.
          acceptDisabled={blocks.length === 0 || approving}
          acceptLabel={approving ? '시작하는 중…' : '이대로 시작'}
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
        {/* 계획을 확정하기 전 되돌아가는 길 — '재생성' 은 같은 답으로 다시 만드는 것이고,
            답 자체를 바꾸고 싶을 땐 인터뷰를 다시 해야 한다. 이 버튼이 없어서 사용자가
            새로고침으로 화면을 끊었고, 그러면 초안·잠정 목표가 그대로 남았다. */}
        <button
          onClick={handleRestartInterview}
          disabled={discarding || approving}
          style={{
            marginTop: 10,
            alignSelf: 'center',
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid var(--sand-200)',
            background: 'transparent',
            color: 'var(--text-2)',
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: discarding || approving ? 'default' : 'pointer',
            opacity: discarding || approving ? 0.5 : 1,
          }}
        >
          {discarding ? '정리하는 중…' : '답을 바꾸고 싶어요 · 다시 인터뷰하기'}
        </button>
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
