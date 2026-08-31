"""첫 계획 골든셋(L1-7) 무결성 — 회복·자료 골든셋과 같은 규약.

고정하는 것:

1. **커밋된 파일 == 생성기 출력.** 생성기를 고치고 파일을 안 다시 만들면 여기서 깨진다.
2. **블록별 건수**가 생성기 docstring 의 표와 일치한다.
3. **`defect_free_control` 이 루브릭 §3 의 회귀 4종을 실제로 갖는다** — 태그만 붙은 게
   아니라 저장된 계획이 그 속성을 실제로 만족하는지 계획을 열어 확인한다.
4. **심은 결함이 기준 계획을 실제로 바꿨다**(뮤테이션 가드). 이게 없으면 op 이 no-op 이어도
   `seeded_defect` 20건이 전부 초록이라, 검토기 recall 이 0 인 것과 결함이 없는 것을
   구별하지 못한다.
5. **결함이 ③층 불변식을 깨지 않는다.** 주입이 세션 길이 상한을 넘겨버리면 검토기가
   *구조적으로 발화 불가여야 할* 이유로 반려할 수 있고, 그러면 M27 이 오염된다
   (`test_first_plan_verifier_invariants.py` 가 고정한 §1.1 을 여기서 이어받는다).
6. **held-out 출처가 기록돼 있다.** 결함을 누가/무엇을 보고 썼는지가 파일에 남지 않으면
   L1-7B 의 순환성 완화 주장이 검증 불가능한 말이 된다.
"""

from __future__ import annotations

import json
import re

import pytest
from scripts import build_golden_first_plan_cases as builder

from reaction_backend.orchestrator import first_plan_adapter

# 룰이 붙인 채움 세션은 **제목이 아니라 `node_id` 접두사**로 판정한다.
# 사용자 작업 제목에도 "3회차" 가 실제로 들어 있어(`control-cert-standard` 의 기출 카드)
# 제목 정규식으로 거르면 진짜 사용자 작업이 같이 날아간다 — `eval/README.md` 의 경고.
_FILLER_NODE_PREFIX = "tmp-continue-"


@pytest.fixture(scope="module")
def cases() -> list[dict]:
    return builder.build_cases()


@pytest.fixture(scope="module")
def on_disk() -> list[dict]:
    text = builder.OUTPUT_PATH.read_text(encoding="utf-8")
    return [json.loads(line) for line in text.splitlines() if line.strip()]


# ── 1. 재현성 ─────────────────────────────────────────────────────────────


def test_file_on_disk_matches_the_generator(cases: list[dict]) -> None:
    """커밋된 골든셋이 생성기 출력과 **바이트 단위로** 같다."""
    assert builder.OUTPUT_PATH.exists(), (
        f"{builder.OUTPUT_PATH.name} 이 없다 — "
        "uv run python -m scripts.build_golden_first_plan_cases 를 돌리고 커밋할 것"
    )
    assert builder.OUTPUT_PATH.read_text(encoding="utf-8") == builder.to_jsonl(cases), (
        "커밋된 파일과 생성기 출력이 다르다 — 생성기를 고쳤으면 파일도 다시 만들어 커밋할 것"
    )


def test_generator_is_deterministic(cases: list[dict]) -> None:
    """두 번 돌려 같은 결과가 나온다 — 난수·현재시각이 새어 들어오면 깨진다."""
    assert builder.to_jsonl(builder.build_cases()) == builder.to_jsonl(cases)


# ── 2. 구성 ───────────────────────────────────────────────────────────────


def test_block_counts_match_the_spec(on_disk: list[dict]) -> None:
    counts: dict[str, int] = {}
    for case in on_disk:
        counts[case["block"]] = counts.get(case["block"], 0) + 1
    assert counts == builder.EXPECTED_COUNTS
    assert len(on_disk) == builder.EXPECTED_TOTAL


def test_case_ids_are_unique(on_disk: list[dict]) -> None:
    ids = [c["case_id"] for c in on_disk]
    assert len(ids) == len(set(ids)), "case_id 중복 — 하네스 결과가 덮어써진다"


def test_every_case_is_marked_synthetic(on_disk: list[dict]) -> None:
    """보고서에서 합성 비율을 숨길 수 없게 한다 (`eval/README.md` 규약)."""
    assert all(c["synthetic"] is True for c in on_disk)


