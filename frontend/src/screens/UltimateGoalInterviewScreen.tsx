import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, ArrowUp, ArrowRight, X, Microphone, Stop, Target } from '@phosphor-icons/react';
import { ApiError, friendlyError, goalsApi, interviewApi } from '../lib/api';
import type { InterviewQuestion, InterviewSession, SlotCatalogEntry } from '../types/api';
import { ErrorBanner } from '../components/ErrorBanner';
import { DateAnswerField, TimeRangeAnswerField, isValidRange, parseRange } from '../components/TypedAnswerField';
import { useSpeechInput } from '../lib/useSpeechInput';

// S29 — 궁극적 목표 전용 인터뷰.
//
// 계획 인터뷰(S02)와 같은 엔진이지만 `kind="ultimate"` 로 시작한다. 종료 턴 응답에는
// `outcome` 대신 `ultimateOutcome` 이 실려 오고, 그걸 그대로 POST /goals/ultimate(U1) 에
// 넘겨 Goal(status=active, tier=parked) 로 확정한다 — 여기까지가 만다라트(S30)의 입력이다.
//
// 세션은 사용자당 1개라, 계획 인터뷰 세션이 살아 있으면 먼저 정리하고 시작한다.

const STORE_KEY = 'reaction.ultimateSessionId';
const PLAN_STORE_KEY = 'reaction.interviewSessionId';

interface ChatMessage {
  id: string;
  who: 'ai' | 'user';
  text: string;
}

interface UltimateGoalInterviewScreenProps {
  /** 궁극목표 확정(U1) 성공 — 만다라트 초안(S30)으로 넘어갈 goalId. */
  onGoalReady: (goalId: string) => void;
  /** 인터뷰를 접고 돌아갈 때. */
  onCancel: () => void;
}

