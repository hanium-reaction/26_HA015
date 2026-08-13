"""scripts.cancel_stale_plan_cards — 순수 로직 + 셀렉터 재사용 고정 (#229).

DB 배선 함수(`_load_plan`/`run`)는 이 레포의 다른 운영 스크립트(`cleanup_duplicate_plans`)
와 같은 이유로 여기서 단위 테스트하지 않는다 — 라이브 dry-run 이 실제 검증이다. 여기서
고정하는 건 두 가지뿐이다:
1. 순수 그룹핑 로직(`group_active_block_ids`)
2. **셀렉터가 프리뷰의 '과거' 버킷과 같은 함수를 재사용하는가** — 새로 짜지 않았는가.
   팀이 승인한 건 프리뷰 화면에 나온 33건이지, 이 스크립트가 독자적으로 다시 정의한
   집합이 아니다.
"""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from scripts import cancel_stale_plan_cards as target
from scripts.cancel_stale_plan_cards import (
    CleanupPlan,
    StaleCardReport,
    group_active_block_ids,
)
from scripts.preview_card_target_date_backfill import drifted_cards_stmt


def test_reuses_the_preview_selector_not_a_copy() -> None:
    """새 WHERE 를 짜지 않고 프리뷰 함수를 그대로 import 했는지 — 셀렉터 drift 방지."""
    assert target.drifted_cards_stmt is drifted_cards_stmt


def test_group_active_block_ids_collects_split_sessions() -> None:
    """카드 하나가 여러 활성 블록을 가지면(분할 세션) 전부 잡혀야 취소 시 유령이 안 남는다."""
    a1, a2 = uuid4(), uuid4()
    b1, b2, b3 = uuid4(), uuid4(), uuid4()

    grouped = group_active_block_ids([(a1, b1), (a1, b2), (a2, b3)])

    assert set(grouped[a1]) == {b1, b2}
    assert grouped[a2] == [b3]


def test_group_active_block_ids_empty_input() -> None:
    assert group_active_block_ids([]) == {}


def test_cleanup_plan_aggregates_across_reports() -> None:
    """archive/cancel 대상 id 목록이 여러 카드에 걸쳐 정확히 합쳐지는지."""
    r1 = StaleCardReport(
        card_id=uuid4(),
        user_id=uuid4(),
        title="A",
        old_target_date=date(2026, 7, 1),
        would_be_target_date=date(2026, 7, 10),
        cancelled_block_ids=[uuid4(), uuid4()],
    )
    r2 = StaleCardReport(
        card_id=uuid4(),
        user_id=uuid4(),
        title="B",
        old_target_date=date(2026, 7, 2),
        would_be_target_date=date(2026, 7, 20),
        cancelled_block_ids=[uuid4()],
    )
    plan = CleanupPlan(reports=[r1, r2])

    assert plan.archive_action_ids == [r1.card_id, r2.card_id]
    assert set(plan.cancel_block_ids) == {*r1.cancelled_block_ids, *r2.cancelled_block_ids}


def test_cleanup_plan_with_no_reports_is_empty() -> None:
    plan = CleanupPlan()
    assert plan.archive_action_ids == []
    assert plan.cancel_block_ids == []
