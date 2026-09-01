"""마일스톤 완료 표시 route — `PATCH /goals/{goalId}/nodes/{nodeId}` (ADR-0007 §3 예외).

여기서 보는 건 **HTTP 경계와 경로 배치**다:
- 만다라 편집(`PATCH /goals/mandala/nodes/{id}`)과 경로가 겹치지 않는가 —
  `/{goal_id}/nodes/{node_id}` 가 먼저 선언되면 `goal_id="mandala"` 로 그 요청을 가로챈다.
- 마일스톤이 아닌 노드를 거절하는가.
- `GET /goals/{id}/nodes` 가 `completedAt` 을 실어 주는가(토글 UI 의 전제).

저장소 WHERE 절 자체는 `test_milestone_completion_real_db.py` 가 실 Postgres 로 담당한다 —
`FakeGoalRepo` 는 파이썬 술어로 흉내낼 뿐이라 SQL 이 옳은지 말해 주지 못한다.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.goal_node import GoalNode
from reaction_backend.schemas.common import now_kst
from tests.conftest import DEMO_USER_UUID, FakeGoalRepo, _FakeSession


def _goal(title: str = "웹 개발") -> Goal:
    g = Goal()
    g.id = uuid4()
    g.user_id = DEMO_USER_UUID
    g.title = title
    g.category = "study"
    g.goal_tier = "focus"
    g.status = "active"
    g.is_ultimate = False
    g.archived_at = None
    return g


def _node(
    *,
    goal_id: Any,
    node_type: str = "milestone",
    tree_kind: str = "plan",
    depth: int = 1,
    order_index: int = 0,
    completed_at: Any = None,
) -> GoalNode:
    n = GoalNode()
    n.id = uuid4()
    n.goal_id = goal_id
    n.parent_node_id = None
    n.title = f"{node_type} 노드"
    n.node_type = node_type
    n.depth = depth
    n.order_index = order_index
    n.is_leaf = node_type == "leaf"
    n.tree_kind = tree_kind
    n.source = "llm"
    n.why_text = None
    n.locked = False
    n.completed_at = completed_at
    n.promoted_goal_id = None
    n.archived_at = None
    return n


def _seed(repo: FakeGoalRepo, *nodes: GoalNode) -> Goal:
    goal = _goal()
    repo._items[goal.id] = goal
    for n in nodes:
        n.goal_id = goal.id
    repo._nodes[goal.id] = list(nodes)
    return goal


def test_marks_a_milestone_complete_and_can_undo(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """완료 → completedAt 이 찍히고, false 로 되돌리면 null (오조작 복구)."""
    ms = _node(goal_id=None)
    goal = _seed(fake_goal_repo, ms)

    res = client.patch(f"/goals/goal_{goal.id}/nodes/node_{ms.id}", json={"completed": True})
    assert res.status_code == 200
    body = res.json()
    assert body["nodeType"] == "milestone"
    assert body["completedAt"] is not None
    # 응답 시간 필드는 KST(+09:00) — 같은 컬럼을 읽는 만다라 응답과 표기가 갈리면
    # FE 가 날짜만 잘라 쓸 때 하루가 어긋난다(ADR-0002 §2.4).
    assert body["completedAt"].endswith("+09:00")
    assert ms.source == "user"  # 사용자가 손댄 노드 — AI 가 채운 것과 구분된다

    undo = client.patch(f"/goals/goal_{goal.id}/nodes/node_{ms.id}", json={"completed": False})
    assert undo.status_code == 200
    assert undo.json()["completedAt"] is None


def test_completion_is_committed(
    client: TestClient, fake_goal_repo: FakeGoalRepo, fake_sessions: list[_FakeSession]
) -> None:
    """완료 표시가 실제로 **commit 된다**.

    `get_db` 는 "commit 은 호출자 책임" 이라(`db/session.py`) 라우트가 commit 을 빠뜨리면
    프로덕션에서 완료 표시가 조용히 유실된다. 그런데 응답만 검사하면 초록이다 — 라우트가
    ORM 객체를 그대로 직렬화하기 때문이다. `_FakeSession.commit_count` 로 그 뮤턴트를 막는다.
    """
    ms = _node(goal_id=None)
    goal = _seed(fake_goal_repo, ms)

    res = client.patch(f"/goals/goal_{goal.id}/nodes/node_{ms.id}", json={"completed": True})

    assert res.status_code == 200
    assert fake_sessions[-1].commit_count == 1


def test_refuses_a_milestone_under_an_archived_goal(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """soft delete 된 목표의 마일스톤은 못 건드린다.

    저장소 조회는 `Goal.archived_at` 을 보지 않는다(노드 축으로만 좁힌다) — 이 방어는
    라우트의 `repo.get_by_id` 하나에 걸려 있어서, 그 호출이 사라져도 다른 테스트는 전부
    초록이다.
    """
    ms = _node(goal_id=None)
    goal = _seed(fake_goal_repo, ms)
    goal.archived_at = now_kst()

    res = client.patch(f"/goals/goal_{goal.id}/nodes/node_{ms.id}", json={"completed": True})

    assert res.status_code == 404
    assert ms.completed_at is None


def test_marking_complete_is_idempotent(client: TestClient, fake_goal_repo: FakeGoalRepo) -> None:
    """같은 값을 다시 보내도 200 — FE 가 재시도해도 안전하다."""
    ms = _node(goal_id=None)
    goal = _seed(fake_goal_repo, ms)
    path = f"/goals/goal_{goal.id}/nodes/node_{ms.id}"

    first = client.patch(path, json={"completed": True})
    second = client.patch(path, json={"completed": True})

    assert (first.status_code, second.status_code) == (200, 200)
    assert second.json()["completedAt"] is not None


def test_refuses_non_milestone_plan_nodes(client: TestClient, fake_goal_repo: FakeGoalRepo) -> None:
    """subgoal/leaf 는 404 — leaf 에 완료를 찍게 하면 `action_items.status` 와 진실이 갈린다."""
    subgoal = _node(goal_id=None, node_type="subgoal")
    leaf = _node(goal_id=None, node_type="leaf", depth=2, order_index=1)
    goal = _seed(fake_goal_repo, subgoal, leaf)

    for n in (subgoal, leaf):
        res = client.patch(f"/goals/goal_{goal.id}/nodes/node_{n.id}", json={"completed": True})
        assert res.status_code == 404
        assert res.json()["code"] == "GOAL_NOT_FOUND"
        assert n.completed_at is None


def test_refuses_mandala_cells(client: TestClient, fake_goal_repo: FakeGoalRepo) -> None:
    """만다라 칸은 이 endpoint 의 것이 아니다 — 전용 경로가 따로 있다."""
    cell = _node(goal_id=None, node_type="subgoal", tree_kind="mandala")
    goal = _seed(fake_goal_repo, cell)

    res = client.patch(f"/goals/goal_{goal.id}/nodes/node_{cell.id}", json={"completed": True})

    assert res.status_code == 404
    assert cell.completed_at is None


def test_mandala_edit_route_is_not_shadowed(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """`PATCH /goals/mandala/nodes/{id}` 가 이 라우트에 가로채이지 않는다.

    선언 순서가 뒤집히면 `goal_id="mandala"` 로 매칭돼 만다라 편집이 통째로 404 가 된다
    (제목·이유 편집까지 같이 죽는다). 라우트 배치를 고정하는 핀이다.
    """
    goal = _goal(title="궁극목표")
    goal.is_ultimate = True
    cell = _node(goal_id=goal.id, node_type="subgoal", tree_kind="mandala")
    fake_goal_repo._items[goal.id] = goal
    fake_goal_repo._nodes[goal.id] = [cell]

    res = client.patch(f"/goals/mandala/nodes/node_{cell.id}", json={"title": "고친 축"})

    assert res.status_code == 200
    assert cell.title == "고친 축"


def test_completed_at_renders_in_kst_even_from_a_utc_value(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """DB 가 돌려주는 **UTC-aware** 값도 응답에서는 KST(+09:00)로 나간다.

    라우트는 `commit()` 뒤 `refresh()` 하므로 실제 응답 값은 `now_kst()` 가 아니라 **DB 가
    돌려준 UTC-aware datetime** 이다. 그래서 앞의 완료 테스트(fake repo 라 `now_kst()` 가
    그대로 남는다)만으로는 이 계약이 검증되지 않는다 — 스키마가 `KstDatetime` 이 아니라
    맨 `datetime` 이어도 초록이다.

    표기가 갈리면 같은 `goal_nodes.completed_at` 을 읽는 만다라 응답(`+09:00`)과 어긋나,
    FE 가 날짜만 잘라 쓸 때 KST 09:00 이전 완료가 **하루 전**으로 찍힌다.
    """
    utc_value = datetime(2026, 8, 26, 1, 30, tzinfo=UTC)  # = KST 10:30
    ms = _node(goal_id=None, completed_at=utc_value)
    goal = _seed(fake_goal_repo, ms)

    res = client.get(f"/goals/goal_{goal.id}/nodes")

    rendered = res.json()["nodes"][0]["completedAt"]
    assert rendered.endswith("+09:00")
    assert rendered.startswith("2026-08-26T10:30")


def test_nodes_listing_exposes_completed_at(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """`GET /goals/{id}/nodes` 가 completedAt 을 실어 준다 — 토글 UI 가 현재 상태를 알아야 한다."""
    done = _node(goal_id=None, completed_at=now_kst())
    open_ms = _node(goal_id=None, order_index=1)
    goal = _seed(fake_goal_repo, done, open_ms)

    res = client.get(f"/goals/goal_{goal.id}/nodes")

    assert res.status_code == 200
    by_id = {n["nodeId"]: n for n in res.json()["nodes"]}
    assert by_id[f"node_{done.id}"]["completedAt"] is not None
    assert by_id[f"node_{open_ms.id}"]["completedAt"] is None
