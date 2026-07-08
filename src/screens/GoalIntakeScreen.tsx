import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, ArrowUp, ArrowRight } from '@phosphor-icons/react';
import { ApiError, friendlyError, interviewApi } from '../lib/api';
import type { InterviewOutcome, InterviewQuestion, InterviewSession, SlotCatalogEntry } from '../types/api';
import { SetupProgress } from '../components/SetupProgress';
import { useNavigation } from '../contexts/NavigationContext';

interface GoalIntakeScreenProps {
  onDone: () => void;
  // 인터뷰가 끝나 outcome(coreGoals 포함)을 받으면 상위로 올려준다 — 목표 분류(S03) 화면이
  // GET /goals(이 시점엔 항상 빈 테이블, #75) 대신 이 값을 렌더한다.
  onOutcome?: (outcome: InterviewOutcome) => void;
}

interface ChatMessage {
  id: string;
  who: 'ai' | 'user';
  text: string;
}

// 백엔드 mock은 필수 슬롯 12개 → ambiguityScore 0 ~ 12.
// 답변할수록 줄어드므로 (1 - score/initial) * 100 으로 명료성 환산.
// /interview/slot-catalog 가 응답하기 전(fetch 실패 포함) 의 안전 기본값.
const REQUIRED_SLOTS_INIT = 12;

// slot-catalog 의 category 식별자 → 한국어 라벨 (chip 표시용).
const CATEGORY_LABEL: Record<string, string> = {
  identity: '나에 대해',
  goals: '목표',
  time: '시간',
};

function omxStatus(clarity: number) {
  if (clarity === 0) return { icon: '🔍', text: '계획이 안개 속처럼 뿌옇습니다. 차례대로 밝혀볼게요.' };
  if (clarity <= 25) return { icon: '🌫️', text: '목표의 윤곽이 보이기 시작했어요.' };
  if (clarity <= 50) return { icon: '⛅', text: '절반 정도 파악됐어요. 조금만 더요.' };
  if (clarity <= 75) return { icon: '🌤️', text: '거의 다 왔어요! 마지막 조각만 남았어요.' };
  return { icon: '☀️', text: '완벽해요! 상황이 선명하게 파악됐어요.' };
}

