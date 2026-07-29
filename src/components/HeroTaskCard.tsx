import React from 'react';
import { CaretRight, Check } from '@phosphor-icons/react';
import type { Task } from '../types';
import { EmptyState } from './EmptyState';

export interface HeroTaskCardProps {
  /** null 이면 "오늘 할 일이 없어요" 빈 상태로 대체된다. */
  task: Task | null;
  /** 오늘 완료 개수 / 전체 개수 — 카드 우상단 진척 표시용. */
  done: number;
  total: number;
  onComplete: () => void;
  onPartial: () => void;
  onFail: () => void;
  onStart: (id: string) => void;
  /** whyNow·firstStep 이 있을 때만 노출되는 "왜 지금?" 링크. */
  onDetail: () => void;
}

/**
 * 오늘 화면의 주인공 카드. 지금 할 일 딱 하나만 크게 보여준다.
 *
 * 설계 의도: 목록을 훑게 하지 않고 "다음 한 개"로 시선을 좁힌다. 그래서
 * 화면에 이 카드가 하나뿐이고, 진행 전에는 CTA 도 [시작하기] 하나뿐이다.
 *
 * 진행 중으로 바뀌면 버튼이 셋으로 갈라진다 — 완료 / ◑ 일부만 / ✗ 잘 안됨.
 * 이 세 갈래가 앱 전체의 상태 어휘이고, 어느 쪽을 눌러도 실패로 끝나지 않고
 * 회복 흐름으로 이어진다.
 */
export function HeroTaskCard({
  task,
  done,
  total,
  onComplete,
  onPartial,
  onFail,
  onStart,
  onDetail,
}: HeroTaskCardProps) {
  if (!task) {
    return (
      <EmptyState tone="hero" title="오늘 할 일이 없어요">
        주간 계획에서 블록을 추가해보세요.
      </EmptyState>
    );
  }

  const isActive = task.status === 'in_progress';
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1.5px solid var(--coral-200)',
        borderRadius: 24,
        padding: '24px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--coral-700)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {isActive ? '진행 중' : '다음 할 일'}
        </span>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {done} / {total} · {pct}%
        </span>
      </div>

      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            margin: 0,
            color: 'var(--text-1)',
          }}
        >
          {task.title}
        </h2>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {task.carryover && (
            <span
              style={{
                height: 'var(--ctrl-xs)',
                padding: '0 6px',
                background: '#FBEEDA',
                border: '1px solid #F2D29A',
                borderRadius: 9999,
                fontSize: 10,
                color: 'var(--warning-ink)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              ↩ 이월
            </span>
          )}
          {task.time && (
            <span className="tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {task.time}
              {task.dur ? ` · ${task.dur}` : ''}
            </span>
          )}
        </div>
        {(task.whyNow || task.firstStep) && (
          <button
            onClick={onDetail}
            style={{
              marginTop: 10,
              alignSelf: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--coral-700)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            왜 지금? · 자세히 <CaretRight size={11} />
          </button>
        )}
      </div>

      {isActive ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onComplete}
            style={{
              flex: 2,
              height: 52,
              borderRadius: 14,
              border: 'none',
              background: 'var(--brand-surface)',
              color: '#FFFCF6',
              fontWeight: 700,
              fontSize: 15,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Check size={16} weight="bold" /> 완료
          </button>
          <button
            onClick={onPartial}
            aria-label="일부만 함"
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: '1px solid var(--sand-200)',
              background: 'var(--surface-ground)',
              color: 'var(--text-2)',
              fontSize: 16,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            ◑
          </button>
          <button
            onClick={onFail}
            aria-label="잘 안됨"
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              border: '1px solid var(--coral-200)',
              background: '#FAE2D8',
              color: 'var(--danger-ink)',
              fontSize: 16,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            ✗
          </button>
        </div>
      ) : (
        <button
          onClick={() => onStart(task.id)}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 14,
            border: 'none',
            background: 'var(--text-1)',
            color: '#FAF6EE',
            fontWeight: 700,
            fontSize: 15,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          시작하기 <CaretRight size={14} />
        </button>
      )}
    </div>
  );
}
