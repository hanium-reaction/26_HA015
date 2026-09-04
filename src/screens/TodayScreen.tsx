import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CaretRight,
  Check,
  X,
  Trash,
  Sparkle,
  BellRinging,
  Plus,
  Repeat,
} from '@phosphor-icons/react';
import type { Task, TaskStatus } from '../types';
import type { AgendaCard, AgendaFixedSchedule, ApiGoal, WeeklyBlock, WeeklyPlanResponse } from '../types/api';
import { GOAL_CATEGORY_OPTIONS } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import { friendlyError, goalsApi, habitsApi, plansApi, todayApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { dismissUncheckedBlocks, filterDismissedBlocks, findUncheckedBlocks } from '../lib/uncheckedBlocks';
import { categoryLabel, goalColor } from '../data';
import { DemoNotice } from '../components/DemoNotice';
import { FailureTagPicker, useFailureTagCatalog, type FailureTagOption } from '../components/FailureTagPicker';
import { HeroTaskCard } from '../components/HeroTaskCard';
import { TodayTimeline } from '../components/TodayTimeline';
import { ProgressSheet } from '../components/ProgressSheet';
import { EmptyState } from '../components/EmptyState';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { Toast } from '../components/Toast';
import { FixedScheduleStrip } from '../components/FixedScheduleStrip';
import { NextUpStrip } from '../components/NextUpStrip';
import { Gear, Target, DotsThreeVertical } from '@phosphor-icons/react';

// Today 헤더 우상단 — 목표 관리·설정을 하나의 ⋮ 메뉴로 통합 (아이콘 2개 → 1개).
function HeaderMenu({ onOpenBrief, hasBrief }: { onOpenBrief: () => void; hasBrief: boolean }) {
  const { setScreen } = useNavigation();
  const [open, setOpen] = useState(false);
  const go = (s: 'goals' | 'settings') => { setOpen(false); setScreen(s); };
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="메뉴"
        data-tour-help="오늘 브리프·목표 관리·설정으로 가는 메뉴예요."
        aria-expanded={open}
        style={{ width: 36, height: 36, borderRadius: 9999, border: 'none', background: open ? 'var(--sand-100)' : 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <DotsThreeVertical size={18} weight="bold" color="var(--text-2)" />
      </button>
      {open && (
        <>
          {/* 바깥 클릭 닫기 */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{ position: 'absolute', right: 0, top: 42, zIndex: 31, minWidth: 148, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', padding: 4 }}>
            {[
              ...(hasBrief ? [{ s: 'brief' as const, label: '오늘 브리프', Icon: Sparkle }] : []),
              { s: 'goals' as const, label: '목표 관리', Icon: Target },
              { s: 'settings' as const, label: '설정', Icon: Gear },
            ].map(({ s, label, Icon }) => (
              <button
                key={s}
                onClick={() => {
                  if (s === 'brief') { setOpen(false); onOpenBrief(); }
                  else go(s);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', textAlign: 'left' }}
              >
                <Icon size={16} color="var(--text-2)" /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface MergedTodayScreenProps {
  // 단일 진실 소스는 부모(ReActionMerged)의 tasks — openTask/markDone/markPartial/markFailed 가
  // 바로 이 목록을 대상으로 동작하므로, 이 화면은 로컬 사본을 만들지 않고 그대로 렌더한다.
  tasks: Task[];
  onOpen: (id: string) => void;
  onMarkDone: (id: string) => void;
  onPartial: (id: string, pct: number) => void;
  // reason 은 표시용 labelKo, tagCode 는 reflectionApi.tagExecution 저장용(#80).
  // reason 은 표시용 라벨, tagCodes 는 최대 2개 저장용, memo 는 선택 자유 텍스트(S18).
  // taskAversiveness — "이 일이 얼마나 하기 싫었나요?" 1~5 (#222). 실패로 기록될 때만 노출.
  // 백엔드 openapi 에 task_aversiveness 필드가 아직 없어 전송하지 않는다 — 연결 지점은
  // ReActionMerged.markFailed 안에 주석으로 남겨둠.
  onFail: (id: string, reason: string, tagCodes?: string[], memo?: string, taskAversiveness?: number) => void;
  onOpenRecovery: () => void;
  onEvening: () => void;
  // /today/agenda 실데이터 로드 성공 시 부모의 tasks 를 이 목록으로 교체한다.
  // (기존엔 이 화면이 자체 로컬 tasks 상태로만 반영해, 부모가 들고 있는 openTask 등이
  // 실제 카드 id 를 못 찾아 무반응이었다 — #66 대응)
  onAgendaLoaded: (tasks: Task[]) => void;
  // 블록 종료 +20분 미체크 개수(#224 T1) — 탭바 배지는 이 화면 밖(부모)에 있어서 올려보낸다.
  // dismiss 된 것은 이미 뺀 값이라, 부모는 그대로 "볼 게 있다/없다"로만 쓰면 된다.
  onUncheckedChange?: (count: number) => void;
}

// 화면용 Habit — 백엔드 Habit + 이번 주 HabitInstance 를 평탄화한 모양.
// instanceId 는 체크 API 호출 시 필요. instance 가 아직 없으면 null.
interface Habit {
  id: string;
  instanceId: string | null;
  name: string;
  targetDays: number;
  doneDays: number;
}

function thisMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return localDateStr(d);
}

// 백엔드 AgendaCard.status(string) → 화면 Task.status. 'pending' 은 'todo' 로,
// 나머지 6종은 그대로 매핑. 모르는 값은 안전하게 'todo'.
function actionStatusToTaskStatus(s: string): TaskStatus {
  switch (s) {
    case 'in_progress':
      return 'in_progress';
    case 'done':
    case 'over_done':
      return 'done';
    case 'partial_done':
    case 'failed':
    case 'recovery_pending':
      return s;
    case 'pending':
    default:
      return 'todo';
  }
}

// /today/agenda 의 AgendaCard → 화면 Task 베스트에포트 매핑.
// AgendaCard 에는 예약시각/이월/실패사유 필드가 없다 (estimatedMinutes·category 만 사용).
function actionToTask(a: AgendaCard): Task {
  return {
    id: a.actionId,
    title: a.title,
    status: actionStatusToTaskStatus(a.status),
    dur: a.estimatedMinutes ? `${a.estimatedMinutes}분` : undefined,
    goal: a.category || undefined,
    // 액션 상세(S11)용 — 예전엔 버렸던 whyNow/firstStep 를 살린다.
    whyNow: a.whyNow ?? undefined,
    firstStep: a.firstStep ?? undefined,
    priority: a.priority,
    cancellable: a.cancellable,
  };
}

// /today/agenda 가 비어 있어도 주간 계획에는 오늘 실행할 블록이 남아 있을 수 있다.
// 그 경우에만 WeeklyBlock 을 오늘 카드로 승격한다. actionId 를 그대로 써서 시작·체크인
// API 와 동일한 실행 대상을 가리키고, 주간 블록의 상태·시각·소요를 지어내지 않고 옮긴다.
function weeklyBlockToTask(b: WeeklyBlock, today: string): Task {
  const start = new Date(b.startAt);
  const end = new Date(b.endAt);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  const blockDate = localDateStr(start);
  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const clock = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const time = blockDate === today
    ? clock
    : blockDate === localDateStr(tomorrow)
      ? `내일 ${clock}`
      : `${start.getMonth() + 1}/${start.getDate()} ${clock}`;
  return {
    id: b.actionId,
    title: b.title,
    status: b.blockStatus === 'finished' ? 'done' : actionStatusToTaskStatus(b.blockStatus),
    time,
    scheduledAt: b.startAt,
    dur: `${durationMinutes}분`,
    goal: b.category || undefined,
    fixed: b.source === 'fixed',
  };
}

function weeklyFallbackTasks(plan: WeeklyPlanResponse, today: string): Task[] {
  const todayBlocks = (plan.days ?? []).find((day) => day.date === today)?.blocks ?? [];
  if (todayBlocks.length > 0) return todayBlocks.map((block) => weeklyBlockToTask(block, today));

  // 오늘 블록도 없으면 이번 주의 미완료 블록을 보여준다. 미래 일정을 먼저 시간순으로,
  // 이미 시각이 지난 미완료 일정은 그 뒤에 최근 것부터 둬서 다음 행동을 먼저 고르게 한다.
  const startOfToday = new Date(`${today}T00:00:00`).getTime();
  const terminal = new Set(['finished', 'done', 'failed', 'cancelled', 'canceled']);
  return (plan.days ?? [])
    .flatMap((day) => day.blocks ?? [])
    .filter((block) => !terminal.has(block.blockStatus.toLowerCase()))
    .sort((a, b) => {
      const aTime = new Date(a.startAt).getTime();
      const bTime = new Date(b.startAt).getTime();
      const aFuture = aTime >= startOfToday;
      const bFuture = bTime >= startOfToday;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      return aFuture ? aTime - bTime : bTime - aTime;
    })
    .map((block) => weeklyBlockToTask(block, today));
}

// 중요한 순서(priority 오름차순, 1이 최우선). 백엔드도 같은 순서로 주지만,
// 그 배열 순서에 말없이 기대면 중간에 정렬·필터가 하나 끼는 순간 조용히 틀어진다.
// 값이 없는 카드는 뒤로 — 있는 것보다 앞세울 근거가 없다.
const byPriority = (a: Task, b: Task) =>
  (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);

// /today/agenda 에는 예약 시각이 없다(AgendaCard 필드에 없음). 시각은 주간 계획의
// 블록에만 있으므로 actionId 로 조인해서 채운다 — 지어내지 않고 실제 계획값을 쓴다.
function todayBlockIndex(plan: WeeklyPlanResponse, todayStr: string) {
  const byAction = new Map<string, { time: string; durMin: number; startAt: string; goalId?: string | null }>();
  for (const day of plan.days ?? []) {
    if (day.date !== todayStr) continue;
    for (const b of day.blocks ?? []) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      byAction.set(b.actionId, {
        time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
        durMin: Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
        startAt: b.startAt,
        goalId: b.goalId,
      });
    }
  }
  return byAction;
}

// "5월 24일 · 일요일" — Today 헤더용
function todayShortKo(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${days[d.getDay()]}요일`;
}

// 미래 주간 일정의 시작까지 남은 시간. 초 단위 변화가 보이도록 별도 시계를 사용한다.
function startCountdownLabel(scheduledAt: string, now: Date): string {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(scheduledAt).getTime() - now.getTime()) / 1_000));
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (remainingSeconds === 0) return '곧 시작';
  if (days > 0) return `${days}일 ${hours}시간 ${minutes}분 ${seconds}초 후 시작`;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초 후 시작`;
  return `${minutes}분 ${seconds}초 후 시작`;
}

export function MergedTodayScreen({ tasks: allTasks, onOpen, onMarkDone, onPartial, onFail, onOpenRecovery, onEvening, onAgendaLoaded, onUncheckedChange }: MergedTodayScreenProps) {
  const { user } = useNavigation();
  const userName = user?.name ?? '친구';

  // 취소를 누른 카드는 서버 응답을 기다리지 않고 즉시 목록에서 뺀다. 되돌리면 돌아온다.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const tasks = allTasks.filter((t) => !hiddenIds.has(t.id));

  // agenda fetch 성공 = 백엔드 연결됨. 빈 응답이어도 true (연결 ≠ 데이터 존재).
  const [usingRealAgenda, setUsingRealAgenda] = useState(false);
  // 첫 agenda fetch 가 settle 되기 전엔 더미가 깜빡이지 않도록 스켈레톤만 노출.
  const [agendaLoading, setAgendaLoading] = useState(true);
  // 오늘 요일에 걸린 고정 일정(수업·알바). 카드가 아니라 하루의 테두리로 쓴다.
  const [fixedSchedules, setFixedSchedules] = useState<AgendaFixedSchedule[]>([]);
  // agenda.brief.headline — 매일 06시 크론이 만드는 모닝 브리프의 한 줄 요약.
  // 별도 모닝 브리프 페이지를 없애고 오늘 화면의 하루 1회 시트로 통합한다.
  const [briefHeadline, setBriefHeadline] = useState<string | null>(null);
  const [briefAdjustmentHints, setBriefAdjustmentHints] = useState<string[]>([]);
  const [briefBigRockId, setBriefBigRockId] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [usingWeeklyFallback, setUsingWeeklyFallback] = useState(false);
  // 오늘 블록의 예약 시각·소요와 원본 주간 계획. agenda 와 주간 계획을 함께 settle한 뒤
  // 빈 agenda fallback까지 한 번에 결정해, 빈 상태가 잠깐 보였다가 카드로 바뀌는 것을 막는다.
  const [blockInfo, setBlockInfo] = useState<Map<string, { time: string; durMin: number; startAt: string; goalId?: string | null }>>(new Map());
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanResponse | null>(null);

  // /today/agenda 와 이번 주 계획을 함께 읽는다. agenda 카드가 있으면 그것이 권위이고,
  // 비어 있을 때만 주간 계획의 오늘 블록을 fallback으로 사용한다. 따라서 같은 actionId가
  // 두 API에 모두 있어도 중복 렌더되지 않는다.
  useEffect(() => {
    let cancelled = false;
    const today = localDateStr(new Date());
    Promise.allSettled([todayApi.agenda(), plansApi.weekly(thisMonday())]).then(
      ([agendaResult, planResult]) => {
        if (cancelled) return;

        const plan = planResult.status === 'fulfilled' ? planResult.value : null;
        const todayBlocks = plan ? todayBlockIndex(plan, today) : new Map();
        setWeeklyPlan(plan);
        setBlockInfo(todayBlocks);

        if (agendaResult.status === 'rejected') return;
        const agenda = agendaResult.value;
        setUsingRealAgenda(true);
        setFixedSchedules(agenda.fixedSchedules ?? []);
        setBriefHeadline(agenda.brief?.headline ?? null);
        setBriefAdjustmentHints(agenda.brief?.adjustmentHints ?? []);
        setBriefBigRockId(agenda.brief?.bigRockActionId ?? null);
        const agendaTasks = (agenda.cards ?? [])
          .map(actionToTask)
          .map((task) => {
            const block = todayBlocks.get(task.id);
            return block ? { ...task, scheduledAt: block.startAt } : task;
          })
          .sort(byPriority);
        const fallbackTasks = agendaTasks.length === 0 && plan ? weeklyFallbackTasks(plan, today) : [];
        setUsingWeeklyFallback(agendaTasks.length === 0 && fallbackTasks.length > 0);
        onAgendaLoaded(agendaTasks.length > 0 ? agendaTasks : fallbackTasks);
      },
    ).finally(() => { if (!cancelled) setAgendaLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const hasMorningBrief = !!briefHeadline || briefAdjustmentHints.length > 0 || !!briefBigRockId;
  const briefSeenKey = `reaction.morningBriefSeen.${localDateStr(new Date())}`;

  // 별도 페이지 대신 오늘 화면 위에 하루 한 번만 띄운다. 온보딩 직후에는 브리프 생성이
  // 아직 안 됐더라도 준비 완료 안내를 보여주고, 이후 메뉴에서 언제든 다시 열 수 있다.
  useEffect(() => {
    if (agendaLoading || typeof window === 'undefined') return;
    const onboarded = sessionStorage.getItem('reaction.justOnboarded') === '1';
    if (onboarded) {
      sessionStorage.removeItem('reaction.justOnboarded');
      setJustOnboarded(true);
    }
    const seen = localStorage.getItem(briefSeenKey) === '1';
    if (onboarded || (hasMorningBrief && !seen)) setBriefOpen(true);
  }, [agendaLoading, briefSeenKey, hasMorningBrief]);

  const closeBrief = () => {
    if (typeof window !== 'undefined') localStorage.setItem(briefSeenKey, '1');
    setBriefOpen(false);
  };

  // 목표 이름은 agenda 응답에 없어서 따로 가져온다. 못 가져오면 카테고리 라벨로 폴백한다.
  const [goalTitles, setGoalTitles] = useState<Map<string, ApiGoal>>(new Map());
  useEffect(() => {
    let cancelled = false;
    goalsApi.list().then(
      (byTier) => {
        if (cancelled) return;
        const all = [...(byTier.focus ?? []), ...(byTier.maintain ?? []), ...(byTier.parked ?? [])];
        setGoalTitles(new Map(all.map((g) => [g.goalId, g])));
      },
      () => { /* 목표 못 가져오면 카테고리 라벨로 폴백 */ },
    );
    return () => { cancelled = true; };
  }, []);

  // 블록 종료 +20분 미체크 인앱 넛지(#224 T1). 시간이 지나는 것만으로도 조건이 바뀌므로
  // 1분마다 재평가한다 — 화면을 새로고침해야만 뜨면 "앱을 열어보게" 만드는 목적에 안 맞는다.
  const [nudgeNow, setNudgeNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNudgeNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  // 체크인 목록 계산은 1분 주기로 유지하고, 화면의 카운트다운만 가볍게 매초 갱신한다.
  const [countdownNow, setCountdownNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setCountdownNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);
  // dismiss 는 localStorage 만 건드리고 tasks/weeklyPlan 을 바꾸지 않아 useMemo 가
  // 재계산할 이유가 없다 — 즉시 화면에서 빼려고 이 카운터를 dep 에 끼워 강제로 재실행한다.
  const [nudgeDismissTick, setNudgeDismissTick] = useState(0);
  const uncheckedBlocks = useMemo(
    () => filterDismissedBlocks(findUncheckedBlocks(tasks, weeklyPlan, localDateStr(nudgeNow), nudgeNow)),
    [tasks, weeklyPlan, nudgeNow, nudgeDismissTick],
  );
  useEffect(() => { onUncheckedChange?.(uncheckedBlocks.length); }, [uncheckedBlocks.length, onUncheckedChange]);
  const dismissNudge = () => {
    dismissUncheckedBlocks(uncheckedBlocks.map((b) => b.actionId));
    setNudgeDismissTick((n) => n + 1);
  };

  // 화면에 붙일 부가 정보. 없는 건 없는 대로 둔다(빈 값을 지어내지 않는다).
  const metaFor = (t: Task) => {
    const b = blockInfo.get(t.id);
    const goal = b?.goalId ? goalTitles.get(b.goalId) : undefined;
    return {
      time: b?.time ?? t.time,
      dur: b ? `${b.durMin}분` : t.dur,
      goalLabel: goal?.title ?? (t.goal ? categoryLabel(t.goal) : undefined),
      goalColor: goalColor(goal?.category ?? t.goal),
    };
  };

  // 취소 대기 — 5초 안에 '되돌리기' 를 누르면 요청 자체를 보내지 않는다.
  // BE 에 restore 가 없으므로(#214) 되돌릴 유일한 방법은 "아직 안 보내는 것" 이다.
  // 5초 안에 앱이 닫히면 요청이 안 나가 카드가 남는다 — 잃는 쪽이 아니라 남는 쪽으로 실패한다.
  const [pendingCancel, setPendingCancel] = useState<{ id: string; title: string } | null>(null);
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 대기 중인 취소를 지금 확정한다(다른 카드를 취소하거나 화면을 떠날 때).
  const commitCancel = (id: string) => {
    todayApi.cancel(id).catch((err: unknown) => {
      // 못 지웠으면 목록에 되돌린다 — 사라진 척하면 사용자는 지워진 줄 안다.
      setHiddenIds((s) => { const n = new Set(s); n.delete(id); return n; });
      showToast(friendlyError(err, '취소하지 못했어요. 카드를 되돌렸어요.'), 'error');
    });
  };

  const requestCancel = (t: Task) => {
    // 앞서 대기 중이던 취소가 있으면 먼저 확정한다 — 되돌릴 기회는 하나씩만 준다.
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    if (pendingCancel) commitCancel(pendingCancel.id);

    setHiddenIds((s) => new Set(s).add(t.id));
    setPendingCancel({ id: t.id, title: t.title });
    cancelTimer.current = setTimeout(() => {
      cancelTimer.current = null;
      commitCancel(t.id);
      setPendingCancel(null);
    }, 5000);
  };

  const undoCancel = () => {
    if (cancelTimer.current) clearTimeout(cancelTimer.current);
    cancelTimer.current = null;
    if (pendingCancel) setHiddenIds((s) => { const n = new Set(s); n.delete(pendingCancel.id); return n; });
    setPendingCancel(null);
  };

  // 화면을 떠나면 대기 중인 취소를 확정한다. 타이머만 죽이면 카드는 숨은 채
  // 서버엔 남아, 다음 진입 때 되살아나 사용자가 취소가 안 먹었다고 느낀다.
  //
  // deps 를 [pendingCancel] 로 두면 안 된다 — 취소를 거는 순간 이전 effect 의 정리가
  // 돌면서 방금 건 타이머를 지운다(그래서 5초가 지나도 아무것도 안 나갔다).
  // 언마운트에서만 돌도록 빈 deps 로 두고, 최신 값은 ref 로 읽는다.
  const pendingRef = useRef<{ id: string; title: string } | null>(null);
  pendingRef.current = pendingCancel;
  useEffect(() => () => {
    if (cancelTimer.current) {
      clearTimeout(cancelTimer.current);
      const p = pendingRef.current;
      if (p) commitCancel(p.id);
    }
  }, []);

  const [detailTask, setDetailTask] = useState<Task | null>(null); // 액션 상세 시트(S11)
  const [failSheet, setFailSheet] = useState<string | null>(null);
  const [partialSheet, setPartialSheet] = useState<string | null>(null);
  // 카드 액션 영역은 기본 숨김. 사용자가 카드 클릭하거나 in_progress 인 카드만 펼침.
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(
    tasks.find((t) => t.status === 'in_progress')?.id ?? null,
  );
  // hero 카드가 가리키는 task — row 클릭으로 promote 만, 실제 시작 X.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 미체크 넛지를 탭하면 첫 카드를 hero 로 올린다 — 기존 row 클릭(promote)과 같은
  // 동작이라 새로운 진입 경로를 또 익힐 필요가 없다.
  const openFirstUnchecked = () => {
    if (uncheckedBlocks[0]) setSelectedTaskId(uncheckedBlocks[0].actionId);
  };
  // 실패 사유 태그 — 최대 2개 선택(S18). memo 는 선택 자유 텍스트.
  const [failTags, setFailTags] = useState<FailureTagOption[]>([]);
  const [failMemo, setFailMemo] = useState('');
  // task_aversiveness — 실패 회고에 얹는 정서 1문항(#222), 1~5. 선택 안 해도 제출 가능
  // (마찰 최소화 — 강제하지 않는다). 백엔드 필드가 아직 없어 로컬 상태로만 갖고 있다가
  // markFailed 로 전달만 하고, 실제 전송은 백엔드 스펙이 생기면 그때 연결한다.
  const [taskAversiveness, setTaskAversiveness] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  // 실패 사유 목록 — 백엔드 실패 태그 카탈로그(#17). 저녁 일괄 회고도 같은 목록을 쓰므로
  // 조회와 더미 fallback 을 훅 하나로 모았다(#238).
  const failReasons = useFailureTagCatalog();
  // 초기값 비움 → 로딩 중 스켈레톤. 백엔드 미동작 시에만 더미 fallback (flash 방지).
  const [habits, setHabits] = useState<Habit[]>([]);
  const [addingHabit, setAddingHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  // 습관 추가 폼 — 주당 빈도(1~7)와 카테고리를 직접 고른다(#10 S27, 예전엔 하드코딩).
  const [newHabitFreq, setNewHabitFreq] = useState(3);
  const [newHabitCategory, setNewHabitCategory] = useState('health');
  // 초기 습관 로드 중 — 더미/실데이터 겹침 대신 스켈레톤.
  const [habitsLoading, setHabitsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([habitsApi.list(), habitsApi.instancesForWeek(thisMonday())])
      .then(([apiHabits, instances]) => {
        if (cancelled) return;
        // fetch 성공 = 연동됨. 비어있어도 실데이터로 처리 — 더미 습관으로 가리지 않는다.
        const mapped: Habit[] = apiHabits.map((h) => {
          const inst = instances.find((i) => i.habitId === h.habitId);
          return {
            id: h.habitId,
            instanceId: inst?.instanceId ?? null,
            name: h.title,
            targetDays: inst?.targetCount ?? h.frequencyPerWeek,
            doneDays: inst?.doneCount ?? 0,
          };
        });
        setHabits(mapped);
      })
      .catch(() => {
        if (cancelled) return;
        // 실패 시 더미로 가리지 않고 빈 목록 — 아래 empty-state 안내가 대신 뜬다.
        setHabits([]);
      })
      .finally(() => { if (!cancelled) setHabitsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // 먼저 화면을 바꾸고 서버에 보낸다. 실패하면 **되돌린다** — 예전엔 조용히 삼켰다.
  // 백엔드 미구현 시절의 습관인데 /habit-instances/{id}/check, DELETE /habits/{id} 는
  // 이미 다 있다. 실패를 삼키면 사용자는 체크되지 않은 걸 체크됐다고 믿고,
  // 그 숫자가 주간 지표의 근거라 신뢰가 통째로 깨진다.
  const checkHabit = (id: string) => {
    const target = habits.find((h) => h.id === id);
    if (!target || target.doneDays >= target.targetDays) return;
    setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, doneDays: h.doneDays + 1 } : h)));
    if (!target.instanceId) return;
    habitsApi.check(target.instanceId).catch((err: unknown) => {
      setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, doneDays: Math.max(0, h.doneDays - 1) } : h)));
      showToast(friendlyError(err, '기록하지 못했어요. 다시 눌러 주세요.'), 'error');
    });
  };
  const removeHabit = (id: string) => {
    const removed = habits.find((h) => h.id === id);
    const at = habits.findIndex((h) => h.id === id);
    if (!removed) return;
    setHabits((hs) => hs.filter((h) => h.id !== id));
    habitsApi.remove(id).catch((err: unknown) => {
      // 서버에 남아 있으므로 화면에도 원래 자리로 되돌린다.
      setHabits((hs) => { const n = [...hs]; n.splice(Math.min(at, n.length), 0, removed); return n; });
      showToast(friendlyError(err, '삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'), 'error');
    });
  };
  const addHabit = () => {
    const title = newHabitName.trim();
    if (!title) return;
    const freq = Math.min(7, Math.max(1, newHabitFreq)); // 주 1~7회 클라 검증
    const category = newHabitCategory;
    const tempId = `h${Date.now()}`;
    const optimistic: Habit = { id: tempId, instanceId: null, name: title, targetDays: freq, doneDays: 0 };
    setHabits((hs) => [...hs, optimistic]);
    setNewHabitName('');
    setNewHabitFreq(3);
    setNewHabitCategory('health');
    setAddingHabit(false);
    habitsApi
      .create({
        title,
        category,
        frequencyPerWeek: freq,
        minutesPerSession: 30,
        timePreference: 'anytime',
        priorityLevel: 3,
      })
      .then((created) => {
        // 서버 응답의 habitId 로 임시 id 교체 (백엔드 채워질 때만 의미)
        setHabits((hs) => hs.map((h) => (h.id === tempId ? { ...h, id: created.habitId } : h)));
      })
      .catch(() => { /* 더미만 보존 */ });
  };

  const showToast = (msg: string, tone: 'ok' | 'error' = 'ok') => { setToast({ msg, tone }); setTimeout(() => setToast(null), 2200); };
  const partialTasks = tasks.filter((t) => t.status === 'partial_done' || t.status === 'recovery_pending');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  // 일정이 0개면 "모두 완료"가 아니다(0===0 이라도) — 없는 걸 다 했다고 하지 않는다.
  const allDone = tasks.length > 0 && doneTasks.length === tasks.length;

  const submitFail = () => {
    if (failTags.length === 0 || !failSheet) return;
    onFail(
      failSheet,
      failTags.map((t) => t.labelKo).join(', '),
      failTags.map((t) => t.code),
      failMemo.trim() || undefined,
      taskAversiveness ?? undefined,
    );
    setFailSheet(null);
    setFailTags([]);
    setFailMemo('');
    setTaskAversiveness(null);
  };

  // Focus on Now — 색 팔레트 통일. 모든 카드 동일 베이지 배경. 상태는 ring +
  // 텍스트 색으로만 표현. partial_done(회복 대기) 만 미세한 강조.
  const taskStyle = (t: Task) => {
    if (t.status === 'partial_done' || t.status === 'recovery_pending') {
      return { bg: 'var(--brand-soft)', bd: 'var(--coral-200)' };
    }
    return { bg: 'var(--surface-raised)', bd: 'var(--sand-200)' };
  };

  const partialTask = partialSheet ? tasks.find((t) => t.id === partialSheet) : null;

  const activeTask = tasks.find((t) => t.status === 'in_progress');
  const pendingTasks = tasks.filter((t) => t.status === 'todo');
  // Hero 우선순위: ① 사용자가 선택(promote)한 카드 ② 진행 중 카드 ③ 첫 대기 카드.
  // 사용자가 row 를 클릭해 다른 카드를 보고 싶다는 의사를 명시했으면 그것이 최우선.
  const heroTask =
    tasks.find((t) => t.id === selectedTaskId) ?? activeTask ?? pendingTasks[0] ?? null;
  const briefBigRockTask = briefBigRockId ? tasks.find((t) => t.id === briefBigRockId) ?? null : null;
  const heroStartsLater = !!heroTask?.scheduledAt && new Date(heroTask.scheduledAt).getTime() > countdownNow.getTime();
  const futureStartLabel = heroStartsLater && heroTask?.scheduledAt
    ? startCountdownLabel(heroTask.scheduledAt, countdownNow)
    : undefined;

  // C안: 히어로 아래 나머지 일은 카드 더미가 아니라 시간축으로 읽힌다.
  // 시간 있는 항목만 먼저 오름차순, 미정 항목은 서버가 준 상대 순서를 유지한다.
  const sortedTimelineTasks = tasks
    .map((task, index) => ({ task, index, meta: metaFor(task) }))
    .sort((a, b) => {
      const at = a.meta.time ?? a.task.time;
      const bt = b.meta.time ?? b.task.time;
      if (at && bt) return at.localeCompare(bt) || a.index - b.index;
      if (at) return -1;
      if (bt) return 1;
      return a.index - b.index;
    });
  const timelineTasks = sortedTimelineTasks.filter(({ task }) =>
    task.id !== heroTask?.id && (task.status === 'todo' || task.status === 'in_progress'),
  );
  const executionHistory = sortedTimelineTasks.filter(({ task }) =>
    task.status === 'done'
    || task.status === 'failed'
    || task.status === 'partial_done'
    || task.status === 'recovery_pending',
  );

  // 히어로 카드가 화면 밖으로 나가면 상단 스트립을 띄운다(#214). 스트립이 가리키는 카드는
  // 항상 heroTask 그 자체다 — 선정 로직을 복제하면 언젠가 조용히 어긋난다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const root = scrollRef.current;
    const target = heroRef.current;
    // 히어로가 없으면(빈 상태·로딩) 스트립도 뜰 이유가 없다 — 보이는 것으로 취급해 숨긴다.
    if (!root || !target) {
      setHeroVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { root, threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [heroTask?.id, agendaLoading, tasks.length]);

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* 스크롤 흐름 밖(absolute)에 겹쳐 띄운다 — 나타날 때 아래 내용이 밀리지 않게. */}
      {!agendaLoading && heroTask && (
        <NextUpStrip
          task={heroTask}
          visible={!heroVisible}
          {...metaFor(heroTask)}
          done={doneTasks.length}
          total={tasks.length}
          onStart={(id) => onOpen(id)}
          startDisabled={heroStartsLater}
          startLabel={heroStartsLater ? futureStartLabel : undefined}
        />
      )}
      <div ref={scrollRef} style={{ height: '100%', overflowY: 'auto', padding: '12px 18px 32px', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Header — 한 줄로 압축. 열품타식 미니멀. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>{userName}</span>
            <span className="tnum" style={{ fontSize: 11, color: 'var(--text-3)' }}>{todayShortKo()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {partialTasks.length > 0 && (
              // 회복은 이 제품의 핵심 차별점인데 ⋮ 옆 작은 아이콘이라 존재감이 없었다.
              // 이름을 붙인 칩으로 올린다 — 뭘 누르는 건지 읽히게.
              <button
                onClick={onOpenRecovery}
                title={`회복 제안 ${partialTasks.length}건`}
                style={{ height: 32, padding: '0 11px 0 9px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <ArrowsClockwise size={14} color="var(--brand-ink)" weight="fill" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-ink)' }}>회복</span>
                <span className="tnum" style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 9999, background: 'var(--brand-surface)', color: '#FFFCF6', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{partialTasks.length}</span>
              </button>
            )}
            <HeaderMenu onOpenBrief={() => setBriefOpen(true)} hasBrief={hasMorningBrief || justOnboarded} />
          </div>
        </div>

        {/* 블록 종료 +20분 미체크 인앱 넛지(#224 T1) — 푸시가 막혀 대체된 것이라 앱을 열었을
            때만 보인다. 닫으면(X) 같은 블록은 localStorage 로 다시 안 뜬다(반복 노출 방지). */}
        {!agendaLoading && uncheckedBlocks.length > 0 && (
          <div
            role="status"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)' }}
          >
            <BellRinging size={16} color="var(--brand-ink)" weight="fill" style={{ flexShrink: 0 }} />
            <button
              onClick={openFirstUnchecked}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-ink)' }}>
                확인 안 한 작업이 있어요
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {uncheckedBlocks.length === 1
                  ? uncheckedBlocks[0].title
                  : `${uncheckedBlocks[0].title} 외 ${uncheckedBlocks.length - 1}건`}
              </div>
            </button>
            <button
              onClick={dismissNudge}
              aria-label="닫기"
              style={{ width: 26, height: 26, borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        )}

        {/* 고정 일정은 할 일이 있든 없든 하루의 테두리다 — 카드 분기 바깥에 둔다.
            "오늘 등록된 일정이 없어요" 아래에 수업 3시간이 떠 있는 게 사실에 맞다. */}
        {!agendaLoading && <FixedScheduleStrip items={fixedSchedules} />}

        {/* 첫 agenda fetch 가 끝나기 전엔 스켈레톤. 비었으면 배너 하나만(에러 or 안내),
            일정이 있으면 hero + row. 예전엔 배너 2개 + 빈 hero 가 겹쳐 3중으로 떴다. */}
        {agendaLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <SkeletonBlock count={1} height={140} radius={24} />
            <SkeletonBlock count={3} height={64} />
          </div>
        ) : tasks.length === 0 ? (
          !usingRealAgenda ? (
            <DemoNotice storageKey="today-agenda">
              오늘 일정을 서버에서 불러오지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.
            </DemoNotice>
          ) : (
            <EmptyState>
              오늘 등록된 일정이 없어요. 주간 계획에서 일정을 추가하면 여기에 표시돼요.
            </EmptyState>
          )
        ) : (
          <>
            {/* Hero — 지금 할 일. row 에서 promote 한 카드 또는 진행 중 카드.
                ref 는 상단 스트립 노출 판정(IntersectionObserver)용. */}
            {heroTask && (
              <div ref={heroRef}>
                <HeroTaskCard
                  task={heroTask}
                  done={doneTasks.length}
                  total={tasks.length}
                  {...metaFor(heroTask)}
                  onComplete={() => (onMarkDone(heroTask.id), showToast('완료!'))}
                  onPartial={() => setPartialSheet(heroTask.id)}
                  onFail={() => (setFailSheet(heroTask.id), setFailTags([]), setFailMemo(''))}
                  onStart={(id) => onOpen(id)}
                  startDisabled={heroStartsLater}
                  startLabel={heroStartsLater ? futureStartLabel : undefined}
                  onDetail={() => setDetailTask(heroTask)}
                />
              </div>
            )}

            {/* C안 — 나머지 할 일을 예정 시각 기준의 하루 타임라인으로 보여준다. */}
            <TodayTimeline
              items={timelineTasks.map(({ task, meta }) => ({ task, ...meta }))}
              title={usingWeeklyFallback ? '이번 주 남은 일정' : '오늘의 타임라인'}
              orderLabel={usingWeeklyFallback ? '예정순' : '시간순'}
              interactive={!usingWeeklyFallback}
              onSelect={setSelectedTaskId}
              onFailedRecover={onFail}
              onPartialRecover={onOpenRecovery}
            />

            <TodayTimeline
              items={executionHistory.map(({ task, meta }) => ({ task, ...meta }))}
              title="오늘 실행 기록"
              orderLabel={`${executionHistory.length}건`}
              interactive={!usingWeeklyFallback}
              onSelect={setSelectedTaskId}
              onFailedRecover={onFail}
              onPartialRecover={onOpenRecovery}
            />
          </>
        )}

        {/* Habit Tracker — 습관이 없을 때도 추가 행동이 눈에 띄도록 작은 CTA 모듈을 둔다.
            긴 빈 상태 대신 목적·행동을 한 카드에 담아 오늘 실행 흐름을 방해하지 않는다. */}
        {!habitsLoading && habits.length === 0 && !addingHabit ? (
          <section aria-labelledby="habit-empty-title" style={{ padding: '16px', borderRadius: 18, border: '1px solid var(--coral-200)', background: 'linear-gradient(135deg, var(--brand-soft) 0%, var(--surface-raised) 100%)', display: 'flex', alignItems: 'center', gap: 13 }}>
            <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--surface-raised)', border: '1px solid var(--coral-200)', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
              <Repeat size={21} weight="bold" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div id="habit-empty-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.35 }}>작은 루틴을 시작해볼까요?</div>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all' }}>이번 주 목표 횟수를 정하고 홈에서 바로 기록해요.</div>
            </div>
            <button
              onClick={() => setAddingHabit(true)}
              style={{ minHeight: 42, padding: '0 14px', borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}
            data-tour-help="매주 반복할 습관을 만들어요. 주 몇 회 할지 정하면 오늘 화면에서 눌러 체크할 수 있어요."
            ><Plus size={14} weight="bold" /> 습관 추가</button>
          </section>
        ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            {/* 아직 못 불러온 개수를 (0) 으로 단정하면 거짓 정보다 — 로딩 중엔 숫자를 비운다. */}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
              추적 습관 루틴{habitsLoading ? '' : ` (${habits.length})`}
            </span>
            <button
              onClick={() => setAddingHabit(true)}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 9999, fontSize: 12, color: 'var(--coral-700)', fontWeight: 800, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
            data-tour-help="매주 반복할 습관을 만들어요. 주 몇 회 할지 정하면 오늘 화면에서 눌러 체크할 수 있어요."
            ><Plus size={13} weight="bold" /> 습관 추가</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {habitsLoading && <SkeletonBlock count={2} height={52} radius={14} gap={10} />}
            {habits.map(h => {
              const done = h.doneDays >= h.targetDays;
              return (
                <div key={h.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#E8994A', fontSize: 10, flexShrink: 0, lineHeight: 1 }}>●</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{h.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>이번 주 {h.doneDays} / {h.targetDays}일 완료</span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {Array.from({ length: h.targetDays }).map((_, i) => (
                          <span key={i} style={{ fontSize: 10, color: i < h.doneDays ? '#E8994A' : 'var(--sand-300)', lineHeight: 1 }}>●</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => checkHabit(h.id)}
                    disabled={done}
                    style={{ padding: '8px 14px', borderRadius: 9999, border: 'none', background: done ? '#E5EFE3' : '#EEEAF6', color: done ? 'var(--success-ink)' : '#7B68C8', fontSize: 13, fontWeight: 600, cursor: done ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all 200ms' }}
                  >{done ? '완료' : '체크'}</button>
                  <button
                    onClick={() => removeHabit(h.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-ink)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  ><Trash size={16} /></button>
                </div>
              );
            })}
            {addingHabit && (
              <div style={{ background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 16, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  autoFocus
                  value={newHabitName}
                  onChange={e => setNewHabitName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addHabit(); if (e.key === 'Escape') setAddingHabit(false); }}
                  placeholder="습관 이름 입력..."
                  style={{ width: '100%', height: 40, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '0 12px', boxSizing: 'border-box', outline: 'none', fontSize: 14, fontFamily: 'inherit', color: 'var(--text-1)' }}
                />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6 }}>주 몇 회</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                      const sel = newHabitFreq === n;
                      return (
                        <button key={n} onClick={() => setNewHabitFreq(n)} className="tnum" style={{ flex: 1, height: 34, borderRadius: 9, border: `1px solid ${sel ? 'var(--brand)' : 'var(--sand-200)'}`, background: sel ? 'var(--brand-surface)' : 'var(--surface-ground)', color: sel ? '#FFFCF6' : 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 6 }}>카테고리</div>
                  <select value={newHabitCategory} onChange={(e) => setNewHabitCategory(e.target.value)} style={{ width: '100%', height: 38, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '0 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }}>
                    {GOAL_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setAddingHabit(false); setNewHabitName(''); setNewHabitFreq(3); setNewHabitCategory('health'); }} style={{ flex: 1, height: 38, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                  <button onClick={addHabit} disabled={!newHabitName.trim()} style={{ flex: 2, height: 38, borderRadius: 10, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontSize: 13, fontWeight: 700, cursor: newHabitName.trim() ? 'pointer' : 'not-allowed', opacity: newHabitName.trim() ? 1 : 0.4, fontFamily: 'inherit' }}>추가</button>
                </div>
              </div>
            )}
          </div>
        </div>

        )}

        {/* All done */}
        {allDone && (
          <div style={{ background: '#E5EFE3', border: '1px solid #b4dfc8', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success-ink)' }}>오늘 모두 완료했어요</div>
            <button onClick={onEvening} style={{ width: '100%', height: 40, borderRadius: 10, border: 'none', background: 'var(--success)', color: '#FFFCF6', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>저녁 체크인 하기 →</button>
          </div>
        )}

        {/* 실행 기록 안내 배너는 반복 노출되어 노이즈. Settings 로 옮길 예정. */}
      </div>

      {/* MorningBrief는 오늘 목록을 복제하는 별도 페이지가 아니라, 하루의 우선순위를
          정하고 바로 실행 화면으로 돌아오는 짧은 브리프 시트다. */}
      {briefOpen && !agendaLoading && (
        <div
          onClick={closeBrief}
          style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(26,23,20,.48)', display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="morning-brief-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: '100%', maxHeight: '82%', overflowY: 'auto', borderRadius: '24px 24px 0 0', background: 'var(--surface-raised)', padding: '10px 18px max(32px, env(safe-area-inset-bottom, 32px))', boxShadow: 'var(--shadow-xl)' }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 18px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9999, flexShrink: 0, background: 'var(--brand-soft)', display: 'grid', placeItems: 'center' }}>
                <Sparkle size={17} weight="fill" color="var(--brand-ink)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div id="morning-brief-title" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                  {justOnboarded ? '준비가 끝났어요' : '오늘의 브리프'}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-3)' }}>
                  목록보다 오늘의 방향만 짧게 확인해요.
                </div>
              </div>
              <button onClick={closeBrief} aria-label="브리프 닫기" style={{ width: 36, height: 36, border: 'none', borderRadius: 9999, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={14} weight="bold" />
              </button>
            </div>

            {briefHeadline && (
              <div style={{ padding: '14px 15px', borderRadius: 16, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', fontSize: 14, fontWeight: 700, lineHeight: 1.6, marginBottom: 12 }}>
                {briefHeadline}
              </div>
            )}

            {briefAdjustmentHints.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 7 }}>오늘 달라진 점</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {briefAdjustmentHints.map((hint, index) => (
                    <div key={`${hint}-${index}`} style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 12, background: 'var(--sand-100)', color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--brand-ink)', fontWeight: 800 }}>·</span>{hint}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {briefBigRockTask && (
              <div style={{ padding: '12px 14px', borderRadius: 14, border: '1.5px solid var(--coral-200)', background: 'var(--surface-ground)', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-ink)', marginBottom: 5 }}>오늘의 큰 돌</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.4 }}>{briefBigRockTask.title}</div>
                {briefBigRockTask.firstStep && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>첫 걸음 · {briefBigRockTask.firstStep}</div>}
              </div>
            )}

            <button
              onClick={() => {
                if (briefBigRockTask) setSelectedTaskId(briefBigRockTask.id);
                closeBrief();
                window.requestAnimationFrame(() => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
              style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {briefBigRockTask ? '큰 돌부터 시작하기' : '오늘 실행 보기'}
            </button>
          </div>
        </div>
      )}

      {/* Action Detail sheet (S11) — 왜 지금 / 예상 시간 / 첫 걸음 + 시작 */}
      {detailTask && (
        <div onClick={() => setDetailTask(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '22px 22px 0 0', padding: '10px 20px 40px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {detailTask.goal && <span style={{ height: 'var(--ctrl-xs)', padding: '0 8px', borderRadius: 9999, background: 'var(--sand-100)', border: '1px solid var(--sand-200)', fontSize: 10, color: 'var(--text-2)', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>{detailTask.goal}</span>}
              {detailTask.dur && <span className="tnum" style={{ height: 'var(--ctrl-xs)', padding: '0 8px', borderRadius: 9999, background: 'var(--sand-100)', border: '1px solid var(--sand-200)', fontSize: 10, color: 'var(--text-2)', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>예상 {detailTask.dur}</span>}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.01em', marginBottom: 14 }}>{detailTask.title}</div>
            {detailTask.whyNow && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--brand-ink)', marginBottom: 4 }}>왜 지금</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{detailTask.whyNow}</p>
              </div>
            )}
            {detailTask.firstStep && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--coral-700)', marginBottom: 4 }}>첫 걸음</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--coral-700)', lineHeight: 1.55 }}>{detailTask.firstStep}</p>
              </div>
            )}
            <button onClick={() => { const id = detailTask.id; setDetailTask(null); onOpen(id); }} style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>시작하기</button>
            {/* 취소는 BE 가 가능하다고 한 카드에만 보여준다(cancellable). 이미 시작했거나
                회복·목표에서 파생된 카드는 취소 대상이 아니라 버튼 자체를 만들지 않는다. */}
            {detailTask.cancellable && (
              <button
                onClick={() => { const t = detailTask; setDetailTask(null); requestCancel(t); }}
                style={{ width: '100%', height: 44, marginTop: 8, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                이 할 일 취소하기
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fail reason sheet */}
      {failSheet && (
        <div onClick={() => setFailSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '22px 22px 0 0', padding: '10px 18px 44px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, color: 'var(--text-1)' }}>지금 어떤 상태예요?</div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>이유를 기록하면 더 잘 맞는 복구안을 제안해드려요.</p>
            {/* 정서 1문항(#222)은 이 시트에서만 노출한다 — 실패로 기록되는 경로라서
                markFailed 가 답을 이어받을 수 있기 때문이다. */}
            <FailureTagPicker
              reasons={failReasons}
              selected={failTags}
              onChange={setFailTags}
              memo={failMemo}
              onMemoChange={setFailMemo}
              aversiveness={taskAversiveness}
              onAversivenessChange={setTaskAversiveness}
            />
            <button onClick={submitFail} disabled={failTags.length === 0} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: failTags.length ? 'pointer' : 'not-allowed', opacity: failTags.length ? 1 : 0.35 }}>기록하고 복구안 보기</button>
          </div>
        </div>
      )}

      {/* Partial sheet */}
      {partialSheet && partialTask && (
        <ProgressSheet
          taskTitle={partialTask.title}
          onSubmit={(pct) => { onPartial(partialSheet, pct); setPartialSheet(null); showToast('부분 완료 기록됨'); }}
          onClose={() => setPartialSheet(null)}
          note={<>저장 시 <b>회복 대기</b> 상태로 넘어가요.</>}
        />
      )}

      {/* 취소 되돌리기 — 5초 창. 이게 떠 있는 동안은 서버에 아무것도 보내지 않았다.
          탭바(하단)를 가리지 않게 위로 띄운다. */}
      {pendingCancel && (
        <Toast bottom={96} action={{ label: '되돌리기', onClick: undoCancel }}>
          취소했어요 — {pendingCancel.title}
        </Toast>
      )}

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'absolute', left: 0, right: 0, bottom: 20, display: 'flex', justifyContent: 'center', zIndex: 80, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, padding: '10px 18px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow-lg)' }}>
            <span style={{ width: 6, height: 6, background: toast.tone === 'error' ? 'var(--danger)' : 'var(--success)', borderRadius: 9999 }} />{toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
