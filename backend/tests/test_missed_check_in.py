"""블록 후 미체크 판정 — 단일 진실 소스 고정 (근거 대장 §6.2 T1, reaction-frontend#224).

`GET /today/agenda` 의 `missedCheckIn` 과 이 판정이 갈라지면 FE 가 배지를 잘못 그린다
— `action_cancel.py`(#214)와 같은 이유로 판정을 여기 하나로 고정한다.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from reaction_backend.domain.missed_check_in import (
    MIN_MISSED_CHECK_IN_DELAY,
    MISSED_CHECK_IN_DELAY,
    is_missed_check_in,
    missed_check_in_delay,
)

_START = datetime(2026, 8, 25, 14, 0, tzinfo=UTC)


def test_scheduled_and_past_the_delay_is_missed() -> None:
    now = _START + MISSED_CHECK_IN_DELAY
    assert is_missed_check_in(block_status="scheduled", start_at=_START, now=now) is True


def test_scheduled_but_still_within_the_delay_is_not_missed() -> None:
    now = _START + MISSED_CHECK_IN_DELAY - timedelta(minutes=1)
    assert is_missed_check_in(block_status="scheduled", start_at=_START, now=now) is False


def test_started_block_is_never_missed() -> None:
    """이미 [▶ 시작] 을 눌렀다 — 아무리 시간이 지나도 '미체크' 가 아니다."""
    now = _START + timedelta(days=1)
    assert is_missed_check_in(block_status="started", start_at=_START, now=now) is False


def test_finished_block_is_never_missed() -> None:
    now = _START + timedelta(hours=1)
    assert is_missed_check_in(block_status="finished", start_at=_START, now=now) is False


def test_cancelled_block_is_never_missed() -> None:
    now = _START + timedelta(hours=1)
    assert is_missed_check_in(block_status="cancelled", start_at=_START, now=now) is False


def test_boundary_exactly_at_the_delay_counts_as_missed() -> None:
    """경계는 포함(`>=`) — 좁히는 뮤턴트를 잡는다."""
    now = _START + MISSED_CHECK_IN_DELAY
    assert is_missed_check_in(block_status="scheduled", start_at=_START, now=now) is True


def test_future_block_is_not_missed() -> None:
    """아직 시작 시각도 안 된 블록 — 당연히 미체크가 아니다."""
    now = _START - timedelta(minutes=5)
    assert is_missed_check_in(block_status="scheduled", start_at=_START, now=now) is False


# ── 길이 비례 유예 (ADR-0009 D5) ──────────────────────────────────────────


def test_delay_is_proportional_between_five_and_twenty_minutes() -> None:
    """유예 = 블록 길이 × 0.3, 단 [5분, 20분]."""
    assert missed_check_in_delay(15) == timedelta(minutes=5)  # 4.5 → 하한 5
    assert missed_check_in_delay(30) == timedelta(minutes=9)
    assert missed_check_in_delay(50) == timedelta(minutes=15)
    assert missed_check_in_delay(120) == MISSED_CHECK_IN_DELAY  # 36 → 상한 20
    assert missed_check_in_delay(240) == MISSED_CHECK_IN_DELAY


def test_delay_never_exceeds_the_locked_twenty_minutes() -> None:
    """근거 대장 §6.2 T1 의 20분을 **넘지 않는다** — 완화는 짧은 블록 방향으로만."""
    for minutes in range(1, 601):
        assert MIN_MISSED_CHECK_IN_DELAY <= missed_check_in_delay(minutes) <= MISSED_CHECK_IN_DELAY


def test_delay_falls_back_to_the_cap_when_length_is_unknown() -> None:
    """길이를 모르면 종전대로 20분 — 호출자가 안 넘겨도 동작이 안 바뀐다."""
    assert missed_check_in_delay(None) == MISSED_CHECK_IN_DELAY
    assert missed_check_in_delay(0) == MISSED_CHECK_IN_DELAY
    assert missed_check_in_delay(-5) == MISSED_CHECK_IN_DELAY
    now = _START + timedelta(minutes=19)
    assert is_missed_check_in(block_status="scheduled", start_at=_START, now=now) is False


def test_short_block_is_missed_before_the_old_fixed_delay() -> None:
    """15분 블록은 +6분이면 미체크 — 예전(고정 20분)에는 블록이 끝나고도 아니었다."""
    now = _START + timedelta(minutes=6)
    assert (
        is_missed_check_in(block_status="scheduled", start_at=_START, now=now, block_minutes=15)
        is True
    )
    # 같은 시각, 길이만 모르면 종전 동작(아직 아님).
    assert is_missed_check_in(block_status="scheduled", start_at=_START, now=now) is False


def test_started_short_block_is_still_not_missed() -> None:
    """길이가 짧아도 [▶ 시작] 을 눌렀으면 미체크가 아니다 — 상태 검사가 먼저다."""
    now = _START + timedelta(hours=3)
    assert (
        is_missed_check_in(block_status="started", start_at=_START, now=now, block_minutes=15)
        is False
    )
