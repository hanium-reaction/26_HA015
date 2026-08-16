import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CaretRight,
  Check,
  X,
  Trash,
} from '@phosphor-icons/react';
import type { Task, TaskStatus } from '../types';
import type { AgendaCard, AgendaFixedSchedule, ApiGoal, WeeklyPlanResponse } from '../types/api';
import { FAIL_REASONS, GOAL_CATEGORY_OPTIONS } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import { friendlyError, goalsApi, habitsApi, plansApi, reflectionApi, todayApi } from '../lib/api';
import { localDateStr } from '../lib/dates';
import { categoryLabel, goalColor } from '../data';
import { DemoNotice } from '../components/DemoNotice';
import { HeroTaskCard } from '../components/HeroTaskCard';
import { TaskRow } from '../components/TaskRow';
import { ProgressSheet } from '../components/ProgressSheet';
import { EmptyState } from '../components/EmptyState';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { Toast } from '../components/Toast';
import { FixedScheduleStrip } from '../components/FixedScheduleStrip';
import { Gear, Target, DotsThreeVertical } from '@phosphor-icons/react';

// Today 헤더 우상단 — 목표 관리·설정을 하나의 ⋮ 메뉴로 통합 (아이콘 2개 → 1개).
function HeaderMenu() {
  const { setScreen } = useNavigation();
  const [open, setOpen] = useState(false);
  const go = (s: 'goals' | 'settings') => { setOpen(false); setScreen(s); };
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="메뉴"
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
              { s: 'goals' as const, label: '목표 관리', Icon: Target },
              { s: 'settings' as const, label: '설정', Icon: Gear },
            ].map(({ s, label, Icon }) => (
              <button
                key={s}
                onClick={() => go(s)}
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
  onFail: (id: string, reason: string, tagCodes?: string[], memo?: string) => void;
  onOpenRecovery: () => void;
  onEvening: () => void;
  // /today/agenda 실데이터 로드 성공 시 부모의 tasks 를 이 목록으로 교체한다.
  // (기존엔 이 화면이 자체 로컬 tasks 상태로만 반영해, 부모가 들고 있는 openTask 등이
  // 실제 카드 id 를 못 찾아 무반응이었다 — #66 대응)
  onAgendaLoaded: (tasks: Task[]) => void;
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
    case 'done':
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

// 중요한 순서(priority 오름차순, 1이 최우선). 백엔드도 같은 순서로 주지만,
// 그 배열 순서에 말없이 기대면 중간에 정렬·필터가 하나 끼는 순간 조용히 틀어진다.
// 값이 없는 카드는 뒤로 — 있는 것보다 앞세울 근거가 없다.
const byPriority = (a: Task, b: Task) =>
  (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);

// /today/agenda 에는 예약 시각이 없다(AgendaCard 필드에 없음). 시각은 주간 계획의
// 블록에만 있으므로 actionId 로 조인해서 채운다 — 지어내지 않고 실제 계획값을 쓴다.
function todayBlockIndex(plan: WeeklyPlanResponse, todayStr: string) {
  const byAction = new Map<string, { time: string; durMin: number; goalId?: string | null }>();
  for (const day of plan.days ?? []) {
    if (day.date !== todayStr) continue;
    for (const b of day.blocks ?? []) {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      byAction.set(b.actionId, {
        time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
        durMin: Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
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

export function MergedTodayScreen({ tasks: allTasks, onOpen, onMarkDone, onPartial, onFail, onOpenRecovery, onEvening, onAgendaLoaded }: MergedTodayScreenProps) {
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

  // /today/agenda 연동. 성공 시 actions → Task[] 매핑(빈 배열이어도 연결로 간주)해
  // 부모(ReActionMerged)의 tasks 를 이걸로 교체한다 — openTask/markDone 등이 같은
  // 목록을 보게 되어 실제 카드 id 로도 정상 동작한다(#66).
  // 실패 시 더미 유지(usingRealAgenda=false, 부모 tasks 그대로).
  useEffect(() => {
    let cancelled = false;
    todayApi.agenda().then(
      (agenda) => {
        if (cancelled) return;
        setUsingRealAgenda(true);
        setFixedSchedules(agenda.fixedSchedules ?? []);
        onAgendaLoaded((agenda.cards ?? []).map(actionToTask).sort(byPriority));
      },
      () => { /* 네트워크/오류 — 더미 그대로, usingRealAgenda=false */ },
    ).finally(() => { if (!cancelled) setAgendaLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // 오늘 블록의 예약 시각·소요, 그리고 목표 이름. 둘 다 agenda 응답엔 없어서 따로 가져온다.
  // agenda 렌더를 막지 않는다 — 늦게 도착하면 그때 칩이 붙는다(없으면 안 붙을 뿐).
  const [blockInfo, setBlockInfo] = useState<Map<string, { time: string; durMin: number; goalId?: string | null }>>(new Map());
  const [goalTitles, setGoalTitles] = useState<Map<string, ApiGoal>>(new Map());
  useEffect(() => {
    let cancelled = false;
    const today = localDateStr(new Date());
    plansApi.weekly(thisMonday()).then(
      (plan) => { if (!cancelled) setBlockInfo(todayBlockIndex(plan, today)); },
      () => { /* 계획 없음/오류 — 시각 칩만 안 붙는다 */ },
    );
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
  // 실패 사유 태그 — 최대 2개 선택(S18). memo 는 선택 자유 텍스트.
  const [failTags, setFailTags] = useState<{ code: string; labelKo: string }[]>([]);
  const [failMemo, setFailMemo] = useState('');
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  // 실패 사유 목록 — 백엔드 실패 태그 카탈로그(#17)가 오면 그 tagCode/labelKo 로, 없으면 더미.
  // tagCode 를 같이 들고 있어야 reflectionApi.tagExecution 저장 호출에 실 코드를 실어보낸다(#80).
  const [failReasons, setFailReasons] = useState<{ code: string; labelKo: string }[]>(
    FAIL_REASONS.map((label) => ({ code: label, labelKo: label })),
  );
  useEffect(() => {
    let cancelled = false;
    reflectionApi.failureTags().then(
      (tags) => { if (!cancelled && tags.length) setFailReasons(tags.map((t) => ({ code: t.tagCode, labelKo: t.labelKo }))); },
      () => { /* 미구현/오류 — 더미 그대로 */ },
    );
    return () => { cancelled = true; };
  }, []);
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

  // 태그 토글 — 최대 2개. 3번째 클릭 시 가장 오래된 것을 밀어낸다(swap).
  const toggleFailTag = (r: { code: string; labelKo: string }) => {
    setFailTags((cur) => {
      if (cur.some((t) => t.code === r.code)) return cur.filter((t) => t.code !== r.code);
      if (cur.length >= 2) return [cur[1], r];
      return [...cur, r];
    });
  };
  const submitFail = () => {
    if (failTags.length === 0 || !failSheet) return;
    onFail(
      failSheet,
      failTags.map((t) => t.labelKo).join(', '),
      failTags.map((t) => t.code),
      failMemo.trim() || undefined,
    );
    setFailSheet(null);
    setFailTags([]);
    setFailMemo('');
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
  const pendingTasks = tasks.filter((t) => t.status === 'todo' || t.status === 'partial_done' || t.status === 'recovery_pending');
  // Hero 우선순위: ① 사용자가 선택(promote)한 카드 ② 진행 중 카드 ③ 첫 대기 카드.
  // 사용자가 row 를 클릭해 다른 카드를 보고 싶다는 의사를 명시했으면 그것이 최우선.
  const heroTask =
    tasks.find((t) => t.id === selectedTaskId) ?? activeTask ?? pendingTasks[0] ?? null;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 18px 32px', background: 'var(--surface-ground)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Header — 한 줄로 압축. 열품타식 미니멀. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>{userName}</span>
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
            <HeaderMenu />
          </div>
        </div>

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
            {/* Hero — 지금 할 일. row 에서 promote 한 카드 또는 진행 중 카드. */}
            <HeroTaskCard
              task={heroTask}
              done={doneTasks.length}
              total={tasks.length}
              {...(heroTask ? metaFor(heroTask) : {})}
              onComplete={() => heroTask && (onMarkDone(heroTask.id), showToast('완료!'))}
              onPartial={() => heroTask && setPartialSheet(heroTask.id)}
              onFail={() => heroTask && (setFailSheet(heroTask.id), setFailTags([]), setFailMemo(''))}
              onStart={(id) => onOpen(id)}
              onDetail={() => heroTask && setDetailTask(heroTask)}
            />

            {/* 나머지 카드 — 모두 한 줄 row 통일. hero 에 떠 있는 카드는 제외. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tasks
                .filter((t) => t.id !== heroTask?.id)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    {...metaFor(t)}
                    // 대기/진행 row 클릭 = hero 로 promote (실제 시작 X)
                    onSelect={() => setSelectedTaskId(t.id)}
                    onFailedRecover={() => onFail(t.id, t.failReason || '')}
                    onPartialRecover={onOpenRecovery}
                  />
                ))}
            </div>
          </>
        )}

        {/* Habit Tracker — 습관이 하나도 없으면 섹션을 통째로 접는다.
            예전엔 제목 + 큰 점선 안내 박스가 화면 하단 40% 를 빈 채로 차지했다.
            추가 진입점은 남겨야 하므로 얇은 링크 한 줄로 대체한다. */}
        {!habitsLoading && habits.length === 0 && !addingHabit ? (
          <button
            onClick={() => setAddingHabit(true)}
            style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-3)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}
          >+ 습관 추가</button>
        ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            {/* 아직 못 불러온 개수를 (0) 으로 단정하면 거짓 정보다 — 로딩 중엔 숫자를 비운다. */}
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
              추적 습관 루틴{habitsLoading ? '' : ` (${habits.length})`}
            </span>
            <button
              onClick={() => setAddingHabit(true)}
              style={{ fontSize: 12, color: 'var(--brand-ink)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >+ 습관 추가</button>
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
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>주 몇 회</div>
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
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>카테고리</div>
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
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-ink)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>왜 지금</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{detailTask.whyNow}</p>
              </div>
            )}
            {detailTask.firstStep && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--coral-700)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>첫 걸음</div>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {failReasons.map((r) => {
                const sel = failTags.some((t) => t.code === r.code);
                return (
                  <button key={r.code} onClick={() => toggleFailTag(r)} style={{ padding: '9px 12px', borderRadius: 9999, background: sel ? 'var(--text-1)' : 'var(--surface-raised)', color: sel ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${sel ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms' }}>{r.labelKo}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>최대 2개까지 고를 수 있어요{failTags.length > 0 ? ` · ${failTags.length}/2` : ''}</div>
            <textarea value={failMemo} onChange={(e) => setFailMemo(e.target.value)} placeholder="메모 (선택) — 어떤 상황이었는지 적어두면 다음 제안이 더 잘 맞아요" rows={2} style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', resize: 'none', marginBottom: 14 }} />
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
