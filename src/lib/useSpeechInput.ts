import { useCallback, useEffect, useRef, useState } from 'react';

// 브라우저 음성 인식(Web Speech API) 훅 — 온보딩 인터뷰의 타이핑 피로를 줄인다(#215).
//
// 백엔드에 음성 업로드 엔드포인트가 아직 없어서(openapi.json 기준) 추가 인프라 없이
// 붙일 수 있는 브라우저 API 를 쓴다. 나중에 서버 STT 가 준비되면 이 훅 내부만 갈아끼우면
// 되고 화면 코드는 그대로다.
//
// lib.dom.d.ts 에 SpeechRecognition 이 없는 TS 버전이 아직 흔해서 전역 선언 대신
// 최소 구조만 로컬로 정의한다(전역 declare 는 lib 이 이미 정의한 환경에서 충돌한다).

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechErrorEvent {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// 인식 실패 코드 → 사용자가 읽고 다음 행동을 정할 수 있는 문장.
function messageFor(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '마이크 권한이 막혀 있어요. 브라우저 설정에서 허용한 뒤 다시 시도해주세요.';
    case 'no-speech':
      return '소리가 들리지 않았어요. 다시 눌러서 말해주세요.';
    case 'audio-capture':
      return '마이크를 찾지 못했어요. 연결 상태를 확인해주세요.';
    case 'network':
      return '네트워크 문제로 음성 인식이 중단됐어요.';
    case 'aborted':
      return '';
    default:
      return '음성 인식에 실패했어요. 직접 입력해주세요.';
  }
}

export interface SpeechInput {
  /** 이 브라우저가 음성 인식을 지원하는지. false 면 마이크 버튼을 아예 그리지 않는다. */
  supported: boolean;
  listening: boolean;
  /** 아직 확정되지 않은 인식 결과 — 말하는 도중 미리보기용. */
  interim: string;
  /** 마지막 오류 메시지(사용자 노출용). 없으면 null. */
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * @param onFinal 확정된 문장이 나올 때마다 호출된다. 여기서 입력창에 이어붙인다.
 *                자동 전송하지 않는 것은 의도다 — 잘못 인식된 답 하나가 계획 전체를 가른다.
 */
export function useSpeechInput(onFinal: (text: string) => void): SpeechInput {
  const [supported] = useState(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // onFinal 이 매 렌더 새 함수여도 인식기를 다시 만들지 않도록 ref 로 최신값만 들고 있는다.
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    // stop() 은 onend 를 태우지만, 이미 끊긴 인스턴스면 예외가 난다 — 무시해도 되는 종류.
    try { rec.stop(); } catch { /* 이미 종료됨 */ }
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    if (recRef.current) { stop(); return; }

    setError(null);
    setInterim('');

    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? '';
        if (r.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      const msg = messageFor(e.error);
      if (msg) setError(msg);
      // 오류가 나면 브라우저가 알아서 끊는다 — 상태만 맞춰둔다.
      recRef.current = null;
      setListening(false);
      setInterim('');
    };

    rec.onend = () => {
      // 사용자가 멈췄든 브라우저가 침묵으로 끊었든, 듣고 있지 않다는 사실은 같다.
      recRef.current = null;
      setListening(false);
      setInterim('');
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      // 같은 인스턴스를 연달아 start 하면 InvalidStateError. 조용히 무시하고 꺼진 상태 유지.
      recRef.current = null;
      setListening(false);
    }
  }, [stop]);

  // 화면을 벗어나면 마이크를 놓는다 — 안 그러면 인식기가 백그라운드에서 계속 돈다.
  useEffect(() => stop, [stop]);

  return { supported, listening, interim, error, start, stop };
}
