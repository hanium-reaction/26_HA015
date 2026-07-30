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
 *
 * 은은한 shimmer 를 넣는다(index.css 의 .rx-skeleton). 정적 muted 박스만 두면
 * 실측 화면에서 "로딩 중" 이 아니라 "데이터가 없는 빈 화면" 으로 읽혀서,
 * 사용자가 기다려야 하는 상황인 줄 모른다.
 */
export function SkeletonBlock({ count = 3, height = 64, radius = 12, gap = 8 }: SkeletonBlockProps) {
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="rx-skeleton"
          style={{
            height,
            borderRadius: radius,
            border: '1px solid var(--sand-200)',
            // backgroundColor 로 준다 — background 단축 속성을 쓰면 .rx-skeleton 의
            // shimmer 그라디언트(background-image/size)까지 같이 리셋돼 애니메이션이
            // 돌아도 눈에 보이는 게 없다(실측으로 확인).
            backgroundColor: i % 2 === 0 ? 'var(--surface-raised)' : 'var(--sand-100)',
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}
