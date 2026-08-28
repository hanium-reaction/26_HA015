"""카드 [시작]과 계획 교체가 겹칠 때의 직렬화 (#368).

`supersede_previous_plan` 독스트링은 "카드 SELECT 는 FOR UPDATE — 동시에 [시작]하는
요청과 교차해 '보관됐는데 실행 중'인 유령 카드가 생기지 않게 직렬화한다" 고 약속했지만,
**한쪽만 잠그면 직렬화가 아니다.** `today.start_action` 은 락 없는 SELECT 로 읽고 ORM 에
`UPDATE ... WHERE id = :id`(archived_at 술어 없음)를 맡겨, 보관이 확정된 뒤에도 그대로
적용됐다.

두 층으로 못 박는다:

1. **SQL 핀** (DB 불필요) — 변경용 조회에 `FOR UPDATE` 가 붙어 있는가, 그리고 읽기 전용
   조회에는 **안 붙어** 있는가. 불필요한 잠금은 그 자체로 결함이다.
2. **실 동시성** (실 Postgres) — 커넥션 두 개로 실제 교차를 만들어 유령이 안 생기는지.
   ①만으로는 "FOR UPDATE 를 붙였다"만 알 뿐 "그래서 유령이 안 생긴다"는 모른다.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from datetime import date
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models.action_item import ActionItem
from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.user import User
from reaction_backend.orchestrator.first_plan_adapter import supersede_previous_plan
from reaction_backend.repositories.action_item_repo import ActionItemRepo
from tests.conftest import DB_AVAILABLE

# ── ① SQL 핀 — DB 없이 컴파일된 문장만 본다 ──────────────────────────────


class _Result:
    def scalar_one_or_none(self) -> None:
        return None


class _RecordingSession:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    async def execute(self, stmt: Any) -> _Result:
        self.statements.append(stmt)
        return _Result()


async def test_mutating_read_takes_a_row_lock() -> None:
    """`get_by_id_for_update` 는 FOR UPDATE + archived_at IS NULL 을 함께 건다.

    두 조건이 **같은 문장에** 있어야 한다 — READ COMMITTED 에서 잠금 대기 후 WHERE 가
    재평가되면서 '그 사이 보관된 카드'가 결과에서 빠지는 것이 이 수정의 핵심이다.
    """
    session = _RecordingSession()
    repo = ActionItemRepo(session)  # type: ignore[arg-type]

    await repo.get_by_id_for_update(uuid.uuid4(), uuid.uuid4())

    sql = str(session.statements[0].compile(compile_kwargs={"literal_binds": False}))
    assert "FOR UPDATE" in sql, sql
    assert "archived_at IS NULL" in sql, sql


async def test_read_only_lookup_does_not_lock() -> None:
    """읽기 전용 `get_by_id` 에는 잠금이 붙으면 안 된다.

    카드 상세 조회(S11)까지 행 잠금을 잡으면 승인·완료 경로와 서로를 막는다.
    """
    session = _RecordingSession()
    repo = ActionItemRepo(session)  # type: ignore[arg-type]

    await repo.get_by_id(uuid.uuid4(), uuid.uuid4())

    sql = str(session.statements[0].compile(compile_kwargs={"literal_binds": False}))
    assert "FOR UPDATE" not in sql, sql


# ── ② 실 동시성 — 커넥션 두 개로 교차 ────────────────────────────────────

pytestmark_db = pytest.mark.skipif(
    not DB_AVAILABLE, reason="DATABASE_URL not set — 실 동시성 테스트 skip"
)


async def _seed(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    uid = uuid.uuid4()
    session.add(User(id=uid, email=f"lock368+{uid}@test.local", name="lock368"))
    await session.flush()
    gid = uuid.uuid4()
    session.add(Goal(id=gid, user_id=uid, title="잠금 테스트 목표", category="study"))
    await session.flush()
    aid = uuid.uuid4()
    session.add(
        ActionItem(
            id=aid,
            user_id=uid,
            goal_id=gid,
            title="잠금 테스트 카드",
            target_date=date(2026, 8, 29),
            estimated_minutes=30,
            status="planned",
            source="goal",
            category="study",
        )
    )
    await session.commit()
    return uid, gid, aid


async def _sessions() -> AsyncIterator[Any]:
    """이 테스트 전용 엔진 — 커밋이 필요해 `real_db_session`(롤백 격리)을 못 쓴다."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from reaction_backend.config import get_settings
    from reaction_backend.db.session import normalize_async_url

    engine = create_async_engine(
        normalize_async_url(get_settings().database_url), poolclass=NullPool
    )
    try:
        yield async_sessionmaker(engine, expire_on_commit=False)
    finally:
        await engine.dispose()


