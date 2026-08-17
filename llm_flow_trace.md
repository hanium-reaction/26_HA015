# First Plan — 시나리오별 LLM Input/Output Flow 추적

- 모델: `gemini-flash-lite-latest` · timeout: 8s · 키: `AIzaSyAJ...`
- 캡처 지점: `tool_executor.generate_structured` (provider 진입점) — 프롬프트 합성·톤 prefix·safety 필터까지 거친 **최종** 프롬프트
- INPUT = Gemini 로 실제 전송된 프롬프트 / OUTPUT = Gemini 가 돌려준 raw JSON

---

# 시나리오: 정보처리기사 실기 합격 (집중 학습형)

- 확인 포인트: 단일 focus 목표 + 60분 이내 leaf 규칙이 잘 지켜지는지
- 입력 목표: 정보처리기사 실기 합격(focus)
- 총 실행시간: 4.5s · used_fallback: `False` · LLM 호출 2회

## LLM Flow (2 calls)

### Call #1 — decompose_goal — PLANNING ②③ (목표 분해)
- schema: `GoalDecomposition` · status: **OK** · latency: 3.68s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 475/778

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Planning Agent 다. 톤: "Be on your side".

입력 목표:
- 제목: 정보처리기사 실기 합격
- why_now: 방학 안에 자격증 끝내고 2학기 취준 집중
- 마감 / 호라이즌: 2026-08-15
- behavioral_profile 요약: 회복 톤: 담백하게 / 휴식 제안 수용: True / 집중 지속: 50분 / 이번 주 컨디션: 보통
- time_policy 요약: 활동: 09:00~23:00 / 피크: 10:00, 11:00, 20:00 / 노터치: 1건
- freebusy (앞으로 7일): 

목표를 goal_node 트리 (root → branch → leaf) 와 leaf 별 action_item 목록으로 분해하라.

규칙:
- Focus 카드 최대 3, Maintain 최대 5 — 초과 금지.
- 각 leaf 는 60분 이내. 60분 초과면 더 잘게 나눠라.
- action_item 은 SMART (Specific, Measurable, Actionable). "공부하기" 금지.
- 정책 위반 (cap, no-meeting hours, fixed schedule 충돌) 시 해당 카드 제외 + 이유 기록.

