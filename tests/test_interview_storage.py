"""`interview._decide_storage` 표 단위 테스트 — 저장 결정 순수 함수 (LLM/async 없음).

validate_answer 의 분기(스킵/핵심/pending/제약/clarity)를 LLM stub 없이 표로 고정한다.
서명: _decide_storage(slot_key, answer_type, last_answer, normalized, clarity, attempts)
       -> (stored: dict|None, filled_now: bool)
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from reaction_backend.orchestrator import interview
from reaction_backend.orchestrator.interview import _SKIP_MARKER, _decide_storage, _pending

_TEXT = {"type": "text", "raw": "x"}  # 대표 자유서술 raw (내용은 normalized/clarity 로 제어)


@pytest.mark.parametrize(
    ("slot_key", "answer_type", "last_answer", "normalized", "clarity", "attempts", "expected"),
    [
        # 답 미주입(배치 그래프) → 저장·충족 없음
        ("identity.role", "chip", None, None, 0.9, 1, (None, False)),
        # chip: LLM 정규화값 → chip 구조로 저장, 충족
        (
            "identity.role",
            "chip",
            {"type": "text", "raw": "컴공 3학년"},
            "3학년",
            0.2,
            1,
            ({"type": "chip", "values": ["3학년"]}, True),
        ),
        # text 고clarity → 저장·충족
        (
            "goals.success_image",
            "text",
            {"type": "text", "raw": "발표 잘 마치기"},
            "발표 잘 마치기",
            0.9,
            1,
            ({"type": "text", "raw": "발표 잘 마치기"}, True),
        ),
        # text 저clarity·비스킵·비핵심·상한 전 → 재질문(pending)
        (
            "goals.success_image",
            "text",
            {"type": "text", "raw": "음 그냥"},
            None,
            0.1,
            1,
            (_pending(1), False),
        ),
        # text 스킵 의사(비핵심) → 스킵 저장·진행
        (
            "goals.success_image",
            "text",
            {"type": "text", "raw": "없어"},
            None,
            0.0,
            1,
            (_SKIP_MARKER, True),
        ),
        # 제약 슬롯(chip) LLM 매핑 실패·비스킵·비핵심 → 스킵으로 진행(무루프)
        (
            "recovery.tone",
            "chip",
            {"type": "text", "raw": "빨간색으로"},
            None,
            0.1,
            1,
            (_SKIP_MARKER, True),
        ),
        # 핵심(goals.list) 스킵 신호·상한 전 → 스킵 거부, 재질문(pending)
        ("goals.list", "text", {"type": "text", "raw": "없어"}, "", 0.1, 1, (_pending(1), False)),
        # 핵심(goals.list) 상한 도달·비지 않은 답 → best-effort 채택·진행
        (
            "goals.list",
            "text",
            {"type": "text", "raw": "그냥 뭐라도"},
            "",
            0.1,
            3,
            ({"type": "text", "raw": "그냥 뭐라도"}, True),
        ),
        # 핵심(goals.heaviest) LLM 못 고름·상한 전 → 재질문(pending)
        (
            "goals.heaviest",
            "select",
            {"type": "text", "raw": "이것저것"},
            None,
            0.2,
            2,
            (_pending(2), False),
        ),
        # ── 빈 답 = 명시적 '넘기기' (회귀: "없으면 넘겨도 돼요" 슬롯이 빈 답을 3회 재질문) ──
        # 비핵심 text 빈 답 → 첫 시도에 곧장 스킵 저장·진행
        (
            "goals.materials",
            "text",
            {"type": "text", "raw": ""},
            None,
            0.0,
            1,
            (_SKIP_MARKER, True),
        ),
        # 공백뿐인 답도 빈 답이다
        (
            "goals.approach",
            "text",
            {"type": "text", "raw": "   "},
            None,
            0.0,
            1,
            (_SKIP_MARKER, True),
        ),
        # 빈 답에서 LLM 이 값을 '추출'했다 주장해도(has_real 경로) 믿지 않는다 —
        # 사용자는 아무것도 입력하지 않았으므로 스킵이 이긴다.
        (
            "goals.frequency",
            "chip",
            {"type": "text", "raw": ""},
            "주 3회",
            0.9,
            1,
            (_SKIP_MARKER, True),
        ),
        # 핵심 슬롯의 빈 답은 스킵 불가 — 기존 재질문(pending) 경로 유지
        ("goals.list", "text", {"type": "text", "raw": ""}, None, 0.0, 1, (_pending(1), False)),
    ],
)
def test_decide_storage(
    slot_key: str,
    answer_type: str,
    last_answer: dict[str, Any] | None,
    normalized: Any,
    clarity: float,
    attempts: int,
    expected: tuple[dict[str, Any] | None, bool],
) -> None:
    assert (
        _decide_storage(slot_key, answer_type, last_answer, normalized, clarity, attempts)
        == expected
    )


def test_critical_slots_are_goal_defining() -> None:
    """핵심 슬롯 정의가 '핵심 목표'(goals.list/heaviest)인지 — 스킵 거부 대상."""
    assert frozenset({"goals.list", "goals.heaviest"}) == interview.CRITICAL_SLOTS


# ── #231 지난 마감 되묻기 ────────────────────────────────────────────────────
#
# 회귀 배경(코너 배터리 실측, 실 LLM): "마감이 지났는데 아직 못 냈어요" + 마감 2026-08-01
# (11일 전) 을 인터뷰가 **아무 확인 없이** 통과시켰다. 마감은 date_picker →
# `_CONSTRAINED_TYPES` 라 clarity 게이트를 통째로 건너뛰기 때문. 그 결과 계획 배치 창이
# 오늘 하루로 붕괴해 3세션 중 1개만 배치되고 나머지는 "가용 시간을 찾지 못했어요" 경고로 남았다.

_TODAY = date(2026, 8, 12)
_DEADLINE_PICKED = {"type": "text", "raw": "2026-08-01"}


def test_past_deadline_is_asked_again_instead_of_stored() -> None:
    """지난 마감은 저장하지 않고 되묻는다 — pending 에 사유를 실어 다음 질문이 이유를 안다."""
    stored, filled = _decide_storage(
        "goals.deadlines", "date_picker", _DEADLINE_PICKED, "2026-08-01", 0.9, 1, _TODAY
    )
    assert filled is False, "지난 마감이 그대로 충족 처리되면 안 된다"
    assert stored == _pending(1, interview._RETRY_PAST_DEADLINE)


def test_future_and_today_deadlines_store_normally() -> None:
    """오늘·미래 마감은 기존대로 한 번에 저장 — 되묻기가 정상 답까지 잡으면 안 된다."""
    for raw in ("2026-08-12", "2026-12-31"):
        stored, filled = _decide_storage(
            "goals.deadlines", "date_picker", {"type": "text", "raw": raw}, raw, 0.9, 1, _TODAY
        )
        assert (stored, filled) == ({"type": "text", "raw": raw}, True), raw


def test_past_deadline_is_accepted_at_the_attempt_cap() -> None:
    """상한(MAX_SLOT_ATTEMPTS)에 닿으면 사용자 뜻으로 보고 받는다 — 무한 재질문 금지.

    여기서부터는 플래닝 백스톱(`first_plan_adapter.is_overdue_deadline`)이 배치 창 붕괴를 막는다.
    """
    stored, filled = _decide_storage(
        "goals.deadlines",
        "date_picker",
        _DEADLINE_PICKED,
        "2026-08-01",
        0.9,
        interview.MAX_SLOT_ATTEMPTS,
        _TODAY,
    )
    assert (stored, filled) == (_DEADLINE_PICKED, True)


def test_deadline_skip_is_not_treated_as_past() -> None:
    """'마감 없어요'(빈 답 → 스킵 마커)는 지난 마감이 아니다 — 되묻기에 걸리면 안 된다."""
    stored, filled = _decide_storage(
        "goals.deadlines", "date_picker", {"type": "text", "raw": ""}, None, 0.0, 1, _TODAY
    )
    assert (stored, filled) == (_SKIP_MARKER, True)


def test_past_date_in_other_slots_is_untouched() -> None:
    """마감 슬롯이 아닌 곳의 과거 날짜 문자열은 건드리지 않는다 — 판정 범위를 좁게 유지."""
    stored, filled = _decide_storage(
        "goals.success_image",
        "text",
        {"type": "text", "raw": "2026-08-01"},
        "2026-08-01",
        0.9,
        1,
        _TODAY,
    )
    assert filled is True


def test_retry_hint_tells_the_question_why_the_date_was_rejected() -> None:
    """되묻기 힌트가 '모호함' 이 아니라 '지난 날짜' 를 짚어야 한다 (프롬프트 문구 회귀 핀).

    사유 없이 기존 힌트가 나가면 LLM 이 "조금 더 구체적으로 말해달라" 는 엉뚱한 재질문을
    만든다 — 사용자가 준 날짜는 모호하지 않았다.
    """
    hint = interview._retry_hint("goals.deadlines", 1, interview._RETRY_PAST_DEADLINE)
    assert "이미 지난 날짜" in hint
    assert "언제까지 끝내고 싶은지" in hint
    assert "다그치지 말고" in hint  # 톤 잠금: "on your side, not on your case"
    # 사유가 없으면 기존(모호함) 힌트 그대로 — 다른 슬롯 재질문 문구를 바꾸지 않았다.
    assert "지난" not in interview._retry_hint("goals.deadlines", 1)