def test_no_absolute_dates_leak_into_cases(on_disk: list[dict]) -> None:
    """마감은 `deadline_offset_days` 상대값뿐이다.

    절대 날짜를 넣으면 하루만 지나도 '마감 임박'이 '마감 지남'이 되어 판정이 뒤집힌다
    (`s10_corners.py` 전례, `eval/README.md`).
    """
    blob = json.dumps(on_disk, ensure_ascii=False)
    leaked = re.findall(r"\d{4}-\d{2}-\d{2}", blob)
    assert leaked == [], f"절대 날짜가 케이스에 들어갔다: {sorted(set(leaked))[:5]}"


def test_decompose_cases_carry_slots_and_no_plan(on_disk: list[dict]) -> None:
    for case in on_disk:
        if case["kind"] != "decompose":
            continue
        assert "plan" not in case, f"{case['case_id']}: 분해 케이스가 계획을 들고 있다"
        assert case["interview"]["goal"]["title"]


def test_verify_cases_carry_a_plan(on_disk: list[dict]) -> None:
    for case in on_disk:
        if case["kind"] != "verify":
            continue
        plan = case["plan"]
        assert plan["action_items"], f"{case['case_id']}: 빈 계획"
        node_ids = {n["node_id"] for n in plan["goal_nodes"]}
        for item in plan["action_items"]:
            assert item["node_id"] in node_ids, (
                f"{case['case_id']}: action_item 이 없는 노드를 가리킨다 ({item['node_id']})"
            )


# ── 3. 경계값 격자 ────────────────────────────────────────────────────────


def test_constraint_edge_is_a_real_grid_around_the_capacity(on_disk: list[dict]) -> None:
    """`constraint_edge` 가 계획서가 요구한 ±5분 격자를 실제로 이룬다.

    격자점 하나하나가 반려율 곡선의 x 축이므로, 앵커별로 -5/0/+5 가 다 있어야
    "경계에서 급등하는가"를 물을 수 있다.
    """
    grid: dict[int, set[int]] = {}
    for case in on_disk:
        if case["block"] != "constraint_edge":
            continue
        edge = case["edge"]
        grid.setdefault(edge["anchor_min"], set()).add(edge["offset_min"])

    assert set(grid) == set(builder._EDGE_ANCHORS)
    for anchor, offsets in grid.items():
        assert offsets == set(builder._EDGE_OFFSETS), f"앵커 {anchor} 의 격자가 불완전하다"


def test_edge_offset_zero_actually_lands_on_the_capacity(on_disk: list[dict]) -> None:
    """offset=0 케이스의 집중 용량이 앵커와 같다.

    ⚠️ 15분 앵커의 -5(=10분)만 예외다 — `session_min_for` 의 하한이 15라 10 은 15로
    끌어올려진다. 그 경로 자체가 격자에 있어야 하는 이유이므로 예외로 통과시키되,
    **격자점이 실제로는 같은 용량**이라는 사실을 여기 못박는다.
    """
    for case in on_disk:
        if case["block"] != "constraint_edge":
            continue
        edge, goal = case["edge"], case["interview"]["goal"]
        slots = builder._EDGE_BASE._replace(session_length_min=goal["session_length_min"])
        capacity = first_plan_adapter.session_min_for(builder._outcome(slots))

        if edge["offset_min"] == 0:
            assert capacity == edge["anchor_min"]
        elif goal["session_length_min"] < 15:
            assert capacity == 15, "하한이 15가 아니게 됐다 — 격자 해석이 바뀐다"
        else:
            assert capacity == goal["session_length_min"]


# ── 4. 무결함 대조군 — 태그가 아니라 계획을 확인한다 ──────────────────────


def _control(on_disk: list[dict]) -> list[dict]:
    return [c for c in on_disk if c["block"] == "defect_free_control"]


def test_control_block_covers_every_required_regression_property(on_disk: list[dict]) -> None:
    """루브릭 §3 이 요구한 회귀 4종이 대조군에 **전부** 있다."""
    present: set[str] = set()
    for case in _control(on_disk):
        present.update(case["control_properties"])
    missing = set(builder.REQUIRED_CONTROL_PROPERTIES) - present
    assert not missing, f"대조군이 못 덮는 회귀 속성: {sorted(missing)}"