응답 형식 (Structured Output / JSON):
{
  "goal_nodes": [
    {"node_id": "<temp_uuid>", "parent_id": null, "title": "...", "node_type": "root|branch|leaf", "order_index": 0, "is_leaf": false}
  ],
  "action_items": [
    {"node_id": "<temp_uuid>", "title": "...", "estimated_minutes": 30, "category": "study|...", "first_step": "..."}
  ],
  "policy_violations": [
    {"node_id": "<temp_uuid>", "reason": "<cap_exceeded|conflict|...>"}
  ]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "goalNodes": [
    {
      "nodeId": "root-001",
      "parentId": null,
      "title": "정보처리기사 실기 합격",
      "nodeType": "root",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "branch-001",
      "parentId": "root-001",
      "title": "프로그래밍 언어 활용 및 실무 개념 정리",
      "nodeType": "branch",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-001",
      "parentId": "branch-001",
      "title": "자바/파이썬 코드 분석 패턴 암기",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "leaf-002",
      "parentId": "branch-001",
      "title": "SQL 문법 및 쿼리 작성 실습",
      "nodeType": "leaf",
      "orderIndex": 1,
      "isLeaf": true
    },
    {
      "nodeId": "branch-002",
      "parentId": "root-001",
      "title": "기출문제 풀이 및 취약점 보완",
      "nodeType": "branch",
      "orderIndex": 1,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-003",
      "parentId": "branch-002",
      "title": "2025년 기출문제 1회분 풀이 및 오답노트",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    }
  ],
  "actionItems": [
    {
      "nodeId": "leaf-001",
      "title": "자바 상속 및 다형성 코드 5문항 분석",
      "estimatedMinutes": 50,
      "category": "study",
      "firstStep": "기출문제집에서 객체지향 관련 코드 문제 5개를 선정한다."
    },
    {
      "nodeId": "leaf-002",
      "title": "SQL JOIN 및 서브쿼리 문법 정리",
      "estimatedMinutes": 40,
      "category": "study",
      "firstStep": "기본 SQL 쿼리 문법 표를 옆에 두고 빈 종이에 JOIN 구문을 적어본다."
    },
    {
      "nodeId": "leaf-003",
      "title": "실기 기출문제 오답 분석 및 개념 노트 보완",
      "estimatedMinutes": 50,
      "category": "study",
      "firstStep": "틀린 문제의 개념이 포함된 페이지를 교재에서 찾아 표시한다."
    }
  ],
  "policyViolations": [
    {
      "nodeId": "violation-001",
      "reason": "단기 집중력을 위해 하루 학습 카드를 3개로 제한하는 Focus 정책에 따라 4번째 이후 항목 제외."
    }
  ]
}
```

### Call #2 — review_plan — REVIEWING ④ (계획 품질 검토)
- schema: `PlanReview` · status: **OK** · latency: 0.84s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 1068/16

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Plan Verifier 다. Planning Agent 가 만든 첫 주 계획을 독립적으로 검토해 통과 / 다듬기 제안을 결정한다. 톤: "Be on your side, not on your case".

검증 대상:
- goal_nodes: [{"node_id": "root-001", "parent_id": null, "title": "정보처리기사 실기 합격", "node_type": "root", "order_index": 0, "is_leaf": false}, {"node_id": "branch-001", "parent_id": "root-001", "title": "프로그래밍 언어 활용 및 실무 개념 정리", "node_type": "branch", "order_index": 0, "is_leaf": false}, {"node_id": "leaf-001", "parent_id": "branch-001", "title": "자바/파이썬 코드 분석 패턴 암기", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "leaf-002", "parent_id": "branch-001", "title": "SQL 문법 및 쿼리 작성 실습", "node_type": "leaf", "order_index": 1, "is_leaf": true}, {"node_id": "branch-002", "parent_id": "root-001", "title": "기출문제 풀이 및 취약점 보완", "node_type": "branch", "order_index": 1, "is_leaf": false}, {"node_id": "leaf-003", "parent_id": "branch-002", "title": "2025년 기출문제 1회분 풀이 및 오답노트", "node_type": "leaf", "order_index": 0, "is_leaf": true}]
- action_items: [{"node_id": "leaf-001", "title": "자바 상속 및 다형성 코드 5문항 분석", "estimated_minutes": 50, "category": "study", "first_step": "기출문제집에서 객체지향 관련 코드 문제 5개를 선정한다."}, {"node_id": "leaf-002", "title": "SQL JOIN 및 서브쿼리 문법 정리", "estimated_minutes": 40, "category": "study", "first_step": "기본 SQL 쿼리 문법 표를 옆에 두고 빈 종이에 JOIN 구문을 적어본다."}, {"node_id": "leaf-003", "title": "실기 기출문제 오답 분석 및 개념 노트 보완", "estimated_minutes": 50, "category": "study", "first_step": "틀린 문제의 개념이 포함된 페이지를 교재에서 찾아 표시한다."}]
- time_policy 요점: 활동: 09:00~23:00 / 피크: 10:00, 11:00, 20:00 / 노터치: 1건
- 충돌 검사 결과 (rule scheduler): violation-001: 단기 집중력을 위해 하루 학습 카드를 3개로 제한하는 Focus 정책에 따라 4번째 이후 항목 제외.

체크리스트:
1. Focus 카드 ≤ 3, Maintain 카드 ≤ 5 (DevBaseline §1.4).
2. 각 action_item 의 estimated_minutes ≤ 60 — 넘으면 더 잘게.
3. fixed_schedule 과 시간 충돌 없음.
4. no-meeting / no-touch hours 위반 없음.
5. 같은 leaf 에 중복 action_item 없음.
6. action_item 이 SMART 한가 — "공부하기" 같은 모호한 항목은 다듬기 제안.

규칙:
- 모두 통과면 `approved=true`, `feedback` 은 빈 배열.
- 하나라도 어긋나면 `approved=false`, `feedback[]` 에 **무엇을 어떻게 바꾸면 좋을지** 사용자 친화 문장으로 적는다 (rule id 가 아니라 사람이 읽을 제안).
- 사용자를 탓하거나 평가하지 말 것. 계획을 함께 다듬는 제안 톤만 쓴다.
- 금지어: "실패", "또", "안 됐", "못했", "왜 안". 대신 "이렇게 줄여보면", "이 시간으로 옮기면" 같은 제안형.

응답 형식 (Structured Output / JSON — schema `PlanReview`):
{
  "approved": <true|false>,
  "feedback": ["<다듬을 점 0~N, 친화적 제안 문장>"]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "approved": true,
  "feedback": []
}
```

## 파이프라인 최종 산출
- 분해 결과: goal_node 6개 / action_item 3개
- 룰 배치(scheduled_blocks): 3개 (LLM 미관여 — 분해 output 을 가용시간에 배치)
- 검토: approved=True

---

# 시나리오: 토익 900점 (마감 임박형)

- 확인 포인트: 짧은 horizon(3주) + rest_ok=False 일 때 분해 밀도
- 입력 목표: 토익 900점 달성(focus)
- 총 실행시간: 3.5s · used_fallback: `False` · LLM 호출 2회

## LLM Flow (2 calls)

### Call #1 — decompose_goal — PLANNING ②③ (목표 분해)
- schema: `GoalDecomposition` · status: **OK** · latency: 2.72s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 455/823

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Planning Agent 다. 톤: "Be on your side".

입력 목표:
- 제목: 토익 900점 달성
- why_now: 지원 마감 전 어학 점수 필요
- 마감 / 호라이즌: 2026-07-20
- behavioral_profile 요약: 회복 톤: 다정하게 / 휴식 제안 수용: False / 집중 지속: 40분 / 이번 주 컨디션: 높음
- time_policy 요약: 활동: 08:00~22:00 / 피크: 08:00, 09:00
- freebusy (앞으로 7일): 

목표를 goal_node 트리 (root → branch → leaf) 와 leaf 별 action_item 목록으로 분해하라.

