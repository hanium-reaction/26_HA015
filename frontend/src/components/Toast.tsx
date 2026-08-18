import React from 'react';

export type ToastTone = 'neutral' | 'error';

export interface ToastProps {
  children: React.ReactNode;
  /** error 면 붉은 배경. 저장 실패·되돌림처럼 결과가 뒤집힌 경우에 쓴다. */
  tone?: ToastTone;
  /** 탭바 위로 띄울 때의 아래 여백(px). 기본은 safe-area 를 존중하는 하단 고정. */
  bottom?: number;
  /** 문구 앞 아이콘. */
  icon?: React.ReactNode;
  /**
   * 되돌리기처럼 토스트 안에서 바로 누를 수 있는 행동. 있으면 토스트가
   * 클릭을 받는다(기본은 pointerEvents: none 이라 아래 화면을 막지 않는다).
   */
  action?: { label: string; onClick: () => void };
}

/**
 * 짧게 떴다 사라지는 결과 알림. 위치 고정(absolute)이라 화면 루트가
 * position: relative | absolute 여야 한다.
 *
 * 쓰는 자리: 되돌릴 수 있는 작은 결과("임시로 저장했어요"), 또는 실패해서
 * 화면 상태를 원래대로 돌렸다는 사실 통지. 사용자가 반드시 읽어야 하는
 * 에러라면 토스트가 아니라 ErrorBanner 를 쓴다 — 토스트는 사라지기 때문.
 */
export function Toast({ children, tone = 'neutral', bottom, icon, action }: ToastProps) {
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: bottom ?? 'max(16px, env(safe-area-inset-bottom, 16px))',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 80,
        pointerEvents: action ? 'auto' : 'none',
        padding: '0 16px',
      }}
    >
      <div
        style={{
          background: tone === 'error' ? 'var(--danger)' : 'var(--text-1)',
          color: '#FAF6EE',
          borderRadius: 12,
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: '100%',
        }}
      >
        {icon}
        {children}
        {action && (
          <button
            onClick={action.onClick}
            style={{ marginLeft: 4, padding: '4px 8px', borderRadius: 8, border: 'none', background: 'rgba(250,246,238,.16)', color: '#FAF6EE', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
