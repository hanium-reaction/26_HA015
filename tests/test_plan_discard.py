"""POST /plans/{plan_id}/discard — "이 계획 말고 다시 인터뷰할래" 경로.

초안을 버릴 방법이 없어 사용자가 **새로고침으로 화면을 끊었고**, 그러면 초안이 만료(3일)까지
승인 대기로 남았다. 초안은 애초에 비영속(계획 블록은 승인 전 DB 에 들어가지 않는다)이라
상태 전이만 하면 된다.

`test_planning_route.py` 가 아니라 별도 파일인 이유: 그쪽은 계획 생성·승인 스택(PR #164 계열)이
계속 덧붙이는 파일이라, 같은 파일 끝에 테스트를 쌓으면 두 PR 이 매번 append-vs-append 로
충돌한다(실측). 픽스처는 그대로 재사용한다.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from tests.conftest import FakePlanDraftRepo
from tests.test_planning_route import _block, _seed_draft


def test_discard_marks_draft_terminal(
    client: TestClient, fake_plan_draft_repo: FakePlanDraftRepo
) -> None:
    """폐기하면 종착 상태가 되고, 이후 승인 대상에서 빠진다."""
    plan_id = _seed_draft(fake_plan_draft_repo, blocks=[_block(10)])

    res = client.post(f"/plans/{plan_id}/discard")
    assert res.status_code == 204

    draft = fake_plan_draft_repo._items[UUID(str(plan_id))]
    assert draft.status == "expired"
    # 승인 시도는 더 이상 통하지 않는다(만료와 같은 취급).
    assert client.post(f"/plans/{plan_id}/approve").status_code == 410


def test_discard_is_idempotent(client: TestClient, fake_plan_draft_repo: FakePlanDraftRepo) -> None:
    """두 번 눌러도(더블클릭·재시도) 204 — 되돌릴 상태가 없어 멱등하다."""
    plan_id = _seed_draft(fake_plan_draft_repo, blocks=[_block(10)])
    assert client.post(f"/plans/{plan_id}/discard").status_code == 204
    assert client.post(f"/plans/{plan_id}/discard").status_code == 204


def test_discard_rejects_approved_plan(
    client: TestClient, fake_plan_draft_repo: FakePlanDraftRepo
) -> None:
    """이미 승인된 계획은 폐기 대상이 아니다 — 승인은 되돌리는 동작이 아니라 409."""
    plan_id = _seed_draft(fake_plan_draft_repo, blocks=[_block(10)], status="approved")
    res = client.post(f"/plans/{plan_id}/discard")
    assert res.status_code == 409
    assert res.json()["code"] == "PLAN_ALREADY_APPROVED"


def test_discard_missing_plan_is_404(client: TestClient) -> None:
    """존재하지 않는 초안 → 404.

    **형식이 올바른 UUID** 를 쓴다. 잘못된 형식(예: `plan_` 접두사)을 넣으면 라우터가 파싱
    단계에서 404 를 내므로, '없는 초안' 이 아니라 '못 읽는 id' 를 검증하게 된다(실측으로 발견).
    """
    assert client.post(f"/plans/{uuid4()}/discard").status_code == 404


def test_discard_rejects_other_users_draft(
    client: TestClient, fake_plan_draft_repo: FakePlanDraftRepo
) -> None:
    """남의 초안은 404 — 존재 여부조차 흘리지 않는다(403 이 아니라 404)."""
    plan_id = _seed_draft(fake_plan_draft_repo, blocks=[_block(10)])
    fake_plan_draft_repo._items[UUID(str(plan_id))].user_id = uuid4()  # 소유자 바꿔치기
    assert client.post(f"/plans/{plan_id}/discard").status_code == 404
