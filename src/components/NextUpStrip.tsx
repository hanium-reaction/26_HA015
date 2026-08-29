import { Play } from '@phosphor-icons/react';
import type { Task } from '../types';

// 오늘 화면 상단에 붙어 있는 [다음 할 일] 스트립(#214).
//
// 오늘 화면은 스크롤 컨테이너 하나에 헤더 → 히어로 카드 → 나머지 카드 → 습관 순으로 쌓여 있어,
// "지금 할 일" 을 알려주는 유일한 장치인 히어로 카드가 조금만 내리면 화면에서 사라졌다.
// 실패 회복이 이 제품의 정체성이라면 다음 한 걸음은 항상 보여야 한다.
//
// 스크롤 흐름 안에 넣으면(sticky) 나타나는 순간 아래 내용이 그만큼 밀려 화면이 튄다.
// 그래서 스크롤 컨테이너 위에 겹쳐 띄운다(absolute) — 레이아웃은 전혀 건드리지 않는다.

export interface NextUpStripProps {
  /** 히어로 카드와 반드시 같은 카드여야 한다 — 둘이 다른 걸 가리키면 그 순간 신뢰를 잃는다. */
  task: Task;
  /** 보이기/숨기기. 히어로 카드가 화면에 있는 동안엔 false(같은 정보 2중 표시 방지). */
  visible: boolean;
  time?: string;
  dur?: string;
  goalLabel?: string;
  goalColor?: { bg: string; bd: string; fg: string };
  done: number;
  total: number;
  onStart: (id: string) => void;
  startDisabled?: boolean;
  startLabel?: string;
}

export function NextUpStrip({
  task,
  visible,
  time,
  dur,
  goalLabel,
  goalColor,
  done,
  total,
  onStart,
  startDisabled = false,
  startLabel,
}: NextUpStripProps) {
  // 시각·소요·목표를 가운뎃점으로 잇는다. 없는 건 자리를 만들지 않는다.
  const meta = [time, dur, goalLabel].filter(Boolean).join(' · ');

  return (
    <div
      // 숨겨진 동안에는 보조기술과 포인터 양쪽에서 완전히 빠져야 한다 —
      // opacity 만 0 으로 두면 안 보이는 버튼을 누를 수 있다.
      aria-hidden={!visible}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        padding: '8px 12px',
        background: 'rgba(250,246,238,.94)',
        backdropFilter: 'blur(18px)',
        borderBottom: '1px solid var(--sand-200)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'transform 180ms ease, opacity 180ms ease',
      }}
    >
      {/* 목표 색 점 — 색만으로 구분하지 않도록 아래 라벨과 항상 함께 쓴다. */}
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 9999,
          flexShrink: 0,
          background: goalColor?.fg ?? 'var(--brand-surface)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>다음 할 일</span>
          <span className="tnum" style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
            {done}/{total}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {task.title}
        </div>
        {meta && (
          <div
            className="tnum"
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {meta}
          </div>
        )}
      </div>
      <button
        onClick={() => { if (!startDisabled) onStart(task.id); }}
        disabled={startDisabled}
        // 숨겨진 동안 탭 순서에서도 빠진다.
        tabIndex={visible ? 0 : -1}
        style={{
          height: 34,
          padding: '0 14px',
          borderRadius: 9999,
          border: 'none',
          background: startDisabled ? 'var(--sand-200)' : 'var(--brand-surface)',
          color: startDisabled ? 'var(--text-3)' : '#FFFCF6',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          cursor: startDisabled ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {!startDisabled && <Play size={12} weight="fill" />}
        {startLabel ?? (task.status === 'in_progress' ? '이어서' : '시작')}
      </button>
    </div>
  );
}
