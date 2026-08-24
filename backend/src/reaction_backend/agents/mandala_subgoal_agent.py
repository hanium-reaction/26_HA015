"""Worker Agent — 만다라트 Stage A: 궁극목표 → 하위목표(축) 후보 생성 (`planning/mandala_subgoals`).

세션 소유권 규약(`agents/README.md`, 코드 리뷰 강제 항목):
1. `session` 은 `aiClient.run(session=...)` 전달 외에 쓰지 않는다. add/execute/flush/commit 금지.
2. 트랜잭션 경계는 호출자(라우터)가 소유한다.
3. 반환은 항상 `(값, fell_back)` 튜플.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.config import get_settings
from reaction_backend.llm import aiClient
from reaction_backend.orchestrator import mandala_adapter
from reaction_backend.schemas.mandala import MandalaSubgoalPlan
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome


async def run(
    *,
    outcome: UltimateGoalOutcome,
    session: AsyncSession | None,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[MandalaSubgoalPlan, bool]:
    """궁극목표 → 하위목표(축) 후보(LLM 원본, 후보정 전). 반환: (계획, fell_back).

    `mandala.generate_subgoals` 가 호출해 `mandala_adapter.shape_subgoals` 로 8개 고정·
    잠금축 보존·룰 패딩을 거친다(§5.6 층②) — 이 함수 자체는 스키마를 느슨하게 둔 LLM
    원본만 돌려준다(층①).
    """
    settings = get_settings()
    variables = mandala_adapter.context_from_ultimate(outcome)
    result = await aiClient.run(
        module="planning",
        schema=MandalaSubgoalPlan,
        prompt_id="planning/mandala_subgoals",
        fallback=lambda: mandala_adapter.rule_subgoals(outcome),
        timeout=settings.llm_planning_timeout_seconds,
        variables=variables,
        user_id=user_id,
        session=session,
        tone_mode=tone_mode,
        thinking_budget=settings.llm_planning_thinking_budget,
    )
    return result.value, result.fell_back


__all__ = ["run"]
