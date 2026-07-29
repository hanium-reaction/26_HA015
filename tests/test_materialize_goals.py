"""first_plan_adapter.materialize_goals (#96) — 인터뷰 완료/계획 승인 공유 목표 영속.

핵심: 이미 있는 제목의 목표는 재사용(중복 생성 방지), placeholder(#88)는 제외.
인터뷰 완료가 먼저 목표를 저장하고 계획 승인이 같은 목표를 재사용하는 계약을 보증한다.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from reaction_backend.db.models.goal import Goal
from reaction_backend.orchestrator.first_plan_adapter import (
    _derive_goal_category,
    materialize_goals,
    supersede_proposed_goals,
)
from reaction_backend.orchestrator.interview_adapter import PLACEHOLDER_GOAL_TITLE
from reaction_backend.schemas.interview import GoalCandidate


class _Result:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def scalars(self) -> _Result:
        return self

    def all(self) -> list[Any]:
        return list(self._rows)


class _FakeSession:
    """execute → 미리 넣은 기존 목표 반환, add/flush 기록."""

    def __init__(self, existing: list[Goal] | None = None) -> None:
        self._existing = existing or []
        self.added: list[Any] = []

    async def execute(self, stmt: Any) -> _Result:  # noqa: ARG002
        return _Result(self._existing)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None


def _goal(title: str, *, heaviest: bool = False, tier: str = "maintain") -> GoalCandidate:
    return GoalCandidate(
        title=title,
        category="other",
        is_heaviest=heaviest,
        tentative_tier=tier,
        confidence=0.5,
    )


def _placeholder() -> GoalCandidate:
    return GoalCandidate(
        title=PLACEHOLDER_GOAL_TITLE, category="other", tentative_tier="maintain", confidence=0.0
    )


async def test_creates_new_goals_and_picks_heaviest() -> None:
    sess = _FakeSession()
    goals = [_goal("캡스톤", heaviest=True, tier="focus"), _goal("토익")]
    rows, heaviest = await materialize_goals(sess, user_id=uuid4(), core_goals=goals)  # type: ignore[arg-type]

    assert len(rows) == 2
    assert len(sess.added) == 2  # 둘 다 신규 생성
    assert heaviest is not None and heaviest.title == "캡스톤"
    assert heaviest.goal_tier == "focus"


async def test_reuses_existing_goal_by_title() -> None:
    uid = uuid4()
    existing = Goal()
    existing.id = uuid4()
    existing.user_id = uid
    existing.title = "캡스톤"
    existing.goal_tier = "focus"
    existing.archived_at = None
    sess = _FakeSession(existing=[existing])

    goals = [_goal("캡스톤", heaviest=True, tier="focus"), _goal("토익")]
    rows, heaviest = await materialize_goals(sess, user_id=uid, core_goals=goals)  # type: ignore[arg-type]

    # 캡스톤은 재사용(신규 add X) → 토익만 새로 생성
    assert len(sess.added) == 1
    assert sess.added[0].title == "토익"
    assert heaviest is existing  # 기존 행을 heaviest 로
    assert len(rows) == 2


async def test_placeholder_only_yields_no_goals() -> None:
    sess = _FakeSession()
    rows, heaviest = await materialize_goals(
        sess,
        user_id=uuid4(),
        core_goals=[_placeholder()],  # type: ignore[arg-type]
    )
    assert rows == []
    assert heaviest is None
    assert sess.added == []


# ───────────────────── _derive_goal_category (순수) ─────────────────────
# 인터뷰가 목표 카테고리를 분류하지 않아 'other' 로 저장되던 것을,
# 분해된 액션 카테고리 다수결로 파생한다 (블록/목표가 전부 '기타' 로 뜨던 문제).


def test_derive_goal_category_majority() -> None:
    assert _derive_goal_category(["study", "study", "health"]) == "study"


def test_derive_goal_category_ignores_other() -> None:
    # 'other' 는 표에서 제외 — 실카테고리 소수라도 그것을 채택.
    assert _derive_goal_category(["other", "other", "study"]) == "study"


def test_derive_goal_category_all_other_returns_none() -> None:
    assert _derive_goal_category(["other", "other"]) is None
    assert _derive_goal_category([]) is None


# ───────────────────── 잠정(proposed) 상태 라이프사이클 ─────────────────────
# 인터뷰만 마쳐도 목표가 곧바로 active 로 저장돼, 계획을 승인하지 않고 나간 목표가
# 진짜 목표와 구분 없이 쌓였다(실측: 67개 중 43개가 계획 없는 active).


async def test_interview_creates_proposed_not_active() -> None:
    """기본값은 잠정 — 인터뷰 완료만으로는 '진짜 목표' 가 아니다."""
    sess = _FakeSession()
    rows, _ = await materialize_goals(
        sess,  # type: ignore[arg-type]
        user_id=uuid4(),
        core_goals=[_goal("캡스톤", heaviest=True)],  # type: ignore[arg-type]
    )
    assert [g.status for g in rows] == ["proposed"]


async def test_approve_promotes_proposed_to_active() -> None:
    """계획 승인은 '이 목표를 실제로 하겠다' 는 결정 → 잠정 목표를 승격한다."""
    existing = Goal()
    existing.id = uuid4()
    existing.title = "캡스톤"
    existing.status = "proposed"
    existing.archived_at = None
    sess = _FakeSession([existing])

    rows, _ = await materialize_goals(
        sess,  # type: ignore[arg-type]
        user_id=uuid4(),
        core_goals=[_goal("캡스톤", heaviest=True)],  # type: ignore[arg-type]
        status="active",
    )
    assert rows[0] is existing  # 재사용(중복 생성 X)
    assert existing.status == "active"  # 승격
    assert sess.added == []


async def test_approve_does_not_demote_or_touch_real_goals() -> None:
    """이미 active/completed 인 목표는 건드리지 않는다 — 승격은 한 방향이다."""
    done = Goal()
    done.id = uuid4()
    done.title = "토익"
    done.status = "completed"
    done.archived_at = None
    sess = _FakeSession([done])

    await materialize_goals(
        sess,  # type: ignore[arg-type]
        user_id=uuid4(),
        core_goals=[_goal("토익")],  # type: ignore[arg-type]
        status="active",
    )
    assert done.status == "completed"


async def test_supersede_archives_only_stale_proposed() -> None:
    """새 인터뷰가 이전 잠정 목표를 대체 — active/completed 는 살려둔다.

    세션은 이미 restart-wins 로 이전 세션을 abandoned 처리한다. 목표에도 같은 규칙을 적용해
    계획으로 이어지지 않은 잠정 목표가 계속 쌓이지 않게 한다.
    """
    keep = Goal()
    keep.id = uuid4()
    keep.title = "이번에도 나온 목표"
    keep.status = "proposed"
    keep.archived_at = None

    stale = Goal()
    stale.id = uuid4()
    stale.title = "지난 인터뷰 잔재"
    stale.status = "proposed"
    stale.archived_at = None

    real = Goal()
    real.id = uuid4()
    real.title = "승인했던 목표"
    real.status = "active"
    real.archived_at = None

    sess = _FakeSession([keep, stale, real])
    n = await supersede_proposed_goals(
        sess,  # type: ignore[arg-type]
        user_id=uuid4(),
        keep=[keep],
    )
    assert n == 1
    assert stale.status == "archived" and stale.archived_at is not None  # 보관(soft)
    assert keep.status == "proposed" and keep.archived_at is None  # 이번에 살린 것
    assert real.status == "active" and real.archived_at is None  # 진짜 목표는 불변
