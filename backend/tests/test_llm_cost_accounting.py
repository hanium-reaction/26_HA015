"""LLM 비용 회계 — 모델별 단가 · 정밀도 잠금.

배경: "API 비용이 이상한데" 를 자체 기록으로 답하지 못했다. 세 가지가 겹쳤다 —
사고 토큰 미집계(별도 수정), 모델명이 alias(별도 수정), 그리고 **비용이 전부 0** 이었다.

여기서 막는 것:
- 요율이 하나뿐이라 6배 차이나는 두 모델을 뭉개는 것
- 정수 센트라 싼 호출이 0 으로 사라지는 것 (인터뷰 1회 ≈ 0.05센트)
- 새 모델로 갈아탔는데 단가표에 없어 비용이 장부에서 사라지는 것
"""

from __future__ import annotations

import logging
import os

import pytest

from reaction_backend.config import LLM_PRICING_USD_PER_1M, Settings
from reaction_backend.safety.llm_budget import (
    estimate_cost_cents,
    estimate_cost_micro_usd,
)

# 실측값(2026-07-30). 계획 분해 1회 / 인터뷰 질문 1회.
PLANNING_IN, PLANNING_OUT = 1327, 1304
INTERVIEW_IN, INTERVIEW_OUT = 959, 91


def test_every_configured_model_has_pricing(monkeypatch: pytest.MonkeyPatch) -> None:
    """설정이 실제로 쓰는 모델은 전부 단가표에 있어야 한다.

    이게 CI 의 요점이다 — 모델을 바꾸면서 단가표를 안 고치면 비용이 폴백 요율(기본 0)로
    떨어져 **장부에서 조용히 사라진다.** 우리가 이미 겪은 실패 모양이다.

    검사 대상은 **커밋된 기본값**이다. 로컬 `.env`/환경변수를 섞으면 머신마다 답이 달라진다
    — 근거는 `tests/test_llm_model_pinning.py` 의 `_settings()` 주석.
    """
    for key in list(os.environ):
        if key.startswith("LLM_"):
            monkeypatch.delenv(key, raising=False)
    s = Settings(_env_file=None, gemini_api_key="test-key")  # type: ignore[call-arg]
    for module in ("interview", "planning", "recovery", "inbox", "brief"):
        model = s.model_for_module(module)
        assert model in LLM_PRICING_USD_PER_1M, f"{module} 모델 {model!r} 의 단가가 없다"


def test_pricing_is_model_specific_not_flat() -> None:
    """같은 토큰이라도 모델이 다르면 비용이 달라야 한다.

    요율 하나로 뭉개면 어느 모듈이 돈을 쓰는지 영영 알 수 없다. lite 와 flash 는 출력
    단가가 3.6배 차이난다($2.50 vs $9.00).
    """
    lite = estimate_cost_micro_usd("gemini-3.5-flash-lite", 1000, 1000)
    flash = estimate_cost_micro_usd("gemini-3.5-flash", 1000, 1000)
    assert flash > lite
    # 입력 1.50/0.30 + 출력 9.00/2.50 → 합계는 정확히 (1.50+9.00)/(0.30+2.50) 배.
    assert flash / lite == pytest.approx((1.50 + 9.00) / (0.30 + 2.50))


def test_known_prices_compute_exactly() -> None:
    """단가 × 토큰이 정확히 맞는지 — 계획 분해 1회 실측 토큰으로."""
    # 1,327 × $1.50/1M + 1,304 × $9.00/1M = $0.0019905 + $0.011736 = $0.0137265
    micro = estimate_cost_micro_usd("gemini-3.5-flash", PLANNING_IN, PLANNING_OUT)
    assert micro == round((1327 * 1.50 + 1304 * 9.00) / 1_000_000 * 1_000_000)
    assert micro == 13726  # ≈ $0.0137 (13,726.5 → 짝수 반올림)


def test_cheap_call_survives_precision() -> None:
    """인터뷰 1회는 정수 센트로 0 이지만 마이크로 USD 로는 남아야 한다.

    이 정밀도 손실이 핵심이다 — 센트로만 기록하면 인터뷰 1,095회를 더해도 장부는 0 인데
    실제로는 약 $0.5 다. 호출 수로는 인터뷰가 전체의 68% 라 통째로 안 보이게 된다.
    """
    micro = estimate_cost_micro_usd("gemini-3.5-flash-lite", INTERVIEW_IN, INTERVIEW_OUT)
    cents = estimate_cost_cents("gemini-3.5-flash-lite", INTERVIEW_IN, INTERVIEW_OUT)
    assert micro > 0, "마이크로 USD 에서도 0 이면 정밀도가 부족하다"
    assert cents == 0, "정수 센트는 이 호출을 표현하지 못한다 (그래서 집계에 쓰면 안 된다)"
    # 1,095회 누적이 유의미한 금액으로 남는지.
    assert micro * 1095 > 400_000  # > $0.40


def test_unknown_model_warns_instead_of_silently_zeroing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """단가표에 없는 모델은 **경고**를 남긴다 — 조용한 0 은 금지.

    새 모델로 갈아탄 순간 비용이 사라지면 다음 청구서에서야 안다.
    """
    with caplog.at_level(logging.WARNING):
        estimate_cost_micro_usd("gemini-99-nonexistent", 1000, 1000)
    assert any("단가표에 없는 모델" in r.getMessage() for r in caplog.records)


def test_zero_tokens_cost_nothing() -> None:
    """예산 차단 등으로 호출 전에 폴백되면 토큰이 0 → 비용도 0."""
    assert estimate_cost_micro_usd("gemini-3.5-flash", 0, 0) == 0
    assert estimate_cost_cents("gemini-3.5-flash", 0, 0) == 0


def test_thinking_tokens_are_not_double_counted() -> None:
    """`tokens_out` 이 이미 사고 토큰을 포함한다 — 단가 계산에서 또 더하지 않는다.

    provider `_extract_usage` 가 candidates + thoughts 를 합쳐서 준다. 여기서 한 번 더
    가산하면 이중 계상이 된다.
    """
    visible, thoughts = 4118, 1990
    combined = estimate_cost_micro_usd("gemini-3.5-flash", 0, visible + thoughts)
    separate = estimate_cost_micro_usd("gemini-3.5-flash", 0, visible) + estimate_cost_micro_usd(
        "gemini-3.5-flash", 0, thoughts
    )
    assert combined == separate  # 선형이라 이중 가산이 있으면 깨진다
