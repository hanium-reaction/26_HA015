"""`ExecutionRepo.action_ids_with_history` 실 SQL 고정 (BE #214).

취소 가능 판정의 세 번째 조건이라 **방향이 뒤집히면 조용히 틀린다**:

- `completion_status` 필터가 끼면(예: `in_progress` 만) 실패로 끝난 실행 이력이 있는
  카드가 "이력 없음" 으로 읽혀 **취소 가능**해진다 — 지표의 근거를 지우게 된다.
- `user_id` 가 빠지면 남의 실행 이력으로 내 카드의 취소 버튼이 사라진다.

라우트 테스트는 `FakeExecutionRepo` 를 지나므로 이 WHERE 는 스위트에서 한 번도
실행되지 않는다(`test_inbox_repo_sql.py` 에서 확립한 패턴).
"""

from __future__ import annotations

from uuid import UUID

from reaction_backend.repositories.execution_repo import ExecutionRepo

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
ACTION_A = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
ACTION_B = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class _RecordingScalars:
    def all(self) -> list[UUID]:
        return []


class _RecordingResult:
    def scalars(self) -> _RecordingScalars:
        return _RecordingScalars()


class _RecordingSession:
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


async def _run() -> str:
    session = _RecordingSession()
    repo = ExecutionRepo(session)  # type: ignore[arg-type]
    found = await repo.action_ids_with_history(USER_ID, [ACTION_A, ACTION_B])
    assert len(session.statements) == 1, "쿼리가 실행되지 않았다 — 검사가 공허하다"
    assert found == set()
    return _sql(session.statements[0])


async def test_history_lookup_scopes_to_user_and_the_given_cards() -> None:
    sql = await _run()
    assert f"execution_events.user_id = '{USER_ID}'" in sql
    assert str(ACTION_A) in sql and str(ACTION_B) in sql
    assert "execution_events.action_item_id IN" in sql


async def test_history_lookup_counts_every_status() -> None:
    """`completion_status` 로 좁히면 실패·중단 이력이 '없던 일' 이 된다."""
    sql = await _run()
    assert "completion_status" not in sql, f"상태 필터가 들어갔다: {sql}"


async def test_history_lookup_selects_only_the_id() -> None:
    """행 전체를 끌어오면 오늘 카드 수만큼 불필요한 로드가 생긴다."""
    sql = await _run()
    assert sql.startswith("SELECT execution_events.action_item_id"), sql


async def test_empty_input_does_not_query() -> None:
    """`IN ()` 는 PostgreSQL 문법 오류다 — 카드가 없는 날 어젠다가 500 이 된다."""
    session = _RecordingSession()
    repo = ExecutionRepo(session)  # type: ignore[arg-type]
    assert await repo.action_ids_with_history(USER_ID, []) == set()
    assert session.statements == [], "빈 목록인데 쿼리를 날렸다"
