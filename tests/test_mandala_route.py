"""만다라트 생성 파이프라인 route (U2~U6, PR5) — HTTP 경계 검증.

`aiClient.run` 만 stub 한다(ADR-0005 §7.3 패턴, `test_planning_route.py` 와 동일) —
결정적 후보정(`mandala_adapter.shape_*`)·영속화(`persist_mandala`)는 실 코드 그대로 태운다.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient

from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.llm_run import LlmRun
from reaction_backend.llm import RunResult, aiClient
from reaction_backend.schemas.common import now_kst
from reaction_backend.schemas.mandala import (
    MandalaCellItem,
    MandalaCellPlan,
    MandalaSubgoalItem,
    MandalaSubgoalPlan,
)
from tests.conftest import DEMO_USER_UUID, FakeGoalRepo, FakeInterviewRepo, FakePlanDraftRepo
from tests.test_goals_ultimate_route import _seed_finished_ultimate_session


def _seed_ultimate_goal(
    repo: FakeGoalRepo, *, user_id: Any = DEMO_USER_UUID, title: str = "궁극목표"
) -> Goal:
    g = Goal()
    g.id = uuid4()
    g.user_id = user_id
    g.title = title
    g.category = "other"
    g.goal_tier = "parked"
    g.status = "active"
    g.is_ultimate = True
    g.archived_at = None
    g.why_now = "이룬 날의 장면"
    repo._items[g.id] = g
    return g


def _stub_mandala(*, fell_back: bool = False) -> Any:
    """`planning/mandala_subgoals` · `planning/mandala_cells` · `_cells_branch` 공용 stub."""

    async def stub_run(**kwargs: Any) -> RunResult[Any]:
        schema = kwargs["schema"]
        if schema is MandalaSubgoalPlan:
            value: Any = MandalaSubgoalPlan(
                subgoals=[MandalaSubgoalItem(title=f"축{i}") for i in range(8)]
            )
        elif schema is MandalaCellPlan:
            if kwargs["prompt_id"] == "planning/mandala_cells":
                value = MandalaCellPlan(
                    cells=[
                        MandalaCellItem(subgoal_index=i, title=f"축{i}셀{j}")
                        for i in range(8)
                        for j in range(8)
                    ]
                )
            else:  # planning/mandala_cells_branch
                idx = int(kwargs["variables"]["subgoal_index"])
                value = MandalaCellPlan(
                    cells=[MandalaCellItem(subgoal_index=idx, title=f"새셀{j}") for j in range(8)]
                )
        else:  # pragma: no cover - 방어
            raise AssertionError(f"unexpected schema {schema}")
        return RunResult(
            value=value,
            fell_back=fell_back,
            reason=None,
            prompt_id=kwargs["prompt_id"],
            prompt_version="v1",
        )

    return stub_run


async def _prepare(
    fake_goal_repo: FakeGoalRepo, fake_interview_repo: FakeInterviewRepo, *, title: str = "궁극목표"
) -> str:
    """만다라 endpoint 가 전제하는 상태(궁극목표 goal + 완료된 kind=ultimate 인터뷰)를 세팅."""
    goal = _seed_ultimate_goal(fake_goal_repo, title=title)
    await _seed_finished_ultimate_session(fake_interview_repo)
    return f"goal_{goal.id}"


async def test_generate_subgoals_returns_eight_axes(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    monkeypatch.setattr(aiClient, "run", _stub_mandala())

    resp = client.post("/plans/mandala/subgoals", json={"goalId": goal_id})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["isDraft"] is True
    assert body["aiSource"] == "llm"
    assert body["goalId"] == goal_id
    assert len(body["subgoals"]) == 8
    assert {s["orderIndex"] for s in body["subgoals"]} == set(range(8))


def test_generate_subgoals_unknown_goal_returns_404(client: TestClient) -> None:
    resp = client.post("/plans/mandala/subgoals", json={"goalId": f"goal_{uuid4()}"})
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "GOAL_NOT_FOUND"


def test_generate_subgoals_rejects_non_ultimate_goal(
    client: TestClient, fake_goal_repo: FakeGoalRepo
) -> None:
    """`is_ultimate=False` 인 일반 목표를 만다라 대상으로 못 쓴다."""
    g = Goal()
    g.id = uuid4()
    g.user_id = DEMO_USER_UUID
    g.title = "그냥 학기 목표"
    g.category = "study"
    g.goal_tier = "focus"
    g.status = "active"
    g.is_ultimate = False
    g.archived_at = None
    fake_goal_repo._items[g.id] = g

    resp = client.post("/plans/mandala/subgoals", json={"goalId": f"goal_{g.id}"})
    assert resp.status_code == 404, resp.text


async def test_generate_mandala_draft_persists_plan_draft(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    monkeypatch.setattr(aiClient, "run", _stub_mandala())

    subgoals = client.post("/plans/mandala/subgoals", json={"goalId": goal_id}).json()["subgoals"]
    resp = client.post("/plans/mandala/generate", json={"goalId": goal_id, "subgoals": subgoals})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["isDraft"] is True
    assert body["goalId"] == goal_id
    assert len(body["subgoals"]) == 8
    assert len(body["cells"]) == 64  # stub 이 축마다 8개씩 꽉 채움
    assert body["gaps"] == []
    assert body["planId"]


async def test_get_mandala_draft_returns_snapshot(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    monkeypatch.setattr(aiClient, "run", _stub_mandala())
    subgoals = client.post("/plans/mandala/subgoals", json={"goalId": goal_id}).json()["subgoals"]
    plan_id = client.post(
        "/plans/mandala/generate", json={"goalId": goal_id, "subgoals": subgoals}
    ).json()["planId"]

    resp = client.get(f"/plans/mandala/{plan_id}")

    assert resp.status_code == 200, resp.text
    assert resp.json()["planId"] == plan_id


async def test_get_mandala_draft_rejects_first_plan_kind(
    client: TestClient, fake_plan_draft_repo: FakePlanDraftRepo
) -> None:
    """First Plan draft id 를 만다라 조회에 넣으면 404 — kind 불일치."""
    draft = await fake_plan_draft_repo.create(
        DEMO_USER_UUID,
        target_date=now_kst().date(),
        horizon=None,
        ai_source="llm",
        payload={"outcome": {}, "goal_nodes": [], "action_items": [], "blocks": []},
        expires_at=now_kst() + timedelta(hours=72),
    )

    resp = client.get(f"/plans/mandala/{draft.id}")

    assert resp.status_code == 404, resp.text


async def test_regenerate_branch_replaces_target_axis_and_keeps_locked_cell(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    monkeypatch.setattr(aiClient, "run", _stub_mandala())
    subgoals = client.post("/plans/mandala/subgoals", json={"goalId": goal_id}).json()["subgoals"]
    draft = client.post(
        "/plans/mandala/generate", json={"goalId": goal_id, "subgoals": subgoals}
    ).json()
    plan_id = draft["planId"]

    # 축0 의 첫 셀을 사용자가 직접 편집했다고 가정(source='user') — 재생성에서도 보존돼야 한다.
    edited_cells = list(draft["cells"])
    edited_cells[0] = {**edited_cells[0], "title": "내가 직접 쓴 셀", "source": "user"}

    resp = client.post(
        f"/plans/mandala/{plan_id}/regenerate-branch",
        json={
            "subgoalIndex": 0,
            "userHint": "더 구체적으로",
            "editedSubgoals": subgoals,
            "editedCells": edited_cells,
        },
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    axis0 = [c for c in body["cells"] if c["subgoalIndex"] == 0]
    assert any(c["title"] == "내가 직접 쓴 셀" and c["source"] == "user" for c in axis0)
    # 다른 축(1~7)은 그대로 유지된다.
    axis1 = [c for c in body["cells"] if c["subgoalIndex"] == 1]
    assert len(axis1) == 8


async def test_approve_mandala_draft_persists_goal_nodes(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    monkeypatch.setattr(aiClient, "run", _stub_mandala())
    subgoals = client.post("/plans/mandala/subgoals", json={"goalId": goal_id}).json()["subgoals"]
    draft = client.post(
        "/plans/mandala/generate", json={"goalId": goal_id, "subgoals": subgoals}
    ).json()
    plan_id = draft["planId"]

    resp = client.post(
        f"/plans/mandala/{plan_id}/approve",
        json={"centerWhyText": "왜냐면", "subgoals": subgoals, "cells": draft["cells"]},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["isDraft"] is False
    assert body["goalId"] == goal_id
    assert body["rootNodeId"].startswith("node_")
    assert body["activated"] == 1 + 8 + 64
    assert body["skipped"] == 0


async def test_approve_mandala_draft_is_idempotent(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    monkeypatch.setattr(aiClient, "run", _stub_mandala())
    subgoals = client.post("/plans/mandala/subgoals", json={"goalId": goal_id}).json()["subgoals"]
    draft = client.post(
        "/plans/mandala/generate", json={"goalId": goal_id, "subgoals": subgoals}
    ).json()
    plan_id = draft["planId"]
    body = {"centerWhyText": None, "subgoals": subgoals, "cells": draft["cells"]}

    first = client.post(f"/plans/mandala/{plan_id}/approve", json=body)
    second = client.post(f"/plans/mandala/{plan_id}/approve", json=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["rootNodeId"] == second.json()["rootNodeId"]
    assert second.json()["activated"] == first.json()["activated"]


async def test_generate_subgoals_commits_the_llm_run_row(
    client: TestClient,
    monkeypatch: Any,
    fake_goal_repo: FakeGoalRepo,
    fake_interview_repo: FakeInterviewRepo,
) -> None:
    """Stage A(U2) 도 `llm_runs` 를 **커밋**한다 — `/plans/milestones` 와 같은 계측 구멍.

    이 라우터의 독스트링은 "DB 쓰기 0" 이라고 적혀 있었는데, LLM 을 부르면 `llm_runs` 1행이
    딸려 온다. 커밋하지 않으면 요청 종료와 함께 롤백돼 토큰 예산·엔드포인트 호출 상한·
    원가 리포트가 이 호출을 못 본다.
    """
    from tests.test_planning_route import (
        _CapturingSession,
        _force_provider_timeout,
        _use_session,
    )

    goal_id = await _prepare(fake_goal_repo, fake_interview_repo)
    _force_provider_timeout(monkeypatch)
    cap = _CapturingSession()
    _use_session(client, cap)

    resp = client.post("/plans/mandala/subgoals", json={"goalId": goal_id})
    assert resp.status_code == 200, resp.text

    runs = [o for o in cap.added if isinstance(o, LlmRun)]
    assert [r.prompt_id for r in runs] == ["planning/mandala_subgoals"]
    assert cap.committed, "llm_runs 행을 add 만 하고 커밋하지 않으면 요청 끝에 롤백된다"
