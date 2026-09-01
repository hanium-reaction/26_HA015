# ADR-0009: 가변 길이 세션 — 계획의 단위를 '개수'에서 '분'으로

- 상태: 제안 (2026-08-27)
- 관련: ADR-0007 (마일스톤 층·4주 주기), ADR-0008 (만다라 실행 주기), #18 First Plan,
  #20-B replan, #191 (휴식 여백), #225 (짧은 처리성 작업), api-contract §7·§9·§11·§12
- 영향 모듈: `prompts/planning/goal_decompose` · `prompts/planning/plan_quality` ·
  `orchestrator/first_plan` · `orchestrator/first_plan_adapter` · `orchestrator/plan_scheduler` ·
  `orchestrator/recovery` · `api/routes/recovery` · `domain/missed_check_in` ·
  `integrations/google_calendar`

## 배경

계획의 단위가 지금은 **"거의 같은 길이의 세션"** 이다. 네 곳이 이걸 강제한다.

**① 분해 프롬프트가 균일화를 지시한다.**
`goal_decompose.v1.md:103-107` — "estimated_minutes 를 `{{session_length}}` 과 **같거나
비슷하게** 잡아라. 이 값의 **절반보다 짧게 만들지 마라**." 예외는 :108-110 의 '신청·발급·예약'
한 줄이고, 거기서 허용하는 폭도 15~30분이다.

**② 정규화가 상한을 사실상 기본값으로 만든다.**
`first_plan_adapter.py:326 normalize_action_minutes` 는 `[min(15, session_len),
planned_session_min_for]` 로 클램프한다. 밴드 자체는 가변을 허용하지만 ①이 LLM 을 상한
근처로 몰아 실질 분포가 거의 한 점이다. **단, `session_length_min` 을 답하지 않은
사용자에게는 이 함수가 no-op 이다**(`:343-344`) — 그 경로에서는 지금도 길이가 균일하지 않다.

**③ 검토 LLM 이 이탈을 능동적으로 반려한다.**
`plan_quality.v2.md:15-17` 체크리스트 1번 — "각 action_item 의 estimated_minutes 가 '한 번
집중 가능 시간'과 크게 어긋나지 않는가." 어긋나면 미승인 → `first_plan` 이 재분해 사이클로
되돌아간다. ①②만 풀면 ③이 **시끄럽게** 계획을 되돌린다.

**④ 용량을 '개수'로 센다 — 이게 진짜 잠금이다.**
`target_sessions_per_week`(`:959`) → `horizon_session_target`(`:399`) →
`shape_action_plan` 의 `items[:max_sessions]`(`:501-506`). 여기서 끝이 아니다.

- `extend_action_plan_to_horizon`(`:800-804`) — shape **직후에** 실행되며, 개수 목표의
  90%(`_COVERAGE_FLOOR_RATIO`) 미만이면 `planned_session_min_for` 길이의 "N회차" 카드로
  **개수를 되채운다**.
- `first_plan.py:621 days_needed = ceil(len(action_items)×7 / rate)` — 배치 **창 너비**도
  카드 개수다. 10분 20개와 180분 20개가 같은 창을 받는다.
- `plan_scheduler.py:333-338` stride 분산도 세션 개수 기준이다.
- 룰 폴백(`first_plan.py:192, 207-228`)은 아예 전부 같은 길이로 생성한다.

즉 ①②③만 풀면 ④가 **조용히** 깨진다. 15분짜리 20개와 120분짜리 20개가 똑같이 "20세션"으로
통과하고, 주당 분량이 최대 8배까지 어긋난다. `volume_shortfall_warning`·`daily_overload_notice`
는 배치 **결과**에서 역산하므로 경고는 뜨지만, 그때는 이미 사용자가 못 지킬 계획을 본 뒤다.

**순서가 결론이다: 용량의 단위를 분으로 바꾸는 것이 먼저다.**

### 왜 지금 바꾸나

일정은 성격에 따라 길이가 다르다. "비자 수령 확인"은 15분이고 "포트폴리오 초안"은 3시간이다.
길이가 내용을 못 따라가면 계획이 처음부터 못 지킬 약속이 되고, 그러면 이 제품의 본체인
**추적 → 회복** 루프가 "사용자가 못 한 것"이 아니라 "계획이 틀린 것"을 계속 회복시킨다.

