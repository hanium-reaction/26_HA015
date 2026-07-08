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
