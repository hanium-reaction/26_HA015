import React from 'react';

export interface IconActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  /** danger 는 삭제처럼 되돌리기 어려운 것에만. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * 카드 안에 가로로 늘어놓는 작은 액션 버튼. 셋 정도까지가 한계다.
 *
 * danger 를 줘도 곧바로 실행하지 말고, 한 번 더 확인받는 단계를 호출하는 쪽에서 둔다.
 */
export function IconAction({ icon, label, onClick, tone = 'default', disabled = false }: IconActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 34,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        border: `1px solid ${tone === 'danger' ? 'var(--coral-200)' : 'var(--sand-200)'}`,
        background: 'var(--surface-ground)',
        color: tone === 'danger' ? 'var(--danger-ink)' : 'var(--text-2)',
        fontWeight: 600,
        fontSize: 11,
        cursor: disabled ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon} {label}
    </button>
  );
}
