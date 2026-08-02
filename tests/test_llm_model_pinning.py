"""모델 고정 · thinking 정책 · 토큰 회계 잠금.

배경(2026-07-30 비용 조사):
    설정이 `-latest` alias 였다. alias 는 Google 이 가리키는 대상을 말없이 바꾼다 — 실제로
    `gemini-flash-latest` 가 **`gemini-3.6-flash`** 로 올라가 있었고, 코드 변경 0건으로
    모델·단가·기본 thinking 정책이 전부 바뀌었다. 세 가지가 동시에 깨져 있었다:

    1. 어떤 모델이 도는지 아무도 고르지 않았다 (alias 자동 이동)
    2. thinking 을 끄는 가드가 `"2.5-flash" in model_name` 이라 **어떤 모델에도 매칭되지 않았다**
    3. `thoughts_token_count` 를 세지 않아 출력 토큰을 33% 놓쳤다 (사고 토큰도 출력 과금)

    3번 탓에 일일 토큰 예산 가드가 실제 사용량보다 낮게 판정했고, 청구서와 자체 기록이
    어긋나 원인 추적도 안 됐다.
"""

from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

from reaction_backend.config import Settings
from reaction_backend.llm.provider import _extract_usage, _thinking_config


@pytest.fixture(autouse=True)
def _ignore_ambient_llm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """셸에 남은 `LLM_*` 환경변수를 지운다 — `_settings()` 격리의 나머지 절반.

    `.env` 파일은 `_settings()` 의 `_env_file=None` 이 막고, 프로세스 환경변수는 여기서 막는다.
    """
    for key in list(os.environ):
        if key.startswith("LLM_"):
            monkeypatch.delenv(key, raising=False)


def _settings(**kw: object) -> Settings:
    """레포에 **커밋된 기본값**만으로 Settings 를 만든다.

    `_env_file=None` 이 필요한 이유: `Settings.model_config` 가 `env_file=".env"` 라 그냥
    만들면 개발자 머신의 `.env`(untracked)가 섞여 들어온다. 그러면 이 파일은 "레포 기본값이
    고정돼 있나" 가 아니라 "이 머신에서 해석된 값이 뭔가" 를 검사하게 된다 — 검사하려는 대상이
    아니다.

    실제로 그렇게 깨졌다(2026-08-03): 2026-07 이전 `.env`(`LLM_MODEL=gemini-2.5-flash`)가
    남은 로컬에서만 `test_defaults_are_pinned_to_3_5` 가 red 였고, `.env` 가 없는 CI 는 계속
    green 이었다. 자기 오버라이드가 있는 `planning`/`recovery` 는 통과하고 base 를 따르는
    `interview`/`inbox` 만 깨져서, 설정이 빠진 것처럼 보이기까지 했다.

    머신마다 답이 다른 잠금은 잠금이 아니다. 로컬 `.env` 가 낡았는지는 여기서 잡을 일이
    아니다 — 그 기준은 `.env.example` 이다.
    """
    base: dict[str, object] = {"gemini_api_key": "test-key"}
    base.update(kw)
    return Settings(_env_file=None, **base)  # type: ignore[arg-type]


# ── 모델 고정 ──────────────────────────────────────────────────────────────


def test_no_latest_alias_in_defaults() -> None:
    """기본 모델 설정에 `-latest` alias 가 없다.

    alias 는 조용히 이동한다. 퇴역(404)은 호출이 실패해서 알아채지만, alias 이동은
    알아챌 방법이 없다 — 요금이 바뀐 뒤에야 안다.
    """
    s = _settings()
    for module in ("interview", "planning", "recovery", "inbox", "brief"):
        model = s.model_for_module(module)
        assert "latest" not in model, f"{module} 이 alias 를 쓴다: {model}"


def test_defaults_are_pinned_to_3_5() -> None:
    """전부 3.5 고정. 계획은 lite 로 내렸고(실측), 회복만 상위 flash 를 유지한다.

    계획을 lite 로 내린 근거(2026-08-02, 동일 프롬프트 3회씩): 분해 계약(총 세션 수·사용자가
    말한 세션 길이)을 flash 와 동일하게 지키면서 회당 $0.0290 → $0.0073, 지연 9.9s → 7.4s.
    회복은 if-then 코핑 문장 자체가 산출물이라 아직 평가하지 않았다 — 평가 없이 내리지 않는다.
    """
    s = _settings()
    assert s.model_for_module("planning") == "gemini-3.5-flash-lite"
    assert s.model_for_module("recovery") == "gemini-3.5-flash"
    assert s.model_for_module("interview") == "gemini-3.5-flash-lite"
    assert s.model_for_module("inbox") == "gemini-3.5-flash-lite"


