import React from 'react';

export interface ToggleProps {
  on: boolean;
  /** 없으면 표시 전용(부모 행 전체가 클릭 대상인 경우). */
  onChange?: (next: boolean) => void;
  /** 스크린리더용 이름. onChange 를 줄 땐 반드시 함께 준다. */
  label?: string;
  disabled?: boolean;
}

/** 설정 화면의 on/off 스위치. 켜짐만 브랜드 색으로 채운다. */
export function Toggle({ on, onChange, label, disabled = false }: ToggleProps) {
  const visual = (
    <div
      style={{
        width: 36,
        height: 20,
        borderRadius: 9999,
        background: on ? 'var(--brand)' : 'var(--sand-300)',
        position: 'relative',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: '#fff',
          transition: 'left 160ms',
        }}
      />
    </div>
  );

  if (!onChange) return visual;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
      }}
    >
      {visual}
    </button>
  );
}
