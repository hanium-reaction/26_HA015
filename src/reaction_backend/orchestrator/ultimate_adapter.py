"""Ultimate Goal Outcome 어댑터 (#6-B) — 궁극목표 인터뷰 경계 계약.

`build_ultimate_outcome` 은 Interview 그래프 터미널(`kind="ultimate"`)에서 호출되는
**순수 함수**다 (`interview_adapter.build_outcome` 과 대칭):
- slot_answers(인터뷰가 누적한 정규화 답) → `UltimateGoalOutcome` 결정적 투영.
- LLM 호출 0회 / DB 무관 → 경계에서 8s timeout·rate limit 실패 표면이 없다.

`InterviewOutcome` 을 확장하지 않고 별도 스키마(`schemas/ultimate_goal.py`)를 쓰는 이유:
1. `core_goals: list[GoalCandidate] = Field(min_length=1)` 때문에 궁극목표 세션도
   GoalCandidate 를 1개 만들어야 해 `PLACEHOLDER_GOAL_TITLE`("(미입력 목표)") 유령 목표가
   부활한다(`interview_adapter.is_placeholder_goal` 이 정확 일치 판정이라 우회 불가).
2. `availability`/`preferences` 도 필수라 묻지도 않은 활동창을 `_DEFAULT_ACTIVITY`(09:00~23:00)
   으로 지어내게 된다.
3. `schema_version: Literal["1.0"]` 를 bump 하면 `plan_drafts.payload` JSONB 에 스냅샷된
   기존 outcome 역직렬화가 깨진다(72h TTL 이라도 무중단 배포 창에 걸릴 수 있다).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

from reaction_backend.orchestrator.interview_catalog import ULTIMATE_REQUIRED_SLOT_KEYS
from reaction_backend.schemas.common import now_kst
from reaction_backend.schemas.interview import InterviewEndReason
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome

# 궁극목표 → 계획 인터뷰로 이월하는 슬롯 — ultimate.* 는 몇 년에 한 번 바뀌는 값이라 **전량**
# 이월 대상이다. 계획 인터뷰의 `interview_adapter.CARRY_OVER_SLOT_KEYS`(제외 목록이 아니라
# "이 슬롯들만 이어받는다"는 허용 목록)와 방향이 반대라 별도 상수로 둔다 — 기존 상수 주석이
# "매 주기 바뀌는 goals.* 제외" 라는 정반대 전제로 쓰였으므로 재사용하면 의미가 뒤집힌다.
ULTIMATE_CARRY_OVER_SLOT_KEYS: frozenset[str] = frozenset(
    f"ultimate.{name}"
    for name in (
        "statement",
        "domain",
        "horizon",
        "measure",
        "success_image",
        "identity",
        "current_position",
        "pillars_hint",
        "constraints",
        "values",
        "assets",
        "role_model",
    )
)

_NOT_SET = "아직 정하지 않음"


def is_filled_answer(value: Mapping[str, Any] | None) -> bool:
    """슬롯 값이 실질적으로 채워진 답인지 (`interview_adapter.is_filled_answer` 와 동일 규약)."""
    if not value:
        return False
    return value.get("type") != "pending"


def _chip_values(value: Mapping[str, Any] | None) -> list[str]:
    if not value or value.get("type") != "chip":
        return []
    raw = value.get("values")
    return [str(v) for v in raw] if isinstance(raw, Sequence) and not isinstance(raw, str) else []


def _text_raw(value: Mapping[str, Any] | None) -> str | None:
    if not value or value.get("type") != "text":
        return None
    raw = value.get("raw")
    return str(raw) if isinstance(raw, str) and raw.strip() else None


def _text_items(value: Mapping[str, Any] | None) -> list[str]:
    """text 슬롯의 normalized 리스트(없으면 raw 1개) — constraints·pillars_hint 처럼

    한 답에 여러 항목이 섞일 수 있는 슬롯용(`interview_adapter._text_items` 와 동일 규약).
    """
    if not value or value.get("type") != "text":
        return []
    norm = value.get("normalized")
    if isinstance(norm, Sequence) and not isinstance(norm, str):
        return [str(v) for v in norm if str(v).strip()]
    raw = value.get("raw")
    return [str(raw)] if isinstance(raw, str) and raw.strip() else []


def _first(items: Sequence[str]) -> str | None:
    return items[0] if items else None


_HORIZON_YEARS: dict[str, int | None] = {
    "3년": 3,
    "5년": 5,
    "7년": 7,
    "10년": 10,
    "10년 이상": 10,
    "기한 없음": None,
}


def _horizon_years(value: Mapping[str, Any] | None) -> int | None:
    chip = _first(_chip_values(value))
    return _HORIZON_YEARS.get(chip) if chip else None


def summary_variables(slot_answers: Mapping[str, Mapping[str, Any] | None]) -> dict[str, str]:
    """P3(`interview/ultimate_summary`) 프롬프트 변수 + 룰 폴백 공용 — 슬롯에서 사람이 읽을

    문자열로 추출(룰). `interview._summary_variables` 의 궁극목표판.
    """
    return {
        "statement": _text_raw(slot_answers.get("ultimate.statement")) or _NOT_SET,
        "measure": _text_raw(slot_answers.get("ultimate.measure")) or _NOT_SET,
        "horizon": _first(_chip_values(slot_answers.get("ultimate.horizon"))) or _NOT_SET,
        "identity": _text_raw(slot_answers.get("ultimate.identity")) or _NOT_SET,
        "current_position": _text_raw(slot_answers.get("ultimate.current_position")) or _NOT_SET,
        "constraints": ", ".join(_text_items(slot_answers.get("ultimate.constraints"))) or _NOT_SET,
    }


def build_ultimate_outcome(
    *,
    session_id: str,
    slot_answers: Mapping[str, Mapping[str, Any] | None],
    ambiguity_final: float,
    end_reason: InterviewEndReason,
    analysis_source: Literal["llm", "rule"],
) -> UltimateGoalOutcome:
    """slot_answers → UltimateGoalOutcome. LLM 0회·순수함수.

    빈 필수 슬롯은 빈 문자열/빈 리스트로 두고 `unresolved_slots` 에 키를 남긴다 — `GoalCandidate`
    처럼 `min_length=1` 계약이 없어 placeholder sentinel 이 필요 없다(설계서 §5.4 근거 1).
    """
    unresolved = [
        k for k in ULTIMATE_REQUIRED_SLOT_KEYS if not is_filled_answer(slot_answers.get(k))
    ]
    return UltimateGoalOutcome(
        session_id=session_id,
        generated_at=now_kst(),
        end_reason=end_reason,
        ambiguity_final=ambiguity_final,
        analysis_source=analysis_source,
        statement=_text_raw(slot_answers.get("ultimate.statement")) or "",
        domain=_first(_chip_values(slot_answers.get("ultimate.domain"))) or "",
        horizon_years=_horizon_years(slot_answers.get("ultimate.horizon")),
        measure=_text_raw(slot_answers.get("ultimate.measure")) or "",
        success_image=_text_raw(slot_answers.get("ultimate.success_image")) or "",
        identity_note=_text_raw(slot_answers.get("ultimate.identity")) or "",
        current_position=_text_raw(slot_answers.get("ultimate.current_position")) or "",
        constraints=_text_items(slot_answers.get("ultimate.constraints")),
        values=_chip_values(slot_answers.get("ultimate.values")),
        assets=_text_raw(slot_answers.get("ultimate.assets")),
        pillars_hint=_text_items(slot_answers.get("ultimate.pillars_hint")),
        unresolved_slots=unresolved,
    )


__all__ = [
    "ULTIMATE_CARRY_OVER_SLOT_KEYS",
    "build_ultimate_outcome",
    "is_filled_answer",
    "summary_variables",
]
