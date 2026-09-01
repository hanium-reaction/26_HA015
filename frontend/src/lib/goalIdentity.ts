/**
 * 서버 목표와 화면에서만 쓰는 임시 목표를 구분한다.
 *
 * API 의 goalId 는 형식이 정해지지 않은 string 이므로 `goal_` 같은 접두사를
 * 서버 ID의 조건으로 사용하면 UUID 목표의 변경 요청이 통째로 생략된다.
 */
export function isPersistedGoalId(goalId: string): boolean {
  return !goalId.startsWith('demo-') && !goalId.startsWith('cand_');
}
