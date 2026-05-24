import React, { useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { MergedTabBar } from '../components/TabBar';
import { SystemIntroScreen } from '../screens/SystemIntroScreen';
import { GoalIntakeScreen } from '../screens/GoalIntakeScreen';
import { GoalClassificationScreen } from '../screens/GoalClassificationScreen';
import { CalendarChoiceScreen } from '../screens/CalendarChoiceScreen';
import { ManualScheduleScreen } from '../screens/ManualScheduleScreen';
import { TimePoliciesScreen } from '../screens/TimePoliciesScreen';
import { WeeklyPlanGenerationScreen } from '../screens/WeeklyPlanGenerationScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { MorningBriefScreen } from '../screens/MorningBriefScreen';
import { MergedTodayScreen } from '../screens/TodayScreen';
import { FocusScreen } from '../screens/FocusScreen';
import { MergedRecoveryScreen } from '../screens/RecoveryScreen';
import { RecoveredScreen } from '../screens/RecoveredScreen';
import { EveningCheckInScreen } from '../screens/EveningCheckInScreen';
import { WeeklyCalendarScreenV2 } from '../screens/WeeklyCalendarScreen';
import { WeeklyReviewScreenV2 } from '../screens/WeeklyReviewScreen';
import { BASE_TASKS } from '../data';
import { useNavigation } from '../contexts/NavigationContext';
import type { ScreenId, TabId, Task } from '../types';

// onboarding 순서는 api-contract §3 state machine 기반:
//   intro(S01) → goal-intake(S02) → goal-classify(S03) → calendar-choice(S04)
//   → manual-schedule(S05) → time-policies(S07) → weekly-plan(S06)
//   → notifications(S08) → coping-style(설정) → morning-brief → today
const NAV_META: Record<ScreenId, { label: string; back: ScreenId | null }> = {
  'intro':            { label: 'RE:ACTION',      back: null },
  'goal-intake':      { label: '목표 파악',      back: 'intro' },
  'goal-classify':    { label: '목표 분류',      back: 'goal-intake' },
  'calendar-choice':  { label: '캘린더 선택',    back: 'goal-classify' },
  'manual-schedule':  { label: '고정 일정',      back: 'calendar-choice' },
  'time-policies':    { label: '시간 정책',      back: 'manual-schedule' },
  'weekly-plan':      { label: '주간 계획 생성', back: 'time-policies' },
  'notifications':    { label: '알림 설정',      back: 'weekly-plan' },
  'coping-style':     { label: '회복 스타일',    back: 'notifications' },
  'morning-brief':    { label: '모닝 브리프',    back: 'coping-style' },
  'today':            { label: '오늘의 실행',    back: null },
  'focus':            { label: '집중 모드',      back: 'today' },
  'recovery':         { label: '복구 코치',      back: 'today' },
  'recovered':        { label: '회복 완료',      back: null },
  'evening':          { label: '저녁 체크인',    back: 'today' },
  'weekly':           { label: '주간 계획',      back: null },
  'review':           { label: '주간 리뷰',      back: null },
};

const TAB_SCREENS: ScreenId[] = ['today', 'weekly', 'review'];

function MergedTopNav({ screen, onBack }: { screen: ScreenId; onBack: () => void }) {
  const meta = NAV_META[screen] || { label: 'RE:ACTION', back: null };
  if (screen === 'intro') return null;
  return (
    <div style={{
      height: 44, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 18px', zIndex: 20,
    }}>
      {meta.back ? (
        <button onClick={onBack} style={{
          width: 44, height: 44, borderRadius: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-raised)', border: '1px solid var(--sand-200)',
          cursor: 'pointer',
        }}>
          <CaretLeft size={14} color="var(--text-2)" />
        </button>
      ) : <div style={{ width: 44 }} />}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)',
      }}>
        <div style={{ width: 5, height: 5, borderRadius: 9999, background: 'var(--brand)' }} />
        {meta.label}
      </div>
      <div style={{ width: 44 }} />
    </div>
  );
}

interface ReActionMergedProps {
  hideTabs?: boolean;
}

