"""M26 통과 조건이 조용히 표류하지 않게 고정한다 (실험계획서 §5, 2026-09-03 등록).

M26 은 L1-7A 의 **1차 지표**인데, M17~M25 의 "통과" 임계값이 없어 1차 실행이 산출하지
못했다. §5 에 조건을 등록하면서 그 조건이 **프로덕션 판정 함수 9개에 의존**하게 됐다 —
임계값을 내가 고르지 않고 룰이 이미 내리는 판정을 그대로 쓰기 위해서다.

**그래서 그 함수가 사라지거나 이름이 바뀌면 등록된 조건이 계산 불가가 된다.** 문서만
남으면 아무도 모른 채 M26 이 "부분 집합의 AND" 로 조용히 바뀐다. 이 파일이 그걸 막는다.

⚠️ 이 테스트는 **M26 값을 계산하지 않는다.** 계산에는 L1-7A v2 재실행과 스케줄러 경로가
아직 필요하다(§5 「M26 을 내려면 아직 남은 것」).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from reaction_backend.orchestrator import first_plan, first_plan_adapter

_ROOT = Path(__file__).resolve().parent.parent
_PLAN = _ROOT / "docs" / "experiments" / "experiment-plan-v1.md"

# §5 표의 각 행이 이름으로 지목한 프로덕션 판정 — (지표, 모듈, 속성).
_CRITERION_BACKING = [
    ("M17", first_plan_adapter, "session_min_for"),
    ("M18", first_plan_adapter, "horizon_minute_budget"),
    ("M18", first_plan_adapter, "planned_session_min_for"),
    ("M20", first_plan_adapter, "cadence_shortfall_notice"),
    ("M21", first_plan, "_UNPLACED_MARKER"),
    ("M22", first_plan_adapter, "horizon_coverage_notice"),
    ("M23", first_plan_adapter, "missing_milestone_titles"),
    ("M24", first_plan_adapter, "drop_out_of_cycle_branches"),
    ("M25", first_plan_adapter, "_WAITING_TITLE_RE"),
]


@pytest.mark.parametrize(("metric", "module", "attr"), _CRITERION_BACKING)
def test_registered_criterion_still_has_its_production_judge(
    metric: str, module: object, attr: str
) -> None:
    """등록된 통과 조건이 지목한 판정 함수가 아직 있는가.

    없어지면 **그 지표는 계산 불가**가 되고, M26 은 AND 에서 그 항목을 빼야 한다 —
    그런데 문서는 여전히 "M17~M25 전부" 라고 적혀 있을 것이다. 그 상태가 가장 나쁘다.
    """
    assert hasattr(module, attr), (
        f"{metric} 의 통과 조건이 지목한 `{attr}` 가 사라졌다 — "
        "실험계획서 §5 의 M26 통과 조건을 함께 고쳐야 한다"
    )


def test_m18_band_is_half_a_session_not_a_percentage() -> None:
    """M18 임계값이 **입도 유도**로 남아 있는가.

    비율 밴드(±10% 등)로 바뀌면 근거가 관측값밖에 없어진다 — 그게 §0.1 규칙 1번이 막는
    것이다. 공식이 문서에서 사라지면 빨강.
    """
    body = _PLAN.read_text(encoding="utf-8")
    assert "planned_session_min_for / 2" in body, "M18 의 반-세션 규칙이 §5 에서 사라졌다"
    assert "abs(총 분 − horizon_minute_budget)" in body


def test_m26_registration_keeps_its_honesty_disclosure() -> None:
    """**"완전한 사전등록이 아니다"** 는 고지가 붙어 있는가.

    이 조건을 쓴 시점에 L1-7A 의 M17·M18·M19·M25 수치를 이미 봤다. 그 사실이 지워지면
    독자가 이것을 온전한 사전등록으로 읽는다.
    """
    body = _PLAN.read_text(encoding="utf-8")
    assert "완전한 사전등록이 아니다" in body
    assert "이미 L1-7A" in body


def test_m26_is_not_reported_before_its_blockers_clear() -> None:
    """부분 집합의 AND 를 M26 이라 부르지 않는다는 규칙이 남아 있는가.

    L1-7A 가 M17·M19·M25 동시 통과율을 내면서 "이것은 M26 이 아니다" 라고 명시한 것과
    같은 규칙이다. 이 문장이 사라지면 다음 사람이 부분 AND 를 M26 으로 보고한다.
    """
    body = _PLAN.read_text(encoding="utf-8")
    assert "부분 집합의 AND 를 M26 이라 부르지 않는다" in body
    # 두 막는 조건이 표에 남아 있어야 한다.
    assert "L1-7A v2 재실행" in body
    assert "스케줄러 경로를 하네스에" in body


def test_uncomputable_cases_are_dropped_not_counted_as_pass() -> None:
    """미측정을 통과로 세지 않는다 — M24 처리 규칙.

    L1-7A 가 M24 분모를 42 → 24 로 줄인 것과 같은 처리다. 0 을 "결함 없음" 으로 세면
    M26 이 부풀려진다.
    """
    body = _PLAN.read_text(encoding="utf-8")
    assert '"미측정" 을 "통과" 로 세지 않는다' in body
    assert "can_refill" in body


def test_m33_arms_share_one_criterion_set() -> None:
    """M33 의 두 arm 에 같은 기준을 쓴다는 규칙.

    arm 마다 다른 임계값을 쓰면 차이가 층 효과인지 기준 차이인지 못 가른다.
    """
    body = _PLAN.read_text(encoding="utf-8")
    assert "M33 = ΔM26" in body or "M33 = ΔM26 이므로" in body
    assert "arm 마다 다른 기준을 쓰면" in body


def test_every_metric_from_m17_to_m25_has_a_registered_condition() -> None:
    """M17~M25 **아홉 개 전부**에 통과 조건이 등록돼 있는가.

    하나라도 비면 M26 은 정의되지 않는다(AND 이므로).
    """
    body = _PLAN.read_text(encoding="utf-8")
    start = body.index("#### 항목별 통과 조건")
    table = body[start : body.index("####", start + 10)]
    for n in range(17, 26):
        assert re.search(rf"\*\*M{n}\*\*", table), f"M{n} 의 통과 조건이 표에 없다"