규칙:
- Focus 카드 최대 3, Maintain 최대 5 — 초과 금지.
- 각 leaf 는 60분 이내. 60분 초과면 더 잘게 나눠라.
- action_item 은 SMART (Specific, Measurable, Actionable). "공부하기" 금지.
- 정책 위반 (cap, no-meeting hours, fixed schedule 충돌) 시 해당 카드 제외 + 이유 기록.

응답 형식 (Structured Output / JSON):
{
  "goal_nodes": [
    {"node_id": "<temp_uuid>", "parent_id": null, "title": "...", "node_type": "root|branch|leaf", "order_index": 0, "is_leaf": false}
  ],
  "action_items": [
    {"node_id": "<temp_uuid>", "title": "...", "estimated_minutes": 30, "category": "study|...", "first_step": "..."}
  ],
  "policy_violations": [
    {"node_id": "<temp_uuid>", "reason": "<cap_exceeded|conflict|...>"}
  ]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "goalNodes": [
    {
      "nodeId": "root_001",
      "parentId": null,
      "title": "토익 900점 달성",
      "nodeType": "root",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "branch_001",
      "parentId": "root_001",
      "title": "집중 훈련: LC 파트 1, 2 공략",
      "nodeType": "branch",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "leaf_001",
      "parentId": "branch_001",
      "title": "LC 파트 2 오답 노트 및 쉐도잉",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "branch_002",
      "parentId": "root_001",
      "title": "집중 훈련: RC 파트 5, 6 문법 정복",
      "nodeType": "branch",
      "orderIndex": 1,
      "isLeaf": false
    },
    {
      "nodeId": "leaf_002",
      "parentId": "branch_002",
      "title": "RC 파트 5 핵심 빈출 문법 20제 풀이",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "branch_003",
      "parentId": "root_001",
      "title": "실전 모의고사 적응 훈련",
      "nodeType": "branch",
      "orderIndex": 2,
      "isLeaf": false
    },
    {
      "nodeId": "leaf_003",
      "parentId": "branch_003",
      "title": "실전 모의고사 1회 LC 파트 전체 풀이",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    }
  ],
  "actionItems": [
    {
      "nodeId": "leaf_001",
      "title": "파트 2 오답 문장 5개 골라 쉐도잉 3회 반복하기",
      "estimatedMinutes": 40,
      "category": "study",
      "firstStep": "교재에서 틀린 파트 2 문제 5개 선정하기"
    },
    {
      "nodeId": "leaf_002",
      "title": "RC 파트 5 문법 문제 20제 풀고 정답 근거 작성하기",
      "estimatedMinutes": 40,
      "category": "study",
      "firstStep": "빈출 문법 문제집에서 20문항 펼치기"
    },
    {
      "nodeId": "leaf_003",
      "title": "모의고사 LC 파트 100문제 타이머 맞춰 풀기",
      "estimatedMinutes": 45,
      "category": "study",
      "firstStep": "타이머를 45분으로 설정하고 문제지 1페이지 펴기"
    }
  ],
  "policyViolations": []
}
```

### Call #2 — review_plan — REVIEWING ④ (계획 품질 검토)
- schema: `PlanReview` · status: **OK** · latency: 0.80s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 1112/16

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Plan Verifier 다. Planning Agent 가 만든 첫 주 계획을 독립적으로 검토해 통과 / 다듬기 제안을 결정한다. 톤: "Be on your side, not on your case".

검증 대상:
- goal_nodes: [{"node_id": "root_001", "parent_id": null, "title": "토익 900점 달성", "node_type": "root", "order_index": 0, "is_leaf": false}, {"node_id": "branch_001", "parent_id": "root_001", "title": "집중 훈련: LC 파트 1, 2 공략", "node_type": "branch", "order_index": 0, "is_leaf": false}, {"node_id": "leaf_001", "parent_id": "branch_001", "title": "LC 파트 2 오답 노트 및 쉐도잉", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "branch_002", "parent_id": "root_001", "title": "집중 훈련: RC 파트 5, 6 문법 정복", "node_type": "branch", "order_index": 1, "is_leaf": false}, {"node_id": "leaf_002", "parent_id": "branch_002", "title": "RC 파트 5 핵심 빈출 문법 20제 풀이", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "branch_003", "parent_id": "root_001", "title": "실전 모의고사 적응 훈련", "node_type": "branch", "order_index": 2, "is_leaf": false}, {"node_id": "leaf_003", "parent_id": "branch_003", "title": "실전 모의고사 1회 LC 파트 전체 풀이", "node_type": "leaf", "order_index": 0, "is_leaf": true}]
- action_items: [{"node_id": "leaf_001", "title": "파트 2 오답 문장 5개 골라 쉐도잉 3회 반복하기", "estimated_minutes": 40, "category": "study", "first_step": "교재에서 틀린 파트 2 문제 5개 선정하기"}, {"node_id": "leaf_002", "title": "RC 파트 5 문법 문제 20제 풀고 정답 근거 작성하기", "estimated_minutes": 40, "category": "study", "first_step": "빈출 문법 문제집에서 20문항 펼치기"}, {"node_id": "leaf_003", "title": "모의고사 LC 파트 100문제 타이머 맞춰 풀기", "estimated_minutes": 45, "category": "study", "first_step": "타이머를 45분으로 설정하고 문제지 1페이지 펴기"}]
- time_policy 요점: 활동: 08:00~22:00 / 피크: 08:00, 09:00
- 충돌 검사 결과 (rule scheduler): 충돌 없음

체크리스트:
1. Focus 카드 ≤ 3, Maintain 카드 ≤ 5 (DevBaseline §1.4).
2. 각 action_item 의 estimated_minutes ≤ 60 — 넘으면 더 잘게.
3. fixed_schedule 과 시간 충돌 없음.
4. no-meeting / no-touch hours 위반 없음.
5. 같은 leaf 에 중복 action_item 없음.
6. action_item 이 SMART 한가 — "공부하기" 같은 모호한 항목은 다듬기 제안.

규칙:
- 모두 통과면 `approved=true`, `feedback` 은 빈 배열.
- 하나라도 어긋나면 `approved=false`, `feedback[]` 에 **무엇을 어떻게 바꾸면 좋을지** 사용자 친화 문장으로 적는다 (rule id 가 아니라 사람이 읽을 제안).
- 사용자를 탓하거나 평가하지 말 것. 계획을 함께 다듬는 제안 톤만 쓴다.
- 금지어: "실패", "또", "안 됐", "못했", "왜 안". 대신 "이렇게 줄여보면", "이 시간으로 옮기면" 같은 제안형.

응답 형식 (Structured Output / JSON — schema `PlanReview`):
{
  "approved": <true|false>,
  "feedback": ["<다듬을 점 0~N, 친화적 제안 문장>"]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "approved": true,
  "feedback": []
}
```

