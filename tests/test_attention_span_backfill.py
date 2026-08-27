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
from scripts.preview_attention_span_backfill import (
    CORRUPTED_ATTENTION_SPAN,
    PollutedProfile,
    is_trusted_chip,
)

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
    """다시 읽어도 오염값이면 신뢰할 수 없다 — 폴백으로 간다."""
    rows = plan_backfill([_polluted(chip="이상한 값", recomputed=CORRUPTED_ATTENTION_SPAN)])
    assert rows[0].source == "fallback"
    assert rows[0].new_attention_span > CORRUPTED_ATTENTION_SPAN


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


def test_seeded_chip_is_not_trusted_as_a_user_answer() -> None:
    """프로필→슬롯 시드로 되돌아온 값은 **사용자의 답이 아니다** (핵심 회귀).

    `profile_memory.seed_slots_from_profile` 이 `attention_span` 을 `f"{n}분"` 칩으로
    되돌리고 `routes/interview._persist_turn` 이 그걸 `interview_slot_answers` 에 UPSERT
    한다. 오염 후 재인터뷰한 사용자에겐 `"2분"` 이 본인 답인 것처럼 남는다 — 그걸 믿으면
    백필이 **틀린 값을 확정**한다. 카탈로그 옵션만 신뢰하는 게 그 방어선이다.
    """
    assert is_trusted_chip("25분") is True
    assert is_trusted_chip("2시간 이상") is True
    # 시드가 만드는 값들 — 어느 것도 사용자가 고를 수 없다.
    assert is_trusted_chip("2분") is False
    assert is_trusted_chip("120분") is False
    assert is_trusted_chip("30분") is False
    assert is_trusted_chip(None) is False


def test_recovered_chip_rides_the_ledger_for_slot_repair() -> None:
    """되찾은 칩 원문이 원장에 남아야 슬롯 답 수리·되돌리기가 가능하다."""
    rows = plan_backfill([_polluted()])
    assert rows[0].recovered_chip == "2시간 이상"
    parsed = parse_ledger_document(ledger_document(rows, applied_at=_APPLIED))
    assert parsed[0].recovered_chip == "2시간 이상"
    # 폴백 행은 되찾은 답이 없다 — 지어낸 값을 사용자의 '답' 으로 저장하지 않는다.
    fallback = plan_backfill([_polluted(chip=None, recomputed=None)])
    assert fallback[0].recovered_chip is None


def test_predicate_targets_only_the_value_the_broken_parser_could_make() -> None:
    """선별값은 2 뿐 — `< 15` 로 잡으면 사용자가 설정한 5~14분을 말없이 덮는다.

    `PATCH /settings/profile` 이 `attention_span` 을 `ge=5` 로 허용한다. 깨진 파서와 고친
    파서를 칩 4종에 돌리면 결과가 갈리는 건 "2시간 이상"(2 vs 120) 하나뿐이라,
    2 만이 사고의 흔적이다.
    """
    from reaction_backend.orchestrator.interview_adapter import chip_duration_min
    from reaction_backend.orchestrator.interview_catalog import PLAN_SLOTS

    slot = next(s for s in PLAN_SLOTS if s.slot_key == "energy.focus_duration")
    diverged = []
    for chip in slot.options:
        broken = int("".join(c for c in chip if c.isdigit()) or 0)
        fixed = chip_duration_min({"type": "chip", "values": [chip]})
        if broken != fixed:
            diverged.append(broken)
    assert diverged == [CORRUPTED_ATTENTION_SPAN], (
        f"깨진 파서가 만들 수 있던 오염값 집합이 바뀌었다 — 선별 술어도 함께 갱신할 것: {diverged}"
    )
