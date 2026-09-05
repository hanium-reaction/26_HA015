import React from 'react';
import type { ButtonVariant, ButtonSize } from '../types';

interface ReButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
  full?: boolean;
  // 가이드 투어(GuidedTourOverlay)가 읽어 갈 설명. 받아서 실제 <button> 으로 넘긴다.
  //
  // 통로가 없으면 <ReButton data-tour-help="…"> 는 조용히 버려진다 — TypeScript 는
  // 하이픈이 들어간 JSX 속성을 검사하지 않아서 오류도 나지 않는다. 속성을 제자리에
  // 옮겨 적어도 그 버튼만 설명이 안 뜨는데, 화면에는 아무 이상이 없어 보인다.
  'data-tour-help'?: string;
}

const heights: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
const fontSizes: Record<ButtonSize, number> = { sm: 14, md: 15, lg: 16 };

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: 'var(--brand-surface)', color: '#FFFCF6', border: 'none' },
  ghost:   { background: 'transparent', color: 'var(--text-1)', border: '1px solid var(--sand-200)' },
  text:    { background: 'transparent', color: 'var(--brand-ink)', border: 'none', padding: 0 },
  pill:    { background: 'var(--brand-surface)', color: '#FFFCF6', border: 'none', borderRadius: 9999 },
  coral:   { background: 'var(--brand-soft)', color: 'var(--coral-700)', border: '1.5px solid var(--brand)' },
};

export function ReButton({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  style = {},
  disabled,
  full,
  'data-tour-help': tourHelp,
}: ReButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-tour-help={tourHelp}
      style={{
        height: heights[size],
        minWidth: 44,
        padding: variant === 'text' ? 0 : '0 20px',
        borderRadius: 12,
        fontFamily: 'inherit',
        fontWeight: 600,
        fontSize: fontSizes[size],
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        transition: 'all 160ms cubic-bezier(0.22,0.61,0.36,1)',
        opacity: disabled ? 0.4 : 1,
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
