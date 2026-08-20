# `agents/` — Worker Agents

각 Worker Agent는 **단일 책임**으로 한 종류 LLM 호출 또는 룰 기반 처리만 한다.
LLM 호출은 [`../llm/`](../llm/) 의 Tool Executor 경유 (직접 SDK 호출 금지).

## 실제 구현된 모듈

| 모듈 | 책임 | LLM Call # | 호출 위치 |
| --- | --- | --- | --- |
| [`ultimate_summary_agent.py`](ultimate_summary_agent.py) | 궁극목표 인터뷰 슬롯 → 확인 카드(`interview/ultimate_summary`) | 매 세션 1회 | `orchestrator/interview.py` `summarize_interview`(kind="ultimate") |

기존 계획 인터뷰(`orchestrator/interview.py`)·First Plan(`orchestrator/first_plan.py`)의
LLM 호출은 아직 오케스트레이터 안에 인라인이다(이 표의 규칙 위반이 이미 있는 상태) —
그 이전은 별도 리팩터 범위이고, 새 코드부터 이 폴더의 규칙을 따른다.

## 계획 단계 (후속 이슈 #5) — 아직 없는 모듈

| 모듈 | 책임 | LLM Call # | 호출 위치 |
| --- | --- | --- | --- |
| `interview_agent.py` | 다음 질문 결정 + 명확도 채점 + 답 정규화 | 매 턴 | Interview Orchestrator |
| `validation_agent.py` | 입력 완전성/명확성 → missing_fields[] | ① | Goal Structuring Orchestrator (VALIDATING) |
| `planning_agent.py` | Goal 분해 + ActionItem 생성 (tiny_first_step, why_now) | ②③ | Goal Structuring (PLANNING) |
| `scheduler_agent.py` | 룰 기반 시간 배치 (우선순위, 의존성, 20% 버퍼, no_touch 제외) | (없음) | Goal Structuring (PLANNING) |
| `review_agent.py` | 플랜 품질 독립 검토 → feedback[] | ④ | Goal Structuring (REVIEWING) |
| `execution_logger_agent.py` | start/pause/resume/check-in 단일 트랜잭션 기록 | (없음) | Today routes |
| `failure_diagnosis_agent.py` | 실패 유형 진단 (8종) + confidence | ⑤ | Recovery Orchestrator (DIAGNOSING) |
| `recovery_coach_agent.py` | if-then 코핑 옵션 2~4개 생성 (UX 4 그룹, 내부 13 전략) | ⑥ | Recovery (COACHING) |
| `policy_update_agent.py` | KPI 기반 PolicySnapshot 갱신 후보 도출 | (선택) | 주간 cron |
| `weekly_review_agent.py` | adherence/consistency/resilience/insight 생성 | (있음) | 주간 cron |

> 모든 에이전트는 **HITL 게이트** 앞에서만 종료한다. 자동 적용 금지.
