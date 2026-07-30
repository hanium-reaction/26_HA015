"""Goals — Focus/Maintain/Parked 3 tier 목표 (S26, api-contract §6).

Issue #22 실구현:
- CRUD 실 DB (`goals` 테이블).
- Tier 한도 enforce — Focus ≤ 3, Maintain ≤ 5 (422 `GOAL_TIER_LIMIT_EXCEEDED`, ADR-0005 §2.5.1).
- park — Focus → Parked 전환 (Parked 자유, 한도 X).
- nodes — 계획 승인 시 영속된 **실제 분해 트리** 조회. (예전 `POST /decompose` 는 목표와
  무관한 데모 트리를 돌려주던 mock stub 이라 제거했다 — `list_goal_nodes` 참고.)
- soft delete (`archived_at` + status='archived').
"""

from __future__ import annotations

from datetime import date
from http import HTTPStatus
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.api.deps import CurrentUser
from reaction_backend.db.models.goal import GOAL_CATEGORY_VALUES
from reaction_backend.db.models.goal import Goal as GoalModel
from reaction_backend.db.session import get_db
from reaction_backend.repositories.goal_repo import GoalRepo, get_goal_repo
from reaction_backend.schemas.errors import ApiError, ErrorCode
from reaction_backend.schemas.goals import (
    Goal,
    GoalCreateRequest,
    GoalDecomposition,
    GoalNode,
    GoalsByTier,
    GoalUpdateRequest,
)

router = APIRouter(prefix="/goals", tags=["goals"])

_ID_PREFIX = "goal_"
_TIER_LIMITS: dict[str, int] = {"focus": 3, "maintain": 5}  # parked 자유 (DevBaseline §1.4)
_CATEGORIES = frozenset(GOAL_CATEGORY_VALUES)


def _to_schema(goal: GoalModel) -> Goal:
    return Goal(
        goal_id=f"{_ID_PREFIX}{goal.id}",
        title=goal.title,
        category=goal.category,
        goal_tier=goal.goal_tier,
        priority_level=goal.priority_level,
        deadline=goal.deadline.isoformat() if goal.deadline is not None else None,
        estimated_minutes=goal.estimated_minutes,
        status=goal.status,
    )


def _parse_goal_id(goal_id: str) -> UUID:
    if not goal_id.startswith(_ID_PREFIX):
        raise _not_found()
    try:
        return UUID(goal_id[len(_ID_PREFIX) :])
    except ValueError as e:
        raise _not_found() from e


def _not_found() -> ApiError:
    return ApiError(
        ErrorCode.GOAL_NOT_FOUND,
        "해당 목표를 찾을 수 없어요.",
        http_status=HTTPStatus.NOT_FOUND,
    )


def _parse_deadline(value: str | None) -> date | None:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise ApiError(
            ErrorCode.COMMON_VALIDATION_ERROR,
            "deadline 형식이 올바르지 않아요 (YYYY-MM-DD).",
            http_status=HTTPStatus.UNPROCESSABLE_ENTITY,
            field="deadline",
        ) from e


def _validate_category(category: str) -> None:
    if category not in _CATEGORIES:
        raise ApiError(
            ErrorCode.COMMON_VALIDATION_ERROR,
            f"category 값이 올바르지 않아요 ({sorted(_CATEGORIES)} 중에서).",
            http_status=HTTPStatus.UNPROCESSABLE_ENTITY,
            field="category",
        )


async def _enforce_tier_limit(repo: GoalRepo, user_id: UUID, tier: str) -> None:
    """Focus ≤ 3 / Maintain ≤ 5 한도. Parked 는 자유 (한도 X)."""
    limit = _TIER_LIMITS.get(tier)
    if limit is None:
        return
    current = await repo.count_by_tier(user_id, tier)
    if current + 1 > limit:
        raise ApiError(
            ErrorCode.GOAL_TIER_LIMIT_EXCEEDED,
            f"{tier.capitalize()} 목표는 최대 {limit}개까지 가질 수 있어요.",
            http_status=HTTPStatus.UNPROCESSABLE_ENTITY,
            field="goalTier",
        )


