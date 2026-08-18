"""인박스 repo 의 실 SQL 고정 — fake 전면대체 함정 대응 (BE #171).

`FakeInboxRepo` 가 라우트 테스트를 전부 받아내므로 실 repo 의 WHERE 는 스위트에서
한 번도 실행되지 않는다. `has_resource` 는 특히 **방향이 뒤집히기 쉬운** 쿼리다 —
`archived_at IS NULL` 을 한 줄 넣으면 그 순간 "보관한 자료가 목표를 만들 때마다
되살아나는" 동작이 되는데, fake 는 그 필터를 흉내내지 않아 CI 는 초록이다.

그래서 값까지 인라인(`literal_binds`)한 실 SQL 문자열로 고정한다
(`test_notification_send_repo_sql.py` 에서 확립한 패턴).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from reaction_backend.repositories.inbox_repo import InboxRepo

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
SLUG = "exercise-plan-that-bends"


class _RecordingResult:
    def scalar_one(self) -> int:
        return 0


class _RecordingSession:
    """실행된 statement 를 붙잡아 두는 세션 — 실 repo 의 SQL 검사용."""

    def __init__(self) -> None:
        self.statements: list[object] = []

    async def execute(self, stmt: object) -> _RecordingResult:
        self.statements.append(stmt)
        return _RecordingResult()


def _sql(stmt: object) -> str:
    from sqlalchemy.dialects import postgresql

    raw = str(
        stmt.compile(  # type: ignore[attr-defined]
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    return " ".join(raw.split())


async def _run_has_resource() -> tuple[bool, str]:
    session = _RecordingSession()
    repo = InboxRepo(session)  # type: ignore[arg-type]
    found = await repo.has_resource(USER_ID, SLUG)
    assert len(session.statements) == 1, "쿼리가 실행되지 않았다 — 검사가 공허하다"
    return found, _sql(session.statements[0])


async def test_has_resource_filters_by_user_and_slug() -> None:
    _, sql = await _run_has_resource()
    assert f"inbox_items.user_id = '{USER_ID}'" in sql
    assert f"inbox_items.resource_slug = '{SLUG}'" in sql


async def test_has_resource_does_not_filter_archived() -> None:
    """보관한 자료도 '이미 있음' 으로 세야 한다.

    `archived_at IS NULL` 이 들어가면 사용자가 치운 자료가 목표를 만들 때마다 되살아난다.
    `get_by_id_any` 와 함께 archived 를 일부러 포함하는 두 번째 조회다.
    """
    _, sql = await _run_has_resource()
    assert "archived_at" not in sql, f"보관 필터가 들어갔다: {sql}"


async def test_has_resource_counts_rather_than_loads() -> None:
    _, sql = await _run_has_resource()
    assert sql.startswith("SELECT count(*)"), sql
    assert "FROM inbox_items" in sql


async def test_has_resource_returns_false_when_count_is_zero() -> None:
    """0 을 True 로 뒤집는 뮤턴트(`>= 0`)를 잡는다."""
    found, _ = await _run_has_resource()
    assert found is False


async def test_has_resource_returns_true_when_count_is_positive() -> None:
    class _One(_RecordingResult):
        def scalar_one(self) -> int:
            return 1

    class _OneSession(_RecordingSession):
        async def execute(self, stmt: object) -> _RecordingResult:
            self.statements.append(stmt)
            return _One()

    repo = InboxRepo(_OneSession())  # type: ignore[arg-type]
    assert await repo.has_resource(USER_ID, SLUG) is True


async def test_create_persists_source_and_resource_slug() -> None:
    """실 repo 가 두 컬럼을 실제로 세팅하는가 (fake 만 고치고 끝나는 것 방지)."""
    added: list[Any] = []

    class _AddSession(_RecordingSession):
        def add(self, obj: Any) -> None:
            added.append(obj)

        async def flush(self) -> None:
            return None

        async def refresh(self, obj: Any) -> None:
            return None

    repo = InboxRepo(_AddSession())  # type: ignore[arg-type]
    item = await repo.create(
        user_id=USER_ID,
        raw_text_encrypted="enc",
        ai_category_guess="health",
        status="classified",
        source="system",
        resource_slug=SLUG,
    )
    assert added == [item]
    assert item.source == "system"
    assert item.resource_slug == SLUG
    assert item.status == "classified"


async def test_create_defaults_to_user_source() -> None:
    """기존 호출부(사용자 캡처)는 인자를 안 줘도 'user' 여야 한다."""

    class _AddSession(_RecordingSession):
        def add(self, obj: Any) -> None:
            return None

        async def flush(self) -> None:
            return None

        async def refresh(self, obj: Any) -> None:
            return None

    repo = InboxRepo(_AddSession())  # type: ignore[arg-type]
    item = await repo.create(user_id=USER_ID, raw_text_encrypted="enc")
    assert item.source == "user"
    assert item.resource_slug is None
