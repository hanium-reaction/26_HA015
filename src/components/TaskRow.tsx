import React from 'react';
import { Check } from '@phosphor-icons/react';
import type { Task } from '../types';

export interface TaskRowProps {
  task: Task;
  /** todo 를 눌렀을 때 — 주역 카드로 올린다(시작은 그쪽 CTA 에서). */
  onSelect: () => void;
  /** failed 를 눌렀을 때 — 회복 제안으로 보낸다. */
  onFailedRecover: () => void;
  /** partial_done / recovery_pending 을 눌렀을 때 — 회복 제안으로 보낸다. */
  onPartialRecover: () => void;
}

/**
 * 오늘 목록의 한 줄. 주역 카드 아래에 나머지 할 일을 얇게 늘어놓는다.
 *
 * 상태에 따라 누를 때 가는 곳이 다르다:
 *   done       → 아무 일도 없음(이미 끝난 것을 되돌리게 만들지 않는다)
 *   failed     → 회복 제안
 *   일부만      → 회복 제안
 *   todo       → 주역 카드로 승격
 *
 * 막힌 항목을 눌렀을 때 회복으로 가는 게 핵심이다. 실패한 줄이 그냥
 * 붉게 남아 있기만 하면 사용자는 그걸 자기 실패 기록으로 읽는다.
 */
export function TaskRow({ task, onSelect, onFailedRecover, onPartialRecover }: TaskRowProps) {
  const done = task.status === 'done';
  const failed = task.status === 'failed';
  const partial = task.status === 'partial_done' || task.status === 'recovery_pending';
  const inProgress = task.status === 'in_progress';
  const onClick = done ? undefined : failed ? onFailedRecover : partial ? onPartialRecover : onSelect;

  return (
    <button
      onClick={onClick}
      disabled={done}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 14px',
        borderRadius: 12,
        border: 'none',
        background: 'transparent',
        cursor: done ? 'default' : 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 9999,
          flexShrink: 0,
          border: done
            ? 'none'
            : `1.5px solid ${failed ? 'var(--danger)' : inProgress || partial ? 'var(--brand)' : 'var(--sand-300)'}`,
          background: done ? 'var(--success)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done && <Check size={11} weight="bold" color="#FFFCF6" />}
        {failed && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>✗</span>}
        {(partial || inProgress) && (
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--brand)' }} />
        )}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 14,
          color: done ? 'var(--text-3)' : failed ? 'var(--danger)' : 'var(--text-1)',
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: partial ? 600 : 500,
        }}
      >
        {task.title}
      </span>
      {task.time && (
        <span className="tnum" style={{ fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>
          {task.time}
        </span>
      )}
    </button>
  );
}
