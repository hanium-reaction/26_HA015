"""Goals — 실 구현 (Issue #22, api-contract §6)."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import DEMO_USER_UUID, FakeGoalRepo


def _new_goal(client: TestClient, *, title: str = "캡스톤", tier: str = "focus") -> dict[str, Any]:
    resp = client.post(
        "/goals",
        json={
            "title": title,
            "category": "project",
            "goalTier": tier,
            "priorityLevel": 1,
        },
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()


def test_list_empty(client: TestClient) -> None:
    resp = client.get("/goals")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"focus": [], "maintain": [], "parked": []}


def test_create_goal(client: TestClient) -> None:
    body = _new_goal(client)
    assert body["title"] == "캡스톤"
    assert body["goalTier"] == "focus"
    assert body["goalId"].startswith("goal_")
    assert body["status"] == "active"


def test_create_rejects_bad_category(client: TestClient) -> None:
    resp = client.post(
        "/goals",
        json={
            "title": "x",
            "category": "bogus_cat",
            "goalTier": "focus",
            "priorityLevel": 1,
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"
    assert resp.json()["field"] == "category"


def test_create_rejects_bad_tier(client: TestClient) -> None:
    resp = client.post(
        "/goals",
        json={
            "title": "x",
            "category": "study",
            "goalTier": "bogus",
            "priorityLevel": 1,
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"


def test_focus_tier_limit_3(client: TestClient) -> None:
    """Focus 4번째 → 422 GOAL_TIER_LIMIT_EXCEEDED."""
    for i in range(3):
        _new_goal(client, title=f"g{i}", tier="focus")
    resp = client.post(
        "/goals",
        json={
            "title": "over",
            "category": "study",
            "goalTier": "focus",
            "priorityLevel": 1,
        },
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "GOAL_TIER_LIMIT_EXCEEDED"
    assert body["field"] == "goalTier"


def test_maintain_tier_limit_5(client: TestClient) -> None:
    for i in range(5):
        _new_goal(client, title=f"m{i}", tier="maintain")
    resp = client.post(
        "/goals",
        json={
            "title": "over",
            "category": "study",
            "goalTier": "maintain",
            "priorityLevel": 3,
        },
    )
    assert resp.status_code == 422
    assert resp.json()["code"] == "GOAL_TIER_LIMIT_EXCEEDED"


def test_parked_has_no_limit(client: TestClient) -> None:
    """Parked 자유 — 한도 X (DevBaseline §1.4)."""
    for i in range(10):
        _new_goal(client, title=f"p{i}", tier="parked")
    items = client.get("/goals").json()
    assert len(items["parked"]) == 10


def test_list_groups_by_tier(client: TestClient) -> None:
    _new_goal(client, title="f1", tier="focus")
    _new_goal(client, title="m1", tier="maintain")
    _new_goal(client, title="p1", tier="parked")
    body = client.get("/goals").json()
    assert len(body["focus"]) == 1
    assert len(body["maintain"]) == 1
    assert len(body["parked"]) == 1


def test_update_title(client: TestClient) -> None:
    created = _new_goal(client)
    resp = client.patch(f"/goals/{created['goalId']}", json={"title": "수정"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "수정"


def test_update_tier_focus_to_parked(client: TestClient) -> None:
    created = _new_goal(client, tier="focus")
    resp = client.patch(f"/goals/{created['goalId']}", json={"goalTier": "parked"})
    assert resp.status_code == 200
    assert resp.json()["goalTier"] == "parked"


def test_update_tier_rejects_over_limit(client: TestClient) -> None:
    """Focus 3 + Maintain 1 → Maintain 을 Focus 로 변경 시도 → 422."""
    for i in range(3):
        _new_goal(client, title=f"f{i}", tier="focus")
    target = _new_goal(client, title="m", tier="maintain")
    resp = client.patch(f"/goals/{target['goalId']}", json={"goalTier": "focus"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "GOAL_TIER_LIMIT_EXCEEDED"


def test_update_goal_not_found(client: TestClient) -> None:
    resp = client.patch(
        "/goals/goal_99999999-9999-4999-8999-999999999999",
        json={"title": "x"},
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "GOAL_NOT_FOUND"


def test_update_bad_id_format(client: TestClient) -> None:
    resp = client.patch("/goals/nonexistent", json={"title": "x"})
    assert resp.status_code == 404


def test_update_bad_deadline_format(client: TestClient) -> None:
    created = _new_goal(client)
    resp = client.patch(f"/goals/{created['goalId']}", json={"deadline": "not-a-date"})
    assert resp.status_code == 422
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"


def test_decompose_returns_stub(client: TestClient) -> None:
    """본 PR 은 mock 룰 stub — LLM 통합은 후속 PR."""
    created = _new_goal(client)
    resp = client.post(f"/goals/{created['goalId']}/decompose")
    assert resp.status_code == 200
    body = resp.json()
    assert body["goalId"] == created["goalId"]
    assert body["nodes"]
    assert body["rootNodeId"]


def test_park_focus_to_parked(client: TestClient) -> None:
    created = _new_goal(client, tier="focus")
    resp = client.post(f"/goals/{created['goalId']}/park")
    assert resp.status_code == 200
    assert resp.json()["goalTier"] == "parked"


def test_park_not_found(client: TestClient) -> None:
    resp = client.post("/goals/goal_99999999-9999-4999-8999-999999999999/park")
    assert resp.status_code == 404


def test_delete_goal(client: TestClient) -> None:
    created = _new_goal(client)
    resp = client.delete(f"/goals/{created['goalId']}")
    assert resp.status_code == 204
    body = client.get("/goals").json()
    assert body == {"focus": [], "maintain": [], "parked": []}


def test_proposed_goals_do_not_consume_tier_limit(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """잠정(proposed) 목표는 Focus 한도를 잡아먹지 않는다.

    한도는 '동시에 몇 개를 하기로 약속했는가' 다. 인터뷰가 뽑았을 뿐 계획을 승인하지 않은
    목표는 아직 약속이 아니다. 세면 인터뷰만 하고 나간 사용자가 목표를 새로 만들 수 없는데
    이유도 안 보인다(잠정 목표는 화면에 '계획 전' 으로만 뜬다).
    """
    # Focus 2개는 진짜(active), 1개는 잠정 — 한도(3) 기준으로는 2개만 센다.
    _new_goal(client, title="진짜1", tier="focus")
    _new_goal(client, title="진짜2", tier="focus")
    proposed = await_create_proposed(fake_goal_repo, tier="focus")

    resp = client.post(
        "/goals",
        json={"title": "세번째 진짜", "category": "study", "goalTier": "focus", "priorityLevel": 1},
    )
    assert resp.status_code == 201, resp.json()  # 잠정을 셌다면 여기서 422 였다

    # 네 번째는 진짜가 3개가 됐으므로 막힌다 — 한도 자체는 그대로 동작.
    over = client.post(
        "/goals",
        json={"title": "네번째", "category": "study", "goalTier": "focus", "priorityLevel": 1},
    )
    assert over.status_code == 422
    assert over.json()["code"] == "GOAL_TIER_LIMIT_EXCEEDED"
    assert proposed.status == "proposed"  # 잠정 목표는 그대로 남아 있다


def await_create_proposed(repo: FakeGoalRepo, *, tier: str) -> Any:
    """fake repo 에 잠정 목표를 직접 주입 (인터뷰 완료가 만든 상태를 재현)."""
    from uuid import uuid4

    from reaction_backend.db.models.goal import Goal

    g = Goal()
    g.id = uuid4()
    g.user_id = DEMO_USER_UUID
    g.title = "인터뷰가 뽑은 목표"
    g.category = "study"
    g.goal_tier = tier
    g.priority_level = 3
    g.deadline = None
    g.estimated_minutes = None
    g.status = "proposed"
    g.archived_at = None
    repo._items[g.id] = g
    return g
