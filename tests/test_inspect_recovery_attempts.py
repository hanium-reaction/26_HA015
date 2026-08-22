"""회복 카드 상세 조회의 판정 고정 (도그푸딩 점검 도구).

이 스크립트가 존재하는 이유는 집계 리포트가 "완주 0건"이라고만 말하고 **왜**를 안
말하기 때문이다. 그 "왜" 중 가장 조용한 것이 `is_stale_placement` — 회복 블록이
결정 시각보다 과거에 놓이면 `pre_card` 스윕 창을 영영 못 만나 알림이 안 가는데,
집계에는 그냥 미완주로만 보인다.

가드 테스트는 위반 입력을 만들어야 검증된다: **과거에 놓인 블록**을 실제로 만들어
True 가 나오는지 본다. 정상(미래) 블록만 넣으면 판정을 `return False` 로 바꿔도
초록이라 이 함수가 아무것도 지키지 않게 된다.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from scripts.inspect_recovery_attempts import (
    NEW_STRATEGY_TYPES,
    TEXT_PREVIEW_CHARS,
    is_stale_placement,
    new_strategies_reached,
    preview_text,
)

_DECIDED = datetime(2026, 8, 22, 23, 30, tzinfo=UTC)


# ── is_stale_placement — 과거에 놓인 회복 블록 ───────────────────────────


def test_block_placed_before_decision_is_stale() -> None:
    """위반 입력: 23:30 에 결정했는데 블록은 그날 14:00(원본 실패 시각)에 놓였다.

    `shift_to_recovery_day` 의 보정이 `ends_before_night` 조건에 걸려 안 걸린 경우다.
    이 블록은 `pre_card` 스윕 창(`[now+2m, now+7m)`)을 영영 못 만난다.
    """
    block_start = _DECIDED - timedelta(hours=9, minutes=30)
    assert is_stale_placement(block_start, _DECIDED) is True


def test_block_placed_after_decision_is_not_stale() -> None:
    """정상 경로 — 보정이 걸려 결정 이후로 밀린 블록."""
    assert is_stale_placement(_DECIDED + timedelta(minutes=15), _DECIDED) is False


def test_block_at_exactly_decision_time_is_not_stale() -> None:
    """경계(==)는 과거가 아니다 — `<` 를 `<=` 로 바꾸면 이 테스트가 죽는다."""
    assert is_stale_placement(_DECIDED, _DECIDED) is False


def test_missing_block_is_not_reported_as_stale() -> None:
    """블록이 아예 없는 건(replan 미승인) '잘못 놓였다'와 다른 상태다.

    여기서 True 를 내면 "승인 안 함"이 "배치 버그"로 둔갑해 원인 진단이 어긋난다.
    """
    assert is_stale_placement(None, _DECIDED) is False


def test_missing_decision_time_is_not_reported_as_stale() -> None:
    """미결정 카드는 결정 시각이 없다 — 비교 대상이 없으면 판정하지 않는다."""
    assert is_stale_placement(_DECIDED - timedelta(hours=1), None) is False


# ── new_strategies_reached — #257 신설 4종 도달 여부 ─────────────────────


def test_only_new_strategies_are_reported() -> None:
    """기존 전략(NANO_STEP 등)은 '신설 도달'로 세면 안 된다."""
    picked = ["NANO_STEP", "RESCHEDULE_DEFAULT", "GOAL_RECHECK"]
    assert new_strategies_reached(picked) == ["GOAL_RECHECK"]


def test_new_strategies_keep_catalog_order_not_input_order() -> None:
    """출력 순서는 입력 순서가 아니라 카탈로그 정의 순서 — 실행마다 순서가 흔들리면
    리포트를 눈으로 비교할 수 없다."""
    picked = ["GOAL_RECHECK", "BUFFER_INSERT", "TIMEBOX_REBUDGET"]
    assert new_strategies_reached(picked) == [
        "TIMEBOX_REBUDGET",
        "BUFFER_INSERT",
        "GOAL_RECHECK",
    ]


def test_no_new_strategy_reached_returns_empty() -> None:
    """도그푸딩 첫 실측에서 실제로 나올 수 있는 상태 — 빈 목록이 정상 출력이다."""
    assert new_strategies_reached(["NANO_STEP", "PARK_DEFAULT"]) == []


def test_duplicate_picks_are_reported_once() -> None:
    """여러 실행에서 같은 전략이 반복돼도 '도달 4종 중 몇 개'는 중복 없이 센다."""
    assert new_strategies_reached(["BUFFER_INSERT"] * 3) == ["BUFFER_INSERT"]


def test_new_strategy_list_matches_the_seed_migration() -> None:
    """#257 시드가 넣은 4종. 늘어나면 이 상수부터 고쳐야 리포트가 안 거짓말한다."""
    assert len(NEW_STRATEGY_TYPES) == 4
    assert "SELF_FORGIVENESS_NANO" in NEW_STRATEGY_TYPES


# ── preview_text — 사용자 콘텐츠 노출 상한 ──────────────────────────────


def test_long_text_is_truncated_to_the_limit() -> None:
    """위반 입력: 상한을 넘는 문구. 잘리지 않으면 Actions 로그에 전문이 남는다."""
    text = "가" * (TEXT_PREVIEW_CHARS + 50)
    out = preview_text(text)
    assert out.endswith("…")
    assert len(out) == TEXT_PREVIEW_CHARS + 1  # 본문 + 말줄임표


def test_short_text_is_not_marked_as_truncated() -> None:
    assert preview_text("15분만 앉아볼까요") == "15분만 앉아볼까요"


def test_whitespace_is_flattened_so_one_card_stays_one_line() -> None:
    """LLM 문구에 줄바꿈이 섞이면 출력이 깨져 카드 경계가 안 보인다."""
    assert preview_text("만약 오늘\n  저녁이라면\t딱 5분만") == "만약 오늘 저녁이라면 딱 5분만"


def test_missing_text_renders_placeholder() -> None:
    assert preview_text(None) == "(없음)"
    assert preview_text("") == "(없음)"
