"""`interview._decide_storage` 표 단위 테스트 — 저장 결정 순수 함수 (LLM/async 없음).

validate_answer 의 분기(스킵/핵심/pending/제약/clarity)를 LLM stub 없이 표로 고정한다.
서명: _decide_storage(slot_key, answer_type, last_answer, normalized, clarity, attempts)
       -> (stored: dict|None, filled_now: bool)
"""

from __future__ import annotations

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


# ── #232 부연 설명이 유령 목표로 분리되는 문제 ─────────────────────────────
#
# 회귀 배경(코너 배터리 실측, 실 LLM): goals.list "전공책 3권을 완독하고 싶어요.
# 각 권당 10챕터 정도예요." 가 목표 **2개**로 정규화돼 '각 권당 10챕터 학습' 이라는 유령
# 목표가 생겼다. 그 유령이 heaviest 선택 chip 에 보기로 뜨고, "'각 권당 10챕터 학습'는 이번
# 계획에 넣지 않았어요" 헛경고를 만들고, proposed 목표로 영속돼 목표 목록에 남았다.


def _prune(items: list[str]) -> list[str]:
    stored = {"type": "text", "raw": ", ".join(items), "normalized": items}
    return interview._prune_goal_glosses("goals.list", stored)["normalized"]


@pytest.mark.parametrize(
    ("items", "expected"),
    [
        # 실측 케이스 — LLM 이 부연 설명을 목표꼴로 다듬어 올려도 걷어낸다
        (["전공책 3권 완독", "각 권당 10챕터 학습"], ["전공책 3권 완독"]),
        (["전공책 3권 완독", "각 권당 10챕터 정도예요"], ["전공책 3권 완독"]),
        (["강의 완강", "총 20강이에요"], ["강의 완강", "총 20강이에요"]),  # 약한 신호는 프롬프트 몫
        (["러닝 습관 만들기", "회당 30분"], ["러닝 습관 만들기"]),
        (["토익 800점", "지금은 600점쯤"], ["토익 800점"]),
        # 진짜 목표 여러 개는 절대 건드리지 않는다 (오탐 방지가 최우선)
        (["운동", "토익 준비", "캡스톤"], ["운동", "토익 준비", "캡스톤"]),
        (["매일 30분 러닝", "전공책 3권 완독"], ["매일 30분 러닝", "전공책 3권 완독"]),
        # 항목이 하나뿐이면 손대지 않는다
        (["각 권당 10챕터 정도예요"], ["각 권당 10챕터 정도예요"]),
    ],
)
def test_prune_goal_glosses(items: list[str], expected: list[str]) -> None:
    assert _prune(items) == expected


def test_first_item_is_never_pruned() -> None:
    """첫 항목은 정의상 gloss 가 아니다 — 목표가 통째로 사라지는 최악을 구조로 막는다."""
    assert _prune(["각 권당 10챕터 정도예요", "각 권당 10챕터 정도예요"]) == [
        "각 권당 10챕터 정도예요"
    ]


def test_prune_only_touches_goal_list() -> None:
    """다른 슬롯의 항목 리스트는 건드리지 않는다 — 판정 범위를 좁게 유지."""
    stored = {"type": "text", "raw": "x", "normalized": ["목표", "각 권당 10챕터"]}
    assert interview._prune_goal_glosses("goals.materials", stored) == stored


def test_prune_shrinks_machine_joined_raw_but_keeps_user_text() -> None:
    """raw 가 항목을 이어붙여 만든 것이면 같이 줄이고, 사용자 원문이면 보존한다."""
    joined = {
        "type": "text",
        "raw": "전공책 3권 완독, 각 권당 10챕터 학습",
        "normalized": ["전공책 3권 완독", "각 권당 10챕터 학습"],
    }
    assert interview._prune_goal_glosses("goals.list", joined)["raw"] == "전공책 3권 완독"

    original = {
        "type": "text",
        "raw": "전공책 3권을 완독하고 싶어요. 각 권당 10챕터 정도예요.",
        "normalized": ["전공책 3권 완독", "각 권당 10챕터 학습"],
    }
    pruned = interview._prune_goal_glosses("goals.list", original)
    assert pruned["raw"] == original["raw"], "사용자 원문은 보존"
    assert pruned["normalized"] == ["전공책 3권 완독"]


def test_goal_list_pruning_runs_through_decide_storage() -> None:
    """`_decide_storage` 경로(LLM 정규화 배열)에서도 유령 목표가 걸러진다."""
    stored, filled = _decide_storage(
        "goals.list",
        "text",
        {"type": "text", "raw": "전공책 3권을 완독하고 싶어요. 각 권당 10챕터 정도예요."},
        ["전공책 3권 완독", "각 권당 10챕터 학습"],
        0.9,
        1,
    )
    assert filled is True
    assert stored is not None and stored["normalized"] == ["전공책 3권 완독"]
