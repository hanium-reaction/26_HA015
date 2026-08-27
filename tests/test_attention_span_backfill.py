"""attention_span 백필 순수 로직 (v2.00 후속 — 파서 사고 복구).

DB 없이 검증 가능한 부분만 본다: 선별 → 계획 → 원장 round-trip → 되돌리기 판단.
실제 UPDATE 는 `scripts/backfill_attention_span.run_backfill` 이 하고, 로컬 DB 왕복은
수동으로 확인했다(적용 → 값 변경 → 되돌리기 → 원복).
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from scripts.backfill_attention_span import (
    FALLBACK_ATTENTION_SPAN,
    BackfillRow,
    ledger_document,
    parse_ledger_document,
    plan_backfill,
    plan_revert,
)
from scripts.preview_attention_span_backfill import IMPOSSIBLE_BELOW_MIN, PollutedProfile

from reaction_backend.schemas.common import KST

_APPLIED = datetime(2026, 8, 28, 12, 0, tzinfo=KST)


def _polluted(span: int = 2, chip: str | None = "2시간 이상", recomputed: int | None = 120):
    return PollutedProfile(
        user_id=uuid4(),
        email="demo@reaction.local",
        current_attention_span=span,
        current_chunk="10",
        chip_answer=chip,
        recomputed=recomputed,
    )


def test_backfill_restores_the_value_the_user_actually_picked() -> None:
    """추측하지 않는다 — 저장된 칩 원문을 고친 파서로 다시 읽은 값을 넣는다.

    슬롯 답(raw chip)은 오염되지 않았다. 오염된 건 파생 시점에 계산된 프로필 값뿐이다.
    """
    rows = plan_backfill([_polluted()])
    assert len(rows) == 1
    assert rows[0].old_attention_span == 2
    assert rows[0].new_attention_span == 120
    assert rows[0].new_chunk == "90"  # chunk_bucket(120) — 버킷 최댓값
    assert rows[0].source == "chip"


def test_backfill_falls_back_only_when_the_chip_is_gone() -> None:
    """슬롯 답이 없으면 기본값으로 **붕괴만 막는다** — 없는 값을 지어내지 않는다."""
    rows = plan_backfill([_polluted(chip=None, recomputed=None)])
    assert rows[0].new_attention_span == FALLBACK_ATTENTION_SPAN
    assert rows[0].source == "fallback"


def test_backfill_also_treats_a_still_broken_recompute_as_unfixable() -> None:
    """칩은 남아 있는데 다시 읽은 값도 15분 미만이면 신뢰할 수 없다 — 폴백으로 간다."""
    rows = plan_backfill([_polluted(chip="이상한 값", recomputed=3)])
    assert rows[0].source == "fallback"
    assert rows[0].new_attention_span >= IMPOSSIBLE_BELOW_MIN


def test_backfill_skips_rows_that_would_not_change() -> None:
    """값이 그대로면 UPDATE 를 만들지 않는다 — 빈 원장·빈 쓰기 방지."""
    same = PollutedProfile(
        user_id=uuid4(),
        email="x@y.z",
        current_attention_span=FALLBACK_ATTENTION_SPAN,
        current_chunk="30",
        chip_answer=None,
        recomputed=None,
    )
    assert plan_backfill([same]) == []


def test_ledger_round_trip_survives_serialization() -> None:
    """원장이 유일한 복원 경로라 round-trip 이 깨지면 되돌리기가 조용히 틀린다."""
    rows = plan_backfill([_polluted(), _polluted(chip=None, recomputed=None)])
    parsed = parse_ledger_document(ledger_document(rows, applied_at=_APPLIED))
    assert parsed == rows


def test_revert_does_not_overwrite_a_newer_change() -> None:
    """되돌리기는 **원장 이후 바뀐 값**을 덮지 않는다 — 재인터뷰가 먼저였을 수 있다."""
    row = BackfillRow(
        user_id=uuid4(),
        email="a@b.c",
        old_attention_span=2,
        new_attention_span=120,
        old_chunk="10",
        new_chunk="90",
        source="chip",
    )
    assert plan_revert([row], {row.user_id: 120})[0].action == "revert"
    assert plan_revert([row], {row.user_id: 50})[0].action == "skip_mismatch"
    assert plan_revert([row], {})[0].action == "skip_missing"
