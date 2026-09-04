import React from 'react';
import { GOAL_STATUS_META } from '../data';
import type { GoalStatus } from '../types';

export interface GoalCardProps {
  title: string;
  /** focus(집중) / maintain(유지) / parked(보류). 배지 색·라벨이 여기서 정해진다. */
  tier: GoalStatus;
  /** "자격증" 같은 사람이 읽는 카테고리 라벨. 내부 enum 값을 그대로 넣지 않는다. */
  categoryLabel?: string;
  /** YYYY-MM-DD. 있으면 "~2026-08-30" 으로 붙는다. */
  deadline?: string | null;
  priorityLevel?: number | null;
  /** 펼침 상태 — 테두리가 tier 색으로 바뀐다. */
  expanded?: boolean;
  onToggle?: () => void;
  /**
   * 이 목표에 **이번 주기 계획이 없다** (서버 `hasPlan === false`).
   *
   * ⚠️ 예전엔 `status === 'proposed'` 로 판정했는데 그러면 **절반만 잡힌다.**
   * 계획 승인은 인터뷰가 뽑은 목표를 **전부** `active` 로 승격하지만 계획은
   * heaviest **하나**에만 만들어진다 — 실측으로 계획 없는 active 목표가 24건이었고,
   * 그 카드들이 계획 있는 목표와 구분되지 않았다.
   *
   * 표시가 없으면 "왜 이게 저장돼 있지" 가 되고, 사용자는 계획을 세울 길도 못 찾는다.
   */
  unplanned?: boolean;
  /** 펼쳤을 때 카드 아래에 붙는 것(수정 폼·액션 버튼 등). */
  children?: React.ReactNode;
}

const chip: React.CSSProperties = {
  height: 'var(--ctrl-xs)',
  padding: '0 7px',
  background: 'var(--sand-100)',
  border: '1px solid var(--sand-200)',
  borderRadius: 9999,
  fontSize: 10,
  color: 'var(--text-2)',
  display: 'inline-flex',
  alignItems: 'center',
};

/**
 * 목표 하나. 목표 관리 화면에서 tier 별로 묶여 나온다.
 *
 * tier 가 이 제품의 핵심 제약이다 — 집중은 최대 3개, 유지는 5개. 한 번에
 * 좇을 수 있는 목표 수를 강제로 좁혀야 계획이 지켜지기 때문이고, 그래서
 * tier 배지가 제목보다 먼저 온다.
 *
 * 펼치기 전에는 읽을 것만 보여주고, 수정·분해·삭제 같은 건 children 으로
 * 넘겨 펼쳤을 때만 나오게 한다.
 */
export function GoalCard({
  title,
  tier,
  categoryLabel,
  deadline,
  priorityLevel,
  expanded = false,
  onToggle,
  unplanned = false,
  children,
}: GoalCardProps) {
  const m = GOAL_STATUS_META[tier];
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: `1.5px solid ${expanded ? m.border : 'var(--sand-200)'}`,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: onToggle ? 'pointer' : 'default' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
            <span
              style={{
                height: 'var(--ctrl-xs)',
                padding: '0 8px',
                borderRadius: 9999,
                background: m.bg,
                border: `1px solid ${m.border}`,
                fontSize: 10,
                fontWeight: 700,
                color: m.color,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {m.label}
            </span>
            {categoryLabel && <span style={chip}>{categoryLabel}</span>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
            {unplanned && (
              <span
                style={{
                  ...chip,
                  background: 'var(--brand-soft)',
                  border: '1px solid var(--coral-200)',
                  color: 'var(--coral-700)',
                  fontWeight: 700,
                }}
              >
                미계획
              </span>
            )}
            {deadline && (
              <span className="tnum" style={chip}>
                ~{deadline}
              </span>
            )}
            {priorityLevel != null && (
              <span className="tnum" style={{ ...chip, color: 'var(--text-3)' }}>
                우선순위 {priorityLevel}
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && children && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--sand-200)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
