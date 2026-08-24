// 로컬(KST) 기준 YYYY-MM-DD 문자열.
//
// ⚠️ new Date() 는 로컬 시각인데 .toISOString() 은 UTC 로 변환하므로, KST(=UTC+9)
// 00:00~08:59 에는 날짜가 하루 밀린다. 그 결과 "그 주 월요일"이 "전날(일요일)"로
// 전송돼 주간 계획/리뷰/습관 조회가 한 주씩 어긋난다(#92). 주차·날짜 계산에는
// 절대 toISOString().slice(0,10) 을 쓰지 말고 이 헬퍼를 쓸 것.
export function localDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 그 날짜가 속한 주의 월요일 (YYYY-MM-DD). /plans/weekly·/reviews/weekly 의 weekStart 파라미터용.
//
// 날짜가 주 경계를 넘으면(일요일의 '내일' = 다음 주 월요일) 그 주의 월요일이 나와야 하므로,
// 기준 날짜를 받아서 계산한다. 위 localDateStr 를 거치므로 KST 00:00~08:59 밀림(#92) 없음.
export function weekStartStr(d: Date): string {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateStr(monday);
}

// PARK/CARRY_OVER 회복 카드를 수락할 때 "다음에 다시 볼 시점"의 기본값(#221).
// 매번 직접 고르게 하면 마찰이 생기니, 다음 주간 리뷰 시점(다음 주 월요일 아침)을
// 시스템이 먼저 제안하고 원하면 바꾸게 한다. 09:00 은 SetupScreen 의 기본 아침 시각과 동일.
export function defaultReEngagementAnchorDate(d: Date = new Date()): string {
  const nextMonday = new Date(d);
  nextMonday.setDate(nextMonday.getDate() - ((nextMonday.getDay() + 6) % 7) + 7);
  return localDateStr(nextMonday);
}
export const DEFAULT_REENGAGEMENT_TIME = '09:00';
