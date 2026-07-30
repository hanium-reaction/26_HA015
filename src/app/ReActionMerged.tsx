import React, { useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { MergedTabBar } from '../components/TabBar';
import { SystemIntroScreen } from '../screens/SystemIntroScreen';
import { GoalIntakeScreen } from '../screens/GoalIntakeScreen';
import { GoalClassificationScreen } from '../screens/GoalClassificationScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { MilestoneConfirmScreen } from '../screens/MilestoneConfirmScreen';
import { WeeklyPlanGenerationScreen } from '../screens/WeeklyPlanGenerationScreen';
import { MorningBriefScreen } from '../screens/MorningBriefScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MyInfoScreen } from '../screens/MyInfoScreen';
import { MergedTodayScreen } from '../screens/TodayScreen';
import { FocusScreen } from '../screens/FocusScreen';
import { MergedRecoveryScreen } from '../screens/RecoveryScreen';
import { RecoveredScreen, type AppliedRecovery } from '../screens/RecoveredScreen';
import { WeeklySwitch } from '../components/WeeklySwitch';
import { EveningCheckInScreen } from '../screens/EveningCheckInScreen';
import { WeeklyCalendarScreenV2 } from '../screens/WeeklyCalendarScreen';
import { WeeklyReviewScreenV2 } from '../screens/WeeklyReviewScreen';
import { useNavigation } from '../contexts/NavigationContext';
import { reflectionApi, todayApi } from '../lib/api';
import type { RecoveryProposal, ScreenId, TabId, Task } from '../types';
import type { InterviewOutcome } from '../types/api';

// onboarding 흐름은 백엔드 §3 state machine 을 기반으로 하되, 클라이언트에서 두 쌍을
// 묶고 coping-style 을 제거해 8단계 → 5단계로 줄였다 (recovery.tone 은 인터뷰에서 받음):
//   intro → goal-intake → goal-classify → calendar-schedule(S04+S05)
//   → weekly-plan(S06) → policies-notifications(S07+S08) → morning-brief(첫 카드) → today
const NAV_META: Record<ScreenId, { label: string; back: ScreenId | null }> = {
  'intro':                  { label: 'RE:ACTION',      back: null },
  'goal-intake':            { label: '목표 파악',      back: 'intro' },
  'goal-classify':          { label: '목표 분류',      back: 'goal-intake' },
  'setup':                  { label: '마무리 확인',    back: 'goal-classify' },
  'milestone-confirm':      { label: '계획의 큰 그림', back: 'setup' },
  'weekly-plan':            { label: '주간 계획 생성', back: 'milestone-confirm' },
  'morning-brief':          { label: '모닝 브리프',    back: 'weekly-plan' },
  'today':                  { label: '오늘의 실행',    back: null },
  'focus':                  { label: '집중 모드',      back: 'today' },
  'recovery':               { label: '복구 코치',      back: 'today' },
  'recovered':              { label: '회복 완료',      back: null },
  'evening':                { label: '저녁 체크인',    back: 'today' },
  'weekly':                 { label: '주간 계획',      back: null },
  'inbox':                  { label: 'LIFE INBOX',     back: null },
  'review':                 { label: '주간 리뷰',      back: null },
  'goals':                  { label: '목표 관리',      back: 'today' },
  'settings':               { label: '설정',           back: 'today' },
  'my-info':                { label: '내 정보',        back: 'settings' },
};

const TAB_SCREENS: ScreenId[] = ['today', 'weekly', 'inbox', 'review'];

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
      {screen === 'weekly' || screen === 'review' ? (
        // 주간 탭: 계획/리뷰 토글을 상단 바 중앙에 고정 — 전환해도 위치가 안 움직인다.
        <WeeklySwitch />
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10, fontFamily: 'var(--font-mono)',
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)',
        }}>
          <div style={{ width: 5, height: 5, borderRadius: 9999, background: 'var(--brand)' }} />
          {meta.label}
        </div>
      )}
      <div style={{ width: 44 }} />
    </div>
  );
}

