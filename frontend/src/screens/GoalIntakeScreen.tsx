import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Sparkle, ArrowUp, ArrowRight, X, Microphone, Stop } from '@phosphor-icons/react';
import { ApiError, friendlyError, interviewApi } from '../lib/api';
import type { InterviewOutcome, InterviewQuestion, InterviewSession, SlotCatalogEntry } from '../types/api';
import { SetupProgress } from '../components/SetupProgress';
import { useNavigation } from '../contexts/NavigationContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { DateAnswerField, TimeRangeAnswerField, isValidRange, parseRange } from '../components/TypedAnswerField';
import { useSpeechInput } from '../lib/useSpeechInput';

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
const REQUIRED_SLOTS_INIT = 14;

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
  const { setInterviewSessionId, interviewGoalId } = useNavigation();
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
  const textInputRef = useRef<HTMLInputElement>(null);
  const textSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const composingRef = useRef(false);
  const initialAmbiguity = useRef<number>(REQUIRED_SLOTS_INIT);
  const [inputFocused, setInputFocused] = useState(false);

  // 모바일 한글 IME는 조합 중 controlled input 이 다시 렌더되면 커서를 문자열 앞쪽으로
  // 옮기는 경우가 있다. 사용자가 만든 selection 을 기억하되 조합 중에는 건드리지 않고,
  // React 가 값을 반영한 다음에만 같은 위치로 복원한다.
  useLayoutEffect(() => {
    const input = textInputRef.current;
    const selection = textSelectionRef.current;
    if (!input || !selection || composingRef.current || document.activeElement !== input) return;
    const max = input.value.length;
    input.setSelectionRange(Math.min(selection.start, max), Math.min(selection.end, max));
  }, [inputText]);

  const rememberSelection = (input: HTMLInputElement) => {
    textSelectionRef.current = {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
  };

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
        // 목표 지정 인터뷰(#442)면 그 목표를 실어 보낸다 — 서버가 `goals.list`·
        // `goals.heaviest` 를 채워 **대상을 다시 묻지 않는다.**
        return await interviewApi.start(undefined, interviewGoalId ?? undefined);
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
    // 답을 보내는 순간 마이크를 놓는다. 같은 슬롯이 재질문되면 slotKey 가 그대로라
    // 아래 정리 effect 가 안 돌아, 이전 답의 뒷말이 다음 답에 흘러들어간다.
    speech.stop();
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

  // 입력창을 "쉼표로 구분된 답 목록" 으로 본다. 선택지를 누르면 전송하지 않고 여기에
  // 담기만 한다 — 인터뷰 답 하나가 계획 전체를 가르는데 오탭을 되돌릴 방법이 없었다.
  // 같은 걸 다시 누르면 빠진다(토글). 직접 친 글도 그냥 항목 하나로 취급한다.
  const parts = inputText.split(',').map((t) => t.trim()).filter(Boolean);
  const isPicked = (v: string) => parts.includes(v.trim());
  const togglePart = (v: string) => {
    const t = v.trim();
    const next = parts.includes(t) ? parts.filter((x) => x !== t) : [...parts, t];
    setInputText(next.join(', '));
  };

  // chip/select 는 옵션 버튼, 그 외(text/date/time)는 자유 입력.
  const showQuickReplies =
    currentQuestion &&
    (currentQuestion.answerType === 'chip' || currentQuestion.answerType === 'select') &&
    currentQuestion.options.length > 0;

  // ── answerType 전용 입력(#217) ──
  // 백엔드가 "이건 날짜다 / 이건 시간 범위다" 를 이미 알려주는데도 맨 텍스트 입력으로
  // 떨어뜨려, 마감일과 선호 시간대를 사용자가 형식까지 맞춰 타이핑하고 있었다.
  // 자료를 파일로도 받는다.
  //
  // 백엔드엔 업로드 경로가 없다(multipart 를 받는 엔드포인트가 하나도 없다).
  // 그래서 파일을 서버로 보내지 않고 **브라우저에서 텍스트만 읽어** 이 칸을 채운다.
  // 사용자가 하려던 일("파일 내용을 자료로 주기")은 그대로 되고, BE 변경도 필요 없다.
  //
  // 텍스트로 읽히는 형식만 받는다. PDF·DOCX 는 파서를 실어야 하고(번들이 커진다)
  // 서버 업로드가 생기면 그쪽에서 처리하는 게 맞아서, 지금은 받지 않고 그 사실을 말한다.
  const MATERIAL_CHAR_CAP = 20000;
  const TEXT_LIKE = /\.(txt|md|markdown|csv|tsv|json|ya?ml|log)$/i;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

  const readMaterialFile = async (file: File) => {
    if (!TEXT_LIKE.test(file.name) && !file.type.startsWith('text/')) {
      setFileNote(`${file.name} 은 아직 못 읽어요. txt·md·csv 처럼 글자로 된 파일만 됩니다.`);
      return;
    }
    try {
      const raw = await file.text();
      const body = raw.length > MATERIAL_CHAR_CAP ? raw.slice(0, MATERIAL_CHAR_CAP) : raw;
      // 어디서 온 내용인지 남긴다 — 여러 개를 붙이면 구분이 안 된다.
      const block = `[${file.name}]\n${body.trim()}`;
      setInputText((prev) => (prev.trim() ? `${prev.trim()}\n\n${block}` : block));
      setFileNote(
        raw.length > MATERIAL_CHAR_CAP
          ? `${file.name} 을 불러왔어요. 너무 길어서 앞부분 ${MATERIAL_CHAR_CAP.toLocaleString()}자만 가져왔어요.`
          : `${file.name} 을 불러왔어요.`,
      );
    } catch {
      setFileNote(`${file.name} 을 읽지 못했어요. 내용을 직접 붙여넣어 주세요.`);
    }
  };

  // 자료 붙여넣기 슬롯은 기존 textarea 특례를 그대로 둔다.
  const typedKind: 'date' | 'range' | null =
    currentQuestion && currentQuestion.slotKey !== 'goals.materials'
      ? currentQuestion.answerType === 'date_picker'
        ? 'date'
        : currentQuestion.answerType === 'time_range'
          ? 'range'
          : null
      : null;
  // 자정을 넘는 시간대처럼 전용 입력으로 표현 못 하는 답을 위한 탈출구.
  const [manualEntry, setManualEntry] = useState(false);
  const useTypedField = typedKind !== null && !manualEntry;

  // 질문이 바뀌면 탈출구 상태를 되돌린다 — 이전 질문에서 열어둔 게 다음 질문까지 따라오면 안 된다.
  useEffect(() => {
    setManualEntry(false);
  }, [currentQuestion?.slotKey]);

  // 시간 범위는 다이얼이 항상 무언가를 가리키고 있다. 입력값이 비어 있으면 화면에 보이는 것과
  // 전송되는 값이 달라지므로(보이는 건 09:00~18:00, 보내는 건 빈 문자열) 기본값을 실제로 채운다.
  useEffect(() => {
    if (useTypedField && typedKind === 'range' && inputText.trim() === '') {
      const { start, end } = parseRange('');
      setInputText(`${start}-${end}`);
    }
  }, [useTypedField, typedKind, inputText]);

  // 전송 가능 여부 — 시간 범위는 형식이 맞아야만 보낼 수 있다.
  const range = typedKind === 'range' ? parseRange(inputText) : null;
  const canSubmit =
    inputText.trim() !== '' &&
    !isTyping &&
    (!useTypedField || typedKind !== 'range' || (range !== null && isValidRange(range.start, range.end)));

  // ── 음성 입력(#215) ──
  // 확정된 문장은 입력창에 이어붙이기만 한다. 자동 전송하지 않는 건 의도다 —
  // 잘못 인식된 답 하나가 계획 전체를 가르는데 되돌릴 방법이 없다.
  const appendSpoken = useCallback((text: string) => {
    setInputText((prev) => (prev.trim() === '' ? text : `${prev.trimEnd()} ${text}`));
  }, []);
  const speech = useSpeechInput(appendSpoken);
  // 전용 입력(날짜·시간)에서는 마이크가 할 일이 없다. 자유서술 질문에서만 띄운다.
  const showMic = speech.supported && !useTypedField && !isFinished;

  // 질문이 바뀌면 듣기를 멈춘다 — 다음 질문에 이전 답이 흘러들어가면 안 된다.
  useEffect(() => {
    speech.stop();
  }, [currentQuestion?.slotKey]);

  return (
    <div
      className={`goal-intake${inputFocused ? ' goal-intake--keyboard' : ''}`}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          setInputFocused(true);
        }
      }}
      onBlurCapture={() => {
        // focus 가 날짜/텍스트 입력 사이로 이동하는 경우를 먼저 반영하게 한 뒤 판정한다.
        window.setTimeout(() => {
          const active = document.activeElement;
          setInputFocused(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement);
        }, 0);
      }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--surface-ground)' }}
    >
      {/* Header */}
      <div className="goal-intake__header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--sand-200)', flexShrink: 0 }}>
        <div className="goal-intake__setup-progress"><SetupProgress current={1} total={4} label="목표" /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9999, background: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkle size={16} weight="fill" color="#FAF6EE" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>목표 파악 AI</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>질문에 답하면 자동으로 목표를 분류해요</div>
          </div>
          <div style={{ height: 'var(--ctrl-xs)', padding: '0 8px', background: 'var(--brand-soft)', border: '1px solid var(--coral-200)', borderRadius: 9999, fontSize: 12, fontWeight: 700, color: 'var(--coral-700)', display: 'flex', alignItems: 'center' }}>
            {currentCategory ? (CATEGORY_LABEL[currentCategory] ?? '목표 파악') : '목표 파악'}
          </div>
        </div>
        {/* OMX Clarity Card */}
        <div className="goal-intake__clarity" style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.01em' }}>명료성 지표</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand-ink)' }}>{clarity}%&nbsp;명확</span>
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
      <div ref={bodyRef} className="goal-intake__feed" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <ErrorBanner
            action={
              /* 인터뷰 시작/이어가기가 막혀도(예: 기존 세션 409) 온보딩을 진행할 수 있게 한다. */
              <button onClick={onDone} style={{ alignSelf: 'flex-start', height: 'var(--ctrl-sm)', padding: '0 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--surface-raised)', color: 'var(--coral-700)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                다음 단계로 넘어가기 <ArrowRight size={12} />
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
                <div style={{ background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: '14px 14px 14px 4px', padding: '10px 13px', fontSize: 13, lineHeight: 1.55, color: 'var(--text-1)', whiteSpace: 'pre-line' }}>{m.text}</div>
              </div>
            ) : (
              <div style={{ maxWidth: '78%', background: 'var(--brand-surface)', color: '#FFFCF6', borderRadius: '14px 14px 4px 14px', padding: '10px 13px', fontSize: 13, lineHeight: 1.45, fontWeight: 500 }}>{m.text}</div>
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
      <div className="goal-intake__composer" style={{ padding: '10px 16px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))', borderTop: '1px solid var(--sand-200)', flexShrink: 0, background: 'rgba(250,246,238,.92)', backdropFilter: 'blur(20px)' }}>
        {!isFinished && currentQuestion ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>💡</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '-0.01em', fontWeight: 600 }}>원터치 대답하기</span>
              </div>
              <button
                onClick={finishEarly}
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: 'transparent', border: 'none', letterSpacing: '-0.01em', cursor: 'pointer' }}
              >
                충분해요
              </button>
            </div>
            {stuckHint && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 12, background: 'var(--brand-soft)', border: '1px solid var(--coral-200)' }}>
                <span style={{ fontSize: 12, color: 'var(--coral-700)', lineHeight: 1.5 }}>같은 질문이 반복되고 있어요. 충분히 답했다면 바로 다음 단계로 넘어가도 돼요.</span>
                <button onClick={finishEarly} style={{ alignSelf: 'flex-start', height: 'var(--ctrl-sm)', padding: '0 14px', borderRadius: 9999, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  이 정도면 충분해요 <ArrowRight size={12} weight="bold" />
                </button>
              </div>
            )}
            {showQuickReplies && (
              <>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '-0.01em' }}>
                탭해서 담기 · 여러 개 골라도 돼요
              </span>
              {/* 선택지가 많은 질문에서 이 목록이 화면을 통째로 먹던 문제 — 대화가 위로
                  밀려 무슨 질문이었는지 안 보였다. 상한을 두고 안에서만 스크롤한다. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 168, overflowY: 'auto' }}>
                {currentQuestion.options.map((reply, i) => {
                  const picked = isPicked(reply);
                  return (
                  <button
                    key={i}
                    onClick={() => togglePart(reply)}
                    disabled={isTyping}
                    style={{
                      padding: '11px 12px',
                      borderRadius: 12,
                      border: `1.5px solid ${picked ? 'var(--coral-200)' : 'var(--sand-200)'}`,
                      background: picked ? 'var(--brand-soft)' : 'var(--surface-raised)',
                      color: picked ? 'var(--coral-700)' : 'var(--text-1)',
                      fontWeight: picked ? 700 : 400,
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
                  );
                })}
              </div>
              </>
            )}
            {!showQuickReplies && currentQuestion.suggestedAnswers && currentQuestion.suggestedAnswers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ width: '100%', fontSize: 12, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '-0.01em' }}>추천 답변 · 탭해서 담기</span>
                {currentQuestion.suggestedAnswers.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => togglePart(s)}
                    disabled={isTyping}
                    style={{ padding: '8px 12px', borderRadius: 9999, border: '1px solid var(--coral-200)', background: 'var(--brand-soft)', color: 'var(--coral-700)', fontSize: 12, textAlign: 'left', cursor: isTyping ? 'wait' : 'pointer', fontFamily: 'inherit', wordBreak: 'keep-all', opacity: isTyping ? 0.6 : 1 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {/* 날짜·시간 범위 전용 입력(#217). 자유 텍스트 입력과 같이 두면 어느 쪽 값이
                전송되는지 알 수 없으므로 한 번에 하나만 보여준다. */}
            {useTypedField && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {typedKind === 'date' ? (
                  <DateAnswerField value={inputText} onChange={setInputText} disabled={isTyping} />
                ) : (
                  <TimeRangeAnswerField value={inputText} onChange={setInputText} disabled={isTyping} />
                )}
                <button
                  onClick={() => { setInputText(''); setManualEntry(true); }}
                  style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
                >
                  직접 입력할게요
                </button>
              </div>
            )}
            {/* 말하는 중 인식 결과 미리보기 — 확정되면 위 입력창으로 옮겨간다. */}
            {speech.listening && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, minHeight: 18 }} aria-live="polite">
                {speech.interim ? `“${speech.interim}”` : '듣고 있어요…'}
              </div>
            )}
            {speech.error && (
              <span role="alert" style={{ fontSize: 12, color: 'var(--coral-700)' }}>{speech.error}</span>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: showQuickReplies ? 4 : 0, alignItems: 'flex-end' }}>
              {useTypedField ? null : currentQuestion.slotKey === 'goals.materials' ? (
                // 자료 원문 붙여넣기 — 여러 줄 붙여넣기가 편하도록 textarea (Enter=줄바꿈, 전송은 버튼).
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={placeholderFor(currentQuestion)}
                    disabled={isTyping}
                    rows={5}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '11px 14px',
                      borderRadius: 12,
                      border: '1.5px solid var(--sand-200)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-1)',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'vertical',
                      minHeight: 96,
                      lineHeight: 1.5,
                    }}
                  />
                  {/* 붙여넣기만 되던 자리에 파일로 넣는 길을 더한다. 파일은 서버로
                      보내지 않고 브라우저에서 글자만 읽어 위 칸에 채운다. */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.tsv,.json,.yml,.yaml,.log,text/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void readMaterialFile(f);
                      e.target.value = ''; // 같은 파일을 다시 골라도 onChange 가 뜨게
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isTyping}
                      data-tour-help="자료를 파일로 넣어요. txt·md·csv 처럼 글자로 된 파일을 고르면 내용이 위 칸에 들어와요."
                      style={{ height: 'var(--ctrl-sm)', padding: '0 12px', borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: isTyping ? 'wait' : 'pointer' }}
                    >
                      파일에서 불러오기
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 0 }}>
                      {fileNote ?? 'txt · md · csv 처럼 글자로 된 파일'}
                    </span>
                  </div>
                </div>
              ) : (
                <input
                  ref={textInputRef}
                  value={inputText}
                  onChange={(e) => {
                    rememberSelection(e.currentTarget);
                    setInputText(e.currentTarget.value);
                  }}
                  onSelect={(e) => rememberSelection(e.currentTarget)}
                  onCompositionStart={() => { composingRef.current = true; }}
                  onCompositionEnd={(e) => {
                    composingRef.current = false;
                    rememberSelection(e.currentTarget);
                    setInputText(e.currentTarget.value);
                  }}
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
              )}
              {/* 담은 걸 한 번에 비우기 — 여러 개 골라 담다 보면 지우려고 백스페이스를
                  길게 누르고 있어야 했다. 비어 있으면 자리를 만들지 않는다. */}
              {!useTypedField && inputText.trim() !== '' && (
                <button
                  onClick={() => setInputText('')}
                  disabled={isTyping}
                  aria-label="입력 지우기"
                  style={{ width: 44, height: 44, borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isTyping ? 'wait' : 'pointer', flexShrink: 0, opacity: isTyping ? 0.5 : 1 }}
                >
                  <X size={13} weight="bold" />
                </button>
              )}
              {/* 말로 답하기(#215) — 지원하지 않는 브라우저에서는 아예 그리지 않는다.
                  눌렀는데 아무 일도 안 일어나는 버튼이 없는 버튼보다 나쁘다. */}
              {showMic && (
                <button
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  disabled={isTyping}
                  aria-label={speech.listening ? '음성 입력 멈추기' : '말로 답하기'}
                  aria-pressed={speech.listening}
                  title={speech.listening ? '멈추기' : '말로 답하기'}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 9999,
                    border: `1px solid ${speech.listening ? 'transparent' : 'var(--coral-200)'}`,
                    background: speech.listening ? 'var(--brand-surface)' : 'var(--brand-soft)',
                    color: speech.listening ? '#FFFCF6' : 'var(--coral-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isTyping ? 'wait' : 'pointer',
                    flexShrink: 0,
                    opacity: isTyping ? 0.5 : 1,
                  }}
                >
                  {speech.listening ? <Stop size={14} weight="fill" /> : <Microphone size={16} weight="fill" />}
                </button>
              )}
              <button
                onClick={() => submit(inputText)}
                disabled={!canSubmit}
                aria-label="답변 보내기"
                style={{
                  width: useTypedField ? undefined : 44,
                  flex: useTypedField ? 1 : undefined,
                  height: 44,
                  borderRadius: useTypedField ? 12 : 9999,
                  border: 'none',
                  background: 'var(--brand-surface)',
                  color: '#FFFCF6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  flexShrink: 0,
                  opacity: canSubmit ? 1 : 0.5,
                }}
              >
                {useTypedField && <span>이 답으로 보내기</span>}
                <ArrowUp size={14} weight="fill" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onDone}
            style={{ width: '100%', height: 'var(--ctrl-lg)', borderRadius: 12, border: 'none', background: 'var(--brand-surface)', color: '#FFFCF6', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            목표 분류 확인 <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function placeholderFor(q: InterviewQuestion): string {
  if (q.slotKey === 'goals.materials') {
    return '여기에 붙여넣기 — 프로젝트 설명·README·강의계획서·요구사항 등 (없으면 넘겨도 돼요)';
  }
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
