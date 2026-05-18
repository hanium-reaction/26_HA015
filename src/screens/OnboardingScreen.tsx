import React, { useState } from 'react';
import {
  ArrowsIn,
  Cloud,
  ArrowsClockwise,
  ArrowRight,
  CheckCircle,
} from '@phosphor-icons/react';
import { ReButton } from '../components/ReButton';
import type { CopingStyle } from '../types';

interface OnboardingScreenProps {
  onNext: () => void;
}

const options: { id: CopingStyle; label: string; sub: string; Icon: React.ElementType }[] = [
  { id: 'smaller', label: '작게 다시',     sub: '실패하면 더 작게 쪼개서 시도해요', Icon: ArrowsIn },
  { id: 'rest',    label: '잠깐 휴식',     sub: '5–15분 쉬고 다시 시작해요',        Icon: Cloud },
  { id: 'retry',   label: '같은 크기로 다시', sub: '한 번 더 같은 분량을 시도해요', Icon: ArrowsClockwise },
  { id: 'skip',    label: '내일 이월',      sub: '오늘은 비워두고 다음 날로 넘겨요', Icon: ArrowRight },
];

export function OnboardingScreen({ onNext }: OnboardingScreenProps) {
  const [selected, setSelected] = useState<CopingStyle>('smaller');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <span style={{ color: 'var(--brand)', fontWeight: 700 }}>4 / 4</span>
          <div style={{ flex: 1, height: 3, background: 'var(--sand-200)', borderRadius: 9999, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: '100%', background: 'var(--brand)', borderRadius: 9999 }} />
          </div>
          <span>코핑 스타일</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 6 }}>흔들릴 때,<br />어떤 식이 좋아요?</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>회복 카드는 이 스타일에 맞춰 제안돼요. 언제든 바꿀 수 있어요.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: selected === o.id ? 'var(--brand-soft)' : 'var(--surface-raised)', border: `1.5px solid ${selected === o.id ? 'var(--brand)' : 'var(--sand-200)'}`, borderRadius: 14, padding: '11px 14px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: selected === o.id ? 'var(--brand)' : 'var(--sand-100)', color: selected === o.id ? '#FFFCF6' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <o.Icon size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{o.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{o.sub}</div>
              </div>
              {selected === o.id && <CheckCircle size={20} color="var(--brand)" weight="fill" />}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <ReButton variant="primary" size="lg" full onClick={onNext}>다음</ReButton>
      </div>
    </div>
  );
}
