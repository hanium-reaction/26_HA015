import React, { useState } from 'react';
import { Sparkle, Check, ArrowRight } from '@phosphor-icons/react';
import { INIT_GOALS, GOAL_STATUS_META } from '../data';
import type { Goal, GoalStatus } from '../types';

interface GoalClassificationScreenProps {
  onNext: () => void;
}

export function GoalClassificationScreen({ onNext }: GoalClassificationScreenProps) {
  const [goals, setGoals] = useState<Goal[]>(INIT_GOALS);
  const [selected, setSelected] = useState<string | null>(null);

  const changeStatus = (id: string, s: GoalStatus) => {
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, status: s } : g)));
    setSelected(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-ground)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>목표 분류</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 4 }}>무엇에 집중할까요?</div>
          <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>대화에서 파악한 목표들이에요. 분류를 조정할 수 있어요.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {goals.map((g) => {
            const m = GOAL_STATUS_META[g.status];
            const isSel = selected === g.id;
            return (
              <div
                key={g.id}
                onClick={() => setSelected(isSel ? null : g.id)}
                style={{ background: isSel ? m.bg : 'var(--surface-raised)', border: `1.5px solid ${isSel ? m.border : 'var(--sand-200)'}`, borderRadius: 16, padding: 12, cursor: 'pointer', transition: 'all 160ms var(--ease-out)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <div style={{ height: 20, padding: '0 8px', borderRadius: 9999, background: m.bg, border: `1px solid ${m.border}`, fontSize: 10, fontWeight: 700, color: m.color, letterSpacing: '0.04em', fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center' }}>{m.label}</div>
                      {g.status === 'focus' && (
                        <div style={{ height: 18, padding: '0 7px', borderRadius: 9999, background: 'var(--brand)', color: '#FFFCF6', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>ACTIVE</div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', marginBottom: 4, letterSpacing: '-0.01em' }}>{g.name}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {g.deadline !== 'ongoing' && (
                        <span style={{ height: 20, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{g.deadline}</span>
                      )}
                      <span className="tnum" style={{ height: 20, padding: '0 7px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 9999, fontSize: 10, color: 'var(--text-2)', fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>{g.weeklyH}h/주</span>
                    </div>
                    {g.status !== 'parked' && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden', marginBottom: 2 }}>
                          <div style={{ height: '100%', borderRadius: 9999, background: g.status === 'focus' ? 'var(--brand)' : 'var(--success)', width: `${g.progress}%`, transition: 'width 0.5s' }} />
                        </div>
                        <div className="tnum" style={{ fontSize: 10, color: 'var(--text-3)' }}>{g.progress}% 진행</div>
                      </div>
                    )}
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: 9999, flexShrink: 0, border: `1.5px solid ${isSel ? m.color : 'var(--sand-300)'}`, background: isSel ? m.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSel && <Check size={10} color="#FFFCF6" weight="bold" />}
                  </div>
                </div>

                {isSel && (
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sand-200)', display: 'flex', gap: 5 }}>
                    {(['focus', 'maintain', 'parked'] as GoalStatus[]).map((s) => {
                      const sm = GOAL_STATUS_META[s];
                      return (
                        <button
                          key={s}
                          onClick={() => changeStatus(g.id, s)}
                          style={{ flex: 1, height: 38, borderRadius: 9999, fontSize: 10, fontWeight: 600, background: g.status === s ? sm.color : 'var(--surface-ground)', color: g.status === s ? '#FFFCF6' : 'var(--text-3)', border: `1px solid ${g.status === s ? sm.color : 'var(--sand-200)'}`, cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', transition: 'all 160ms' }}
                        >
                          {sm.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--brand-soft)', borderRadius: 12, border: '1px solid var(--coral-200)', display: 'flex', gap: 8, marginBottom: 0 }}>
          <Sparkle size={13} weight="fill" color="var(--brand)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--coral-700)', marginBottom: 2 }}>스케줄 배치 방식</div>
            <div style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5, opacity: 0.85 }}>집중 목표에 선제적으로 슬롯을 배치하고, 유지는 겹치지 않게 고려해요. 보류는 일정에 넣지 않아요.</div>
          </div>
        </div>
        <div style={{ height: 8 }} />
      </div>

      <div style={{ flexShrink: 0, padding: '12px 18px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))' }}>
        <button
          onClick={onNext}
          style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: 'var(--text-1)', color: 'var(--surface-ground)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          주간 계획 생성 <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