## 파이프라인 최종 산출
- 분해 결과: goal_node 7개 / action_item 3개
- 룰 배치(scheduled_blocks): 3개 (LLM 미관여 — 분해 output 을 가용시간에 배치)
- 검토: approved=True

---

# 시나리오: 체중 5kg 감량 + 러닝 습관 (유지형)

- 확인 포인트: 근무시간 no_touch 가 룰 배치에서 제외되는지 + maintain 2개
- 입력 목표: 3개월 안에 체중 5kg 감량(maintain) / 주 3회 러닝 루틴 정착(maintain)
- 총 실행시간: 6.6s · used_fallback: `False` · LLM 호출 4회

## LLM Flow (4 calls)

### Call #1 — decompose_goal — PLANNING ②③ (목표 분해)
- schema: `GoalDecomposition` · status: **OK** · latency: 2.41s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 455/601

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Planning Agent 다. 톤: "Be on your side".

입력 목표:
- 제목: 3개월 안에 체중 5kg 감량
- why_now: 건강검진 경고 받음
- 마감 / 호라이즌: 2026-09-30
- behavioral_profile 요약: 회복 톤: 단호하게 / 휴식 제안 수용: True / 이번 주 컨디션: 낮음
- time_policy 요약: 활동: 06:00~23:30 / 피크: 06:00, 21:00 / 노터치: 1건
- freebusy (앞으로 7일): 

목표를 goal_node 트리 (root → branch → leaf) 와 leaf 별 action_item 목록으로 분해하라.

규칙:
- Focus 카드 최대 3, Maintain 최대 5 — 초과 금지.
- 각 leaf 는 60분 이내. 60분 초과면 더 잘게 나눠라.
- action_item 은 SMART (Specific, Measurable, Actionable). "공부하기" 금지.
- 정책 위반 (cap, no-meeting hours, fixed schedule 충돌) 시 해당 카드 제외 + 이유 기록.

