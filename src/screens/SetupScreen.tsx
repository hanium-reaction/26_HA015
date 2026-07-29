import { useEffect, useState } from 'react';
import {
  Calendar, Plus, Trash, ArrowRight,
  Moon, ForkKnife, Pause, Sun, Bell, Sparkle, ShieldCheck,
} from '@phosphor-icons/react';
import type { IconProps } from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import {
  friendlyError, fixedSchedulesApi, notificationsApi, timePoliciesApi,
} from '../lib/api';
import type {
  DayOfWeek, FixedSchedule, NotificationSettings, TimePolicy,
} from '../types/api';
import { SetupProgress } from '../components/SetupProgress';
import { useToast } from '../contexts/ToastContext';
import { ErrorBanner } from '../components/ErrorBanner';

interface SetupScreenProps {
  onDone: () => void;
}

const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일',
};
const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const TYPE_META: Record<string, { label: string; Icon: React.ComponentType<IconProps> }> = {
  sleep: { label: '수면', Icon: Moon },
  lunch: { label: '점심', Icon: ForkKnife },
  break_min: { label: '쉬는 시간', Icon: Pause },
  no_touch: { label: '금지 시간', Icon: ShieldCheck },
  late_night_block: { label: '심야 차단', Icon: Moon },
  custom: { label: '기타', Icon: Sparkle },
};

function summarize(p: TimePolicy): string {
  if (p.policyType === 'sleep' || p.policyType === 'lunch' || p.policyType === 'no_touch' || p.policyType === 'late_night_block') {
    const s = String(p.payload?.startTime ?? '');
    const e = String(p.payload?.endTime ?? '');
    return s && e ? `${s} – ${e}` : '시간 미설정';
  }
  if (p.policyType === 'break_min') {
    const m = p.payload?.minMinutes;
    return typeof m === 'number' ? `최소 ${m}분` : '최소 시간 미설정';
  }
  return JSON.stringify(p.payload);
}

const MORNING_OPTIONS = ['07:00', '07:30', '08:00', '08:30', '09:00'];
const EVENING_OPTIONS = ['20:00', '21:00', '21:30', '22:00', '22:30'];

