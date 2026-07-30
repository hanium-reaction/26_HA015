"""Gemini Structured Output provider (단일 라이브러리 의존성 격리).

에이전트/오케스트레이터는 이 모듈을 **직접 import 하지 않는다** (AGENTS.md §2 —
LLM SDK 직접 import 금지). 진입점은 `llm/tool_executor.py` 의 `aiClient.run()` 뿐.

요구 사항:
- Pydantic 모델을 받아 Gemini Structured Output 으로 강제.
- 재시도/타임아웃/예산 가드는 상위(`tool_executor`) 책임.
- API key 없거나 SDK 미설치는 명시 에러 (`ProviderUnavailable`).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ValidationError

from reaction_backend.config import get_settings

if TYPE_CHECKING:
    # 타입 체크용 — 런타임 import 는 `_get_client()` 안에서.
    from google.genai import Client as GenaiClient  # noqa: F401

_log = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    """모든 provider 레벨 에러의 베이스."""


class ProviderUnavailable(ProviderError):
    """API key 누락·SDK 미설치 등 호출 자체가 불가능."""


class ProviderRateLimited(ProviderError):
    """429 / quota — Tool Executor 가 fallback 분기."""


class ProviderValidationError(ProviderError):
    """Structured Output 이 schema 검증을 통과하지 못함."""


@dataclass(slots=True)
class ProviderResponse:
    """raw provider 호출 결과 (구조화 검증 전)."""

    raw_text: str
    """Gemini 가 돌려준 JSON 문자열."""
    tokens_in: int
    tokens_out: int
    model: str


def _get_client() -> Any:
    """`google.genai.Client` 를 늦은 import 로 가져온다.

    API key 가 비어있으면 `ProviderUnavailable`.
    """
    api_key = get_settings().gemini_api_key
    if not api_key:
        raise ProviderUnavailable("GEMINI_API_KEY is not set")
    try:
        from google import genai  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - dependency declared in pyproject
        raise ProviderUnavailable("google-genai is not installed") from exc
    return genai.Client(api_key=api_key)


def _thinking_config(model_name: str, thinking_budget: int | None) -> dict[str, int] | None:
    """호출별 thinking 예산 → Gemini `thinking_config` (None = 설정을 아예 넘기지 않음).

    정책: **예산을 명시하지 않은 호출은 thinking 을 쓰지 않는다.** 분류·짧은 구조화 출력에
    thinking 은 품질 이득 대비 지연 손해가 크고, 그 지연이 agent lock 점유를 늘려 동시성
    충돌을 유발한다(#76). 추론이 필요한 호출(계획 분해·검토)만 예산을 명시한다.

    문제는 "thinking 을 쓰지 않는다" 를 표현하는 방법이 **모델군마다 다르다**는 것이다.
    실측(2026-07-30):

        모델                     예산 미지정      예산 0
        gemini-3.5-flash         사고 479 발생    OK (사고 0)
        gemini-3.5-flash-lite    사고 0           400 INVALID_ARGUMENT
        gemini-pro-latest        사고 243 발생    400 "Budget 0 is invalid"

    중간 티어 flash 만 0 을 받아들인다. lite 는 기본이 이미 비활성이라 0 이 무의미해 거부하고,
    pro 는 **thinking 을 끌 수 없다**(기본 활성 + 0 거부) — pro 로 올리면 모든 호출이 사고
    요금을 물게 되므로 도입 전에 비용을 다시 계산해야 한다. 현재 pro 는 쓰지 않는다.

    이전 구현은 `"2.5-flash" in model_name` 으로 판정했는데, 모델을 `-latest` alias 로 옮긴
    뒤 **어떤 모델에도 매칭되지 않는 죽은 가드**가 됐다. 그 사이 alias 가 `gemini-3.6-flash`
    로 올라가 예산 미지정 호출이 전부 기본 thinking 을 태웠고, 사고 토큰은 출력 요금으로
    과금되면서 기록에는 남지 않았다. 모델명 문자열 판정이 근본적으로 깨지기 쉬우므로
    **고정 모델**과 짝지어 쓰고, 아래 테스트로 두 계열을 모두 잠근다.
    """
    if thinking_budget is not None:
        return {"thinking_budget": thinking_budget}
    if _rejects_zero_thinking(model_name):
        return None
    return {"thinking_budget": 0}


def _rejects_zero_thinking(model_name: str) -> bool:
    """`thinking_budget=0` 을 400 으로 거부하는 모델인가.

    lite(기본이 이미 비활성) · pro(끌 수 없음) 둘 다 거부한다. 중간 티어 flash 만 받는다.
    새 모델을 도입할 때는 **실제로 호출해 보고** 이 판정을 갱신해야 한다 — 문서가 아니라
    응답이 진실이다. 잘못 판정하면 전 호출이 400 → 조용한 룰 폴백이 된다(화면엔 결과가
    나오므로 에러로 보이지 않는다).
    """
    return "lite" in model_name or "pro" in model_name


async def generate_structured[T: BaseModel](
    *,
    schema: type[T],
    prompt_text: str,
    timeout: float,
    thinking_budget: int | None = None,
    model: str | None = None,
) -> tuple[T, ProviderResponse]:
    """Gemini 한 번 호출 → schema 인스턴스로 검증.

    - timeout 은 호출자(`tool_executor`)가 asyncio.wait_for 로 래핑.
    - Structured Output 은 Gemini 의 `response_schema` 기능을 활용,
      그래도 모델이 schema 를 어기면 `ProviderValidationError`.
    - thinking_budget 은 호출별 thinking 예산(`_thinking_config`). None 이면 모델 기본 정책.
    - model 은 task 별 모델 오버라이드(`tool_executor` 가 module→model 로 결정). None 이면 base.
    """
    client = _get_client()
    model_name = model or get_settings().llm_model

    config: dict[str, Any] = {
        "response_mime_type": "application/json",
        "response_schema": schema,
    }
    tcfg = _thinking_config(model_name, thinking_budget)
    if tcfg is not None:
        config["thinking_config"] = tcfg

    try:
        # `google-genai` 2.x 비동기 API
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=prompt_text,
            config=config,
        )
    except Exception as exc:  # noqa: BLE001
        message = str(exc).lower()
        if "rate" in message or "quota" in message or "429" in message:
            raise ProviderRateLimited(str(exc)) from exc
        raise ProviderError(str(exc)) from exc

    raw_text = _extract_text(response)
    usage = _extract_usage(response, model_name)

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ProviderValidationError(f"non-JSON response: {raw_text[:200]}") from exc

    try:
        validated = schema.model_validate(parsed)
    except ValidationError as exc:
        raise ProviderValidationError(str(exc)) from exc

    return validated, usage


def _extract_text(response: Any) -> str:
    """`google-genai` 응답에서 텍스트 페이로드 추출. SDK 버전 차이 흡수."""
    text = getattr(response, "text", None)
    if isinstance(text, str) and text:
        return text
    # 폴백: candidates[0].content.parts[0].text
    candidates = getattr(response, "candidates", None) or []
    if candidates:
        content = getattr(candidates[0], "content", None)
        parts = getattr(content, "parts", None) or []
        if parts:
            inner = getattr(parts[0], "text", None)
            if isinstance(inner, str):
                return inner
    raise ProviderError("Gemini response missing text payload")


def _extract_usage(response: Any, model_name: str) -> ProviderResponse:
    """`usage_metadata` 가 있으면 활용, 없으면 0 으로 채움.

    `tokens_out` 은 **보이는 출력 + 사고(thinking) 토큰**이다. Gemini 는 셋을 따로 주는데
    (`candidates_token_count` / `thoughts_token_count`), **사고 토큰도 출력 요금으로 과금된다.**
    이전엔 `candidates` 만 셌다 — 실측한 계획 분해 1회에서 보이는 출력 4,118 · 사고 1,990 으로
    **33% 를 놓쳤다.** 그 숫자로 일일 토큰 예산을 판정했으니 비용 상한이 상한이 아니었고,
    청구서와 우리 기록이 어긋나 원인 추적도 안 됐다.

    `model` 은 응답이 알려주는 **실제 모델 버전**을 우선한다. 요청에 쓴 이름이 alias 면
    (`gemini-flash-latest`) 우리 기록만 봐서는 무엇이 돌았는지 알 수 없다 — 실제로 alias 가
    말없이 `gemini-3.6-flash` 로 올라간 것을 자체 기록으로는 발견하지 못했다.
    """
    usage = getattr(response, "usage_metadata", None)
    tokens_in = int(getattr(usage, "prompt_token_count", 0) or 0)
    visible_out = int(getattr(usage, "candidates_token_count", 0) or 0)
    thoughts = int(getattr(usage, "thoughts_token_count", 0) or 0)
    resolved = getattr(response, "model_version", None)
    return ProviderResponse(
        raw_text=_extract_text(response),
        tokens_in=tokens_in,
        tokens_out=visible_out + thoughts,
        model=str(resolved) if resolved else model_name,
    )
