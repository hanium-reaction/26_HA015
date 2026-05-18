import React from 'react';

interface SectionHeaderProps {
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionHeader({ children, action }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        padding: '0 4px',
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-3)',
        }}
      >
        {children}
      </span>
      {action}
    </div>
  );
}
