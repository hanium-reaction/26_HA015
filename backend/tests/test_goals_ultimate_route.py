"""POST /goals/ultimate(U1) — 궁극목표 인터뷰 산출물 → Goal(active/parked) 확정 (PR5).

`materialize_ultimate_goal`/`resolve_outcome` 자체의 순수 로직은 `test_ultimate_adapter.py`
에서 이미 표로 검증한다. 여기서는 **HTTP 경계**(요청 파싱·에러 코드·응답 스키마)만 본다.
"""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from tests.conftest import DEMO_USER_UUID, FakeInterviewRepo

FULL_SLOT_ANSWERS = {
    "ultimate.statement": {"type": "text", "raw": "메이저리그 8구단 드래프트 1순위"},
    "ultimate.domain": {"type": "chip", "values": ["체력·컨디션"]},
    "ultimate.horizon": {"type": "chip", "values": ["5년"]},
    "ultimate.measure": {"type": "text", "raw": "드래프트 1라운드 지명"},
    "ultimate.success_image": {"type": "text", "raw": "구단 유니폼을 입고 첫 공을 던지는 순간"},
    "ultimate.identity": {"type": "text", "raw": "매일 훈련을 거르지 않는 프로 지망생"},
    "ultimate.current_position": {"type": "text", "raw": "고교 3학년, 지역 대회 4강"},
    "ultimate.pillars_hint": {"type": "text", "raw": "구위, 멘탈", "normalized": ["구위", "멘탈"]},
    "ultimate.constraints": {"type": "text", "raw": "부상 이력", "normalized": ["부상 이력"]},
}


async def _seed_finished_ultimate_session(
    repo: FakeInterviewRepo, *, user_id: UUID = DEMO_USER_UUID
) -> UUID:
    session_row = await repo.create_session(user_id, "gemini-3.5-flash-lite", kind="ultimate")
    for slot_key, value in FULL_SLOT_ANSWERS.items():
        await repo.upsert_slot_answer(session_row.id, slot_key, value, is_required=True)
    await repo.finalize(session_row, end_reason="completed", total_turns=9, ambiguity_final=0.1)
    return session_row.id


async def test_upsert_ultimate_creates_goal_from_finished_session(
    client: TestClient, fake_interview_repo: FakeInterviewRepo
) -> None:
    await _seed_finished_ultimate_session(fake_interview_repo)

    resp = client.post("/goals/ultimate", json={})

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "메이저리그 8구단 드래프트 1순위"
    assert body["goalTier"] == "parked"
    assert body["status"] == "active"
    assert body["goalId"].startswith("goal_")


async def test_upsert_ultimate_accepts_inline_outcome(client: TestClient) -> None:
    """FE 가 인터뷰 종료 턴의 `ultimateOutcome` 을 그대로 실어 보내면 세션 조회 없이 통과."""
    resp = client.post(
        "/goals/ultimate",
        json={
            "outcome": {
                "sessionId": "iv_inline",
                "generatedAt": "2026-08-20T10:00:00+09:00",
                "endReason": "completed",
                "ambiguityFinal": 0.1,
                "analysisSource": "llm",
                "statement": "인라인으로 보낸 목표",
                "domain": "역량",
                "horizonYears": 3,
                "measure": "판정 기준",
                "successImage": "성공 이미지",
                "identityNote": "정체성",
                "currentPosition": "현재 위치",
                "constraints": [],
                "values": [],
                "assets": None,
                "pillarsHint": [],
                "unresolvedSlots": [],
            }
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["title"] == "인라인으로 보낸 목표"


def test_upsert_ultimate_requires_finished_interview(client: TestClient) -> None:
    """완료된 궁극목표 인터뷰가 없으면 422 — 계획 인터뷰의 `_resolve_outcome` 과 같은 원칙."""
    resp = client.post("/goals/ultimate", json={})
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"


async def test_upsert_ultimate_ignores_plan_kind_session(
    client: TestClient, fake_interview_repo: FakeInterviewRepo
) -> None:
    """`kind='plan'` 세션만 있으면 궁극목표 인터뷰가 없는 것과 같이 422."""
    plan_row = await fake_interview_repo.create_session(
        DEMO_USER_UUID, "gemini-3.5-flash-lite", kind="plan"
    )
    await fake_interview_repo.finalize(
        plan_row, end_reason="completed", total_turns=5, ambiguity_final=0.1
    )

    resp = client.post("/goals/ultimate", json={})
    assert resp.status_code == 422, resp.text
