"""L1-7A 하네스 — 첫 계획 준수도 (실 LLM 호출).

`docs/experiments/experiment-plan-v1.md` §2 L1-7A 를 실행한다. 가설:

> **H1-7A**: LLM 분해 원안은 사용자가 명시한 제약(세션 길이·주당 분량·빈도)을 상당 비율로
> 벗어나며, 그 이탈을 ③층 결정적 보정이 흡수하고 있다. 즉 **현재 계획 품질의 상당 부분은
> LLM 이 아니라 룰이 만들고 있다.**

그래서 이 하네스의 핵심은 **③층 보정 전/후를 둘 다 기록**하는 것이다. 보정 후만 보면
"계획이 제약을 지킨다" 는 결론이 나오는데, 그건 룰이 지킨 것이지 LLM 이 지킨 게 아니다.

## 정답 라벨이 없어도 되는 이유

정답이 설계자가 아니라 **사용자가 인터뷰에서 답한 값**이다(`session_length_min` /
`weekly_hours` / `frequency_per_week` / `horizon`). `eval/README.md` 가 회복 골든셋에서
경계한 "설계 의도를 정확도로 쓰면 자기충족적" 문제를 원리적으로 피한다.

## 지금 재는 것과 안 재는 것

| 지표 | 상태 |
|---|---|
| M17 `session_length_compliance` | ✅ 상한초과/하한미달 2분해 |
| M18 `volume_budget_ratio` | ✅ 1.0 기준 양방향 |
| M19 `truncation_rate` | ✅ `_take_within_budget` 이 실제로 자른 수 |
| M23 `milestone_fidelity` | ✅ `milestone_fixed` 6건에서만 (나머지는 분모 0 — 미측정) |
| M24 `out_of_cycle_rate` | ✅ 〃, `can_refill` 케이스에서만 |
| M25 `waiting_step_rate` | ✅ `_WAITING_TITLE_RE` 백스톱이 잡은 수 |
| M20 `cadence_compliance` | ❌ **스케줄러 필요** — `cadence_shortfall_notice` 가 배치 결과를 받는다 |
| M21 `placement_rate` | ❌ 〃 |
| M22 `horizon_coverage` | ❌ 〃 |
| M26 `first_plan_pass_rate` | ❌ **정의가 아직 성립 안 함** — `eval/README.md` 한계표 1번 |

⚠️ **M26 을 억지로 내지 않는다.** M17~M25 의 AND 인데 M18·M19·M24·M25 는 비율이고
"통과" 판정 임계값을 §191 이 사전 고정하지 않기로 했다. 분석 시점에 임계값을 정하는 것은
§0.1 정직성 규칙 1번 위반이다. 여기서는 **원자료만 낸다.**

## 실행

    uv run python scripts/l1_7_run.py --dry-run          # LLM 없이 구조 확인
    uv run python scripts/l1_7_run.py --limit 3          # 스모크
    uv run python scripts/l1_7_run.py --repeats 3        # 본 실행

원자료는 `eval/l1_7_results.jsonl` (비결정적 실 LLM 결과라 `.gitignore`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from reaction_backend.orchestrator import first_plan, first_plan_adapter
from reaction_backend.schemas.interview import (
    AvailabilityProfile,
    GoalCandidate,
    IdentityContext,
    InterviewOutcome,
    PreferenceProfile,
    TimeRange,
)
from reaction_backend.schemas.planning import GoalDecomposition, GoalNodeDraft, MilestoneDraft

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_ROOT = Path(__file__).resolve().parent.parent
CASES_PATH = _ROOT / "eval" / "golden_first_plan_cases.jsonl"
RESULTS_PATH = _ROOT / "eval" / "l1_7_results.jsonl"
KST = timezone(timedelta(hours=9))

# 폴백 계획은 "LLM 이 제약을 지켰는가" 에 대해 아무것도 말하지 않는다 — 집계에서 뺀다.
# `goal_nodes` 는 min_length=1 이라 빈 리스트를 주면 ValidationError 로 죽는다(l1_6 전례).
_FALLBACK_NODE = GoalNodeDraft(
    node_id="fallback-root",
    parent_id=None,
    title="(폴백)",
    node_type="root",
    order_index=0,
    is_leaf=False,
)


def load_cases(limit: int | None = None, blocks: list[str] | None = None) -> list[dict[str, Any]]:
    """`decompose` 케이스만 읽는다 — `verify` 는 L1-7B(검토기) 몫이다."""
    rows = [
        json.loads(line)
        for line in CASES_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    cases = [c for c in rows if c["kind"] == "decompose"]
    if blocks:
        cases = [c for c in cases if c["block"] in blocks]
    return cases[:limit] if limit else cases


def build_outcome(case: dict[str, Any], *, today: date) -> InterviewOutcome:
    """저장된 슬롯으로 `InterviewOutcome` 을 되짚는다.

    ⚠️ 마감은 **상대 오프셋**으로 저장돼 있다(`deadline_offset_days`). 실행일 + 같은
    오프셋으로 만들어야 마감까지 남은 일수가 골든셋을 구울 때와 같아진다 — 절대 날짜를
    저장했다면 하루만 지나도 '마감 임박' 이 '마감 지남' 이 된다.
    """
    interview, goal = case["interview"], case["interview"]["goal"]
    deadline = (today + timedelta(days=goal["deadline_offset_days"])).isoformat()
    return InterviewOutcome(
        session_id=f"l1-7-{case['case_id']}",
        generated_at=datetime(today.year, today.month, today.day, 9, 0, tzinfo=KST),
        end_reason="completed",
        ambiguity_final=0.1,
        analysis_source="llm",
        identity=IdentityContext(role=interview["role"], season=interview["season"]),
        core_goals=[
            GoalCandidate(
                title=goal["title"],
                category=goal["category"],
                is_heaviest=True,
                tentative_tier="focus",
                confidence=0.9,
                deadline=deadline,
                success_image=goal["success_image"],
                current_level=goal["current_level"],
                session_length_min=goal["session_length_min"],
                weekly_hours=goal["weekly_hours"],
                frequency_per_week=goal["frequency_per_week"],
                preferred_time=interview["preferred_time"],
                approach_note=goal.get("approach_note"),
            )
        ],
        availability=AvailabilityProfile(
            activity_window=TimeRange(start="09:00", end="23:00"),
            peak_window=[interview["preferred_time"]],
        ),
        preferences=PreferenceProfile(
            recovery_tone="담백",
            rest_ok=True,
            downscope_unit_min=15,
            focus_duration_min=interview["focus_duration_min"],
        ),
        horizon=deadline,
    )


def cycle_window(
    case: dict[str, Any], outcome: InterviewOutcome, today: date
) -> list[MilestoneDraft]:
    """이번 주기가 다룰 마일스톤 — 프로덕션 `_cycle_milestones` 와 같은 계산.

    ⚠️ `horizon_weeks` 를 **상수로 흉내내지 않는다.** 2026-09-02 에 테스트에서 `2` 를
    하드코딩했다가 전 케이스의 수치가 틀렸다 — 2 는 만다라 유래 목표 전용 값이다.
    """
    raw = case["interview"].get("milestones") or []
    if not raw:
        return []
    milestones = [MilestoneDraft(title=m["title"], summary=m["summary"]) for m in raw]
    return first_plan_adapter.cycle_milestone_window(
        milestones,
        cursor=case["interview"].get("milestone_cursor", 0),
        horizon_weeks=first_plan_adapter._horizon_weeks(today, outcome.horizon),
        full_horizon_weeks=first_plan_adapter.full_horizon_weeks(today, outcome.horizon),
    )


def _out_of_cycle_note(case: dict[str, Any], window: list[MilestoneDraft]) -> str:
    """`first_plan._out_of_cycle_note` 와 **같은 문자열**을 만든다.

    프로덕션 쪽은 `FirstPlanState` 를 받아서 그대로 못 부른다. 로직을 옮겨 적었으므로
    **그쪽을 고치면 여기도 고쳐야 한다** — 갈리면 LLM 이 프로덕션과 다른 경계를 읽는다.
    """
    all_ms = case["interview"].get("milestones") or []
    if not all_ms:
        return "(없음)"
    titles = [m["title"] for m in all_ms]
    window_titles = {m.title for m in window}
    cursor = int(case["interview"].get("milestone_cursor") or 0)
    done = titles[:cursor]
    later = [t for t in titles[cursor:] if t not in window_titles]
    lines = []
    if done:
        lines.append("- 이미 끝낸 단계(다시 시키지 말 것): " + " / ".join(done))
    if later:
        lines.append("- 다음 주기가 받을 단계(여기서 시작하지 말 것): " + " / ".join(later))
    return "\n".join(lines) if lines else "(없음)"


def score_raw(
    outcome: InterviewOutcome, raw: GoalDecomposition, window: list[MilestoneDraft], today: date
) -> dict[str, Any]:
    """③층 **보정 전 원안**에 대한 M17·M18·M19·M23·M24·M25."""
    items = raw.action_items
    n = len(items)
    ceiling = first_plan_adapter.session_min_for(outcome)
    floor = min(15, first_plan_adapter.planned_session_min_for(outcome), ceiling)
    minutes = [a.estimated_minutes or 0 for a in items]

    over = sum(1 for m in minutes if m > ceiling)
    under = sum(1 for m in minutes if m < floor)
    budget = first_plan_adapter.horizon_minute_budget(outcome, "standard", target_date=today)

    # M19 — ③층이 실제로 몇 개를 잘라내는가. 상한 두 개를 프로덕션과 같은 인자로 건다.
    kept = first_plan_adapter._take_within_budget(
        first_plan_adapter.normalize_action_minutes(outcome, list(items)),
        budget_min=budget,
        max_count=first_plan_adapter.cadence_session_cap(outcome, "standard", target_date=today),
    )
    # M25 — '외부 대기' 백스톱이 잡은 수 = 분해 프롬프트 규칙이 놓친 양
    _dropped_plan, waiting = first_plan_adapter.drop_waiting_steps(raw)

    row: dict[str, Any] = {
        "raw_leaf_count": n,
        "session_ceiling": ceiling,
        "session_floor": floor,
        "m17_over_ceiling": over,
        "m17_under_floor": under,
        "m17_in_band": n - over - under,
        "m18_raw_minutes": sum(minutes),
        "m18_budget": budget,
        "m18_ratio": (sum(minutes) / budget) if budget else None,
        "m19_truncated": max(0, n - len(kept)),
        "m25_waiting": len(waiting),
    }
    if window:
        missing = first_plan_adapter.missing_milestone_titles(window, raw)
        row["m23_window"] = len(window)
        row["m23_missing"] = len(missing)
        branches = [x for x in raw.goal_nodes if x.node_type == "branch"]
        _kept_plan, out_of_cycle = first_plan_adapter.drop_out_of_cycle_branches(raw, window)
        row["m24_branches"] = len(branches)
        row["m24_out_of_cycle"] = len(out_of_cycle)
    return row


def waterfall(
    outcome: InterviewOutcome, raw: GoalDecomposition, window: list[MilestoneDraft], today: date
) -> dict[str, int]:
    """F21 — 룰 개입량 폭포. ③층 각 단계 **뒤**의 leaf 수를 프로덕션 순서대로 기록한다.

    `decompose_goal` 과 같은 순서: drop_waiting → drop_out_of_cycle(되채울 수 있을 때만)
    → shape → extend.
    """
    stages: dict[str, int] = {"0_llm_raw": len(raw.action_items)}
    plan, _ = first_plan_adapter.drop_waiting_steps(raw)
    stages["1_waiting_dropped"] = len(plan.action_items)

    heaviest = next((g for g in outcome.core_goals if g.is_heaviest), outcome.core_goals[0])
    if window and (heaviest.frequency_per_week or 0) > 0:
        plan, _ = first_plan_adapter.drop_out_of_cycle_branches(plan, window)
    stages["2_out_of_cycle_dropped"] = len(plan.action_items)

    plan = first_plan_adapter.shape_action_plan(outcome, "standard", plan, target_date=today)
    stages["3_shaped"] = len(plan.action_items)
    plan = first_plan_adapter.extend_action_plan_to_horizon(
        outcome, "standard", plan, target_date=today
    )
    stages["4_extended"] = len(plan.action_items)
    return stages


async def run_case(
    case: dict[str, Any], repeat: int, *, today: date, dry_run: bool
) -> dict[str, Any]:
    from reaction_backend.config import get_settings
    from reaction_backend.llm import aiClient

    outcome = build_outcome(case, today=today)
    window = cycle_window(case, outcome, today)
    ctx = first_plan_adapter.context_from_outcome(outcome, target_date=today)
    prompt_vars: dict[str, str] = ctx["prompt_vars"]

    row: dict[str, Any] = {
        "case_id": case["case_id"],
        "block": case["block"],
        "repeat": repeat,
        "cycle_milestones": len(window),
    }
    if dry_run:
        row["horizon_weeks"] = prompt_vars.get("horizon_weeks")
        row["session_length"] = prompt_vars.get("session_length")
        return row

    settings = get_settings()
    result = await aiClient.run(
        module="planning",
        schema=GoalDecomposition,
        prompt_id="planning/goal_decompose",
        fallback=lambda: GoalDecomposition(
            goal_nodes=[_FALLBACK_NODE], action_items=[], policy_violations=[]
        ),
        timeout=settings.llm_planning_timeout_seconds,
        thinking_budget=settings.llm_planning_thinking_budget,
        # ⚠️ **프롬프트 변수를 손으로 조립하지 않는다.** 처음엔 `milestones` 를 직접
        # 포맷하고 `out_of_cycle` 을 통째로 빠뜨려, 전 호출이 `no_prompt`(렌더 실패)로
        # 폴백했다 — 스모크에서 2/2 폴백으로 드러났다. 프로덕션(`decompose_goal`)이 쓰는
        # 함수를 그대로 부른다. 형식이 갈리면 LLM 이 다른 것을 읽고, 그러면 이 하네스는
        # 프로덕션이 아닌 무언가를 재게 된다.
        variables={
            **prompt_vars,
            "review_feedback": "",  # 1차 분해라 재분해 피드백이 없다
            "milestones": first_plan._format_milestones(window),
            "out_of_cycle": _out_of_cycle_note(case, window),
        },
        session=None,
        user_id=None,
    )
    row.update(
        fell_back=result.fell_back,
        reason=result.reason,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        latency_ms=result.latency_ms,
    )
    if not result.fell_back:
        row.update(score_raw(outcome, result.value, window, today))
        row["waterfall"] = waterfall(outcome, result.value, window, today)
    return row


def _pct(num: int, den: int) -> str:
    return "—" if den == 0 else f"{num / den:.3f} ({num}/{den})"


def summarize(rows: list[dict[str, Any]]) -> None:
    ok = [r for r in rows if not r.get("fell_back") and "raw_leaf_count" in r]
    fb = [r for r in rows if r.get("fell_back")]
    print(
        f"\n{'=' * 72}\nL1-7A 결과 — 실행 {len(rows)}건 / 집계 대상 {len(ok)}건 "
        f"/ 룰 폴백 {len(fb)}건 (집계 제외)"
    )
    if fb:
        print("  폴백 사유:", dict(Counter(r.get("reason") or "?" for r in fb)))
    if not ok:
        print("  집계할 것이 없다.")
        return

    leaves = sum(r["raw_leaf_count"] for r in ok)
    over = sum(r["m17_over_ceiling"] for r in ok)
    under = sum(r["m17_under_floor"] for r in ok)
    print(f"\n── M17 세션 길이 준수 (③층 보정 **전** 원안, leaf {leaves}개)")
    print(f"   밴드 안      : {_pct(leaves - over - under, leaves)}")
    print(f"   상한 초과    : {_pct(over, leaves)}   ← 사용자 집중용량을 넘긴 카드")
    print(f"   하한 미달    : {_pct(under, leaves)}   ← 9분 garbage 계열")

    ratios = [r["m18_ratio"] for r in ok if r.get("m18_ratio") is not None]
    if ratios:
        print(f"\n── M18 분량 예산 비율 (1.0 기준 양방향, n={len(ratios)})")
        print(
            f"   중앙값 {statistics.median(ratios):.2f} · 최소 {min(ratios):.2f} · "
            f"최대 {max(ratios):.2f}"
        )
        print(
            f"   초과(>1.0) {sum(1 for x in ratios if x > 1.0)}건 · "
            f"미달(<0.8) {sum(1 for x in ratios if x < 0.8)}건"
        )

    trunc = sum(r["m19_truncated"] for r in ok)
    wait = sum(r["m25_waiting"] for r in ok)
    print(f"\n── M19 절단율 : {_pct(trunc, leaves)}   ← ③층이 실제로 버린 leaf")
    print(f"── M25 대기단계: {_pct(wait, leaves)}   ← 프롬프트 규칙이 놓쳐 백스톱이 잡은 양")

    ms = [r for r in ok if "m23_window" in r]
    if ms:
        win = sum(r["m23_window"] for r in ms)
        miss = sum(r["m23_missing"] for r in ms)
        br = sum(r["m24_branches"] for r in ms)
        ooc = sum(r["m24_out_of_cycle"] for r in ms)
        print(f"\n── M23 마일스톤 충실도 ({len(ms)}건에서만 정의)")
        print(f"   누락 {_pct(miss, win)}   ← 이번 주기 마일스톤 중 branch 가 안 된 것")
        print(f"── M24 범위 이탈 : {_pct(ooc, br)}   ← 원안 branch 중 구간 밖")
    else:
        print("\n── M23·M24 : 마일스톤을 가진 케이스가 실행에 없었다 — 미측정")

    wfs = [r["waterfall"] for r in ok if "waterfall" in r]
    if wfs:
        print(f"\n── F21 룰 개입량 폭포 (평균 leaf 수, n={len(wfs)})")
        for stage in (
            "0_llm_raw",
            "1_waiting_dropped",
            "2_out_of_cycle_dropped",
            "3_shaped",
            "4_extended",
        ):
            vals = [w[stage] for w in wfs]
            print(f"   {stage:26} {statistics.mean(vals):6.2f}")
        raw0 = statistics.mean([w["0_llm_raw"] for w in wfs])
        fin = statistics.mean([w["4_extended"] for w in wfs])
        print(f"   → LLM 원안 {raw0:.2f} → 최종 {fin:.2f}  (룰이 만든 몫 {fin - raw0:+.2f})")

    lat = [r["latency_ms"] for r in ok if r.get("latency_ms")]
    if lat:
        s = sorted(lat)
        print(
            f"\n── 시스템 : 지연 중앙 {statistics.median(s):.0f}ms · "
            f"p95 {s[int(len(s) * 0.95) - 1]:.0f}ms · "
            f"토큰 in {sum(r.get('tokens_in') or 0 for r in ok)} / "
            f"out {sum(r.get('tokens_out') or 0 for r in ok)}"
        )

    print(
        f"\n⚠️ M20·M21·M22 는 스케줄러가 필요해 안 쟀다. M26 은 임계값이 사전등록에 "
        f"없어 내지 않는다 — 원자료만 낸다.\n{'=' * 72}"
    )


async def main_async(args: argparse.Namespace) -> None:
    today = date.today()
    cases = load_cases(limit=args.limit, blocks=args.blocks)
    print(
        f"케이스 {len(cases)}건 × 반복 {args.repeats}회 = 호출 {len(cases) * args.repeats}건"
        f"{' (dry-run)' if args.dry_run else ''}"
    )

    rows: list[dict[str, Any]] = []
    for repeat in range(args.repeats):
        for case in cases:
            row = await run_case(case, repeat, today=today, dry_run=args.dry_run)
            rows.append(row)
            flag = "!" if row.get("fell_back") else "."
            print(flag, end="", flush=True)
    print()

    if not args.dry_run:
        RESULTS_PATH.write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8"
        )
        print(f"원자료: {RESULTS_PATH.relative_to(_ROOT)} ({len(rows)}행)")
    summarize(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="L1-7A 첫 계획 준수도 실행 (실 LLM 호출)")
    parser.add_argument("--limit", type=int, default=None, help="앞 N건만 (스모크)")
    parser.add_argument("--repeats", type=int, default=1, help="케이스당 반복 횟수")
    parser.add_argument("--dry-run", action="store_true", help="LLM 호출 없이 구성만 확인")
    parser.add_argument(
        "--blocks",
        nargs="*",
        default=None,
        help="블록 필터 (normal / constraint_edge / milestone_fixed / busy_saturated)",
    )
    asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    main()
