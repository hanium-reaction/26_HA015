import { House, CalendarBlank, Tray, Gear, Target } from '@phosphor-icons/react';
import { Wordmark } from '../components/Wordmark';
import { useNavigation } from '../contexts/NavigationContext';
import type { TabId, ScreenId } from '../types';

// 하단 탭바(TabBar.tsx)와 항상 동일하게 유지. 둘 중 하나만 바꾸지 말 것.
// review 는 '주간' 탭 안의 토글로 진입 — 버튼은 없지만 화면이 떠도 nav 는 보이도록
// TAB_SCREENS 에는 포함.
const TAB_SCREENS: ScreenId[] = ['today', 'weekly', 'inbox', 'review'];

const NAV_ITEMS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'today',  label: '오늘 실행', Icon: House },
  { id: 'weekly', label: '주간',      Icon: CalendarBlank },
  { id: 'inbox',  label: '인박스',    Icon: Tray },
];

export function DesktopSidebar() {
  const { screen, tab, setScreen, setTab, setWeekOffset } = useNavigation();
  const showNav = TAB_SCREENS.includes(screen);

  const handleNav = (id: TabId) => {
    if (id === 'weekly') setWeekOffset(0);
    setTab(id);
    setScreen(id);
  };

  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: '28px 16px 32px',
      borderRight: '1px solid var(--sand-200)',
      background: 'var(--surface-raised)',
      gap: 8,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 8px', marginBottom: 24 }}>
        <Wordmark size={20} />
      </div>

      {/* Nav items — onboarding 중엔 숨김 */}
      {showNav ? (
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => handleNav(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 12, border: 'none',
                  background: active ? 'var(--sand-100)' : 'transparent',
                  color: active ? 'var(--text-1)' : 'var(--text-3)',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 600 : 500,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'all 160ms var(--ease-out)',
                }}
              >
                <Icon
                  size={20}
                  weight={active ? 'fill' : 'regular'}
                  color={active ? 'var(--brand)' : 'var(--text-3)'}
                />
                {label}
              </button>
            );
          })}
        </nav>
      ) : (
        /* 온보딩 중: 진행 단계 힌트 */
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: 'var(--brand-ink)', marginBottom: 4, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            온보딩
          </div>
          목표 파악 → 분류 → 일정 → 계획 → 마무리 확인. 다섯 단계만 지나면 앱을 시작할 수 있어요.
        </div>
      )}

      {/* 하단: 목표 관리 + 설정 진입 + Re:Action 안내 */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showNav && (
          <button
            onClick={() => setScreen('goals')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12, border: 'none',
              background: screen === 'goals' ? 'var(--sand-100)' : 'transparent',
              color: screen === 'goals' ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'inherit', fontSize: 14,
              fontWeight: screen === 'goals' ? 600 : 500,
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <Target size={20} weight={screen === 'goals' ? 'fill' : 'regular'} color={screen === 'goals' ? 'var(--brand)' : 'var(--text-3)'} />
            목표 관리
          </button>
        )}
        {showNav && (
          <button
            onClick={() => setScreen('settings')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12, border: 'none',
              background: screen === 'settings' ? 'var(--sand-100)' : 'transparent',
              color: screen === 'settings' ? 'var(--text-1)' : 'var(--text-3)',
              fontFamily: 'inherit', fontSize: 14,
              fontWeight: screen === 'settings' ? 600 : 500,
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <Gear size={20} weight={screen === 'settings' ? 'fill' : 'regular'} color={screen === 'settings' ? 'var(--brand)' : 'var(--text-3)'} />
            설정
          </button>
        )}
        <div style={{
          padding: '10px 12px', borderRadius: 12,
          background: 'var(--brand-soft)', border: '1px solid var(--coral-200)',
          fontSize: 11, color: 'var(--coral-700)', lineHeight: 1.55,
        }}>
          <span style={{ fontWeight: 700 }}>Re:Action</span><br />
          계획 실행 복구 에이전트
        </div>
      </div>
    </aside>
  );
}