응답 형식 (Structured Output / JSON):
{
  "goal_nodes": [
    {"node_id": "<temp_uuid>", "parent_id": null, "title": "...", "node_type": "root|branch|leaf", "order_index": 0, "is_leaf": false}
  ],
  "action_items": [
    {"node_id": "<temp_uuid>", "title": "...", "estimated_minutes": 30, "category": "study|...", "first_step": "..."}
  ],
  "policy_violations": [
    {"node_id": "<temp_uuid>", "reason": "<cap_exceeded|conflict|...>"}
  ]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "goalNodes": [
    {
      "nodeId": "root-001",
      "parentId": null,
      "title": "3개월 안에 체중 5kg 감량",
      "nodeType": "root",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "branch-001",
      "parentId": "root-001",
      "title": "식단 개선 및 영양 조절",
      "nodeType": "branch",
      "orderIndex": 1,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-001",
      "parentId": "branch-001",
      "title": "오늘의 건강한 첫 식단 계획하기",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "branch-002",
      "parentId": "root-001",
      "title": "저강도 규칙적 활동 도입",
      "nodeType": "branch",
      "orderIndex": 2,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-002",
      "parentId": "branch-002",
      "title": "가벼운 저녁 스트레칭 루틴 수행",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    }
  ],
  "actionItems": [
    {
      "nodeId": "leaf-001",
      "title": "하루 식단 기록 및 탄단지 비율 확인",
      "estimatedMinutes": 20,
      "category": "health",
      "firstStep": "메모장에 오늘 먹은 음식 목록을 적고 영양성분 앱으로 검색한다"
    },
    {
      "nodeId": "leaf-002",
      "title": "21:00 피크타임 15분 스트레칭",
      "estimatedMinutes": 15,
      "category": "health",
      "firstStep": "유튜브에서 15분짜리 전신 스트레칭 영상을 검색하여 틀어놓는다"
    }
  ],
  "policyViolations": [
    {
      "nodeId": "extra-branch-003",
      "reason": "cap_exceeded (Focus 카드 최대 3개 정책 준수)"
    }
  ]
}
```

### Call #2 — review_plan — REVIEWING ④ (계획 품질 검토)
- schema: `PlanReview` · status: **OK** · latency: 1.22s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 909/131

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Plan Verifier 다. Planning Agent 가 만든 첫 주 계획을 독립적으로 검토해 통과 / 다듬기 제안을 결정한다. 톤: "Be on your side, not on your case".

검증 대상:
- goal_nodes: [{"node_id": "root-001", "parent_id": null, "title": "3개월 안에 체중 5kg 감량", "node_type": "root", "order_index": 0, "is_leaf": false}, {"node_id": "branch-001", "parent_id": "root-001", "title": "식단 개선 및 영양 조절", "node_type": "branch", "order_index": 1, "is_leaf": false}, {"node_id": "leaf-001", "parent_id": "branch-001", "title": "오늘의 건강한 첫 식단 계획하기", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "branch-002", "parent_id": "root-001", "title": "저강도 규칙적 활동 도입", "node_type": "branch", "order_index": 2, "is_leaf": false}, {"node_id": "leaf-002", "parent_id": "branch-002", "title": "가벼운 저녁 스트레칭 루틴 수행", "node_type": "leaf", "order_index": 0, "is_leaf": true}]
- action_items: [{"node_id": "leaf-001", "title": "하루 식단 기록 및 탄단지 비율 확인", "estimated_minutes": 20, "category": "health", "first_step": "메모장에 오늘 먹은 음식 목록을 적고 영양성분 앱으로 검색한다"}, {"node_id": "leaf-002", "title": "21:00 피크타임 15분 스트레칭", "estimated_minutes": 15, "category": "health", "first_step": "유튜브에서 15분짜리 전신 스트레칭 영상을 검색하여 틀어놓는다"}]
- time_policy 요점: 활동: 06:00~23:30 / 피크: 06:00, 21:00 / 노터치: 1건
- 충돌 검사 결과 (rule scheduler): extra-branch-003: cap_exceeded (Focus 카드 최대 3개 정책 준수)

체크리스트:
1. Focus 카드 ≤ 3, Maintain 카드 ≤ 5 (DevBaseline §1.4).
2. 각 action_item 의 estimated_minutes ≤ 60 — 넘으면 더 잘게.
3. fixed_schedule 과 시간 충돌 없음.
4. no-meeting / no-touch hours 위반 없음.
5. 같은 leaf 에 중복 action_item 없음.
6. action_item 이 SMART 한가 — "공부하기" 같은 모호한 항목은 다듬기 제안.

규칙:
- 모두 통과면 `approved=true`, `feedback` 은 빈 배열.
- 하나라도 어긋나면 `approved=false`, `feedback[]` 에 **무엇을 어떻게 바꾸면 좋을지** 사용자 친화 문장으로 적는다 (rule id 가 아니라 사람이 읽을 제안).
- 사용자를 탓하거나 평가하지 말 것. 계획을 함께 다듬는 제안 톤만 쓴다.
- 금지어: "실패", "또", "안 됐", "못했", "왜 안". 대신 "이렇게 줄여보면", "이 시간으로 옮기면" 같은 제안형.

응답 형식 (Structured Output / JSON — schema `PlanReview`):
{
  "approved": <true|false>,
  "feedback": ["<다듬을 점 0~N, 친화적 제안 문장>"]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "approved": false,
  "feedback": [
    "현재 Focus 카드 개수가 정책상 허용된 최대치(3개)를 초과하여 시스템 설정이 반영되지 않았습니다. 가장 중요한 항목 3개를 선별하여 계획을 다시 구성해 보는 것은 어떨까요?",
    "제시해주신 Action Item들은 매우 구체적이고 실행 가능해 보입니다. 다만, 혹시나 계획이 부담으로 느껴질 경우를 대비해 첫 주는 한두 가지 활동에만 집중하여 가벼운 성공 경험을 쌓아보는 방향을 제안합니다."
  ]
}
```

### Call #3 — decompose_goal — PLANNING ②③ (목표 분해)
- schema: `GoalDecomposition` · status: **OK** · latency: 2.20s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 455/643

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Planning Agent 다. 톤: "Be on your side".

입력 목표:
- 제목: 3개월 안에 체중 5kg 감량
- why_now: 건강검진 경고 받음
- 마감 / 호라이즌: 2026-09-30
- behavioral_profile 요약: 회복 톤: 단호하게 / 휴식 제안 수용: True / 이번 주 컨디션: 낮음
- time_policy 요약: 활동: 06:00~23:30 / 피크: 06:00, 21:00 / 노터치: 1건
- freebusy (앞으로 7일): 

