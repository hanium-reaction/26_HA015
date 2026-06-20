import { useNavigation } from '../contexts/NavigationContext';

// 주간 계획 / 주간 리뷰를 한 탭 안에서 전환하는 세그먼트 컨트롤.
// 하단 탭을 4→3 으로 줄이면서 두 '주간' 화면을 하나의 탭으로 묶는다.
// tab 은 항상 'weekly' 로 유지해 하단 '주간' 탭 하이라이트가 떨어지지 않게 한다.
export function WeeklySwitch() {
  const { screen, setScreen, setTab } = useNavigation();
  const go = (s: 'weekly' | 'review') => {
    setTab('weekly');
    setScreen(s);
  };
  const items: { s: 'weekly' | 'review'; label: string }[] = [
    { s: 'weekly', label: '계획' },
    { s: 'review', label: '리뷰' },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 2, padding: 2, background: 'var(--sand-100)', borderRadius: 9999 }}>
      {items.map(({ s, label }) => {
        const active = screen === s;
        return (
          <button
            key={s}
            onClick={() => go(s)}
            style={{
              height: 28,
              padding: '0 18px',
              borderRadius: 9999,
              border: 'none',
              background: active ? 'var(--surface-raised)' : 'transparent',
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
