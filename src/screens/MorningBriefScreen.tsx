import React, { useEffect, useState } from 'react';
import { ArrowCounterClockwise, ArrowRight, Sparkle } from '@phosphor-icons/react';
import { MORNING_DATA } from '../data';

interface MorningBriefScreenProps {
  onStart: () => void;
}

export function MorningBriefScreen({ onStart }: MorningBriefScreenProps) {
  const { date, greeting, blocks, carryMsg, goalName, weekProgress } = MORNING_DATA;

  // PoliciesNotificationsScreen 이 onDone 시 sessionStorage 에 플래그를 넣어두고
  // 여기서 한 번 읽어 환영 배너를 띄운다 (onboarding 끝의 첫 보상).
  const [justOnboarded, setJustOnboarded] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('reaction.justOnboarded') === '1') {
      setJustOnboarded(true);
      sessionStorage.removeItem('reaction.justOnboarded');
    }
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {justOnboarded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 12 }}>
            <Sparkle size={14} weight="fill" color="var(--brand)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral-700)' }}>준비 완료 — 자, 오늘 첫 카드예요</div>
              <div style={{ fontSize: 11, color: 'var(--coral-700)', opacity: 0.85, marginTop: 1 }}>아래 카드부터 가볍게 시작해봐요.</div>
            </div>
          </div>
        )}
        {/* Hero card — dark */}
        <div style={{ background: 'var(--sand-950)', borderRadius: 20, padding: '20px 18px' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', color: 'rgba(250,246,238,.4)', marginBottom: 6, textTransform: 'uppercase' }}>{date}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#FAF6EE', marginBottom: 14 }}>{greeting}</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.4)', marginBottom: 2 }}>오늘 할 일</div>
              <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#FAF6EE', letterSpacing: '-0.02em' }}>{blocks.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.4)', marginBottom: 2 }}>주간 달성</div>
              <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: '#FAF6EE', letterSpacing: '-0.02em' }}>{weekProgress}%</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'rgba(250,246,238,.4)', marginBottom: 2 }}>목표</div>
              <div style={{ fontSize: 11, color: 'rgba(250,246,238,.65)', marginTop: 4, lineHeight: 1.3 }}>SQLD<br />취득</div>
            </div>
          </div>
        </div>

        {/* Carryover notice */}
        <div style={{ padding: '10px 14px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ArrowCounterClockwise size={16} color="var(--warning)" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', marginBottom: 1 }}>어제 미완료 이월</div>
            <div style={{ fontSize: 11, color: 'var(--warning)', opacity: 0.85 }}>{carryMsg}</div>
          </div>
        </div>

        {/* Today's blocks */}
        <div style={{ paddingBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>오늘의 실행 계획</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {blocks.map((b) => (
              <div key={b.id} style={{ background: 'var(--surface-raised)', border: `1px solid ${b.carryover ? 'var(--coral-200)' : 'var(--sand-200)'}`, borderRadius: 16, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                      {b.carryover && (
                        <span style={{ height: 20, padding: '0 8px', background: '#FBEEDA', border: '1px solid #F2D29A', borderRadius: 9999, fontSize: 9, color: 'var(--warning)', fontWeight: 600, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>이월</span>
                      )}
                      <span className="tnum" style={{ height: 20, padding: '0 8px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.time}</span>
                      <span style={{ height: 20, padding: '0 8px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{b.dur}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>{b.title}</div>
                    {b.note && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{b.note}</div>}
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 9999, border: '1.5px solid var(--sand-300)', flexShrink: 0 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', background: 'var(--surface-ground)' }}>
        <button onClick={onStart} style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: 'var(--surface-ground)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          실행 시작 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