목표를 goal_node 트리 (root → branch → leaf) 와 leaf 별 action_item 목록으로 분해하라.

규칙:
- Focus 카드 최대 3, Maintain 최대 5 — 초과 금지.
- 각 leaf 는 60분 이내. 60분 초과면 더 잘게 나눠라.
- action_item 은 SMART (Specific, Measurable, Actionable). "공부하기" 금지.
- 정책 위반 (cap, no-meeting hours, fixed schedule 충돌) 시 해당 카드 제외 + 이유 기록.

응답 형식 (Structured Output / JSON):
{
  "goal_nodes": [
    {"node_id": "<temp_uuid>", "parent_id": null, "title": "...", "node_type": "root|branch|leaf", "order_index": 0, "is_leaf": false}
  ],
  "action_items": [
    {"node_id": "<temp_uuid>", "title": "...", "estimated_minutes": 30, "category": "study|...", "first_step": "..."}
  ],
  "policy_violations": [
    {"node_id": "<temp_uuid>", "reason": "<cap_exceeded|conflict|...>"}
  ]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "goalNodes": [
    {
      "nodeId": "root-weight-loss-001",
      "parentId": null,
      "title": "3개월 안에 체중 5kg 감량",
      "nodeType": "root",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "branch-nutrition-001",
      "parentId": "root-weight-loss-001",
      "title": "식단 개선을 통한 칼로리 관리",
      "nodeType": "branch",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-meal-prep-001",
      "parentId": "branch-nutrition-001",
      "title": "이번 주 일주일치 건강 도시락 메뉴 5개 구성하기",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "branch-activity-001",
      "parentId": "root-weight-loss-001",
      "title": "저강도 신체 활동 습관화",
      "nodeType": "branch",
      "orderIndex": 1,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-walk-001",
      "parentId": "branch-activity-001",
      "title": "오전 06:00 20분 가벼운 산책 시작하기",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    }
  ],
  "actionItems": [
    {
      "nodeId": "leaf-meal-prep-001",
      "title": "냉장고 재료를 확인하여 5일치 점심 도시락 식단표 작성",
      "estimatedMinutes": 30,
      "category": "Health",
      "firstStep": "냉장고 문을 열고 사진 한 장 찍기"
    },
    {
      "nodeId": "leaf-walk-001",
      "title": "아파트 단지 내 20분 산책로 코스 확정",
      "estimatedMinutes": 15,
      "category": "Exercise",
      "firstStep": "운동화 현관 앞에 미리 꺼내두기"
    }
  ],
  "policyViolations": [
    {
      "nodeId": "violation-gym-001",
      "reason": "현재 컨디션 낮음으로 인해 고강도 운동 계획 제외"
    }
  ]
}
```

### Call #4 — review_plan — REVIEWING ④ (계획 품질 검토)
- schema: `PlanReview` · status: **OK** · latency: 0.80s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 948/16

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Plan Verifier 다. Planning Agent 가 만든 첫 주 계획을 독립적으로 검토해 통과 / 다듬기 제안을 결정한다. 톤: "Be on your side, not on your case".

검증 대상:
- goal_nodes: [{"node_id": "root-weight-loss-001", "parent_id": null, "title": "3개월 안에 체중 5kg 감량", "node_type": "root", "order_index": 0, "is_leaf": false}, {"node_id": "branch-nutrition-001", "parent_id": "root-weight-loss-001", "title": "식단 개선을 통한 칼로리 관리", "node_type": "branch", "order_index": 0, "is_leaf": false}, {"node_id": "leaf-meal-prep-001", "parent_id": "branch-nutrition-001", "title": "이번 주 일주일치 건강 도시락 메뉴 5개 구성하기", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "branch-activity-001", "parent_id": "root-weight-loss-001", "title": "저강도 신체 활동 습관화", "node_type": "branch", "order_index": 1, "is_leaf": false}, {"node_id": "leaf-walk-001", "parent_id": "branch-activity-001", "title": "오전 06:00 20분 가벼운 산책 시작하기", "node_type": "leaf", "order_index": 0, "is_leaf": true}]
- action_items: [{"node_id": "leaf-meal-prep-001", "title": "냉장고 재료를 확인하여 5일치 점심 도시락 식단표 작성", "estimated_minutes": 30, "category": "Health", "first_step": "냉장고 문을 열고 사진 한 장 찍기"}, {"node_id": "leaf-walk-001", "title": "아파트 단지 내 20분 산책로 코스 확정", "estimated_minutes": 15, "category": "Exercise", "first_step": "운동화 현관 앞에 미리 꺼내두기"}]
- time_policy 요점: 활동: 06:00~23:30 / 피크: 06:00, 21:00 / 노터치: 1건
- 충돌 검사 결과 (rule scheduler): violation-gym-001: 현재 컨디션 낮음으로 인해 고강도 운동 계획 제외

체크리스트:
1. Focus 카드 ≤ 3, Maintain 카드 ≤ 5 (DevBaseline §1.4).
2. 각 action_item 의 estimated_minutes ≤ 60 — 넘으면 더 잘게.
3. fixed_schedule 과 시간 충돌 없음.
4. no-meeting / no-touch hours 위반 없음.
5. 같은 leaf 에 중복 action_item 없음.
6. action_item 이 SMART 한가 — "공부하기" 같은 모호한 항목은 다듬기 제안.

규칙:
- 모두 통과면 `approved=true`, `feedback` 은 빈 배열.
- 하나라도 어긋나면 `approved=false`, `feedback[]` 에 **무엇을 어떻게 바꾸면 좋을지** 사용자 친화 문장으로 적는다 (rule id 가 아니라 사람이 읽을 제안).
- 사용자를 탓하거나 평가하지 말 것. 계획을 함께 다듬는 제안 톤만 쓴다.
- 금지어: "실패", "또", "안 됐", "못했", "왜 안". 대신 "이렇게 줄여보면", "이 시간으로 옮기면" 같은 제안형.

응답 형식 (Structured Output / JSON — schema `PlanReview`):
{
  "approved": <true|false>,
  "feedback": ["<다듬을 점 0~N, 친화적 제안 문장>"]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "approved": true,
  "feedback": []
}
```

