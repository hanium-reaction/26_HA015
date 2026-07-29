import React from 'react';
import { Sparkle } from '@phosphor-icons/react';

export interface InboxBadge {
  label: string;
  icon?: React.ReactNode;
  bg: string;
  bd: string;
  fg: string;
}

export interface InboxItemCardProps {
  /** 사용자가 적은 원문 한 줄. 요약하거나 다듬지 않고 그대로 보여준다. */
  text: string;
  /** 상태·종류 배지. 자명한 상태(할 일 탭의 '분류됨')는 넘기지 않는다. */
  badges?: InboxBadge[];
  /** AI 가 추측한 카테고리 라벨. 있으면 ✨ 배지로 붙는다. */
  aiCategory?: string;
  /** 우측 정렬 액션 버튼들. */
  actions?: React.ReactNode;
}

/**
 * 인박스 한 항목. 머리에 떠오른 걸 일단 던져놓는 곳이라, 카드가 판단을 강요하지 않는다.
 *
 * 원문은 손대지 않고 그대로 보여준다 — AI 가 추측한 분류는 배지로만 옆에 붙여서,
 * 사용자가 그 추측을 그냥 받아들일지 무시할지 고르게 한다.
 */
export function InboxItemCard({ text, badges = [], aiCategory, actions }: InboxItemCardProps) {
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--sand-200)',
        borderRadius: 14,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>{text}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {badges.map((b, i) => (
          <span
            key={i}
            style={{
              height: 'var(--ctrl-xs)',
              padding: '0 8px',
              borderRadius: 9999,
              background: b.bg,
              border: `1px solid ${b.bd}`,
              fontSize: 10,
              fontWeight: 700,
              color: b.fg,
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {b.icon}
            {b.label}
          </span>
        ))}
        {aiCategory && (
          <span
            style={{
              height: 'var(--ctrl-xs)',
              padding: '0 8px',
              borderRadius: 9999,
              background: 'var(--sand-100)',
              border: '1px solid var(--sand-200)',
              fontSize: 10,
              color: 'var(--text-2)',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Sparkle size={9} weight="fill" /> {aiCategory}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {actions}
      </div>
    </div>
  );
}

export interface InboxActionProps {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  /** brand 는 주 행동(목표로·열기) 하나에만. 나머지는 quiet. */
  tone?: 'quiet' | 'brand';
}

/** 인박스 카드 안의 작은 액션 버튼. 카드마다 강조는 최대 하나만 준다. */
export function InboxAction({ children, onClick, icon, tone = 'quiet' }: InboxActionProps) {
  const brand = tone === 'brand';
  return (
    <button
      onClick={onClick}
      style={{
        height: 26,
        padding: '0 10px',
        borderRadius: 9999,
        border: `1px solid ${brand ? 'var(--coral-200)' : 'var(--sand-200)'}`,
        background: brand ? 'var(--brand-soft)' : 'var(--surface-raised)',
        color: brand ? 'var(--coral-700)' : 'var(--text-2)',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
