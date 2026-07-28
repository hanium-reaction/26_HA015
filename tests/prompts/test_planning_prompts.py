"""planning 프롬프트 ↔ 코드 변수 계약 회귀 (AGENTS §"prompt 변경은 tests/prompts/ 로 보호").

`registry.render` 는 템플릿이 요구하는 `{{var}}` 가 **하나라도 빠지면** `PromptRenderError` 를
낸다. 그런데 `aiClient.run` 은 그 예외를 룰 폴백으로 흡수하므로, 계약이 깨져도 500 이 아니라
**조용히 룰 분해로 강등**된다 — 계획이 나오긴 하니 아무도 눈치채지 못한다. 그래서 여기서 잡는다.

⚠️ recovery 쪽과 같은 이유로 검사 대상을 **파일명으로 고정하지 않는다**: registry 는 버전을
생략한 `prompt_id` 를 `latest()` 로 해석하므로 새 버전 파일을 디렉터리에 떨어뜨리기만 해도
프로덕션이 그 버전으로 갈아탄다(별도 승격 절차 없음). 존재하는 **모든 버전**을 함께 검사한다.

코드 쪽 변수 집합은 하드코딩하지 않고 `context_from_outcome` 에서 **실제로 뽑아** 쓴다.
그래야 어댑터가 변수를 빼거나 이름을 바꿀 때 이 테스트가 자동으로 따라온다.
"""

from __future__ import annotations

import re

import pytest

from reaction_backend.orchestrator import interview_adapter
from reaction_backend.orchestrator.first_plan_adapter import context_from_outcome
from reaction_backend.prompts import registry
from reaction_backend.prompts.registry import PromptRenderError, PromptTemplate

_PH = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def _placeholders(body: str) -> set[str]:
    return set(_PH.findall(body))


def _all_versions(prompt_id: str) -> list[PromptTemplate]:
    domain, name = prompt_id.split("/", 1)
    return [t for t in registry.list_all() if t.domain == domain and t.name == name]


def _prompt_var_keys() -> set[str]:
    """어댑터가 실제로 만들어내는 prompt_vars 키 집합 (계약의 단일 진실 소스)."""
    outcome = interview_adapter.build_outcome(
        session_id="iv_prompt_contract",
        slot_answers={},
        ambiguity_final=0.1,
        end_reason="completed",
        analysis_source="rule",
    )
    return set(context_from_outcome(outcome)["prompt_vars"])


# 각 프롬프트를 부르는 코드가 넘기는 변수 집합.
#   planning/goal_decompose   ← first_plan.decompose_goal (prompt_vars + review_feedback + milestones)
#   planning/plan_milestones  ← first_plan_milestones.generate_milestones (prompt_vars 만)
CODE_VARS: dict[str, set[str]] = {
    "planning/goal_decompose": _prompt_var_keys() | {"review_feedback", "milestones"},
    "planning/plan_milestones": _prompt_var_keys(),
}


@pytest.mark.parametrize("prompt_id", list(CODE_VARS))
def test_every_version_placeholders_are_supplied_by_code(prompt_id: str) -> None:
    """존재하는 **모든** 버전의 placeholder 가 코드가 넘기는 변수로 전부 덮인다.

    부분집합(⊆) 검사인 이유: 코드가 넘기는데 템플릿이 안 쓰는 여분 변수는 render 가 조용히
    무시하므로 무해하다(예: plan_milestones 는 prompt_vars 중 일부만 쓴다). 반대로 템플릿에만
    있는 변수는 곧바로 PromptRenderError → 룰 폴백 강등이라 반드시 막아야 한다.
    """
    versions = _all_versions(prompt_id)
    assert versions, f"{prompt_id} 템플릿이 하나도 없다"
    for tmpl in versions:
        missing = _placeholders(tmpl.body) - CODE_VARS[prompt_id]
        assert not missing, (
            f"{tmpl.full_id} 가 코드가 넘기지 않는 변수 {sorted(missing)} 를 요구한다 — "
            "이 파일이 존재하는 것만으로 latest 가 되어 프로덕션이 조용히 룰 폴백으로 강등된다."
        )


@pytest.mark.parametrize("prompt_id", list(CODE_VARS))
def test_resolved_prompt_renders_with_code_variables(prompt_id: str) -> None:
    """**registry 가 해석한 것**(= 프로덕션이 쓰는 것)이 코드 변수만으로 렌더된다."""
    text, _ = registry.render(prompt_id, dict.fromkeys(CODE_VARS[prompt_id], "x"))
    assert text.strip()
    assert "{{" not in text


def test_missing_variable_raises_rather_than_silently_blanking() -> None:
    """변수 하나만 빠져도 render 가 **실패**한다 — 이 테스트가 지키는 실패 양식을 고정한다.

    (조용히 빈 값으로 채우고 넘어간다면 위 두 테스트가 아무것도 못 잡는다.)
    """
    full = dict.fromkeys(CODE_VARS["planning/goal_decompose"], "x")
    full.pop("sessions_per_week")
    with pytest.raises(PromptRenderError):
        registry.render("planning/goal_decompose", full)


def test_decompose_prompt_keeps_volume_and_cadence_contract() -> None:
    """분해 프롬프트가 '사용자가 말한 분량·세션 길이' 를 계속 전달한다.

    `sessions_per_week`/`session_length` 는 빈도(goals.frequency)와 주당 시간(goals.weekly_time)을
    화해시켜 뽑은 값이다. 프롬프트에서 사라지면 LLM 은 분량 기준 없이 마구 생성하고, 뒤의
    결정적 보정(`shape_action_plan`)이 초과분을 **잘라내기만** 해서 계획 뒷부분이 통째로
    사라진다 — 사용자에겐 '계획이 짧다' 로만 보이고 원인이 안 드러난다.
    """
    body = registry.get("planning/goal_decompose").body
    for var in ("sessions_per_week", "session_length", "weekly_hours"):
        assert f"{{{{{var}}}}}" in body, (
            f"{var} 가 분해 프롬프트에서 사라졌다 — 분량 기준이 없어진다."
        )


def test_decompose_prompt_keeps_milestone_and_grounding_contract() -> None:
    """확정 마일스톤·자료 grounding 변수가 살아 있다.

    `milestones` 가 빠지면 Stage A 에서 사용자가 **확인·확정한 뼈대**가 Stage B 에 전달되지 않아
    조용히 무시된다(HITL 로 받은 결정이 사라지는 것). `materials`/`approach_note` 가 빠지면
    붙여넣은 자료 원문 대신 LLM 이 일반적인 계획을 지어낸다.
    """
    body = registry.get("planning/goal_decompose").body
    for var in ("milestones", "materials", "approach_note"):
        assert f"{{{{{var}}}}}" in body, f"{var} 가 분해 프롬프트에서 사라졌다."
