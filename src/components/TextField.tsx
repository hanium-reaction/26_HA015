import React from 'react';

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 입력 위에 붙는 작은 라벨. */
  label?: string;
  /** 입력 아래 안내. error 가 있으면 그쪽이 우선한다. */
  hint?: string;
  /** 있으면 테두리가 danger 색으로 바뀌고 문구가 아래에 붙는다. */
  error?: string | null;
  /** 가로를 꽉 채울지. 기본 true. */
  full?: boolean;
}

/** 폼 요소 공통 면 — TextField 와 select 가 같은 모양이 되도록 공유한다. */
export const fieldSurface: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 9,
  border: '1px solid var(--sand-200)',
  background: 'var(--surface-raised)',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  color: 'var(--text-1)',
};

/**
 * 한 줄 텍스트 입력. 목표 제목·마감일처럼 짧은 값에 쓴다.
 *
 * select 를 나란히 둘 땐 style={fieldSurface} 를 그대로 얹으면 높이·테두리가 맞는다.
 */
export function TextField({ label, hint, error, full = true, style, ...rest }: TextFieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, width: full ? '100%' : undefined }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{label}</span>
      )}
      <input
        {...rest}
        aria-invalid={error ? true : undefined}
        style={{
          ...fieldSurface,
          width: full ? '100%' : undefined,
          borderColor: error ? 'var(--danger)' : 'var(--sand-200)',
          ...style,
        }}
      />
      {(error || hint) && (
        <span style={{ fontSize: 10, color: error ? 'var(--danger)' : 'var(--text-3)', lineHeight: 1.4 }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
