"""인박스 추천 자료 — 삽입 트리거 / 자료 라우트 / 승격 차단 (BE #171 3~5단계).

이 테스트가 지키는 핵심은 "라우트가 200 을 준다" 가 아니라 **자료가 사용자 화면에
실제로 도달하는가** 다. 조용히 실패하는 경로가 세 겹이라 하나씩 못 박는다:

- 삽입은 savepoint 안에서 예외를 삼킨다 → 훅이 통째로 죽어도 목표 생성은 201 이다.
  그래서 **인박스에 실제로 항목이 생겼는지**를 봐야 한다.
- `status` 를 명시 안 하면 `captured` 로 저장되는데 FE 는 그 탭을 지웠다(#129)
  → DB 엔 있는데 어느 탭에도 안 뜬다.
- `ai_category_guess` 가 비면 `restore()` 가 `captured` 로 되돌린다
  → 보관했다 복원하면 자료가 영영 사라진다.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from reaction_backend.api.routes.inbox import _today_kst
from reaction_backend.content import registry
from reaction_backend.content.registry import ContentNotFound
from reaction_backend.db.models.goal import GOAL_CATEGORY_VALUES
from reaction_backend.db.models.inbox_item import INBOX_CATEGORY_VALUES, INBOX_SOURCE_VALUES
from reaction_backend.orchestrator.inbox_resources import GOAL_TO_INBOX_CATEGORY

# 자료가 있는 카테고리 / 없는 카테고리 (content/health 에만 자료가 있다).
_CATEGORY_WITH_CONTENT = "health"
_CATEGORY_WITHOUT_CONTENT = "study"


def _create_goal(client: TestClient, *, category: str = _CATEGORY_WITH_CONTENT) -> dict[str, Any]:
    resp = client.post(
        "/goals",
        json={
            "title": "주 3회 달리기",
            "category": category,
            "goalTier": "maintain",
            "priorityLevel": 3,
        },
    )
    assert resp.status_code == 201, resp.json()
    return resp.json()


def _system_items(client: TestClient) -> list[dict[str, Any]]:
    resp = client.get("/inbox")
    assert resp.status_code == 200, resp.json()
    return [i for i in resp.json() if i["source"] == "system"]


# ── 3단계: 삽입 트리거 ──────────────────────────────────────


def test_creating_a_goal_inserts_the_resource(client: TestClient) -> None:
    """목표를 세우면 그 카테고리 자료가 인박스에 들어온다 — 이 기능의 전부."""
    _create_goal(client)

    items = _system_items(client)
    assert len(items) == 1, f"자료가 안 들어왔다: {items}"
    item = items[0]
    assert item["resourceSlug"] in {d.slug for d in registry.list_by_category("health")}
    assert item["rawText"], "카드에 보일 요약이 비었다"


def test_inserted_resource_is_visible_in_the_todo_tab(client: TestClient) -> None:
    """`status='classified'` 를 명시하지 않으면 `captured` 로 저장돼 어느 탭에도 안 뜬다.

    FE 는 #129 에서 captured 탭을 제거했다(할 일/처리됨/보관 3개).
    """
    _create_goal(client)

    resp = client.get("/inbox", params={"status": "classified"})
    assert resp.status_code == 200
    assert [i for i in resp.json() if i["source"] == "system"], "할 일 탭에서 자료가 안 보인다"


def test_inserted_resource_keeps_its_category(client: TestClient) -> None:
    """`ai_category_guess` 가 비면 복원 시 `captured` 로 떨어져 자료가 사라진다."""
    _create_goal(client)
    assert _system_items(client)[0]["aiCategoryGuess"] == "health"


def test_archived_resource_survives_restore(client: TestClient) -> None:
    """보관 → 복원 후에도 자료가 '할 일' 탭으로 돌아온다 (FE DoD 항목)."""
    _create_goal(client)
    inbox_id = _system_items(client)[0]["inboxId"]

    assert client.post(f"/inbox/{inbox_id}/archive").status_code == 204
    restored = client.post(f"/inbox/{inbox_id}/restore")
    assert restored.status_code == 200, restored.json()
    assert restored.json()["status"] == "classified", "복원했는데 어느 탭에도 안 뜨는 상태다"


def test_second_goal_does_not_duplicate_the_resource(client: TestClient) -> None:
    """같은 카테고리 목표를 또 만들어도 자료는 하나뿐이다."""
    _create_goal(client)
    _create_goal(client)
    assert len(_system_items(client)) == 1


def test_archived_resource_is_not_reinserted(client: TestClient) -> None:
    """보관은 '이 자료 안 볼래' 라는 의사표시 — 목표를 또 만들어도 되살리지 않는다."""
    _create_goal(client)
    inbox_id = _system_items(client)[0]["inboxId"]
    assert client.post(f"/inbox/{inbox_id}/archive").status_code == 204

    _create_goal(client)

    active = _system_items(client)
    assert active == [], f"보관한 자료가 되살아났다: {active}"
    archived = client.get("/inbox", params={"status": "archived"}).json()
    assert len([i for i in archived if i["source"] == "system"]) == 1


def test_category_without_content_inserts_nothing(client: TestClient) -> None:
    """자료 없는 카테고리는 아무 일도 일어나지 않는다 — 목표는 정상 생성."""
    goal = _create_goal(client, category=_CATEGORY_WITHOUT_CONTENT)
    assert goal["category"] == _CATEGORY_WITHOUT_CONTENT
    assert _system_items(client) == []


def test_goal_is_created_even_when_resource_insert_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """자료 삽입은 best-effort — 터져도 목표 생성은 성공해야 한다."""

    def _boom(category: str) -> list[Any]:
        raise RuntimeError("content registry down")

    monkeypatch.setattr(registry, "list_by_category", _boom)

    goal = _create_goal(client)
    assert goal["goalId"].startswith("goal_")
    assert _system_items(client) == []


def test_converting_inbox_item_to_goal_also_inserts(client: TestClient) -> None:
    """`convert-to-goal` 도 목표를 만드는 경로라 자료가 붙는다."""
    captured = client.post("/inbox", json={"rawText": "운동 매일 30분"})
    assert captured.status_code == 201, captured.json()
    inbox_id = captured.json()["inboxId"]

    resp = client.post(f"/inbox/{inbox_id}/convert-to-goal")
    assert resp.status_code == 200, resp.json()
    assert len(_system_items(client)) == 1


# ── 카테고리 매핑 ──────────────────────────────────────────


def test_goal_to_inbox_category_is_total() -> None:
    """goal 9종 전부가 키여야 한다 — 빠지면 그 카테고리 자료의 category 가 비어 버린다."""
    assert set(GOAL_TO_INBOX_CATEGORY) == set(GOAL_CATEGORY_VALUES)


def test_goal_to_inbox_category_maps_into_the_inbox_enum() -> None:
    """inbox 는 6종뿐 — 초과 3종을 그대로 쓰면 DB enum 이 거절한다."""
    assert set(GOAL_TO_INBOX_CATEGORY.values()) <= set(INBOX_CATEGORY_VALUES)
    for extra in ("career", "relationship", "self_dev"):
        assert GOAL_TO_INBOX_CATEGORY[extra] == "other"
    for shared in ("study", "project", "health", "routine", "schedule", "other"):
        assert GOAL_TO_INBOX_CATEGORY[shared] == shared


def test_inbox_source_enum_values() -> None:
    assert INBOX_SOURCE_VALUES == ("user", "system")


# ── 4단계: 자료 라우트 ─────────────────────────────────────


def test_get_resource_returns_the_document(client: TestClient) -> None:
    doc = registry.list_by_category("health")[0]
    resp = client.get(f"/inbox/resources/{doc.slug}")
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body == {
        "slug": doc.slug,
        "title": doc.title,
        "markdown": doc.body,
        "steps": list(doc.steps),
    }


def test_get_resource_body_has_no_frontmatter(client: TestClient) -> None:
    """머리말이 실리면 FE 가 setext heading 으로 파싱해 화면이 깨진다."""
    doc = registry.list_by_category("health")[0]
    markdown = client.get(f"/inbox/resources/{doc.slug}").json()["markdown"]
    assert not markdown.lstrip().startswith("---")
    assert "slug:" not in markdown
    assert markdown.lstrip().splitlines()[0] == f"# {doc.title}"


def test_get_resource_does_not_leak_server_paths(client: TestClient) -> None:
    """`ContentDoc` 을 그대로 반환하면 서버 절대경로(`path`)가 응답에 실린다."""
    doc = registry.list_by_category("health")[0]
    body = client.get(f"/inbox/resources/{doc.slug}").json()
    assert set(body) == {"slug", "title", "markdown", "steps"}
    assert "path" not in body


@pytest.mark.parametrize(
    "slug",
    ["no-such-doc", "..%2F..%2Fetc%2Fpasswd", "exercise-plan-that-bends.md", "HEALTH"],
)
def test_get_resource_unknown_slug_is_404(client: TestClient, slug: str) -> None:
    """`ContentNotFound` 는 KeyError 상속이라 그대로 새면 404 가 아니라 500 이 된다."""
    resp = client.get(f"/inbox/resources/{slug}")
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "COMMON_NOT_FOUND"


def test_user_captured_items_report_user_source(client: TestClient) -> None:
    """사용자 캡처는 source=user, resourceSlug=null — FE 가 이걸로 카드를 가른다."""
    body = client.post("/inbox", json={"rawText": "장 보기"}).json()
    assert body["source"] == "user"
    assert body["resourceSlug"] is None


# ── 5단계: 승격 차단 ───────────────────────────────────────


@pytest.mark.parametrize("action", ["convert-to-goal", "convert-to-action"])
def test_system_item_cannot_be_promoted(client: TestClient, action: str) -> None:
    """자료를 목표·할 일로 승격하는 건 무의미하고, 자료→목표→자료 재귀가 생긴다.

    FE 는 버튼을 숨기지만 직접 호출은 서버가 막아야 한다.
    """
    _create_goal(client)
    inbox_id = _system_items(client)[0]["inboxId"]

    resp = client.post(f"/inbox/{inbox_id}/{action}")
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"
    assert resp.json()["field"] == "inboxId"


@pytest.mark.parametrize("action", ["convert-to-goal", "convert-to-action"])
def test_user_item_can_still_be_promoted(client: TestClient, action: str) -> None:
    """가드가 사용자 항목까지 막으면 안 된다 (가드가 과하게 넓은지 확인)."""
    inbox_id = client.post("/inbox", json={"rawText": "토익 공부 시작"}).json()["inboxId"]
    resp = client.post(f"/inbox/{inbox_id}/{action}")
    assert resp.status_code == 200, resp.text


# ── best-effort 구조 ───────────────────────────────────────
#
# savepoint 를 빼도 라우트 테스트는 전부 초록이다 — conftest 의 `_FakeSession.begin_nested()`
# 가 no-op 이라 실 PostgreSQL 의 "INSERT 실패 → 트랜잭션 abort" 의미론이 재현되지 않기
# 때문이다(뮤테이션으로 실증). 실 DB 에서 savepoint 없이 예외만 삼키면 뒤따르는 commit
# 까지 같이 죽어 best-effort 의 정반대가 되므로, **savepoint 진입 자체**를 여기서 고정한다.


class _Nested:
    def __init__(self, owner: _SavepointSession) -> None:
        self._owner = owner

    async def __aenter__(self) -> _Nested:
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False


class _SavepointSession:
    def __init__(self) -> None:
        self.savepoints = 0

    def begin_nested(self) -> _Nested:
        self.savepoints += 1
        return _Nested(self)


class _StubRepo:
    def __init__(self, *, fail: bool = False) -> None:
        self.created: list[str] = []
        self._fail = fail

    async def has_resource(self, user_id: Any, resource_slug: str) -> bool:
        return False

    async def create(self, **kwargs: Any) -> Any:
        if self._fail:
            raise RuntimeError("insert exploded")
        self.created.append(kwargs["resource_slug"])
        return object()


async def test_best_effort_wraps_the_insert_in_a_savepoint() -> None:
    """savepoint 없이 예외만 삼키면 실 DB 에서 뒤따르는 commit 이 같이 죽는다."""
    from reaction_backend.orchestrator import inbox_resources

    session = _SavepointSession()
    repo = _StubRepo()
    inserted = await inbox_resources.ensure_resources_best_effort(
        session,  # type: ignore[arg-type]
        repo,  # type: ignore[arg-type]
        user_id=uuid4(),
        goal_categories=["health"],
    )
    assert session.savepoints == 1, "savepoint 를 열지 않았다"
    assert inserted == repo.created != []


async def test_best_effort_swallows_insert_failure() -> None:
    """삽입이 터져도 호출자(목표 생성)에게 예외가 새어 나가면 안 된다."""
    from reaction_backend.orchestrator import inbox_resources

    session = _SavepointSession()
    inserted = await inbox_resources.ensure_resources_best_effort(
        session,  # type: ignore[arg-type]
        _StubRepo(fail=True),  # type: ignore[arg-type]
        user_id=uuid4(),
        goal_categories=["health"],
    )
    assert inserted == []
    assert session.savepoints == 1


# ── 자료의 '한 걸음' 채택 (#171 후속) ──────────────────────
#
# 자료가 읽고 끝나는 막다른 길이 되지 않게 하는 유일한 출구다. 여기서 만든 ActionItem 은
# 평범한 `source='inbox'` 카드라, 그 뒤 체크인 → 21시 회고 → 실패 사유 → 회복 카드는
# **기존 루프가 그대로** 처리한다 — 회복 로직을 새로 만들지 않는다(AGENTS §1).


def _adopt(client: TestClient, inbox_id: str, index: int = 0) -> Any:
    return client.post(f"/inbox/{inbox_id}/adopt-step", json={"stepIndex": index})


def test_resource_detail_exposes_steps(client: TestClient) -> None:
    """FE 가 고를 수 있게 자료 상세에 steps 가 실린다."""
    doc = registry.list_by_category("health")[0]
    body = client.get(f"/inbox/resources/{doc.slug}").json()
    assert body["steps"] == list(doc.steps)
    assert body["steps"], "steps 가 비면 사용자가 고를 게 없다"


def test_adopting_a_step_creates_todays_action(client: TestClient) -> None:
    """이 기능의 전부 — 자료의 한 걸음이 오늘 할 일이 된다."""
    _create_goal(client)
    item = _system_items(client)[0]
    doc = registry.get(item["resourceSlug"])

    resp = _adopt(client, item["inboxId"], 0)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["actionId"].startswith("action_")
    assert body["title"] == doc.steps[0]
    assert body["resourceSlug"] == doc.slug
    assert body["targetDate"] == _today_kst().date().isoformat()


def test_adopted_action_is_linked_back_to_the_resource(
    client: TestClient, fake_action_item_repo: Any
) -> None:
    """`source='inbox'` + `inbox_item_id` — 회복이 나중에 자료 맥락을 찾을 수 있는 유일한 끈."""
    _create_goal(client)
    item = _system_items(client)[0]
    assert _adopt(client, item["inboxId"], 0).status_code == 200

    created = [a for a in fake_action_item_repo._items.values() if a.source == "inbox"]
    assert len(created) == 1, f"inbox 유래 카드가 {len(created)}건"
    assert str(created[0].inbox_item_id) == item["inboxId"].removeprefix("inbox_")


def test_adopting_does_not_promote_the_resource(client: TestClient) -> None:
    """자료를 승격한 게 아니라 한 걸음을 가져온 것 — 자료는 인박스에 그대로 남는다."""
    _create_goal(client)
    item = _system_items(client)[0]
    assert _adopt(client, item["inboxId"], 0).status_code == 200

    still = _system_items(client)
    assert len(still) == 1, "자료가 인박스에서 사라졌다"
    assert still[0]["status"] == "classified"
    assert still[0]["promotedTo"] is None


def test_multiple_steps_can_be_adopted(client: TestClient) -> None:
    """다른 걸음을 또 채택할 수 있어야 한다(자료는 한 번 쓰고 버리는 게 아니다)."""
    _create_goal(client)
    item = _system_items(client)[0]
    doc = registry.get(item["resourceSlug"])
    assert len(doc.steps) >= 2, "이 검사가 공허해진다"

    first = _adopt(client, item["inboxId"], 0)
    second = _adopt(client, item["inboxId"], 1)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["title"] != second.json()["title"]


def test_adopting_from_a_user_item_is_rejected(client: TestClient) -> None:
    """사용자 캡처 항목에는 steps 가 없다 — 조용히 아무 카드나 만들면 안 된다."""
    inbox_id = client.post("/inbox", json={"rawText": "장 보기"}).json()["inboxId"]
    resp = _adopt(client, inbox_id, 0)
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "COMMON_VALIDATION_ERROR"
    assert resp.json()["field"] == "inboxId"


@pytest.mark.parametrize("index", [3, 99])
def test_adopting_an_out_of_range_step_is_rejected(client: TestClient, index: int) -> None:
    _create_goal(client)
    item = _system_items(client)[0]
    doc = registry.get(item["resourceSlug"])
    assert index >= len(doc.steps), "경계 밖이 아니면 검사가 공허하다"

    resp = _adopt(client, item["inboxId"], index)
    assert resp.status_code == 422, resp.text
    assert resp.json()["field"] == "stepIndex"


def test_adopting_a_negative_step_is_rejected(client: TestClient) -> None:
    """음수는 파이썬 인덱싱으로 뒤에서 세어 엉뚱한 걸음이 채택된다 — 스키마가 막아야 한다."""
    _create_goal(client)
    item = _system_items(client)[0]
    assert _adopt(client, item["inboxId"], -1).status_code == 422


def test_adopting_when_the_resource_file_is_gone_is_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """자료 파일이 레포에서 빠지면 항목은 남아도 가리킬 곳이 없다."""
    _create_goal(client)
    item = _system_items(client)[0]

    def _gone(slug: str) -> Any:
        raise ContentNotFound(slug)

    monkeypatch.setattr(registry, "get", _gone)
    resp = _adopt(client, item["inboxId"], 0)
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "COMMON_NOT_FOUND"


def test_adopting_from_a_missing_item_is_404(client: TestClient) -> None:
    resp = _adopt(client, "inbox_00000000-0000-0000-0000-000000000000", 0)
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "INBOX_NOT_FOUND"


def test_promotion_guard_still_blocks_the_resource_itself(client: TestClient) -> None:
    """한 걸음 채택을 열었다고 자료 자체의 승격까지 열린 건 아니다."""
    _create_goal(client)
    inbox_id = _system_items(client)[0]["inboxId"]
    for action in ("convert-to-goal", "convert-to-action"):
        assert client.post(f"/inbox/{inbox_id}/{action}").status_code == 422


# ── 채택이 실제로 '오늘 카드' 에 도달하는가 ────────────────
#
# 아래 단언들이 없으면 라우트가 **자기가 방금 만든 지역변수를 되돌려주는지**만 검사하게 된다.
# 리뷰에서 실증된 생존 뮤턴트들: title=doc.title / target_date +1일 / actionId 를 인박스 id 로 /
# commit 삭제 / category 하드코딩 / get_by_id→get_by_id_any. 전부 여기서 죽는다.


def test_adopted_step_reaches_todays_action_detail(client: TestClient) -> None:
    """응답의 actionId 로 되짚어 **저장된 카드**의 제목·날짜·카테고리를 확인한다."""
    _create_goal(client)
    item = _system_items(client)[0]
    doc = registry.get(item["resourceSlug"])

    adopted = _adopt(client, item["inboxId"], 0).json()
    detail = client.get(f"/today/actions/{adopted['actionId']}")
    assert detail.status_code == 200, detail.text

    card = detail.json()
    assert card["title"] == doc.steps[0], "저장된 카드 제목이 채택한 걸음과 다르다"
    assert card["targetDate"] == _today_kst().date().isoformat()
    assert card["source"] == "inbox"
    assert card["category"] == doc.category


def test_adopting_commits(client: TestClient, fake_sessions: Any) -> None:
    """commit 이 없으면 200 과 진짜 UUID 를 돌려주고도 카드가 사라진다.

    `create_from_inbox` 가 flush+refresh 까지 하므로 `action.id` 는 채워지고, `get_db` 는
    정상 종료 시 rollback 하지 않고 close 만 한다 — 즉 **조용히** 유실된다.
    """
    _create_goal(client)
    item = _system_items(client)[0]
    before = sum(s.commit_count for s in fake_sessions)

    assert _adopt(client, item["inboxId"], 0).status_code == 200
    assert sum(s.commit_count for s in fake_sessions) > before, "adopt-step 이 commit 하지 않았다"


def test_adopted_card_follows_the_resource_category(client: TestClient) -> None:
    """카드 카테고리의 권위는 자료다 — inbox 6종 추정치가 아니라.

    `ai_category_guess` 는 career/relationship/self_dev 가 other 로 접힌 값이라,
    그걸 쓰면 9종을 받는 ActionItem 에 손실이 전파되고 주간 집계 버킷이 사라진다.
    """
    _create_goal(client)
    item = _system_items(client)[0]
    doc = registry.get(item["resourceSlug"])

    adopted = _adopt(client, item["inboxId"], 0).json()
    card = client.get(f"/today/actions/{adopted['actionId']}").json()
    assert card["category"] == doc.category == "health"


def test_user_category_override_wins(client: TestClient) -> None:
    """사용자가 명시적으로 재분류했다면 그건 존중한다 (fallback 순서 뒤집기 뮤턴트를 잡는다)."""
    _create_goal(client)
    item = _system_items(client)[0]
    patched = client.patch(f"/inbox/{item['inboxId']}", json={"userCategory": "study"})
    assert patched.status_code == 200, patched.text

    adopted = _adopt(client, item["inboxId"], 0).json()
    card = client.get(f"/today/actions/{adopted['actionId']}").json()
    assert card["category"] == "study"


def test_adopting_from_an_archived_item_is_404(client: TestClient) -> None:
    """보관한 자료에서는 채택할 수 없다 (`get_by_id` → `get_by_id_any` 한 글자 뮤턴트)."""
    _create_goal(client)
    inbox_id = _system_items(client)[0]["inboxId"]
    assert client.post(f"/inbox/{inbox_id}/archive").status_code == 204

    resp = _adopt(client, inbox_id, 0)
    assert resp.status_code == 404, resp.text
    assert resp.json()["code"] == "INBOX_NOT_FOUND"


def test_system_guard_direction(client: TestClient) -> None:
    """`source != 'system' or resource_slug is None` 의 **방향**을 고정한다.

    `or` 를 `and` 로 바꾸면 사용자 항목도 통과해 `registry.get(None)` 으로 넘어간다.
    """
    inbox_id = client.post("/inbox", json={"rawText": "장 보기"}).json()["inboxId"]
    resp = _adopt(client, inbox_id, 0)
    assert resp.status_code == 422, resp.text
    assert resp.json()["field"] == "inboxId"