def test_control_properties_are_true_of_the_stored_plan(on_disk: list[dict]) -> None:
    """태그만 붙이고 계획은 그렇지 않은 상태를 막는다.

    이게 없으면 `control_properties` 는 주석일 뿐이라, 대조군이 조용히 성질을 잃어도
    위 테스트가 초록이다 — 그러면 M29 의 분모가 '오탐이 나올 수 있는 계획'이 아니게 된다.
    """
    plans = builder.base_plans()
    for case in _control(on_disk):
        slots, _ = plans[case["case_id"]]
        outcome = builder._outcome(slots)
        minutes = [a["estimated_minutes"] for a in case["plan"]["action_items"]]
        filler = [
            a for a in case["plan"]["action_items"] if a["node_id"].startswith(_FILLER_NODE_PREFIX)
        ]
        props = set(case["control_properties"])
        cid = case["case_id"]

        if "session_equals_capacity" in props:
            capacity = first_plan_adapter.session_min_for(outcome)
            assert max(minutes) == capacity, (
                f"{cid}: 사용자 상한과 정확히 같은 세션이 없다 — 120분 사고를 재현할 수 없다"
            )
        if "sub_15_is_normal" in props:
            assert first_plan_adapter.planned_session_min_for(outcome) < 15, (
                f"{cid}: 이 조합의 평균 세션 길이가 15분 이상이 됐다 — 픽스처가 낡았다"
            )
            assert min(minutes) < 15, f"{cid}: 15분 미만 카드가 사라졌다"
        if "has_repeat_sessions" in props:
            assert filler, f"{cid}: 룰이 붙인 `N회차` 세션이 없다 — D1 오탐 회귀를 못 잡는다"
        if "mixed_lengths" in props:
            assert len(set(minutes)) > 1, f"{cid}: 길이가 전부 같다 — 정상 편차 회귀가 아니다"


def test_control_cases_expect_approval(on_disk: list[dict]) -> None:
    """대조군의 정답은 전부 승인이다 — 여기서 나온 반려가 곧 M29 의 분자다."""
    assert all(c["expected"]["approved"] is True for c in _control(on_disk))


# ── 5. 심은 결함 ──────────────────────────────────────────────────────────


def _seeded(on_disk: list[dict]) -> list[dict]:
    return [c for c in on_disk if c["block"] == "seeded_defect"]


def test_every_defect_code_and_level_is_covered(on_disk: list[dict]) -> None:
    """D1~D5 × easy/boundary × 기준계획 2개 격자가 빈칸 없이 찬다.

    M27 은 **유형별로** 보고해야 하므로(루브릭 §5), 한 유형이 비면 그 칸은 영원히 미측정이다.
    """
    grid = {
        (c["seeded"]["defect"], c["seeded"]["level"], c["seeded"]["base_plan"])
        for c in _seeded(on_disk)
    }
    expected = {
        (code, level, base)
        for code in builder.DEFECT_CODES
        for level in builder.DEFECT_LEVELS
        for base in builder.SEED_BASE_KEYS
    }
    assert grid == expected, f"빈칸: {sorted(expected - grid)} / 잉여: {sorted(grid - expected)}"


def test_seeded_target_nodes_exist_in_the_plan(on_disk: list[dict]) -> None:
    """M28 localization 의 정답 좌표가 실제 계획 안의 노드여야 한다."""
    for case in _seeded(on_disk):
        node_ids = {n["node_id"] for n in case["plan"]["goal_nodes"]}
        for target in case["seeded"]["target_node_ids"]:
            assert target in node_ids, (
                f"{case['case_id']}: 존재하지 않는 노드를 정답으로 지목한다 ({target})"
            )


def test_seeded_defect_actually_changes_the_base_plan(on_disk: list[dict]) -> None:
    """뮤테이션 가드 — 주입이 no-op 이면 여기서 잡는다.

    ⚠️ 이 테스트가 없으면 op 이 아무것도 안 해도 20건이 전부 초록이고, 검토기 recall 이
    0 으로 나와도 "검토기가 못 잡는다"인지 "애초에 결함이 없다"인지 구별할 수 없다.
    """
    plans = builder.base_plans()
    for case in _seeded(on_disk):
        _, base = plans[case["seeded"]["base_plan"]]
        base_payload = builder._plan_payload(base)
        assert case["plan"] != base_payload, (
            f"{case['case_id']}: 주입이 기준 계획을 바꾸지 않았다 (no-op)"
        )


def test_seeded_defects_do_not_break_the_layer3_invariant(on_disk: list[dict]) -> None:
    """주입된 결함이 세션 길이 상한을 넘지 않는다.

    넘기면 검토기가 **구조적으로 발화 불가여야 할** 항목(루브릭 §1.1)으로 반려할 수 있고,
    그 반려가 D1~D5 탐지로 잘못 집계된다. 결함 유형을 하나만 심는다는 계약이 깨지는 것.
    """
    plans = builder.base_plans()
    for case in _seeded(on_disk):
        slots, _ = plans[case["seeded"]["base_plan"]]
        capacity = first_plan_adapter.session_min_for(builder._outcome(slots))
        over = [
            a["title"] for a in case["plan"]["action_items"] if a["estimated_minutes"] > capacity
        ]
        assert not over, f"{case['case_id']}: 주입이 상한({capacity}분)을 넘겼다 — {over}"


