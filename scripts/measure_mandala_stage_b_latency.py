"""만다라 Stage B 지연 실측 — 배포 전 필수(전략 문서 §9.1, §11 항목 3).

`config.py:118-127` 의 goal_decompose 45초 타임아웃 결정과 같은 방식(같은 입력 3회,
실 Gemini 호출)으로 만다라 Stage B(`planning/mandala_cells`, 8축 × 축당 8칸 = 최대
64개 생성)가 실제로 45초 안에 들어오는지 확인한다. Stage A(`planning/mandala_subgoals`,
8개만 생성)도 같이 잰다 — 출력량이 훨씬 적어 위험도는 낮지만 "요청당 LLM 1콜" 파이프라인의
나머지 반쪽이라 같이 기록해 둔다.

**실패(45초 초과 또는 타임아웃→fallback)하면** 전략 문서 §11 항목 3 대로 A′(64칸을 축
4개씩 2콜로 쪼개기) + 202 폴링을 별도로 사람 합의에 올려야 한다 — 이 스크립트 출력이
그 판단 근거다. **성공하면** 이 파일 docstring 에 `config.py:78-86` 방식 그대로 실측
표를 남겨 §11 항목 3 을 닫는다.

⚠️ **비용 경고**: 기본 실행은 실 Gemini 호출 최대 6회(Stage A 3 + Stage B 3).
`GEMINI_API_KEY` 가 없으면 전부 fallback 으로 기록되고(지연 측정 자체가 무의미해진다),
키가 있으면 실제 과금이 발생한다(Stage B 1콜 ≈ ₩8, 전체 ≈ ₩30 수준 — 설계 문서 §9.2
비용 예산 참고).

`aiClient.run()` 을 직접 통과한다(AGENTS.md §2 — LLM SDK 직접 import 금지, Tool
Executor 경유). `agents/mandala_*_agent.py` 의 얇은 래퍼를 안 거치는 이유: 그 래퍼는
`(값, fell_back)` 만 돌려주고 `RunResult.latency_ms`/`tokens_*` 를 버린다 — 이 스크립트는
그 값이 필요하다. `session=None` 이라 budget check·`llm_runs` INSERT 는 건너뛴다
(`scripts/l1_1_generate.py` 와 같은 이유 — 오프라인 실측이지 실 사용자 트래픽이 아니다).

실행:
  uv run python -m scripts.measure_mandala_stage_b_latency                # Stage A+B 3회씩
  uv run python -m scripts.measure_mandala_stage_b_latency --repeats 1     # 스모크 1회씩
  uv run python -m scripts.measure_mandala_stage_b_latency --stage-b-only  # Stage B만
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass
from uuid import uuid4

from reaction_backend.config import get_settings
from reaction_backend.llm import RunResult, aiClient
from reaction_backend.orchestrator import mandala_adapter
from reaction_backend.schemas.common import now_kst
from reaction_backend.schemas.mandala import MandalaCellPlan, MandalaSubgoal, MandalaSubgoalPlan
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome

_log = logging.getLogger(__name__)

# 실 프로덕션 시나리오를 대표하는 고정 입력 — 테스트 스위트(test_mandala_adapter.py)와
# 같은 예시를 재사용해 특별히 짧거나 긴 케이스로 왜곡되지 않게 한다("같은 입력 3회"
# 조건은 매 실행 서로 다른 케이스를 섞으면 성립하지 않는다).
_OUTCOME = UltimateGoalOutcome(
    session_id="latency_probe",
    generated_at=now_kst(),
    end_reason="completed",
    ambiguity_final=0.1,
    analysis_source="llm",
    statement="메이저리그 8구단 드래프트 1순위",
    domain="체력·컨디션",
    horizon_years=5,
    measure="드래프트 1라운드 지명",
    success_image="구단 유니폼을 입고 첫 공을 던지는 순간",
    identity_note="매일 훈련을 거르지 않는 프로 지망생",
    current_position="고교 3학년, 지역 대회 4강",
    constraints=["부상 이력", "체중 관리"],
    values=["성장", "건강"],
    assets="강한 어깨",
    pillars_hint=["구위", "멘탈"],
    unresolved_slots=[],
)

# Stage B 입력용 — Stage A 를 사용자가 이미 확인·편집해 확정했다고 가정한 8축
# (앞 2개는 pillars_hint 에서 온 locked 축, 나머지는 LLM 이 채웠다고 가정).
_CONFIRMED_SUBGOALS = [
    MandalaSubgoal(order_index=0, title="구위", source="user", locked=True),
    MandalaSubgoal(order_index=1, title="멘탈", source="user", locked=True),
    MandalaSubgoal(order_index=2, title="체력", source="llm", locked=False),
    MandalaSubgoal(order_index=3, title="전략", source="llm", locked=False),
    MandalaSubgoal(order_index=4, title="회복", source="llm", locked=False),
    MandalaSubgoal(order_index=5, title="네트워크", source="llm", locked=False),
    MandalaSubgoal(order_index=6, title="기록분석", source="llm", locked=False),
    MandalaSubgoal(order_index=7, title="장비환경", source="llm", locked=False),
]


@dataclass
class _Sample:
    attempt: int
    latency_ms: int
    tokens_in: int
    tokens_out: int
    fell_back: bool
    reason: str | None


def _rule_subgoals_fallback() -> MandalaSubgoalPlan:
    return mandala_adapter.rule_subgoals(_OUTCOME)


def _rule_cells_fallback() -> MandalaCellPlan:
    return mandala_adapter.rule_cells(_CONFIRMED_SUBGOALS)


async def _probe(
    *, label: str, prompt_id: str, schema: type, variables: dict[str, str], fallback: object
) -> _Sample:
    settings = get_settings()
    result: RunResult = await aiClient.run(
        module="planning",
        schema=schema,
        prompt_id=prompt_id,
        fallback=fallback,
        timeout=settings.llm_planning_timeout_seconds,
        variables=variables,
        user_id=uuid4(),
        session=None,
        tone_mode=None,
        thinking_budget=settings.llm_planning_thinking_budget,
    )
    print(
        f"  [{label}] latency={result.latency_ms}ms tokens_in={result.tokens_in} "
        f"tokens_out={result.tokens_out} fell_back={result.fell_back} reason={result.reason}"
    )
    return _Sample(
        attempt=0,
        latency_ms=result.latency_ms,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        fell_back=result.fell_back,
        reason=result.reason,
    )


async def _measure_stage_a(repeats: int) -> list[_Sample]:
    print(f"\n=== Stage A (planning/mandala_subgoals) × {repeats} ===")
    variables = mandala_adapter.context_from_ultimate(_OUTCOME)
    samples = []
    for i in range(repeats):
        s = await _probe(
            label=f"Stage A #{i + 1}",
            prompt_id="planning/mandala_subgoals",
            schema=MandalaSubgoalPlan,
            variables=variables,
            fallback=_rule_subgoals_fallback,
        )
        s.attempt = i + 1
        samples.append(s)
    return samples


async def _measure_stage_b(repeats: int) -> list[_Sample]:
    print(f"\n=== Stage B (planning/mandala_cells) × {repeats} — 배포 게이트 ===")
    variables = {
        **mandala_adapter.context_from_ultimate(_OUTCOME),
        "subgoals": mandala_adapter.format_subgoals_list(_CONFIRMED_SUBGOALS),
    }
    samples = []
    for i in range(repeats):
        s = await _probe(
            label=f"Stage B #{i + 1}",
            prompt_id="planning/mandala_cells",
            schema=MandalaCellPlan,
            variables=variables,
            fallback=_rule_cells_fallback,
        )
        s.attempt = i + 1
        samples.append(s)
    return samples


def _summarize(name: str, samples: list[_Sample], *, threshold_s: float) -> bool:
    """threshold 안에 전부 들어왔고 fallback 이 하나도 없으면 True(§11 항목 3 '성공')."""
    if not samples:
        return True
    ok = all(not s.fell_back and s.latency_ms <= threshold_s * 1000 for s in samples)
    latencies = ", ".join(f"{s.latency_ms / 1000:.1f}s" for s in samples)
    verdict = "PASS" if ok else "FAIL"
    print(f"\n{name}: [{latencies}] — {threshold_s:.0f}s 상한 대비 {verdict}")
    if any(s.fell_back for s in samples):
        reasons = {s.reason for s in samples if s.fell_back}
        print(
            f"  ⚠️ fallback 발생(reason={reasons}) — GEMINI_API_KEY 미설정이면 이게 정상(측정 무의미)"
        )
    return ok


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=3, help="반복 횟수 (기본 3)")
    parser.add_argument("--stage-b-only", action="store_true", help="Stage B만 측정 (Stage A 생략)")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.gemini_api_key:
        print(
            "⚠️ GEMINI_API_KEY 가 설정되지 않았습니다 — 모든 호출이 즉시 fallback 되어 "
            "지연 측정이 무의미합니다. .env 에 실 키를 넣고 다시 실행하세요.\n"
        )

    stage_a_samples: list[_Sample] = []
    if not args.stage_b_only:
        stage_a_samples = await _measure_stage_a(args.repeats)
    stage_b_samples = await _measure_stage_b(args.repeats)

    print("\n" + "=" * 60)
    stage_a_ok = _summarize(
        "Stage A", stage_a_samples, threshold_s=settings.llm_planning_timeout_seconds
    )
    stage_b_ok = _summarize(
        "Stage B", stage_b_samples, threshold_s=settings.llm_planning_timeout_seconds
    )
    print("=" * 60)
    if stage_b_ok and (args.stage_b_only or stage_a_ok):
        print(
            "\n✅ §11 항목 3 해소 — 이 결과를 config.py:78-86 스타일 표로 옮겨 "
            "docstring 에 기록하면 미결 항목이 닫힙니다."
        )
    else:
        print(
            "\n❌ 45초 상한을 못 지키거나 fallback 이 났습니다 — §11 항목 3 대로 "
            "A′(축 4개씩 2콜) + 202 폴링을 사람 합의에 올려야 합니다."
        )


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    asyncio.run(main())
