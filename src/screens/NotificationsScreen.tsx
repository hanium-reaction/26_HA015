import { useEffect, useState } from 'react';
import { Sun, Moon, ArrowRight, Bell } from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import { ApiError, notificationsApi } from '../lib/api';
import type { NotificationSettings } from '../types/api';
import { OnboardingProgress } from './CalendarChoiceScreen';

interface NotificationsScreenProps {
  onDone: () => void;
}

// 06~10시 (모닝), 19~23시 (저녁) 칩 옵션 — api-contract §15 가드 범위.
const MORNING_OPTIONS = ['06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30'];
const EVENING_OPTIONS = ['19:00', '20:00', '21:00', '21:30', '22:00', '22:30'];

export function NotificationsScreen({ onDone }: NotificationsScreenProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    notificationsApi
      .getSettings()
      .then((res) => { if (!cancelled) setSettings(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '알림 설정을 불러오지 못했어요.';
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
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '저장하지 못했어요.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <OnboardingProgress current={4} total={4} label="알림" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>
          언제 알려드릴까요?
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
          주 3건 이하로만 발송해요. 23–07시는 자동으로 차단돼요.
        </p>

        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {isLoading && <Skeleton />}

        {!isLoading && settings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 12 }}>
            <Section
              icon={<Sun size={18} weight="fill" />}
              title="모닝 브리프"
              sub="아침에 오늘의 핵심을 짧게 알려드려요"
              options={MORNING_OPTIONS}
              value={settings.morningBriefTime}
              onChange={(t) => patch({ morningBriefTime: t })}
            />
            <Section
              icon={<Moon size={18} weight="fill" />}
              title="저녁 회고"
              sub="자기 전에 오늘 못한 카드만 빠르게 정리해요"
              options={EVENING_OPTIONS}
              value={settings.eveningReflectionTime}
              onChange={(t) => patch({ eveningReflectionTime: t })}
            />

            <button
              onClick={() => patch({ preCardEnabled: !settings.preCardEnabled })}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--surface-raised)', border: `1.5px solid ${settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-200)'}`, borderRadius: 14, padding: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-100)', color: settings.preCardEnabled ? '#FFFCF6' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={18} weight="fill" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>다음 카드 사전 알림</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>블록 시작 5분 전 부드러운 리마인드</div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 9999, background: settings.preCardEnabled ? 'var(--brand)' : 'var(--sand-300)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: settings.preCardEnabled ? 18 : 2, width: 16, height: 16, borderRadius: 9999, background: '#fff', transition: 'left 160ms' }} />
              </div>
            </button>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <ReButton variant="primary" size="lg" full onClick={saveAndContinue} disabled={isLoading || isSaving}>
          <>{isSaving ? '저장 중…' : '다음'} <ArrowRight size={16} /></>
        </ReButton>
      </div>
    </div>
  );
}

function Section({ icon, title, sub, options, value, onChange }: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className="tnum"
              style={{ height: 32, padding: '0 12px', borderRadius: 9999, border: `1.5px solid ${active ? 'var(--brand)' : 'var(--sand-200)'}`, background: active ? 'var(--brand)' : 'var(--surface-ground)', color: active ? '#FFFCF6' : 'var(--text-2)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, height: 90 }} />
      ))}
    </div>
  );
}