export function ReActionMerged({ hideTabs = false }: ReActionMergedProps) {
  const { screen, tab, setScreen, setTab } = useNavigation();

  const [tasks, setTasks] = useState<Task[]>(BASE_TASKS);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [failReason, setFailReason] = useState('');
  const [recoveryCount, setRecoveryCount] = useState(37);

  const showTabs = !hideTabs && TAB_SCREENS.includes(screen);

  const markDone = (id: string) =>
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'done' } : t));

  const markPartial = (id: string, pct: number) =>
    setTasks((ts) => ts.map((t) => t.id === id
      ? { ...t, status: pct >= 100 ? 'done' : pct === 0 ? 'todo' : 'partial_done', progress: pct }
      : t
    ));

  const markFailed = (id: string, reason: string) => {
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'failed', failReason: reason } : t));
    setActiveTask(tasks.find((t) => t.id === id) || null);
    setFailReason(reason);
    setScreen('recovery');
  };

  const openTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    setActiveTask(t);
    if (t.status === 'in_progress' || t.status === 'todo') setScreen('focus');
  };

  const openRecovery = () => {
    const partial = tasks.find((t) => t.status === 'partial_done' || t.status === 'recovery_pending');
    setActiveTask(partial || tasks[1]);
    setScreen('recovery');
  };

  const acceptRecovery = () => {
    setRecoveryCount((c) => c + 1);
    if (activeTask) setTasks((ts) => ts.map((t) => t.id === activeTask.id ? { ...t, status: 'done' } : t));
    setScreen('recovered');
  };

  const handleTabChange = (id: TabId) => { setTab(id); setScreen(id); };

  const goBack = () => {
    const meta = NAV_META[screen];
    if (meta?.back) setScreen(meta.back);
    else setScreen('today');
  };

  const handleFocusComplete = () => {
    if (activeTask) markDone(activeTask.id);
    setScreen('today');
    setActiveTask(null);
  };

  return (
    <div style={{
      width: '100%', height: '100%', flex: 1,
      overflow: 'hidden', background: 'var(--surface-ground)',
      display: 'flex', flexDirection: 'column',
    }}>
      <MergedTopNav screen={screen} onBack={goBack} />

      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {screen === 'intro' && (
          <SystemIntroScreen onDone={() => setScreen('goal-intake')} />
        )}
        {screen === 'goal-intake' && (
          <GoalIntakeScreen onDone={() => setScreen('goal-classify')} />
        )}
        {screen === 'goal-classify' && (
          <GoalClassificationScreen onNext={() => setScreen('calendar-choice')} />
        )}
        {screen === 'calendar-choice' && (
          <CalendarChoiceScreen
            onConnected={() => setScreen('time-policies')}
            onManual={() => setScreen('manual-schedule')}
          />
        )}
        {screen === 'manual-schedule' && (
          <ManualScheduleScreen onNext={() => setScreen('time-policies')} />
        )}
        {screen === 'time-policies' && (
          <TimePoliciesScreen onNext={() => setScreen('weekly-plan')} />
        )}
        {screen === 'weekly-plan' && (
          <WeeklyPlanGenerationScreen onContinue={() => setScreen('notifications')} />
        )}
        {screen === 'notifications' && (
          <NotificationsScreen onDone={() => setScreen('coping-style')} />
        )}
        {screen === 'coping-style' && (
          <OnboardingScreen onNext={() => setScreen('morning-brief')} />
        )}
        {screen === 'morning-brief' && (
          <MorningBriefScreen onStart={() => { setTab('today'); setScreen('today'); }} />
        )}
        {screen === 'today' && (
          <MergedTodayScreen
            tasks={tasks}
            onOpen={openTask}
            onMarkDone={markDone}
            onPartial={markPartial}
            onFail={markFailed}
            onOpenRecovery={openRecovery}
            onEvening={() => setScreen('evening')}
          />
        )}
        {screen === 'focus' && activeTask && (
          <FocusScreen
            task={activeTask}
            elapsedMin={18} totalMin={45}
            onBack={() => { setScreen('today'); setActiveTask(null); }}
            onPause={() => setScreen('today')}
            onComplete={handleFocusComplete}
          />
        )}
        {screen === 'recovery' && (
          <MergedRecoveryScreen
            task={activeTask}
            failReason={failReason}
            onAccept={acceptRecovery}
            onDismiss={() => setScreen('today')}
          />
        )}
        {screen === 'recovered' && (
          <RecoveredScreen
            recoveryCount={recoveryCount}
            onDone={() => { setTab('today'); setScreen('today'); }}
          />
        )}
        {screen === 'evening' && (
          <EveningCheckInScreen onDone={() => { setTab('weekly'); setScreen('weekly'); }} />
        )}
        {screen === 'weekly' && <WeeklyCalendarScreenV2 />}
        {screen === 'review' && <WeeklyReviewScreenV2 />}
      </div>

      {showTabs && <MergedTabBar active={tab} onChange={handleTabChange} />}
    </div>
  );
}