interface ReActionMergedProps {
  hideTabs?: boolean;
}

export function ReActionMerged({ hideTabs = false }: ReActionMergedProps) {
  const { screen, tab, setScreen, setTab, setWeekOffset } = useNavigation();

  // 초기값 비움 → /today/agenda 로딩 중엔 TodayScreen 의 스켈레톤이 대신 표시된다.
  // 실패 시에도 더미로 가리지 않고 빈 목록 + 정직 배너를 보여준다.
  const [tasks, setTasks] = useState<Task[]>([]);
  // 방금 끝난 목표 파악 인터뷰의 outcome — 목표 분류(S03) 화면이 GET /goals
  // (이 시점엔 항상 빈 테이블) 대신 이 값을 렌더한다(#75).
  const [interviewOutcome, setInterviewOutcome] = useState<InterviewOutcome | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [failReason, setFailReason] = useState('');
  // task.id → 실 executionId. FocusScreen(시작) 또는 markFailed(실패시 auto-start)로 채워지며,
  // 회복 화면들(MergedRecoveryScreen/RecoveredScreen)이 이 값으로 실 API 를 호출한다(#80).
  const [executionIds, setExecutionIds] = useState<Record<string, string>>({});
  // 이번 세션에서 수락한 복구 횟수 (백엔드 누적 집계 엔드포인트가 없어 세션 카운트로 정직하게).
  const [recoveryCount, setRecoveryCount] = useState(0);
  // 사용자가 회복 화면에서 고른 제안 — RecoveredScreen 의 before→after 카드용.
  const [appliedRecovery, setAppliedRecovery] = useState<AppliedRecovery | null>(null);

  const showTabs = !hideTabs && TAB_SCREENS.includes(screen);

  const markDone = (id: string) =>
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'done' } : t));

  const markPartial = (id: string, pct: number) =>
    setTasks((ts) => ts.map((t) => t.id === id
      ? { ...t, status: pct >= 100 ? 'done' : pct === 0 ? 'todo' : 'partial_done', progress: pct }
      : t
    ));

  const markFailed = (id: string, reason: string, tagCodes?: string[], memo?: string) => {
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'failed', failReason: reason } : t));
    setActiveTask(tasks.find((t) => t.id === id) || null);
    setFailReason(reason);
    setScreen('recovery');

    // 실패 경로는 TodayScreen 실패시트 → 여기로 직행해 FocusScreen 을 거치지 않을 수
    // 있다 — 그런 미시작 액션은 먼저 start() 로 executionId 를 확보한다(#80 "실패 시 auto-start").
    const existing = executionIds[id];
    const ensureExecutionId = existing
      ? Promise.resolve(existing)
      : todayApi.start(id).then((e) => {
          setExecutionIds((m) => ({ ...m, [id]: e.executionId }));
          return e.executionId;
        });

    ensureExecutionId
      .then((execId) =>
        ((tagCodes && tagCodes.length > 0)
          ? reflectionApi.tagExecution(execId, { tagCodes, memo: memo ?? null }).catch(() => {})
          : Promise.resolve())
          .then(() =>
            todayApi.checkIn({ executionId: execId, completionStatus: 'failed' }, `check-${execId}`).catch(() => {}),
          ),
      )
      .catch(() => { /* start 실패(미구현/오류) — 로컬 흐름만 유지 */ });
  };

  // 실제 시작 트리거 — task 를 in_progress 로 전이하고 focus 화면으로.
  // 이미 in_progress 인 다른 task 가 있으면 todo 로 되돌린다 (동시 하나만).
  const openTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.status === 'done' || t.status === 'failed') return;
    setTasks((ts) =>
      ts.map((x) => {
        if (x.id === id) return { ...x, status: 'in_progress' as const };
        if (x.status === 'in_progress') return { ...x, status: 'todo' as const };
        return x;
      }),
    );
    setActiveTask({ ...t, status: 'in_progress' });
    setScreen('focus');
  };

  const openRecovery = () => {
    const partial = tasks.find((t) => t.status === 'partial_done' || t.status === 'recovery_pending');
    setActiveTask(partial ?? null);
    setScreen('recovery');
  };

  // RecoveryScreen 에서 고른 실제(또는 데모) 제안 객체를 그대로 받아 before→after 를 구성한다.
  // (예전엔 optionId 만 받아 더미 데이터에서 재조회했었다 — 실 회복 카드의
  // 제목/설명이 더미로 가려지던 문제 #80)
  const acceptRecovery = (proposal: RecoveryProposal) => {
    setRecoveryCount((c) => c + 1);
    if (activeTask) {
      setAppliedRecovery({
        taskTitle: activeTask.title,
        failReason: failReason || activeTask.failReason || '',
        proposalTitle: proposal.title,
        proposalDesc: proposal.desc,
        proposalTime: proposal.time ?? '',
      });
      setTasks((ts) => ts.map((t) => t.id === activeTask.id ? { ...t, status: 'done' } : t));
    }
    setScreen('recovered');
  };

  // 탭으로 주간 계획에 들어오면 항상 이번 주부터 (다음 주는 리뷰 버튼으로만 진입).
  const handleTabChange = (id: TabId) => { if (id === 'weekly') setWeekOffset(0); setTab(id); setScreen(id); };

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
          <GoalIntakeScreen onDone={() => setScreen('goal-classify')} onOutcome={setInterviewOutcome} />
        )}
        {screen === 'goal-classify' && (
          <GoalClassificationScreen onNext={() => setScreen('setup')} outcome={interviewOutcome} />
        )}
        {screen === 'setup' && (
          <SetupScreen onDone={() => setScreen('milestone-confirm')} />
        )}
        {screen === 'milestone-confirm' && <MilestoneConfirmScreen />}
        {screen === 'weekly-plan' && (
          <WeeklyPlanGenerationScreen onContinue={() => setScreen('morning-brief')} />
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
            // /today/agenda 실데이터가 오면 부모 tasks 자체를 교체 — openTask 등이
            // 실제 카드 id 를 찾을 수 있게 단일 소스로 유지한다(#66).
            onAgendaLoaded={setTasks}
          />
        )}
        {screen === 'focus' && (
          // activeTask 가 없어도(완료/상태 race) 백지 대신 FocusScreen 내부의
          // "시작할 카드가 없어요" 안내가 뜨도록 항상 렌더한다(task=null 허용).
          <FocusScreen
            task={activeTask}
            elapsedMin={0} totalMin={45}
            onBack={() => { setScreen('today'); setActiveTask(null); }}
            onPause={() => setScreen('today')}
            onComplete={handleFocusComplete}
            onExecutionStart={(taskId, execId) => setExecutionIds((m) => ({ ...m, [taskId]: execId }))}
          />
        )}
        {screen === 'recovery' && (
          <MergedRecoveryScreen
            task={activeTask}
            failReason={failReason}
            onAccept={acceptRecovery}
            onDismiss={() => setScreen('today')}
            executionId={activeTask ? executionIds[activeTask.id] : undefined}
          />
        )}
        {screen === 'recovered' && (
          <RecoveredScreen
            recoveryCount={recoveryCount}
            applied={appliedRecovery}
            onDone={() => { setTab('today'); setScreen('today'); setAppliedRecovery(null); }}
            executionId={activeTask ? executionIds[activeTask.id] : undefined}
          />
        )}
        {screen === 'evening' && (
          <EveningCheckInScreen onDone={() => { setTab('weekly'); setScreen('weekly'); }} />
        )}
        {screen === 'weekly' && <WeeklyCalendarScreenV2 />}
        {screen === 'inbox' && <InboxScreen />}
        {screen === 'review' && <WeeklyReviewScreenV2 />}
        {screen === 'goals' && <GoalsScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'my-info' && <MyInfoScreen />}
      </div>

      {showTabs && <MergedTabBar active={tab} onChange={handleTabChange} />}
    </div>
  );
}
