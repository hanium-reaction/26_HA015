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
