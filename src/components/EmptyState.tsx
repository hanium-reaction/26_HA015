import React from 'react';

export type EmptyStateTone = 'quiet' | 'hero';

export interface EmptyStateProps {
  /** 한 줄 제목. hero 톤에서만 크게 표시된다. */
  title?: string;
  /** 본문. 문자열 대신 노드를 넘겨 <b>·<br/> 을 섞어도 된다. */
  children: React.ReactNode;
  /**
   * quiet — 목록 사이에 끼는 점선 안내 박스(기본).
   * hero  — 화면 주역 자리가 통째로 비었을 때 쓰는 큰 카드.
   */
  tone?: EmptyStateTone;
  /** 아이콘 등 본문 위에 얹을 것. hero 에서만 의미 있다. */
  icon?: React.ReactNode;
}

/**
 * 정직한 빈 상태. 더미 데이터로 채우지 않고 "지금 없다"를 그대로 말한다.
 *
 * 점선 테두리는 "아직 내용이 없다"는 신호로 앱 전체에서 일관되게 쓴다
 * (AiDraftCard 의 점선 = 미확정 초안과 같은 계열의 의미).
 */
export function EmptyState({ title, children, tone = 'quiet', icon }: EmptyStateProps) {
  if (tone === 'hero') {
    return (
      <div
        style={{
          background: 'var(--surface-raised)',
          border: '1px dashed var(--sand-300)',
          borderRadius: 24,
          padding: '36px 20px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {icon}
        {title && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 22,
              color: 'var(--text-2)',
            }}
          >
            {title}
          </div>
        )}
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.55 }}>{children}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-raised)',
        border: '1px dashed var(--sand-200)',
        fontSize: 12,
        color: 'var(--text-2)',
        lineHeight: 1.5,
      }}
    >
      {title && <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  );
}
