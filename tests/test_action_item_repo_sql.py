"""ActionItem repo 의 실 SQL 고정 — adopt-step 도메인 멱등 (#213).

`FakeActionItemRepo` 가 라우트 테스트를 전부 받아내므로 실 repo 의 WHERE 는
스위트에서 한 번도 실행되지 않는다. `find_adopted_step` 은 조건 하나가 빠지는
순간 방향이 뒤집힌다:

- `archived_at IS NULL` 이 빠지면 → 보관(취소)한 걸음을 **영영 다시 담을 수 없다**
- `target_date` 가 빠지면 → 날짜가 바뀌어도 어제 카드가 재사용된다 (헤더 멱등의
  24h TTL 부작용을 도메인에서 그대로 재현하는 꼴)
- `inbox_item_id`/`title` 이 빠지면 → 다른 자료·다른 걸음까지 한 장으로 접힌다

그래서 값까지 인라인(`literal_binds`)한 실 SQL 문자열로 고정한다
(`test_inbox_repo_sql.py` 에서 확립한 패턴).
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from reaction_backend.repositories.action_item_repo import ActionItemRepo

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
INBOX_ID = UUID("22222222-2222-2222-2222-222222222222")
TITLE = "오늘 몸을 10분만 움직인다"
TARGET = date(2026, 8, 11)


class _RecordingScalars:
    def first(self) -> None:
        return None


class _RecordingResult:
    def scalars(self) -> _RecordingScalars:
        return _RecordingScalars()


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


async def _run_find_adopted_step() -> str:
    session = _RecordingSession()
    repo = ActionItemRepo(session)  # type: ignore[arg-type]
    found = await repo.find_adopted_step(USER_ID, INBOX_ID, TITLE, TARGET)
    assert len(session.statements) == 1, "쿼리가 실행되지 않았다 — 검사가 공허하다"
    assert found is None  # first() 가 None 이면 없음으로 읽는다 (뮤턴트 방지 겸)
    return _sql(session.statements[0])


async def test_find_adopted_step_matches_the_exact_step() -> None:
    """같은 걸음의 정의 = (사용자, 자료 항목, 걸음 제목, 날짜) 전부 일치."""
    sql = await _run_find_adopted_step()
    assert f"action_items.user_id = '{USER_ID}'" in sql
    assert f"action_items.inbox_item_id = '{INBOX_ID}'" in sql
    assert f"action_items.title = '{TITLE}'" in sql
    assert f"action_items.target_date = '{TARGET.isoformat()}'" in sql


async def test_find_adopted_step_only_sees_active_cards() -> None:
    """**연산자·부정까지 한 문자열로** 고정 — `IS NOT NULL` 로 뒤집히거나 필터가
    사라지면(컬럼명 검사만으로는 둘 다 생존) 보관한 걸음을 다시 담을 수 없게 된다."""
    sql = await _run_find_adopted_step()
    assert "action_items.archived_at IS NULL" in sql, sql


async def test_find_adopted_step_is_deterministic_when_duplicates_exist() -> None:
    """수정 전 이미 생긴 중복(라이브에서 실재)을 만나도 항상 같은 카드를 돌려준다."""
    sql = await _run_find_adopted_step()
    assert "ORDER BY action_items.created_at ASC" in sql, sql
    assert "LIMIT 1" in sql, sql