`planned_session_min_for` 의 docstring(`:264-267`)이 그 대가를 이미 적어 놨다 —
*"용량을 넘는 볼륨은 계획에 담지 않는다"*. 분할 조각이 서로 다른 날로 흩어져 케이던스가
깨지는 걸 피하려고 **분량 자체를 버리는** 설계다. 길이가 의미를 갖는 순간 이건 "긴 작업은
계획에 아예 안 들어감"이 된다.

## 결정

### D1. 용량의 단위를 개수에서 **분** 으로 바꾼다

신설: `weekly_minutes(outcome, density) -> int`

```
weekly_minutes = target_sessions_per_week(outcome, density) × planned_session_min_for(outcome)
```

**`weekly_hours × 60` 이 아니다.** 현재 유효 주당 분량은 `weekly_hours` 경로에서
density 배율(0.7/1.0/1.3)과 `[2, 14]` 클램프를 거친 뒤(`:978-980`) 세션 길이를 곱한 값이다.
`weekly_hours × 60` 으로 정의하면 그 두 보정이 사라져 주당 분량이 −14% ~ −70% 까지 바뀐다
(hours=10·session=50·intense → 700분 vs 600분; hours=0.5 → 100분 vs 30분). 위 정의라야
**진짜로 동작 변화가 없다**. 우선순위도 코드와 같다 — `frequency_per_week` 가 1순위다.

바꾸는 곳(**전부 같은 PR**):

- `shape_action_plan` — `items[:max_sessions]` → **누적 분이 `horizon_minute_budget` 을
  넘는 지점에서 절단**. `_prune_to_leaves` 연동은 그대로.
- `extend_action_plan_to_horizon` — 부족 판정과 보충을 **분** 기준으로. 개수로 되채우면
  위 절단이 즉시 무효가 된다.
- `first_plan.py:621 days_needed` — `ceil(총 분 × 7 / weekly_minutes)`.

**남기는 것**: `target_sessions_per_week` / `horizon_session_target` / `llm_session_target`
(`_MAX_LLM_SESSIONS=20`). 분해 LLM 에 주는 "몇 개 만들어라"는 여전히 개수라야 한다 —
20s 타임아웃 벽은 분이 아니라 생성량에 걸린다.

`daily_focus_cap_min` · `committed_minutes_by_day` 는 이미 분 단위다(D3 에서 상한 정의만 손댐).

### D2. 길이를 내용에서 나오게 한다 — **밴드는 두지 않는다**

`estimated_minutes` 하나로 간다. 초안에서 `quick/standard/deep` 밴드를 스키마에 넣는 안을
검토했고 **기각했다**: 하류 소비자 셋이 전부 숫자만으로 성립한다(D3 무분할 판정 =
`est ≤ focus_chunk_min`, D5 유예 = `est × 0.3`, D6 축소 = `원본 × 비율`). 밴드가 유일하게
더 주는 "쪼개지 마라" 신호는 소비자가 없다 — D3 참고. 대신 치를 값은 크다:
`ActionItemDraft` 스키마 + LLM 출력 스키마 + 룰 폴백의 밴드값 정의 + 만다라 경로 +
DB 컬럼(마이그레이션, AGENTS §8). 소비자 없는 필드에 그 값을 치르지 않는다.

바꾸는 것:

- **`goal_decompose` v2** — "세션 길이와 같거나 비슷하게 / 절반보다 짧게 금지"를 걷어내고,
  **작업 성격에서 시간을 잡되 `{{session_length}}`(한 번에 집중 가능한 시간)을 넘지 마라**로
  바꾼다. 짧은 처리성 작업의 예외 조항은 예외가 아니라 일반 규칙이 된다.
- **`plan_quality` v3** — 체크리스트 1번을 "세션 길이와 크게 어긋나지 않는가"에서
  **"집중 가능 시간을 초과하지 않는가 + 작업 성격에 비해 부풀거나 쪼그라들지 않았는가"** 로.
  이걸 같이 안 고치면 검토 LLM 이 계획을 반려해 재분해 사이클이 돈다(= LLM 호출 증가).
