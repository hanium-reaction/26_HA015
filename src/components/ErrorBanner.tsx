import React from 'react';

export interface ErrorBannerProps {
  /** 사용자에게 보여줄 문구. friendlyError() 로 한국어 변환한 값을 넣는다. */
  children: React.ReactNode;
  /** 재시도 버튼 등 문구 아래 붙일 액션. */
  action?: React.ReactNode;
  /**
   * 스크린리더에 즉시 알릴지. 사용자 조작 결과로 뜬 에러는 true(기본),
   * 첫 로드 실패처럼 이미 화면에 있던 것은 false 로 낮춘다.
   */
  live?: boolean;
}

/**
 * 실패를 숨기지 않고 그대로 보여주는 배너. 조용히 삼키거나 더미로 대체하지 않는다.
 *
 * 톤 주의: 문구는 무엇이 안 됐는지 + 다음에 뭘 하면 되는지까지만 쓴다.
 * 사용자를 탓하는 표현은 쓰지 않는다("잘못 입력하셨어요" ✗).
 */
export function ErrorBanner({ children, action, live = true }: ErrorBannerProps) {
  return (
    <div
      role={live ? 'alert' : undefined}
      style={{
        background: '#FAE2D8',
        border: '1px solid var(--coral-200)',
        color: 'var(--coral-700)',
        borderRadius: 10,
        padding: '10px 12px',
        fontSize: 12,
        lineHeight: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span>{children}</span>
      {action}
    </div>
  );
}
