import React from 'react';
import { Check } from '@phosphor-icons/react';
import type { Task } from '../types';

export interface TaskRowProps {
  task: Task;
  /** 예약 시각(HH:MM). task.time 보다 우선. */
  time?: string;
  /** "60분" 같은 소요. 제목 아래에 붙는다. */
  dur?: string;
  /** 목표 이름 — 히어로 카드와 같은 언어로 읽히게 한다. */
  goalLabel?: string;
  /** 목표 카테고리 색. 라벨과 항상 함께 쓴다(색만으로 구분하지 않는다). */
  goalColor?: { bg: string; bd: string; fg: string };
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
export function TaskRow({
  task,
  time,
  dur,
  goalLabel,
  goalColor,
  onSelect,
  onFailedRecover,
  onPartialRecover,
}: TaskRowProps) {
  const done = task.status === 'done';
  const failed = task.status === 'failed';
  const partial = task.status === 'partial_done' || task.status === 'recovery_pending';
  const inProgress = task.status === 'in_progress';
  const onClick = done ? undefined : failed ? onFailedRecover : partial ? onPartialRecover : onSelect;
  const shownTime = time ?? task.time;
  const shownDur = dur ?? task.dur;
  const hasMeta = Boolean(shownDur || goalLabel);

  return (
    <button
      onClick={onClick}
      disabled={done}
      style={{
        display: 'flex',
        alignItems: hasMeta ? 'flex-start' : 'center',
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
          marginTop: hasMeta ? 2 : 0,
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
        {failed && <span style={{ fontSize: 11, color: 'var(--danger-ink)', fontWeight: 700 }}>✗</span>}
        {(partial || inProgress) && (
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--brand)' }} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontSize: 14,
            color: done ? 'var(--text-3)' : failed ? 'var(--danger-ink)' : 'var(--text-1)',
            textDecoration: done ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: partial ? 600 : 500,
          }}
        >
          {task.title}
        </span>
        {/* 히어로 카드와 같은 정보를 같은 순서로 — 목록에서도 "얼마나·무슨 목표"가 읽히게. */}
        {hasMeta && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', minWidth: 0 }}>
            {shownDur && <span className="tnum">{shownDur}</span>}
            {shownDur && goalLabel && <span style={{ opacity: 0.5 }}>·</span>}
            {goalLabel && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 9999,
                    background: goalColor?.bd ?? 'var(--sand-300)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goalLabel}</span>
              </span>
            )}
          </span>
        )}
      </span>
      {shownTime && (
        <span className="tnum" style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0, fontWeight: 600 }}>
          {shownTime}
        </span>
      )}
    </button>
  );
}
