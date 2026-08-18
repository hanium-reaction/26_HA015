import React from 'react';
import type { ChipTone } from '../types';

interface ChipProps {
  children: React.ReactNode;
  tone?: ChipTone;
  style?: React.CSSProperties;
}

const tones: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--sand-100)', fg: 'var(--text-2)' },
  coral:   { bg: '#FDF2EC', fg: '#9E472F' },
  success: { bg: '#E5EFE3', fg: '#3D6346' },
  warning: { bg: '#FBEEDA', fg: '#7D561C' },
  plum:    { bg: '#F2E9EE', fg: '#5C3848' },
  sage:    { bg: '#EEF1E5', fg: '#5F724D' },
  sky:     { bg: '#EAF0F7', fg: '#4D7AA8' },
  amber:   { bg: '#FBF1E0', fg: '#B2731F' },
};

export function Chip({ children, tone = 'neutral', style = {} }: ChipProps) {
  const t = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 10px',
        borderRadius: 9999,
        background: t.bg,
        color: t.fg,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
