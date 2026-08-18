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
from typing import Any
from uuid import uuid4

import pytest

from reaction_backend.orchestrator import first_plan, interview_adapter
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


def _review_var_keys() -> set[str]:
    """`_review_variables` 가 실제로 만들어내는 키 집합.

    plan_quality 는 prompt_vars 가 아니라 별도 dict 로 채워진다 — 그래서 이 계약이 오래
    빠져 있었고, 프롬프트가 코드와 무관하게 표류해도 아무도 몰랐다(v1 의 `≤60분` 규칙이
    goals.session_length 도입 이후에도 그대로 남아 사용자 값을 덮어썼다).
    """
    empty: Any = {
        "user_id": uuid4(),
        "outcome": None,
        "target_date": "2026-07-30",
        "scope": "horizon",
        "density": "standard",
        "milestones": None,
        "planning_context": {},
        "goal_plan": None,
        "schedule_warnings": [],
    }
    return set(first_plan._review_variables(empty))


# 각 프롬프트를 부르는 코드가 넘기는 변수 집합.
#   planning/goal_decompose   ← first_plan.decompose_goal (prompt_vars + review_feedback + milestones)
#   planning/plan_milestones  ← first_plan_milestones.generate_milestones (prompt_vars 만)
#   planning/plan_quality     ← first_plan._review_variables (별도 dict — prompt_vars 아님)
CODE_VARS: dict[str, set[str]] = {
    "planning/goal_decompose": _prompt_var_keys() | {"review_feedback", "milestones"},
    "planning/plan_milestones": _prompt_var_keys(),
    "planning/plan_quality": _review_var_keys(),
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


def test_review_prompt_defers_to_user_session_length() -> None:
    """검토 프롬프트가 **사용자가 말한 집중 길이**를 받아서 본다.

    회귀 배경: v1 은 `각 action_item 의 estimated_minutes ≤ 60` 이라는 고정 상한을 들고
    있었다. 그건 `goals.session_length` 슬롯이 생기기 전 규칙인데, 슬롯 도입 후에도 남아
    사용자가 "120분 집중 가능" 이라 답한 계획을 **3/3 반려**했고 재분해가 **2/2 로 60분으로
    줄였다**. 사용자가 명시한 값이 조용히 절반이 되고 계획 총량도 반토막 났다.

    세션 수(16개)는 그대로라 화면상 계획이 짧아 보이지도 않아 여태 드러나지 않았다.
    """
    body = registry.get("planning/plan_quality").body
    assert "{{session_length}}" in body, "검토기가 사용자 세션 길이를 받지 않는다"
    assert "60분 이하" not in body and "≤ 60" not in body, (
        "고정 60분 상한이 남아 있다 — 사용자가 말한 세션 길이를 덮어쓴다."
    )


def test_review_prompt_does_not_recheck_rule_enforced_limits() -> None:
    """룰이 이미 막는 것을 검토기가 다시 보지 않는다.

    목표 tier 한도는 분해 **이전**에 `validate_inputs` 가 룰로 막고 422 를 낸다. 그런데 v1
    체크리스트가 "Focus 카드 ≤ 3" 을 들고 action_items 를 받아, 세션이 많다는 이유로 반려하는
    사례가 실측에서 나왔다("집중해야 할 활동(Focus)의 개수가 다소 많아"). 마감이 멀수록
    세션이 많아지므로, 긴 계획일수록 더 자주 반려되는 구조였다.
    """
    body = registry.get("planning/plan_quality").body
    assert "세션이 많다는 이유로 반려하지 마라" in body


def test_decompose_prompt_forbids_waiting_step_sessions() -> None:
    """대기형 단계를 세션으로 만들지 않는 규칙이 프롬프트에 남아 있는지 (#225 1차 방어).

    회귀(FE 실측): '입학허가서 대기'·'비자 수령' 이 120분 세션 카드가 돼 오늘 목록에
    남았고, 체크할 수도 실패할 수도 없어 회복 제안이 헛돌았다. 코드 백스톱
    (`drop_waiting_steps`)은 강한 신호('대기/기다리')만 잡으므로, 넓은 판별은 이 규칙이
    맡는다 — 조용히 빠지면 코드는 초록인 채 회귀가 돌아온다.
    """
    body = registry.get("planning/goal_decompose").body
    assert "스스로 실행할 수 없는 단계는 세션(leaf 액션)으로 만들지" in body
    assert "수령/발급 대기" in body


def test_decompose_prompt_scopes_sessions_to_the_window() -> None:
    """구간 커버리지가 '앞부분만' 이면 구간 밖 단계를 세션화하지 않는 규칙 (#225 문제 2).

    회귀: 마일스톤은 목표 전체를 덮는데 세션 규칙이 "마감까지 전 구간" 이라고만 말해,
    몇 달짜리 여정 전체가 4주치 세션으로 압축됐다.
    """
    body = registry.get("planning/goal_decompose").body
    assert "{{window_coverage}}" in body
    assert "leaf 를 만들지 마라" in body
    # 옛 문구가 돌아오면 여정 압축이 재발한다 — 구간 기준 문구로 유지.
    assert "마감({{horizon}})까지 전 구간을 덮어야 한다" not in body


def test_decompose_prompt_allows_short_admin_tasks() -> None:
    """짧은 처리성 작업은 세션 길이로 부풀리지 않는 예외가 남아 있는지 (#225 문제 3)."""
    body = registry.get("planning/goal_decompose").body
    assert "짧은 처리성 작업" in body
