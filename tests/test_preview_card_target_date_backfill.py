"""카드 날짜 백필 프리뷰의 판정 고정 (#229).

이 프리뷰는 "백필하면 몇 명이 오늘 탭을 되찾나" 를 답하는 도구다. 그 답이 맞으려면
셀렉터가 #223 의 규칙과 같아야 한다 — 규칙의 출처는 `api/routes/planning.py::edit_block`
의 `min(to_kst(b.start_at) for b if b.block_status != 'cancelled').date()` 다.

여기서 못 박는 것:
- WHERE 에 **네 가드가 전부** 있는가(source·status·미보관·실행이력 없음) — 하나라도 빠지면
  건드리면 안 되는 카드를 세고, 나중에 그 SQL 을 그대로 UPDATE 로 옮기면 실제로 바꾼다.
- `source='goal'` 이 **넓혀지지 않았는가** — `recovery_*` 가 들어오면 `abandon_stale` 이
  target_date 로 구동되어 회복 지표가 죽는다. 이 테스트가 그 확장을 막는 방어선이다.
- 블록 집계가 **활성 블록만** 보는가, KST 로 변환하는가.
- 과거/오늘/미래 버킷 경계 — '오늘 탭 복구' 집계가 여기서 나온다.
"""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from scripts.preview_card_target_date_backfill import (
    BACKFILL_SOURCE,
    BACKFILL_STATUS,
    Drift,
    bucket_by_when,
    drifted_cards_stmt,
)


def _sql(**kwargs: object) -> str:
    from sqlalchemy.dialects import postgresql

    raw = str(
        drifted_cards_stmt(**kwargs).compile(  # type: ignore[arg-type]
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    return " ".join(raw.split())


def test_selector_keeps_all_four_card_guards() -> None:
    """네 가드가 전부 WHERE 에 있어야 한다 — 하나라도 빠지면 대상이 조용히 넓어진다."""
    sql = _sql()
    assert "action_items.source = 'goal'" in sql
    assert "action_items.status = 'planned'" in sql
    assert "action_items.archived_at IS NULL" in sql
    assert "NOT (EXISTS" in sql, f"실행 이력 제외가 없다: {sql}"
    assert "execution_events" in sql


def test_selector_does_not_widen_to_recovery_sources() -> None:
    """`source='goal'` 은 실수가 아니라 하중을 받는 가드다.

    `recovery_*` 를 포함하면 `abandon_stale` 이 target_date 를 구동 조건으로 쓰기 때문에
    앞당겨진 회복 카드가 04:00 cron 에서 abandoned 로 확정되고
    `recovery_duration_minutes` 가 영구 NULL 이 된다.
    """
    assert BACKFILL_SOURCE == "goal"
    assert BACKFILL_STATUS == "planned"
    sql = _sql()
    for banned in ("recovery_downscope", "recovery_reschedule", "recovery_carryover", "habit"):
        assert banned not in sql, f"{banned} 가 대상에 들어왔다"


def test_only_past_as_of_is_opt_in_and_scopes_the_first_day() -> None:
    """`only_past_as_of` 를 안 주면 기존 동작(전체 어긋남) 그대로 — 회귀 없음.

    `scripts.cancel_stale_plan_cards` 가 이 옵션으로 프리뷰의 '과거' 버킷과 정확히
    같은 집합을 재사용한다. 여기서 조건이 갈라지면 정리 스크립트가 팀이 승인한 것과
    다른 카드를 archive+cancel 하게 된다.
    """
    without = _sql()
    assert "first_day <" not in without, "옵션을 안 줬는데 필터가 붙었다"

    with_filter = _sql(only_past_as_of=date(2026, 8, 13))
    assert "anon_1.first_day < '2026-08-13'" in with_filter, with_filter
    # 기존 네 가드는 옵션을 줘도 그대로 살아 있어야 한다.
    assert "action_items.source = 'goal'" in with_filter
    assert "action_items.target_date != anon_1.first_day" in with_filter


def test_block_aggregate_excludes_cancelled_and_uses_kst() -> None:
    """취소된 블록을 세면 유령 날짜로 카드를 옮긴다. KST 변환이 빠지면 UTC 날짜가 된다."""
    sql = _sql()
    assert "scheduled_blocks.block_status != 'cancelled'" in sql, sql
    assert "timezone('Asia/Seoul', scheduled_blocks.start_at)" in sql, sql
    assert "min(" in sql, "가장 이른 블록이 아니라 아무 블록이나 쓰고 있다"
    assert "GROUP BY scheduled_blocks.action_item_id" in sql


def test_selector_only_reports_actual_mismatches() -> None:
    """이미 맞는 카드까지 세면 실측 수가 부풀고, UPDATE 로 옮기면 쓸데없이 행을 만진다."""
    assert "action_items.target_date != " in _sql()


def test_statement_is_read_only() -> None:
    """프리뷰가 SELECT 임을 고정한다 — 이 파일에 쓰기 구문이 끼면 즉시 깨진다."""
    sql = _sql()
    assert sql.startswith("SELECT ")
    for write in ("UPDATE ", "INSERT ", "DELETE "):
        assert write not in sql, f"쓰기 구문이 섞였다: {sql}"


def _drift(new_day: date) -> Drift:
    return Drift(
        card_id=uuid4(),
        user_id=uuid4(),
        title="달리기",
        old_day=date(2026, 7, 1),
        new_day=new_day,
    )


def test_bucket_by_when_splits_on_today() -> None:
    """경계가 하루라도 밀리면 '오늘 탭이 살아나는 계정 수' 가 통째로 틀어진다."""
    today = date(2026, 8, 13)
    buckets = bucket_by_when(
        [
            _drift(date(2026, 8, 12)),
            _drift(today),
            _drift(date(2026, 8, 14)),
        ],
        today,
    )
    assert [d.new_day for d in buckets["past"]] == [date(2026, 8, 12)]
    assert [d.new_day for d in buckets["today"]] == [today]
    assert [d.new_day for d in buckets["future"]] == [date(2026, 8, 14)]


def test_shift_days_signs_the_direction() -> None:
    """앞당김/미룸을 부호로 구분해야 이동 폭 분포가 읽힌다."""
    forward = Drift(uuid4(), uuid4(), "x", date(2026, 7, 1), date(2026, 7, 10))
    backward = Drift(uuid4(), uuid4(), "x", date(2026, 7, 10), date(2026, 7, 1))
    assert forward.shift_days == 9
    assert backward.shift_days == -9
