"""만다라트 조회·편집·승격 route (U8~U10, PR6) — HTTP 경계 검증.

`repo.list_nodes`/`get_mandala_node` 은 `FakeGoalRepo` 의 `_nodes` dict 를 직접 시드해
검증한다(PR5 의 전체 생성 플로우를 다시 태울 필요 없음 — 여기서 보는 건 "이미 승인된 트리를
어떻게 읽고/고치고/승격하는가"). action_item 기반 진척도는 `_FakeSession.execute` 가 항상
빈 결과라(HTTP 경계 한계, `test_mandala_adapter.py` 가 순수 함수로 이미 표로 검증) 여기서는
`completed_at` 직접체크 경로만 확인한다.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.goal_node import GoalNode
from reaction_backend.schemas.common import now_kst
from tests.conftest import DEMO_USER_UUID, FakeGoalRepo


def _goal(*, is_ultimate: bool = True, title: str = "궁극목표") -> Goal:
    g = Goal()
    g.id = uuid4()
    g.user_id = DEMO_USER_UUID
    g.title = title
    g.category = "other"
    g.goal_tier = "parked"
    g.status = "active"
    g.is_ultimate = is_ultimate
    g.archived_at = None
    return g


def _node(
    *,
    goal_id: Any,
    parent_id: Any = None,
    title: str = "노드",
    node_type: str = "subgoal",
    depth: int = 1,
    order_index: int = 0,
    is_leaf: bool = False,
    source: str = "llm",
    locked: bool = False,
    completed_at: Any = None,
    promoted_goal_id: Any = None,
) -> GoalNode:
    n = GoalNode()
    n.id = uuid4()
    n.goal_id = goal_id
    n.parent_node_id = parent_id
    n.title = title
    n.node_type = node_type
    n.depth = depth
    n.order_index = order_index
    n.is_leaf = is_leaf
    n.tree_kind = "mandala"
    n.source = source
    n.why_text = None
    n.locked = locked
    n.completed_at = completed_at
    n.promoted_goal_id = promoted_goal_id
    n.archived_at = None
    return n


def _seed_full_tree(repo: FakeGoalRepo, goal: Goal) -> dict[str, GoalNode]:
    """root + 8축 + 각 축 1개 leaf(축0 은 completed_at 직접체크로 완료)."""
    repo._items[goal.id] = goal
    root = _node(goal_id=goal.id, title=goal.title, node_type="core", depth=0, order_index=0)
    subgoals = [
        _node(goal_id=goal.id, parent_id=root.id, title=f"축{i}", depth=1, order_index=i)
        for i in range(8)
    ]
    leaves = [
        _node(
            goal_id=goal.id,
            parent_id=subgoals[i].id,
            title=f"축{i}셀0",
            node_type="leaf",
            depth=2,
            order_index=0,
            is_leaf=True,
            completed_at=now_kst() if i == 0 else None,
        )
        for i in range(8)
    ]
    repo._nodes[goal.id] = [root, *subgoals, *leaves]
    return {
        "root": root,
        **{f"sub{i}": subgoals[i] for i in range(8)},
        **{f"leaf{i}": leaves[i] for i in range(8)},
    }


def test_get_mandala_tree_empty_when_not_approved_yet(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """아직 승인된 만다라 트리가 없으면 404 가 아니라 빈 트리(정상 상태)."""
    goal = _goal()
    fake_goal_repo._items[goal.id] = goal

    resp = client.get(f"/goals/goal_{goal.id}/mandala")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["nodes"] == []
    assert body["rootNodeId"] is None
    assert body["progress"] == 0.0


def test_get_mandala_tree_rejects_non_ultimate_goal(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal(is_ultimate=False)
    fake_goal_repo._items[goal.id] = goal

    resp = client.get(f"/goals/goal_{goal.id}/mandala")

    assert resp.status_code == 404, resp.text


def test_get_mandala_tree_returns_all_nodes_with_rollup(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)

    resp = client.get(f"/goals/goal_{goal.id}/mandala")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["nodes"]) == 1 + 8 + 8
    assert body["rootNodeId"] == f"node_{ids['root'].id}"
    assert body["statement"] == goal.title
    # 축0 은 leaf 가 completed_at 직접체크로 완료 → progress 1/8, coverage 1/8.
    sub0 = next(n for n in body["nodes"] if n["nodeId"] == f"node_{ids['sub0'].id}")
    assert sub0["progress"] == 1 / 8
    assert sub0["coverage"] == 1 / 8
    # 나머지 축은 leaf 가 completed_at 도 없고 카드도 없어 progress=None(coverage=0).
    sub1 = next(n for n in body["nodes"] if n["nodeId"] == f"node_{ids['sub1'].id}")
    assert sub1["progress"] == 0.0
    assert sub1["coverage"] == 0.0
    # root 는 8축 평균.
    assert body["progress"] == 1 / 8 / 8


def test_patch_mandala_node_updates_title_and_marks_user_source(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)
    node_id = f"node_{ids['sub1'].id}"

    resp = client.patch(f"/goals/mandala/nodes/{node_id}", json={"title": "새 제목"})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "새 제목"
    assert body["source"] == "user"
    assert ids["sub1"].title == "새 제목"


def test_patch_mandala_node_toggles_completed(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)
    node_id = f"node_{ids['leaf1'].id}"

    resp = client.patch(f"/goals/mandala/nodes/{node_id}", json={"completed": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["completedAt"] is not None

    resp2 = client.patch(f"/goals/mandala/nodes/{node_id}", json={"completed": False})
    assert resp2.status_code == 200, resp2.text
    assert resp2.json()["completedAt"] is None


def test_patch_mandala_node_rejects_title_over_depth_limit(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)
    node_id = f"node_{ids['sub1'].id}"  # depth=1 → 10자 상한

    resp = client.patch(
        f"/goals/mandala/nodes/{node_id}", json={"title": "이건분명히열자가넘는제목이다"}
    )

    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"


def test_patch_mandala_node_unknown_returns_404(client: TestClient) -> None:
    resp = client.patch(f"/goals/mandala/nodes/node_{uuid4()}", json={"title": "x"})
    assert resp.status_code == 404, resp.text


def test_promote_subgoal_creates_proposed_goal(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)
    node_id = f"node_{ids['sub2'].id}"

    resp = client.post(f"/goals/mandala/nodes/{node_id}/promote", json={"goalTier": "focus"})

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "축2"
    assert body["status"] == "proposed"
    assert body["goalTier"] == "focus"
    assert ids["sub2"].promoted_goal_id is not None


def test_promote_rejects_core_and_leaf_nodes(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)

    root_resp = client.post(
        f"/goals/mandala/nodes/node_{ids['root'].id}/promote", json={"goalTier": "focus"}
    )
    leaf_resp = client.post(
        f"/goals/mandala/nodes/node_{ids['leaf3'].id}/promote", json={"goalTier": "focus"}
    )

    assert root_resp.status_code == 422, root_resp.text
    assert leaf_resp.status_code == 422, leaf_resp.text


def test_promote_is_idempotent_when_already_promoted(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """이미 승격된 축을 다시 누르면 새로 안 만들고 그 행을 그대로 반환.

    이미 승격된 상태를 직접 시드한다 — 실제로는 `session.add()`(raw)로 커밋되는 Goal 이
    같은 트랜잭션 안에서 곧바로 재조회 가능하지만(`materialize_ultimate_goal` 과 동일
    패턴), `FakeGoalRepo`(테스트 더블)는 `session.add()` 와 별개 저장소라 두 번의 HTTP
    요청을 실제로 이어붙여 재현할 수 없다 — 그래서 "이미 승격됨" 상태 자체를 시드해 같은
    분기(`if node.promoted_goal_id is not None`)를 직접 검증한다.
    """
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)
    already_promoted = Goal()
    already_promoted.id = uuid4()
    already_promoted.user_id = DEMO_USER_UUID
    already_promoted.title = "축4"
    already_promoted.category = "other"
    already_promoted.priority_level = 3
    already_promoted.goal_tier = "maintain"
    already_promoted.status = "proposed"
    already_promoted.archived_at = None
    fake_goal_repo._items[already_promoted.id] = already_promoted
    ids["sub4"].promoted_goal_id = already_promoted.id

    resp = client.post(
        f"/goals/mandala/nodes/node_{ids['sub4'].id}/promote", json={"goalTier": "focus"}
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["goalId"] == f"goal_{already_promoted.id}"
    # 새로 안 만들었으므로 tier 는 요청(focus)이 아니라 기존 값(maintain) 그대로.
    assert resp.json()["goalTier"] == "maintain"


def test_promote_enforces_focus_tier_limit(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """이미 Focus 3개가 꽉 찬 상태에서 승격 시도 → 422 GOAL_TIER_LIMIT_EXCEEDED(기존 코드 재사용)."""
    goal = _goal()
    ids = _seed_full_tree(fake_goal_repo, goal)
    for i in range(3):
        existing = Goal()
        existing.id = uuid4()
        existing.user_id = DEMO_USER_UUID
        existing.title = f"기존 focus{i}"
        existing.goal_tier = "focus"
        existing.status = "active"
        existing.archived_at = None
        fake_goal_repo._items[existing.id] = existing

    resp = client.post(
        f"/goals/mandala/nodes/node_{ids['sub5'].id}/promote", json={"goalTier": "focus"}
    )

    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "GOAL_TIER_LIMIT_EXCEEDED"


def test_list_goal_nodes_includes_additive_fields(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """U11 — 기존 GET /goals/{id}/nodes 가 orderIndex/nodeType/isLeaf 를 추가로 내려준다."""
    goal = _goal(is_ultimate=False, title="계획 목표")
    fake_goal_repo._items[goal.id] = goal
    n = GoalNode()
    n.id = uuid4()
    n.goal_id = goal.id
    n.parent_node_id = None
    n.title = "루트"
    n.node_type = "core"
    n.depth = 0
    n.order_index = 0
    n.is_leaf = False
    n.tree_kind = "plan"
    n.archived_at = None
    fake_goal_repo._nodes[goal.id] = [n]

    resp = client.get(f"/goals/goal_{goal.id}/nodes")

    assert resp.status_code == 200, resp.text
    node = resp.json()["nodes"][0]
    assert node["orderIndex"] == 0
    assert node["nodeType"] == "core"
    assert node["isLeaf"] is False
