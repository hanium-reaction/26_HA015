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
  { id: 'weekly', label: '주간',      Icon: CalendarBlank },
  { id: 'inbox',  label: '인박스',    Icon: Tray },
];

export function MergedTabBar({ active, onChange }: MergedTabBarProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        padding: '8px 6px 34px',
        background: 'rgba(250,246,238,.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 2px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: isActive ? 'var(--text-1)' : 'var(--text-3)',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isActive ? 'var(--text-1)' : 'transparent',
              }}
            >
              <t.Icon
                size={16}
                weight={isActive ? 'fill' : 'regular'}
                color={isActive ? '#FAF6EE' : 'var(--text-3)'}
              />
            </div>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