- **`normalize_action_minutes` 상한** — `planned_session_min_for`(배분값) →
  `session_min_for`(집중 용량). 배분값을 상한으로 두면 긴 작업이 구조적으로 불가능하다.
- **하한은 15분 유지.** `_MIN_ACTION_MINUTES=15`(`:322`) · `_MIN_SESSION_MIN=15`
  (`plan_scheduler.py:47`) · 15분 격자(`snap_to_15min` 등)가 전부 15로 맞물려 있다.
  10분 카드를 만들려면 셋을 동시에 내려야 하고 그건 이 ADR 범위 밖이다.
- **`session_length_min` 미답 경로** — 지금은 normalize 가 no-op 이라 LLM 값이 무검증
  통과한다. 전역 `focus_duration_min` 또는 기본값으로 상한을 걸어 **모든 경로가 상한을
  갖게** 한다(현재 구멍 메우기).

`tests/prompts/` 회귀(AGENTS §6)를 두 프롬프트 모두에 대해 같은 PR 에 넣는다.

### D3. 스케줄러 — 자투리를 쓰고, 하루 상한을 다시 정의한다

- **분할은 지금도 거의 안 일어나고, 그대로 둔다.** `focus_chunk_min_from_outcome` 은
  `session_min_for` 와 같은 값이다(`:1715-1717` vs `plan_scheduler.py:238`). D2 가 상한을
  `session_min_for` 로 올리면 `_split_minutes` 의 `total ≤ chunk` 가 항상 참이라 분할이
  발생하지 않는다. **의도한 결과다** — 사용자가 "한 번에 이만큼 집중 가능"이라 답한 값
  안에서만 카드가 만들어지므로 쪼갤 이유가 없다. 긴 카드가 연속 슬롯을 못 찾으면 분할이
  아니라 **경고**로 알린다(조용히 줄이지 않는다 — 기존 원칙).
- **자투리 채우기 3차 패스.** 1차(상한 준수) · 2차(가용 시간 채움) 뒤에, 남은 **짧은 free
  조각**에 그 조각에 들어가는 짧은 카드를 배치한다. 지금은 수업 사이 20분이 100% 버려진다.
  캘린더 연동(D4)의 실익 대부분이 여기서 나온다.
