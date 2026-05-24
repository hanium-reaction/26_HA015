import { useEffect, useState } from 'react';
import { Plus, Trash, ArrowRight } from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import { ApiError, fixedSchedulesApi } from '../lib/api';
import type { DayOfWeek, FixedSchedule } from '../types/api';
import { OnboardingProgress } from './CalendarChoiceScreen';

interface ManualScheduleScreenProps {
  onNext: () => void;
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
};
const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function ManualScheduleScreen({ onNext }: ManualScheduleScreenProps) {
  const [schedules, setSchedules] = useState<FixedSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // 새 항목 폼 상태
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDays, setDraftDays] = useState<Set<DayOfWeek>>(new Set());
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd, setDraftEnd] = useState('10:30');

  useEffect(() => {
    let cancelled = false;
    fixedSchedulesApi
      .list()
      .then((res) => { if (!cancelled) setSchedules(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '고정 일정을 불러오지 못했어요.';
        setError(msg);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggleDay = (d: DayOfWeek) => {
    setDraftDays((s) => {
      const next = new Set(s);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const addSchedule = async () => {
    if (!draftTitle.trim() || draftDays.size === 0) return;
    try {
      const created = await fixedSchedulesApi.create({
        title: draftTitle.trim(),
        daysOfWeek: Array.from(draftDays),
        startTime: draftStart,
        endTime: draftEnd,
      });
      setSchedules((s) => [...s, created]);
      setShowForm(false);
      setDraftTitle('');
      setDraftDays(new Set());
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '추가하지 못했어요.';
      setError(msg);
    }
  };

  const removeSchedule = async (id: string) => {
    try {
      await fixedSchedulesApi.remove(id);
      setSchedules((s) => s.filter((x) => x.scheduleId !== id));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '삭제하지 못했어요.';
      setError(msg);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <OnboardingProgress current={2} total={4} label="고정 일정" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>
          매주 비워야 할<br />시간 있어요?
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
          수업·알바·정기 약속처럼 매주 반복되는 일정만 적어주세요. 나중에 더 추가할 수 있어요.
        </p>

        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {isLoading && <SkeletonRow />}
          {!isLoading && schedules.length === 0 && !showForm && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              아직 고정 일정이 없어요.
            </div>
          )}
          {schedules.map((s) => (
            <div
              key={s.scheduleId}
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 4 }}>{s.title}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ height: 20, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
                    {DAY_ORDER.filter((d) => s.daysOfWeek.includes(d)).map((d) => DAY_LABEL[d]).join('·')}
                  </span>
                  <span className="tnum" style={{ height: 20, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
                    {s.startTime}–{s.endTime}
                  </span>
                </div>
              </div>
              <button
                onClick={() => removeSchedule(s.scheduleId)}
                style={{ width: 32, height: 32, borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-label="삭제"
              >
                <Trash size={16} />
              </button>
            </div>
          ))}

          {showForm && (
            <div style={{ background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="예: 알고리즘 수업"
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {DAY_ORDER.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    style={{ flex: 1, height: 34, borderRadius: 9999, border: `1px solid ${draftDays.has(d) ? 'var(--brand)' : 'var(--sand-200)'}`, background: draftDays.has(d) ? 'var(--brand)' : 'var(--surface-raised)', color: draftDays.has(d) ? '#FFFCF6' : 'var(--text-2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {DAY_LABEL[d]}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                  placeholder="09:00"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                />
                <span style={{ color: 'var(--text-3)' }}>–</span>
                <input
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  placeholder="10:30"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ReButton variant="ghost" size="md" onClick={() => setShowForm(false)}>취소</ReButton>
                <div style={{ flex: 1 }}>
                  <ReButton variant="primary" size="md" full onClick={addSchedule} disabled={!draftTitle.trim() || draftDays.size === 0}>추가</ReButton>
                </div>
              </div>
            </div>
          )}

          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', height: 44, borderRadius: 12, border: '1.5px dashed var(--sand-300)', background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Plus size={16} /> 새 고정 일정
            </button>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <ReButton variant="primary" size="lg" full onClick={onNext}>
          <>다음 <ArrowRight size={16} /></>
        </ReButton>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, opacity: 0.5 }}>
      <div style={{ height: 14, background: 'var(--sand-200)', borderRadius: 6, marginBottom: 6, width: '40%' }} />
      <div style={{ height: 10, background: 'var(--sand-200)', borderRadius: 6, width: '30%' }} />
    </div>
  );
}
