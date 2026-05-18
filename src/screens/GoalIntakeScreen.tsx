import React, { useState, useEffect, useRef } from 'react';
import { Sparkle, ArrowUp, ArrowRight } from '@phosphor-icons/react';
import { GOAL_CONVO } from '../data';
import type { ConvoMessage } from '../types';

interface GoalIntakeScreenProps {
  onDone: () => void;
}

export function GoalIntakeScreen({ onDone }: GoalIntakeScreenProps) {
  const [idx, setIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [shown, setShown] = useState<ConvoMessage[]>([GOAL_CONVO[0]]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [shown, typing]);

  const advance = () => {
    if (idx >= GOAL_CONVO.length - 1) return;
    const userMsg = GOAL_CONVO[idx + 1];
    if (userMsg.who !== 'user') return;
    setShown((s) => [...s, userMsg]);
    setIdx((i) => i + 1);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const aiIdx = idx + 2;
      if (aiIdx < GOAL_CONVO.length) {
        setShown((s) => [...s, GOAL_CONVO[aiIdx]]);
        setIdx(aiIdx);
      }
    }, 900);
  };

  const isLast = idx >= GOAL_CONVO.length - 1;
  const nextUser = !isLast && GOAL_CONVO[idx + 1]?.who === 'user' ? GOAL_CONVO[idx + 1].text : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sand-200)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkle size={16} weight="fill" color="#FAF6EE" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>목표 파악 AI</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>질문에 답하면 자동으로 목표를 분류해요</div>
          </div>
          <div style={{ height: 20, padding: '0 8px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 9, fontWeight: 700, color: 'var(--coral-700)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center' }}>GOAL INTAKE</div>
        </div>
        {/* Progress */}
        <div style={{ height: 3, background: 'var(--sand-200)', borderRadius: 9999, marginBottom: 8 }}>
          <div style={{ height: '100%', borderRadius: 9999, background: 'var(--brand)', width: `${Math.round((idx / (GOAL_CONVO.length - 1)) * 100)}%`, transition: 'width 0.4s' }} />
        </div>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['시스템 소개', '목표 파악 중', '목표 분류'].map((l, i) => (
            <React.Fragment key={i}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9999, background: i === 1 ? 'var(--brand)' : i < 1 ? 'var(--text-1)' : 'var(--sand-200)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i < 1 ? (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FAF6EE" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <span style={{ fontSize: 7, fontWeight: 700, color: i === 1 ? '#FAF6EE' : 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
                  )}
                </div>
                <span style={{ fontSize: 8, color: i === 1 ? 'var(--brand)' : 'var(--text-3)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>{l}</span>
              </div>
              {i < 2 && <div style={{ width: 16, height: 1, background: 'var(--sand-200)', marginBottom: 14, flexShrink: 0 }} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Chat feed */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.who === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.who === 'ai' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: '90%' }}>
                <div style={{ width: 26, height: 26, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkle size={11} weight="fill" color="#FAF6EE" />
                </div>
                <div style={{ background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: '14px 14px 14px 4px', padding: '10px 13px', fontSize: 13, lineHeight: 1.55, color: 'var(--text-1)', whiteSpace: 'pre-line' }}>{m.text}</div>
              </div>
            ) : (
              <div style={{ maxWidth: '78%', background: 'var(--brand)', color: '#FFFCF6', borderRadius: '14px 14px 4px 14px', padding: '10px 13px', fontSize: 13, lineHeight: 1.45, fontWeight: 500 }}>{m.text}</div>
            )}
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ width: 26, height: 26, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkle size={11} weight="fill" color="#FAF6EE" />
            </div>
            <div style={{ background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: '14px 14px 14px 4px', padding: '12px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--text-3)', animation: 'bounce 1.2s infinite', animationDelay: `${d}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '10px 16px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', borderTop: '1px solid var(--sand-200)', flexShrink: 0, background: 'rgba(250,246,238,.92)', backdropFilter: 'blur(20px)' }}>
        {!isLast ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textAlign: 'center' }}>아래 답변을 탭하세요</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={advance}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', fontSize: 13, textAlign: 'left', cursor: 'pointer', lineHeight: 1.4, fontFamily: 'inherit' }}
              >
                {nextUser}
              </button>
              <button
                onClick={advance}
                style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', alignSelf: 'flex-end' }}
              >
                <ArrowUp size={14} weight="fill" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onDone}
            style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            목표 분류 확인 <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