export function UltimateGoalInterviewScreen({ onGoalReady, onCancel }: UltimateGoalInterviewScreenProps) {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SlotCatalogEntry[]>([]);
  const [confirming, setConfirming] = useState(false);
  const msgCounter = useRef(0);
  const newMsgId = (prefix: string) => `${prefix}-${++msgCounter.current}`;
  const bodyRef = useRef<HTMLDivElement>(null);
  // 필수 슬롯 수 — 카탈로그가 오기 전 fallback. 궁극목표 인터뷰는 필수 9슬롯 기준(#220).
  const initialAmbiguity = useRef<number>(9);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    let cancelled = false;
    interviewApi
      .slotCatalog('ultimate')
      .then((c) => {
        if (cancelled) return;
        setCatalog(c);
        const required = c.filter((s) => s.isRequired).length;
        if (required > 0) initialAmbiguity.current = required;
      })
      .catch(() => { /* 카탈로그 없이도 흐름은 진행 */ });
    return () => {
      cancelled = true;
    };
  }, []);

  // 세션 시작 — 항상 새로. 사용자당 활성 세션이 1개라 남아 있는 세션(계획/궁극 양쪽)을 먼저 닫는다.
  useEffect(() => {
    let cancelled = false;
    setIsTyping(true);
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const read = (k: string) => (typeof window !== 'undefined' && window.localStorage.getItem(k)) || null;

    const closeLingering = async () => {
      for (const key of [STORE_KEY, PLAN_STORE_KEY]) {
        const sid = read(key);
        if (sid) {
          await interviewApi.finish(sid).catch(() => {});
          window.localStorage.removeItem(key);
        }
      }
    };

    const beginFresh = async (attempt = 0): Promise<InterviewSession> => {
      try {
        return await interviewApi.start('ultimate');
      } catch (err) {
        if (cancelled) throw err;
        const code = err instanceof ApiError ? err.code : '';
        if (code === 'INTERVIEW_SESSION_EXISTS' && attempt < 5) {
          await closeLingering();
          await sleep(500);
          return beginFresh(attempt + 1);
        }
        if (code === 'AGENT_CONCURRENT_ACCESS' && attempt < 5) {
          await sleep(600 + attempt * 300);
          return beginFresh(attempt + 1);
        }
        throw err;
      }
    };

    (async () => {
      await closeLingering();
      return beginFresh();
    })()
      .then((s) => {
        if (cancelled) return;
        if (typeof window !== 'undefined') window.localStorage.setItem(STORE_KEY, s.sessionId);
        initialAmbiguity.current = s.ambiguityScore || initialAmbiguity.current;
        setSession(s);
        if (s.currentQuestion) {
          setMessages([{ id: newMsgId('ai'), who: 'ai', text: s.currentQuestion.text }]);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(friendlyError(err, '인터뷰를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'));
      })
      .finally(() => {
        if (!cancelled) setIsTyping(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentQuestion = session?.currentQuestion ?? null;
  const isFinished = session?.endReason != null;
  const ultimateOutcome = session?.ultimateOutcome ?? null;
  const ambiguity = session?.ambiguityScore ?? initialAmbiguity.current;
  const clarity = isFinished
    ? 100
    : Math.max(0, Math.min(100, Math.round((1 - ambiguity / initialAmbiguity.current) * 100)));

  const currentCategory = useMemo(() => {
    if (!currentQuestion || catalog.length === 0) return null;
    return catalog.find((s) => s.slotKey === currentQuestion.slotKey)?.category ?? null;
  }, [currentQuestion, catalog]);

  const submit = async (value: string) => {
    if (!session || !currentQuestion || isTyping || isFinished) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const answeredKey = currentQuestion.slotKey;
    speech.stop();
    setMessages((m) => [...m, { id: newMsgId('u'), who: 'user', text: trimmed }]);
    setInputText('');
    setIsTyping(true);
    try {
      const next = await interviewApi.submitAnswer(session.sessionId, {
        slotKey: answeredKey,
        value: trimmed,
        clientTurn: session.totalTurns,
      });
      if (next.endReason != null) {
        setSession({ ...next, endReason: next.endReason ?? 'completed', currentQuestion: null });
        setMessages((m) => [
          ...m,
          { id: newMsgId('ai-end'), who: 'ai', text: '충분히 들었어요. 이 목표를 만다라트로 펼쳐볼게요.' },
        ]);
        return;
      }
      if (!next.currentQuestion) {
        setSession(next);
        setError('다음 질문을 받지 못했어요. 다시 시도해주세요.');
        return;
      }
      setSession(next);
      setMessages((m) => [...m, { id: newMsgId('ai'), who: 'ai', text: next.currentQuestion!.text }]);
    } catch (err: unknown) {
      setError(friendlyError(err, '요청 처리 중 오류가 발생했어요.'));
    } finally {
      setIsTyping(false);
    }
  };

  const finishEarly = async () => {
    if (!session) return;
    setIsTyping(true);
    try {
      const s = await interviewApi.finish(session.sessionId);
      setSession(s);
      setMessages((m) => [...m, { id: newMsgId('ai-finish'), who: 'ai', text: '여기까지 정리해 둘게요.' }]);
    } catch (err: unknown) {
      setError(friendlyError(err, '종료 처리 중 오류가 발생했어요.'));
    } finally {
      setIsTyping(false);
    }
  };

  // U1 — 인터뷰가 쥐고 있는 ultimateOutcome 을 그대로 실어 보낸다.
  // 없으면 생략해도 서버가 최근 정상 종료된 궁극목표 인터뷰에서 복구한다.
  const confirmUltimate = async () => {
    setConfirming(true);
    setError(null);
    try {
      const goal = await goalsApi.upsertUltimate(ultimateOutcome ? { outcome: ultimateOutcome } : {});
      if (typeof window !== 'undefined') window.localStorage.removeItem(STORE_KEY);
      onGoalReady(goal.goalId);
    } catch (err: unknown) {
      setError(friendlyError(err, '궁극적 목표를 저장하지 못했어요.'));
    } finally {
      setConfirming(false);
    }
  };

  // 입력창을 "쉼표로 구분된 답 목록"으로 본다 — 선택지를 눌러도 바로 전송하지 않고 담기만 한다.
  const parts = inputText.split(',').map((t) => t.trim()).filter(Boolean);
  const togglePart = (v: string) => {
    const t = v.trim();
    setInputText((parts.includes(t) ? parts.filter((x) => x !== t) : [...parts, t]).join(', '));
  };
  const isPicked = (v: string) => parts.includes(v.trim());

  const showQuickReplies =
    currentQuestion &&
    (currentQuestion.answerType === 'chip' || currentQuestion.answerType === 'select') &&
    currentQuestion.options.length > 0;

  const typedKind: 'date' | 'range' | null = currentQuestion
    ? currentQuestion.answerType === 'date_picker'
      ? 'date'
      : currentQuestion.answerType === 'time_range'
        ? 'range'
        : null
    : null;
  const [manualEntry, setManualEntry] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 내용에 맞춰 높이를 다시 잰다. scrollHeight 를 읽기 전에 height 를 비워야
  // 줄이 줄어들 때도 따라 줄어든다(안 그러면 한 번 커진 뒤 그대로 남는다).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [inputText]);

  const useTypedField = typedKind !== null && !manualEntry;

  useEffect(() => {
    setManualEntry(false);
  }, [currentQuestion?.slotKey]);

  useEffect(() => {
    if (useTypedField && typedKind === 'range' && inputText.trim() === '') {
      const { start, end } = parseRange('');
      setInputText(`${start}-${end}`);
    }
  }, [useTypedField, typedKind, inputText]);

  const range = typedKind === 'range' ? parseRange(inputText) : null;
  const canSubmit =
    inputText.trim() !== '' &&
    !isTyping &&
    (!useTypedField || typedKind !== 'range' || (range !== null && isValidRange(range.start, range.end)));

  const appendSpoken = useCallback((text: string) => {
    setInputText((prev) => (prev.trim() === '' ? text : `${prev.trimEnd()} ${text}`));
  }, []);
  const speech = useSpeechInput(appendSpoken);
  const showMic = speech.supported && !useTypedField && !isFinished;

  useEffect(() => {
    speech.stop();
  }, [currentQuestion?.slotKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--sand-200)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9999, background: 'var(--brand-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Target size={16} weight="fill" color="#FFFCF6" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>궁극적 목표 인터뷰</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>한 학기가 아니라, 몇 년을 관통하는 목표를 세워요</div>
          </div>
          {currentCategory && (
            <div style={{ height: 24, padding: '0 8px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 11, fontWeight: 700, color: 'var(--coral-700)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {currentCategory}
            </div>
          )}
        </div>
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>목표 선명도</span>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand-ink)' }}>{clarity}% 선명</span>
          </div>
          <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 9999, background: 'var(--brand)', width: `${clarity}%`, transition: 'width 0.6s ease' }} />
          </div>
        </div>
      </div>

      {/* Chat */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <ErrorBanner
            action={
              <button onClick={onCancel} style={{ alignSelf: 'flex-start', height: 32, padding: '0 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--surface-raised)', color: 'var(--coral-700)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                목표 화면으로 돌아가기 <ArrowRight size={12} />
              </button>
            }
          >
            {error}
          </ErrorBanner>
        )}
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.who === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.who === 'ai' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: '90%' }}>
                <div style={{ width: 26, height: 26, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkle size={11} weight="fill" color="#FAF6EE" />
                </div>
                <div style={{ background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: '14px 14px 14px 4px', padding: '10px 13px', fontSize: 13, lineHeight: 1.55, color: 'var(--text-1)', whiteSpace: 'pre-line', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{m.text}</div>
              </div>
            ) : (
              <div style={{ maxWidth: '78%', background: 'var(--brand-surface)', color: '#FFFCF6', borderRadius: '14px 14px 4px 14px', padding: '10px 13px', fontSize: 13, lineHeight: 1.45, fontWeight: 500, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{m.text}</div>
            )}
          </div>
        ))}
        {isTyping && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ width: 26, height: 26, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkle size={11} weight="fill" color="#FAF6EE" />
            </div>
            <div style={{ background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: '14px 14px 14px 4px', padding: '12px 14px', display: 'flex', gap: 4 }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--text-3)', animation: 'bounce 1.2s infinite', animationDelay: `${d}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* 종료 턴 — ultimateOutcome 요약 카드. 무엇이 저장될지 보여준 뒤 확정을 받는다. */}
        {isFinished && ultimateOutcome && (
          <div style={{ marginTop: 4, padding: '14px 16px', borderRadius: 16, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--coral-700)' }}>이렇게 정리했어요</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {ultimateOutcome.statement}
            </div>
            <SummaryRow label="지금 위치">{ultimateOutcome.currentPosition}</SummaryRow>
            <SummaryRow label="무엇으로 확인">{ultimateOutcome.measure}</SummaryRow>
            <SummaryRow label="이뤘을 때의 모습">{ultimateOutcome.successImage}</SummaryRow>
            {ultimateOutcome.horizonYears != null && <SummaryRow label="기간">{ultimateOutcome.horizonYears}년</SummaryRow>}
            {ultimateOutcome.unresolvedSlots && ultimateOutcome.unresolvedSlots.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.5, opacity: 0.85 }}>
                아직 못 들은 게 {ultimateOutcome.unresolvedSlots.length}가지 있어요. 그대로 진행해도 되고, 나중에 다시 인터뷰해 다듬어도 돼요.
              </div>
            )}
          </div>
        )}
        {isFinished && !ultimateOutcome && (
          <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 14, background: 'var(--surface-raised)', border: '1px dashed var(--sand-300)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
            인터뷰는 끝났는데 정리 결과가 함께 오지 않았어요. 그대로 진행하면 서버가 방금 끝낸 인터뷰에서 목표를 복구해요.
          </div>
        )}
      </div>

      {/* Input / 확정 */}
      <div style={{ padding: '10px 16px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', borderTop: '1px solid var(--sand-200)', flexShrink: 0, background: 'rgba(250,246,238,.92)', backdropFilter: 'blur(20px)' }}>
        {!isFinished && currentQuestion ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>편하게 답해도 돼요</span>
              <button onClick={finishEarly} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                충분해요
              </button>
            </div>
            {showQuickReplies && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 168, overflowY: 'auto' }}>
                {currentQuestion.options.map((reply, i) => {
                  const picked = isPicked(reply);
                  return (
                    <button
                      key={i}
                      onClick={() => togglePart(reply)}
                      disabled={isTyping}
                      style={{ padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${picked ? 'var(--coral-200)' : 'var(--sand-200)'}`, background: picked ? 'var(--brand-soft)' : 'var(--surface-raised)', color: picked ? 'var(--coral-700)' : 'var(--text-1)', fontWeight: picked ? 700 : 400, fontSize: 12, textAlign: 'left', cursor: isTyping ? 'wait' : 'pointer', lineHeight: 1.45, fontFamily: 'inherit', wordBreak: 'keep-all', opacity: isTyping ? 0.6 : 1 }}
                    >
                      {reply}
                    </button>
                  );
                })}
              </div>
            )}
            {!showQuickReplies && currentQuestion.suggestedAnswers && currentQuestion.suggestedAnswers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {currentQuestion.suggestedAnswers.map((s, i) => (
                  <button key={i} onClick={() => togglePart(s)} disabled={isTyping} style={{ padding: '8px 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontSize: 12, cursor: isTyping ? 'wait' : 'pointer', fontFamily: 'inherit', wordBreak: 'keep-all', opacity: isTyping ? 0.6 : 1 }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {useTypedField && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {typedKind === 'date' ? (
                  <DateAnswerField value={inputText} onChange={setInputText} disabled={isTyping} />
                ) : (
                  <TimeRangeAnswerField value={inputText} onChange={setInputText} disabled={isTyping} />
                )}
                <button onClick={() => { setInputText(''); setManualEntry(true); }} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                  직접 입력할게요
                </button>
              </div>
            )}
            {speech.listening && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, minHeight: 18 }} aria-live="polite">
                {speech.interim ? `“${speech.interim}”` : '듣고 있어요…'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              {!useTypedField && (
                /* textarea 다. input 은 한 줄짜리 요소라 어떤 조합키로도 줄바꿈이
                   들어가지 않는다 — 답이 길어지면 한 줄에 밀려 앞이 안 보였다.
                   Enter 로 보내고 Shift+Enter 로 줄을 바꾼다(메신저 관용).
                   내용에 맞춰 높이가 늘어나되 상한을 둬서 화면을 먹지 않게 한다. */
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                    if (e.shiftKey) return; // 줄바꿈은 브라우저 기본 동작에 맡긴다
                    e.preventDefault();     // 보낼 때는 줄바꿈이 남지 않게
                    submit(inputText);
                  }}
                  placeholder={placeholderFor(currentQuestion)}
                  disabled={isTyping}
                  style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 132, overflowY: 'auto' }}
                />
              )}
              {!useTypedField && inputText.trim() !== '' && (
                <button onClick={() => setInputText('')} disabled={isTyping} aria-label="입력 지우기" style={{ width: 44, height: 44, borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <X size={13} weight="bold" />
                </button>
              )}
              {showMic && (
                <button
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  disabled={isTyping}
                  aria-label={speech.listening ? '음성 입력 멈추기' : '말로 답하기'}
                  aria-pressed={speech.listening}
                  style={{ width: 44, height: 44, borderRadius: 9999, border: `1px solid ${speech.listening ? 'transparent' : 'var(--coral-200)'}`, background: speech.listening ? 'var(--brand-surface)' : 'var(--brand-soft)', color: speech.listening ? '#FFFCF6' : 'var(--coral-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  {speech.listening ? <Stop size={14} weight="fill" /> : <Microphone size={16} weight="fill" />}
                </button>
              )}
              <button
                onClick={() => submit(inputText)}
                disabled={!canSubmit}
                aria-label="답변 보내기"
                style={{ width: useTypedField ? undefined : 44, flex: useTypedField ? 1 : undefined, height: 44, borderRadius: useTypedField ? 12 : 9999, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: canSubmit ? 'pointer' : 'not-allowed', flexShrink: 0, opacity: canSubmit ? 1 : 0.5 }}
              >
                {useTypedField && <span>이 답으로 보내기</span>}
                <ArrowUp size={14} weight="fill" />
              </button>
            </div>
          </div>
        ) : isFinished ? (
          <button
            onClick={confirmUltimate}
            disabled={confirming}
            style={{ width: '100%', height: 52, borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: confirming ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: confirming ? 0.6 : 1 }}
          >
            {confirming ? '저장하는 중…' : '이 목표로 만다라트 만들기'} <ArrowRight size={16} />
          </button>
        ) : (
          <button
            onClick={onCancel}
            style={{ width: '100%', height: 52, borderRadius: 12, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontWeight: 600, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            나중에 할게요
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.55 }}>
      <span style={{ flexShrink: 0, width: 82, color: 'var(--coral-700)', fontWeight: 700 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--text-1)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

function placeholderFor(q: InterviewQuestion): string {
  switch (q.answerType) {
    case 'date_picker':
      return 'YYYY-MM-DD';
    case 'time_range':
      return '예: 09:00-23:00';
    case 'chip':
    case 'select':
      return '직접 입력해도 돼요...';
    default:
      return '떠오르는 대로 적어도 괜찮아요...';
  }
}