export function GoalIntakeScreen({ onDone, onOutcome }: GoalIntakeScreenProps) {
  // 인터뷰 세션 id 를 전역에 올려, weekly-plan(S06) 에서 /plans/generate 가 쓸 수 있게 한다.
  const { setInterviewSessionId } = useNavigation();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 같은 슬롯이 연속 재질문되어(에이전트가 진전 못 시킴) 사용자가 갇힐 때 눈에 띄는 탈출 안내를 띄운다.
  const [stuckHint, setStuckHint] = useState(false);
  // slot-catalog: 필수 슬롯 수와 카테고리를 백엔드 카탈로그에서 가져온다.
  // fetch 실패 시 fallback 으로 정적 상수 사용.
  const [catalog, setCatalog] = useState<SlotCatalogEntry[]>([]);
  // mock 이 동일한 slotKey + totalTurns 를 돌려줘도 React key 가 겹치지 않도록
  // 단순 증가 카운터를 부여한다.
  const msgCounter = useRef(0);
  // 직전에 답한 슬롯이 연속으로 다시 나온 횟수 (stuck 감지용).
  const repeatRef = useRef(0);
  const newMsgId = (prefix: string) => `${prefix}-${++msgCounter.current}`;
  const bodyRef = useRef<HTMLDivElement>(null);
  const initialAmbiguity = useRef<number>(REQUIRED_SLOTS_INIT);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, isTyping]);

  // 슬롯 카탈로그 로드 (best-effort) — 실패해도 흐름은 진행.
  useEffect(() => {
    let cancelled = false;
    interviewApi
      .slotCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        // ignore — placeholder/REQUIRED_SLOTS_INIT fallback 으로 동작.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 세션 시작 — "항상 새 세션" 정책. 유저당 활성 세션 1개라는 백엔드의 의도된 제약
  // (INTERVIEW_SESSION_EXISTS·409)에 맞춰, 재진입 시 기존 세션을 finish 하고 새로
  // 시작한다(사용자 요청으로 도입 — 이어하기보다 새로 시작을 원함).
  // AGENT_CONCURRENT_ACCESS(동시접근 락) 재시도는 원래 advisory-lock 누수 버그(#76,
  // xact_lock 으로 수정 완료 확인됨) 때문에 넣은 완화책이지만, 여러 요청이 진짜
  // 동시에 몰릴 때는 여전히 정상적으로 발생할 수 있어 짧은 재시도를 유지한다.
  useEffect(() => {
    let cancelled = false;
    const STORE_KEY = 'reaction.interviewSessionId';
    setIsTyping(true);

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const readStored = () =>
      (typeof window !== 'undefined' && window.localStorage.getItem(STORE_KEY)) || null;

    const applySession = (s: InterviewSession) => {
      if (cancelled) return;
      if (typeof window !== 'undefined') window.localStorage.setItem(STORE_KEY, s.sessionId);
      initialAmbiguity.current = s.ambiguityScore || REQUIRED_SLOTS_INIT;
      setSession(s);
      setInterviewSessionId(s.sessionId);
      if (s.currentQuestion) {
        setMessages([{ id: newMsgId('ai'), who: 'ai', text: s.currentQuestion.text }]);
      }
    };

    // 항상 새 세션을 만든다. 막는 요인(기존 세션/일시 락)은 흡수하며 최대 6회 재시도.
    const beginFresh = async (attempt = 0): Promise<InterviewSession> => {
      try {
        return await interviewApi.start();
      } catch (err) {
        if (cancelled) throw err;
        const code = err instanceof ApiError ? err.code : '';
        // 이미 세션이 있으면 끝내고 다시 시작 → 새 세션 보장.
        if (code === 'INTERVIEW_SESSION_EXISTS') {
          const sid = readStored();
          if (sid) {
            await interviewApi.finish(sid).catch(() => {});
            window.localStorage.removeItem(STORE_KEY);
          }
          if (attempt < 5) { await sleep(500); return beginFresh(attempt + 1); }
          throw err;
        }
        // 일시적 에이전트 락 — 잠시 후 재시도(사용자에겐 노출하지 않음).
        if (code === 'AGENT_CONCURRENT_ACCESS' && attempt < 5) {
          await sleep(600 + attempt * 300);
          return beginFresh(attempt + 1);
        }
        throw err;
      }
    };

    // 진입 시 저장된 세션이 있으면 먼저 정리하고(항상 새로 시작) 새 세션을 만든다.
    (async () => {
      const sid = readStored();
      if (sid) {
        await interviewApi.finish(sid).catch(() => {});
        window.localStorage.removeItem(STORE_KEY);
      }
      return beginFresh();
    })()
      .then(applySession)
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(friendlyError(err, '백엔드에 연결할 수 없어요. 서버가 켜져 있는지 확인해주세요.'));
      })
      .finally(() => {
        if (!cancelled) setIsTyping(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // catalog 가 로드되면 isRequired 카운트로 ambiguity 시작점을 보정.
  // 단, 세션이 이미 시작돼서 ambiguityScore 를 받은 뒤라면 그쪽이 우선.
  useEffect(() => {
    if (catalog.length === 0) return;
    const requiredCount = catalog.filter((s) => s.isRequired).length;
    if (requiredCount > 0 && !session) {
      initialAmbiguity.current = requiredCount;
    }
  }, [catalog, session]);

  // 현재 질문 slotKey 의 카테고리. catalog 가 없으면 null.
  const currentCategory = useMemo(() => {
    if (!session?.currentQuestion || catalog.length === 0) return null;
    const entry = catalog.find((s) => s.slotKey === session.currentQuestion!.slotKey);
    return entry?.category ?? null;
  }, [session, catalog]);

  const currentQuestion = session?.currentQuestion ?? null;
  const isFinished = session?.endReason !== null && session?.endReason !== undefined;
  const ambiguity = session?.ambiguityScore ?? initialAmbiguity.current;
  // 서버는 남은 필수 슬롯이 있어도 outcome 을 싣고 completed 로 마감한다(ambiguity>0 종료).
  // 그 경우 낮은 %로 끝나면 어색하므로 완료 시엔 100% 로 표시한다.
  const clarity = isFinished
    ? 100
    : Math.max(0, Math.min(100, Math.round((1 - ambiguity / initialAmbiguity.current) * 100)));
  const omx = omxStatus(clarity);

  const submit = async (value: string) => {
    if (!session || !currentQuestion || isTyping || isFinished) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    const answeredKey = currentQuestion.slotKey;
    setMessages((m) => [...m, { id: newMsgId('u'), who: 'user', text: trimmed }]);
    setInputText('');
    setIsTyping(true);

    try {
      // 백엔드 submitAnswer 응답에 이미 다음 질문(또는 종료 상태)이 들어있다.
      // 별도 nextQuestion 호출은 user_agent_lock 을 한 번 더 잡아 실패 위험만 키우므로 제거.
      const next = await interviewApi.submitAnswer(session.sessionId, {
        slotKey: answeredKey,
        value: trimmed,
        clientTurn: session.totalTurns,
      });

      // 종료 신호는 서버의 endReason 하나로 판정한다(completed/early_user/abandoned 모두 terminal).
      // 서버는 아직 물을 게 남으면 endReason=null 로 두고 currentQuestion 을 준다(clarity 부족으로
      // 같은 slotKey 를 재질문하는 것도 endReason=null 이라 종료로 오인하지 않는다).
      //
      // 과거엔 `&& ambiguityScore <= 0` 을 추가로 요구했으나, 서버는 남은 필수 슬롯이 있어도
      // 요약(summary)+outcome 을 실어 completed 로 마감한다(ambiguityScore>0 인 채 종료). 그 결과
      // 정상 완료가 완료로 인식되지 못하고 아래 "다음 질문 없음" 에러로 잘못 빠지던 버그를 고친다.
      const ended = next.endReason !== null;

      if (ended) {
        setSession({
          ...next,
          endReason: next.endReason ?? 'completed',
          currentQuestion: null,
        });
        if (next.outcome) onOutcome?.(next.outcome);
        setMessages((m) => [
          ...m,
          {
            id: newMsgId('ai-end'),
            who: 'ai',
            text: '완벽해요. 정리됐어요. 다음 단계로 넘어갈게요.',
          },
        ]);
        return;
      }

      if (!next.currentQuestion) {
        setSession(next);
        setError('아직 남은 질문이 있는데 다음 질문을 받지 못했어요. 다시 시도해주세요.');
        return;
      }

      // 답한 슬롯이 또 나오면 반복 카운트. 백엔드#79(같은 슬롯 무한 재질문) 수정 확인 후
      // 임계값을 2→4 로 완화 — 라이브 검증에서 정상 흐름도 같은 슬롯을 2~3번 재질문한
      // 뒤 스스로 진행되는 경우가 있어(에이전트의 정상적인 재확인), 너무 낮은 임계값은
      // 정상 진행 중인 사용자에게 불필요하게 "그만할까요?" 를 띄운다. 그래도 진짜
      // 무한반복 상황을 위한 탈출구(안내+건너뛰기)는 안전망으로 유지한다.
      if (next.currentQuestion!.slotKey === answeredKey) {
        repeatRef.current += 1;
        if (repeatRef.current >= 4) setStuckHint(true);
      } else {
        repeatRef.current = 0;
        setStuckHint(false);
      }
      setSession(next);
      setMessages((m) => [
        ...m,
        { id: newMsgId('ai'), who: 'ai', text: next.currentQuestion!.text },
      ]);
    } catch (err: unknown) {
      setError(friendlyError(err, '요청 처리 중 오류가 발생했어요.'));
    } finally {
      setIsTyping(false);
    }
  };

  const finishEarly = async () => {
    if (!session) return;
    try {
      const s = await interviewApi.finish(session.sessionId);
      setSession(s);
      if (s.outcome) onOutcome?.(s.outcome);
      setMessages((m) => [...m, { id: newMsgId('ai-finish'), who: 'ai', text: '여기까지 정리해 둘게요. 언제든 이어할 수 있어요.' }]);
    } catch (err: unknown) {
      setError(friendlyError(err, '종료 처리 중 오류가 발생했어요.'));
    }
  };

  // chip/select 는 옵션 버튼, 그 외(text/date/time)는 자유 입력.
  const showQuickReplies =
    currentQuestion &&
    (currentQuestion.answerType === 'chip' || currentQuestion.answerType === 'select') &&
    currentQuestion.options.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-ground)' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sand-200)', flexShrink: 0 }}>
        <SetupProgress current={1} total={4} label="목표" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkle size={16} weight="fill" color="#FAF6EE" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>목표 파악 AI</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>질문에 답하면 자동으로 목표를 분류해요</div>
          </div>
          <div style={{ height: 'var(--ctrl-xs)', padding: '0 8px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 9, fontWeight: 700, color: 'var(--coral-700)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center' }}>
            {currentCategory ? (CATEGORY_LABEL[currentCategory] ?? '목표 파악') : '목표 파악'}
          </div>
        </div>
        {/* OMX Clarity Card */}
        <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.01em' }}>명료성 지표</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>{clarity}%&nbsp;명확</span>
          </div>
          <div style={{ height: 5, background: 'var(--sand-200)', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 9999, background: 'var(--brand)', width: `${clarity}%`, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
            <span>{omx.icon}</span>
            <span>{omx.text}</span>
          </div>
        </div>
      </div>

      {/* Chat feed */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <div style={{ background: '#FAE2D8', border: '1px solid var(--coral-200)', color: 'var(--coral-700)', borderRadius: 10, padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>{error}</span>
            {/* 인터뷰 시작/이어가기가 막혀도(예: 기존 세션 409) 온보딩을 진행할 수 있게 한다. */}
            <button onClick={onDone} style={{ alignSelf: 'flex-start', height: 'var(--ctrl-sm)', padding: '0 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--surface-raised)', color: 'var(--coral-700)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              다음 단계로 넘어가기 <ArrowRight size={12} />
            </button>
          </div>
        )}
        {messages.map((m) => (
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
        {isTyping && (
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
        {!isFinished && currentQuestion ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>💡</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', fontWeight: 600 }}>원터치 대답하기</span>
              </div>
              <button
                onClick={finishEarly}
                style={{ fontSize: 10, color: 'var(--text-3)', background: 'transparent', border: 'none', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', cursor: 'pointer' }}
              >
                충분해요
              </button>
            </div>
            {stuckHint && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 12, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)' }}>
                <span style={{ fontSize: 12, color: 'var(--coral-700)', lineHeight: 1.5 }}>같은 질문이 반복되고 있어요. 충분히 답했다면 바로 다음 단계로 넘어가도 돼요.</span>
                <button onClick={finishEarly} style={{ alignSelf: 'flex-start', height: 'var(--ctrl-sm)', padding: '0 14px', borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  이 정도면 충분해요 <ArrowRight size={12} weight="bold" />
                </button>
              </div>
            )}
            {showQuickReplies && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {currentQuestion.options.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => submit(reply)}
                    disabled={isTyping}
                    style={{
                      padding: '11px 12px',
                      borderRadius: 12,
                      border: '1.5px solid var(--sand-200)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-1)',
                      fontSize: 12,
                      textAlign: 'left',
                      cursor: isTyping ? 'wait' : 'pointer',
                      lineHeight: 1.45,
                      fontFamily: 'inherit',
                      wordBreak: 'keep-all',
                      opacity: isTyping ? 0.6 : 1,
                    }}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
            {!showQuickReplies && currentQuestion.suggestedAnswers && currentQuestion.suggestedAnswers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ width: '100%', fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>추천 답변 · 탭해서 채우기</span>
                {currentQuestion.suggestedAnswers.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInputText(s)}
                    disabled={isTyping}
                    style={{ padding: '8px 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontSize: 12, textAlign: 'left', cursor: isTyping ? 'wait' : 'pointer', fontFamily: 'inherit', wordBreak: 'keep-all', opacity: isTyping ? 0.6 : 1 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: showQuickReplies ? 4 : 0 }}>
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(inputText);
                }}
                placeholder={placeholderFor(currentQuestion)}
                disabled={isTyping}
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
                onClick={() => submit(inputText)}
                disabled={isTyping || !inputText.trim()}
                style={{ width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--brand)', color: '#FFFCF6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: isTyping || !inputText.trim() ? 0.5 : 1 }}
              >
                <ArrowUp size={14} weight="fill" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onDone}
            style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            목표 분류 확인 <ArrowRight size={16} />
          </button>
        )}
      </div>
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
      return '직접 입력하기...';
  }
}
