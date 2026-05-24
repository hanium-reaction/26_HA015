import { useEffect, useState } from 'react';
import { Moon, ForkKnife, Pause, Sun, ArrowRight, Bell, Sparkle, ShieldCheck } from '@phosphor-icons/react';
import type { IconProps } from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import { ApiError, notificationsApi, timePoliciesApi } from '../lib/api';
import type { NotificationSettings, TimePolicy } from '../types/api';
import { SetupProgress } from './CalendarScheduleScreen';

interface PoliciesNotificationsScreenProps {
  onDone: () => void;
}

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
    const start = String(p.payload?.startTime ?? '');
    const end = String(p.payload?.endTime ?? '');
    return start && end ? `${start} – ${end}` : '시간 미설정';
  }
  if (p.policyType === 'break_min') {
    const min = p.payload?.minMinutes;
    return typeof min === 'number' ? `최소 ${min}분` : '최소 시간 미설정';
  }
  return JSON.stringify(p.payload);
}

const MORNING_OPTIONS = ['07:00', '07:30', '08:00', '08:30', '09:00'];
const EVENING_OPTIONS = ['20:00', '21:00', '21:30', '22:00', '22:30'];

// S07 (시간 정책 confirm) + S08 (알림 시간) 통합 화면.
// 인터뷰에서 추론한 값을 "AI가 이렇게 잡아봤어요" 톤으로 보여주고 한 번에 confirm.
export function PoliciesNotificationsScreen({ onDone }: PoliciesNotificationsScreenProps) {
  const [policies, setPolicies] = useState<TimePolicy[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([timePoliciesApi.list(), notificationsApi.getSettings()])
      .then(([ps, ns]) => {
        if (cancelled) return;
        setPolicies(ps);
        setSettings(ns);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '설정을 불러오지 못했어요.';
        setError(msg);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const patch = (partial: Partial<NotificationSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
  };

  const saveAndContinue = async () => {
    if (!settings) {
      sessionStorage.setItem('reaction.justOnboarded', '1');
      onDone();
      return;
    }
    setIsSaving(true);
    try {
      await notificationsApi.updateSettings({
        morningBriefTime: settings.morningBriefTime,
        eveningReflectionTime: settings.eveningReflectionTime,
        preCardEnabled: settings.preCardEnabled,
      });
      sessionStorage.setItem('reaction.justOnboarded', '1');
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '저장하지 못했어요.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // 답 콜백 — 인터뷰의 time.peak_window/recovery.tone 답을 직접 가져올 수 있게 되면 동적으로.
  // 현재는 mock 의 policy(수면 23-07)에서 심야형으로 짧게 인용.
  const sleepPolicy = policies.find((p) => p.policyType === 'sleep');
  const sleepWindow = sleepPolicy ? summarize(sleepPolicy) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <SetupProgress current={5} total={5} label="확인" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>
          이렇게 잡아봤어요.<br />맞나요?
        </h1>
        {sleepWindow && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14, padding: '8px 10px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 10 }}>
            <Sparkle size={12} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5 }}>
              인터뷰 답에서 <b>수면 {sleepWindow}</b> 로 잡고, 그 사이엔 알림도 자동으로 꺼둘게요.
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* 시간 정책 카드 */}
        <SectionTitle>지킬 시간</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {isLoading && <SkeletonRow />}
          {!isLoading && policies.length === 0 && (
            <div style={{ padding: '14px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', borderRadius: 12 }}>
              활성 시간 정책이 없어요.
            </div>
          )}
          {policies.map((p) => {
            const meta = TYPE_META[p.policyType] ?? TYPE_META.custom;
            const Icon = meta.Icon;
            return (
              <div
                key={p.policyId}
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} weight="fill" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{meta.label}</div>
                  <div className="tnum" style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{summarize(p)}</div>
                </div>
                <span style={{ height: 18, padding: '0 7px', borderRadius: 9999, background: p.isActive ? 'var(--brand-soft)' : 'var(--sand-100)', border: `1px solid ${p.isActive ? 'var(--coral-200)' : 'var(--sand-200)'}`, fontSize: 9, fontWeight: 700, color: p.isActive ? 'var(--coral-700)' : 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>
                  {p.isActive ? 'ON' : 'OFF'}
                </span>
              </div>
            );
          })}
        </div>

        {/* 알림 */}
        <SectionTitle>알림 시간</SectionTitle>
        {!isLoading && settings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 12 }}>
            <TimeChips
              icon={<Sun size={14} weight="fill" />}
              title="모닝 브리프"
              options={MORNING_OPTIONS}
              value={settings.morningBriefTime}
              onChange={(t) => patch({ morningBriefTime: t })}
            />
            <TimeChips
              icon={<Moon size={14} weight="fill" />}
              title="저녁 회고"
              options={EVENING_OPTIONS}
              value={settings.eveningReflectionTime}
              onChange={(t) => patch({ eveningReflectionTime: t })}
            />
            <button
              onClick={() => patch({ preCardEnabled: !settings.preCardEnabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'var(--surface-raised)', border: `1px solid ${settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-200)'}`, borderRadius: 12, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-100)', color: settings.preCardEnabled ? '#FFFCF6' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={14} weight="fill" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)' }}>다음 카드 사전 알림</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>블록 5분 전 부드러운 리마인드</div>
              </div>
              <div style={{ width: 32, height: 18, borderRadius: 9999, background: settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-300)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: settings.preCardEnabled ? 16 : 2, width: 14, height: 14, borderRadius: 9999, background: '#fff', transition: 'left 160ms' }} />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className="tnum"
              style={{ height: 28, padding: '0 10px', borderRadius: 9999, border: `1px solid ${active ? 'var(--brand)' : 'var(--sand-200)'}`, background: active ? 'var(--brand)' : 'var(--surface-ground)', color: active ? '#FFFCF6' : 'var(--text-2)', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: 10, opacity: 0.5, height: 56 }} />
  );
}
