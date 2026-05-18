import { useState } from 'react';
import { ReActionMerged } from './ReActionMerged';
import { DesktopSidebar } from './DesktopSidebar';
import { NavigationContext } from '../contexts/NavigationContext';
import type { ScreenId, TabId } from '../types';

export function AppShell() {
  const [screen, setScreen] = useState<ScreenId>('intro');
  const [tab, setTab] = useState<TabId>('today');

  return (
    <NavigationContext.Provider value={{ screen, tab, setScreen, setTab }}>
      {/* ── 모바일 (< 1024px): 단일 컬럼 ── */}
      <div className="app-mobile">
        <div className="app-container">
          <ReActionMerged />
        </div>
      </div>

      {/* ── 데스크탑 (≥ 1024px): 사이드바 + 콘텐츠 ── */}
      <div className="app-desktop">
        <DesktopSidebar />
        <main className="app-main">
          <ReActionMerged hideTabs />
        </main>
      </div>
    </NavigationContext.Provider>
  );
}