## 파이프라인 최종 산출
- 분해 결과: goal_node 5개 / action_item 2개
- 룰 배치(scheduled_blocks): 2개 (LLM 미관여 — 분해 output 을 가용시간에 배치)
- 검토: approved=True

---

# 시나리오: 백엔드 포트폴리오 + 코딩테스트 (멀티 목표)

- 확인 포인트: heaviest 가 아닌 목표는 분해 트리에서 제외되는지(heaviest 만 분해)
- 입력 목표: Spring 기반 백엔드 포트폴리오 1개 완성(focus) / 백준 골드 달성(focus)
- 총 실행시간: 3.5s · used_fallback: `False` · LLM 호출 2회

## LLM Flow (2 calls)

### Call #1 — decompose_goal — PLANNING ②③ (목표 분해)
- schema: `GoalDecomposition` · status: **OK** · latency: 2.68s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 468/699

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Planning Agent 다. 톤: "Be on your side".

입력 목표:
- 제목: Spring 기반 백엔드 포트폴리오 1개 완성
- why_now: 하반기 공채 지원용 포트폴리오 필요
- 마감 / 호라이즌: 2026-08-31
- behavioral_profile 요약: 회복 톤: 담백하게 / 휴식 제안 수용: True / 집중 지속: 90분 / 이번 주 컨디션: 보통
- time_policy 요약: 활동: 10:00~23:59 / 피크: 14:00, 22:00, 23:00
- freebusy (앞으로 7일): 

목표를 goal_node 트리 (root → branch → leaf) 와 leaf 별 action_item 목록으로 분해하라.

규칙:
- Focus 카드 최대 3, Maintain 최대 5 — 초과 금지.
- 각 leaf 는 60분 이내. 60분 초과면 더 잘게 나눠라.
- action_item 은 SMART (Specific, Measurable, Actionable). "공부하기" 금지.
- 정책 위반 (cap, no-meeting hours, fixed schedule 충돌) 시 해당 카드 제외 + 이유 기록.

응답 형식 (Structured Output / JSON):
{
  "goal_nodes": [
    {"node_id": "<temp_uuid>", "parent_id": null, "title": "...", "node_type": "root|branch|leaf", "order_index": 0, "is_leaf": false}
  ],
  "action_items": [
    {"node_id": "<temp_uuid>", "title": "...", "estimated_minutes": 30, "category": "study|...", "first_step": "..."}
  ],
  "policy_violations": [
    {"node_id": "<temp_uuid>", "reason": "<cap_exceeded|conflict|...>"}
  ]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "goalNodes": [
    {
      "nodeId": "root-001",
      "parentId": null,
      "title": "Spring 기반 백엔드 포트폴리오 완성",
      "nodeType": "root",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "branch-001",
      "parentId": "root-001",
      "title": "기획 및 설계",
      "nodeType": "branch",
      "orderIndex": 0,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-001",
      "parentId": "branch-001",
      "title": "프로젝트 핵심 기능 정의 및 엔티티 설계",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "branch-002",
      "parentId": "root-001",
      "title": "기능 구현",
      "nodeType": "branch",
      "orderIndex": 1,
      "isLeaf": false
    },
    {
      "nodeId": "leaf-002",
      "parentId": "branch-002",
      "title": "Spring Boot 프로젝트 기본 셋팅 및 의존성 주입",
      "nodeType": "leaf",
      "orderIndex": 0,
      "isLeaf": true
    },
    {
      "nodeId": "leaf-003",
      "parentId": "branch-002",
      "title": "핵심 도메인 API 1개(조회) 구현",
      "nodeType": "leaf",
      "orderIndex": 1,
      "isLeaf": true
    }
  ],
  "actionItems": [
    {
      "nodeId": "leaf-001",
      "title": "핵심 기능 리스트 3개 작성 및 ERD 초안 그리기",
      "estimatedMinutes": 45,
      "category": "design",
      "firstStep": "노션에 프로젝트 핵심 기능 3가지를 불렛포인트로 작성하기"
    },
    {
      "nodeId": "leaf-002",
      "title": "Spring Initializr를 통한 프로젝트 설정",
      "estimatedMinutes": 30,
      "category": "coding",
      "firstStep": "start.spring.io에서 필수 의존성(Web, JPA, H2/MySQL) 선택 후 다운로드"
    },
    {
      "nodeId": "leaf-003",
      "title": "Controller-Service-Repository 레이어 구조 만들기",
      "estimatedMinutes": 60,
      "category": "coding",
      "firstStep": "단일 엔티티 조회용 Repository 인터페이스 생성하기"
    }
  ],
  "policyViolations": []
}
```

### Call #2 — review_plan — REVIEWING ④ (계획 품질 검토)
- schema: `PlanReview` · status: **OK** · latency: 0.77s · timeout: 8.0s
- model: `gemini-flash-lite-latest` · tokens in/out: 1007/16

**▶ INPUT (Gemini 로 전송된 최종 프롬프트):**

```
너는 re:action 의 Plan Verifier 다. Planning Agent 가 만든 첫 주 계획을 독립적으로 검토해 통과 / 다듬기 제안을 결정한다. 톤: "Be on your side, not on your case".

