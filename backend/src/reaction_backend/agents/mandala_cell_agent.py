"""Worker Agent — 만다라트 Stage B: 확정된 8축 → 축당 8칸 실행 셀 생성.

`run` 은 8축 전체(`planning/mandala_cells`), `run_branch` 는 링(8칸) 1개만(U5,
`planning/mandala_cells_branch`). 세션 소유권 규약은 `mandala_subgoal_agent.py` 와 동일.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.config import get_settings
from reaction_backend.llm import aiClient
from reaction_backend.orchestrator import mandala_adapter
from reaction_backend.schemas.mandala import MandalaCell, MandalaCellPlan, MandalaSubgoal
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome


async def run(
    *,
    outcome: UltimateGoalOutcome,
    subgoals: Sequence[MandalaSubgoal],
    session: AsyncSession | None,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[MandalaCellPlan, bool]:
    """확정된 8축 → 축당 8칸 실행 셀 후보(LLM 원본, 후보정 전). 반환: (계획, fell_back)."""
    settings = get_settings()
    variables = {
        **mandala_adapter.context_from_ultimate(outcome),
        "subgoals": mandala_adapter.format_subgoals_list(subgoals),
    }
    result = await aiClient.run(
        module="planning",
        schema=MandalaCellPlan,
        prompt_id="planning/mandala_cells",
        fallback=lambda: mandala_adapter.rule_cells(subgoals),
        timeout=settings.llm_planning_timeout_seconds,
        variables=variables,
        user_id=user_id,
        session=session,
        tone_mode=tone_mode,
        thinking_budget=settings.llm_planning_thinking_budget,
    )
    return result.value, result.fell_back


async def run_branch(
    *,
    outcome: UltimateGoalOutcome,
    subgoal: MandalaSubgoal,
    sibling_titles: Sequence[str],
    user_hint: str | None,
    locked_cells: Sequence[MandalaCell],
    session: AsyncSession | None,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[MandalaCellPlan, bool]:
    """링(8칸) 1개만 재생성(U5). `locked_cells`(사용자가 이미 편집한 셀)는 그대로 보존."""
    settings = get_settings()
    variables = {
        "statement": outcome.statement,
        "subgoal": subgoal.title,
        "subgoal_index": str(subgoal.order_index),
        "sibling_titles": mandala_adapter.format_titles(sibling_titles),
        "user_hint": user_hint or "(없음)",
        "locked_cells": mandala_adapter.format_titles([c.title for c in locked_cells]),
    }
    result = await aiClient.run(
        module="planning",
        schema=MandalaCellPlan,
        prompt_id="planning/mandala_cells_branch",
        fallback=lambda: mandala_adapter.rule_branch_cells(subgoal, locked_cells),
        timeout=settings.llm_planning_timeout_seconds,
        variables=variables,
        user_id=user_id,
        session=session,
        tone_mode=tone_mode,
        thinking_budget=settings.llm_planning_thinking_budget,
    )
    return result.value, result.fell_back


__all__ = ["run", "run_branch"]
