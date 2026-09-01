"""심은 결함이 검토기에게 **의미 판단 없는 지름길**을 주는지 검사한다 (L1-7B).

`tests/test_golden_first_plan_cases.py` 의 두 지름길 테스트와 **같은 판정**을 pytest 없이
돌린다. 결함을 쓰는 사람이 자기 산출물을 직접 검사할 수 있어야 하기 때문이다 —
루브릭 작성자가 눈으로 걸러 주면 그 과정이 감춘 기준을 산출물로 흘려보낸다(rejection
sampling). 판정은 사람이 아니라 이 스크립트가 한다.

실행:
    uv run python scripts/check_seeded_defect_shortcuts.py
    uv run python scripts/check_seeded_defect_shortcuts.py --verbose   # 통과한 것도 표시

종료 코드 0 이면 통과. 결함 파일(`eval/first_plan_seeded_defects.json`)을 고칠 때마다
`build_golden_first_plan_cases.py` 로 골든셋을 다시 만든 뒤 이걸 돌린다.

## 무엇을 보는가

두 층으로 나눈다. 이유는 `tests/test_golden_first_plan_cases.py` §6 주석 참조.

1. **정확히 맞출 수 있는 값** — 카테고리·분량·앵커 위치·숫자/영문 포함 여부·항목 수.
   한 결함 유형 안에서 easy 와 boundary 가 **같아야** 한다.
2. **연속형 값** — 제목/`first_step` 길이, 토큰 수, 목표 제목과의 토큰 겹침.
   한 결함 유형 안에서 easy 범위와 boundary 범위가 **겹쳐야** 한다.

⚠️ 표본이 유형당 2 대 2 라 이 검사는 "우연이 아님" 을 증명하지 못한다. 지키는 것은 더
약한 것이다 — M27 을 유형별로 보고하면서 "검토기가 의미를 판단했다" 고 **말할 수 없게
되는 순간** 빨강이 된다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Windows 기본 콘솔은 cp949 라 `—`(em dash) 같은 글자에서 print 가 UnicodeEncodeError 로
# 죽는다. 하필 **통과 경로의 메시지**에만 그 글자가 있어서, 검사는 성공했는데 프로세스는
# 예외로 끝나고 종료 코드가 0 으로 남는 상태였다(2026-09-02 결함 작성자가 실측 보고).
# CI 가 이걸 성공으로 읽을 수 있으므로 출력 스트림을 UTF-8 로 강제한다.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

_ROOT = Path(__file__).resolve().parent.parent
CASES_PATH = _ROOT / "eval" / "golden_first_plan_cases.jsonl"


def _injected_text(case: dict) -> tuple[str, str]:
    """이 케이스가 심은 제목과 first_step. 연산마다 어디에 들어있는지가 다르다."""
    op = case["seeded"]["operation"]
    kind = op["op"]
    if kind == "replace_title":
        return op["value"], ""
    if kind == "replace_first_step":
        return "", op["value"]
    if kind == "insert_item":
        return op["title"], op["first_step"]
    return "", ""  # swap_order 는 문구를 안 바꾼다


def exact_features(case: dict) -> dict[str, object]:
    op = case["seeded"]["operation"]
    title, first_step = _injected_text(case)
    return {
        "category": op.get("category"),
        "estimated_minutes": op.get("estimated_minutes"),
        "after_anchor": op.get("after"),
        "title_has_digit": any(c.isdigit() for c in title),
        "first_step_has_digit": any(c.isdigit() for c in first_step),
        "title_has_latin": any("a" <= c.lower() <= "z" for c in title),
        "item_count": len(case["plan"]["action_items"]),
    }


def range_features(case: dict, goal_title: str) -> dict[str, int]:
    title, first_step = _injected_text(case)
    return {
        "title_len": len(title),
        "first_step_len": len(first_step),
        "title_tokens": len(title.split()),
        "goal_token_overlap": len(set(title.split()) & set(goal_title.split())),
    }


def find_offenders(cases: list[dict]) -> tuple[list[str], list[str]]:
    seeded = [c for c in cases if c.get("block") == "seeded_defect"]
    goal_by_case = {c["case_id"]: c["interview"]["goal"]["title"] for c in cases}

    exact: dict[tuple[str, str], dict[str, dict[str, object]]] = {}
    ranges: dict[tuple[str, str], dict[str, list[int]]] = {}
    for case in seeded:
        defect = case["seeded"]["defect"]
        level = case["seeded"]["level"]
        exact.setdefault((defect, case["seeded"]["base_plan"]), {})[level] = exact_features(case)
        for feature, value in range_features(case, goal_by_case[case["case_id"]]).items():
            ranges.setdefault((defect, feature), {}).setdefault(level, []).append(value)

    exact_bad = [
        f"{defect}/{base}: {feature} = {pair['easy'][feature]!r}(easy) vs "
        f"{pair['boundary'][feature]!r}(boundary)"
        for (defect, base), pair in sorted(exact.items())
        if not {"easy", "boundary"} - set(pair)
        for feature in pair["easy"]
        if pair["easy"][feature] != pair["boundary"][feature]
    ]

    range_bad: list[str] = []
    for (defect, feature), levels in sorted(ranges.items()):
        easy, boundary = levels.get("easy", []), levels.get("boundary", [])
        if not easy or not boundary:
            continue
        if max(easy) < min(boundary) or max(boundary) < min(easy):
            range_bad.append(
                f"{defect}: {feature} easy={sorted(easy)} boundary={sorted(boundary)} "
                "— 범위가 안 겹쳐 임계값 하나로 갈린다"
            )
    return exact_bad, range_bad


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verbose", action="store_true", help="통과한 항목도 표시")
    args = parser.parse_args()

    if not CASES_PATH.exists():
        print(f"[X] {CASES_PATH} 이 없다 — build_golden_first_plan_cases.py 를 먼저 돌릴 것")
        return 2

    cases = [
        json.loads(line)
        for line in CASES_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    exact_bad, range_bad = find_offenders(cases)

    if exact_bad:
        print(
            "[X] 정확히 맞출 수 있는 값이 easy/boundary 를 가른다 "
            "(검토기가 내용을 안 읽고 그 유형의 M27 을 얻는다):"
        )
        for line in exact_bad:
            print(f"    {line}")
    elif args.verbose:
        print("[O] 정확 필드: 모든 유형에서 easy == boundary")

    if range_bad:
        print("[X] 길이 계열 신호가 유형을 통째로 가른다:")
        for line in range_bad:
            print(f"    {line}")
    elif args.verbose:
        print("[O] 길이 계열: 모든 유형에서 범위가 겹친다")

    if exact_bad or range_bad:
        print(
            f"\n총 {len(exact_bad) + len(range_bad)} 건. 결함 파일을 고치고 "
            "골든셋을 다시 만든 뒤 이 검사를 다시 돌릴 것."
        )
        return 1

    print("[O] 지름길 없음 — easy/boundary 를 가르는 기계적 신호를 찾지 못했다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
