import { useState } from 'react';
import { Flask, X } from '@phosphor-icons/react';

// 백엔드가 아직 501(미구현)이라 화면이 하드코딩 더미를 보여줄 때, 그 사실을
// 사용자에게 정직하게 알리는 배너. 기존엔 더미를 실제 데이터처럼 보여줘
// "내 입력이 저장됐는지" 알 수 없는 게 가장 큰 UX 문제였다.
// 세션 동안 닫아두면 다시 안 뜨게 해서 노이즈를 줄인다.

interface DemoNoticeProps {
  // 닫기 상태를 세션에 기억할 키. 없으면 닫아도 다음 진입 시 다시 표시.
  storageKey?: string;
  children?: React.ReactNode;
}

const DEFAULT_TEXT = '지금은 미리보기 데이터예요. 백엔드 연동이 끝나면 실제 기록으로 바뀝니다.';

export function DemoNotice({ storageKey, children }: DemoNoticeProps) {
  const sk = storageKey ? `reaction.demoNotice.${storageKey}` : null;
  const [dismissed, setDismissed] = useState(
    () => !!sk && typeof window !== 'undefined' && sessionStorage.getItem(sk) === '1',
  );

  if (dismissed) return null;

  const close = () => {
    if (sk && typeof window !== 'undefined') sessionStorage.setItem(sk, '1');
    setDismissed(true);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        background: 'var(--sand-100)',
        border: '1px dashed var(--sand-300)',
        borderRadius: 10,
        color: 'var(--text-3)',
      }}
    >
      <Flask size={13} weight="fill" color="var(--text-3)" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, fontSize: 11, lineHeight: 1.5 }}>{children ?? DEFAULT_TEXT}</span>
      <button
        onClick={close}
        aria-label="닫기"
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: 9999,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
}
