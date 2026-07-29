import React from 'react';

export interface SkeletonBlockProps {
  /** 자리 개수. */
  count?: number;
  /** 각 자리의 높이(px). */
  height?: number;
  /** 모서리 반경(px). */
  radius?: number;
  /** 자리 사이 간격(px). */
  gap?: number;
}

/**
 * 첫 fetch 가 끝날 때까지 자리를 잡아두는 placeholder.
 *
 * 이게 있어야 "더미 → 실데이터" 깜빡임 없이 빈 화면을 정직하게 넘길 수 있다.
 * 애니메이션은 쓰지 않는다 — 전역 @keyframes 를 추가하지 않기로 한 결정에 따라
 * 정적 muted 박스로만 표현한다.
 */
export function SkeletonBlock({ count = 3, height = 64, radius = 12, gap = 8 }: SkeletonBlockProps) {
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            height,
            borderRadius: radius,
            border: '1px solid var(--sand-200)',
            background: i % 2 === 0 ? 'var(--surface-raised)' : 'var(--sand-100)',
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}