RepoDep = Annotated[GoalRepo, Depends(get_goal_repo)]
SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("")
async def list_goals(user: CurrentUser, repo: RepoDep) -> GoalsByTier:
    """내 목표 — tier 별 그룹 (focus / maintain / parked)."""
    items = await repo.list_active(user.id)
    by_tier: dict[str, list[Goal]] = {"focus": [], "maintain": [], "parked": []}
    for g in items:
        if g.goal_tier in by_tier:
            by_tier[g.goal_tier].append(_to_schema(g))
    return GoalsByTier(
        focus=by_tier["focus"],
        maintain=by_tier["maintain"],
        parked=by_tier["parked"],
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: GoalCreateRequest,
    user: CurrentUser,
    repo: RepoDep,
    session: SessionDep,
) -> Goal:
    """신규 목표 — tier 한도 (Focus ≤3 / Maintain ≤5) enforce."""
    _validate_category(body.category)
    await _enforce_tier_limit(repo, user.id, body.goal_tier)
    deadline = _parse_deadline(body.deadline)

    goal = await repo.create(
        user_id=user.id,
        title=body.title,
        category=body.category,
        goal_tier=body.goal_tier,
        priority_level=body.priority_level,
        deadline=deadline,
        estimated_minutes=body.estimated_minutes,
    )
    await session.commit()
    await session.refresh(goal)
    return _to_schema(goal)


@router.patch("/{goal_id}")
async def update_goal(
    goal_id: str,
    body: GoalUpdateRequest,
    user: CurrentUser,
    repo: RepoDep,
    session: SessionDep,
) -> Goal:
    """목표 부분 수정. tier 변경 시 한도 재검사."""
    goal = await repo.get_by_id(user.id, _parse_goal_id(goal_id))
    if goal is None:
        raise _not_found()

    if body.goal_tier is not None and body.goal_tier != goal.goal_tier:
        await _enforce_tier_limit(repo, user.id, body.goal_tier)

    deadline = _parse_deadline(body.deadline) if body.deadline is not None else None
    updated = await repo.update(
        goal,
        title=body.title,
        deadline=deadline,
        priority_level=body.priority_level,
        goal_tier=body.goal_tier,
    )
    await session.commit()
    await session.refresh(updated)
    return _to_schema(updated)


@router.get("/{goal_id}/nodes")
async def list_goal_nodes(goal_id: str, user: CurrentUser, repo: RepoDep) -> GoalDecomposition:
    """이 목표의 **실제 분해 트리** — 계획 승인 시 영속된 `goal_nodes` 를 그대로 읽는다.

    이 자리에 있던 `POST /{goal_id}/decompose` 는 목표와 무관하게 하드코딩된 데모 트리
    (캡스톤 → 설계/구현/발표)를 돌려줬고 FE 가 그걸 화면에 그렸다. 어떤 목표를 분해해도
    같은 캡스톤 단계가 나왔다 — 안 보여주느니만 못한 상태라 제거하고, 실제 분해를 읽는
    조회로 대체한다. 분해 자체는 First Plan(`planning/goal_decompose` + 마일스톤)이 이미
    수행하고 승인 시 영속한다.

    계획을 아직 승인하지 않은 목표는 트리가 없으므로 `nodes=[]` (404 아님 — 목표는 존재하고
    분해만 아직 없는 정상 상태다). `rootNodeId` 도 그때는 null.
    """
    goal = await repo.get_by_id(user.id, _parse_goal_id(goal_id))
    if goal is None:
        raise _not_found()
    rows = await repo.list_nodes(goal.id)
    nodes = [
        GoalNode(
            node_id=f"node_{n.id}",
            parent_id=f"node_{n.parent_node_id}" if n.parent_node_id is not None else None,
            title=n.title,
            depth=n.depth,
        )
        for n in rows
    ]
    root = next((n for n in rows if n.parent_node_id is None), None)
    return GoalDecomposition(
        goal_id=goal_id,
        root_node_id=f"node_{root.id}" if root is not None else None,
        nodes=nodes,
    )


@router.post("/{goal_id}/park")
async def park_goal(goal_id: str, user: CurrentUser, repo: RepoDep, session: SessionDep) -> Goal:
    """Focus → Parked 전환. Parked 는 한도 자유."""
    goal = await repo.get_by_id(user.id, _parse_goal_id(goal_id))
    if goal is None:
        raise _not_found()
    parked = await repo.park(goal)
    await session.commit()
    await session.refresh(parked)
    return _to_schema(parked)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: str, user: CurrentUser, repo: RepoDep, session: SessionDep) -> None:
    """목표 soft delete (`archived_at` + `status=archived`)."""
    goal = await repo.get_by_id(user.id, _parse_goal_id(goal_id))
    if goal is None:
        raise _not_found()
    await repo.soft_delete(goal)
    await session.commit()
    return None