def test_empty_override_falls_back_to_base() -> None:
    s = _settings(llm_model_planning="")
    assert s.model_for_module("planning") == s.llm_model


# ── thinking 정책 — 두 모델군의 기본값이 정반대다 ──────────────────────────


def test_flash_disables_thinking_when_unspecified() -> None:
    """일반 flash 는 안 시키면 **한다** → 명시적으로 0 을 넘겨 꺼야 한다.

    실측: gemini-3.5-flash 에 예산을 안 주면 사고 479 토큰이 발생했다. 사고 토큰은
    출력 요금으로 과금되므로, 분류·짧은 출력 호출에서는 순수한 낭비다.
    """
    assert _thinking_config("gemini-3.5-flash", None) == {"thinking_budget": 0}


def test_lite_sends_no_thinking_config_at_all() -> None:
    """lite 는 안 시키면 안 한다. 그리고 **0 을 넘기면 400 으로 거부한다.**

    실측: gemini-3.5-flash-lite + thinking_budget=0 → 400 INVALID_ARGUMENT.
    거부되면 provider 예외 → 전 호출이 조용히 룰 폴백된다(화면엔 계획이 나온다).
    그래서 lite 에는 설정을 아예 넘기지 않는다.
    """
    assert _thinking_config("gemini-3.5-flash-lite", None) is None


def test_pro_cannot_disable_thinking() -> None:
    """pro 는 기본이 사고 활성이고 0 도 거부한다 — **끌 수 없다.**

    실측: gemini-pro-latest + 0 → 400 "Budget 0 is invalid", 예산 미지정 → 사고 243.
    pro 로 상향하면 모든 호출이 사고 요금을 문다. 도입 전 비용 재계산이 필요하다.
    """
    assert _thinking_config("gemini-2.5-pro", None) is None
    assert _thinking_config("gemini-pro-latest", None) is None


def test_explicit_budget_always_wins() -> None:
    """추론이 필요한 호출(계획 분해·검토)은 예산을 명시한다 — 모델군과 무관하게 그대로."""
    assert _thinking_config("gemini-3.5-flash", 2048) == {"thinking_budget": 2048}
    assert _thinking_config("gemini-3.5-flash-lite", 2048) == {"thinking_budget": 2048}
    assert _thinking_config("gemini-3.5-flash", 0) == {"thinking_budget": 0}


# ── 토큰 회계 ──────────────────────────────────────────────────────────────


def test_tokens_out_includes_thinking() -> None:
    """사고 토큰은 출력 요금으로 과금된다 → `tokens_out` 에 포함해야 한다.

    실측한 계획 분해 1회: 보이는 출력 4,118 · 사고 1,990. 사고를 빼면 33% 를 놓치고,
    그 숫자로 일일 예산을 판정하면 상한이 상한이 아니게 된다.
    """
    response = SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=1937,
            candidates_token_count=4118,
            thoughts_token_count=1990,
        ),
        model_version="gemini-3.5-flash",
        text="{}",
    )
    usage = _extract_usage(response, "gemini-3.5-flash")
    assert usage.tokens_in == 1937
    assert usage.tokens_out == 4118 + 1990


def test_records_resolved_model_version_not_requested_name() -> None:
    """응답이 알려주는 **실제** 모델을 기록한다.

    요청 이름만 남기면 alias 가 이동해도 자체 기록으로는 발견할 수 없다 — 실제로
    `gemini-flash-latest` 가 3.6 으로 올라간 것을 우리 기록으로는 못 찾았다.
    """
    response = SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=10, candidates_token_count=20, thoughts_token_count=0
        ),
        model_version="gemini-3.6-flash",
        text="{}",
    )
    assert _extract_usage(response, "gemini-flash-latest").model == "gemini-3.6-flash"


def test_falls_back_to_requested_name_without_model_version() -> None:
    """SDK 가 버전을 안 주면 요청 이름으로 — 기록이 비지는 않게."""
    response = SimpleNamespace(
        usage_metadata=SimpleNamespace(
            prompt_token_count=1, candidates_token_count=2, thoughts_token_count=None
        ),
        model_version=None,
        text="{}",
    )
    assert _extract_usage(response, "gemini-3.5-flash").model == "gemini-3.5-flash"


def test_missing_usage_metadata_is_zero_not_crash() -> None:
    response = SimpleNamespace(usage_metadata=None, model_version=None, text="{}")
    usage = _extract_usage(response, "gemini-3.5-flash")
    assert (usage.tokens_in, usage.tokens_out) == (0, 0)