검증 대상:
- goal_nodes: [{"node_id": "root-001", "parent_id": null, "title": "Spring 기반 백엔드 포트폴리오 완성", "node_type": "root", "order_index": 0, "is_leaf": false}, {"node_id": "branch-001", "parent_id": "root-001", "title": "기획 및 설계", "node_type": "branch", "order_index": 0, "is_leaf": false}, {"node_id": "leaf-001", "parent_id": "branch-001", "title": "프로젝트 핵심 기능 정의 및 엔티티 설계", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "branch-002", "parent_id": "root-001", "title": "기능 구현", "node_type": "branch", "order_index": 1, "is_leaf": false}, {"node_id": "leaf-002", "parent_id": "branch-002", "title": "Spring Boot 프로젝트 기본 셋팅 및 의존성 주입", "node_type": "leaf", "order_index": 0, "is_leaf": true}, {"node_id": "leaf-003", "parent_id": "branch-002", "title": "핵심 도메인 API 1개(조회) 구현", "node_type": "leaf", "order_index": 1, "is_leaf": true}]
- action_items: [{"node_id": "leaf-001", "title": "핵심 기능 리스트 3개 작성 및 ERD 초안 그리기", "estimated_minutes": 45, "category": "design", "first_step": "노션에 프로젝트 핵심 기능 3가지를 불렛포인트로 작성하기"}, {"node_id": "leaf-002", "title": "Spring Initializr를 통한 프로젝트 설정", "estimated_minutes": 30, "category": "coding", "first_step": "start.spring.io에서 필수 의존성(Web, JPA, H2/MySQL) 선택 후 다운로드"}, {"node_id": "leaf-003", "title": "Controller-Service-Repository 레이어 구조 만들기", "estimated_minutes": 60, "category": "coding", "first_step": "단일 엔티티 조회용 Repository 인터페이스 생성하기"}]
- time_policy 요점: 활동: 10:00~23:59 / 피크: 14:00, 22:00, 23:00
- 충돌 검사 결과 (rule scheduler): 충돌 없음

체크리스트:
1. Focus 카드 ≤ 3, Maintain 카드 ≤ 5 (DevBaseline §1.4).
2. 각 action_item 의 estimated_minutes ≤ 60 — 넘으면 더 잘게.
3. fixed_schedule 과 시간 충돌 없음.
4. no-meeting / no-touch hours 위반 없음.
5. 같은 leaf 에 중복 action_item 없음.
6. action_item 이 SMART 한가 — "공부하기" 같은 모호한 항목은 다듬기 제안.

규칙:
- 모두 통과면 `approved=true`, `feedback` 은 빈 배열.
- 하나라도 어긋나면 `approved=false`, `feedback[]` 에 **무엇을 어떻게 바꾸면 좋을지** 사용자 친화 문장으로 적는다 (rule id 가 아니라 사람이 읽을 제안).
- 사용자를 탓하거나 평가하지 말 것. 계획을 함께 다듬는 제안 톤만 쓴다.
- 금지어: "실패", "또", "안 됐", "못했", "왜 안". 대신 "이렇게 줄여보면", "이 시간으로 옮기면" 같은 제안형.

응답 형식 (Structured Output / JSON — schema `PlanReview`):
{
  "approved": <true|false>,
  "feedback": ["<다듬을 점 0~N, 친화적 제안 문장>"]
}
```

**◀ OUTPUT (Gemini raw JSON 응답):**

```json
{
  "approved": true,
  "feedback": []
}
```

## 파이프라인 최종 산출
- 분해 결과: goal_node 6개 / action_item 3개
- 룰 배치(scheduled_blocks): 3개 (LLM 미관여 — 분해 output 을 가용시간에 배치)
- 검토: approved=True

---
