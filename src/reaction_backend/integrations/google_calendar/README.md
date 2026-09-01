# `integrations/google_calendar/` — Google Calendar (읽기 전용)

MVP 스코프: **read-only freebusy**. write-back(`events.insert`)은 P1.

스코프는 `https://www.googleapis.com/auth/calendar.freebusy` **하나**다. 스케줄러의 세 룰
(전이 버퍼·부하 감쇠·자투리)에 필요한 건 구간의 **길이와 인접성뿐**이고 제목·장소는 필요
없다 (ADR-0009 D4). `calendar.readonly` 로 넓히는 건 개인정보 범위를 넓히는 일이라 ADR 을
먼저 고쳐야 한다 — `tests/test_calendar_connect.py` 가 스코프 문자열을 고정한다.

## 지금 있는 것

- `oauth.py` — authorization code → 토큰 교환, refresh, revoke.
  `google-api-python-client` 를 쓰지 않는다(동기·무거움). 필요한 건 토큰 엔드포인트 POST
  하나뿐이라 `requests` + `to_thread` + 이중 timeout 으로 감싼다 — `web_fetch/fetcher.py`
  · `web_push/sender.py` 와 같은 관례이고 **새 의존성이 0** 이다.
- `token_store.py` — `calendar_connections` 읽기/쓰기. 평문 토큰이 이 모듈 밖으로 나가지
  않게 저장은 전부 `encrypt_oauth_token` 경유.

## 후속

- `freebusy.py` — `freebusy.query` + 60s TTL 캐시
- `first_plan.busy_for_day` 에 다섯 번째 소스로 배선 (ADR-0009 D4)
- `events.py` — P1. 이 패키지는 아직 쓰기를 모른다.

## 규약

- **refresh token 은 최초 동의 때만 온다.** 갱신 응답의 None 을 저장하면 연결이 하루 뒤에
  조용히 죽는다 — `token_store.save` 가 None 이면 기존 값을 유지한다.
- 권한 박탈 / refresh 실패 → `revoked_at` set + 다음 진입 시 재연결 안내
  (`CALENDAR_NOT_CONNECTED`).
- 연결 해제는 **우리 DB 를 먼저 확정**하고 원격 회수는 그 뒤에 best-effort. 순서를 뒤집으면
  Google 은 끊겼는데 우리는 연결됐다고 믿는 상태가 생긴다.
- hard delete 금지 — 해제는 `revoked_at` (AGENTS §2).
