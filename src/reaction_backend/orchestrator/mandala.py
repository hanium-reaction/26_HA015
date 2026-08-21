"""만다라트 Stage A/B 오케스트레이션 (§5.5) — LangGraph 불필요.

상태 전이가 없는 요청-응답 2단계(Stage A: 8축 / Stage B: 64칸)라 그래프를 만들면 순수
오버헤드다. 라우터가 이 함수들만 부른다 — LLM 직접 호출은 `agents/` 안에서만(AGENTS §4,
Orchestrator 는 LLM 을 직접 호출하지 않는 상태머신).
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.agents import mandala_cell_agent, mandala_subgoal_agent
from reaction_backend.orchestrator import mandala_adapter
from reaction_backend.schemas.mandala import MandalaCell, MandalaGap, MandalaSubgoal
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome


async def generate_subgoals(
    *,
    outcome: UltimateGoalOutcome,
    session: AsyncSession,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[list[MandalaSubgoal], bool]:
    """Stage A(U2) — 궁극목표 → 하위목표(축) 8개. 반환: (8축, fell_back)."""
    raw, fell_back = await mandala_subgoal_agent.run(
        outcome=outcome, session=session, user_id=user_id, tone_mode=tone_mode
    )
    subgoals = mandala_adapter.shape_subgoals(
        raw.subgoals, pillars_hint=outcome.pillars_hint, fell_back=fell_back
    )
    return subgoals, fell_back


async def generate_cells(
    *,
    outcome: UltimateGoalOutcome,
    subgoals: Sequence[MandalaSubgoal],
    session: AsyncSession,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[list[MandalaCell], list[MandalaGap], bool]:
    """Stage B(U3) — 확정된 8축 → 축당 8칸. 반환: (셀 ≤64, 못 채운 칸, fell_back)."""
    raw, fell_back = await mandala_cell_agent.run(
        outcome=outcome, subgoals=subgoals, session=session, user_id=user_id, tone_mode=tone_mode
    )
    cells, gaps = mandala_adapter.shape_cells(raw.cells, subgoals=subgoals, fell_back=fell_back)
    return cells, gaps, fell_back


async def regenerate_branch(
    *,
    outcome: UltimateGoalOutcome,
    subgoal: MandalaSubgoal,
    sibling_titles: Sequence[str],
    user_hint: str | None,
    locked_cells: Sequence[MandalaCell],
    session: AsyncSession,
    user_id: UUID,
    tone_mode: str | None = None,
) -> tuple[list[MandalaCell], list[MandalaGap], bool]:
    """링(8칸) 1개만 재생성(U5). 반환: (그 축의 셀 ≤8, 못 채운 칸, fell_back)."""
    raw, fell_back = await mandala_cell_agent.run_branch(
        outcome=outcome,
        subgoal=subgoal,
        sibling_titles=sibling_titles,
        user_hint=user_hint,
        locked_cells=locked_cells,
        session=session,
        user_id=user_id,
        tone_mode=tone_mode,
    )
    cells, gaps = mandala_adapter.shape_branch_cells(
        raw.cells, subgoal_index=subgoal.order_index, locked_cells=locked_cells, fell_back=fell_back
    )
    return cells, gaps, fell_back


__all__ = ["generate_cells", "generate_subgoals", "regenerate_branch"]
