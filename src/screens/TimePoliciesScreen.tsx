import { useEffect, useState } from 'react';
import { Moon, ForkKnife, Pause, Sparkle, ArrowRight, ShieldCheck } from '@phosphor-icons/react';
import type { IconProps } from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import { ApiError, timePoliciesApi } from '../lib/api';
import type { TimePolicy } from '../types/api';
import { OnboardingProgress } from './CalendarChoiceScreen';

interface TimePoliciesScreenProps {
  onNext: () => void;
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
  // custom 등: payload 를 JSON 으로 짧게
  return JSON.stringify(p.payload);
}

export function TimePoliciesScreen({ onNext }: TimePoliciesScreenProps) {
  const [policies, setPolicies] = useState<TimePolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    timePoliciesApi
      .list()
      .then((res) => { if (!cancelled) setPolicies(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : '시간 정책을 불러오지 못했어요.';
        setError(msg);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <OnboardingProgress current={3} total={4} label="시간 정책" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>
          이 시간들은<br />지켜드릴게요
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
          인터뷰 답변에서 추론한 시간 정책이에요. 계획 생성 시 이 구간엔 블록을 배치하지 않아요.
        </p>

        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {isLoading && (
            <>
              <SkeletonPolicy />
              <SkeletonPolicy />
            </>
          )}
          {!isLoading && policies.length === 0 && (
            <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              아직 활성 시간 정책이 없어요.
            </div>
          )}
          {policies.map((p) => {
            const meta = TYPE_META[p.policyType] ?? TYPE_META.custom;
            const Icon = meta.Icon;
            return (
              <div
                key={p.policyId}
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--sand-100)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} weight="fill" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{meta.label}</div>
                  <div className="tnum" style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{summarize(p)}</div>
                </div>
                <span style={{ height: 20, padding: '0 7px', borderRadius: 9999, background: p.isActive ? 'var(--brand-soft)' : 'var(--sand-100)', border: `1px solid ${p.isActive ? 'var(--coral-200)' : 'var(--sand-200)'}`, fontSize: 10, fontWeight: 700, color: p.isActive ? 'var(--coral-700)' : 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>
                  {p.isActive ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--brand-soft)', borderRadius: 12, border: '1px solid var(--coral-200)', display: 'flex', gap: 8 }}>
          <Sparkle size={13} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5 }}>
            바꾸고 싶으면 설정에서 언제든 수정할 수 있어요.
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <ReButton variant="primary" size="lg" full onClick={onNext} disabled={isLoading}>
          <>다음 <ArrowRight size={16} /></>
        </ReButton>
      </div>
    </div>
  );
}

function SkeletonPolicy() {
  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 14, padding: 12, display: 'flex', gap: 12, opacity: 0.5 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--sand-200)' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
        <div style={{ height: 12, background: 'var(--sand-200)', borderRadius: 6, width: '30%' }} />
        <div style={{ height: 10, background: 'var(--sand-200)', borderRadius: 6, width: '50%' }} />
      </div>
    </div>
  );
}
