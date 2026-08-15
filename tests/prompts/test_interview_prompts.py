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
