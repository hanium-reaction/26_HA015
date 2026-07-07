import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  CaretRight,
  Check,
  X,
  Trash,
} from '@phosphor-icons/react';
import type { Task, TaskStatus } from '../types';
import type { AgendaCard } from '../types/api';
import { FAIL_REASONS } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import { habitsApi, reflectionApi, todayApi } from '../lib/api';
import { DemoNotice } from '../components/DemoNotice';
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
  onFail: (id: string, reason: string, tagCode?: string) => void;
  onOpenRecovery: () => void;
  onEvening: () => void;
  // /today/agenda 실데이터 로드 성공 시 부모의 tasks 를 이 목록으로 교체한다.
  // (기존엔 이 화면이 자체 로컬 tasks 상태로만 반영해, 부모가 들고 있는 openTask 등이
  // 실제 카드 id 를 못 찾아 무반응이었다 — #66 대응)
  onAgendaLoaded: (tasks: Task[]) => void;
}

function Ring({ task }: { task: Task }) {
  const s = task.status;
  if (s === 'done') return (
    <div style={{ width: 26, height: 26, borderRadius: 9999, background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Check size={13} color="#FFFCF6" weight="bold" />
    </div>
  );
  if (s === 'failed') return (
    <div style={{ width: 26, height: 26, borderRadius: 9999, background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <X size={13} color="#FFFCF6" />
    </div>
  );
  if (s === 'partial_done' || s === 'recovery_pending') return (
    <div style={{ width: 26, height: 26, borderRadius: 9999, border: '2px solid var(--brand)', background: `conic-gradient(var(--brand) 0 ${task.progress ?? 67}%, var(--brand-soft) ${task.progress ?? 67}% 100%)` }} />
  );
  if (s === 'in_progress') return (
    <div style={{ width: 26, height: 26, borderRadius: 9999, border: '2px solid var(--brand)', background: 'conic-gradient(var(--brand) 0 40%, var(--surface-raised) 40% 100%)' }} />
  );
  return (
    <div style={{ width: 26, height: 26, borderRadius: 9999, border: '1.5px solid var(--sand-300)', background: 'var(--surface-raised)' }} />
  );
}

function PartialSheet({ taskId, taskTitle, onSubmit, onClose }: { taskId: string; taskTitle: string; onSubmit: (pct: number) => void; onClose: () => void }) {
  const [pct, setPct] = useState(50);
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '22px 22px 0 0', padding: '10px 20px 44px', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 18px' }} />
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>오늘은 얼마나 했어요?</div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18 }}>{taskTitle}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>진척</span>
          <span className="tnum" style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.02em' }}>{pct}<span style={{ fontSize: 16, fontWeight: 600 }}>%</span></span>
        </div>
        <div style={{ position: 'relative', height: 8, background: 'var(--sand-200)', borderRadius: 9999, marginBottom: 8 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--brand)', borderRadius: 9999 }} />
          <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 24, height: 24, borderRadius: 9999, background: '#FFFCF6', border: '2px solid var(--brand)', boxShadow: 'var(--shadow-md)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginBottom: 18 }}>
          {[0, 25, 50, 75, 100].map((t) => (
            <button key={t} onClick={() => setPct(t)} className="tnum" style={{ background: 'transparent', border: 'none', fontSize: 12, cursor: 'pointer', padding: '2px 4px', fontFamily: 'inherit', color: pct === t ? 'var(--brand)' : 'var(--text-3)', fontWeight: pct === t ? 600 : 500 }}>{t}</button>
          ))}
        </div>
        <div style={{ background: 'var(--coral-50)', borderRadius: 10, padding: '8px 10px', fontSize: 11, color: 'var(--coral-700)', marginBottom: 14 }}>
          저장 시 <b>recovery_pending</b>으로 자동 전이돼요.
        </div>
        <button onClick={() => onSubmit(pct)} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}>저장하기</button>
      </div>
    </div>
  );
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
  return d.toISOString().slice(0, 10);
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
  };
}

