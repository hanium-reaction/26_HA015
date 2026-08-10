import { Lock } from '@phosphor-icons/react';
import type { AgendaFixedSchedule } from '../types/api';

// 백엔드가 "09:00" 으로도, "09:00:00" 으로도 줄 수 있다. 초는 화면에서 의미가 없다.
const hhmm = (t: string) => t.slice(0, 5);

interface FixedScheduleStripProps {
  items: AgendaFixedSchedule[];
}

/**
 * 오늘 이미 잡혀 있는 것 — 수업·알바처럼 우리가 옮길 수 없는 시간.
 *
 * 오늘 화면이 할 일 카드만 보여주면 "하루가 통째로 비어 있다" 는 인상을 준다.
 * 실제로는 9시부터 수업인데 앱만 그걸 모르는 상태라, 계획이 현실과 어긋나 보인다.
 * 그래서 카드보다 먼저, 하루의 테두리로 놓는다.
 *
 * 다만 이건 **실행 대상이 아니다** — 완료·실패를 찍을 수 없다. 그래서 카드처럼
 * 생기면 안 된다. 버튼도 그림자도 없이, 배경에 눌러앉은 띠 하나로 둔다.
 *
 * 비어 있으면 아무것도 그리지 않는다. "고정 일정 없음" 을 띄우면 사용자가
 * 등록하지 않은 것뿐인데 앱이 뭔가 잘못된 것처럼 읽힌다.
 */
export function FixedScheduleStrip({ items }: FixedScheduleStripProps) {
  if (items.length === 0) return null;

  // 백엔드 정렬을 믿지 않는다 — 시간순이 아니면 하루의 순서로 안 읽힌다.
  const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <section
      aria-label="오늘 고정 일정"
      style={{
        background: 'var(--sand-100)',
        border: '1px solid var(--sand-200)',
        borderRadius: 14,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Lock size={11} weight="fill" color="var(--text-3)" />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.01em' }}>
          오늘 이미 잡혀 있어요
        </span>
      </div>
      {sorted.map((s) => (
        <div key={s.scheduleId} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            className="tnum"
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}
          >
            {hhmm(s.startTime)}–{hhmm(s.endTime)}
          </span>
          <span
            style={{
              fontSize: 13,
              color: 'var(--text-1)',
              fontWeight: 500,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {s.title}
          </span>
        </div>
      ))}
    </section>
  );
}
