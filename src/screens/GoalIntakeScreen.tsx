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
  const [inputText, setInputText] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [shown, typing]);

  const advance = (customText?: string) => {
    if (idx >= GOAL_CONVO.length - 1) return;
    const userMsg = GOAL_CONVO[idx + 1];
    if (userMsg.who !== 'user') return;
    const text = customText || inputText.trim() || userMsg.text;
    const displayMsg = { ...userMsg, text };
    setShown((s) => [...s, displayMsg]);
    setInputText('');
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
  const currentAiMsg = GOAL_CONVO[idx];
  const quickReplies = !isLast && currentAiMsg?.who === 'ai' ? currentAiMsg.quickReplies : undefined;

  const userTurns = shown.filter(m => m.who === 'user').length;
  const clarity = Math.round((userTurns / 4) * 100);
  const omxStatus = clarity === 0
    ? { icon: '🔍', text: '계획이 안개 속처럼 뿌옇습니다. 차례대로 밝혀볼게요.' }
    : clarity <= 25
    ? { icon: '🌫️', text: '목표의 윤곽이 보이기 시작했어요.' }
    : clarity <= 50
    ? { icon: '⛅', text: '절반 정도 파악됐어요. 조금만 더요.' }
    : clarity <= 75
    ? { icon: '🌤️', text: '거의 다 왔어요! 마지막 조각만 남았어요.' }
    : { icon: '☀️', text: '완벽해요! 상황이 선명하게 파악됐어요.' };

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
        {/* OMX Clarity Card */}
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.01em' }}>상황 명료성 확보 지표 (OMX)</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>{clarity}%&nbsp;명확</span>
          </div>
          <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 9999, background: 'var(--brand)', width: `${clarity}%`, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
            <span>{omxStatus.icon}</span>
            <span>{omxStatus.text}</span>
          </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13 }}>💡</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', fontWeight: 600 }}>원터치 대답하기</span>
            </div>
            {quickReplies && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => advance(reply)}
                    style={{
                      padding: '11px 12px',
                      borderRadius: 12,
                      border: '1.5px solid var(--sand-200)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-1)',
                      fontSize: 12,
                      textAlign: 'left',
                      cursor: 'pointer',
                      lineHeight: 1.45,
                      fontFamily: 'inherit',
                      wordBreak: 'keep-all',
                    }}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: quickReplies ? 4 : 0 }}>
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) advance(); }}
                placeholder="직접 입력하기..."
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: '1.5px solid var(--sand-200)',
                  background: 'var(--surface-raised)',
                  color: 'var(--text-1)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => advance()}
                style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
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
