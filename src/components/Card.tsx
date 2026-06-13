import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padded?: boolean;
  raised?: boolean;
  onClick?: () => void;
}

export function Card({ children, style = {}, padded = true, raised = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: 'var(--surface-raised)',
        border: raised ? 'none' : '1px solid var(--sand-200)',
        borderRadius: 20,
        padding: padded ? 20 : 0,
        boxShadow: raised ? 'var(--shadow-md)' : 'none',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
