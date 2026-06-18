import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle, WarningCircle, Info } from '@phosphor-icons/react';

// 앱 전역 토스트. 기존엔 화면마다 자체 toast state 를 두거나 (TodayScreen),
// 저장 실패를 .catch(()=>{}) 로 조용히 삼켰다 (Recovery/Evening/Weekly).
// 사용자가 자기 행동의 결과(저장됨/실패/데모)를 항상 알 수 있도록 한 곳으로 통합.

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const noop = () => {};
const ToastContext = createContext<ToastApi>({
  show: noop,
  success: noop,
  error: noop,
  info: noop,
});

export const useToast = () => useContext(ToastContext);

let seq = 0;

const TONE_META: Record<ToastTone, { dot: string; Icon: typeof CheckCircle }> = {
  success: { dot: 'var(--success)', Icon: CheckCircle },
  error: { dot: 'var(--danger)', Icon: WarningCircle },
  info: { dot: 'var(--brand)', Icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++seq;
      setToasts((list) => [...list, { id, message, tone }]);
      setTimeout(() => remove(id), 2800);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m: string) => show(m, 'success'),
      error: (m: string) => show(m, 'error'),
      info: (m: string) => show(m, 'info'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: 9999,
        pointerEvents: 'none',
        padding: '0 16px',
      }}
    >
      {toasts.map((t) => {
        const meta = TONE_META[t.tone];
        const Icon = meta.Icon;
        return (
          <button
            key={t.id}
            onClick={() => onClose(t.id)}
            style={{
              pointerEvents: 'auto',
              maxWidth: 360,
              background: 'var(--text-1)',
              color: '#FAF6EE',
              borderRadius: 9999,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: 'inherit',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: 'var(--shadow-lg)',
              animation: 'toastIn 200ms var(--ease-out, ease-out)',
            }}
          >
            <Icon size={15} weight="fill" color={meta.dot} style={{ flexShrink: 0 }} />
            <span style={{ textAlign: 'left' }}>{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
