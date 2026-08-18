import React, { useEffect, useRef } from 'react';

// iOS 스타일 휠(다이얼) 시간 선택기.
// 기존엔 09:00~22:00 시간 칩 수십 개가 flex-wrap 으로 쫙 깔려 있어 시각적으로
// 답답했다 — 시/분 두 개의 스크롤 휠로 바꿔 한 번에 몇 칸만 보이게 한다.

const ITEM_H = 34;   // 한 칸 높이(px)
const VISIBLE = 5;   // 동시에 보이는 칸 수(홀수 → 가운데가 선택 위치)
const PAD = ((VISIBLE - 1) / 2) * ITEM_H; // 첫/마지막 항목도 가운데로 올 수 있게 위아래 여백

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function WheelColumn({
  values,
  selectedIndex,
  onSelect,
  ariaLabel,
}: {
  values: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  // 선택 인덱스가 바뀌면 해당 위치로 스크롤을 맞춘다. 최초엔 즉시, 이후(클릭 등)엔 부드럽게.
  // 사용자가 직접 스크롤해 settle 된 경우엔 이미 위치가 맞아 no-op 이 되어 서로 안 싸운다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * ITEM_H;
    if (Math.abs(el.scrollTop - target) < 2) return;
    el.scrollTo({ top: target, behavior: mountedRef.current ? 'smooth' : 'auto' });
  }, [selectedIndex]);

  useEffect(() => { mountedRef.current = true; }, []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (settleRef.current) window.clearTimeout(settleRef.current);
    // 스크롤이 멈춘 뒤(≈100ms) 가운데에 온 칸을 선택으로 확정한다.
    settleRef.current = window.setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      if (clamped !== selectedIndex) onSelect(clamped);
    }, 100);
  };

  return (
    <div
      ref={ref}
      className="rx-wheel"
      role="listbox"
      aria-label={ariaLabel}
      onScroll={handleScroll}
      style={{
        flex: 1,
        height: ITEM_H * VISIBLE,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        position: 'relative',
        zIndex: 1,
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ height: PAD }} aria-hidden />
      {values.map((v, i) => {
        const sel = i === selectedIndex;
        return (
          <div
            key={v}
            role="option"
            aria-selected={sel}
            onClick={() => onSelect(i)}
            style={{
              height: ITEM_H,
              scrollSnapAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontVariantNumeric: 'tabular-nums',
              fontSize: sel ? 19 : 15,
              fontWeight: sel ? 700 : 500,
              color: sel ? 'var(--text-1)' : 'var(--text-3)',
              opacity: sel ? 1 : 0.45,
              cursor: 'pointer',
              transition: 'font-size 120ms, opacity 120ms, color 120ms',
            }}
          >
            {pad2(v)}
          </div>
        );
      })}
      <div style={{ height: PAD }} aria-hidden />
    </div>
  );
}

interface TimeDialProps {
  value: string; // "HH:MM"
  onChange: (value: string) => void;
  minuteStep?: number;
  minHour?: number;
  maxHour?: number;
}

export function TimeDial({ value, onChange, minuteStep = 5, minHour = 0, maxHour = 23 }: TimeDialProps) {
  const [h, m] = value.split(':').map(Number);
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);

  const hourIndex = Math.max(0, hours.indexOf(Number.isFinite(h) ? h : minHour));
  // 초기 분이 스텝에 안 맞을 수 있어(예: 21:30, step 5) 가장 가까운 스텝으로 스냅.
  const minuteIndex = Math.max(
    0,
    Math.min(minutes.length - 1, Math.round((Number.isFinite(m) ? m : 0) / minuteStep)),
  );

  const emit = (hi: number, mi: number) => onChange(`${pad2(hours[hi])}:${pad2(minutes[mi])}`);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--surface-ground)',
        border: '1px solid var(--sand-200)',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* 가운데 선택 밴드 — 항목 텍스트 뒤에 깔리는 강조 띠. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 8,
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          height: ITEM_H,
          borderRadius: 10,
          background: 'var(--brand-soft)',
          border: '1px solid var(--coral-200)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <WheelColumn values={hours} selectedIndex={hourIndex} onSelect={(i) => emit(i, minuteIndex)} ariaLabel="시" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 10, fontWeight: 700, fontSize: 17, color: 'var(--text-2)', zIndex: 1 }}>:</div>
      <WheelColumn values={minutes} selectedIndex={minuteIndex} onSelect={(i) => emit(hourIndex, i)} ariaLabel="분" />
    </div>
  );
}
