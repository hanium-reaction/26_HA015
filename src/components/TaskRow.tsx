import React from 'react';
import type { Task } from '../types';
import { Chip } from './Chip';

interface TaskRowProps {
  task: Task;
  onToggle?: (id: string) => void;
  onOpen?: (id: string) => void;
}

export function TaskRow({ task, onToggle, onOpen }: TaskRowProps) {
  const { id, title, status, time, dur, tag, progress } = task;
  const isDone = status === 'done';
  const isPartial = status === 'partial_done';

  return (
    <div
      onClick={() => onOpen?.(id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--surface-raised)',
        border: `1px solid ${isPartial ? 'var(--coral-200)' : 'var(--sand-200)'}`,
        borderRadius: 16,
        padding: '14px 16px',
        cursor: 'pointer',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle?.(id); }}
        style={{
          width: 26,
          height: 26,
          borderRadius: 9999,
          border: `2px solid ${isDone ? '#6FA678' : isPartial ? 'var(--brand)' : 'var(--sand-300)'}`,
          background: isDone
            ? '#6FA678'
            : isPartial
            ? `conic-gradient(var(--brand) 0 ${progress ?? 50}%, var(--surface-raised) ${progress ?? 50}% 100%)`
            : 'transparent',
          flexShrink: 0,
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isDone && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFCF6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: '-0.01em',
            color: isDone ? 'var(--text-3)' : 'var(--text-1)',
            textDecoration: isDone ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
          {tag && <Chip tone={tag.tone} style={{ height: 20, padding: '0 8px', fontSize: 11 }}>{tag.label}</Chip>}
          {time && <span className="tnum">{time}</span>}
          {dur && <><span>·</span><span className="tnum">{dur}</span></>}
          {isPartial && <><span>·</span><span style={{ color: 'var(--coral-600)', fontWeight: 500 }}>recovery pending</span></>}
        </div>
      </div>
    </div>
  );
}
