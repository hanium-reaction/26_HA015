"""목표 완료가 **실제로 뜻하는 바**를 실 Postgres 로 고정 (ADR-0007 6b).

`goals.status='completed'` 슬롯은 오래 비어 있었다. 값만 바꾸고 아무 데서도 안 읽으면
`node_type='milestone'` 이 그랬던 것처럼 "쓰기만 하고 읽지 않는" 상태가 된다. 그래서 두
가지를 함께 검증한다:

- **새 계획 후보에서 빠진다**(`_active_goals` → `heaviest_goal_id`/`materialize_goals`).
  안 빼면 완료 확인 뒤에도 같은 제목이 후보로 남아, 다음 `generate` 가 그 목표에 새 4주
  트리를 붙이고 화면에는 "완료" 배지가 달린 채 카드가 쏟아진다.
- **주간 리뷰가 "완료 확인" 을 제안한다** — 마일스톤이 전부 끝났을 때. 이게 없으면 가드가
  살아난 뒤로는 다음 주기 제안이 조용히 사라지기만 하고 목표를 닫을 계기가 없다.

`_cycle_proposals` 는 raw session 을 쓰는데 라우트 테스트의 `_FakeSession.execute()` 는
어떤 쿼리든 빈 결과라(HTTP 경계 한계) 거기선 분기 자체가 돌지 않는다.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.api.routes.review import _cycle_proposals
from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.goal_node import GoalNode
from reaction_backend.db.models.user import User
from reaction_backend.orchestrator import first_plan_adapter
from reaction_backend.repositories.goal_repo import GoalRepo
from reaction_backend.schemas.common import now_kst
from tests.conftest import DB_AVAILABLE

pytestmark = pytest.mark.skipif(not DB_AVAILABLE, reason="DATABASE_URL not set")


async def _seed_user(session: AsyncSession) -> uuid.UUID:
    user_id = uuid.uuid4()
    session.add(User(id=user_id, email=f"{user_id}@test.local", name="목표 완료 테스트"))
    await session.flush()
    return user_id


async def _seed_goal(
    session: AsyncSession, user_id: uuid.UUID, *, title: str, status: str = "active"
) -> Goal:
    goal = Goal()
    goal.id = uuid.uuid4()
    goal.user_id = user_id
    goal.title = title
    goal.category = "study"
    goal.goal_tier = "focus"
    goal.status = status
    session.add(goal)
    await session.flush()
    return goal


async def _seed_milestone(
    session: AsyncSession, goal_id: uuid.UUID, *, title: str, order_index: int, done: bool
) -> GoalNode:
    n = GoalNode()
    n.goal_id = goal_id
    n.title = title
    n.node_type = "milestone"
    n.depth = 1
    n.order_index = order_index
    n.is_leaf = False
    n.tree_kind = "plan"
    n.completed_at = now_kst() if done else None
    session.add(n)
    await session.flush()
    return n


async def test_completed_goal_is_not_a_planning_candidate(real_db_session: AsyncSession) -> None:
    """완료한 목표는 `_active_goals` 에서 빠진다 — 새 계획이 여기 붙지 않는다."""
    user_id = await _seed_user(real_db_session)
    done = await _seed_goal(real_db_session, user_id, title="끝낸 목표", status="completed")
    live = await _seed_goal(real_db_session, user_id, title="진행 중")

    titles = [g.title for g in await first_plan_adapter._active_goals(real_db_session, user_id)]

    assert titles == ["진행 중"]
    assert done.archived_at is None  # 완료는 보관이 아니다 — 행은 그대로 산다
    assert live.status == "active"


async def test_completed_goal_stops_eating_a_tier_slot(real_db_session: AsyncSession) -> None:
    """실 SQL 로도 tier 한도에서 빠진다 — fake 는 파이썬 술어라 이 WHERE 를 안 돈다.

    active 를 **2개** 심는다. 1개만 심으면 완료도 1개라 술어를 뒤집어도(완료만 센다)
    답이 똑같이 1 이 나와 **우연히 통과**한다.
    """
    user_id = await _seed_user(real_db_session)
    await _seed_goal(real_db_session, user_id, title="진행 중 A")
    await _seed_goal(real_db_session, user_id, title="진행 중 B")
    await _seed_goal(real_db_session, user_id, title="끝낸 목표", status="completed")
    await _seed_goal(real_db_session, user_id, title="잠정", status="proposed")

    assert await GoalRepo(real_db_session).count_by_tier(user_id, "focus") == 2


async def test_all_milestones_done_proposes_completion_not_next_cycle(
    real_db_session: AsyncSession,
) -> None:
    """마일스톤이 전부 끝나면 "다음 주기" 대신 "이 목표 끝난 거 맞아요?" 가 나간다.

    둘은 같은 가드의 양쪽 갈래라 **배타적**이어야 한다 — 한 목표가 두 카드에 동시에
    뜨면 사용자는 상반된 두 제안을 같이 받는다.
    """
    user_id = await _seed_user(real_db_session)
    goal = await _seed_goal(real_db_session, user_id, title="웹 개발")
    await _seed_milestone(real_db_session, goal.id, title="기초 문법", order_index=0, done=True)
    await _seed_milestone(real_db_session, goal.id, title="배포까지", order_index=1, done=True)

    proposals, completions = await _cycle_proposals(
        user_id, goal_repo=GoalRepo(real_db_session), session=real_db_session
    )

    assert [c.goal_title for c in completions] == ["웹 개발"]
    assert [p.goal_title for p in proposals] == []


async def test_an_open_milestone_keeps_it_out_of_the_completion_proposal(
    real_db_session: AsyncSession,
) -> None:
    """하나라도 안 끝났으면 완료 제안은 안 나간다 — 그쪽은 다음 주기 판정의 몫이다."""
    user_id = await _seed_user(real_db_session)
    goal = await _seed_goal(real_db_session, user_id, title="웹 개발")
    await _seed_milestone(real_db_session, goal.id, title="기초 문법", order_index=0, done=True)
    await _seed_milestone(real_db_session, goal.id, title="배포까지", order_index=1, done=False)

    _, completions = await _cycle_proposals(
        user_id, goal_repo=GoalRepo(real_db_session), session=real_db_session
    )

    assert completions == []


async def test_completed_goal_drops_out_of_both_proposals(real_db_session: AsyncSession) -> None:
    """완료를 확정하고 나면 그 목표는 어느 카드에도 안 뜬다 — 제안이 멈춘다.

    `fetch_goals_with_milestones` 가 `status='active'` 로 좁히므로 성립한다. 안 그러면
    사용자가 완료를 확인해도 매주 같은 카드를 다시 받는다.
    """
    user_id = await _seed_user(real_db_session)
    goal = await _seed_goal(real_db_session, user_id, title="웹 개발")
    await _seed_milestone(real_db_session, goal.id, title="기초 문법", order_index=0, done=True)
    await GoalRepo(real_db_session).set_completed(goal, completed=True)

    proposals, completions = await _cycle_proposals(
        user_id, goal_repo=GoalRepo(real_db_session), session=real_db_session
    )

    assert (proposals, completions) == ([], [])


async def test_set_completed_round_trips_and_never_archives(real_db_session: AsyncSession) -> None:
    """실 repo 로 완료→해제 왕복 + `archived_at` 불변.

    라우트 테스트는 `FakeGoalRepo.set_completed` 를 태우므로 **실 repo 를 망가뜨려도
    초록이다**(뮤테이션 확인: `completed=false` 무시 / 완료 시 archive 까지 — 둘 다 안 잡혔다).
    같은 술어를 두 벌 두면 갈리므로, 실 repo 쪽은 여기서 직접 고정한다.

    `archived_at` 이 함께 찍히면 완료한 목표가 `GET /goals` 목록에서 사라진다 — 끝낸 것과
    치운 것은 다른 뜻이다.
    """
    user_id = await _seed_user(real_db_session)
    goal = await _seed_goal(real_db_session, user_id, title="웹 개발")
    repo = GoalRepo(real_db_session)

    await repo.set_completed(goal, completed=True)
    await real_db_session.refresh(goal)
    assert goal.status == "completed"
    assert goal.archived_at is None

    await repo.set_completed(goal, completed=False)
    await real_db_session.refresh(goal)
    assert goal.status == "active"
    assert goal.archived_at is None
    # 되돌리면 계획 후보로 다시 잡힌다 — 오조작 복구가 실제로 원상복구여야 한다.
    titles = [g.title for g in await first_plan_adapter._active_goals(real_db_session, user_id)]
    assert titles == ["웹 개발"]
