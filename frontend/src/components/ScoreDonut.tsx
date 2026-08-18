import React from 'react';

export interface ScoreDonutProps {
  /** 0~100. 주간 실행 점수. */
  score: number;
  size?: number;
  stroke?: number;
  /** 숫자 아래 단위 문구. */
  caption?: string;
}

/**
 * 주간 리뷰 상단의 점수 도넛.
 *
 * 점수는 등급이 아니라 이번 주가 어땠는지의 요약이다. 그래서 색을 점수에 따라
 * 바꾸지 않는다 — 낮은 점수를 빨갛게 칠하면 리뷰 화면이 성적표가 되고,
 * 그 순간 사용자는 앱을 안 열게 된다. 늘 같은 코랄로 채운다.
 */
export function ScoreDonut({ score, size = 120, stroke = 12, caption = '/ 100' }: ScoreDonutProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label={`이번 주 점수 ${score}점`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--sand-200)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--brand)"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
      />
      <text
        x={size / 2}
        y={size / 2 - 3}
        textAnchor="middle"
        fontSize={size * 0.25}
        fontWeight="800"
        fill="var(--text-1)"
        fontFamily="Pretendard Variable"
        style={{ letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}
      >
        {score}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 15}
        textAnchor="middle"
        fontSize="10"
        fill="var(--text-3)"
        fontFamily="Pretendard Variable"
        letterSpacing="0.06em"
      >
        {caption}
      </text>
    </svg>
  );
}
