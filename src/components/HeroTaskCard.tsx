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
  /**
   * 예약 시각(HH:MM). task.time 보다 우선한다. 오늘 화면은 이걸 주간 계획에서
   * 가져와 넘긴다 — 실행 목록(agenda) 응답에는 시각이 없기 때문.
   */
  time?: string;
  /** "60분" 같은 소요 표시. */
  dur?: string;
  /** 어느 목표에 속한 일인지. 목표 제목이 있으면 그걸, 없으면 카테고리 라벨. */
  goalLabel?: string;
  /** 목표 카테고리 색 — 라벨 앞 점에 쓴다. 색만으로 구분하지 않도록 항상 라벨과 함께. */
  goalColor?: { bg: string; bd: string; fg: string };
  onComplete: () => void;
  onPartial: () => void;
  onFail: () => void;
  onStart: (id: string) => void;
  /** 미래 일정처럼 아직 실행할 수 없을 때 시작 CTA를 잠근다. */
  startDisabled?: boolean;
  startLabel?: string;
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
  time,
  dur,
  goalLabel,
  goalColor,
  onComplete,
  onPartial,
  onFail,
  onStart,
  startDisabled = false,
  startLabel = '시작하기',
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
  // 넘어온 값이 우선 — task 자체엔 예약 시각이 없을 수 있다.
  const shownTime = time ?? task.time;
  const shownDur = dur ?? task.dur;

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
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--brand-ink)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {isActive ? '진행 중' : '다음 할 일'}
          {/* 언제 하기로 했는지 — 이게 없으면 "지금 뭘 언제"에 답이 안 된다. */}
          {shownTime && (
            <>
              <span style={{ opacity: 0.45 }}>·</span>
              <span className="tnum">{shownTime} 시작</span>
            </>
          )}
        </span>
        <span className="tnum" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {done} / {total} · {pct}%
        </span>
      </div>

      <div>
        <h2
          style={{
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
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
          {shownDur && (
            <span className="tnum" style={{ fontSize: 12, color: 'var(--text-2)' }}>{shownDur}</span>
          )}
          {/* 어느 목표에 속한 일인지. 색만으로 구분하지 않도록 점 + 라벨을 함께 둔다. */}
          {goalLabel && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-2)', minWidth: 0 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 9999,
                  background: goalColor?.bd ?? 'var(--sand-300)',
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goalLabel}</span>
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
          onClick={() => { if (!startDisabled) onStart(task.id); }}
          disabled={startDisabled}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 14,
            border: 'none',
            background: startDisabled ? 'var(--sand-200)' : 'var(--text-1)',
            color: startDisabled ? 'var(--text-3)' : '#FAF6EE',
            fontWeight: 700,
            fontSize: 15,
            fontFamily: 'inherit',
            cursor: startDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {startLabel} {!startDisabled && <CaretRight size={14} />}
        </button>
      )}
    </div>
  );
}
