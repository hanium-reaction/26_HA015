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
export function defaultCarryOverAnchorDate(d: Date = new Date()): string {
  const tomorrow = new Date(d);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateStr(tomorrow);
}
export const DEFAULT_REENGAGEMENT_TIME = '09:00';


// 분 단위 소요/지연을 사람이 읽는 단위로. 60분을 넘으면 시간, 하루를 넘으면 일.
//
// ⚠️ **왜 필요한가.** 주간 리뷰가 평균 지연을 `분` 으로만 찍어서, 계획 시각이 한참 지난
// 카드를 나중에 시작하면 "평균 지연 5996분" 같은 값이 화면에 그대로 나왔다. 100시간을
// 분으로 적으면 크다는 것 말고는 아무것도 안 읽힌다 — 자릿수를 세게 만드는 숫자다.
//
// 규칙:
//   60분 미만        → "38분"
//   24시간 미만      → "2시간" · "2시간 30분"   (분이 0이면 생략)
//   그 이상          → "4일" · "4일 3시간"      (시간이 0이면 생략)
//
// 반올림은 **마지막 자리에서만** 한다 — "1시간 60분" 같은 값이 나오지 않게 큰 단위부터
// 정수로 떼고 나머지를 반올림한다. 음수는 부호를 밖으로 빼서 "-2시간" 으로 읽히게 한다
// (지연이 음수면 계획보다 일찍 시작했다는 뜻이라 실제로 나온다).
export function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '-';
  const sign = minutes < 0 ? '-' : '';
  const total = Math.abs(minutes);

  if (total < 60) return `${sign}${Math.round(total)}분`;

  const totalMinutes = Math.round(total);
  if (totalMinutes < 60 * 24) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${sign}${h}시간` : `${sign}${h}시간 ${m}분`;
  }

  const totalHours = Math.round(totalMinutes / 60);
  const d = Math.floor(totalHours / 24);
  const h = totalHours % 24;
  return h === 0 ? `${sign}${d}일` : `${sign}${d}일 ${h}시간`;
}
