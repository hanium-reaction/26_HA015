import React from 'react';
import {
  House,
  CalendarBlank,
  Tray,
} from '@phosphor-icons/react';
import type { TabId } from '../types';

interface MergedTabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

// 주간 계획 + 주간 리뷰는 '주간' 탭 하나로 통합(화면 내 계획/리뷰 토글).
// 하단 탭 4→3 으로 단순화.
const tabs: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'today',  label: '오늘 실행', Icon: House },
  { id: 'weekly', label: '주간 계획', Icon: CalendarBlank },
  { id: 'inbox',  label: '인박스',    Icon: Tray },
];

/**
 * 하단 탭.
 *
 * 활성 표시를 **색과 무게**로 낸다. 예전엔 아이콘 뒤에 검은 라운드 사각형을 깔았는데,
 * 그 조합(검정 칩 + 9px 대문자 라벨)이 어느 앱에서나 보이는 기성품 느낌의 출처였다.
 * 국내외 여행 앱(에어비앤비·호퍼·트리플) 모두 칩을 쓰지 않고 틴트 색으로만 구분한다.
 *
 * 라벨은 대문자 변환을 하지 않는다 — 한글엔 대소문자가 없어서 영문 라벨에만
 * 걸리는 장식이었고, 한국 앱의 관용은 "버튼이 무엇을 하는지 말로 적는" 쪽이다.
 * 그래서 '주간' 도 '주간 계획' 으로 늘렸다.
 */
export function MergedTabBar({ active, onChange }: MergedTabBarProps) {
  return (
    <nav
      aria-label="주요 화면"
      style={{
        flexShrink: 0,
        display: 'flex',
        // 홈 인디케이터 영역은 기기에 맡긴다. 34px 하드코딩은 노치 없는 기기에서 뜬 여백이 된다.
        padding: '6px 6px calc(8px + env(safe-area-inset-bottom, 26px))',
        // 불투명. 반투명+블러는 뒤 내용이 비쳐 라벨 대비가 스크롤에 따라 흔들린다.
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--sand-200)',
        zIndex: 20,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 2px 6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11,
              lineHeight: 1.2,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '-0.01em',
              color: isActive ? 'var(--brand-ink)' : 'var(--text-3)',
              // 활성/비활성 전환이 튀지 않게. 색만 바뀌므로 이동은 없다.
              transition: 'color 140ms',
            }}
          >
            <t.Icon
              size={22}
              weight={isActive ? 'fill' : 'regular'}
              color={isActive ? 'var(--brand-ink)' : 'var(--text-3)'}
            />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
