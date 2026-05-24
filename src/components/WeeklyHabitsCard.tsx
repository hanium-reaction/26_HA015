import { useEffect, useState } from 'react';
import { CheckCircle, Plus } from '@phosphor-icons/react';
import { ApiError, habitsApi } from '../lib/api';
import type { Habit, HabitInstance } from '../types/api';

// 이번 주 월요일을 YYYY-MM-DD 로. KST 기준이지만 정확한 timezone 처리는 dayjs 도입 후로.
function getThisMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=일, 1=월, ...
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

// Today 화면에서 자리 차지를 작게 두면서 "이번 주 습관 진척"만 보여주는 카드.
// 일별 체크리스트는 TodayScreen 자체의 habits 섹션이 따로 담당.
export function WeeklyHabitsCard() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [instances, setInstances] = useState<HabitInstance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([habitsApi.list(), habitsApi.instancesForWeek(getThisMonday())])
      .then(([hs, ins]) => {
        if (cancelled) return;
        setHabits(hs);
        setInstances(ins);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : null;
        // 백엔드 미동작은 카드 자체를 숨김 — 다른 데모 흐름을 막지 않음.
        setError(msg);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleCheck = async (instanceId: string) => {
    try {
      const next = await habitsApi.check(instanceId);
      setInstances((s) => s.map((x) => (x.instanceId === instanceId ? next : x)));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '체크 실패';
      setError(msg);
    }
  };

  if (error || (!isLoading && habits.length === 0)) {
    // 백엔드 미동작이거나 빈 응답이면 카드 자체를 보여주지 않는다.
    return null;
  }

  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 16, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          이번 주 습관
        </div>
        <div className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {instances.reduce((sum, i) => sum + i.doneCount, 0)} / {instances.reduce((sum, i) => sum + i.targetCount, 0)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading && <SkeletonRow />}
        {habits.map((h) => {
          const inst = instances.find((i) => i.habitId === h.habitId);
          const done = inst?.doneCount ?? 0;
          const target = inst?.targetCount ?? h.frequencyPerWeek;
          const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0;
          const isFull = target > 0 && done >= target;
          return (
            <div
              key={h.habitId}
              style={{ display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <button
                onClick={() => inst && !isFull && handleCheck(inst.instanceId)}
                disabled={!inst || isFull}
                style={{
                  width: 28, height: 28, flexShrink: 0,
                  borderRadius: 9999,
                  border: `1.5px solid ${isFull ? 'var(--success)' : 'var(--sand-300)'}`,
                  background: isFull ? 'var(--success)' : 'transparent',
                  color: '#FFFCF6',
                  cursor: inst && !isFull ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="1회 달성"
              >
                {isFull ? <CheckCircle size={16} weight="fill" /> : <Plus size={14} weight="bold" color="var(--text-3)" />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{h.title}</div>
                <div style={{ height: 4, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: isFull ? 'var(--success)' : 'var(--brand)', borderRadius: 9999, transition: 'width 0.4s ease' }} />
                </div>
              </div>
              <div className="tnum" style={{ fontSize: 11, fontWeight: 700, color: isFull ? 'var(--success)' : 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                {done}/{target}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <div style={{ height: 28, background: 'var(--sand-100)', borderRadius: 8, opacity: 0.5 }} />;
}
