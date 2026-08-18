import React from 'react';

export interface SectionHeaderProps {
  children: React.ReactNode;
  /** 우측 끝에 붙는 것 — "전체 보기" 링크나 개수 배지. */
  action?: React.ReactNode;
  /** 라벨 앞 아이콘. */
  icon?: React.ReactNode;
  /** danger 는 계정 삭제처럼 되돌릴 수 없는 구역에만. */
  tone?: 'default' | 'danger';
}

/**
 * 목록·구역 위에 붙는 작은 라벨. 화면 안에서 위계를 나누는 가장 약한 단계다.
 *
 * 크고 굵은 제목 대신 작고 넓은 자간의 대문자를 쓴다 — 구역 이름이 내용보다
 * 눈에 띄면 안 되기 때문. 강조가 필요하면 여기가 아니라 내용 쪽을 키운다.
 */
export function SectionHeader({ children, action, icon, tone = 'default' }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 5,
        padding: '0 4px',
        marginBottom: 10,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0',
          color: tone === 'danger' ? 'var(--danger-ink)' : 'var(--text-3)',
        }}
      >
        {icon}
        {children}
      </span>
      {action}
    </div>
  );
}
