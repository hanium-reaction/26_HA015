"""Worker Agent — 궁극목표 인터뷰 요약 확인 카드 생성 (`interview/ultimate_summary`).

이 레포에 실제로 배선된 첫 `agents/` 모듈이다 — 기존 인터뷰/계획의 LLM 호출은 전부
오케스트레이터(`orchestrator/interview.py`, `first_plan.py`) 안에 직접 있고(AGENTS §4 위반이
이미 있는 상태), 그 이전은 이 PR 시리즈 범위 밖이다. 새 코드부터 규칙대로 놓는다:
Worker Agent = 단일 책임 LLM 호출, Orchestrator = LLM 을 직접 호출하지 않는 상태머신.

세션 소유권 규약(코드 리뷰 강제 항목):
1. `session` 은 `aiClient.run(session=...)` 전달 외에 쓰지 않는다. add/execute/flush/commit 금지.
2. 트랜잭션 경계는 호출자(라우터)가 소유한다.
3. 반환은 항상 `(값, fell_back)` 튜플 — 호출자가 `fell_back` 을 누적해 `analysis_source`/
   `aiSource` 를 정한다.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.config import get_settings
from reaction_backend.llm import aiClient
from reaction_backend.orchestrator import ultimate_adapter
from reaction_backend.schemas.interview import InterviewSummary


def _rule_summary(slot_answers: Mapping[str, Mapping[str, Any] | None]) -> InterviewSummary:
    """슬롯에서 결정적으로 빌드한 룰 요약 — LLM 실패 시 그대로 노출.

    `interview._rule_summary`(계획 인터뷰)의 궁극목표판. 값이 있는 항목만 문장에 덧붙인다.
    """
    v = ultimate_adapter.summary_variables(slot_answers)
    not_set = "아직 정하지 않음"

    goal_summary = f"궁극 목표는 '{v['statement']}' 예요."
    if v["measure"] != not_set:
        goal_summary += f" '{v['measure']}' 로 이뤘는지 확인할 수 있어요."

    time_summary = f"시간 지평은 {v['horizon']} 이에요."
    if v["current_position"] != not_set:
        time_summary += f" 지금은 '{v['current_position']}' 위치라고 하셨어요."

    preference_summary = f"그때의 모습은 '{v['identity']}' 예요."
    if v["constraints"] != not_set:
        preference_summary += f" 걸림돌로는 '{v['constraints']}' 를 짚으셨어요."

    return InterviewSummary(
        headline=v["statement"],
        goal_summary=goal_summary,
        time_summary=time_summary,
        preference_summary=preference_summary,
        confirm_question="이대로 만다라트를 세워볼까요?",
    )


async def run(
    *,
    slot_answers: Mapping[str, Mapping[str, Any] | None],
    session: AsyncSession | None,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[InterviewSummary, bool]:
    """궁극목표 슬롯 → 확인 카드(S30 진입 전 요약). 반환: (요약, fell_back).

    `interview.summarize_interview` 가 `kind="ultimate"` 일 때 호출한다. `finalize_outcome`
    (LLM 0회, `ultimate_adapter.build_ultimate_outcome`) 보다 **먼저** 실행되므로 아직 완성된
    `UltimateGoalOutcome` 이 없다 — 슬롯에서 직접 변수를 뽑는다.
    """
    settings = get_settings()
    variables = ultimate_adapter.summary_variables(slot_answers)
    result = await aiClient.run(
        module="interview",
        schema=InterviewSummary,
        prompt_id="interview/ultimate_summary",
        fallback=lambda: _rule_summary(slot_answers),
        timeout=settings.llm_timeout_seconds,
        variables=variables,
        user_id=user_id,
        session=session,
        tone_mode=tone_mode,
    )
    return result.value, result.fell_back


__all__ = ["run"]
