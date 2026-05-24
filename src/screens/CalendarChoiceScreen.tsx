import { useState } from 'react';
import { Calendar, ArrowRight, Plus, CheckCircle } from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import { ApiError, calendarApi } from '../lib/api';

interface CalendarChoiceScreenProps {
  // 캘린더 연결을 마치고 캘린더 기반 흐름으로 갈 때 호출 (mock 환경에선 우선 manual 과 동일).
  onConnected: () => void;
  // 캘린더 없이 수동 입력으로 가는 분기.
  onManual: () => void;
}

export function CalendarChoiceScreen({ onConnected, onManual }: CalendarChoiceScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const tryConnect = async () => {
    // 실제 Google OAuth code 교환은 #16 (백엔드)에서 구현될 예정. mock 도 422 응답을 줄 가능성이 있어
    // 일단 "수동으로 시작" 경로를 우선 권장한다 (이슈 #17 가이드와 동일).
    setError(null);
    setIsConnecting(true);
    try {
      await calendarApi.connect('demo-mock-code');
      onConnected();
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `[${err.code}] ${err.message}`
          : '캘린더 연결을 처리할 수 없어요.';
      setError(`${msg} — 수동 입력으로 진행해주세요.`);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <OnboardingProgress current={1} total={4} label="캘린더" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>
          캘린더,<br />어떻게 연결할까요?
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
          이미 쓰는 캘린더가 있다면 연결하면 더 정확해요. 없어도 괜찮아요.
        </p>

        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
          <button
            onClick={tryConnect}
            disabled={isConnecting}
            style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--surface-raised)', border: '1.5px solid var(--sand-200)', borderRadius: 14, padding: '14px 16px', cursor: isConnecting ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: isConnecting ? 0.6 : 1 }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={22} weight="fill" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Google 캘린더 연결
                <span style={{ height: 16, padding: '0 6px', borderRadius: 9999, background: 'var(--sand-200)', fontSize: 9, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>BETA</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>freebusy 로 빈 시간만 자동 추출</div>
            </div>
            <ArrowRight size={16} color="var(--text-3)" />
          </button>

          <button
            onClick={onManual}
            style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--brand-soft)', border: '1.5px solid var(--brand)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--brand)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={22} weight="bold" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>수동으로 시작하기</div>
              <div style={{ fontSize: 11, color: 'var(--coral-700)', marginTop: 2 }}>고정 일정 몇 개만 입력하면 끝</div>
            </div>
            <CheckCircle size={18} color="var(--brand)" weight="fill" />
          </button>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <ReButton variant="ghost" size="lg" full onClick={onManual}>나중에 — 일단 수동으로</ReButton>
      </div>
    </div>
  );
}

// 4-step onboarding progress bar (S04/S05/S07/S08 공통).
export function OnboardingProgress({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
      <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{current} / {total}</span>
      <div style={{ flex: 1, height: 3, background: 'var(--sand-200)', borderRadius: 9999, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${(current / total) * 100}%`, background: 'var(--brand)', borderRadius: 9999 }} />
      </div>
      <span>{label}</span>
    </div>
  );
}
