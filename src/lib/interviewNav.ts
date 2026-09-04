import type { ScreenId } from '../types';

/**
 * 딥 인터뷰로 들어왔다 나갈 때의 화면 이동 규칙 (#216 · #441).
 *
 * 화면 컴포넌트 밖 **순수 함수**로 두는 이유: 이 규칙이 조용히 틀리면 사용자가
 * "계획을 새로 세울게요" 라는 약속을 못 받거나(#441) 온보딩 시작 화면으로 떨어진다.
 * `ReActionMerged` 를 통째로 렌더하지 않고 규칙만 테스트할 수 있어야 한다.
 */

/**
 * 인터뷰를 **끝까지 마친 뒤** 갈 곳 — 언제나 계획 체인의 시작이다.
 *
 * ⚠️ 예전엔 재인터뷰(`returnTo` 가 있는 경우)를 여기서 곧장 들어온 화면으로 돌려보냈다.
 * 그래서 계획 체인을 통째로 건너뛰었고, 재인터뷰 시트가 한 약속이 깨졌다:
 *
 * > 몇 가지만 다시 묻고 **계획을 새로 세울게요.**
 *
 * 백엔드는 제 할 일을 다 한다 — 새 목표를 `proposed` 로 저장하고 이전 잠정 목표를
 * supersede 한다. **그 다음 단계(계획 생성)가 호출되지 않았을 뿐이다.**
 * 그래서 재인터뷰만 하고 나가면 이전 미계획 목표가 정리된 채 새 계획도 없는 상태가 됐다.
 */
export function afterInterviewDone(): ScreenId {
  return 'goal-classify';
}

/**
 * 계획 체인의 **종착** — 여기서 비로소 복귀 표시를 소비한다.
 *
 * 재인터뷰로 들어왔으면 들어온 화면으로(그 화면에서 방금 세운 계획이 반영된 걸 본다),
 * 온보딩이면 오늘 화면으로.
 */
export function afterPlanChain(returnTo: ScreenId | null): ScreenId {
  return returnTo ?? 'today';
}

/**
 * 뒤로가기 — 재인터뷰 중이면 온보딩 체인을 거슬러 올라가지 않는다.
 *
 * 재인터뷰로 들어온 사용자는 **이미 온보딩을 마쳤다.** 계획 체인의 `back` 을 따라가면
 * `goal-intake → intro`(온보딩 시작)로 떨어진다. 그 전에 들어온 화면으로 되돌린다.
 *
 * @param screen   지금 화면
 * @param metaBack `NAV_META[screen].back`
 * @param returnTo 재인터뷰로 들어왔다면 그 화면, 아니면 null
 * @returns `{ to, abandonInterview }` — `abandonInterview` 면 호출부가 복귀 표시를 지운다.
 */
export function backFromInterviewChain(
  screen: ScreenId,
  metaBack: ScreenId | null,
  returnTo: ScreenId | null,
): { to: ScreenId; abandonInterview: boolean } {
  // 인터뷰 화면에서의 뒤로가기 = 재인터뷰를 그만두는 것.
  if (screen === 'goal-intake' && returnTo) {
    return { to: returnTo, abandonInterview: true };
  }
  // 계획 체인을 거슬러 올라가다 온보딩 시작으로 떨어지려는 순간.
  if (metaBack === 'intro' && returnTo) {
    return { to: returnTo, abandonInterview: true };
  }
  return { to: metaBack ?? 'today', abandonInterview: false };
}