- **`daily_cap_for_plan` 재정의.** 현재 `max(daily_cap_for(density), session_min_for)`
  (`:1001`) 는 "목표당 세션 길이가 하나"라는 전제에 기댄다. 길이가 제각각이면 가장 긴 카드
  하나가 상한을 통째로 먹어 같은 날 다른 카드가 1차 배치에서 전부 탈락한다
  (`plan_scheduler.py:356`). → `max(daily_cap_for(density), 이 계획의 최장 카드 분)` 으로
  바꾼다. "하루 한 세션은 정상"이라는 원래 의도(#191 주석)를 길이가 갈린 뒤에도 지킨다.
- **stride 는 유지.** 순서 보존(앞 단계가 앞 날짜)은 그대로.
- **주간 재계획도 같이.** `orchestrator/replan.py:84-123` 은 `schedule_actions_multiday` 를
  `roomy_busy_for_day`·`committed_min_by_day` **없이** 호출하고, 폴백 튜닝이
  `focus_chunk_min=60` 하드코딩이다(`api/routes/planning.py:1231`). 첫 계획만 고치면 재계획이
  같은 계획을 도로 균일화한다.

### D4. 캘린더 — busy 소스이면서 **문맥**

배선 자리는 이미 있다. `first_plan.py:668-677 busy_for_day` 가
`time_policies + fixed_schedules + existing_busy + past` 를 합치는 곳에 **네 번째 소스**로
Google Calendar busy 를 더한다.

'앞뒤 일정 고려'는 세 개의 **룰**로 분해한다. LLM 0회.

1. **전이 버퍼** — 외부 일정 앞뒤에 이동·전환 시간을 둔다.
   ⚠️ **`pad_busy` 로 넣으면 안 된다.** `pad_busy` 는 `roomy_busy_for_day`(1차 배치)에만
   들어가고 2차 패스는 패딩 없는 `busy_for_day` 를 쓴다(`plan_scheduler.py:358`) — 넣어도
   2차에서 통째로 무시돼 "외부 일정에 딱 붙여 배치"가 그대로 재발한다. #191 의 휴식 여백은
   *편의*라 1차에만 두는 게 맞지만, 전이 버퍼는 *물리적으로 불가능한 시간*이라
   **양쪽 패스 모두**에 들어가야 한다. `busy_for_day` 에 직접 넣는다.
   (`pad_busy` 자체도 마진을 하나만 받으므로 소스별 마진이 필요하면 시그니처를 넓힌다.)
2. **부하 감쇠** — 직전 연속 busy 가 길수록 그 뒤 슬롯의 허용 카드 길이를 낮춘다. 4시간 시험
   직후에 3시간 딥워크를 넣지 않는다. 긴 카드는 감쇠된 슬롯을 건너뛰고 짧은 카드는 들어간다.
3. **자투리 활용** — D3 의 3차 패스가 외부 일정 사이 15~30분 조각을 짧은 카드로 채운다.

**freebusy 만으로 세 룰이 전부 성립한다** — 필요한 건 구간의 길이와 인접성뿐이고 제목·장소는
필요 없다. 제목·장소까지 읽는 `calendar.readonly` 확대는 이 ADR 범위 밖이다.

⚠️ **그러나 이건 §1 잠금 안이 아니다.** `docs/api-contract.md:537` 이
*"Google Calendar OAuth **자체를 P1 로 미룸**(PM 결정)"* 이라 못박고 `/calendar/connect` 는
501 이며(`api/routes/calendar.py:39-41`) `integrations/google_calendar/` 는 빈 패키지다.
즉 D4 는 write-back 이 아니라 **연결 자체를 앞당기는 제안**이라 AGENTS §8 대상이다.
write-back(events.insert)은 이 ADR 에서도 P1 유지 — 읽기만 한다.

### D5. 추적 — 고정 유예를 길이 비례로

`domain/missed_check_in.py:31 MISSED_CHECK_IN_DELAY = 20분` 은 카드 길이와 무관하다.
15분짜리 카드는 **끝나고 5분 뒤**에야 미체크로 잡히고, 그 배지는 "시작하라"는 신호로서
쓸모가 없다(영영 사라지지 않는 유령 배지가 된다).

```
delay = min(MISSED_CHECK_IN_DELAY, max(5분, estimated_minutes × 0.3))
```

상한 20분을 **유지**한다 — 근거 대장 §6.2 T1 이 명시한 값이라, 짧은 카드의 오탐만 없애는
방향으로만 완화한다. `docs/api-contract.md:585-586` 이 "`startAt` + 20분"을 계약 텍스트로
적고 있으므로 **동반 PR** 이 필요하다(§8 목록).

지표도 같은 문제다. `weekly_review.py:185, 196` 의 adherence·resilience 는 **카드 개수** 비율이라
15분 카드 9장 완료 + 3시간 딥워크 1장 실패 = 90% 가 된다. 기존 정의는 **건드리지 않고**
`plannedMinutes` / `completedMinutes` 를 **추가**한다. 더불어 지금은 "예상 대비 실제" 지표가
아예 없다 — `today.py:365 actual_duration_minutes` 는 벽시계일 뿐 계획 길이와 한 번도
비교되지 않는다. 가변 길이가 되면 그게 계획 품질의 1차 신호가 되므로 같이 노출한다.

알림 쪽 관련 사실(이 ADR 은 **바꾸지 않고 기록만** 한다): `notify_sweeps.py:208` 은
`start_at` 만 보고 블록 길이는 쿼리에도 payload 에도 없다. `PUSH_WEEKLY_BUDGET=3`
(`safety/push_gate.py:46`)은 §1 잠금이라 짧은 카드가 늘어도 예산은 그대로다 —
**의도한 동작**이다. `morning_brief.py:52-58, 80` 의 "오늘 N개" 문구가 개수 기반이라
15분 카드 8장을 과장하는 것만 분 병기로 다듬는다.

### D6. 회복 — 여기가 가장 위험하다

**(a) CARRY_OVER 가 원본 길이를 잃는다 — 지금도 결함.**
`api/routes/recovery.py:604-615 _create_recovery_action` 은 `original` 을 로드해 놓고
**`category` 만** 상속하고, 길이는 `recovery_unit_minutes(strategy.min_recovery_unit_minutes)`
즉 카탈로그 상수로 덮어쓴다. DOWNSCOPE 와 CARRY_OVER 가 같은 함수를 공유한다.
`ReplanDiffResponse.before.estimatedMinutes`(`:832`)에 원본이 **표시만** 되고 실제 배치는
회복 카드 값(`:750, :840`)을 쓴다. 길이가 균일한 지금은 "작게 다시 시작한다"로 읽히지만,
가변 길이가 되면 **3시간 딥워크를 내일로 미뤘더니 5분 카드가 되는** 명백한 결함이다.
CARRY_OVER 는 정의상 '그대로 옮기기'이므로 **원본 `estimated_minutes` 를 보존**한다.

**(b) DOWNSCOPE 가 비례하지 않는다.**

```
downscope_minutes = clamp(원본 × 비율, max(전략 min_recovery_unit_minutes, 5), 원본)
```

하한이 `max(전략값, 5)` 인 것이 중요하다 — `recovery_unit_minutes`(`orchestrator/recovery.py:293-300`)
는 `max(전략값, DEFAULT_RECOVERY_MINUTES=5)` 라 5 는 **기본값이 아니라 하한**이다.
하한을 전략값만으로 두면 지금보다 짧은 회복 카드가 생긴다. 상한이 원본인 것도 필요하다 —
전략 최소 단위가 30분인데 원본이 15분이면 지금은 DOWNSCOPE 가 **확대**된다.

**(c) 회복 배치가 free/busy 를 보지 않는다.**
`orchestrator/recovery.py:314-377 shift_to_recovery_day` 는 룰 기반이고
`api/routes/recovery.py:869` 의 `create_block` 은 겹침 검사도 정책 검사도 하지 않는다.
`docs/api-contract.md:729-730` 은 이걸 **명시적 비목표**로 적으면서 근거를 이렇게 댄다 —
*"방금 승인된 5~30분 행동이라 슬롯 탐색을 하지 않는다"*. **(a) 를 고치면 그 전제가 사라진다.**
캘린더까지 붙으면 계획 블록만 외부 일정을 피하고 **회복 블록만 한복판에 떨어진다**.
게다가 `recovery.py:371` 의 `earliest + estimated_minutes ≤ night` 이 길이를 보는 유일한
분기라, 회복이 길어지면 이 분기가 상시 발동해 "다음날 07:00" 이 예외가 아니라 기본이 된다
(카드 `target_date` ↔ 블록 날짜 불일치가 상시화).

→ 회복 배치도 `plan_scheduler` 의 배치 함수를 재사용해 단일 진실로 만든다.
**계약의 명시적 비목표를 바꾸는 것이므로 AGENTS §8 — 사람 합의 후 진행.**

> 참고: §12 문단(`:718-728`)은 이미 코드와 어긋나 있다 — "회복 `targetDate` 는 어떤 경우에도
> 바뀌지 않아 카드 날짜와 블록 날짜는 항상 같은 날"이라 쓰지만 `recovery.py:374-375` 는
> 다음날 07시로 넘긴다(그 docstring 이 스스로 인정). §12 는 어차피 손봐야 한다.

## 하지 않는 것

- **잠금 결정(§1) 우회 없음.** Draft Layer + 3버튼 유지, 자동 적용 없음, 21시 일괄 회고 유지,
  주 ≤3건 push 예산 유지, 캘린더 write-back P1 유지.
- **원본 `action_item.status` 불변** — D6 어느 항목도 건드리지 않는다.
- **LLM 호출 추가 없음.** D3·D4 는 전부 룰이다. D2 는 기존 두 프롬프트의 문구만 바꾼다
  (오히려 ③의 반려 루프를 줄여 호출이 준다).
- **15분 미만 카드 없음.** 하한 3종(`_MIN_ACTION_MINUTES` / `_MIN_SESSION_MIN` / 15분 격자)을
  내리는 건 별건.
- **밴드(quick/standard/deep) 없음** — D2 참고. DB 마이그레이션 없음.

## 사람 합의가 필요한 것 (AGENTS §8)

1. **Google Calendar OAuth 의 P1 해제** (D4) — `api-contract.md:537` PM 결정. §1·§8 양쪽에
   걸린다. 이 합의 없이는 D4 전체가 불가.
2. **api-contract §12 의 회복 배치 비목표 철회** (D6-c) — 계약 변경.
3. **api-contract §11 `startAt + 20분` 텍스트 변경** (D5) — 계약 변경, 동반 PR.
4. **`average_recovery_minutes` 의 의미 변경** (D6-a 부수효과) —
   `weekly_review.py:227-230` 은 이미 분 기반이라, CARRY_OVER 가 원본 길이를 보존하면
   **값의 의미가 급변**한다(5분 고정 → 원본 길이). 지표 정의 문서 갱신 필요.
5. **응답 스키마 확장** — `plannedMinutes`/`completedMinutes` 추가 (D5).
6. **`schemas/planning.py:50 le=240`** — 집중 용량을 240분 이상으로 답한 사용자가 실재하므로
   (`:991-998`) 상한 상향이 필요한지 확인.

## 순서 (한 PR 한 조각)

| PR | 내용 | 선행 조건 |
| --- | --- | --- |
| 1 | **D6-(a)(b)** — CARRY_OVER 길이 보존 · DOWNSCOPE 비례 축소 | 없음. **지금도 결함**이라 D1 보다 앞선다 |
| 2 | **D1** — `weekly_minutes` 신설 + `shape_action_plan` · `extend_action_plan_to_horizon` · `days_needed` 를 분 기준으로 | 셋을 **한 PR 에**. 하나라도 빠지면 예산이 즉시 되채워진다 |
| 3 | **D2** — `goal_decompose` v2 + `plan_quality` v3 + normalize 상한/미답 경로 + `tests/prompts/` 회귀 | PR 2. **여기서 길이가 갈라진다** |
| 4 | **D3** — 자투리 3차 패스 + `daily_cap_for_plan` 재정의 + replan 호출 정합 | PR 3 |
| 5 | **D5** — 미체크 유예 비례(계약 동반) + 분 가중 지표 추가 | §8-3, §8-5 |
| 6 | **D6-(c)** — 회복 배치의 슬롯 인지 | §8-2 합의 |
| 7 | **D4** — Google Calendar freebusy 실구현 + 전이 버퍼 / 부하 감쇠 | §8-1 합의. 가장 크다 |

PR 3 을 PR 2 보다 먼저 머지하면 주당 분량이 조용히 어긋난다. 순서를 바꾸지 말 것.

## 이 ADR 이 다루지 않은, 확인된 인접 결함

같이 고칠 필요는 없지만 기록해 둔다 — 가변 길이가 되면 전부 더 아프다.

- `api/routes/planning.py:589` 는 블록 이동 시 길이를 보존하지만 `estimated_minutes` 는
  갱신하지 않는다. 사용자가 **리사이즈**(`endAt` 동봉)하면 카드와 블록의 길이가 갈리고,
  재계획의 `remaining = (estimated_minutes or 30) - covered`(`:1382-1385`)가 조용히 틀린다.
- `repositories/execution_repo.py:148 create_adhoc_block` — 즉석 실행 블록을
  `start + estimated_minutes` 로 만들면서 시간 정책·겹침 검사를 하지 않는다.
  S15 편집기는 같은 시각을 `POLICY_VIOLATION`(422)으로 거부한다(서버가 사용자보다 느슨하다).
- `notify_sweeps.py:102-130` 저녁 회고는 21시에 "돌아볼 카드 N장"을 세는데, 20시에 시작한
  긴 카드는 **아직 진행 중**이다.
- `mandala_adapter.py:49 _RING_SIZE=8` 고정 격자 — 분 예산 절단이 만다라 유래 목표
  (ADR-0008, `max_plan_weeks=2`)에 걸리면 8칸 대칭이 분 기준으로 깨질 수 있다.