// S04+S05+S07+S08 통합. 일정·시간정책·알림 세 도메인이 모두
// "AI 가 인터뷰 답에서 추론한 값 → 사용자 confirm" 패턴이라 한 화면으로 묶음.
// onboarding 7단계 → 5단계로 단축.
export function SetupScreen({ onDone }: SetupScreenProps) {
  const toast = useToast();
  const [schedules, setSchedules] = useState<FixedSchedule[]>([]);
  const [policies, setPolicies] = useState<TimePolicy[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새 일정 폼
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDays, setDraftDays] = useState<Set<DayOfWeek>>(new Set());
  const [draftStart, setDraftStart] = useState('09:00');
  const [draftEnd, setDraftEnd] = useState('10:30');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fixedSchedulesApi.list(),
      timePoliciesApi.list(),
      notificationsApi.getSettings(),
    ])
      .then(([fs, ps, ns]) => {
        if (cancelled) return;
        setSchedules(fs);
        setPolicies(ps);
        setSettings(ns);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = friendlyError(err, '설정을 불러오지 못했어요.');
        setError(msg);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Google 캘린더 자동 연동은 백엔드 OAuth 가 아직 준비 중(베타)이라,
  // 가짜 'demo-mock-code' 로 연결된 척하지 않는다. 대신 솔직하게 안내하고
  // 직접 입력 경로로 유도한다.
  const notifyCalendarPending = () => {
    toast.info('캘린더 자동 연동은 준비 중이에요. 아래에서 직접 추가해 주세요.');
  };

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
      toast.success('일정을 추가했어요');
      setShowForm(false);
      setDraftTitle('');
      setDraftDays(new Set());
    } catch {
      // 백엔드 미동작 — 더미라도 추가하되, 임시 저장임을 사용자에게 알린다.
      setSchedules((s) => [
        ...s,
        { scheduleId: `local-${Date.now()}`, title: draftTitle.trim(), daysOfWeek: Array.from(draftDays), startTime: draftStart, endTime: draftEnd },
      ]);
      toast.info('임시로 저장했어요 (서버 연결 후 동기화)');
      setShowForm(false);
      setDraftTitle('');
      setDraftDays(new Set());
    }
  };

  const removeSchedule = async (id: string) => {
    try { await fixedSchedulesApi.remove(id); } catch { /* ok */ }
    setSchedules((s) => s.filter((x) => x.scheduleId !== id));
  };

  // 정책 on/off — optimistic 후 PATCH /time-policies/{id}. 실패 시 롤백.
  const togglePolicy = async (policyId: string, next: boolean) => {
    setPolicies((ps) => ps.map((p) => (p.policyId === policyId ? { ...p, isActive: next } : p)));
    try {
      await timePoliciesApi.update(policyId, { isActive: next });
    } catch {
      setPolicies((ps) => ps.map((p) => (p.policyId === policyId ? { ...p, isActive: !next } : p)));
    }
  };

  const patchSettings = (partial: Partial<NotificationSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
  };

  const markOnboardingDone = () => {
    if (typeof window === 'undefined') return;
    // #120: 진입 라우팅은 계정 onboarding_state 로 결정 — 로컬 onboardingDone 플래그는 폐기.
    // MorningBrief 의 "방금 온보딩 완료" 안내용 세션 플래그만 남긴다.
    sessionStorage.setItem('reaction.justOnboarded', '1');
  };

  const saveAndContinue = async () => {
    setIsSaving(true);
    try {
      if (settings) {
        await notificationsApi.updateSettings({
          morningBriefTime: settings.morningBriefTime,
          eveningReflectionTime: settings.eveningReflectionTime,
          preCardEnabled: settings.preCardEnabled,
        });
      }
    } catch {
      // 백엔드 미동작 — 온보딩 흐름은 끊지 않되 알림 저장은 다음에 동기화됨을 알린다.
      toast.info('알림 설정은 서버 연결 후 반영돼요');
    }
    markOnboardingDone();
    onDone();
  };

  const sleepPolicy = policies.find((p) => p.policyType === 'sleep');
  const sleepWindow = sleepPolicy ? summarize(sleepPolicy) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <SetupProgress current={3} total={4} label="마무리" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>
          마지막 확인이에요
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
          AI 가 인터뷰 답에서 일정·시간·알림을 미리 잡아뒀어요. 맞으면 그대로 다음으로.
        </p>

        {sleepWindow && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14, padding: '8px 10px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 10 }}>
            <Sparkle size={12} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5 }}>
              인터뷰 답에서 <b>수면 {sleepWindow}</b> 로 잡고, 그 사이엔 알림도 자동으로 꺼둘게요.
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 12 }}>
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        )}

        {/* 1. 캘린더 + 고정 일정 */}
        <SectionTitle>일정</SectionTitle>
        <button
          onClick={notifyCalendarPending}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginBottom: 8, opacity: 0.85 }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--sand-100)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Calendar size={12} weight="fill" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Google 캘린더 자동 가져오기
              <span style={{ height: 'var(--ctrl-xs)', padding: '0 5px', borderRadius: 9999, background: 'var(--sand-200)', fontSize: 8, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>준비 중</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>지금은 아래에서 직접 추가해 주세요</div>
          </div>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {isLoading && <SkeletonRow />}
          {schedules.map((s) => (
            <div key={s.scheduleId} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{s.title}</div>
                <div className="tnum" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {DAY_ORDER.filter((d) => s.daysOfWeek.includes(d)).map((d) => DAY_LABEL[d]).join('·')} · {s.startTime}–{s.endTime}
                </div>
              </div>
              <button onClick={() => removeSchedule(s.scheduleId)} aria-label="삭제" style={{ width: 28, height: 28, borderRadius: 9999, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash size={14} />
              </button>
            </div>
          ))}
          {showForm ? (
            <div style={{ background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="예: 헬스장" style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 3 }}>
                {DAY_ORDER.map((d) => (
                  <button key={d} onClick={() => toggleDay(d)} style={{ flex: 1, height: 30, borderRadius: 9999, border: `1px solid ${draftDays.has(d) ? 'var(--brand)' : 'var(--sand-200)'}`, background: draftDays.has(d) ? 'var(--brand)' : 'var(--surface-raised)', color: draftDays.has(d) ? '#FFFCF6' : 'var(--text-2)', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{DAY_LABEL[d]}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input value={draftStart} onChange={(e) => setDraftStart(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>–</span>
                <input value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <ReButton variant="ghost" size="sm" onClick={() => setShowForm(false)}>취소</ReButton>
                <div style={{ flex: 1 }}>
                  <ReButton variant="primary" size="sm" full onClick={addSchedule} disabled={!draftTitle.trim() || draftDays.size === 0}>추가</ReButton>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', height: 34, borderRadius: 10, border: '1.5px dashed var(--sand-300)', background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={12} /> 더 추가
            </button>
          )}
        </div>

        {/* 2. 시간 정책 */}
        <SectionTitle>지킬 시간</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {isLoading && <SkeletonRow />}
          {policies.map((p) => {
            const meta = TYPE_META[p.policyType] ?? TYPE_META.custom;
            const Icon = meta.Icon;
            return (
              <div key={p.policyId} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: p.isActive ? 1 : 0.55 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={14} weight="fill" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)' }}>{meta.label}</div>
                  <div className="tnum" style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{summarize(p)}</div>
                </div>
                {/* 정책 on/off — PATCH /time-policies/{id} 실배선. */}
                <button
                  onClick={() => togglePolicy(p.policyId, !p.isActive)}
                  aria-label={`${meta.label} ${p.isActive ? '끄기' : '켜기'}`}
                  style={{ width: 30, height: 18, borderRadius: 9999, background: p.isActive ? 'var(--brand)' : 'var(--sand-300)', position: 'relative', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <span style={{ position: 'absolute', top: 2, left: p.isActive ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: '#fff', transition: 'left 160ms' }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* 3. 알림 */}
        <SectionTitle>알림</SectionTitle>
        {!isLoading && settings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
            <TimeChips icon={<Sun size={12} weight="fill" />} title="모닝 브리프" options={MORNING_OPTIONS} value={settings.morningBriefTime} onChange={(t) => patchSettings({ morningBriefTime: t })} />
            <TimeChips icon={<Moon size={12} weight="fill" />} title="저녁 회고" options={EVENING_OPTIONS} value={settings.eveningReflectionTime} onChange={(t) => patchSettings({ eveningReflectionTime: t })} />
            <button onClick={() => patchSettings({ preCardEnabled: !settings.preCardEnabled })} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--surface-raised)', border: `1px solid ${settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-200)'}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, background: settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-100)', color: settings.preCardEnabled ? '#FFFCF6' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={14} weight="fill" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)' }}>다음 카드 사전 알림</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>블록 5분 전 부드러운 리마인드</div>
              </div>
              <div style={{ width: 30, height: 18, borderRadius: 9999, background: settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-300)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: settings.preCardEnabled ? 14 : 2, width: 14, height: 14, borderRadius: 9999, background: '#fff', transition: 'left 160ms' }} />
              </div>
            </button>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <ReButton variant="primary" size="lg" full onClick={saveAndContinue} disabled={isLoading || isSaving}>
          <>{isSaving ? '저장 중…' : '다 좋아요'} <ArrowRight size={16} /></>
        </ReButton>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>{children}</div>
  );
}

function TimeChips({ icon, title, options, value, onChange }: {
  icon: React.ReactNode;
  title: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 22, height: 22, borderRadius: 8, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-1)' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button key={opt} onClick={() => onChange(opt)} className="tnum" style={{ height: 26, padding: '0 9px', borderRadius: 9999, border: `1px solid ${active ? 'var(--brand)' : 'var(--sand-200)'}`, background: active ? 'var(--brand)' : 'var(--surface-ground)', color: active ? '#FFFCF6' : 'var(--text-2)', fontWeight: 600, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>{opt}</button>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, height: 50, opacity: 0.5 }} />;
}
