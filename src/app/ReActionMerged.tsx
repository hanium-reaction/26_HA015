import React, { useEffect, useRef, useState } from 'react';
import { CaretLeft, Question } from '@phosphor-icons/react';
import { MergedTabBar } from '../components/TabBar';
import { SystemIntroScreen } from '../screens/SystemIntroScreen';
import { afterInterviewDone, afterPlanChain, backFromInterviewChain } from '../lib/interviewNav';
import { GoalIntakeScreen } from '../screens/GoalIntakeScreen';
import { GoalClassificationScreen } from '../screens/GoalClassificationScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { MilestoneConfirmScreen } from '../screens/MilestoneConfirmScreen';
import { MaterialsSearchScreen } from '../screens/MaterialsSearchScreen';
import { WeeklyPlanGenerationScreen } from '../screens/WeeklyPlanGenerationScreen';
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
import { ApiError, reflectionApi, todayApi } from '../lib/api';
import type { RecoveryProposal, ScreenId, TabId, Task } from '../types';
import type { InterviewOutcome } from '../types/api';
import { readInterviewOutcome, writeInterviewOutcome } from '../lib/interviewOutcomeStore';
import { GuidedTourOverlay } from '../components/GuidedTourOverlay';

// onboarding 흐름은 백엔드 §3 state machine 을 기반으로 하되, 클라이언트에서 두 쌍을
// 묶고 coping-style 을 제거해 8단계 → 5단계로 줄였다 (recovery.tone 은 인터뷰에서 받음):
//   intro → goal-intake → goal-classify → calendar-schedule(S04+S05)
//   → weekly-plan(S06) → today. 모닝 브리프는 오늘 화면의 하루 1회 시트로 통합한다.
const NAV_META: Record<ScreenId, { label: string; back: ScreenId | null }> = {
  'intro':                  { label: 'RE:ACTION',      back: null },
  'goal-intake':            { label: '목표 파악',      back: 'intro' },
  'goal-classify':          { label: '목표 분류',      back: 'goal-intake' },
  'setup':                  { label: '마무리 확인',    back: 'goal-classify' },
  'milestone-confirm':      { label: '계획의 큰 그림', back: 'setup' },
  'materials-search':       { label: '참고 자료 찾기',  back: 'milestone-confirm' },
  'weekly-plan':            { label: '주간 계획 생성', back: 'milestone-confirm' },
  'today':                  { label: '오늘의 실행',    back: null },
  // 집중 화면의 이탈은 FocusScreen이 타이머를 일시정지·보존한 뒤 처리한다.
  // 공용 헤더의 별도 뒤로가기를 노출하면 그 정리 경로를 우회하므로 숨긴다.
  'focus':                  { label: '집중 모드',      back: null },
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

function MergedTopNav({ screen, onBack, onHelp }: { screen: ScreenId; onBack: () => void; onHelp: () => void }) {
  const meta = NAV_META[screen] || { label: 'RE:ACTION', back: null };
  if (screen === 'intro') return null;
  return (
    <div className="merged-top-nav" style={{
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
      <button data-tour-ignore aria-label="현재 화면 도움말 열기" onClick={onHelp} style={{ width: 44, height: 44, borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', color: 'var(--text-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Question size={18} weight="bold" /></button>
    </div>
  );
}

interface ReActionMergedProps {
  hideTabs?: boolean;
}

export function ReActionMerged({ hideTabs = false }: ReActionMergedProps) {
  const { screen, tab, setScreen, setTab, setWeekOffset, interviewReturnTo, setInterviewReturnTo, mandalaGoalId, setMandalaGoalId, setInterviewGoalId } = useNavigation();

  // 초기값 비움 → /today/agenda 로딩 중엔 TodayScreen 의 스켈레톤이 대신 표시된다.
  // 실패 시에도 더미로 가리지 않고 빈 목록 + 정직 배너를 보여준다.
  const [tasks, setTasks] = useState<Task[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourFirstRun, setTourFirstRun] = useState(false);
  useEffect(() => setTourOpen(false), [screen]);
  useEffect(() => {
    if (!TAB_SCREENS.includes(screen) || typeof window === 'undefined') return;
    if (window.localStorage.getItem('reaction.guidedTour.core.v1') === 'done') return;
    setTourFirstRun(true);
    setTourOpen(true);
  }, [screen]);
  const closeTour = () => {
    if (tourFirstRun && typeof window !== 'undefined') window.localStorage.setItem('reaction.guidedTour.core.v1', 'done');
    setTourOpen(false);
    setTourFirstRun(false);
  };
  // 방금 끝난 목표 파악 인터뷰의 outcome — 목표 분류(S03) 화면이 GET /goals
  // (이 시점엔 항상 빈 테이블) 대신 이 값을 렌더한다(#75).
  const [interviewOutcome, setInterviewOutcomeState] = useState<InterviewOutcome | null>(() => {
    if (typeof window === 'undefined') return null;
    return readInterviewOutcome(window.localStorage);
  });
  const setInterviewOutcome = (outcome: InterviewOutcome) => {
    setInterviewOutcomeState(outcome);
    if (typeof window !== 'undefined') writeInterviewOutcome(window.localStorage, outcome);
  };
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [failReason, setFailReason] = useState('');
  // task.id → 실 executionId. FocusScreen(시작) 또는 markFailed(실패시 auto-start)로 채워지며,
  // 회복 화면들(MergedRecoveryScreen/RecoveredScreen)이 이 값으로 실 API 를 호출한다(#80).
  const [executionIds, setExecutionIds] = useState<Record<string, string>>({});
  const [recoveryReadyIds, setRecoveryReadyIds] = useState<Record<string, string>>({});
  const [recoveryPreparationError, setRecoveryPreparationError] = useState<string | null>(null);
  // 회복 화면으로 먼저 넘어간 뒤 체크인·태그 저장이 도는 동안 true — 회복 화면이
  // 빈 카드 자리 대신 "저장하는 중" 을 보여줄 수 있게 한다.
  const [recoveryPreparing, setRecoveryPreparing] = useState(false);
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

  // 아직 실행이 없으면 먼저 start() 로 executionId 를 확보한다. 실패·부분완료가
  // TodayScreen 시트에서 곧바로 올 수 있어서, FocusScreen 을 거치지 않은 액션도
  // 있기 때문이다(#80 "실패 시 auto-start").
  const ensureExecutionId = (id: string): Promise<string> => {
    const existing = executionIds[id];
    if (existing) return Promise.resolve(existing);
    // ⚠️ **서버가 아는 실행을 먼저 쓴다.** 예전엔 이 메모리 맵만 보고 없으면 곧장
    // `todayApi.start(id)` 를 불렀다. 새로고침하면 맵이 비므로, **이미 실패한 카드의**
    // 회복 화면에 다시 들어갈 때마다 새 실행이 만들어지고 바로 failed 로 체크인됐다 —
    // 실측: 실제로는 두 번 실패한 카드에 실행 4건이 쌓였다. 그 가짜 실패가 주간 리뷰
    // 준수율과 회복 에스컬레이션 레벨을 함께 밀어 올린다.
    const known = tasks.find((t) => t.id === id)?.executionId;
    if (known) {
      setExecutionIds((m) => ({ ...m, [id]: known }));
      return Promise.resolve(known);
    }
    return todayApi.start(id).then((e) => {
      setExecutionIds((m) => ({ ...m, [id]: e.executionId }));
      return e.executionId;
    });
  };

  const markPartial = (id: string, pct: number) => {
    const status = pct >= 100 ? 'done' : pct === 0 ? 'todo' : 'partial_done';
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status, progress: pct } : t));
    // 0% 는 "안 한 걸로 되돌린다" 라서 서버에 남길 결과가 없다.
    if (status === 'todo') {
      setRecoveryPreparing(false);
      return;
    }
    // 예전엔 로컬 상태만 바꾸고 끝냈다. 그래서 '일부만' 은 서버에 아무것도 남지
    // 않았고, 회복 제안 생성(failed/partial_done 실행만 받는다)이 거절됐다.
    ensureExecutionId(id)
      .then(async (execId) => {
        await todayApi.checkIn({ executionId: execId, completionStatus: status }, `check-${execId}`);
        setRecoveryReadyIds((m) => ({ ...m, [id]: execId }));
      })
      .catch(() => {
        setRecoveryPreparationError('실행 결과를 저장하지 못했어요. 오늘 화면에서 다시 시도해 주세요.');
      })
      .finally(() => {
        setRecoveryPreparing(false);
      });
  };

  const markFailed = (id: string, reason: string, tagCodes?: string[], memo?: string, taskAversiveness?: number) => {
    setTasks((ts) => ts.map((t) => t.id === id ? { ...t, status: 'failed', failReason: reason } : t));
    const failedTask = tasks.find((t) => t.id === id);
    setActiveTask(failedTask ? { ...failedTask, status: 'failed', failReason: reason } : null);
    setFailReason(reason);
    setRecoveryPreparationError(null);
    setRecoveryPreparing(true);
    setScreen('recovery');

    // failure-tags와 recovery generate는 failed/partial_done 실행만 받으므로, 체크인을
    // 먼저 확정하고 태그 저장까지 끝난 뒤에만 회복 제안 생성을 허용한다(#269).
    ensureExecutionId(id)
      .then(async (execId) => {
        // ⚠️ **이미 체크인된 실행이면 성공으로 친다.**
        //
        // 오늘 실행 기록의 실패 행을 다시 누르면(`onFailedRecover`) 이 함수가 통째로
        // 다시 돈다 — 회복 화면으로 돌아가려는 것뿐인데 체크인까지 재전송된다.
        // 백엔드는 `completion_status != 'in_progress'` 면 409(TODAY_ALREADY_CHECKED_IN)
        // 를 내므로, 그대로 두면 회복 화면에 "실행 결과를 저장하지 못했어요" 라는
        // **거짓 오류**가 뜬다. 저장은 이미 끝나 있었다.
        //
        // 409 를 삼키는 게 맞는 이유: 이 호출의 목적은 "이 실행을 failed 로 만든다" 이고,
        // 409 는 **그 상태가 이미 참**이라는 뜻이다. 원하는 결과가 이미 성립했으므로
        // 실패가 아니다. (`check-${execId}` 키는 무의미하다 — `/today/check-ins` 는
        // 멱등 라우트 목록에 없어서 미들웨어가 재생하지 않는다.)
        try {
          await todayApi.checkIn({ executionId: execId, completionStatus: 'failed' }, `check-${execId}`);
        } catch (err) {
          if (!(err instanceof ApiError && err.code === 'TODAY_ALREADY_CHECKED_IN')) throw err;
        }
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
      })
      .finally(() => {
        setRecoveryPreparing(false);
      });
  };

  // 집중 화면의 [중단] 시트에서 결과를 고르고 나온 경우 — 회복으로 잇는다.
  //
  // 중단 자체는 여전히 판정이 아니다(단순 이탈은 handleExit 이 그대로 처리한다).
  // 다만 결과를 남기고 멈추는 쪽을 고르면, 그 결과가 회복의 입력이 된다.
  const stopFocusWithResult = (
    id: string,
    result: 'partial_done' | 'failed',
    progressPct: number,
    failure?: { tagCodes: string[]; memo: string; taskAversiveness: number | null },
  ) => {
    if (result === 'failed') {
      // ⚠️ **태그를 넘기는 게 이 경로의 실질이다.** 예전엔 '집중 중에 중단했어요' 라는
      // 고정 문구만 남기고 태그를 안 보냈다. 그러면 백엔드
      // `select_strategies(failure_tags, ...)` 가 매칭 0 으로 떨어져 패딩 규칙이 고른
      // **일반 카드**가 나가고, 프롬프트 변수 `failure_type` 도 `UNKNOWN` 이 된다.
      // 회복이 이 제품의 핵심인데 그 입력이 비어 있었다.
      markFailed(
        id,
        failure?.memo?.trim() || '집중 중에 중단했어요',
        failure?.tagCodes,
        failure?.memo,
        failure?.taskAversiveness ?? undefined,
      );
      return;
    }
    const t = tasks.find((x) => x.id === id);
    setActiveTask(t ? { ...t, status: 'partial_done', progress: progressPct } : null);
    setFailReason('');
    setRecoveryPreparationError(null);
    setRecoveryPreparing(true);
    setScreen('recovery');
    markPartial(id, progressPct);
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
    // 이 경로는 저장을 새로 걸지 않는다. 다만 방금 '일부만' 을 누르고 바로 들어온
    // 경우엔 체크인이 아직 돌고 있을 수 있어, 그때는 준비 중으로 보여준다.
    setRecoveryPreparing(!!partial && !recoveryReadyIds[partial.id]);
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
      // 회복안 수락은 원 행동의 완료가 아니다. 실패/부분완료 상태는 그대로 보존하고,
      // 승인된 회복안은 appliedRecovery(및 서버 resulting action)로 별도 표현한다(#283).
    }
    setScreen('recovered');
  };

  // 탭으로 주간 계획에 들어오면 항상 이번 주부터 (다음 주는 리뷰 버튼으로만 진입).
  const handleTabChange = (id: TabId) => {
    // 체인을 탭으로 벗어나면 복귀 표시를 버린다 — 남겨두면 나중에 엉뚱한 화면으로 보낸다.
    if (interviewReturnTo) setInterviewReturnTo(null);
    setInterviewGoalId(null);
    if (id === 'weekly') setWeekOffset(0);
    setTab(id);
    setScreen(id);
  };

  // 계획 체인의 종착. 재인터뷰로 들어왔으면 그 화면으로, 온보딩이면 오늘 화면으로.
  //
  // ⚠️ 예전엔 **인터뷰가 끝나는 순간** 들어온 화면으로 돌려보내 계획 체인을 통째로
  // 건너뛰었다 — 재인터뷰 시트는 "몇 가지만 다시 묻고 **계획을 새로 세울게요**" 라고
  // 말하는데 계획을 안 세웠다(#441). 복귀 표시는 체인 **끝**에서 소비한다.
  const finishPlanChain = () => {
    const to = afterPlanChain(interviewReturnTo);
    setInterviewReturnTo(null);
    // 목표 지정 인터뷰(#442)의 대상도 여기서 놓는다 — 남겨두면 **다음 인터뷰가 물려받아**
    // 사용자가 목표를 말할 기회 없이 지난 목표로 시작한다.
    setInterviewGoalId(null);
    if (to === 'today') setTab('today');
    setScreen(to);
  };

  const goBack = () => {
    // 규칙은 `lib/interviewNav` 의 순수 함수가 갖는다 — 화면을 렌더하지 않고 테스트한다.
    const { to, abandonInterview: drop } = backFromInterviewChain(
      screen,
      NAV_META[screen]?.back ?? null,
      interviewReturnTo,
    );
    if (drop) {
      setInterviewReturnTo(null);
      setInterviewGoalId(null);
    }
    setScreen(to);
  };

  const handleFocusComplete = () => {
    if (activeTask) markDone(activeTask.id);
    setScreen('today');
    setActiveTask(null);
  };

  return (
    <div ref={rootRef} className="reaction-app-shell" style={{
      width: '100%', height: '100%', flex: 1,
      overflow: 'hidden', background: 'var(--surface-ground)',
      display: 'flex', flexDirection: 'column',
    }}>
      <MergedTopNav screen={screen} onBack={goBack} onHelp={() => { setTourFirstRun(false); setTourOpen(true); }} />
      {screen === 'intro' && <button data-tour-ignore aria-label="현재 화면 도움말 열기" onClick={() => { setTourFirstRun(false); setTourOpen(true); }} style={{ position: 'fixed', zIndex: 30, top: 10, right: 14, width: 44, height: 44, borderRadius: 9999, border: '1px solid var(--sand-200)', background: 'var(--surface-raised)', display: 'grid', placeItems: 'center' }}><Question size={18} /></button>}

      <div data-tour-page style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {screen === 'intro' && (
          <SystemIntroScreen onDone={() => setScreen('goal-intake')} />
        )}
        {screen === 'goal-intake' && (
          <GoalIntakeScreen onDone={() => setScreen(afterInterviewDone())} onOutcome={setInterviewOutcome} />
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
          <WeeklyPlanGenerationScreen onContinue={finishPlanChain} />
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
            onStopWithResult={stopFocusWithResult}
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
              ? (activeTask.status === 'failed' || activeTask.status === 'partial_done'
                  ? recoveryReadyIds[activeTask.id]
                  : executionIds[activeTask.id])
              : undefined}
            preparing={recoveryPreparing}
            preparationError={recoveryPreparationError}
            onOpenWeekly={() => { setWeekOffset(0); setTab('weekly'); setScreen('weekly'); }}
          />
        )}
        {screen === 'recovered' && (
          <RecoveredScreen
            recoveryCount={recoveryCount}
            applied={appliedRecovery}
            onDone={() => { setTab('today'); setScreen('today'); setAppliedRecovery(null); }}
            executionId={activeTask
              ? (recoveryReadyIds[activeTask.id] ?? executionIds[activeTask.id])
              : undefined}
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
      <GuidedTourOverlay root={rootRef.current} open={tourOpen} screenLabel={NAV_META[screen].label} firstRun={tourFirstRun} onClose={closeTour} />

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
