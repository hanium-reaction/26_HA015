// 앱 공용 세그먼트 컨트롤(토글). 화면별로 제각각이던 토글 크기/스타일을 하나로 통일.
// 디자인 근거(연구): 2~5개 상호배타 옵션에 적합, 선택 상태를 시각적으로 분명히,
// 세그먼트는 등폭 유지. (Apple HIG, NN/g, Mobbin 2,600+ 컴포넌트 분석)

interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // 등폭으로 꽉 채울지 (전체폭). false 면 내용 폭.
  fluid?: boolean;
  ariaLabel?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  fluid = false,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: fluid ? 'flex' : 'inline-flex',
        width: fluid ? '100%' : undefined,
        gap: 2,
        padding: 3,
        background: 'var(--sand-100)',
        borderRadius: 9999,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            style={{
              flex: fluid ? 1 : undefined,
              minWidth: fluid ? 0 : 64,
              height: 'var(--ctrl-sm)',
              padding: fluid ? '0 8px' : '0 16px',
              borderRadius: 9999,
              border: 'none',
              background: active ? 'var(--surface-raised)' : 'transparent',
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              fontWeight: 700,
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'background 140ms, color 140ms',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