// "5월 24일 · 일요일" — Today 헤더용
function todayShortKo(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${days[d.getDay()]}요일`;
}

export function MergedTodayScreen({ tasks, onOpen, onMarkDone, onPartial, onFail, onOpenRecovery, onEvening, onAgendaLoaded }: MergedTodayScreenProps) {
  const { user } = useNavigation();
  const userName = user?.name ?? '친구';

  // agenda fetch 성공 = 백엔드 연결됨. 빈 응답이어도 true (연결 ≠ 데이터 존재).
  const [usingRealAgenda, setUsingRealAgenda] = useState(false);
  // 첫 agenda fetch 가 settle 되기 전엔 더미가 깜빡이지 않도록 스켈레톤만 노출.
  const [agendaLoading, setAgendaLoading] = useState(true);

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
        onAgendaLoaded((agenda.cards ?? []).map(actionToTask));
      },
      () => { /* 네트워크/오류 — 더미 그대로, usingRealAgenda=false */ },
    ).finally(() => { if (!cancelled) setAgendaLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const [failSheet, setFailSheet] = useState<string | null>(null);
  const [partialSheet, setPartialSheet] = useState<string | null>(null);
  // 카드 액션 영역은 기본 숨김. 사용자가 카드 클릭하거나 in_progress 인 카드만 펼침.
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(
    tasks.find((t) => t.status === 'in_progress')?.id ?? null,
  );
  // hero 카드가 가리키는 task — row 클릭으로 promote 만, 실제 시작 X.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState('');
  const [failTagCode, setFailTagCode] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
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
  // /habits 가 성공했는지 — true 면 습관 목록이 실데이터(비어있어도)라 더미로 가리지 않는다.
  const [usingRealHabits, setUsingRealHabits] = useState(false);
  // 초기 습관 로드 중 — 더미/실데이터 겹침 대신 스켈레톤.
  const [habitsLoading, setHabitsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([habitsApi.list(), habitsApi.instancesForWeek(thisMonday())])
      .then(([apiHabits, instances]) => {
        if (cancelled) return;
        // fetch 성공 = 연동됨. 비어있어도 실데이터로 처리 — 더미 습관으로 가리지 않는다.
        setUsingRealHabits(true);
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
        // 백엔드 미동작 — 더미로 fallback (로딩이 끝난 뒤에만 표시되어 flash 없음).
        setHabits([
          { id: 'h1', instanceId: null, name: '피트니스 센터 헬스장 가기', targetDays: 3, doneDays: 2 },
          { id: 'h2', instanceId: null, name: '마음 챙김 명상', targetDays: 3, doneDays: 0 },
        ]);
      })
      .finally(() => { if (!cancelled) setHabitsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // optimistic update + 백엔드 호출. 실패는 조용히 (mock-and-replace).
  const checkHabit = (id: string) => {
    const target = habits.find((h) => h.id === id);
    if (!target || target.doneDays >= target.targetDays) return;
    setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, doneDays: h.doneDays + 1 } : h)));
    if (target.instanceId) {
      habitsApi.check(target.instanceId).catch(() => { /* 401/501 ok */ });
    }
  };
  const removeHabit = (id: string) => {
    setHabits((hs) => hs.filter((h) => h.id !== id));
    habitsApi.remove(id).catch(() => { /* ok */ });
  };
  const addHabit = () => {
    const title = newHabitName.trim();
    if (!title) return;
    const tempId = `h${Date.now()}`;
    const optimistic: Habit = { id: tempId, instanceId: null, name: title, targetDays: 3, doneDays: 0 };
    setHabits((hs) => [...hs, optimistic]);
    setNewHabitName('');
    setAddingHabit(false);
    habitsApi
      .create({
        title,
        category: '건강',
        frequencyPerWeek: 3,
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const partialTasks = tasks.filter((t) => t.status === 'partial_done' || t.status === 'recovery_pending');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const allDone = doneTasks.length === tasks.length;

  const submitFail = () => {
    if (!failReason || !failSheet) return;
    onFail(failSheet, failReason, failTagCode);
    setFailSheet(null);
    setFailReason('');
    setFailTagCode(undefined);
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
              <button
                onClick={onOpenRecovery}
                aria-label="회복 제안"
                title={`회복 제안 ${partialTasks.length}건`}
                style={{ position: 'relative', width: 36, height: 36, borderRadius: 9999, border: 'none', background: 'var(--brand-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <ArrowsClockwise size={16} color="var(--brand)" weight="fill" />
                <span className="tnum" style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 'var(--ctrl-xs)', padding: '0 4px', borderRadius: 9999, background: 'var(--brand)', color: '#FFFCF6', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{partialTasks.length}</span>
              </button>
            )}
            <HeaderMenu />
          </div>
        </div>

        {/* 첫 agenda fetch 가 끝나기 전엔 더미→실데이터 깜빡임을 막기 위해 스켈레톤만 노출.
            배너·hero·task row 는 모두 fetch 결과에 의존하므로 함께 가린다. */}
        {agendaLoading ? (
          <AgendaSkeleton />
        ) : (
          <>
            {!usingRealAgenda ? (
              <DemoNotice storageKey="today-agenda">
                오늘 일정을 서버에서 불러오지 못했어요.
              </DemoNotice>
            ) : tasks.length === 0 ? (
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                오늘 등록된 일정이 없어요. 주간 계획에서 일정을 추가하면 여기에 표시돼요.
              </div>
            ) : null}
            {!usingRealAgenda && tasks.length === 0 && (
              <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                표시할 일정이 없어요. 네트워크 상태를 확인하고 다시 시도해 주세요.
              </div>
            )}

            {/* Hero — 지금 할 일. row 에서 promote 한 카드 또는 진행 중 카드. */}
            <HeroTaskCard
              task={heroTask}
              done={doneTasks.length}
              total={tasks.length}
              onComplete={() => heroTask && (onMarkDone(heroTask.id), showToast('완료!'))}
              onPartial={() => heroTask && setPartialSheet(heroTask.id)}
              onFail={() => heroTask && (setFailSheet(heroTask.id), setFailReason(''), setFailTagCode(undefined))}
              onStart={(id) => onOpen(id)}
            />

            {/* 나머지 카드 — 모두 한 줄 row 통일. hero 에 떠 있는 카드는 제외. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tasks
                .filter((t) => t.id !== heroTask?.id)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    // 대기/진행 row 클릭 = hero 로 promote (실제 시작 X)
                    onSelect={() => setSelectedTaskId(t.id)}
                    onFailedRecover={() => onFail(t.id, t.failReason || '')}
                    onPartialRecover={onOpenRecovery}
                  />
                ))}
            </div>
          </>
        )}

        {/* Habit Tracker */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>추적 습관 루틴 ({habits.length})</span>
            <button
              onClick={() => setAddingHabit(true)}
              style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >+ 습관 추가</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {habitsLoading && [0, 1].map((i) => (
              <div key={`hsk${i}`} style={{ height: 52, borderRadius: 14, background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', opacity: 0.6 }} aria-hidden="true" />
            ))}
            {!habitsLoading && usingRealHabits && habits.length === 0 && !addingHabit && (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-200)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                아직 추적 중인 습관이 없어요. 위 <b>+ 습관 추가</b>로 만들어보세요.
              </div>
            )}
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
                    style={{ padding: '8px 14px', borderRadius: 9999, border: 'none', background: done ? '#E5EFE3' : '#EEEAF6', color: done ? 'var(--success)' : '#7B68C8', fontSize: 13, fontWeight: 600, cursor: done ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all 200ms' }}
                  >{done ? '완료' : '체크'}</button>
                  <button
                    onClick={() => removeHabit(h.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  ><Trash size={16} /></button>
                </div>
              );
            })}
            {addingHabit && (
              <div style={{ background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 16, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={newHabitName}
                  onChange={e => setNewHabitName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addHabit(); if (e.key === 'Escape') setAddingHabit(false); }}
                  placeholder="습관 이름 입력..."
                  style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', fontFamily: 'inherit', color: 'var(--text-1)' }}
                />
                <button onClick={addHabit} style={{ padding: '6px 12px', borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>추가</button>
                <button onClick={() => { setAddingHabit(false); setNewHabitName(''); }} style={{ padding: '6px 10px', borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>취소</button>
              </div>
            )}
          </div>
        </div>

        {/* All done */}
        {allDone && (
          <div style={{ background: '#E5EFE3', border: '1px solid #b4dfc8', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>오늘 모두 완료했어요</div>
            <button onClick={onEvening} style={{ width: '100%', height: 40, borderRadius: 10, border: 'none', background: 'var(--success)', color: '#FFFCF6', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>저녁 체크인 하기 →</button>
          </div>
        )}

        {/* 실행 기록 안내 배너는 반복 노출되어 노이즈. Settings 로 옮길 예정. */}
      </div>

      {/* Fail reason sheet */}
      {failSheet && (
        <div onClick={() => setFailSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '22px 22px 0 0', padding: '10px 18px 44px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, color: 'var(--text-1)' }}>지금 어떤 상태예요?</div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>이유를 기록하면 더 잘 맞는 복구안을 제안해드려요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {failReasons.map((r) => (
                <button key={r.code} onClick={() => { setFailReason(r.labelKo); setFailTagCode(r.code); }} style={{ padding: '12px 14px', borderRadius: 12, textAlign: 'left', background: failReason === r.labelKo ? 'var(--text-1)' : 'var(--surface-raised)', color: failReason === r.labelKo ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${failReason === r.labelKo ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms' }}>{r.labelKo}</button>
              ))}
            </div>
            <button onClick={submitFail} disabled={!failReason} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', opacity: failReason ? 1 : 0.35 }}>기록하고 복구안 보기</button>
          </div>
        </div>
      )}

      {/* Partial sheet */}
      {partialSheet && partialTask && (
        <PartialSheet
          taskId={partialSheet}
          taskTitle={partialTask.title}
          onSubmit={(pct) => { onPartial(partialSheet, pct); setPartialSheet(null); showToast('부분 완료 기록됨'); }}
          onClose={() => setPartialSheet(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 20, display: 'flex', justifyContent: 'center', zIndex: 80, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, padding: '10px 18px', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow-lg)' }}>
            <span style={{ width: 6, height: 6, background: 'var(--success)', borderRadius: 9999 }} />{toast}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agenda Skeleton ───────────────────────────────────────────
// 첫 /today/agenda fetch 가 settle 될 때까지 hero+task row 자리를 채우는
// 가벼운 placeholder. 더미→실데이터 깜빡임 방지용. (전역 CSS 없이 인라인만.)
function AgendaSkeleton() {
  const box = (h: number, radius: number, bg: string): React.CSSProperties => ({
    height: h,
    borderRadius: radius,
    background: bg,
    opacity: 0.6,
  });
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* hero 자리 */}
      <div style={box(140, 24, 'var(--sand-100)')} />
      {/* task row 자리 — 3개 muted placeholder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={box(64, 12, 'var(--surface-raised)')} />
        ))}
      </div>
    </div>
  );
}

// ── Hero Task Card ────────────────────────────────────────────
// 열품타 패턴 — 화면의 주인공. 제목 크게, CTA 하나.
function HeroTaskCard({
  task, done, total,
  onComplete, onPartial, onFail, onStart,
}: {
  task: Task | null;
  done: number;
  total: number;
  onComplete: () => void;
  onPartial: () => void;
  onFail: () => void;
  onStart: (id: string) => void;
}) {
  if (!task) {
    return (
      <div style={{ background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 24, padding: '36px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text-2)' }}>오늘 할 일이 없어요</div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>주간 계획에서 블록을 추가해보세요.</p>
      </div>
    );
  }

  const isActive = task.status === 'in_progress';
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ background: 'var(--surface-raised)', border: '1.5px solid var(--coral-200)', borderRadius: 24, padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>
          {isActive ? '진행 중' : '다음 할 일'}
        </span>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{done} / {total} · {pct}%</span>
      </div>

      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0, color: 'var(--text-1)' }}>{task.title}</h2>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {task.carryover && (
            <span style={{ height: 'var(--ctrl-xs)', padding: '0 6px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 9999, fontSize: 10, color: 'var(--warning)', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>↩ 이월</span>
          )}
          {task.time && <span className="tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{task.time}{task.dur ? ` · ${task.dur}` : ''}</span>}
        </div>
      </div>

      {isActive ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onComplete}
            style={{ flex: 2, height: 52, borderRadius: 14, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Check size={16} weight="bold" /> 완료
          </button>
          <button
            onClick={onPartial}
            aria-label="일부만 함"
            style={{ width: 52, height: 52, borderRadius: 14, border: '1px solid var(--sand-200)', background: 'var(--surface-ground)', color: 'var(--text-2)', fontSize: 16, fontFamily: 'inherit', cursor: 'pointer' }}
          >◑</button>
          <button
            onClick={onFail}
            aria-label="잘 안됨"
            style={{ width: 52, height: 52, borderRadius: 14, border: '1px solid var(--coral-200)', background: '#FAE2D8', color: 'var(--danger)', fontSize: 16, fontFamily: 'inherit', cursor: 'pointer' }}
          >✗</button>
        </div>
      ) : (
        <button
          onClick={() => onStart(task.id)}
          style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          시작하기 <CaretRight size={14} />
        </button>
      )}
    </div>
  );
}

// ── Task Row (한 줄 list 아이템) ──────────────────────────────
// 클릭 동작 분기:
//   - done: 무반응
//   - failed: 회복 제안 화면으로
//   - partial_done / recovery_pending: 회복 제안 화면으로
//   - todo: hero 로 promote (실제 시작은 hero CTA 에서)
function TaskRow({
  task, onSelect, onFailedRecover, onPartialRecover,
}: {
  task: Task;
  onSelect: () => void;
  onFailedRecover: () => void;
  onPartialRecover: () => void;
}) {
  const done = task.status === 'done';
  const failed = task.status === 'failed';
  const partial = task.status === 'partial_done' || task.status === 'recovery_pending';
  const inProgress = task.status === 'in_progress';
  const onClick = done ? undefined : failed ? onFailedRecover : partial ? onPartialRecover : onSelect;

  return (
    <button
      onClick={onClick}
      disabled={done}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '10px 14px', borderRadius: 12, border: 'none',
        background: 'transparent', cursor: done ? 'default' : 'pointer',
        fontFamily: 'inherit', textAlign: 'left',
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: 9999, flexShrink: 0, border: done ? 'none' : `1.5px solid ${failed ? 'var(--danger)' : inProgress || partial ? 'var(--brand)' : 'var(--sand-300)'}`, background: done ? 'var(--success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {done && <Check size={11} weight="bold" color="#FFFCF6" />}
        {failed && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>✗</span>}
        {(partial || inProgress) && <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--brand)' }} />}
      </span>
      <span style={{ flex: 1, fontSize: 14, color: done ? 'var(--text-3)' : failed ? 'var(--danger)' : 'var(--text-1)', textDecoration: done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: partial ? 600 : 500 }}>{task.title}</span>
      {task.time && <span className="tnum" style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>{task.time}</span>}
    </button>
  );
}
