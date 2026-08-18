"""Interview 프롬프트 렌더 회귀 (AGENTS.md §6 — prompt 변경은 tests/prompts/ 로 보호).

누락 변수는 `PromptRenderError` → tool_executor 가 조용히 룰 fallback 으로 빠진다
(사용자에겐 정상처럼 보임). 그 은폐를 막기 위해:
1. 각 프롬프트의 `{{var}}` 집합이 **코드가 실제로 넘기는 변수 집합과 정확히 일치**하는지
   (템플릿에 코드가 안 주는 변수가 생기면 = 런타임 fallback → 여기서 잡는다).
2. 그 변수 집합으로 렌더하면 예외 없이 모든 치환이 끝나는지.
3. 변수를 빼먹으면 실제로 `PromptRenderError` 가 나는지 (안전망 자체가 살아있는지).

`CODE_VARS` 는 `orchestrator/interview.py` 의 `ask_question`/`validate_answer`/
`summarize_interview` 가 넘기는 variables 와 동기화한다 (바뀌면 여기도 갱신).

⚠️ `interview/summary` 만은 **하드코딩하지 않고 코드에서 뽑는다**(`_summary_variables`).
나머지는 호출부에 변수가 인라인이라 목록으로 둘 수밖에 없지만, 요약은 빌더 함수가 단일
진실 소스라 뽑아 쓸 수 있다 — 하드코딩하면 빌더에 키를 더할 때 이 테스트가 따라오지 않아
계약이 조용히 표류한다(`plan_quality` 가 정확히 그렇게 표류했다).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import reaction_backend
from reaction_backend.orchestrator import interview
from reaction_backend.prompts import registry
from reaction_backend.prompts.registry import PromptRenderError

_PROMPTS_DIR = Path(reaction_backend.__file__).parent / "prompts" / "interview"

# 코드가 각 프롬프트에 실제로 넘기는 변수 집합.
CODE_VARS: dict[str, set[str]] = {
    "interview/next_question": {
        "goal_title",
        "answered_context",
        "ambiguous_slot",
        "slot_label",
        "answer_type",
        "options",
        "last_answer",
        "retry",
    },
    "interview/ambiguity_score": {"slot_key", "answer", "answer_type", "options", "today"},
    "interview/slot_extraction": {"answer", "answered_slot", "today", "open_slots"},
    # 아래 집합은 _summary_var_keys() 로 대체된다 (파일 하단에서 갱신) — 참고용 원본.
    "interview/summary": {
        "identity",
        "goals",
        "heaviest",
        "deadlines",
        "success_image",
        "time_window",
        "peak_window",
        "tone",
        "rest_ok",
        "downscope_unit",
    },
}


def _summary_var_keys() -> set[str]:
    """요약 프롬프트에 실제로 넘어가는 키 — 빌더에서 직접 뽑는다(계약의 단일 진실 소스)."""
    from uuid import uuid4

    state = interview.initial_state(session_id=uuid4(), user_id=uuid4())
    return set(interview._summary_variables(state))


CODE_VARS["interview/summary"] = _summary_var_keys()

_FILES = {
    "interview/next_question": "next_question.v1.md",
    "interview/ambiguity_score": "ambiguity_score.v1.md",
    "interview/slot_extraction": "slot_extraction.v1.md",
    "interview/summary": "summary.v1.md",
}

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def _placeholders(prompt_id: str) -> set[str]:
    text = (_PROMPTS_DIR / _FILES[prompt_id]).read_text(encoding="utf-8")
    return set(_PLACEHOLDER_RE.findall(text))


@pytest.mark.parametrize("prompt_id", list(CODE_VARS))
def test_placeholders_match_code_variables(prompt_id: str) -> None:
    """템플릿 {{var}} 집합 == 코드가 넘기는 변수 집합 (드리프트 = 런타임 fallback 방지)."""
    assert _placeholders(prompt_id) == CODE_VARS[prompt_id]


@pytest.mark.parametrize("prompt_id", list(CODE_VARS))
def test_renders_without_missing_variables(prompt_id: str) -> None:
    """코드 변수 집합으로 렌더하면 예외 없이 모든 {{}} 가 치환된다."""
    text, _tmpl = registry.render(prompt_id, dict.fromkeys(CODE_VARS[prompt_id], "x"))
    assert text.strip()
    assert "{{" not in text  # 남은 미치환 플레이스홀더 없음


def test_missing_variable_raises() -> None:
    """변수 누락 시 PromptRenderError — 안전망(그리고 이 회귀 테스트의 전제)이 살아있는지."""
    with pytest.raises(PromptRenderError):
        registry.render("interview/next_question", {})


def test_next_question_prompt_requires_naming_the_goal() -> None:
    """목표별 슬롯 질문이 '이 목표' 대신 실제 목표 이름을 쓰게 하는 규칙이 살아있는지 (#187).

    회귀 배경: 목표를 3개 말해도 계획은 heaviest 하나만 다루는데, 목표별 슬롯 6종은
    "이 목표는 한 번에 어느 정도…" 라고만 물어 **사용자가 무엇에 답하는지 알 수 없었다.**
    `goal_title` 변수는 예전부터 넘어갔지만 '이름을 넣어라' 는 지시가 없어 LLM 이 붙일
    때도 안 붙일 때도 있었다(확률적).
    """
    body = registry.get("interview/next_question").body
    assert "목표별 슬롯이면 어느 목표를 묻는지 질문에 드러내라" in body
    assert "지시어 대신 실제" in body
    # 과교정 방지 — 첫 시도에서 실측으로 회귀가 잡혔다(실 LLM 3회: 과교정 0건 → 8건).
    # recovery.*/time.* 는 **전역 설정**인데 목표 이름이 붙어 "그 목표 전용" 으로 읽혔다.
    # 기계적으로 판정 가능한 규칙 + 실제로 틀렸던 슬롯의 반례를 함께 박아 둔다.
    assert "슬롯키가 `goals.` 로 시작하지 않으면 목표 이름을 문장에 절대 넣지 마라" in body
    assert "모든 목표에 공통으로 적용되는 전역 설정" in body
    assert "회복 톤은 전역이다" in body
    assert "활동 시간대는 전역이다" in body
    # goals.heaviest 는 '보기 중 하나를 지목하지 말라'는 기존 규칙과 충돌하므로 반드시 제외.
    assert "`goals.list` · `goals.heaviest` 가 **아니면**" in body
    assert "이 중에서 지금 가장 무겁게 느껴지는 건 어떤 거예요?" in body  # 기존 규칙 생존


def test_ambiguity_prompt_forbids_promoting_glosses_to_goals() -> None:
    """goals.list 정규화가 부연 설명을 별개 목표로 올리지 못하게 하는 규칙이 살아있는지 (#232).

    회귀(코너 배터리 실측, 실 LLM): "전공책 3권을 완독하고 싶어요. 각 권당 10챕터 정도예요."
    가 목표 2개로 쪼개져 '각 권당 10챕터 학습' 이라는 유령 목표가 생겼다. 규칙이 조용히
    빠지면 결정적 백스톱(`_prune_goal_glosses`)이 좁아서 코드는 초록인 채 회귀가 돌아온다.
    """
    body = registry.get("interview/ambiguity_score").body
    assert "goals.list 는 '하고 싶은 일' 만 센다" in body
    assert "별개 목표가 아니라 직전 목표의 속성" in body
    # 진짜 목표 여러 개는 그대로 나눠야 한다 — 규칙이 과교정으로 기울지 않게 하는 반례.
    assert "이건 진짜 목표 2개다" in body
    # 상태·완료형 답에서 null 로 빠지면 룰 폴백이 원문을 쉼표로 쪼개 조각이 목표가 된다.
    # (코너 재점검에서 실제로 겪은 회귀 — 이 문구가 그 구멍을 막는다.)
    assert "goals.list 에서 normalized_value 를 null 이나 빈 값으로 두지 마라" in body
    assert "대학원 합격" in body
