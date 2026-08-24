import React from 'react';
import { CalendarCheck, PencilSimple } from '@phosphor-icons/react';
import { TimeDial } from './TimeDial';

// PARK("지금은 접어두기") / CARRY_OVER("내일 이어서") 카드를 수락할 때 "다음에 다시
// 만날 시점"을 정하는 자리(#221). 매번 직접 고르게 하면 마찰이 생기니 시스템이 다음
// 주간 리뷰 시점을 기본값으로 먼저 보여주고, 원하면 [바꾸기]로 직접 조정하게 한다
// (근거 A3 — 보류·이월 후 안 돌아오는 사용자를 붙잡을 재관여 장치 부재).
//
// ⚠️ 여기서 고른 값은 아직 백엔드로 전송되지 않는다 — `re_engagement_anchor_at` 이
// openapi 스펙에 없다(백엔드 컬럼·저장 로직 미착수, 이슈 #221 참고). 연결 지점은
// src/lib/api.ts 의 recoveryApi.decide 세 번째 인자.

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatAnchorLabel(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return `${dateStr} ${timeStr}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW_KO[d.getDay()]}) ${timeStr}`;
}

export interface ReEngagementAnchorPickerProps {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  minDate: string; // YYYY-MM-DD — 오늘보다 이전으로는 못 고르게
  onChangeDate: (v: string) => void;
  onChangeTime: (v: string) => void;
}

export function ReEngagementAnchorPicker({ date, time, minDate, onChangeDate, onChangeTime }: ReEngagementAnchorPickerProps) {
  const [editing, setEditing] = React.useState(false);

  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: 'var(--sand-100)',
        border: '1px solid var(--sand-200)',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarCheck size={15} color="var(--text-2)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>다음엔 언제 다시 볼까요?</div>
          <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600, marginTop: 1 }}>
            {formatAnchorLabel(date, time)} 에 다시 확인할게요
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: 'transparent',
            border: 'none',
            color: 'var(--coral-700)',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            padding: '4px 0 4px 8px',
          }}
        >
          <PencilSimple size={11} /> {editing ? '접기' : '바꾸기'}
        </button>
      </div>

      {editing && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => onChangeDate(e.target.value)}
            aria-label="다시 만날 날짜"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 12px',
              borderRadius: 10,
              border: '1.5px solid var(--sand-200)',
              background: 'var(--surface-raised)',
              color: 'var(--text-1)',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <TimeDial value={time} onChange={onChangeTime} minuteStep={30} />
        </div>
      )}
    </div>
  );
}