def test_sibling_order_index_is_unique_within_each_parent(on_disk: list[dict]) -> None:
    """같은 부모 아래 `order_index` 는 유일하다 — **③층이 만들 수 있는 트리인가**.

    `shape_action_plan` 계열은 형제 인덱스를 enumerate 로 매기므로 프로덕션 트리에는
    중복이 없다. 골든셋의 `verify` 계획은 "검토기가 운영에서 실제로 보는 것" 이라야
    의미가 있으므로, 결함 주입이 프로덕션이 못 만드는 형태를 만들면 그 케이스의 판정은
    무엇을 잰 것인지 알 수 없게 된다.

    ⚠️ 이 불변식은 2026-09-01 감사에서 **실제로 깨져 있었다** — `insert_item` 이 뒤 형제를
    안 밀어 4건에서 중복이 났고, 삽입 지점이 branch 끝인 케이스는 우연히 피해가서 데이터에
    따라 나타났다 사라졌다 했다. 세션 길이 불변식만 보던 테스트로는 안 잡혔다.
    """
    for case in on_disk:
        if case["kind"] != "verify":
            continue
        by_parent: dict[str, list[tuple[str, int]]] = {}
        for node in case["plan"]["goal_nodes"]:
            parent = node["parent_id"]
            if parent is None:
                continue
            by_parent.setdefault(parent, []).append((node["node_id"], node["order_index"]))
        for parent, kids in by_parent.items():
            indexes = [i for _, i in kids]
            assert len(indexes) == len(set(indexes)), (
                f"{case['case_id']}: 부모 {parent} 아래 order_index 가 중복된다 ({sorted(kids)}) "
                "— ③층이 만들 수 없는 트리다"
            )


def test_boundary_cases_are_expected_to_pass(on_disk: list[dict]) -> None:
    """`boundary` 는 '덜 심한 결함'이 아니라 **결함처럼 보이는 정상**이다.

    정답이 통과이므로, 여기서 나온 반려는 M29 와 같은 성격의 오탐이다. easy 만으로는
    120분 사고 같은 '정당한 값에 대한 반려'를 재현할 수 없어 이 수준을 따로 둔다.
    """
    for case in _seeded(on_disk):
        expected_approved = case["seeded"]["level"] == "boundary"
        assert case["expected"]["approved"] is expected_approved


# ── 6. held-out 출처 ──────────────────────────────────────────────────────


def test_seeded_defects_record_held_out_provenance() -> None:
    """결함을 누가·무엇을 보고 썼는지가 파일에 남는다.

    계획서 L1-7B 의 순환성 완화(held-out fault design)는 **기록이 없으면 검증 불가능한
    주장**이다. 보고서에 "다른 주체가 설계했다"고 쓰려면 그 조건이 레포에 있어야 한다.
    """
    seeded = builder.load_seeded_defects()
    prov = seeded["provenance"]
    for field in ("author_model", "authored_at", "shown", "withheld", "verified_by"):
        assert prov.get(field), f"provenance.{field} 가 비어 있다"

    assert prov["author_model"] != prov["rubric_author_model"], (
        "결함 작성자와 루브릭 작성자가 같은 모델이다 — held-out 이 아니다"
    )
    withheld = " ".join(prov["withheld"])
    assert "rubric-first-plan-v1.md" in withheld, (
        "루브릭 앵커를 가렸다는 기록이 없다 — 가리지 않았다면 held-out 이 성립하지 않는다"
    )


def test_seeded_defect_entries_are_well_formed() -> None:
    seeded = builder.load_seeded_defects()
    ids = [d["defect_id"] for d in seeded["defects"]]
    assert len(ids) == len(set(ids)) == builder.EXPECTED_COUNTS["seeded_defect"]
    for entry in seeded["defects"]:
        assert entry["defect"] in builder.DEFECT_CODES
        assert entry["level"] in builder.DEFECT_LEVELS
        assert entry["base_plan"] in builder.SEED_BASE_KEYS
        assert entry["rationale"].strip(), f"{entry['defect_id']}: 근거가 비었다"
        assert entry["operation"]["op"] in {
            "replace_title",
            "replace_first_step",
            "swap_order",
            "insert_item",
        }
