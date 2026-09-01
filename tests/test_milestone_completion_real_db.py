"""마일스톤 완료 표시의 **스코프 판정**을 실 Postgres 위에서 고정 (ADR-0007 §3 예외).

`GoalRepo.get_plan_milestone_node` 는 WHERE 절 다섯 개가 동시에 옳아야 성립한다 —
소유권 · goal 일치 · `tree_kind='plan'` · `node_type='milestone'` · 미보관. fake repo
(`tests/conftest.py`)는 파이썬 술어로 흉내낼 뿐 이 SQL 을 한 번도 실행하지 않는다.

특히 **leaf 를 열어주면 안 된다**는 게 이 층의 핵심 규약이다: 세션 수행 여부는
`action_items.status` 가 진실 소스이고(§3), 노드에 두 번째 완료 표시를 두면 그 진실이
갈린다. 마일스톤만 예외인 이유는 롤업으로 표현 못 하는 판단이 사용자 몫이라서다.

DATABASE_URL 이 없으면 전부 스킵 — `test_first_plan_milestones_real_db.py` 와 같은 게이트.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.goal_node import GoalNode
from reaction_backend.db.models.user import User
from reaction_backend.repositories.goal_repo import GoalRepo
from reaction_backend.schemas.common import now_kst
from tests.conftest import DB_AVAILABLE

pytestmark = pytest.mark.skipif(not DB_AVAILABLE, reason="DATABASE_URL not set")


async def _seed(session: AsyncSession) -> tuple[uuid.UUID, Goal]:
    user_id = uuid.uuid4()
    session.add(User(id=user_id, email=f"{user_id}@test.local", name="마일스톤 완료 테스트"))
    goal = Goal()
    goal.id = uuid.uuid4()
    goal.user_id = user_id
    goal.title = "웹 개발"
    goal.category = "study"
    goal.goal_tier = "focus"
    goal.status = "active"
    session.add(goal)
    await session.flush()
    return user_id, goal


def _node(
    goal_id: uuid.UUID,
    *,
    node_type: str,
    tree_kind: str = "plan",
    depth: int = 1,
    order_index: int = 0,
) -> GoalNode:
    n = GoalNode()
    n.goal_id = goal_id
    n.title = f"{node_type} 노드"
    n.node_type = node_type
    n.depth = depth
    n.order_index = order_index
    n.is_leaf = node_type == "leaf"
    n.tree_kind = tree_kind
    return n


async def test_finds_the_plan_milestone(real_db_session: AsyncSession) -> None:
    user_id, goal = await _seed(real_db_session)
    ms = _node(goal.id, node_type="milestone")
    real_db_session.add(ms)
    await real_db_session.flush()

    found = await GoalRepo(real_db_session).get_plan_milestone_node(user_id, goal.id, ms.id)

    assert found is not None
    assert found.id == ms.id


async def test_refuses_subgoal_and_leaf_nodes(real_db_session: AsyncSession) -> None:
    """계획 트리의 다른 노드는 열어주지 않는다 — leaf 완료는 `action_items.status` 의 몫."""
    user_id, goal = await _seed(real_db_session)
    repo = GoalRepo(real_db_session)
    for node_type, depth in (("core", 0), ("subgoal", 1), ("leaf", 2)):
        n = _node(goal.id, node_type=node_type, depth=depth)
        real_db_session.add(n)
        await real_db_session.flush()
        assert await repo.get_plan_milestone_node(user_id, goal.id, n.id) is None


async def test_refuses_mandala_cells(real_db_session: AsyncSession) -> None:
    """만다라 칸은 `PATCH /goals/mandala/nodes/{id}` 의 것 — 축이 반대인 대칭 방어."""
    user_id, goal = await _seed(real_db_session)
    cell = _node(goal.id, node_type="subgoal", tree_kind="mandala")
    real_db_session.add(cell)
    await real_db_session.flush()

    assert (
        await GoalRepo(real_db_session).get_plan_milestone_node(user_id, goal.id, cell.id) is None
    )


async def test_refuses_archived_and_other_users_and_other_goals(
    real_db_session: AsyncSession,
) -> None:
    """보관된 마일스톤 · 남의 목표 · 다른 목표의 마일스톤은 모두 안 잡힌다."""
    user_id, goal = await _seed(real_db_session)
    other_user_id, other_goal = await _seed(real_db_session)
    repo = GoalRepo(real_db_session)

    archived = _node(goal.id, node_type="milestone")
    archived.archived_at = now_kst()
    mine = _node(goal.id, node_type="milestone", order_index=1)
    theirs = _node(other_goal.id, node_type="milestone")
    real_db_session.add_all([archived, mine, theirs])
    await real_db_session.flush()

    assert await repo.get_plan_milestone_node(user_id, goal.id, archived.id) is None
    assert await repo.get_plan_milestone_node(other_user_id, goal.id, mine.id) is None  # 남의 것
    assert (
        await repo.get_plan_milestone_node(user_id, other_goal.id, mine.id) is None
    )  # goal 불일치
    assert await repo.get_plan_milestone_node(user_id, goal.id, mine.id) is not None
