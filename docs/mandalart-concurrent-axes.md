# 만다라트 8축 **동시 진행** 설계서 (개정판 v2)

> 대상 레포: `/Users/imhyeongjun/Desktop/reaction/.claude/worktrees/mandala-map-ultimate-goal-2bdf25`
> 선행 문서: `docs/ultimate-goal-mandalart-strategy.md` (이하 **전략서**). 이 문서는 그 위에 얹는 **실행 층** 설계다.
> v1 대비: 비평 15건 전부 반영. 특히 **§4 마이그레이션 신설**, **§7.4 payload 4경로 표**, **§7.5 코드 스켈레톤**, **§2.4 분모 정의 열**, **§11.2 3갈래 롤업 SQL**, **§12.1 의존 그래프**가 새로 들어갔고, 틀린 주장 3건(모닝브리프 8슬롯 재활용 / MP2 무마이그레이션 / tick progress)은 코드로 반증해 삭제·교체했다.

---

## §0. 결론 요약

### 0.1 세 줄

1. **균질한 8축은 산술적으로 불가능하고, 성격이 분화된 8축은 넉넉히 가능하다.** 8축을 전부 세션형으로 굴리면 주 부하가 하루 상한의 **128%**, 3모드(`deep`/`light`/`tick`)로 나누면 **56.7%** 다(§2.3~2.5, 분모는 §2.4 ①).
2. **"한 계획 = heaviest 하나"는 §1 잠금이 아니다.** `docs/api-contract.md:273` 의 구현 결정(#32/#62/#187)일 뿐이고, `AGENTS.md:17-31` 이 잠근 건 **Focus 3 / Maintain 5 / Parked 자유**(`:28`)다. 이 설계는 **`_TIER_LIMITS` 를 한 칸도 쓰지 않는다** — 궁극목표는 `parked` 이고(전략서 §3.2), 만다라 축은 goals 행이 되지 않는다.
3. **이 설계의 존재 조건은 배분 엔진이 아니라 승인 안전성이다.** `_archive_goal_nodes`(`first_plan_adapter.py:1515-1533`)의 WHERE 에 `tree_kind` 도 축 스코프도 없어서, 지금 코드에 다축을 얹으면 **계획 승인 한 번에 만다라 73칸이 통째로 `archived_at` 처리된다.** MP2 회귀 7개가 초록이 아니면 그 위의 모든 PR 은 머지 금지다.

### 0.2 "동시"의 조작적 정의 (깨지면 실패로 간주)

> ① 어느 주에도 실행 분량이 임계 미만인 축이 없고
> ② 8축의 세션이 **단일 배치 패스**에서 서로를 알면서 배치되고
> ③ 사용자가 **한 번의 승인**으로 받는다.
> └ ①은 `dormant_axes`(§11.6)가 매주 측정한다. ②는 §6, ③은 §7.

### 0.3 잠금 준수 선언 (AGENTS §1·§2)

| 잠금 | 이 설계가 하는 일 |
|---|---|
| Focus ≤3 / Maintain ≤5 / Parked 자유 (`AGENTS.md:28`, `goals.py:42`) | **한 칸도 소비하지 않는다.** 만다라 모드 한도는 별도 예산(§13 Q1) |
| 알림 주 ≤3건 / 3클래스 (`push_gate.py:45`, `notification_send.py:29`) | **상향 제안 없음.** 축 정보는 인앱 전용(§10.2) |
| 미회고 카드 3일 자동 만료 (`expire_reflections.py:48`) | 그대로. 3일 누적 최악치를 12세션 상한으로 묶는다(§10.1) |
| AI 출력 = Draft + 3버튼, 자동 적용 금지 | 축별 초안도 동일. 부분 승인 없음(§7.4) |
| hard delete 금지 | 마이그레이션 downgrade 에 DELETE 0개(§4.2) |
| LLM 은 `aiClient.run()` 단일 게이트, 도메인 8종 잠금 | 신규 도메인 0. `planning/` 아래 프롬프트 2개 추가(§8.1) |

---

## §1. 현행 코드가 단일목표를 가정하는 지점 — 전수표

난이도: **S** = 인자 추가/호출부, **M** = 함수 내부 재설계, **L** = 계약·스키마·마이그레이션.

### 1.1 A. 프롬프트 컨텍스트 (LLM 입력)

| # | 위치 | 단일목표 가정 | 다축 전환 | 난이도 |
|---|---|---|---|---|
| A1 | `first_plan_adapter.py:848` `context_from_outcome` | `heaviest = next(...)` 하나로 prompt_vars 21개 전부 평탄화 | `goal` 인자화 → **목표당 1 dict**. heaviest 선택을 호출자로 | S |
| A2 | `:211` `session_min_for` | `heaviest.session_length_min` | goal 인자화 | S |
| A3 | `:295` `normalize_action_minutes` | heaviest 세션 밴드로 전 축 클램프 | 축별 밴드 | S |
| A4 | `:667` `target_sessions_per_week` | `heaviest.frequency_per_week` → weekly_hours → density | **축별 rate + 상위 배분기 신설**(§6.1). 지금 그런 게 없다 | M |
| A5 | `:348` `_MAX_LLM_SESSIONS = 20` | **한 콜 예산**. 주석(`:337-348`)이 12·16·20 성공 / 28 폴백을 실측 기록 | 축당 1콜로 쪼개면 자연 해결(§5.3) | — |
| A6 | `:365` `_horizon_weeks` | `outcome.horizon` = 전 목표 마감의 max 하나 | 축별 deadline → 축별 horizon | M |
| A7 | `first_plan_milestones.py:26-42` | Stage A 마일스톤도 heaviest 1개 | 축별 | S |

### 1.2 B. 분해 후처리 — **다축에서 조용히 축을 날린다**

| # | 위치 | 무슨 일이 벌어지나 | 난이도 |
|---|---|---|---|
| B1 | `first_plan_adapter.py:407` `shape_action_plan` | heaviest rate 로 `max_sessions` 산정 후 `items[:max_sessions]` — 8축 액션을 한 리스트에 담으면 **뒤쪽 축이 통째로 잘린다**(그리고 `_prune_to_leaves` 가 그 트리까지 지운다) | M |
| B2 | `:483` `extend_action_plan_to_horizon` | ① heaviest freq 만 봄 ② `root = next(n for n in nodes if n.parent_id is None)` — **첫 root 에만** 이어가기 붙임 ③ `"tmp-continue"` **하드코딩 id** → N콜 병합 시 100% 충돌 | M |
| B3 | `first_plan.py:165` `_rule_decomposition` | 룰 폴백이 heaviest 트리 **하나만**. `"tmp-root"`/`"tmp-leaf-{i}"` 하드코딩 | M |

> **temp id 네임스페이스는 선택이 아니라 필수다.** 축 접두사(`ax{k}-tmp-root`)를 안 붙이면 N콜 결과 병합이 조용히 덮어쓴다.

### 1.3 C. 배치 (룰 스케줄러)

| # | 위치 | 단일목표 가정 | 난이도 |
|---|---|---|---|
| C1 | `plan_scheduler.py:50-61` `PlanAction` | 필드 5개(`id/node_id/title/category/estimated_minutes`) — **goal/axis 식별자 없음** | S |
| C2 | `:268-273` 세션 평탄화 | 정렬 기준이 **입력 리스트 인덱스**뿐. 정렬 코드 자체가 없다 | M |
| C3 | `:279-284` `_target_day_index` | `round(idx*(D-1)/(N-1))` — 인덱스를 날짜로 직선 사상. 축 개념 없음 | M |
| C4 | `:302` 하루 상한 | `if respect_cap and used_by_day[day] > 0 and ... > cap: continue` — **빈 날은 검사 자체를 건너뛴다** | M |
| C5 | `:320/328` 2차 패스 | `respect_cap=False` — 주석이 "상한 무시하고 채운다(#fill-available)" 라고 명시 | M |
| C6 | `:196` `peak_windows` | **호출당 하나**. `peak_windows_for_plan`(`fpa:1302`)이 heaviest 의 `preferred_time` 을 계획 전체에 적용 | **L** |
| C7 | `:197/238` `focus_chunk_min` | **스칼라 하나**가 모든 축 액션의 분할 기준 | **L** |
| C8 | `fpa:696` `daily_cap_for_plan` | heaviest 세션 길이가 하루 상한을 끌어올린다 | M |

**실측(재현 스크립트 3종, 실제 `schedule_actions_multiday` 호출):**
- 단순 이어붙이기 → "동시"가 아니라 **날짜축 직렬화**(A는 월~목, B는 목~일).
- 라운드로빈 인터리브 → 날짜는 섞이지만 **매일 18:00 을 앞 인덱스 축이 독점**.
- 8축 × 주3세션 순차 8회 → G축 주3회가 **수요일 하루에 3연속**, 마지막 H축은 2차 패스로 21:20 에 밀려 그날을 240분으로 만든다. **경고는 0건.**

> 8축 동시의 실패 모드는 "에러"가 아니라 **무증상 과부하**다. 사용자는 실현 불가능한 캘린더를 받고, 그게 불가능하다는 사실을 모른다.

### 1.4 D~G. 경고·스키마·영속화·재계획

| # | 위치 | 문제 | 난이도 |
|---|---|---|---|
| D1 | `fpa:150` `other_goals_deferred_notice` | "이번 계획은 'X' 한 가지에 집중했어요" — 다축 계획에서 **명백한 오정보** | S |
| E1 | `schemas/planning.py:31-53` `GoalNodeDraft`/`ActionItemDraft` | 축 식별자 없음. `parent_id` 체인 유추만 가능 | M(additive) |
| E2 | `schemas/planning.py:155-169` `DraftMixin.ai_source` | **초안당 하나뿐** — 축 1개가 룰 폴백이어도 전체가 `llm` 으로 보인다(→ R1) | S(additive) |
| E3 | `interview_adapter.py:250-268` `_build_goals` | per-goal 필드 7종을 **`is_heaviest` 목표에만** 채운다. 스키마엔 필드가 다 있는데 어댑터가 버린다 | **L** |
| **F1** | `fpa:1750` `supersede_previous_plan(goal_id=heaviest.id)` | 다축 승인 시 **1축분만** 교체, 7축분 누적 | M |
| **F2** | `fpa:1515-1533` `_archive_goal_nodes` | WHERE 가 `goal_id + archived_at IS NULL` **뿐**. `tree_kind` 도 축 스코프도 없다 | **L** |
| F3 | `fpa:1759/1797` | `n.goal_id = heaviest.id` / `row.goal_id = heaviest.id` — **8축 트리·카드가 전부 1축 밑으로 접힌다** | M |
| F4 | `fpa:1582` `heaviest_goal_id` | generate 의 busy 제외 대상이 1개 → 나머지 7축의 "곧 지울" 블록을 피해 나쁘게 배치 | S |
| F5 | `goal_repo.py:43-56` `list_nodes` | `archived_at IS NULL` 만. 만다라 트리와 계획 트리를 가를 축이 **없다** | **L** |
| G1 | `planning.py:842-864` `_replan_tuning_for` | heaviest 의 선호시간·세션길이를 **모든 목표 액션에** 적용. `daily_focus_cap_min` 은 상수로 리셋 | M |
| G2 | `replan.py:49-56, 101-110` | `ReplanCandidate`/`PlanAction` 에 축 개념 0 | S |
| G3 | `planning.py:955-1084` `generate_replan` | **goal 필터가 하나도 없다 = 이미 다목표 대응 완료.** 유일한 결함이 G1 | — |

**합계 병목 34개** (S 11 / M 18 / L 5), 계약 파괴 5건.

### 1.5 반증한 통념 3개 (코드로)

| 통념 | 반증 |
|---|---|
| "모닝 브리프의 focus 3 + maintain 5 = 8슬롯을 축 라벨로 재활용하면 된다" | ❌ `morning_brief.py:122-125` — `maintain_cards` 는 `tiers.get(goal_id)=="maintain"` 만, `focus_cards` 는 **나머지 전부**(`goal_id is None` 포함). 만다라 카드는 전부 `parked` 궁극목표 소속이라 **전량 focus_cards** 로 떨어지고 `:136 _titles(focus_cards, 3)` 이 3개로 자른다. **maintain 5칸은 영구히 빈다** |
| "`reserve_habit_sessions` 로 스케줄러가 습관 세션을 예약한다" | ❌ `goal_structuring.py:416-611` 프로덕션 호출자 **0개**. 게다가 `scheduled_blocks.action_item_id` 가 **NOT NULL**(`scheduled_block.py:51-56`)이라 습관 블록은 **저장 자체가 불가능** |
| "`api-contract.md:276` 의 targetDate 교체 규칙" | ❌ 코드는 #222 이후 **goal 단위·날짜 무관**(`fpa:1375-1381` 주석이 근거를 적어둠). **문서가 지금 이미 틀렸다** |

---

## §2. 용량 산술

### 2.1 시간 소스 4층 (혼동하면 §2.4 가 무의미해진다)

| 층 | 값 | 근거 |
|---|---|---|
| A. 스케줄러가 아는 free | **69.0h/주** (온보딩 기본 `late_night_block` 22:00 적용 시) | `time_policies_to_busy` + `compute_free_blocks` 실측(대학생 모델: 활동창 09~23, 점심 1h, 평일 수업 3h) |
| B. 현실 가용 | **≈32.5h/주** | A − 통학 5h − 식사 7h − 씻기·정리 3.5h − 알바/동아리 6h − 사회·휴식 7h − 잡무 15h. **⚠️ 시나리오 가정, 실측 아님.** 스케줄러는 이걸 모른다 |
| C. 제품이 스스로 선언한 지속가능 상한 | **21.0h/주** (standard 180분×7) | `first_plan_adapter.py:67` `_DENSITY_DAILY_CAP_MIN = {light:120, standard:180, intense:240}` |
| D. 피크창 슬롯 용량 | **주 21슬롯** (하루 3 × 7일) | `_PEAK_CHIP_WINDOWS`(`fpa:1255`), 저녁창 240분 ÷ (60+10) = 3 |

**실질 병목은 C 다.** A(69h)는 명목상 넉넉하지만 그 안에 저녁·이동·사회생활이 전부 들어 있다.

### 2.2 실행 모드 3종 — 오타니 격자가 균질하지 않다는 사실을 산술에 반영한다

| 모드 | 성격 | 저장 | LLM | 캘린더 블록 | 회복 카드 | 한도 |
|---|---|---|---|---|---|---|
| **deep** | 마감·범위 소진·분해 필요 (캡스톤, 자격증) | `goal_nodes(plan)` + `action_items` + `scheduled_blocks` | 축당 **1콜**(`goal_decompose.v1` 무변경) | ✅ | ✅ | **≤3** |
| **light** | 반복 회차형 (근력, 리스닝) | 동일 | **0콜** (룰 회차 생성) | ✅ | ✅ | **≤5** |
| **tick** | 무마감·무범위·짧음 (인사하기, 쓰레기 줍기) | `habits` + `habit_instances` | 0콜 | ❌ | **0장** | 자유 |

**세션형이 반드시 필요한 축의 판정 기준 3가지** — 하나라도 걸리면 tick 으로 못 민다:
1. **마감이 있다** — `habits` 에 `deadline` 컬럼이 없다(`db/models/habit.py` 전수).
2. **범위가 소진된다** — `habit_instances` 는 주 경계마다 카운터가 리셋된다(`scheduler/habit_instances.py:94-98`).
3. **한 세션이 길거나 쪼개져야 한다** — `focus_chunk_min` 분할("제목 (1/2)")은 습관 경로에 없다.

### 2.3 표준 주간 시간표 — **셀 단위 원본** (이하 모든 숫자의 유일한 출처)

구성: `deep` 3축(A·B·C) + `light` 3축(D·E·F) + `tick` 2축(G·H). 세션 예산 12(§6.1).

| 요일 | 18:00–19:00 | 19:10–19:40 | 그날 순수 | 그날 풋프린트 |
|---|---|---|---|---|
| 월 | **A** 60분 (deep) | **D** 30분 (light) | 90 | 100 |
| 화 | **B** 60분 (deep) | **E** 30분 (light) | 90 | 100 |
| 수 | **C** 60분 (deep) | **F** 30분 (light) | 90 | 100 |
| 목 | **A** 60분 (deep) | **D** 30분 (light) | 90 | 100 |
| 금 | **B** 60분 (deep) | **E** 30분 (light) | 90 | 100 |
| 토 | **C** 60분 (deep) | **F** 30분 (light) | 90 | 100 |
| 일 | — | — | 0 | 0 |
| **합** | 6세션 360분 | 6세션 180분 | **540분** | **600분** |

- **블록 세션 12개**, 순수 **540분**, 휴식 10분 × 6쌍 = **풋프린트 600분**. 세션이 놓인 날 = **6일**(일요일은 예비일, §M4).
- **tick 축 명목 부하**: G(주 7회 × 10분 = 70분) + H(주 3회 × 15분 = 45분) = **115분**. ⚠️ **명목값이다** — `habit_instances` 에 시각·소요 컬럼이 없다(`habit_instance.py:41-53`).
- **주간 총 부하 = 600 + 115 = 715분 = 11.9h/주.**
- **하루 실효 상한 = 180 − `habit_headroom_min`(17) = 163분**(§6.6). 최대일 100분 → 여유 63분.
- **deep 축은 전부 주 2세션** → `_MIN_DEEP_SESSIONS_PER_WEEK=2` 하한 충족(§6.1).

### 2.4 벤치마크 — **분모 정의 열 필수**

같은 값(715분)이 분모에 따라 완전히 다른 비율을 낸다. 인용할 때 **반드시 분모 번호를 함께 적는다.**

| 분모 | 정의 | 값 | 715분의 비율 |
|---|---|---|---|
| **①** | 7일 명목 상한 (180 × 7) | 1,260분 | **56.7%** ← 부록 C 가 쓰는 값 |
| ② | 실효 상한 (163 × 7, tick headroom 차감) | 1,141분 | 62.7% |
| ③ | 사용일 기준 (6일 × 180) | 1,080분 | 66.2% |
| ④ | 현실 가용 B (32.5h) | 1,950분 | 36.7% |
| ⑤ | 스케줄러 free A (69h) | 4,140분 | 17.3% |
| **⑥** | 피크 슬롯 · 7일 명목 (7 × 3) | 21슬롯 | **12/21 = 57.1%** ← 부록 C |
| ⑦ | 피크 슬롯 · 사용일 (6 × 3) | 18슬롯 | 12/18 = 66.7% |

> v1 의 "저녁 슬롯 12/21 = 57%" 와 "725분 = 57.5%" 는 **분모가 서로 달랐다**(하나는 7일 명목, 하나는 실효 상한). 이 표가 그 혼용을 없앤다.

### 2.5 균질 8축 반례 — 왜 분화가 필수인가

| 구성 | 세션 | 순수 | 풋프린트 | 분모 ① 비율 | 판정 |
|---|---|---|---|---|---|
| 8축 × 주1세션 × 60분 | 8 | 480 | 550 | 43.7% | ✅ 가능하나 deep 하한 미달 |
| 8축 × 주2세션 × 60분 | 16 | 960 | 1,120 | 88.9% | ⚠️ 마지막 안전 구간 |
| **8축 × 주3세션 × 60분** | 24 | 1,440 | 1,610 | **127.8%** | ❌ **불가능** |
| 8축 × 주7회 × 30분 | 56 | 1,680 | 2,240 | 177.8% | ❌ intense(28h)도 초과 |
| **본 설계(§2.3)** | 12 | 540 | 600(+115 명목) | **56.7%** | ✅ |

**균질한 8축은 산술적으로 불가능하고(128%), 성격이 나뉜 8축은 절반에서 끝난다(57%).** 이게 이 문서 전체의 수치적 근거다.

---

## §3. 인터뷰·결정 층 — 문항 폭발을 어떻게 피하는가

### 3.1 못 하는 것부터

`interview.py:101-114` `_PER_GOAL_SLOTS` 10종 × 8축 = **80문항**. 불가능하다. 그리고 `interview_adapter.py:250-268` `_build_goals` 는 per-goal 필드(`session_length_min`/`frequency_per_week`/`weekly_hours`/`deadline`/`preferred_time`/`approach_note`/`materials_note`)를 **`is_heaviest` 목표에만** 채운다 — 스키마(`schemas/interview.py:192-224`)엔 필드가 다 있는데 어댑터가 버린다.

### 3.2 결정 3층 — 축당 사용자 결정은 **정확히 1개**

| 층 | 누가 정하나 | 무엇을 | 결정 수 |
|---|---|---|---|
| 층1 | **사용자** | 축의 **모드**(deep/light/tick/paused) | 축당 1 → 최대 8 |
| 층2 | **LLM 제안 → 사용자 수정 가능** | 축별 빈도·세션 길이 | 0 (기본값 수용 가능) |
| 층3 | **룰** | 배치 시각·요일·순번 | 0 |

모드별 기본값(설계자 판단):

| 모드 | 기본 세션 길이 | 기본 주 세션 | 기본 빈도 |
|---|---|---|---|
| deep | `session_min_for(outcome)` 또는 60분 | 2 (하한, §6.1) | — |
| light | 30분 | 1~2 | — |
| tick | — | — | 주 3회 × 15분 |

### 3.3 Stage C — 축별 빈도·길이 LLM 제안 (신규 프롬프트 1개)

`prompts/planning/mandala_mode.v1.md` — 입력: 8축 제목 + `why_text` + 사용자 마감 칩 + 현실 가용 시간 요약. 출력: 축별 `{axisIndex, mode, sessionsPerWeek, sessionLengthMin, rationale}`. **HITL 3버튼 대상**(자동 적용 금지, AGENTS §1.4).

LLM 이 죽어도 **룰 분류기**(`mandala_mode_adapter.py`, §5.1)가 8축 전부에 모드를 준다.

### 3.4 tier 한도 경로 — 만다라는 한 칸도 쓰지 않는다

| 검사 | 위치 | 세는 대상 |
|---|---|---|
| `tier_violation_for` | `first_plan.py:252-268` | `outcome.core_goals` 의 `tentative_tier`(DB 아님) |
| `_enforce_tier_limit` | `goals.py:100-116` + `goal_repo.py:67-85` | DB goals 행 (proposed 제외) |

궁극목표는 `Goal(status="active", goal_tier="parked")`(전략서 §3.2) — `count_by_tier` 는 tier 별로 세므로 `parked` 는 애초에 계산 대상이 아니다. **만다라 축은 goals 행이 되지 않는다**(축 = `goal_nodes(tree_kind='mandala', depth=1)`). 따라서 §1 잠금 소비 = **0**.

⚠️ `materialize_goals`(`fpa:1612-1660`)는 `_enforce_tier_limit` 을 **거치지 않고** `g.goal_tier = _normalize_goal_tier(...)` 로 직접 쓴다(`:1644`). 승인 경로의 유일한 게이트는 `tier_violation_for` 다. 이 설계는 그 경로를 아예 타지 않는다(§7.5).

---

## §4. 데이터 모델 & 마이그레이션 — **MP2 는 마이그레이션 PR 이다**

### 4.1 왜 컬럼이 필요한가 (v1 의 가장 큰 오류 정정)

v1 은 "`_replaceable_action`/`supersede_previous_plan`/`_archive_goal_nodes` 에 `axis_node_id` 인자를 더한다"고 적고 마이그레이션 칸을 `—` 로 뒀다. **축을 식별할 저장소가 레포에 없다:**

- `db/models/goal_node.py` 전수(`:28-64`): `id / goal_id / parent_node_id / title / node_type / depth / order_index / is_leaf` — **`tree_kind` 도 축 포인터도 없다.** `grep -rn "tree_kind" src/ alembic/` = **0건**.
- `db/models/action_item.py:105-136` FK 5개(`goal_id`/`goal_node_id`/`habit_instance_id`/`habit_id`/`inbox_item_id`) — **축 없음.**
- `_replaceable_action`(`fpa:1361-1384`)은 `ActionItem` 만 보는 **순수 술어**다. 축 인자를 받아도 **판정할 필드가 없다.**
- `supersede_previous_plan`(`fpa:1476-1490`)은 SQL WHERE 로 좁히고 **파이썬 술어로 한 번 더 거른다** — docstring(`:1470-1473`)이 명시하듯 "WHERE 를 평가하지 않는 구조적 fake session(테스트)" 때문이다. **SQL 조인만으로 축을 좁히면 기존 테스트 하네스에서 규칙이 사라진다.**
- 계획 트리 노드는 축 노드의 **자손**이므로 축 소속 판정은 재귀 조상 추적이다. `_archive_goal_nodes`(`:1524-1527`)의 WHERE 는 `goal_id + archived_at IS NULL` 뿐.

**결론: 인메모리 필드 하나만 보면 되는 비정규화 컬럼이 정답이다.** 그래야 fake session 테스트도 그대로 산다.

### 4.2 마이그레이션 C (MP2) — `down_revision = "c2d3e4f5a6b7"` (전략서 마이그레이션 B 위)

```python
revision = "d3e4f5a6b7c8"; down_revision = "c2d3e4f5a6b7"

def upgrade() -> None:
    # 1) 축 포인터 — NULL = 레거시(축 없음). 기존 행 백필 불필요(전부 단일목표 계획).
    op.add_column("goal_nodes",
        sa.Column("axis_node_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_goal_nodes_axis_node_id", "goal_nodes", "goal_nodes",
                          ["axis_node_id"], ["id"], ondelete="SET NULL")
    op.add_column("action_items",
        sa.Column("axis_node_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_action_items_axis_node_id", "action_items", "goal_nodes",
                          ["axis_node_id"], ["id"], ondelete="SET NULL")

    # 2) tick 축 승격 링크 (전략서 promoted_goal_id 와 대칭 방향). 신규 enum 0.
    op.add_column("goal_nodes",
        sa.Column("promoted_habit_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_goal_nodes_promoted_habit_id", "goal_nodes", "habits",
                          ["promoted_habit_id"], ["id"], ondelete="SET NULL")

    # 3) 축 스코프 조회용 부분 인덱스 (승인·롤업이 매번 친다)
    op.create_index("ix_action_items_axis_node_id", "action_items", ["axis_node_id"],
                    postgresql_where=sa.text("axis_node_id IS NOT NULL"))
    op.create_index("ix_goal_nodes_axis_node_id", "goal_nodes", ["axis_node_id"],
                    postgresql_where=sa.text("axis_node_id IS NOT NULL"))

    # 4) 축 노드는 반드시 만다라 depth=1 이어야 한다 (오염 차단)
    op.create_check_constraint(
        "ck_goal_nodes_axis_self", "goal_nodes",
        "axis_node_id IS NULL OR axis_node_id <> id",
    )

def downgrade() -> None:
    # DELETE 문 0개 — 전부 nullable 로 추가했기 때문에 대칭이 성립한다 (AGENTS §2).
    for ix in ("ix_goal_nodes_axis_node_id", "ix_action_items_axis_node_id"):
        op.drop_index(ix)
    op.drop_constraint("ck_goal_nodes_axis_self", "goal_nodes", type_="check")
    op.drop_constraint("fk_goal_nodes_promoted_habit_id", "goal_nodes", type_="foreignkey")
    op.drop_constraint("fk_action_items_axis_node_id", "action_items", type_="foreignkey")
    op.drop_constraint("fk_goal_nodes_axis_node_id", "goal_nodes", type_="foreignkey")
    op.drop_column("goal_nodes", "promoted_habit_id")
    op.drop_column("action_items", "axis_node_id")
    op.drop_column("goal_nodes", "axis_node_id")
```

### 4.3 불변식 (테스트로 고정)

| # | 불변식 | 왜 |
|---|---|---|
| I1 | `axis_node_id` 가 있으면 그 노드는 `tree_kind='mandala' AND depth=1` | 축이 아닌 것을 축으로 못 쓰게 |
| I2 | `tree_kind='mandala'` 인 노드의 `axis_node_id` 는 NULL (만다라 트리 자체는 축 소속이 아니다) | 자기참조 루프 방지 |
| I3 | `axis_node_id IS NULL` = **레거시 단일목표 경로** — 모든 신규 인자의 기본값이 이 경로를 재현한다 | MP2 회귀 7개의 전제 |
| I4 | tick 축의 리프 셀만 `promoted_habit_id` 를 갖는다 | §11.2 갈래 3 |

---

## §5. 축 모드 분류 — 3층 폴백

### 5.1 층1: 룰 분류기 (`orchestrator/mandala_mode_adapter.py`, 순수 함수)

```
deadline 있음                      → deep 후보
"주 N회" / "매일" 어휘 + 15분 이하  → tick 후보
셀 제목에 수량 표현(N편·N문제·N강) → deep 후보
그 외                              → light
```
분류기는 **후보만** 낸다. 한도 적용은 `allocate`(§6.1).

### 5.2 층2: LLM 제안 (`agents/mandala_mode.py` → `aiClient.run(module="planning", prompt_id="planning/mandala_mode")`)

신규 도메인 **0** — `prompts/registry.py:30-41` `SUPPORTED_DOMAINS` 8종 잠금 준수. `fallback=` 에 층1 룰 분류기를 그대로 넘긴다.

### 5.3 층3: 축별 분해 — **N콜이지 1콜이 아니다**

| 축 | (a) 축당 1콜 | (b) 한 콜에 8축 |
|---|---|---|
| `goal_decompose.v1.md` 변경 | **0줄** | **전면 개작** (스칼라 `{{total_sessions}}`/`{{session_length}}`/`{{horizon_weeks}}` 에 105줄이 묶여 있다) |
| `_MAX_LLM_SESSIONS = 20` 벽 | 축당 ≤3세션이므로 여유 | **8축 × 3 = 24 > 20 → 타임아웃 → 룰 폴백 → `_rule_decomposition` 이 heaviest 트리 하나만 만든다 → 계획 전체가 자리표시자** |
| 부분 실패 | 그 축만 룰 회차 | **전체 실패** |
| 비용 | deep 축만 콜 → **최대 3콜**(light 는 0콜) | 1콜 |

**판정: (a).** 그리고 `light` 는 애초에 LLM 을 안 쓰므로 **콜 수는 deep 축 수(≤3)** 다 — v1 이 걱정한 "16콜 12분"은 이 모드 분화로 사라진다.

⚠️ 부분 실패를 사용자가 인지해야 이 선택의 이점이 산다 → §8.3 `axisSummary[].aiSource` + R1.

---

## §6. 배분 엔진 + 스케줄러 축 공정성

### 6.1 `orchestrator/mandala_allocate.py` — 순수 룰, LLM 0

**상수 (전부 설계자 판단, 문헌·실측 근거 없음):**

```python
_MANDALA_MODE_LIMITS   = {"deep": 3, "light": 5}   # tick·paused 무제한
_WEEKLY_SESSION_BUDGET = 16     # 주간 블록 세션 상한
_BUDGET_UTILIZATION    = 0.75   # 기본 배정 = 12세션 (§2.3)
_MIN_DEEP_SESSIONS_PER_WEEK = 2 # ★ 신설 하드 제약
_MAX_AXIS_SESSIONS     = 3
```

**`_MIN_DEEP_SESSIONS_PER_WEEK` 가 왜 하드 제약인가**(비평 6): 예산 12를 8축에 흩뿌리면 축당 1.5세션이 되어 "deep 은 LLM 분해, light 는 룰 회차"라는 구분이 **실행량에서 소멸한다.** 그러면 §11.5 가 경계한 "얕고 넓게"의 기본값 버전이 된다. 예산이 모자라면 **축 수를 줄이는 방향으로 해소한다**(light → paused), deep 을 깎지 않는다.

**단계:**

| 단계 | 하는 일 | 넘칠 때 |
|---|---|---|
| **0. 마감 하드 오버라이드** | 마감 ≤3주 축은 `deep` 강제 | 4번째부터 마감 이른 순 3개만 남기고 **나머지는 `light` 로 강등**(완전 실종 방지) + warning "다음 계획에서 먼저 담을게요" |
| 1. 사용자 고정 | M7 로 사용자가 명시한 모드 존중 | — |
| 2. 분류기 제안 | §5.1/5.2 | — |
| 3. 한도 적용 | deep ≤3 / light ≤5 | **422 `MANDALA_MODE_LIMIT_EXCEEDED`** (§8.4 — `GOAL_TIER_LIMIT_EXCEEDED` **재사용 금지**) |
| 4. 세션 배분 | deep: `[2, 3]`, light: `[1, 2]`, 합계 ≤ 12 | deep 하한(2)을 못 채우면 light 중 우선순위 최하를 `paused` 로 |
| **5. 풋프린트 검산** | `Σ(세션분) + 휴식 + tick 명목 ≤ 163 × 7` | 초과분만큼 light 세션 삭감 → 그래도 초과면 light → paused |
| 6. warnings | 강등·삭감·"선호 시간대는 계획 전체에 하나만 적용돼요"(R4) | — |

**반환**: `AxisAllocation(axis_node_id, axis_key, mode, sessions_per_week, session_min, chunk_min, footprint_min)` × 8 + `warnings`.

### 6.2 `PlanAction` 확장 (`plan_scheduler.py:50-61`) — 기본값이 종전 동작

```python
@dataclass(frozen=True, slots=True)
class PlanAction:
    id: uuid.UUID
    node_id: str
    title: str
    category: str
    estimated_minutes: int
    axis_key: str = ""          # ★ 신규. "" = 축 없음(레거시)
    chunk_min: int | None = None # ★ 신규. None = 전역 focus_chunk_min (C7 부분 해소)
```

`schedule_actions_multiday` 신규 인자 **전부 기본값 `None`**: `axis_daily_cap_min=None`, `max_sessions_per_day=None`, `habit_headroom_min=0`, `soft_overflow_min=None`.

> **`axis_key=""` + 신규 인자 `None` 이면 기존 배치 결과가 바이트 단위로 동일해야 한다.** MP4 의 머지 게이트다.

### 6.3 규칙 R1~R4

| # | 규칙 | 고치는 실측 결함 |
|---|---|---|
| **R1** | **축 내 stride** — `_target_day_index` 를 전역 인덱스가 아니라 **축 내 인덱스**로 계산 | "G축 주3회가 수요일 하루 3연속"(§1.3 실측) |
| **R2** | **축·일 상한** — `axis_used_by_day[(axis, day)]` 를 **별도 dict** 로 세고 `axis_daily_cap_min`(기본 = 2 × chunk_min) 초과 시 그 날 제외. ⚠️ **`used_by_day[day] > 0` 빈 날 예외를 상속하지 않는다** — 축·일 상한은 빈 날에도 무조건 검사한다 | `plan_scheduler.py:302` 의 빈 날 예외가 R2 를 무력화하는 것(비평 7). 이 예외를 그대로 두면 축 A 의 첫 세션이 어떤 날에도 무조건 들어가 F2/F3 가 "빈 날" 반례로 즉시 깨진다 |
| **R3** | **피크 순번 회전** — 하루의 피크 첫 슬롯을 `(day_ordinal + axis_rank) % n_axes` 로 회전 | "매일 18:00 을 앞 인덱스 축이 독점" |
| **R4** | **2차 패스 = 상한 무시 → `cap + SOFT_OVERFLOW_MIN`(30)** + 3차(그래도 실패)는 배치하지 않고 **warning** | `:328` `respect_cap=False` 로 마지막 축이 21:20 에 밀려 그날 240분이 되는 것 |

추가: `max_sessions_per_day`(기본 3), `habit_headroom_min` 을 `cap` 에서 **먼저 차감**한 뒤 R2 를 적용.

### 6.4 배치 테스트 F1~F7

| # | assert |
|---|---|
| F1 | 8축 12세션 투입 시 **모든 축이 ≥1 세션** 배치된다 |
| F2 | 같은 축의 세션 2개가 **같은 날에 오지 않는다**(`axis_daily_cap_min = 2×chunk` 이고 chunk=60 인 축은 예외적으로 허용, 그 외 금지) |
| F3 | 어느 날도 `used_by_day > cap + 30` 이 되지 않는다 |
| F4 | 피크 첫 슬롯을 7일 안에 **최소 3개 축이 나눠 갖는다**(R3) |
| F5 | 3차 실패는 배치 대신 warning 이고, warning 문구에 **축 이름이 들어간다** |
| F6 | `habit_headroom_min=17` 이면 실효 cap 이 163으로 내려간다 |
| **F7** | **빈 날에도 축·일 상한이 걸린다** — 축 A 세션 2개가 같은 **빈** 날에 못 들어간다 (비평 7 회귀) |
| F8 | `axis_key=""` + 신규 인자 `None` → **기존 `tests/test_plan_scheduler.py` 결과 동일** |

### 6.5 재계획(`/plans/replan`) 축 전파 — MP4 범위에 **포함한다**

v1 은 replan 을 아예 다루지 않았다. 그런데 `planning.py:955-1084` 재계획은 **goal 필터가 0**이고 미래 블록 전부를 후보로 재배치하며, `_replan_tuning_for`(`:842-864`)는 최근 outcome 하나에서 뽑은 `peak_windows`/`focus_chunk_min` 을 **전 축에 동일 적용**하고 `daily_focus_cap_min` 을 `DEFAULT_DAILY_FOCUS_CAP_MIN` 상수로 되돌린다. **다축 공정성이 1주 만에 리셋된다.**

**조치**: `ReplanCandidate`(`replan.py:49-56`) → `PlanAction`(`:101-110`) 까지 `axis_key`/`chunk_min` 전파(복구 소스는 `action_items.axis_node_id`, §4.2). `_replan_tuning_for` 를 **축별 튜닝 맵**으로 교체하고 `daily_focus_cap_min` 에 `habit_headroom_min` 을 반영.

> 이번 릴리스에서 못 하면 **R6 으로 명시**하고 MP4 테스트에 "replan 후 축 균형이 깨지는 것을 허용한다"를 적는다. 지금은 누락이라 아무도 모른다.

### 6.6 `habit_headroom_min` — tick 축을 시간으로 방어

```
habit_headroom_min = ceil( Σ_tick(frequency_per_week × minutes_per_session) / 7 )
```
§2.3 기준 = `ceil(115/7)` = **17분/일** → 실효 cap 163분.

이게 §13 Q6("주 56회까지 아무 게이트가 없다")의 실질 방어다. 하드 게이트를 새로 만들지 않는다 — 그 자체가 새 잠금이 된다.

---

## §7. 승인·영속화 — **이 설계의 실격 조건**

### 7.1 실격 조건

`_archive_goal_nodes`(`fpa:1515-1533`)의 WHERE 에 `tree_kind='plan'` 필터가 없으면, **계획 승인 한 번에 만다라 73칸이 전부 `archived_at` 처리된다.** 전략서 §3.4 W1 이 이미 이 봉합을 PR3 에 넣었다. **MP2 회귀 7개가 초록이 아니면 그 위의 모든 PR 머지 금지.**

### 7.2 마이그레이션 후의 술어 3개 (전부 인메모리 필드 하나만 본다)

```python
def _replaceable_action(
    action: ActionItem,
    goal_id: uuid.UUID,
    axis_node_id: uuid.UUID | None = None,   # ★ 기본 None = 종전 동작
) -> bool:
    base = (
        action.source == "goal"
        and action.status == "planned"
        and action.archived_at is None
        and action.goal_id == goal_id
    )
    if axis_node_id is None:
        # 레거시 경로: 축 개념 없음. 단, 만다라에서 승격된 카드는 보호(전략서 §3.4 W2).
        return base and action.axis_node_id is None
    return base and action.axis_node_id == axis_node_id


async def supersede_previous_plan(
    session, *, user_id, goal_id, axis_node_id: uuid.UUID | None = None
) -> int:
    stmt = select(ActionItem).where(
        ActionItem.user_id == user_id,
        ActionItem.goal_id == goal_id,
        ActionItem.source == "goal",
        ActionItem.status == "planned",
        ActionItem.archived_at.is_(None),
        # SQL 은 좁히기만 한다. 권위는 아래 파이썬 술어 — fake session 테스트 보존.
        *( [ActionItem.axis_node_id == axis_node_id] if axis_node_id is not None else [] ),
    ).with_for_update()
    rows = (await session.execute(stmt)).scalars().all()
    candidates = [a for a in rows if _replaceable_action(a, goal_id, axis_node_id)]
    ...


async def _archive_goal_nodes(
    session, *, goal_id, tree_kind: str = "plan", axis_node_id: uuid.UUID | None = None
) -> int:
    stmt = select(GoalNode).where(
        GoalNode.goal_id == goal_id,
        GoalNode.archived_at.is_(None),
        GoalNode.tree_kind == tree_kind,          # ★ 없으면 만다라 73칸이 날아간다
        *( [GoalNode.axis_node_id == axis_node_id] if axis_node_id is not None else [] ),
    )
    rows = (await session.execute(stmt)).scalars().all()
    stale = [
        n for n in rows
        if n.tree_kind == tree_kind
        and (axis_node_id is None or n.axis_node_id == axis_node_id)
        and n.archived_at is None
    ]   # 파이썬 술어 재확인 — SQL 을 평가하지 않는 테스트 하네스 대비
    ...
```

### 7.3 만다라 계획 draft payload

```jsonc
{
  "kind": "mandala_plan",
  "goal_id": "…",                       // 궁극목표 goals.id — 모든 축의 owner
  "time_policies": [                    // ★ 생성 시점 스냅샷 (비평 2-a)
    {"policy_type": "sleep", "payload": {"start_time": "23:00", "end_time": "08:00"}}
  ],
  "axes": [
    {
      "axis_node_id": "…", "axis_key": "ax0", "title": "체력",
      "mode": "deep", "ai_source": "llm",       // ★ 축별 (R1)
      "goal_nodes":  [ /* GoalNodeDraft, node_id 는 "ax0-tmp-…" 접두사 */ ],
      "action_items":[ /* ActionItemDraft */ ],
      "blocks":      [ /* ScheduledBlockPreview */ ]
    }
  ],
  "warnings": [], "policy_violations": [], "generated_at": "…"
}
```

- `payload["outcome"]` 이 **없다.** 그래서 `time_policies` 를 스냅샷으로 직접 싣는다 — `planning.py:738` 의 `time_policies_from_outcome(outcome)` 를 대체.
- `plan_drafts.target_date` 는 NOT NULL(`plan_draft.py:59`) → 계획 시작일로 채운다.

### 7.4 payload 를 읽는 **4경로 × kind 3종 동작표** (비평 4)

v1 은 approve 만 다뤘다. 나머지 3경로가 그대로 500 을 낸다.

| 경로 | 위치 | `first_plan` (kind 키 **없음**) | `replan` | `mandala_plan` |
|---|---|---|---|---|
| `GET /plans/{planId}` | `planning.py:593-609` | 200 재구성 | **404** (현행 `:602` 가드) | **200 전용 응답** `MandalaPlanResponse` (§8.3). 지금 가드는 `== "replan"` 뿐이라 **통과 → `payload["outcome"]` KeyError → 500** |
| `POST /plans/{planId}/discard` | `planning.py:611-` | 204 | 204 | 204 (payload 를 읽지 않음 — 상태 전이만) |
| `POST /plans/{planId}/approve` | `planning.py:671-802` | 기존 경로 | **404** (`:725`) | **축 루프 경로**(§7.5) |
| `POST /plans/replan/{planId}/approve` | `planning.py:1085-` | 404 (`:1111` allowlist) | 정상 | **404** |
| (부속) `_approved_response` | `planning.py:810-` | 카운트 응답 | — | 축별 카운트 포함 응답 |

**각 경로에 kind 가드 회귀 테스트 1개씩** — MP6 게이트.

### 7.5 `_apply_once` 축 루프 — 코드 스켈레톤 (비평 2)

현행 `_apply_once`(`fpa:1690-1841`)는 `materialize_goals(outcome.core_goals)` 로 goal 을 얻고 `heaviest is None` 이면 **`FirstPlanSaveResult(0,0,0,0)` 을 조용히 반환**(`:1735-1741`). 만다라 payload 를 그대로 넣으면 **에러도 없이 0건 저장된다.**

**라우터 분기 (`planning.py:711-800` 재시도 루프 안):**

```python
for _attempt in range(first_plan_adapter.MAX_SAVE_RETRIES):
    async with user_agent_lock(session, user.id, _LOCK_AGENT):
        draft = await _load_draft(draft_repo, user.id, plan_id)
        ... 만료 검사 ...
        payload = draft.payload
        kind = payload.get("kind", "first_plan")          # ★ §7.6
        if kind == "replan":
            raise ApiError(ErrorCode.PLAN_DRAFT_NOT_FOUND, ..., 404)
        if draft.status == "approved":
            return _approved_response(plan_id, payload)

        if kind == "mandala_plan":
            policies = [
                _RulePolicy(p["policy_type"], p["payload"])   # payload 스냅샷에서 복원
                for p in payload["time_policies"]
            ]
            result = await first_plan_adapter.db_apply_mandala_plan(
                session, user_id=user.id, payload=payload,
                time_policies=policies, on_success=_finalize,
            )
        else:
            outcome = InterviewOutcome.model_validate(payload["outcome"])   # 현행 :734
            ...
```

**어댑터 (`orchestrator/mandala_plan.py`):**

```python
async def db_apply_mandala_plan(
    session, *, user_id, payload, time_policies, on_success=None,
) -> MandalaSaveResult:
    """궁극목표 1개 아래 8축을 축 스코프로 영속화. goal 은 이미 존재한다(승격 없음)."""
    guard_plan = DraftPlan(...전 축 블록 합집합...)

    async with policy_guarded_transaction(session, guard_plan, time_policies):
        goal_id = uuid.UUID(payload["goal_id"])
        goal = await goal_repo.get_by_id(session, user_id=user_id, goal_id=goal_id)
        if goal is None:                     # 궁극목표가 사라졌으면 조용히 0건이 아니라 404
            raise MandalaGoalMissing(goal_id)

        per_axis: list[AxisSaveResult] = []
        for ax in payload["axes"]:
            axis_node_id = uuid.UUID(ax["axis_node_id"])
            # 1) 이 축의 이전 산출물만 교체 — 다른 축은 건드리지 않는다
            await supersede_previous_plan(
                session, user_id=user_id, goal_id=goal_id, axis_node_id=axis_node_id)
            await _archive_goal_nodes(
                session, goal_id=goal_id, tree_kind="plan", axis_node_id=axis_node_id)

            # 2) 노드/카드/블록 — 모두 axis_node_id 를 새겨서 저장
            nodes = _persist_nodes(session, ax["goal_nodes"],
                                   goal_id=goal_id, axis_node_id=axis_node_id)
            await session.flush()
            actions = _persist_actions(session, ax["action_items"], nodes,
                                       goal_id=goal_id, axis_node_id=axis_node_id)
            await session.flush()
            blocks = _persist_blocks(session, ax["blocks"], actions)
            per_axis.append(AxisSaveResult(axis_node_id, len(nodes), len(actions), len(blocks)))

        # 3) tick 축 — habits UPSERT (셀 → habit, category 손실 매핑은 §8.4)
        ticks = await _upsert_tick_habits(session, user_id=user_id, payload=payload)

        if on_success is not None:
            await on_success()     # Draft 승인 마킹·온보딩 전이 — 같은 commit
    return MandalaSaveResult(axes=per_axis, habits=ticks)
```

**재시도 안전성**: 축 루프 전체가 하나의 `policy_guarded_transaction` 안이므로 실패 시 전 축이 함께 롤백된다. **부분 저장은 없다.** `MAX_SAVE_RETRIES`(3) 루프는 라우터가 그대로 담당하고, 시도마다 lock 을 새로 잡는 현행 구조(`planning.py:711-713`)를 바꾸지 않는다.

**busy 제외**: generate 시 `_existing_busy_by_day(..., exclude_axis_node_ids=[...])` 로 **이 승인이 곧 교체할 축들 전부**를 제외한다(F4 정정 — `heaviest_goal_id` 는 만다라 경로에서 호출하지 않는다).

### 7.6 `kind` allowlist — 하위호환이 필수 (비평 3)

**First Plan payload 에는 `"kind"` 키가 없다.** `_build_payload`(`planning.py:225-243`) 전수: `outcome/goal_nodes/action_items/blocks/warnings/policy_violations/generated_at` 뿐. `"kind"` 는 replan 만 `:1039` 에서 넣는다.

```python
_APPROVABLE_KINDS = {"first_plan", "mandala_plan"}
kind = payload.get("kind", "first_plan")      # ★ 기본값 없으면 in-flight 72h 초안 전부 404
```

회귀 테스트 **`test_approve_legacy_payload_without_kind_key`** — MP6 게이트.

### 7.7 Idempotency — **이미 깨져 있는 것부터 고친다** (비평 10)

`api/middleware/idempotency.py:37` 패턴이 `^/replan/[^/]+/approve$` 인데 실제 경로는 **`/plans/replan/{id}/approve`** 다(`planning.py:105` `prefix="/plans"`, `:1085`; `main.py:119-146` 에 전역 prefix 없음). **매치되지 않는다.** `tests/test_idempotency.py:84,106-143` 은 합성 앱의 `/replan/...` 만 쳐서 이 구멍을 못 잡는다. `api-contract.md §1.7` 이 필수라고 적은 endpoint 에 미들웨어가 안 걸려 있다.

| 조치 | PR |
|---|---|
| 패턴을 `^/plans/replan/[^/]+/approve$` 로 수정 + **실제 앱 경로**로 테스트 | **MP0** |
| `POST /habit-instances/{id}/check` 를 필수 목록에 추가(더블탭 이중 카운트 방지) | MP0 |
| M2(모드 변경)·M5(축 승격)·M6(만다라 계획 승인) 등록 + `api-contract.md §1.7` 갱신 | 각 MP 체크리스트 |

### 7.8 MP2 회귀 테스트 7개 (**초록 아니면 머지 금지**)

| # | 테스트 | assert |
|---|---|---|
| 1 | `test_legacy_single_goal_path_unchanged` | 기존 `tests/test_first_plan_*.py` **무변경 통과** |
| 2 | `test_archive_does_not_touch_mandala` | 계획 승인 후 `tree_kind='mandala'` 73행 전부 `archived_at IS NULL` |
| 3 | `test_axis_scoped_supersede` | 축 A 재승인 → 축 B 카드 **전부 생존** |
| 4 | `test_axis_scoped_archive` | 축 A 재승인 → 축 B 의 `goal_nodes(plan)` 생존 |
| 5 | `test_fake_session_predicate_still_applies` | WHERE 를 평가하지 않는 fake session 에서도 축 규칙 유지 |
| 6 | `test_promoted_card_protected_from_legacy_supersede` | `axis_node_id IS NOT NULL` 카드가 레거시 supersede 에 안 쓸린다 |
| 7 | `test_migration_downgrade_has_no_delete` | `alembic downgrade -1` 후 행 수 불변 |

---

## §8. API 계약

### 8.1 신규 endpoint (M1~M11)

| # | Method | Path | 설명 | Idem-Key |
|---|---|---|---|---|
| M1 | POST | `/goals/{goalId}/mandala/allocate` | 8축 모드·세션 배분 **제안**(Draft) | — |
| M2 | PATCH | `/goals/{goalId}/mandala/axes/{axisId}/mode` | 축 모드 변경 (deep/light/tick/paused) | ✅ |
| M3 | POST | `/plans/mandala/generate` | 축별 분해 + **단일 배치 패스** → Draft | — |
| M4 | GET | `/plans/{planId}` | (기존, kind 분기) 만다라 계획 미리보기 | — |
| M5 | POST | `/goals/{goalId}/mandala/cells/{cellId}/promote-habit` | tick 셀 → habit 승격 | ✅ |
| M6 | POST | `/plans/{planId}/approve` | (기존, kind 분기) **한 번의 승인 = 8축** | ✅ |
| M7 | PATCH | `/goals/{goalId}/mandala/allocation` | 사용자 조정(§9.4 확정 게이트 대상) | ✅ |
| M8 | GET | `/goals/{goalId}/mandala/progress` | 3갈래 롤업(§11.2) | — |
| M9 | GET | `/today/agenda` | (기존, additive) 카드에 `axisId`/`axisTitle`/`axisColorKey` | — |
| M10 | GET | `/plans/weekly` | (기존, additive) `WeeklyBlock.axisId` | — |
| M11 | GET | `/reviews/habit-penalty` | (기존) 후보 **상한 3** | — |

### 8.2 개정해야 하는 기존 문장 2개

| 위치 | 현재 | 개정 |
|---|---|---|
| `api-contract.md:273` | "⚠️ **한 계획은 heaviest 목표 하나만 분해·배치한다**" | "First Plan 은 heaviest 하나. **만다라 계획(`/plans/mandala/generate`)은 8축을 한 패스에서 배치하고 한 번의 승인으로 영속화한다.** 두 경로의 교체 스코프는 각각 goal 단위 / 축(`axis_node_id`) 단위다" |
| `api-contract.md:276` | "승인 = 교체: 같은 `targetDate` 의 이전 AI 계획 산출물" | "승인 = 교체: **같은 goal(만다라는 같은 축)의** 이전 AI 계획 산출물. **날짜는 키가 아니다**(#222)" — **지금 이미 틀린 문장이므로 어느 안을 채택하든 고쳐야 한다** |

### 8.3 응답 확장 — `axisSummary[]` (additive)

```jsonc
"axisSummary": [
  { "axisId": "node_…", "title": "체력", "mode": "deep",
    "aiSource": "rule",                       // ★ 축별 — DraftMixin.ai_source 는 초안당 1개뿐
    "sessionsPerWeek": 2, "minutesPerWeek": 120,
    "notice": "기본 회차로 채웠어요 · 다시 만들기" }
]
```
`warnings` 에도 **축 이름을 명시**한다. FE 는 해당 셀에 배지를 띄운다(R1).

### 8.4 에러 코드 — **`GOAL_TIER_LIMIT_EXCEEDED` 재사용 금지** (비평 9)

그 코드의 메시지는 `goals.py:107-114` 에서 `f"{tier.capitalize()} 목표는 최대 {limit}개까지"` 로 생성된다. §13 Q1 이 두 한도를 **비합산**(독립 예산)으로 결정했는데, 같은 코드를 쓰면 그 결정과 정면 모순이고 FE 는 "Focus 를 비우면 풀린다"고 오독한다.

| 신규 코드 | 상황 | HTTP |
|---|---|---|
| `MANDALA_MODE_LIMIT_EXCEEDED` | deep 4번째 / light 6번째 승격 | 422 |
| `MANDALA_AXIS_NOT_FOUND` | 존재하지 않는 축 | 404 |

`docs/api-contract.md` **에러 코드표 갱신을 MP3 산출물에 포함.** habits 카테고리 손실 매핑(`project`·`career`→`self_dev`, `schedule`→`routine`)도 같은 PR.

---

## §9. 사용자 흐름과 [확정] 게이트

### 9.1~9.3 흐름

```
S31 만다라 뷰 → [이번 학기 굴리기] → M1 allocate (8축 모드 제안, Draft)
  → 사용자 조정 (M7, 축당 결정 1개)
  → [확정] ← §9.4 게이트
  → M3 generate (deep 축만 LLM ≤3콜 + 단일 배치 패스)
  → 미리보기 (축별 색·aiSource 배지)
  → [수락] M6 → 8축 동시 시작
```

### 9.4 [확정] 게이트 — 기본값 그대로는 확정 불가

| 조건 | 왜 |
|---|---|
| **최소 한 축의 모드나 세션 수를 조정**해야 확정 가능 | R2 — 제안 그대로 확정하면 8칸이 균등하게 얇아진다 |
| **`deep` 축이 주 2세션 미만이면 확정 불가** | 비평 6 — deep/light 구분이 실행량에서 소멸하는 것 방지 |
| 풋프린트 검산(§6.1 단계 5) 통과 | 실현 불가능한 캘린더 방지 |

---

## §10. 잠금 예산과의 관계

### 10.1 회고 파이프라인 배당

| 지표 | 본 설계(12세션) | 균질 8축(24세션) | 근거 |
|---|---|---|---|
| 주당 카드 | ≤12 | ≤24 | §2.3 |
| 하루 평균 미회고 카드 | 1.7장 | 3.4장 | 12/7 |
| **3일 누적(만료 직전)** | **5.1장 평균 / 최악 6장** | 10.3장 | `expire_reflections.py:48` `PENDING_WINDOW_DAYS=3` |
| 주당 실패(가정 30%) | 3.6건 | 7.2건 | ⚠️ **30% 는 시나리오 값, 실측 아님** |
| 회복 카드 결정 | 7~14장/주 | 14~29장/주 | 실패당 2~4장 |
| **tick 축 회복 카드** | **0장** | — | `execution_events.action_item_id` NOT NULL(`:53-55`) → 습관은 회복 경로 자체가 없다 |

**추가 상한**: 회복 제안 **하루 ≤2 / 축당 ≤1**(설계자 판단), habit-penalty 후보 **≤3**(M11).

### 10.2 알림 — 상향 제안 없음

- `PUSH_WEEKLY_BUDGET = 3`(`push_gate.py:45`), 3클래스 고정(`notification_send.py:29`), quiet 23~07(`:49-50`).
- 축당 푸시 = **3/8 = 주 0.375건.** 축 단위 알림은 원리적으로 불가능하다.
- **상향 제안 없음.** 근거 대장 **D4**(`recovery-evidence-base.md:90`)가 주 1회 > 1회성 > 주 2회를 보고하고, 같은 문서 §5.4 가 "문헌이 지지하는 상한은 1이지 2가 아니다"라고 못 박았다. 상향은 **문헌이 반대하는 방향**이다.
- **축 정보는 인앱 전용** — `GET /today/agenda`(M9) + S31 만다라 뷰. 알림 예산 소모 **0**.

### 10.3 모닝 브리프 — v1 의 "8슬롯 재활용"은 **코드로 반증된다**

`morning_brief.py:122-125` 를 실제로 읽으면 만다라 카드는 전부 `focus_cards` 로 떨어지고 `:136` 이 3개로 자른다. **`maintain` 5칸은 영구히 빈다.** 그러므로:

| 폐기 | 대체 |
|---|---|
| ~~"focus 3 + maintain 5 = 8슬롯을 축 라벨로 재활용"~~ | **`focus_cards` 를 축 라운드로빈으로 재정렬한 뒤 3장을 뽑는다(축당 최대 1장).** `:136` 의 `_titles(focus_cards, 3)` 앞에 정렬 함수 하나 |
| — | `big_rock`(`:150 focus_cards[0]`)이 **7일 안에 축을 순환**하도록 `(day_ordinal % n_active_axes)` 회전 |

**한계 명시**: 브리프는 3슬롯뿐이다. **8축 전체 상태는 인앱 뷰에서만 보인다.** 알림 3클래스·주 3건 잠금 아래에서 이건 우회할 수 없다.

### 10.4 건드리지 않는 잠금 상수 4종

`PENDING_WINDOW_DAYS = 3` / `PUSH_WEEKLY_BUDGET = 3` / draft TTL 72h(`planning.py:111`) / `PROPOSED_GOAL_TTL_DAYS = 14`(`expire_proposed_goals.py:39`).

---

## §11. 지표

### 11.1 원칙

- **성공 정의는 기존 것을 그대로 쓴다** — `weekly_review.py:30-32` `_TERMINAL_STATUSES`/`_SUCCESS_STATUSES`. 새 정의를 만들면 만다라 진척도와 주간 리포트가 서로 다른 숫자를 말한다.
- **축 단위 지표는 표본 `T_k ≥ 5` 일 때만 값을 낸다**(아니면 `null`). 12세션/8축 = 축당 1.5 → `resilience_rate` 축별 산출은 노이즈를 진단으로 제시하는 것이다.
- **저장 없이 먼저 출시한다**(§13 Q4). 지표는 파생이다.

### 11.2 3갈래 롤업 — **SQL** (비평 13)

v1 은 "tick 축의 `progress` 가 NULL 이 아니다"를 테스트로만 적고 규칙이 없었다. 그런데 `review_repo.collect_execution_stats`(`:88-118`)는 `execution_events ⋈ action_items` 이고 **tick 축은 action_item 을 만들지 않는다** → 전략서 §7.8 CTE 를 그대로 쓰면 tick 축은 **영구 NULL**, coverage 가 6/8 로 굳고 사용자 원 불만("1/8만 굴린다")이 축소 재발한다.

```sql
WITH leaf_session AS (          -- 갈래 1·2: deep/light 축의 리프 셀 = 카드 소진율
  SELECT n.id, n.parent_node_id,
         CASE WHEN n.completed_at IS NOT NULL THEN 1.0        -- ① 수동 체크 최우선
              WHEN COUNT(a.id) FILTER (WHERE a.status IN
                   ('done','partial_done','failed','over_done')) = 0 THEN NULL
              ELSE COUNT(a.id) FILTER (WHERE a.status IN ('done','over_done'))::numeric
                 / COUNT(a.id) FILTER (WHERE a.status IN
                   ('done','partial_done','failed','over_done')) END AS progress
    FROM goal_nodes n
    LEFT JOIN action_items a
           ON a.goal_node_id = n.id AND a.archived_at IS NULL
   WHERE n.goal_id = :goal_id AND n.tree_kind = 'mandala' AND n.depth = 2
     AND n.archived_at IS NULL AND n.promoted_habit_id IS NULL
   GROUP BY n.id, n.parent_node_id, n.completed_at
),
leaf_tick AS (                  -- 갈래 3: tick 셀 = habit_instances **최근 4주 이동평균**
  SELECT n.id, n.parent_node_id,
         CASE WHEN n.completed_at IS NOT NULL THEN 1.0
              WHEN COALESCE(SUM(hi.target_count), 0) = 0 THEN NULL
              ELSE LEAST(1.0, SUM(hi.done_count)::numeric / SUM(hi.target_count)) END AS progress
    FROM goal_nodes n
    JOIN habits h ON h.id = n.promoted_habit_id AND h.archived_at IS NULL
    LEFT JOIN habit_instances hi
           ON hi.habit_id = h.id
          AND hi.week_start >  (:week_start - INTERVAL '28 days')
          AND hi.week_start <=  :week_start
   WHERE n.goal_id = :goal_id AND n.tree_kind = 'mandala' AND n.depth = 2
     AND n.archived_at IS NULL
   GROUP BY n.id, n.parent_node_id, n.completed_at
),
leaf AS (SELECT * FROM leaf_session UNION ALL SELECT * FROM leaf_tick),
sub AS (
  SELECT s.id,
         COALESCE(SUM(l.progress), 0) / 8                              AS progress,
         SUM(l.progress) / NULLIF(COUNT(l.progress), 0)                AS progress_active,
         COUNT(l.progress)::numeric / 8                                AS coverage
    FROM goal_nodes s LEFT JOIN leaf l ON l.parent_node_id = s.id
   WHERE s.goal_id = :goal_id AND s.tree_kind = 'mandala' AND s.depth = 1
     AND s.archived_at IS NULL
   GROUP BY s.id
)
SELECT AVG(progress), AVG(progress_active), AVG(coverage), MIN(progress) FROM sub;
```

**4주 이동평균을 쓰는 이유(각주)**: `scheduler/habit_instances.py:94-98` 이 주 경계마다 카운트를 리셋하므로 주간값은 **월요일마다 0으로 요요친다.** 4주 창이 그 요요를 흡수한다. (4주 = 설계자 판단, `habit_penalty` 의 3주 창과 다른 값인 이유는 페널티는 *연속 미달 판정*이고 여기는 *수준 추정*이기 때문이다.)

**`progress_active`(분모 = 활성 칸)를 함께 내는 이유**: 분모 8 고정은 "한 축만 파고 있다"를 보이게 하려는 의도(전략서 §7.8)인데, 그것만 내면 3칸 승격한 tick 축이 영원히 37.5% 로 굳는다(§3.1 의 "영원히 12.5%" 의 축소판). **두 값을 반드시 병기한다.**

### 11.3 축 단위 성공률 — 마이그레이션 0

`review_repo.py:93` `select(ExecutionEvent, ActionItem.category)` 에 **`ActionItem.axis_node_id` 컬럼 하나 추가** → `weekly_review.ExecutionStat`(`:49-59`)에 `axis_id` 필드 → `_category_success`(`:217-223`)와 동형의 `_axis_success`. **DB 변경 불필요**(축 컬럼은 §4.2 에서 이미 들어간다).

### 11.4 실효 축 수 $N_{\mathrm{eff}}$

$S_k$ = 축 $k$ 의 성공 실행 수, $S_{\text{tot}} = \sum_j S_j$, $p_k = S_k/S_{\text{tot}}$ ($0\ln 0 \equiv 0$):

$$N_{\mathrm{eff}} = \exp\Bigl(-\sum_{k=1}^{8} p_k \ln p_k\Bigr), \qquad 1 \le N_{\mathrm{eff}} \le 8$$

"이번 주에 사실상 몇 축을 굴렸는가"를 그대로 읽는다. 화면에 `3.2 / 8` 로 노출 가능. **목표 범위 5.0~7.0** (설계자 판단).

### 11.5 ⚠️ 단일 KPI 로 합치지 말 것

$N_{\mathrm{eff}}$ 를 단독 대표 KPI 로 걸면 **"얕고 넓게"가 보상된다** — 8축에 1세션씩 흩뿌리면 8.0 이 나온다. 근거 대장 §7.1 이 `resilience_rate` 에서 진단한 결함("가장 쉬운 카드를 최적화하면 오른다")과 **완전히 같은 구조**다. **반드시 $(N_{\mathrm{eff}}, S_{\text{tot}})$ 병기.**

### 11.6 커버리지 — **두 값 병기** + dormant (비평 14)

`habit_instance.py:41-53` 에 시각·소요 컬럼이 없다. tick 축의 "분"은 `minutes_per_session × done_count` 라는 **명목값**이다. 명목값에 τ 를 적용하면 **5분짜리 체크 4회로 통과한다** — R5 가 경계한 상황을 커버리지가 못 잡는다.

| 지표 | 정의 | 분모 |
|---|---|---|
| `coverage_session` | 실행 분 ≥ **τ=20분/주** 인 **세션형** 축 수 | 세션형 축 수 (deep+light) |
| `coverage_wide` | 위 + **주 1회 이상 체크**된 tick 축 수 | **8 고정** |
| `dormant_axes` | $\lvert\{k : T_k^{(w)}=0 \wedge T_k^{(w-1)}=0\}\rvert$ | — |

> **tick 축의 분은 명목값이다.** 그래서 tick 축의 임계는 분이 아니라 **회수(주 1회 이상)** 로 따로 정의한다. τ=20분은 세션형에만 적용한다.

**`adherence` 옆에 `coverage_wide` 와 `dormant_axes` 를 반드시 병기한다** — adherence 가 오르는데 coverage 가 내려가면 과부하다(R5).

---

## §12. PR 계획

### 12.1 **MP ↔ 전략서 PR 의존 그래프** (비평 15-1)

두 문서의 PR 번호가 섞여 머지 순서를 재구성할 수 없었다. 이 표가 유일한 권위다.

| MP | 선행(필수) | 차단 사유 | 게이트 |
|---|---|---|---|
| **MP0** | 없음 | — | 4개 회귀(§7.7, §12.2) |
| **MP1** | 전략서 **PR1→PR2→PR3** | 만다라 트리(`tree_kind`, 73행)가 없으면 **축이라는 것 자체가 없다** | 전략서 PR3 테스트 |
| **MP2** | **전략서 PR3**(마이그레이션 B) | `axis_node_id` 는 `tree_kind` 위에 얹힌다. 순서가 뒤집히면 마이그레이션 C 가 참조할 컬럼이 없다 | **§7.8 회귀 7개** |
| **MP3** | MP2 | 축 스코프 안전장치 없이 다축 배분을 내면 안 된다 | 모드 한도 422, 룰 폴백 |
| **MP4** | MP2 | 배치가 `axis_key` 를 쓰려면 컬럼이 먼저 | F1~F8 (특히 **F8 바이트 동일성**) |
| **MP5** | MP3, MP4 | 분해·조립은 배분과 배치 위에 선다 | 축별 폴백 격리 |
| **MP6** | MP2, MP5, 전략서 **PR4**(kind allowlist) | 승인 다축화는 payload 계약이 확정된 뒤 | 4경로×kind 표 전부 |
| **MP7** | MP6, 전략서 **PR7** | 만다라가 오늘/브리프에 붙은 뒤 축 라벨을 얹는다 | 알림 예산 변화 0 |
| **MP8** | MP6 | 축 지표는 축 컬럼이 실데이터를 가진 뒤 | tick progress ≠ NULL |

**머지 순서**: `전략서 PR1→PR2→PR3` → **MP0(병렬 가능)** → **MP2** → (MP3 ∥ MP4) → MP5 → `전략서 PR4` → MP6 → (MP7 ∥ MP8).

### 12.2 PR 표

| PR | 무엇 | 파일 | 마이그레이션 | 계약 | 리스크 | 잠금 소비 | 검증 |
|---|---|---|---|---|---|---|---|
| **MP0** ★ | **선결 결함 4건** — 만다라와 무관하게 단독 가치 | `today.py:125-132`(habit `title=""` 하드코딩 → habits 조인) / `habits.py:135-165` `_validate_category` + goal→habit 손실 매핑 / `habit-instance check` 멱등 등록 / `idempotency.py:37` 패턴 `^/plans/replan/…` 수정 | — | §1.7 · §7 · §10 | 🟢 | 0 | `test_today_agenda_habit_title` / `test_habits_category_422`(현재는 DB enum **500**) / `test_habit_check_idempotent` / `test_idempotency_matches_real_replan_path` |
| **MP1** | 축 개념 도입 (읽기 전용) | `schemas/mandala.py` 확장 / `goal_repo.list_nodes(*, tree_kind)` | — | §6 | 🟢 | 0 | 만다라 뷰가 계획 트리와 섞이지 않는다 |
| **MP2** ★ | **승인 안전성 — 축 스코프 supersede/archive** | `_replaceable_action`(:1361) / `supersede_previous_plan`(:1442) / `_archive_goal_nodes`(:1515) 에 `axis_node_id` + `tree_kind` 인자. **기본값 `None`/`"plan"` = 종전 동작** | **필수 — 마이그레이션 C**(§4.2) | — | 🔴 **이 설계의 존재 조건** | 0 | §7.8 회귀 7개 전부 초록. 특히 `test_legacy_single_goal_path_unchanged` 가 **기존 `tests/test_first_plan_*.py` 무변경 통과**. 초록이 아니면 **머지 금지** |
| **MP3** | 배분 엔진 (modes + allocate) | `mandala_allocate.py` 신규(순수 룰) / `mandala_mode_adapter.py` / `agents/mandala_mode.py` / `prompts/planning/mandala_mode.v1.md` / `_MANDALA_MODE_LIMITS` / M1·M2·M7 | — | **§1.6(에러표)·§6.1·§8** | 🟡 룰 폴백이 핵심 | 신규만 | LLM 을 강제로 죽여도 8축 전부 `execMode` 를 갖는다. deep 4번째 → 422 **`MANDALA_MODE_LIMIT_EXCEEDED`**. 마감 축이 deep 강제. **deep 축 주 2세션 미만이면 [확정] 불가**(§9.4) |
| **MP4** | 스케줄러 축 공정성 **+ replan 전파** | `PlanAction.axis_key`/`chunk_min`(`:50-61`) / R1~R4 / `habit_headroom_min` / `axis_used_by_day` **별도 dict** / `replan.py` + `_replan_tuning_for` 축별 맵 | — | — | 🟡 기존 단일축 회귀가 게이트 | 0 | **F8 바이트 동일성** + F1~F7. replan 후에도 축 균형 유지 |
| **MP5** | 분해·조립 파이프라인 | `mandala_plan.py`(namespace/build_light/assemble) / `context_from_axis` / `plan_quality.v3` / M3 | — | §8 | 🟡 축별 폴백이 핵심 | 신규만 | deep 1축을 강제 폴백시켜도 나머지 축이 산다. temp id 충돌 **0**(축 접두사). `_MAX_LLM_SESSIONS` 초과 0 |
| **MP6** | 승인 다축화 + 계약 갱신 | `db_apply_mandala_plan`(§7.5) / `_existing_busy_by_day(exclude_axis_node_ids)` / **4경로 kind 분기**(§7.4) / tick habits UPSERT / **`api-contract.md:273` + `:276` 개정 + change-log** | — | **필수** | 🔴 계약 변경이 있는 유일한 PR | 신규 경로만 | 축 A 재승인 → 축 B 카드 전부 생존. 만다라 73행 `archived_at IS NULL`. `payload["outcome"]` **없이 승인 성공**. `test_approve_legacy_payload_without_kind_key` |
| **MP7** | FE 노출 + 알림 축 회전 | `AgendaCard`/`WeeklyBlock` additive / `morning_brief.py:136` **focus_cards 축 라운드로빈** + `:150` big_rock 회전 / M8~M11 / 회복 L2·L3 상한 / habit-penalty 상한 3 | — | §10·§14 | 🟢 알림 예산 소모 변화 **0** | additive | 오늘 화면에 축 색·라벨. big_rock 이 7일 안에 축 순환. 회복 제안 하루 ≤2. habit-penalty 후보 ≤3 |
| **MP8** | 지표 | §11.2 3갈래 CTE / `review_repo.py:93` 조인 / `ExecutionStat.axis_id` / `_axis_success` / coverage 2종 · $N_{\mathrm{eff}}$ · dormant / (합의 후) `period_summaries` 3컬럼 | (합의 후) | — | 🟡 저장은 §13 Q4 후 | additive | **tick 축 progress 가 NULL 이 아니다.** `coverage_wide=1.0` 이 세션형 τ=20분 + tick 주1회를 전부 만족할 때만. adherence 옆에 dormant 병기 |

### 12.3 각 PR 공통 로컬 검증 (AGENTS §3)

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run pytest -v
# MP2 는 추가로:
uv run pytest tests/ -v -k "axis or legacy or mandala"
uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head
# MP4 는 추가로 (기존 배치 결과 동일성):
uv run pytest tests/test_plan_scheduler.py tests/test_first_plan_schedule.py -v
# MP0 는 추가로 (실제 앱 경로로 미들웨어 매칭):
uv run pytest tests/test_idempotency.py -v
```

`main` 직접 push 금지(AGENTS §2). 브랜치 `feat/mandala-portfolio-*`. 각 PR 은 `docs/api-contract.md` 동반 갱신 여부를 체크리스트로 확인.

---

## §13. 사람에게 물어볼 것 (AGENTS §8)

| # | 안건 | 성격 | **내 추천** |
|---|---|---|---|
| **Q1** | **`_MANDALA_MODE_LIMITS`(deep 3 / light 5)를 `_TIER_LIMITS`(focus 3 / maintain 5)와 합산하는가?** 비합산이면 사용자는 실질적으로 최대 16개를 동시에 갖는다 | 잠금 **해석**(코드 우회 아님) | **비합산.** 진짜 병목은 개수가 아니라 하루 163분이고, `habit_headroom_min`(§6.6)과 `allocate` 의 풋프린트 검산(§6.1 단계 5)이 그걸 **시간으로** 막는다. 개수를 두 번 세면 시간 예산과 개수 예산이 서로 다른 답을 낸다. 그리고 만다라 사용자가 격자 밖 목표를 하나도 못 갖는 건 3개월 지속성의 직접 위협이다 |
| **Q2** | **"왜 Focus 가 3인가"를 문서화.** 레포 전체에 근거가 없다 — `AGENTS.md:28`·`goals.py:42`·`docs/decisions/0005-agentic-architecture-mvp.md:343` 셋 다 **레포에 존재하지 않는** "DevBaseline §1.4"를 재인용한다 | 문서 신설. 잠금 변경 아님 | **ADR 신설.** "3/5 는 심리학 상수가 아니라 **하루 180분 / 모닝브리프 3+5 슬롯**(`morning_brief.py:136-137`)이라는 자원 예산이다." 이 문서가 없으면 `_MANDALA_MODE_LIMITS` 3/5 도 근거 없는 복제가 된다 |
| **Q3** | **`api-contract.md:273` 개정 + `:276` 스테일 문장 수정** (코드는 #222 이후 goal 단위·날짜 무관인데 문서가 여전히 `targetDate` 를 키라고 적는다) + **§1.7 idempotency 경로표 수정** | 구현 결정 → 코드 PR 가능. 단 FE 계약 | **`:276` 과 §1.7 은 지금 이미 틀렸으므로 MP0/MP6 에서 무조건 고친다.** `:273` 은 MP6 에서 개정하고 FE 팀에 사전 공유 |
| **Q4** | **`period_summaries` 축 지표 3컬럼**(`axis_minutes` JSONB / `effective_axes` / `mandala_coverage`) | DB 마이그레이션 | **MP8 을 저장 없이 먼저 출시**하고, 4주 실데이터로 τ=20분·$N_{\mathrm{eff}}$ 목표범위를 검증한 뒤 컬럼을 추가한다. 지표는 파생이므로 저장 없이도 성립한다 |
| **Q5** | **`GoalStructuringOrchestrator` / `reserve_habit_sessions`**(`goal_structuring.py:416-611`) 처리 — 프로덕션 호출자 0개 | 죽은 코드 처리 | **삭제하지 말고 그대로 둔다.** 되살리려면 `scheduled_blocks.action_item_id` NOT NULL(`:51-56`) 때문에 "습관 인스턴스 → `source='habit'` action_item" 다리(`action_item.py:44-53,118-131`, 현재 생산자 0)를 배선해야 하고, 그건 tick 축을 회복·회고·KPI 흐름에 **의도적으로 편입**시키는 제품 결정이다 — §10.1 의 "회복 카드 0장" 배당을 그대로 반납한다 |
| **Q6** | **주간 습관 총량 상한.** 8습관 × 주7회 = **주 56회**까지 게이트가 없다(`habits.py:135-165`) | 새 제품 결정 | **차단이 아니라 고지.** `habit_headroom_min` 이 이미 상한을 시간으로 깎는다. 여기에 `allocate` warnings 로 "이번 주 체크가 N시간이에요"를 더한다. 하드 게이트는 도입하지 않는다 — 그 자체가 새 잠금이 된다 |
| **Q7** | ⚠️ **Dalton & Spiller (2012) 적대적 인용 검증.** "실행의도(if-then)는 목표가 하나일 때 효과가 있고 여러 개면 사라지거나 역전된다"가 참이면 `prompts/recovery/if_then_proposal.v3.md` 기반 회복 개입 전체가 흔들린다. `docs/research/recovery-evidence-base.md` 에 **목표 경쟁·목표 차폐 문헌이 한 건도 없다** | 근거 대장 §1 절차 | **다축 확대(MP3 이후)의 선행 조건으로 건다.** MP0~MP2(안전성)는 이 검증과 무관하게 진행 가능하다 — 그것들은 다축이 아니어도 순수 개선이다. 결과가 나쁘면 `deep` 상한을 3 → 2 로 낮추는 것이 첫 대응 |
| **Q8** | **replan 축 전파(§6.5)를 MP4 에 포함할 것인가, 다음 릴리스로 미룰 것인가** | 범위 결정 | **포함.** 미루면 다축 공정성이 **첫 계획 주만** 유지되고(R6), 사용자가 보는 건 "둘째 주부터 다시 축 1이 저녁을 독식"이다. 미룬다면 R6 을 릴리스 노트에 명시 |

---

## §14. 리스크

| # | 리스크 | 왜 생기나 (파일:줄) | 크기 | 완화 | 잔여 위험 |
|---|---|---|---|---|---|
| **R1** | **혼합 품질 계획을 사용자가 인지하지 못한다** | `DraftMixin.ai_source`(`schemas/planning.py:155-169`)는 **초안당 하나뿐**이다. deep 3축 중 1축이 룰 폴백(`_rule_decomposition`, `first_plan.py:165-215`)이어도 초안 전체가 `aiSource='llm'` 으로 보인다. 그 축 카드는 `"캡스톤 MVP 5회차"` 같은 자리표시자다 | 🔴 | `axisSummary[].aiSource`(§8.3) + `warnings` 에 축 이름 + FE 배지 | **FE 가 읽어야만 보인다.** 스키마로 완전히 못 푼다 — MP5 머지 전 FE 협의 필수 |
| **R2** | **기본값이 "얕고 넓게"다** | `interview_adapter.py:250-268` `_build_goals` 가 per-goal 필드 7종을 **`is_heaviest` 목표에만** 채운다. 축마다 물으려면 80문항 | 🔴 | ① Stage C LLM 제안(§3.3) ② **[확정] 게이트**(§9.4) ③ 결정 수를 축당 1개로 ④ **`_MIN_DEEP_SESSIONS_PER_WEEK=2` 하드 제약** | LLM 제안이 나쁘고 사용자가 대충 확정하면 8칸이 균등하게 얇아진다. τ 커버리지와 $N_{\mathrm{eff}}$ 5.0~7.0 이 **사후** 관측 장치일 뿐이다 |
| **R3** | **마감이 4개 이상 겹치는 주에 제품이 할 말이 없다** | `_MANDALA_MODE_LIMITS["deep"]=3`. 대학 중간고사 주의 정상 시나리오 | 🟡 | ① 넘친 축을 `light` 로 강등해 **최소한 캘린더에는 남긴다** ② warning 을 "다음 계획에서 먼저 담을게요" 약속 형태로 ③ M7 로 다른 축을 내려 자리를 비울 수 있다 | 근본 해결은 deep 상한 상향이고 그건 Q1 의 반대 방향이다. **"이번엔 셋만"이라고 정직하게 말하는 게 최선이다** |
| **R4** | **축별 선호 시간대를 반영하지 못한다** | `schedule_actions_multiday` 는 `peak_windows` 를 **호출당 하나**로 받고(`plan_scheduler.py:196`), `peak_windows_for_plan`(`fpa:1302`)이 heaviest 의 `preferred_time` 을 계획 전체에 적용. "체력은 아침, 캡스톤은 저녁"을 표현할 자리가 없다 | 🟡 | v1 범위에서 **제외.** R3 피크 순번 회전(§6.3)이 "같은 창 안에서의 공정성"만 해결. `allocate` warnings 로 고지 | 아침 운동 축이 저녁에 배치된다. `PlanAction.prefer_windows` 추가는 스케줄러 시그니처 변경(L) — **MP4 이후 별도 PR** |
| **R5** | **회고를 안 하는 사용자에게 지표가 거짓말을 한다** | `expire_reflections.py:19-23` 이 만료 시 `completion_status='in_progress'` 유지(옳은 결정) → `weekly_review.py:30` `_TERMINAL_STATUSES` 가 `in_progress` 제외 → **만료 카드가 adherence 의 분자·분모에서 동시에 사라져 비율이 올라간다.** 다축이 이 구멍을 넓힌다 | 🔴 | ① 12세션 상한이 3일 누적을 5.1장(최악 6장)으로 묶어 만료를 **예외로 남긴다**(균질 8축은 10.3장으로 상시화) ② `dormant_axes` + `coverage_wide` 를 **adherence 옆에 반드시 병기** ③ tick 축은 만료 경로 자체가 없다 | **관측은 개입이 아니다.** 8축을 굴리다 무너진 사용자가 "잘 하고 있어요" 리포트를 받는 경로를 **완전히 막는 장치는 이 설계에 없다.** 병기가 유일한 방어이고, 사람이 읽어야 작동한다 |
| **R6** | **(Q8 이 "미룸"으로 결정될 경우) 다축 공정성이 첫 계획 주만 유지된다** | `planning.py:955-1084` replan 은 goal 필터 0 + `_replan_tuning_for`(`:842-864`)가 전 축에 heaviest 튜닝 동일 적용 + `daily_focus_cap_min` 을 상수로 리셋. `ReplanCandidate`(`replan.py:49-56`)에 축 개념 0 | 🟡 | §6.5 를 MP4 에 포함하는 것이 정공법. 미룬다면 MP4 테스트에 **"replan 후 축 균형이 깨지는 것을 허용한다"를 명시적으로 적는다** | 둘째 주부터 축 1이 저녁을 독식한다. **지금은 누락이라 아무도 모른다는 게 진짜 위험이다** |
| **R7** | **두 문서의 머지 순서가 어긋나면 안전장치 없이 다축이 나간다** | MP2 의 마이그레이션 C 는 전략서 마이그레이션 B(`tree_kind`)에 종속된다(`down_revision = "c2d3e4f5a6b7"`). 순서가 뒤집히면 alembic 이 실패하거나(운 좋은 경우) `tree_kind` 없이 축만 들어간다(나쁜 경우) | 🟡 | **§12.1 의존 표를 두 PR 의 리뷰어 체크리스트에 동일하게 넣는다.** `down_revision` 이 물리적 게이트 역할을 한다 | 두 문서를 다른 사람이 진행하면 표를 안 볼 수 있다 |

---

## 부록 A. 인용 정직성 표기

- **레포 실측 근거 있음** (파일:줄 명시, 이 세션에서 직접 확인): §1 전수표, §2.1 상수(`fpa:61,67,73,76,335,348,1252,1255`), §4.1 컬럼 부재(`goal_node.py:28-64` / `action_item.py:105-136` 전수 + `grep tree_kind` 0건), §6 스케줄러 결함(`:302` 빈 날 예외 / `:320,328` 2차 패스 / `:196,197,238` 스칼라), §7 승인 코드 전부(`_archive_goal_nodes:1524-1527` 에 tree_kind 없음 / `_replaceable_action:1381-1384` / `supersede_previous_plan:1470-1473` fake session 주석 / `planning.py:734` outcome 강제 / `:1735-1741` 조용한 0건 반환 / `:602,725` denylist / `_build_payload:225-243` 에 kind 키 없음), §7.7 idempotency 경로 불일치(`idempotency.py:37` vs `planning.py:105,1085`, `main.py:119-146` 전역 prefix 없음), §10.3 `morning_brief.py:122-125,136-137,150`, §10.4 잠금 상수 4종.
- **반증한 통념 3개**: ① 모닝 브리프 8슬롯 재활용 — `parked` goal 카드가 전부 `focus_cards` 로 떨어져 maintain 5칸은 영구히 빈다. ② `reserve_habit_sessions` 로 습관 세션 예약 — 프로덕션 호출자 0개 + `scheduled_blocks.action_item_id` NOT NULL 로 저장 자체 불가. ③ `api-contract.md:276` 의 targetDate 교체 규칙 — 코드는 #222 이후 goal 단위·날짜 무관.
- **v1 에서 정정한 자기 오류 3건**: ① MP2 를 마이그레이션 없이 구현 가능하다고 적은 것(§4.1) ② 용량 비율의 분모 혼용(§2.4) ③ tick progress 롤업 규칙 없이 테스트만 적은 것(§11.2).
- **레포에 근거가 아예 없는 것**: **"왜 Focus 가 3인가"**. 유일한 구조적 흔적은 `morning_brief.py:136-137` 의 3+5 슬롯과 하루 180분이다. 본 설계의 `_MANDALA_MODE_LIMITS` 3/5 는 그 값을 **복제**한 것이지 독립 근거가 있는 게 아니다(§13 Q2).
- **설계자 판단 (문헌·실측 근거 없음)**: `_WEEKLY_SESSION_BUDGET=16`, `_BUDGET_UTILIZATION=0.75`, `_MIN_DEEP_SESSIONS_PER_WEEK=2`, `_MAX_AXIS_SESSIONS=3`, `axis_daily_cap` 배수 2, `max_sessions_per_day=3`, `SOFT_OVERFLOW_MIN=30`, τ=20분, tick 임계 주 1회, 4주 이동평균 창, 축 지표 최소 표본 5, 회복 제안 하루 2 / 축당 1, habit-penalty 후보 3, $N_{\mathrm{eff}}$ 목표 5.0~7.0.
- **시나리오 가정 (실측 아님)**: 실패율 30%, 현실 가용 32.5h/주(§2.1 B). §10.1 표가 의미를 가지려면 `execution_events` 실 로그로 재추정해야 한다.
- **근거 대장 인용**: `docs/research/recovery-evidence-base.md` — D4(`:90`, 알림 상향 반대), C2(`:75`, paused 프레이밍), A4(`:50`, 휴면 축 조기경보), §7.1(KPI 최적화 결함). **그 대장에 목표 경쟁·목표 차폐 문헌은 한 건도 없다** — 다목표 심리학 인용은 이 문서에 넣지 않았고, §13 Q7 로 검증 안건화했다.

---

## 부록 B. 주요 파일 (절대 경로)

```
/Users/imhyeongjun/Desktop/reaction/.claude/worktrees/mandala-map-ultimate-goal-2bdf25/
  AGENTS.md                                              (:17-31 §1 잠금, :28 3/5 한도)
  docs/ultimate-goal-mandalart-strategy.md                (§3.3 컬럼 6개, §3.4 오염차단 R1/W1~W3,
                                                           §3.5 마이그레이션 B, §3.6 kind allowlist,
                                                           §7.8 롤업 CTE, §10 PR1~PR8)
  docs/api-contract.md                                    (:220 tier 한도, :261 habits 드리프트,
                                                           :273 heaviest, :276 스테일 targetDate)
  docs/research/recovery-evidence-base.md                 (:50 A4, :75 C2, :90 D4, §7.1)
  src/reaction_backend/orchestrator/plan_scheduler.py     (:50-61 PlanAction, :102-149 _earliest_fit,
                                                           :152-160 _search_order, :190-202 시그니처,
                                                           :238 chunk, :268-273 평탄화, :279-284 stride,
                                                           :302 빈날 예외, :320/328 2차 패스)
  src/reaction_backend/orchestrator/first_plan.py         (:72 _UNPLACED_MARKER, :165-215 룰 폴백,
                                                           :252-268 tier 게이트, :380-423 busy,
                                                           :455 schedule_blocks, :519-535 제외,
                                                           :575-595 배치 호출)
  src/reaction_backend/orchestrator/first_plan_adapter.py (:61/67 density, :73 세션 50분, :76 주14,
                                                           :150-176 deferred notice, :211-248 세션길이,
                                                           :295-333 정규화, :335 4주, :348 20세션,
                                                           :407-442 shape, :483-562 extend,
                                                           :667-690 rate, :696-729 cap/committed,
                                                           :848-927 context, :1252-1330 상수·peak·chunk,
                                                           :1274-1290 plan_actions, :1361-1384 replaceable,
                                                           :1442-1513 supersede, :1515-1533 archive,
                                                           :1582-1610 heaviest_goal_id,
                                                           :1612-1660 materialize, :1690-1841 _apply_once)
  src/reaction_backend/orchestrator/replan.py             (:49-56 candidate, :101-110 PlanAction)
  src/reaction_backend/orchestrator/weekly_review.py      (:30-32 statuses, :49-59 stat, :103-119 ratio/streak)
  src/reaction_backend/orchestrator/habit_penalty.py      (:29-60 판정, 3주 연속 50% 미만)
  src/reaction_backend/orchestrator/goal_structuring.py   (:210 free, :416-611 죽은 경로, :501-527 guard)
  src/reaction_backend/orchestrator/_common.py            (:63-88 advisory lock 5s → 409)
  src/reaction_backend/api/routes/planning.py             (:105 prefix, :111 TTL, :225-243 _build_payload,
                                                           :274 _load_draft, :344 lock, :468-494 weekly,
                                                           :593-609 GET, :602 kind, :611 discard,
                                                           :671-802 approve, :711 재시도, :725 kind,
                                                           :732 멱등, :734 outcome 강제, :738 policies,
                                                           :810 _approved_response, :842-864 replan 튜닝,
                                                           :913 replan, :955-1084 generate_replan,
                                                           :1085/1111 replan approve)
  src/reaction_backend/api/routes/goals.py                (:42 _TIER_LIMITS, :90-96 _validate_category,
                                                           :100-116 _enforce_tier_limit, :215-229 첫 root)
  src/reaction_backend/api/routes/habits.py               (:135-165 개수·category 무검증, :218-232 check)
  src/reaction_backend/api/routes/today.py                (:125-132 title="" 하드코딩)
  src/reaction_backend/api/routes/review.py               (:180-227 habit-penalty 무상한)
  src/reaction_backend/api/middleware/idempotency.py      (:34-40 필수 목록, :37 경로 불일치 ★)
  src/reaction_backend/main.py                            (:119-146 전역 prefix 없음)
  src/reaction_backend/scheduler/morning_brief.py         (:122-125 focus/maintain 분기, :136-137 3+5,
                                                           :150 big_rock = focus_cards[0])
  src/reaction_backend/scheduler/expire_reflections.py    (:19-23 in_progress 유지, :48 3일)
  src/reaction_backend/scheduler/expire_proposed_goals.py (:39 TTL 14일)
  src/reaction_backend/scheduler/habit_instances.py       (:87-106 월요일 cron, :94-98 주 리셋)
  src/reaction_backend/safety/push_gate.py                (:45 PUSH_WEEKLY_BUDGET=3, :49-50 quiet)
  src/reaction_backend/repositories/goal_repo.py          (:43-56 list_nodes tree_kind 없음, :67-85 count_by_tier)
  src/reaction_backend/repositories/review_repo.py        (:88-118 collect_execution_stats)
  src/reaction_backend/repositories/habit_instance_repo.py(:32-45 주간 조회, :61-75 최근 3주)
  src/reaction_backend/schemas/planning.py                (:31-53 Draft, :100-127 Request, :155-169 Response)
  src/reaction_backend/schemas/interview.py               (:192-224 GoalCandidate per-goal)
  src/reaction_backend/schemas/habits.py                  (:26-34 필수 6개, :31 category: str ★)
  src/reaction_backend/db/models/goal.py                  (:37-48 category, :89 week_tier_key(미사용))
  src/reaction_backend/db/models/goal_node.py             (:28-64 전수 — tree_kind·축 포인터 없음 ★)
  src/reaction_backend/db/models/scheduled_block.py       (:51-56 action_item_id NOT NULL)
  src/reaction_backend/db/models/execution_event.py       (:53-55 action_item_id NOT NULL)
  src/reaction_backend/db/models/recovery_attempt.py      (:74 execution_event_id NOT NULL)
  src/reaction_backend/db/models/habit.py                 (:33-40 category 6종, :51-62 CHECK·FK)
  src/reaction_backend/db/models/habit_instance.py        (:41-53 시각 컬럼 없음 ★)
  src/reaction_backend/db/models/action_item.py           (:44-53 source, :105-136 FK 5개, 축 없음 ★)
  src/reaction_backend/db/models/notification_send.py     (:29 3클래스)
  src/reaction_backend/prompts/planning/goal_decompose.v1.md    (변경 0)
  src/reaction_backend/prompts/planning/plan_quality.v2.md      (→ v3)
  src/reaction_backend/prompts/registry.py                (:30-41 SUPPORTED_DOMAINS 8종 잠금)
  src/reaction_backend/config.py                          (:110 retries 3, :127 45s, :129 200k 토큰)
  tests/test_idempotency.py                               (:84,106-143 합성 경로만 침 ★)
```

---

## 부록 C. 한 장 요약

```
질문:  8축을 동시에 굴릴 수 있는가?
답:    예. 균질하면 불가능(128%), 분화하면 가능(56.7%).   ← 둘 다 §2.4 분모 ①

동시 = ① 어느 주에도 실행 분량이 임계 미만인 축이 없고
       ② 8축 세션이 단일 배치 패스에서 서로를 알면서 배치되고
       ③ 사용자가 한 번의 승인으로 받는다.
       └ 깨지면 실패로 간주. dormant_axes 가 매주 측정한다.

구조:  궁극목표 goal 1개 (parked · 잠금 한도 0 소비)
         └ goal_nodes 8축 (tree_kind='mandala', depth=1)
              ├ deep  ≤3  → goal_nodes(plan) + action_items + scheduled_blocks · LLM 1콜/축
              ├ light ≤5  → 위와 같되 LLM 0 (룰 회차)
              └ tick  자유 → habits + habit_instances · 블록 없음 · 회복 카드 0장

부하:  12 블록세션 · 순수 540분 · 풋프린트 600분 · tick 명목 115분   ← 전부 §2.3 표에서 유도
       총 715분 = 11.9h/주 = 7일 명목 상한의 56.7% (§2.4 ①)
       피크 슬롯 12/21 = 57.1% (§2.4 ⑥)
       하루 실효 상한 163분(tick 헤드룸 17분 차감) · 최대일 100분

잠금:  Focus 3 / Maintain 5 → 만다라가 **한 칸도 안 쓴다** (격자 밖 인생 몫)
       알림 주 3건 → **상향 제안 없음** (D4 가 반대 방향) · 브리프는 3슬롯뿐, 8축은 인앱만
       미회고 3일 → 3일 누적 평균 5.1장 / 최악 6장 (한 화면)

실격 조건: _archive_goal_nodes 의 tree_kind='plan' 필터 + axis_node_id 스코프.
           없으면 계획 승인 한 번에 만다라 73칸이 사라진다.
           → MP2(= 마이그레이션 C, 전략서 PR3 종속). 회귀 7개가 초록 아니면 머지 금지.

먼저 낼 것: MP0 (today.py title="" · habits category 500 · check 멱등
            · idempotency 가 /plans/replan/… 을 아예 매칭 못 하는 것)
            만다라와 무관하게 단독 가치. 미출시가 나쁜 설계보다 나쁘다.
```