import React from 'react';
import { Check, Info } from '@phosphor-icons/react';

export interface RecoveryOptionCardProps {
  title: string;
  /** if-then 의 then 쪽. "10분만 해보기" 처럼 행동으로 쓴다. */
  description?: string;
  /** if-then 의 if 쪽. "다시 막히면" 처럼 조건으로 쓴다. 앞에 "만약"이 자동으로 붙는다. */
  trigger?: string;
  /** 예상 성공률(0~100). 0 이면 표시하지 않는다 — 근거 없는 숫자를 지어내지 않는다. */
  confidence?: number;
  /** "오늘 21:00 · 20분" 같은 시점 요약. */
  timeLabel?: string;
  /** 첫 번째(=추천) 항목에만 준다. */
  recommended?: boolean;
  selected?: boolean;
  onSelect: () => void;
  /** 이 제안을 왜 골랐는지. 있으면 [왜?] 버튼이 생긴다. */
  why?: string;
  whyOpen?: boolean;
  onToggleWhy?: () => void;
  /** 선택 시 쓰는 강조색. 제안 묶음(더 작게/쉬기/다시)별로 다르다. */
  colors?: { bg: string; bc: string; ac: string };
}

const DEFAULT_COLORS = { bg: 'var(--brand-soft)', bc: 'var(--coral-200)', ac: 'var(--brand)' };

/**
 * 막혔을 때 내미는 회복 제안 하나.
 *
 * 전부 점선 테두리다 — AI 초안이고 사용자가 고르기 전엔 아무것도 확정되지 않는다.
 * 고른 것만 실선처럼 굵어진다.
 *
 * if-then 형식을 쓰는 이유: "만약 [막히면], [10분만]" 처럼 조건과 행동을 미리 묶어두면
 * 그 순간 판단할 필요가 없어진다. 그래서 trigger 는 가능하면 채워서 넘긴다.
 *
 * 성공률은 없으면 없는 대로 둔다. 0 을 넘기면 아예 렌더하지 않는다.
 */
export function RecoveryOptionCard({
  title,
  description,
  trigger,
  confidence = 0,
  timeLabel,
  recommended = false,
  selected = false,
  onSelect,
  why,
  whyOpen = false,
  onToggleWhy,
  colors = DEFAULT_COLORS,
}: RecoveryOptionCardProps) {
  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 14,
        border: `${selected ? '1.5px' : '1px'} dashed ${selected ? colors.bc : 'var(--sand-300)'}`,
        background: selected ? colors.bg : 'var(--surface-raised)',
        cursor: 'pointer',
        transition: 'all 160ms',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: whyOpen ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 9999,
              flexShrink: 0,
              border: `1.5px solid ${selected ? colors.ac : 'var(--sand-300)'}`,
              background: selected ? colors.ac : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected && <Check size={10} color="#FFFCF6" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{title}</div>
            {description && (
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.45 }}>
                {trigger && (
                  <>
                    <span style={{ color: 'var(--coral-700)', fontWeight: 600 }}>만약 {trigger},</span>{' '}
                  </>
                )}
                {description}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}>
              {recommended && (
                <span
                  style={{
                    height: 'var(--ctrl-xs)',
                    padding: '0 6px',
                    background: colors.bg,
                    border: `1px solid ${colors.bc}`,
                    borderRadius: 9999,
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--coral-700)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    letterSpacing: '0.04em',
                  }}
                >
                  추천 ✓
                </span>
              )}
              {confidence > 0 && (
                <span
                  className="tnum"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: confidence > 80 ? 'var(--success-ink)' : confidence > 65 ? 'var(--warning-ink)' : 'var(--text-3)',
                  }}
                >
                  성공률 {confidence}%
                </span>
              )}
              {timeLabel && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{timeLabel}</span>}
            </div>
          </div>
        </div>
        {why && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleWhy?.();
            }}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              fontSize: 11,
              color: 'var(--coral-700)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '0 0 0 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Info size={12} /> 왜?
          </button>
        )}
      </div>
      {whyOpen && why && (
        <div
          style={{
            marginTop: 6,
            padding: '8px 10px',
            background: 'var(--brand-soft)',
            borderRadius: 8,
            fontSize: 11,
            color: 'var(--coral-700)',
            lineHeight: 1.5,
          }}
        >
          {why}
        </div>
      )}
    </div>
  );
}
