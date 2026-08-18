import { useMemo } from 'react';
import { TimeDial } from './TimeDial';
import { localDateStr } from '../lib/dates';

// 인터뷰 질문의 answerType 이 date_picker / time_range 일 때 쓰는 전용 입력(#217).
//
// 백엔드는 질문마다 "이건 날짜다 / 이건 시간 범위다" 를 answerType 으로 이미 알려준다.
// 그런데 FE 는 chip/select 만 특별 취급하고 나머지는 전부 맨 텍스트 입력으로 떨어뜨려,
// 사용자가 모바일 키보드로 `2026-11-30` 을 치고 `09:00-23:00` 의 하이픈까지 맞춰야 했다.
// 마감일자와 선호 시간대는 계획 생성의 두 축이라, 여기서 어긋나면 계획 전체가 어긋난다.
//
// 전송 문자열 형식은 기존과 동일하게 유지한다(YYYY-MM-DD / HH:MM-HH:MM) — 백엔드 계약 무변경.

const CHIP_BASE: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 9999,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    ...CHIP_BASE,
    border: `1px solid ${active ? 'var(--coral-200)' : 'var(--sand-200)'}`,
    background: active ? 'var(--brand-soft)' : 'var(--surface-raised)',
    color: active ? 'var(--coral-700)' : 'var(--text-2)',
  };
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}

// 다가오는 일요일(오늘이 일요일이면 오늘).
function upcomingSunday(base: Date): Date {
  const day = base.getDay();
  return addDays(base, day === 0 ? 0 : 7 - day);
}

export function DateAnswerField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // 렌더마다 new Date() 를 다시 만들면 자정을 넘길 때 칩 값이 흔들린다 — 마운트 시점에 고정.
  const { today, presets } = useMemo(() => {
    const now = new Date();
    return {
      today: localDateStr(now),
      presets: [
        { label: '오늘', date: localDateStr(now) },
        { label: '이번 주말', date: localDateStr(upcomingSunday(now)) },
        { label: '2주 뒤', date: localDateStr(addDays(now, 14)) },
        { label: '한 달 뒤', date: localDateStr(addMonths(now, 1)) },
        { label: '3개월 뒤', date: localDateStr(addMonths(now, 3)) },
      ],
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.date)}
            disabled={disabled}
            style={{ ...chipStyle(value === p.date), opacity: disabled ? 0.5 : 1 }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={value}
        // 지난 날짜를 마감으로 잡으면 계획이 세워질 수 없다.
        min={today}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="마감 날짜"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '11px 14px',
          borderRadius: 12,
          border: '1.5px solid var(--sand-200)',
          background: 'var(--surface-raised)',
          color: 'var(--text-1)',
          fontSize: 14,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      />
    </div>
  );
}

// "09:00-23:00" 을 시작/종료로 가른다. 형식이 아니면 기본값(09:00~18:00).
export function parseRange(v: string): { start: string; end: string } {
  const m = /^(\d{2}:\d{2})\s*[-~]\s*(\d{2}:\d{2})$/.exec(v.trim());
  if (m) return { start: m[1], end: m[2] };
  return { start: '09:00', end: '18:00' };
}

export function formatRange(start: string, end: string): string {
  return `${start}-${end}`;
}

// 같은 날 안의 범위만 표현한다. 시작 ≥ 종료면 유효하지 않다(자정을 넘는 범위는
// 이 필드로 못 만든다 — 그 경우를 위해 호출부가 "직접 입력" 탈출구를 준다).
export function isValidRange(start: string, end: string): boolean {
  return start < end;
}

const RANGE_PRESETS: { label: string; start: string; end: string }[] = [
  { label: '오전형 09–18', start: '09:00', end: '18:00' },
  { label: '저녁형 18–23', start: '18:00', end: '23:00' },
  { label: '하루 종일 08–22', start: '08:00', end: '22:00' },
];

export function TimeRangeAnswerField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { start, end } = parseRange(value);
  const valid = isValidRange(start, end);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(formatRange(p.start, p.end))}
            disabled={disabled}
            style={{
              ...chipStyle(start === p.start && end === p.end),
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>시작</div>
          <TimeDial value={start} onChange={(v) => onChange(formatRange(v, end))} minuteStep={30} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>종료</div>
          <TimeDial value={end} onChange={(v) => onChange(formatRange(start, v))} minuteStep={30} />
        </div>
      </div>
      {!valid && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--coral-700)' }}>
          종료가 시작보다 빠르거나 같아요. 자정을 넘는 시간대는 아래 '직접 입력' 으로 적어주세요.
        </span>
      )}
    </div>
  );
}
