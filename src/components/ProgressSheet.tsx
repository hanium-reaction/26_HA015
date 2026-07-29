import React, { useState } from 'react';

export interface ProgressSheetProps {
  /** 어떤 할 일에 대한 건지 — 시트 안에서 다시 확인시켜 준다. */
  taskTitle: string;
  /** 처음 잡아줄 값(0~100). 기본 50. */
  initial?: number;
  onSubmit: (pct: number) => void;
  onClose: () => void;
  /** 저장하면 무슨 일이 생기는지 미리 알려주는 안내. */
  note?: React.ReactNode;
  submitLabel?: string;
}

const PRESETS = [0, 25, 50, 75, 100];

/**
 * "일부만 했어요"를 숫자로 받는 바텀시트.
 *
 * 이 시트가 존재하는 이유가 제품의 핵심이다 — 완료/실패 이분법이면 80%를 한 날도
 * 실패로 기록되고, 사용자는 자기가 계속 실패한다고 믿게 된다. 중간을 기록할 수
 * 있어야 다음 회복 제안도 "남은 20%"에서 시작할 수 있다.
 *
 * 그래서 기본값을 0 이 아니라 50 에 둔다. 0 에서 올리게 하면 아무것도 안 한 것에서
 * 출발하는 셈이라 심리적으로 다르다.
 */
export function ProgressSheet({
  taskTitle,
  initial = 50,
  onSubmit,
  onClose,
  note,
  submitLabel = '저장하기',
}: ProgressSheetProps) {
  const [pct, setPct] = useState(initial);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(26,23,20,.45)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-raised)',
          width: '100%',
          borderRadius: '22px 22px 0 0',
          padding: '10px 20px 44px',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 18px' }} />
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>오늘은 얼마나 했어요?</div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18 }}>{taskTitle}</p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
            }}
          >
            진척
          </span>
          <span
            className="tnum"
            style={{ fontSize: 30, fontWeight: 800, color: 'var(--coral-700)', letterSpacing: '-0.02em' }}
          >
            {pct}
            <span style={{ fontSize: 16, fontWeight: 600 }}>%</span>
          </span>
        </div>

        <div style={{ position: 'relative', height: 8, background: 'var(--sand-200)', borderRadius: 9999, marginBottom: 8 }}>
          <div
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--brand)', borderRadius: 9999 }}
          />
          <div
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '50%',
              transform: 'translate(-50%,-50%)',
              width: 24,
              height: 24,
              borderRadius: 9999,
              background: '#FFFCF6',
              border: '2px solid var(--brand)',
              boxShadow: 'var(--shadow-md)',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginBottom: 18 }}>
          {PRESETS.map((t) => (
            <button
              key={t}
              onClick={() => setPct(t)}
              className="tnum"
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 12,
                cursor: 'pointer',
                padding: '2px 4px',
                fontFamily: 'inherit',
                color: pct === t ? 'var(--coral-700)' : 'var(--text-3)',
                fontWeight: pct === t ? 600 : 500,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {note && (
          <div
            style={{
              background: 'var(--coral-50)',
              borderRadius: 10,
              padding: '8px 10px',
              fontSize: 11,
              color: 'var(--coral-700)',
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            {note}
          </div>
        )}

        <button
          onClick={() => onSubmit(pct)}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 12,
            border: 'none',
            background: 'var(--brand)',
            color: '#FFFCF6',
            fontWeight: 700,
            fontSize: 14,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
