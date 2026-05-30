import React, { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  CaretRight,
  Check,
  X,
  Sparkle,
  Trash,
} from '@phosphor-icons/react';
import type { Task } from '../types';
import { FAIL_REASONS, MERGED_PROPOSALS, MORNING_DATA } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import { habitsApi, todayApi } from '../lib/api';
import { Gear, Target } from '@phosphor-icons/react';

// Today 헤더 우상단 — 목표 관리(S26) 진입점.
function GoalsButton() {
  const { setScreen } = useNavigation();
  return (
    <button
      onClick={() => setScreen('goals')}
      aria-label="목표 관리"
      style={{ width: 36, height: 36, borderRadius: 9999, border: 'none', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
    >
      <Target size={16} color="var(--text-2)" />
    </button>
  );
}

// Today 헤더 우상단 — Settings 화면 진입점.
function SettingsButton() {
  const { setScreen } = useNavigation();
  return (
    <button
      onClick={() => setScreen('settings')}
      aria-label="설정"
      style={{ width: 36, height: 36, borderRadius: 9999, border: 'none', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
    >
      <Gear size={16} color="var(--text-2)" />
    </button>
  );
}

// ── ExecutionTodayScreen (standalone, self-contained) ──────────
interface ExecutionTodayScreenProps {
  onRecovery: (reason: string) => void;
  onEvening: () => void;
}

export function ExecutionTodayScreen({ onRecovery, onEvening }: ExecutionTodayScreenProps) {
  const [blocks, setBlocks] = useState(
    MORNING_DATA.blocks.map((b) => ({ ...b, status: 'pending' as 'pending' | 'done' | 'failed', failReason: '' }))
  );
  const [sheet, setSheet] = useState<{ id: string; type: 'partial' | 'fail' } | null>(null);
  const [failReason, setFailReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const markDone = (id: string) => {
    setBlocks((bs) => bs.map((b) => b.id === id ? { ...b, status: 'done' } : b));
    showToast('완료! 실행 메모리 저장됨');
  };
  const done = blocks.filter((b) => b.status === 'done').length;
  const total = blocks.length;

  const submitFail = () => {
    if (!failReason || !sheet) return;
    setBlocks((bs) => bs.map((b) => b.id === sheet.id ? { ...b, status: 'failed', failReason } : b));
    setSheet(null);
    setTimeout(() => onRecovery(failReason), 300);
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ height: '100%', overflowY: 'auto', padding: '16px 18px 32px', display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--surface-ground)' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>오늘의 실행 · 5월 6일</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px' }}>오늘 할 일</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="tnum" style={{ height: 24, padding: '0 10px', background: 'var(--text-1)', color: '#FAF6EE', borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>{done}/{total} 완료</span>
            <span style={{ height: 24, padding: '0 10px', background: 'var(--brand-soft)', color: 'var(--coral-700)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>{MORNING_DATA.goalName}</span>
          </div>
        </div>

        <div style={{ height: 8, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--brand)', borderRadius: 9999, width: `${total > 0 ? (done / total) * 100 : 0}%`, transition: 'width 0.5s' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocks.map((b) => {
            const isDone = b.status === 'done';
            const isFailed = b.status === 'failed';
            return (
              <div key={b.id} style={{ background: isDone ? '#E5EFE3' : isFailed ? '#FAE2D8' : 'var(--surface-raised)', border: `1px solid ${isDone ? '#b4dfc8' : isFailed ? 'var(--coral-200)' : 'var(--sand-200)'}`, borderRadius: 16, padding: '12px 14px', opacity: isDone ? 0.75 : 1, transition: 'all 240ms' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ paddingTop: 2, flexShrink: 0 }}>
                    {isDone ? (
                      <div style={{ width: 28, height: 28, borderRadius: 9999, background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={14} color="#FFFCF6" weight="bold" />
                      </div>
                    ) : isFailed ? (
                      <div style={{ width: 28, height: 28, borderRadius: 9999, background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={14} color="#FFFCF6" />
                      </div>
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 9999, border: '1.5px solid var(--sand-300)', background: 'var(--surface-raised)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--success)' : isFailed ? 'var(--danger)' : 'var(--text-1)' }}>{b.title}</div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                      {b.carryover && <span style={{ height: 20, padding: '0 7px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 9999, fontSize: 9, color: 'var(--warning)', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>↩ 이월</span>}
                      <span className="tnum" style={{ height: 20, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 9, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.time}</span>
                      <span style={{ height: 20, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 9, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.dur}</span>
                    </div>
                    {b.failReason && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 5 }}>이유: {b.failReason}</div>}
                  </div>
                </div>
                {!isDone && !isFailed && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button onClick={() => markDone(b.id)} style={{ flex: 2, height: 36, borderRadius: 10, border: 'none', background: 'var(--success)', color: '#FFFCF6', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Check size={13} /> 완료
                    </button>
                    <button onClick={() => setSheet({ id: b.id, type: 'partial' })} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>◑</button>
                    <button onClick={() => { setSheet({ id: b.id, type: 'fail' }); setFailReason(''); }} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid var(--coral-200)', background: '#FAE2D8', color: 'var(--danger)', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>✗</button>
                  </div>
                )}
                {isFailed && (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => onRecovery(b.failReason)} style={{ width: '100%', height: 36, borderRadius: 10, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>복구 제안 보기 →</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {done === total && total > 0 && (
          <div style={{ background: '#E5EFE3', border: '1px solid #b4dfc8', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>오늘 모두 완료했어요</div>
            <button onClick={onEvening} style={{ width: '100%', height: 40, borderRadius: 10, border: 'none', background: 'var(--success)', color: '#FFFCF6', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>저녁 체크인 하기 →</button>
          </div>
        )}

        <div style={{ padding: '10px 12px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12, display: 'flex', gap: 8 }}>
          <Sparkle size={14} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.55 }}>실행 결과는 <b>실행 기록</b>에 저장되어 내일과 다음 주 계획 보정에 쓰입니다.</span>
        </div>
      </div>

      {sheet?.type === 'fail' && (
        <div onClick={() => setSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 40, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '22px 22px 0 0', padding: '10px 18px 44px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4, color: 'var(--text-1)' }}>왜 못 했나요?</div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>이유를 기록하면 더 잘 맞는 복구안을 제안해드려요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {FAIL_REASONS.map((r) => (
                <button key={r} onClick={() => setFailReason(r)} style={{ padding: '12px 14px', borderRadius: 12, textAlign: 'left', background: failReason === r ? 'var(--text-1)' : 'var(--surface-raised)', color: failReason === r ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${failReason === r ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms' }}>{r}</button>
              ))}
            </div>
            <button onClick={submitFail} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: '#FAF6EE', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', opacity: failReason ? 1 : 0.35 }}>기록하고 복구안 보기</button>
          </div>
        </div>
      )}

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

interface MergedTodayScreenProps {
  tasks: Task[];
  onOpen: (id: string) => void;
  onMarkDone: (id: string) => void;
  onPartial: (id: string, pct: number) => void;
  onFail: (id: string, reason: string) => void;
  onOpenRecovery: () => void;
  onEvening: () => void;
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

// "5월 24일 · 일요일" — Today 헤더용
function todayShortKo(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 · ${days[d.getDay()]}요일`;
}

export function MergedTodayScreen({ tasks, onOpen, onMarkDone, onPartial, onFail, onOpenRecovery, onEvening }: MergedTodayScreenProps) {
  const { user } = useNavigation();
  const userName = user?.name ?? '친구';

  // mock-and-replace: /today/agenda 가 현재 백엔드에서 501. 채워지면 응답을
  // tasks 로 매핑할 자리. 실패는 조용히 — 더미 흐름을 끊지 않는다.
  useEffect(() => {
    let cancelled = false;
    todayApi.agenda().then(
      (agenda) => {
        if (cancelled) return;
        // TODO(backend-#19): agenda.actions → Task[] 매핑 + setTasks 갱신
        void agenda;
      },
      () => { /* 501/네트워크 — 더미 그대로 */ },
    );
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
  const [toast, setToast] = useState<string | null>(null);
  // 백엔드 /habits + /habit-instances 동기. 더미 fallback (백엔드 미동작 시).
  const [habits, setHabits] = useState<Habit[]>([
    { id: 'h1', instanceId: null, name: '피트니스 센터 헬스장 가기', targetDays: 3, doneDays: 2 },
    { id: 'h2', instanceId: null, name: '마음 챙김 명상', targetDays: 3, doneDays: 0 },
  ]);
  const [addingHabit, setAddingHabit] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([habitsApi.list(), habitsApi.instancesForWeek(thisMonday())])
      .then(([apiHabits, instances]) => {
        if (cancelled || apiHabits.length === 0) return;
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
      .catch(() => { /* 백엔드 미동작 — 더미 그대로 */ });
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
    onFail(failSheet, failReason);
    setFailSheet(null);
    setFailReason('');
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
                <span className="tnum" style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 9999, background: 'var(--brand)', color: '#FFFCF6', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{partialTasks.length}</span>
              </button>
            )}
            <GoalsButton />
            <SettingsButton />
          </div>
        </div>

        {/* Hero — 지금 할 일. row 에서 promote 한 카드 또는 진행 중 카드. */}
        <HeroTaskCard
          task={heroTask}
          done={doneTasks.length}
          total={tasks.length}
          onComplete={() => heroTask && (onMarkDone(heroTask.id), showToast('완료!'))}
          onPartial={() => heroTask && setPartialSheet(heroTask.id)}
          onFail={() => heroTask && (setFailSheet(heroTask.id), setFailReason(''))}
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
              {FAIL_REASONS.map((r) => (
                <button key={r} onClick={() => setFailReason(r)} style={{ padding: '12px 14px', borderRadius: 12, textAlign: 'left', background: failReason === r ? 'var(--text-1)' : 'var(--surface-raised)', color: failReason === r ? '#FAF6EE' : 'var(--text-1)', border: `1px solid ${failReason === r ? 'var(--text-1)' : 'var(--sand-200)'}`, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 160ms' }}>{r}</button>
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
            <span style={{ height: 18, padding: '0 6px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 9999, fontSize: 10, color: 'var(--warning)', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>↩ 이월</span>
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
