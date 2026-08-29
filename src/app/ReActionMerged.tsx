import React, { useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { MergedTabBar } from '../components/TabBar';
import { SystemIntroScreen } from '../screens/SystemIntroScreen';
import { GoalIntakeScreen } from '../screens/GoalIntakeScreen';
import { GoalClassificationScreen } from '../screens/GoalClassificationScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { MilestoneConfirmScreen } from '../screens/MilestoneConfirmScreen';
import { MaterialsSearchScreen } from '../screens/MaterialsSearchScreen';
import { WeeklyPlanGenerationScreen } from '../screens/WeeklyPlanGenerationScreen';
import { MorningBriefScreen } from '../screens/MorningBriefScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { GoalsScreen } from '../screens/GoalsScreen';
import { UltimateGoalInterviewScreen } from '../screens/UltimateGoalInterviewScreen';
import { MandalaDraftScreen } from '../screens/MandalaDraftScreen';
import { MandalaScreen } from '../screens/MandalaScreen';
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
  'materials-search':       { label: '참고 자료 찾기',  back: 'milestone-confirm' },
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
  'ultimate-interview':     { label: '궁극적 목표',    back: 'goals' },
  'mandala-draft':          { label: '만다라트 초안',  back: 'goals' },
  'mandala':                { label: '만다라트',       back: 'goals' },
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
        <button aria-label="뒤로 가기" onClick={onBack} style={{
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
          fontSize: 12, fontWeight: 700,
          letterSpacing: '-0.01em', color: 'var(--text-2)',
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
  const { screen, tab, setScreen, setTab, setWeekOffset, interviewReturnTo, setInterviewReturnTo, mandalaGoalId, setMandalaGoalId } = useNavigation();

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
  const [recoveryReadyIds, setRecoveryReadyIds] = useState<Record<string, string>>({});
  const [recoveryPreparationError, setRecoveryPreparationError] = useState<string | null>(null);
  // 이번 세션에서 수락한 복구 횟수 (백엔드 누적 집계 엔드포인트가 없어 세션 카운트로 정직하게).
  const [recoveryCount, setRecoveryCount] = useState(0);
  // 사용자가 회복 화면에서 고른 제안 — RecoveredScreen 의 before→after 카드용.
  const [appliedRecovery, setAppliedRecovery] = useState<AppliedRecovery | null>(null);
  // 블록 종료 +20분 미체크 개수(#224 T1) — TodayScreen 안에서 계산되고, 탭바 배지는
  // 이 화면 밖(형제 컴포넌트)에 있어서 개수만 끌어올린다.
  const [uncheckedCount, setUncheckedCount] = useState(0);

  const showTabs = !hideTabs && TAB_SCREENS.includes(screen);

  const markDone = (id: string) =>
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'done' } : t));

  const markPartial = (id: string, pct: number) =>
    setTasks((ts) => ts.map((t) => t.id === id
      ? { ...t, status: pct >= 100 ? 'done' : pct === 0 ? 'todo' : 'partial_done', progress: pct }
      : t
    ));

  const markFailed = (id: string, reason: string, tagCodes?: string[], memo?: string, taskAversiveness?: number) => {
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'failed', failReason: reason } : t));
    const failedTask = tasks.find((t) => t.id === id);
    setActiveTask(failedTask ? { ...failedTask, status: 'failed', failReason: reason } : null);
    setFailReason(reason);
    setRecoveryPreparationError(null);
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

    // failure-tags와 recovery generate는 failed/partial_done 실행만 받으므로, 체크인을
    // 먼저 확정하고 태그 저장까지 끝난 뒤에만 회복 제안 생성을 허용한다(#269).
    ensureExecutionId
      .then(async (execId) => {
        await todayApi.checkIn({ executionId: execId, completionStatus: 'failed' }, `check-${execId}`);
        if ((tagCodes && tagCodes.length > 0) || taskAversiveness != null || memo?.trim()) {
          await reflectionApi.tagExecution(execId, {
            tagCodes: tagCodes ?? [],
            memo: memo?.trim() || null,
            taskAversiveness: taskAversiveness ?? null,
          });
        }
        setRecoveryReadyIds((m) => ({ ...m, [id]: execId }));
      })
      .catch(() => {
        setRecoveryPreparationError('실행 결과를 저장하지 못했어요. 오늘 화면에서 다시 시도해 주세요.');
      });
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

  // 딥 인터뷰를 마치고(또는 중간에 나가서) 돌아갈 곳(#216).
  // 앱 사용 중 재인터뷰로 들어온 경우엔 온보딩 체인이 아니라 들어온 화면으로 돌려보낸다.
  const leaveInterview = (fallback: ScreenId) => {
    const back = interviewReturnTo;
    setInterviewReturnTo(null);
    setScreen(back ?? fallback);
  };

  const goBack = () => {
    // 재인터뷰 중 뒤로가기가 NAV_META 의 온보딩 체인을 따르면 사용자를 intro 로 떨어뜨린다.
    if (screen === 'goal-intake' && interviewReturnTo) {
      leaveInterview('today');
      return;
    }
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
          <GoalIntakeScreen onDone={() => leaveInterview('goal-classify')} onOutcome={setInterviewOutcome} />
        )}
        {screen === 'goal-classify' && (
          <GoalClassificationScreen onNext={() => setScreen('setup')} outcome={interviewOutcome} />
        )}
        {screen === 'setup' && (
          <SetupScreen onDone={() => setScreen('milestone-confirm')} />
        )}
        {screen === 'milestone-confirm' && <MilestoneConfirmScreen />}
        {screen === 'materials-search' && <MaterialsSearchScreen />}
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
            onUncheckedChange={setUncheckedCount}
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
            executionId={activeTask
              ? (activeTask.status === 'failed' ? recoveryReadyIds[activeTask.id] : executionIds[activeTask.id])
              : undefined}
            preparationError={recoveryPreparationError}
            onOpenWeekly={() => { setWeekOffset(0); setTab('weekly'); setScreen('weekly'); }}
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
        {/* 궁극적 목표 만다라트(#220) — S29 인터뷰 → S30 초안 승인 → S31 상시 뷰. */}
        {screen === 'ultimate-interview' && (
          <UltimateGoalInterviewScreen
            onGoalReady={(goalId) => { setMandalaGoalId(goalId); setScreen('mandala-draft'); }}
            onCancel={() => setScreen('goals')}
          />
        )}
        {screen === 'mandala-draft' && (
          // goalId 없이 들어오면 초안을 만들 대상이 없다 — 인터뷰부터 다시 시작한다.
          mandalaGoalId ? (
            <MandalaDraftScreen
              goalId={mandalaGoalId}
              onApproved={(goalId) => { setMandalaGoalId(goalId); setScreen('mandala'); }}
              onLeave={() => setScreen('goals')}
            />
          ) : (
            <UltimateGoalInterviewScreen
              onGoalReady={(goalId) => { setMandalaGoalId(goalId); setScreen('mandala-draft'); }}
              onCancel={() => setScreen('goals')}
            />
          )
        )}
        {screen === 'mandala' && (
          <MandalaScreen
            goalId={mandalaGoalId}
            onStartUltimate={() => setScreen('ultimate-interview')}
            onBuildMandala={(goalId) => { setMandalaGoalId(goalId); setScreen('mandala-draft'); }}
          />
        )}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'my-info' && <MyInfoScreen />}
      </div>

      {showTabs && (
        <MergedTabBar
          active={tab}
          onChange={handleTabChange}
          // 확인 안 한 작업이 있을 때만 '오늘 실행' 탭에 점을 찍는다(#224 T1).
          dotTabs={uncheckedCount > 0 ? ['today'] : []}
        />
      )}
    </div>
  );
}
