"""GoalRepo 의 실 SQL 고정 — fake 전면대체 대응 (`test_policy_snapshot_repo_sql.py` 패턴).

`test_goals.py` 는 `FakeGoalRepo` 를 태우므로 실 repo 의 WHERE 절은 전 스위트에서 한 번도
실행되지 않는다 — tier 한도 계산에서 `status != 'proposed'` 를 빼도 CI 는 초록이다.
그러면 인터뷰만 하고 나간 사용자의 **잠정 목표가 Focus/Maintain 한도를 잡아먹어** 새 목표를
못 만들게 되는데, 화면엔 이유가 안 보인다('계획 전' 배지만 뜬다).
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4


class _RecordingResult:
    def scalar_one(self) -> int:
        return 0

    def scalars(self) -> _RecordingResult:
        return self

    def all(self) -> list[Any]:
        return []


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


async def test_count_by_tier_excludes_proposed_goals() -> None:
    """tier 한도 계산이 (a) 보관 목표를 빼고 (b) **잠정 목표도 뺀다**.

    한도는 '동시에 몇 개를 하기로 약속했는가' 다. 인터뷰가 뽑았을 뿐 계획을 승인하지 않은
    목표는 아직 약속이 아니므로 세면 안 된다.
    """
    from reaction_backend.repositories.goal_repo import GoalRepo

    session = _RecordingSession()
    repo = GoalRepo(session)  # type: ignore[arg-type]
    await repo.count_by_tier(uuid4(), "focus")

    where = _sql(session.statements[0]).split(" WHERE ", 1)[1]
    assert "goals.goal_tier =" in where
    assert "goals.archived_at IS NULL" in where, f"보관 목표를 세고 있다: {where}"
    assert "goals.status !=" in where and "proposed" in where, (
        f"잠정 목표를 한도에 세고 있다: {where}"
    )


async def test_list_active_still_shows_proposed_goals() -> None:
    """반대로 **목록**에서는 잠정 목표를 빼면 안 된다.

    인터뷰를 마치면 목표가 보여야 한다는 게 #96 의 목적이다. 한도에서 빼는 것과 화면에서
    숨기는 것은 다른 결정이므로, 여기에 status 필터가 새로 끼는 것을 막는다.
    """
    from reaction_backend.repositories.goal_repo import GoalRepo

    session = _RecordingSession()
    repo = GoalRepo(session)  # type: ignore[arg-type]
    await repo.list_active(uuid4())

    # status 는 SELECT 컬럼 목록에도 나오므로 **WHERE 절만** 본다.
    sql = _sql(session.statements[0])
    where = sql.split(" WHERE ", 1)[1]
    assert "goals.archived_at IS NULL" in where
    assert "status" not in where, f"목록에서 잠정 목표가 숨겨졌다(#96 회귀): {where}"