@pytestmark_db
async def test_start_during_supersede_does_not_create_a_ghost_card() -> None:
    """교체가 카드를 보관하는 중에 [시작]이 들어오면 시작이 진다 — 유령이 안 생긴다.

    수정 전에는 `status='in_progress' AND archived_at IS NOT NULL` 이 남았다.
    """
    agen = _sessions()
    sm = await anext(agen)
    try:
        async with sm() as s:
            uid, gid, aid = await _seed(s)

        locked = asyncio.Event()
        read_result: dict[str, Any] = {}

        async def superseding() -> None:
            async with sm() as s:
                await supersede_previous_plan(s, user_id=uid, goal_id=gid)
                locked.set()
                # 고정 시간 뒤 커밋 — 시작 쪽을 기다리면 그쪽이 이 락에 걸려 교착한다.
                await asyncio.sleep(0.7)
                await s.commit()

        async def starting() -> None:
            async with sm() as s:
                await locked.wait()
                repo = ActionItemRepo(s)
                # today.start_action 이 카드를 읽는 방식 그대로
                action = await repo.get_by_id_for_update(uid, aid)
                read_result["found"] = action is not None
                if action is None:
                    return  # 라우터는 여기서 404 — execution_events 를 만들지 않는다
                action.status = "in_progress"
                await s.commit()

        await asyncio.wait_for(asyncio.gather(superseding(), starting()), timeout=30)

        async with sm() as s:
            status, archived = (
                await s.execute(
                    text("SELECT status, archived_at IS NOT NULL FROM action_items WHERE id = :i"),
                    {"i": aid},
                )
            ).one()
            executions = (
                await s.execute(
                    text("SELECT count(*) FROM execution_events WHERE action_item_id = :i"),
                    {"i": aid},
                )
            ).scalar_one()
            # 정리 — 이 테스트는 커밋하므로 스스로 치운다
            await s.execute(text("DELETE FROM action_items WHERE id = :i"), {"i": aid})
            await s.execute(text("DELETE FROM goals WHERE id = :i"), {"i": gid})
            await s.execute(text("DELETE FROM users WHERE id = :i"), {"i": uid})
            await s.commit()

        assert read_result["found"] is False, (
            "잠금 읽기가 보관된 카드를 그대로 돌려줬다 — FOR UPDATE 가 빠졌거나 "
            "archived_at 술어가 같은 문장에 없다."
        )
        assert not (status == "in_progress" and archived), (
            f"유령 카드: status={status!r} archived={archived} (#368)"
        )
        assert executions == 0, "보관된 카드에 실행이 생겼다 — 회고 화면으로 샌다."
    finally:
        await agen.aclose()


# ── ③ 배선 핀 — 라우터가 잠금 읽기를 쓰는가 ─────────────────────────────


def test_start_route_uses_the_locking_read(
    client: Any, fake_action_item_repo: Any, demo_user_orm: Any
) -> None:
    """`today.start_action` 이 락 없는 `get_by_id` 로 되돌아가면 여기서 잡힌다.

    ①②는 repo 메서드의 성질만 본다 — 라우터가 그 메서드를 **쓰는지**는 별개다.
    실제 사고는 "잠금 메서드는 있는데 호출부가 안 쓴다" 로도 똑같이 재발한다.
    """
    action = ActionItem()
    action.id = uuid.uuid4()
    action.user_id = demo_user_orm.id
    action.title = "잠금 배선 확인"
    action.target_date = date(2026, 6, 5)
    action.category = "study"
    action.source = "manual"
    action.status = "planned"
    action.priority = 3
    action.estimated_minutes = 30
    action.why_now = None
    action.first_step = None
    action.goal_id = None
    action.archived_at = None
    fake_action_item_repo.seed(action)

    response = client.post(f"/today/actions/action_{action.id}/start")

    assert response.status_code == 201, response.text
    assert action.id in fake_action_item_repo.locking_reads, (
        "start 가 잠금 읽기를 쓰지 않았다 — 락 없는 get_by_id 로 되돌아갔다 (#368)."
    )
